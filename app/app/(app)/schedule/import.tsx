import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from '../../../lib/i18n';
import { usePermissions } from '../../../lib/permissions';
import {
  extractErrorMessage,
  ImportResult,
  scheduleImportApi,
} from '../../../lib/api';
import {
  ParsedWorkbook,
  collectUnclassified,
  isClientParsingSupported,
  parseMwbFile,
  toApplyPayload,
} from '../../../lib/mwb-parser';
import { parseWtFile, wtToWorkbook } from '../../../lib/wt-parser';
import { addDays, formatDateISO, parseISODate, startOfWeekMonday } from '../../../lib/dates';
import { formatWeekRange } from '../../../lib/week-range';
import {
  FilePlan,
  FileWeek,
  NextStep,
  ProgrammeFiles,
  SideStatus,
  filesToLoad,
  fileMeeting,
  leftover,
  nextStep,
  peopleOf,
  planFiles,
  sideStatus,
  windowOf,
} from '../../../lib/programme-files';
import { DropZone } from '../../../components/DropZone';
import { useTranslation } from 'react-i18next';
import { failsScreen } from '../../../lib/screen-failure';
import { refreshProgramme } from '../../../lib/programme-refresh';

/** One picked file, from reading it to loading it. */
interface Entry {
  key: string;
  name: string;
  state: 'reading' | 'ready' | 'unreadable' | 'loading' | 'loaded' | 'failed';
  wb?: ParsedWorkbook;
  error?: string;
  result?: ImportResult;
}

const SUMMARY_KEY = ['programme-files'] as const;
/** The table is a table from here on; narrower, each week is two lines. */
const TABLE_FROM = 760;

/** «27 декабря» — the Sunday a week ends on. */
const weekEnd = (monday: string) =>
  addDays(parseISODate(monday), 6).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
  });
/** «28 декабря» — the Monday a week starts on. */
const dayMonth = (monday: string) =>
  parseISODate(monday).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
  });
const weekLabel = (monday: string) =>
  formatWeekRange(parseISODate(monday), i18n.language);

/**
 * «Файлы программы» (20 November 2026). It was «Импорт программы»: one file
 * at a time, and what was already loaded was six month chips. Lionel asked
 * for a screen that says which files are in, and so which weeks are ready
 * and which are not. Uploading needs a browser on a computer (the file is
 * read here and never sent); on a phone the screen only shows the weeks.
 */
export default function ProgrammeFilesScreen() {
  const { t } = useTranslation();
  /**
   * The screen guards itself: a screen whose only protection is that nobody
   * links to it is not protected. The server refuses the work either way.
   */
  const { canImportMidweekSchedule, canImportWeekendSchedule } =
    usePermissions();
  const mayImport = canImportMidweekSchedule || canImportWeekendSchedule;
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const wide = width >= TABLE_FROM;
  const canRead = isClientParsingSupported();

  const [entries, setEntries] = useState<Entry[]>([]);
  /** The list as it stands now — two quick drops must not add a file twice. */
  const entriesRef = useRef<Entry[]>([]);
  entriesRef.current = entries;
  const [pickError, setPickError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const summaryQuery = useQuery({
    throwOnError: failsScreen,
    queryKey: SUMMARY_KEY,
    queryFn: () => scheduleImportApi.weeks(),
    enabled: mayImport,
  });
  const summary = summaryQuery.data;

  /**
   * Each file's own weeks, asked for separately: a file for March must not
   * be judged against a window that ends in February.
   */
  // A file whose loading failed claims no weeks: a copy of it further down
  // must not stay «skipped» because of it (review, 20 November 2026).
  const readyEntries = entries.filter((e) => e.wb && e.state !== 'failed');
  const windows = readyEntries.map((e) =>
    windowOf(e.wb!.weeks.map((w) => w.weekStartDate)),
  );
  const fileWeeks = useQueries({
    queries: windows.map((w) => ({
      queryKey: [...SUMMARY_KEY, w?.from ?? '', w?.count ?? 0],
      queryFn: () =>
        w ? scheduleImportApi.weeks({ from: w.from, count: w.count }) : null,
      enabled: !!w,
      staleTime: 30_000,
    })),
  });
  const knownWeeks: FileWeek[] = [
    ...(summary?.weeks ?? []),
    ...fileWeeks.flatMap((q) => (q.data as ProgrammeFiles | null)?.weeks ?? []),
  ];
  const plansReady = fileWeeks.every((q) => !q.isLoading);
  /**
   * The weeks could not be asked: every week would look new. The files are
   * then said to be unchecked, not «new» — loading them is still safe, the
   * import keeps what people did.
   */
  const unchecked = summaryQuery.isError || fileWeeks.some((q) => q.isError);
  const plans: FilePlan[] = planFiles(
    readyEntries.map((e) => ({
      name: e.name,
      weekStarts: e.wb!.weeks.map((w) => w.weekStartDate),
      partKeys: e.wb!.weeks.flatMap((w) => w.parts.map((p) => p.partKey)),
    })),
    knownWeeks,
  );
  const planOf = new Map(readyEntries.map((e, i) => [e.key, plans[i]]));
  const toLoad = (
    unchecked
      ? readyEntries.filter((e) => (e.wb?.weeks.length ?? 0) > 0)
      : filesToLoad(plans).map((i) => readyEntries[i])
  ).filter((e) => e.state === 'ready');

  const update = (key: string, patch: Partial<Entry>) =>
    setEntries((all) => all.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  /** Reads the files here, in the browser — the publication never leaves it. */
  const addFiles = async (files: { blob: Blob; name: string }[]) => {
    setPickError(null);
    // Still in the list (not loaded, not failed): the same file again is
    // said, not dropped in silence; twice in one batch counts once.
    const listed = new Set(
      entriesRef.current
        .filter((e) => e.state === 'reading' || e.state === 'ready' || e.state === 'loading')
        .map((e) => e.name),
    );
    const seen = new Set<string>();
    const already: string[] = [];
    const fresh = files.filter((f) => {
      if (listed.has(f.name) || seen.has(f.name)) {
        already.push(f.name);
        return false;
      }
      seen.add(f.name);
      return true;
    });
    const wrong = fresh.filter((f) => !f.name.toLowerCase().endsWith('.epub'));
    if (wrong.length > 0) setPickError(t('schedule.import.errors.notEpub'));
    else if (already.length > 0) {
      setPickError(t('schedule.files.alreadyListed', { names: [...new Set(already)].join(', ') }));
    }
    const epubs = fresh.filter((f) => f.name.toLowerCase().endsWith('.epub'));
    const added: Entry[] = epubs.map((f) => ({
      key: `${f.name}:${Date.now()}:${Math.random()}`,
      name: f.name,
      state: 'reading',
    }));
    const replaced = new Set(epubs.map((f) => f.name));
    setEntries((all) => [
      ...all.filter(
        (e) =>
          e.state !== 'loaded' &&
          !((e.state === 'failed' || e.state === 'unreadable') && replaced.has(e.name)),
      ),
      ...added,
    ]);
    entriesRef.current = [...entriesRef.current, ...added];
    await Promise.all(
      epubs.map(async (f, i) => {
        const key = added[i].key;
        try {
          const lower = f.name.toLowerCase();
          const wb =
            lower.startsWith('w_') || lower.startsWith('wp_')
              ? wtToWorkbook(await parseWtFile(f.blob, undefined, f.name))
              : await parseMwbFile(f.blob, undefined, f.name);
          update(key, { state: 'ready', wb });
        } catch (e) {
          update(key, {
            state: 'unreadable',
            error: `${t('schedule.import.errors.parseFailed')}: ${extractErrorMessage(e)}`,
          });
        }
      }),
    );
  };

  const handlePick = async () => {
    setPickError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/epub+zip', '*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (picked.canceled) return;
      const files = (picked.assets ?? [])
        .map((a) => ({ blob: (a as any).file as Blob | undefined, name: a.name }))
        .filter((f): f is { blob: Blob; name: string } => !!f.blob);
      if (files.length === 0) {
        setPickError(t('schedule.import.errors.noFileSelected'));
        return;
      }
      await addFiles(files);
    } catch (e) {
      setPickError(extractErrorMessage(e));
    }
  };

  /** One after another: two files never write the same week at once. */
  const load = async (list: Entry[]) => {
    setLoading(true);
    try {
      for (const e of list) {
        update(e.key, { state: 'loading', error: undefined });
        try {
          const result = await scheduleImportApi.apply(toApplyPayload(e.wb!));
          update(e.key, { state: 'loaded', result });
        } catch (err) {
          update(e.key, { state: 'failed', error: extractErrorMessage(err) });
        }
      }
    } finally {
      setLoading(false);
      refreshProgramme(queryClient);
      queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
    }
  };

  if (!mayImport) {
    return (
      <View style={styles.noRights}>
        <Ionicons name="lock-closed-outline" size={28} color="#94a3b8" />
        <Text style={styles.noRightsText}>
          {t('schedule.import.noRights')}
        </Text>
      </View>
    );
  }

  // The congregation's own week, as the server counts «next missing».
  const thisWeek = summary?.thisWeek ?? formatDateISO(startOfWeekMonday(new Date()));
  const weeks = summary?.weeks ?? [];
  const past = weeks.filter((w) => w.weekStart < thisWeek);
  const shown = showPast ? weeks : weeks.filter((w) => w.weekStart >= thisWeek);
  const results = entries.filter((e) => e.result);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, wide && styles.contentWide]}
    >
      <Text style={styles.lead}>{t('schedule.files.lead')}</Text>
      <View style={styles.privacyRow}>
        <Ionicons name="shield-checkmark-outline" size={16} color="#059669" />
        <Text style={styles.privacyText}>{t('schedule.import.privacyNote')}</Text>
      </View>

      {summaryQuery.isLoading ? (
        <ActivityIndicator color="#0ea5e9" style={{ marginVertical: 24 }} />
      ) : summary ? (
        <SummaryCards summary={summary} wide={wide} />
      ) : summaryQuery.isError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {t('schedule.files.summaryFailed')}: {extractErrorMessage(summaryQuery.error)}
          </Text>
        </View>
      ) : null}

      {canRead ? (
        <View style={styles.card}>
          <DropZone
            onFiles={(files) =>
              void addFiles(files.map((f) => ({ blob: f, name: f.name })))
            }
            disabled={loading}
          >
            <View style={styles.dropInner}>
              <Ionicons name="cloud-upload-outline" size={26} color="#0ea5e9" />
              <Pressable
                style={({ pressed }) => [styles.pickButton, pressed && { opacity: 0.7 }]}
                onPress={handlePick}
                disabled={loading}
              >
                <Ionicons name="document-attach-outline" size={18} color="#0ea5e9" />
                <Text style={styles.pickButtonText}>{t('schedule.files.choose')}</Text>
              </Pressable>
              <Text style={styles.dropSub}>{t('schedule.files.dropSub')}</Text>
            </View>
          </DropZone>
          {pickError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{pickError}</Text>
            </View>
          ) : null}

          {entries.length > 0 ? (
            <View style={styles.fileList}>
              {entries.map((e) => (
                <FileRow
                  key={e.key}
                  entry={e}
                  plan={planOf.get(e.key)}
                  planReady={plansReady}
                  unchecked={unchecked}
                  busy={loading}
                  onRemove={() =>
                    setEntries((all) => all.filter((x) => x.key !== e.key))
                  }
                  onLoadAgain={() => void load([e])}
                />
              ))}
            </View>
          ) : null}

          {toLoad.length > 0 ? (
            <Pressable
              style={[styles.uploadButton, (loading || !plansReady) && { opacity: 0.6 }]}
              onPress={() => void load(toLoad)}
              disabled={loading || !plansReady}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
              )}
              <Text style={styles.uploadButtonText}>
                {loading
                  ? t('schedule.import.applying')
                  : t('schedule.files.loadNew', { count: toLoad.length })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.phoneNote}>
          <Ionicons name="desktop-outline" size={18} color="#0369a1" />
          <Text style={styles.phoneNoteText}>{t('schedule.files.onComputer')}</Text>
        </View>
      )}

      {results.map((e) => (
        <ResultSummary key={e.key} result={e.result!} fileName={e.name} />
      ))}

      {weeks.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.tableHead}>
            <Text style={styles.cardTitle}>{t('schedule.files.byWeek')}</Text>
            {past.length > 0 ? (
              <Pressable onPress={() => setShowPast((v) => !v)} hitSlop={8}>
                <Text style={styles.link}>
                  {showPast
                    ? t('schedule.files.hidePast')
                    : t('schedule.files.showPast', { count: past.length })}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {wide ? (
            <View style={[styles.row, styles.headRow]}>
              <Text style={[styles.th, styles.colWeek]}>{t('schedule.files.colWeek')}</Text>
              <Text style={[styles.th, styles.colSide]}>{t('schedule.files.colMidweek')}</Text>
              <Text style={[styles.th, styles.colSide]}>{t('schedule.files.colWeekend')}</Text>
              <Text style={[styles.th, styles.colPeople]}>{t('schedule.files.colPeople')}</Text>
            </View>
          ) : null}
          {shown.map((w) => (
            <WeekRow key={w.weekStart} week={w} thisWeek={thisWeek} wide={wide} />
          ))}
          <Text style={styles.footnote}>{t('schedule.files.footnote')}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

/**
 * On top: how far each meeting has its programme, and what to load next.
 * Wide — three cards; narrow — one card for both meetings and the next step.
 */
function SummaryCards({ summary, wide }: { summary: ProgrammeFiles; wide: boolean }) {
  const { t } = useTranslation();
  const until = summary.loadedUntil;
  const steps = {
    midweek: nextStep(until.midweek, summary.nextMissing.midweek),
    weekend: nextStep(until.weekend, summary.nextMissing.weekend),
  };
  const have = (m: 'midweek' | 'weekend') =>
    until[m]
      ? t('schedule.files.readyUntil', { date: weekEnd(until[m]!) })
      : t('schedule.files.nothingYet');
  const gapLine = (m: 'midweek' | 'weekend') => {
    const s = steps[m];
    return s.kind === 'gap'
      ? t('schedule.files.gap', { week: weekLabel(s.week) })
      : null;
  };
  const open = (['midweek', 'weekend'] as const)
    .map((m) => ({ m, s: steps[m] }))
    .filter((x): x is { m: 'midweek' | 'weekend'; s: Exclude<NextStep, { kind: 'done' }> } =>
      x.s.kind !== 'done',
    )
    .sort((a, b) => a.s.week.localeCompare(b.s.week));
  const first = open[0]?.s;
  const nextCard = (
    <View style={[styles.sumCard, wide && styles.sumCardWide, first ? styles.sumCardNext : styles.sumCardDone]}>
      <Text style={styles.sumLabel}>{t('schedule.files.next')}</Text>
      {first ? (
        <>
          <Text style={styles.sumValue}>
            {first.kind === 'gap'
              ? t('schedule.files.gapTitle', { week: weekLabel(first.week) })
              : t('schedule.files.missingFrom', { week: weekLabel(first.week) })}
          </Text>
          {open.map(({ m, s }) => (
            <Text key={m} style={styles.sumSub}>
              {m === 'midweek'
                ? t('schedule.files.needWorkbook', { week: weekLabel(s.week) })
                : t('schedule.files.needWatchtower', { week: weekLabel(s.week) })}
            </Text>
          ))}
        </>
      ) : (
        <Text style={styles.sumValue}>{t('schedule.files.allLoaded')}</Text>
      )}
    </View>
  );
  if (!wide) {
    return (
      <View style={styles.cards}>
        <View style={styles.sumCard}>
          {(['midweek', 'weekend'] as const).map((m) => (
            <View key={m}>
              <Text style={styles.sumLine}>
                {t('schedule.files.line', { label: t(`schedule.files.${m}`), value: have(m) })}
              </Text>
              {gapLine(m) ? <Text style={styles.sumGap}>{gapLine(m)}</Text> : null}
            </View>
          ))}
        </View>
        {nextCard}
      </View>
    );
  }
  return (
    <View style={[styles.cards, styles.cardsWide]}>
      {(['midweek', 'weekend'] as const).map((m) => (
        <View key={m} style={[styles.sumCard, styles.sumCardWide]}>
          <Text style={styles.sumLabel}>{t(`schedule.files.${m}`)}</Text>
          <Text style={styles.sumValue}>{have(m)}</Text>
          {gapLine(m) ? <Text style={styles.sumGap}>{gapLine(m)}</Text> : null}
        </View>
      ))}
      {nextCard}
    </View>
  );
}

const STATUS_COLOR: Record<SideStatus, string> = {
  fromFile: '#047857',
  present: '#0369a1',
  partial: '#b45309',
  missing: '#b45309',
  notHeld: '#64748b',
};

function SideCell({
  status,
  meeting,
  byHand,
  left = 0,
  parts = 0,
  coVisit,
  short,
}: {
  status: SideStatus;
  meeting: 'midweek' | 'weekend';
  byHand: number;
  left?: number;
  parts?: number;
  coVisit?: boolean;
  short?: boolean;
}) {
  const { t } = useTranslation();
  const icon =
    status === 'fromFile' || status === 'present'
      ? '✓'
      : status === 'missing' || status === 'partial'
        ? '—'
        : '·';
  // «partial» reads as «missing»: the file is not there; the parts that
  // are (an empty skeleton, a part added by hand) are a note beside it.
  const said = status === 'partial' ? 'missing' : status;
  const text = short
    ? t(`schedule.files.short.${meeting}.${said}`)
    : t(`schedule.files.status.${meeting}.${said}`);
  const notes = [
    byHand > 0 && !short ? t('schedule.files.byHand', { count: byHand }) : null,
    left > 0 && !short ? t('schedule.files.leftover', { count: left }) : null,
    status === 'partial' && !short && parts > 0
      ? t('schedule.files.partsWithout', { count: parts })
      : null,
    coVisit ? t('schedule.files.coVisit') : null,
  ].filter(Boolean);
  return (
    <Text style={[styles.cell, { color: STATUS_COLOR[status] }]}>
      {icon} {text}
      {notes.length > 0 ? <Text style={styles.cellNote}>{` · ${notes.join(' · ')}`}</Text> : null}
    </Text>
  );
}

function WeekRow({ week, thisWeek, wide }: { week: FileWeek; thisWeek: string; wide: boolean }) {
  const { t } = useTranslation();
  const people = peopleOf(week, thisWeek);
  const peopleText =
    people.kind === 'past'
      ? t('schedule.files.people.past')
      : people.kind === 'none'
        ? '—'
        : people.kind === 'all'
          ? t('schedule.files.people.all')
          : t('schedule.files.people.some', {
              assigned: people.assigned,
              total: people.total,
            });
  const mid = sideStatus(week.midweek);
  const end = sideStatus(week.weekend);
  const open = () => router.push(`/schedule/edit?week=${week.weekStart}` as never);
  if (wide) {
    return (
      <Pressable
        onPress={open}
        style={({ hovered, pressed }: any) => [styles.row, (hovered || pressed) && styles.rowHover]}
      >
        <Text style={[styles.weekCell, styles.colWeek]}>{weekLabel(week.weekStart)}</Text>
        <View style={styles.colSide}>
          <SideCell
            status={mid}
            meeting="midweek"
            byHand={week.midweek.byHand}
            left={leftover(week.midweek)}
            parts={week.midweek.parts}
            coVisit={week.coVisit}
          />
        </View>
        <View style={styles.colSide}>
          <SideCell
            status={end}
            meeting="weekend"
            byHand={week.weekend.byHand}
            left={leftover(week.weekend)}
            parts={week.weekend.parts}
          />
        </View>
        <Text style={[styles.peopleCell, styles.colPeople]}>{peopleText}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={open} style={styles.rowNarrow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.weekCell}>{weekLabel(week.weekStart)}</Text>
        <Text>
          <SideCell status={mid} meeting="midweek" byHand={0} short />
          <Text style={styles.cellNote}>{'  '}</Text>
          <SideCell status={end} meeting="weekend" byHand={0} coVisit={week.coVisit} short />
        </Text>
      </View>
      <Text style={styles.peopleCell}>{peopleText}</Text>
    </Pressable>
  );
}

/** One picked file and what it would add. */
function FileRow({
  entry,
  plan,
  planReady,
  unchecked,
  busy,
  onRemove,
  onLoadAgain,
}: {
  entry: Entry;
  plan?: FilePlan;
  planReady: boolean;
  unchecked: boolean;
  busy: boolean;
  onRemove: () => void;
  onLoadAgain: () => void;
}) {
  const { t } = useTranslation();
  const wb = entry.wb;
  const meeting =
    plan?.meeting ?? fileMeeting(entry.name, wb?.weeks.flatMap((w) => w.parts.map((p) => p.partKey)) ?? []);
  const unclassified = wb ? collectUnclassified(wb) : [];
  const range =
    plan && plan.weeks.length > 0
      ? `${dayMonth(plan.weeks[0])} – ${weekEnd(plan.weeks[plan.weeks.length - 1])}`
      : null;
  let verdict: string | null = null;
  let tone: 'ok' | 'repeat' | 'bad' = 'ok';
  if (entry.state === 'reading') verdict = t('schedule.import.parsing');
  else if (entry.state === 'unreadable' || entry.state === 'failed') {
    verdict = entry.error ?? null;
    tone = 'bad';
  } else if (entry.state === 'loading') verdict = t('schedule.import.applying');
  else if (entry.state === 'loaded') verdict = t('schedule.files.verdict.loaded');
  else if (wb && wb.weeks.length === 0) verdict = null;
  else if (unchecked) {
    verdict = t('schedule.files.verdict.unchecked');
    tone = 'repeat';
  } else if (plan && planReady) {
    tone = plan.verdict === 'new' || plan.verdict === 'partly' ? 'ok' : plan.verdict === 'nothing' ? 'bad' : 'repeat';
    verdict = t(`schedule.files.verdict.${plan.verdict}`, {
      count: plan.newWeeks.length,
      loaded: plan.loadedWeeks.length,
    });
  }
  return (
    <View style={styles.fileRow}>
      <View
        style={[
          styles.typeBadge,
          meeting === 'midweek'
            ? styles.typeBadgeMidweek
            : meeting === 'weekend'
              ? styles.typeBadgeWeekend
              : styles.typeBadgeUnknown,
        ]}
      >
        <Text style={styles.typeBadgeText}>
          {meeting === 'midweek'
            ? t('schedule.files.kind.workbook')
            : meeting === 'weekend'
              ? t('schedule.files.kind.watchtower')
              : t('schedule.import.typeBadge.unknown')}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.fileName} numberOfLines={1}>
          {entry.name}
        </Text>
        {range ? (
          <Text style={styles.fileMeta}>
            {t('schedule.files.weeksRange', { count: plan!.weeks.length, range })}
          </Text>
        ) : null}
        {verdict ? (
          <Text
            style={[
              styles.fileVerdict,
              tone === 'bad' ? styles.verdictBad : tone === 'repeat' ? styles.verdictRepeat : null,
            ]}
          >
            {verdict}
          </Text>
        ) : null}
        {wb && wb.weeks.length === 0 && entry.state === 'ready' ? (
          <Text style={[styles.fileVerdict, styles.verdictBad]}>
            {t('schedule.import.errors.noWeeks')}
          </Text>
        ) : null}
        {wb && wb.unreadWeeks.length > 0 && entry.state === 'ready' ? (
          <Text style={[styles.fileVerdict, styles.verdictRepeat]}>
            {t('schedule.import.preview.unreadWeeksTitle', { count: wb.unreadWeeks.length })}
            {': '}
            {wb.unreadWeeks.join('; ')}
            {'. '}
            {t('schedule.import.preview.unreadWeeksHint')}
          </Text>
        ) : null}
        {unclassified.length > 0 && entry.state === 'ready' ? (
          <Text style={[styles.fileVerdict, styles.verdictRepeat]}>
            {t('schedule.import.preview.unclassifiedTitle', { count: unclassified.length })}
          </Text>
        ) : null}
        {(entry.state === 'ready' && plan?.verdict === 'repeat' && !unchecked) ||
        entry.state === 'failed' ? (
          <Pressable onPress={onLoadAgain} disabled={busy} hitSlop={6}>
            <Text style={styles.link}>{t('schedule.files.loadAgain')}</Text>
          </Pressable>
        ) : null}
      </View>
      {entry.state !== 'loading' ? (
        <Pressable
          onPress={onRemove}
          disabled={busy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('schedule.files.remove')}
        >
          <Ionicons name="close" size={18} color="#94a3b8" />
        </Pressable>
      ) : null}
    </View>
  );
}

function ResultSummary({
  result,
  fileName,
}: {
  result: ImportResult;
  fileName: string;
}) {
  const { t } = useTranslation();
  /**
   * The first week of what was just loaded.
   *
   * Import gives the SKELETON — parts with titles and durations and nobody in
   * them: the server writes every row as a draft. So the useful next step is
   * not «done», it is «now go and put brothers in it», and the link saves
   * paging through the schedule to find the week that was just filled.
   */
  const firstWeek = result.weeks.find((w) => !w.notHeld && !w.frozen)?.weekStartDate;
  /**
   * What the server reports, said in the reader's language.
   *
   * It used to send finished English sentences and they were printed as they
   * came — «Week 2027-01-18: the congregation holds no midweek meeting…» on a
   * Russian screen (5 October). Now it sends the facts, and the sentence is
   * built here. Its own sentences are shown only when it sent no facts: a
   * server not updated yet.
   */
  const weekLabel = (iso: string) =>
    formatWeekRange(parseISODate(iso), i18n.language);
  const messages: string[] = result.notices
    ? result.notices.map((n) =>
        n.code === 'meeting_not_held'
          ? n.meeting === 'weekend'
            ? t('schedule.import.result.noWeekend', {
                week: weekLabel(n.weekStartDate),
                count: n.parts,
              })
            : t('schedule.import.result.noMidweek', {
                week: weekLabel(n.weekStartDate),
                count: n.parts,
              })
          : n.code === 'week_frozen'
            ? t('schedule.import.result.weekFrozenNotice', {
                week: weekLabel(n.weekStartDate),
                count: n.parts,
              })
            : n.code === 'kept_by_hand'
              ? t('schedule.import.result.keptByHand', {
                  week: weekLabel(n.weekStartDate),
                  count: n.parts,
                })
              : n.code === 'empty_parts_removed'
                ? t('schedule.import.result.emptyPartsRemoved', {
                    week: weekLabel(n.weekStartDate),
                    count: n.parts,
                  })
            : t('schedule.import.result.unclassifiedPart', {
              week: weekLabel(n.weekStartDate),
              title: n.title ?? '—',
            }),
      )
    : result.warnings;
  const someNotHeld = !!result.notices?.some(
    (n) => n.code === 'meeting_not_held',
  );
  return (
    <View style={styles.card}>
      <View style={styles.successHeader}>
        <Ionicons name="checkmark-circle" size={32} color="#059669" />
        <View style={{ flex: 1 }}>
          <Text style={styles.successTitle}>
            {t('schedule.import.result.complete')}
          </Text>
          <Text style={styles.fileMeta} numberOfLines={1}>
            {fileName}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat
          label={t('schedule.import.result.stats.weeks')}
          value={result.weeksImported}
          color="#0369a1"
        />
        <Stat
          label={t('schedule.import.result.stats.created')}
          value={result.partsCreated}
          color="#059669"
        />
        <Stat
          label={t('schedule.import.result.stats.updated')}
          value={result.partsUpdated}
          color="#d97706"
        />
        <Stat
          label={t('schedule.import.result.stats.skipped')}
          value={result.partsSkipped}
          color="#64748b"
        />
      </View>

      {result.unclassifiedParts > 0 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            {t('schedule.import.result.unclassified', {
              count: result.unclassifiedParts,
            })}
          </Text>
        </View>
      )}

      {messages.length > 0 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>
            {t('schedule.import.result.warningsTitle')}
          </Text>
          {messages.slice(0, 5).map((w, i) => (
            <Text key={i} style={styles.warningText}>
              • {w}
            </Text>
          ))}
          {messages.length > 5 && (
            <Text style={styles.warningText}>
              {t('schedule.import.result.moreWarnings', {
                count: messages.length - 5,
              })}
            </Text>
          )}
          {someNotHeld && (
            <Text style={[styles.warningText, { marginTop: 6 }]}>
              {t('schedule.import.result.notHeldHint')}
            </Text>
          )}
        </View>
      )}

      {firstWeek ? (
        <Pressable
          style={styles.openWeek}
          onPress={() =>
            router.push(`/schedule/edit?week=${firstWeek}` as never)
          }
        >
          <Ionicons name="calendar-outline" size={16} color="#0369a1" />
          <Text style={styles.openWeekText}>
            {t('schedule.import.result.openSchedule')}
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.weeksHeader}>
        {t('schedule.import.result.importedWeeks')}
      </Text>
      <View style={styles.weeksList}>
        {result.weeks.map((w) => (
          <View key={w.weekStartDate} style={styles.weekRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.weekDate}>
                {weekLabel(w.weekStartDate)}
              </Text>
              <Text style={styles.weekBible} numberOfLines={1}>
                {w.biblePassage}
              </Text>
            </View>
            <View style={styles.weekStats}>
              {w.created > 0 && (
                <Text style={[styles.weekStat, { color: '#059669' }]}>
                  +{w.created}
                </Text>
              )}
              {w.updated > 0 && (
                <Text style={[styles.weekStat, { color: '#d97706' }]}>
                  ~{w.updated}
                </Text>
              )}
              {w.notHeld ? (
                <Text style={styles.weekNotHeld}>
                  {t('schedule.import.result.weekNotHeld')}
                </Text>
              ) : w.frozen ? (
                <Text style={styles.weekNotHeld}>
                  {t('schedule.import.result.weekFrozen')}
                </Text>
              ) : (
                w.skipped > 0 && (
                  <Text style={[styles.weekStat, { color: '#64748b' }]}>
                    ={w.skipped}
                  </Text>
                )
              )}
            </View>
          </View>
        ))}
      </View>

    </View>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  contentWide: { maxWidth: 1080, width: '100%', alignSelf: 'center', paddingHorizontal: 24 },
  lead: { fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 20, color: '#334155' },
  cards: { gap: 10 },
  cardsWide: { flexDirection: 'row' },
  sumCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 4,
  },
  sumCardWide: { flex: 1 },
  sumCardNext: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  sumCardDone: { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' },
  sumLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11.5,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sumValue: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#0f172a' },
  sumLine: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#0f172a', lineHeight: 20 },
  sumGap: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: '#b45309', lineHeight: 17 },
  sumSub: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569', lineHeight: 18 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 10,
  },
  cardTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0f172a' },
  dropInner: { alignItems: 'center', gap: 6, paddingVertical: 14 },
  dropSub: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#64748b', textAlign: 'center' },
  fileList: { gap: 8 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  fileVerdict: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: '#047857', lineHeight: 17 },
  verdictRepeat: { color: '#92400e' },
  verdictBad: { color: '#b91c1c' },
  link: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#0369a1' },
  phoneNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#e0f2fe',
    borderRadius: 10,
    padding: 12,
  },
  phoneNoteText: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#075985', lineHeight: 18 },
  tableHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 10,
  },
  rowHover: { backgroundColor: '#f8fafc' },
  headRow: { borderTopWidth: 0, paddingVertical: 4 },
  rowNarrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  th: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: '#64748b' },
  colWeek: { width: 190 },
  colSide: { flex: 1, minWidth: 0 },
  colPeople: { width: 90, textAlign: 'right' },
  weekCell: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#0f172a' },
  cell: { fontFamily: 'Manrope_500Medium', fontSize: 13 },
  cellNote: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b' },
  peopleCell: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: '#475569' },
  footnote: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b', lineHeight: 17, marginTop: 4 },

  noRights: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 32,
    backgroundColor: '#f1f5f9',
  },
  noRightsText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  /* Tappable: the month is not just a fact, it is the way into those weeks. */
  openWeek: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#e0f2fe',
  },
  openWeekText: {
    fontSize: 13.5,
    color: '#0369a1',
    fontFamily: 'Manrope_600SemiBold',
  },
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
  },
  privacyText: {
    fontFamily: 'Manrope_400Regular',
    flex: 1,
    fontSize: 12,
    color: '#047857',
    lineHeight: 16,
  },

  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0ea5e9',
    borderStyle: 'dashed',
  },
  pickButtonText: { color: '#0ea5e9', fontSize: 15, fontFamily: 'Manrope_500Medium',},

  fileName: { fontSize: 14, fontFamily: 'Manrope_500Medium', color: '#0f172a' },
  fileMeta: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b' },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  typeBadgeMidweek: { backgroundColor: '#dbeafe' },
  typeBadgeWeekend: { backgroundColor: '#fef3c7' },
  typeBadgeUnknown: { backgroundColor: '#f1f5f9' },
  typeBadgeText: { fontSize: 10, fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },


  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
  },
  uploadButtonText: { color: '#fff', fontSize: 16, fontFamily: 'Manrope_600SemiBold',},

  errorBox: {
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { fontFamily: 'Manrope_400Regular', color: '#dc2626', fontSize: 14 },

  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  successTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold', color: '#059669' },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 16,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontFamily: 'Manrope_700Bold',},
  statLabel: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  warningBox: {
    padding: 12,
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: 8,
  },
  warningTitle: {
    color: '#78350f',
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 4,
  },
  warningText: { fontFamily: 'Manrope_400Regular', color: '#92400e', fontSize: 13, lineHeight: 18 },

  weeksHeader: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  weeksList: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  weekDate: { fontSize: 13, color: '#0f172a', fontFamily: 'Manrope_500Medium',},
  weekBible: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b', marginTop: 2 },
  weekStats: { flexDirection: 'row', gap: 8 },
  weekNotHeld: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#92400e' },
  weekStat: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    minWidth: 28,
    textAlign: 'right',
  },

});
