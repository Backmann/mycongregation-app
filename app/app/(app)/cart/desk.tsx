import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../components/KeyboardScroll';
import { LoadFailure } from '../../../components/LoadFailure';
import { NoAccess } from '../../../components/NoAccess';
import { DateField } from '../../../components/DateField';
import { AssignmentSheet, type AssignmentAction } from '../../../components/territories/AssignmentSheet';
import { HandOver } from '../../../components/territories/HandOver';
import { PrintMapSheet } from '../../../components/territories/PrintMapSheet';
import { failsScreen } from '../../../lib/screen-failure';
import {
  extractErrorMessage,
  territoriesApi,
  type TerritoryCategory,
  type TerritoryDesk,
  type TerritoryRow,
} from '../../../lib/api';
import {
  attentionOf,
  entriesOf,
  freeFor,
  searchDesk,
  yearOf,
  type DeskEntry,
  type DeskOut,
} from '../../../lib/desk';
import { addDaysISO, formatDayShort, TERM_DAYS } from '../../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../../../components/reports/ReportBits';

const LATE = '#c2410c';
const SOON = '#b45309';
const OK = '#15803d';
const BG = '#f1f5f9';
const UNDO_MS = 10000;

type Step =
  | { at: 'home' }
  | { at: 'person'; key: string }
  | { at: 'give'; key: string }
  | {
      at: 'handover';
      key: string;
      assignmentId: string;
      territoryId: string;
      number: string;
      dueOn: string | null;
    };

/**
 * «Выдача и приём» (13 November 2026; mockup approved with three decisions:
 * the «не посещать» addresses never travel by a link, a link lives two
 * months past the day, paper from a phone goes to a print queue).
 *
 * The territory servant's desk, from the person to the territories: who is
 * late or nearly due, what a person holds — worked, back, more time in one
 * touch, with «Отменить» for ten seconds instead of «are you sure» — what
 * to give him next (never worked, then longest ago; one he had is marked),
 * and how he gets the map: the app, a link, or paper.
 */
export default function DeskScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    throwOnError: failsScreen,
  });
  const a = accessQ.data;
  const open = !!a?.keeps && !!a?.verified;
  const deskQ = useQuery({
    queryKey: ['territories', 'desk'],
    queryFn: () => territoriesApi.desk(),
    enabled: open,
    throwOnError: failsScreen,
  });
  const listQ = useQuery({
    queryKey: ['territories', 'list'],
    queryFn: () => territoriesApi.list(),
    enabled: open,
    throwOnError: failsScreen,
  });
  const [step, setStep] = useState<Step>({ at: 'home' });
  const [query, setQuery] = useState('');
  const [acting, setActing] = useState<{ action: AssignmentAction; out: DeskOut } | null>(null);
  const [undo, setUndo] = useState<{ text: string; assignmentId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printIds, setPrintIds] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const desk = deskQ.data;
  const today = desk?.today ?? '';
  const entries = useMemo(
    () => (desk ? entriesOf(desk.people, desk.out, desk.today) : []),
    [desk],
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ['territories'] });

  const showUndo = (text: string, assignmentId: string) => {
    if (timer.current) clearTimeout(timer.current);
    setUndo({ text, assignmentId });
    timer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const worked = useMutation({
    mutationFn: (o: DeskOut) => territoriesApi.complete(o.assignmentId, {}),
    onSuccess: async (_r, o) => {
      setError(null);
      showUndo(t('territories.desk.workedToast', { number: o.number }), o.assignmentId);
      await refresh();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const back = useMutation({
    mutationFn: (o: DeskOut) => territoriesApi.giveBack(o.assignmentId, {}),
    onSuccess: async (_r, o) => {
      setError(null);
      showUndo(t('territories.desk.backToast', { number: o.number }), o.assignmentId);
      await refresh();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const reopen = useMutation({
    mutationFn: (assignmentId: string) => territoriesApi.editAssignment(assignmentId, { reopen: true }),
    onSuccess: async () => {
      setUndo(null);
      await refresh();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  if (accessQ.isLoading || (open && (deskQ.isLoading || listQ.isLoading))) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (accessQ.error) return <LoadFailure error={accessQ.error} onRetry={() => accessQ.refetch()} />;
  if (!a || !open) return <NoAccess />;
  if (deskQ.error || !desk) return <LoadFailure error={deskQ.error} onRetry={() => deskQ.refetch()} />;
  if (listQ.error || !listQ.data) return <LoadFailure error={listQ.error} onRetry={() => listQ.refetch()} />;

  const entry = step.at !== 'home' ? entries.find((e) => e.key === step.key) ?? null : null;
  const groupOf = (id: string | null) => desk.groups.find((g) => g.id === id)?.name ?? null;
  const title =
    step.at === 'home'
      ? t('territories.desk.title')
      : step.at === 'give'
        ? t('territories.desk.giveTo', { name: entry?.name ?? '' })
        : entry?.name ?? t('territories.desk.title');

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen options={{ title }} />
      <KeyboardScroll style={{ flex: 1 }} contentContainerStyle={s.content}>
        {step.at !== 'home' ? (
          <Pressable
            onPress={() =>
              setStep(step.at === 'give' || step.at === 'handover' ? { at: 'person', key: step.key } : { at: 'home' })
            }
            style={s.backRow}
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={18} color={BRAND} />
            <Text style={s.backText}>
              {step.at === 'person' ? t('territories.desk.title') : entry?.name ?? ''}
            </Text>
          </Pressable>
        ) : null}

        {step.at === 'home' ? (
          <Home
            entries={entries}
            query={query}
            setQuery={setQuery}
            groupOf={groupOf}
            onOpen={(key) => {
              setError(null);
              setStep({ at: 'person', key });
            }}
          />
        ) : null}

        {step.at === 'person' && entry ? (
          <Person
            entry={entry}
            desk={desk}
            today={today}
            lang={lang}
            groupOf={groupOf}
            busy={worked.isPending || back.isPending}
            onWorked={(o) => worked.mutate(o)}
            onBack={(o) => back.mutate(o)}
            onAct={(action, o) => setActing({ action, out: o })}
            onGive={() => setStep({ at: 'give', key: entry.key })}
          />
        ) : null}

        {step.at === 'give' && entry ? (
          <Give
            entry={entry}
            desk={desk}
            rows={listQ.data}
            today={today}
            lang={lang}
            onGiven={(r, row) =>
              setStep({
                at: 'handover',
                key: entry.key,
                assignmentId: r.id,
                territoryId: row.id,
                number: row.number,
                dueOn: r.dueOn,
              })
            }
          />
        ) : null}

        {step.at === 'handover' && entry ? (
          <View style={s.card}>
            <HandOver
              assignmentId={step.assignmentId}
              number={step.number}
              holderName={entry.name}
              dueOn={step.dueOn}
              hasApp={entry.hasApp}
              noCalls={desk.noCalls[step.territoryId] ?? 0}
              onDone={() => {
                void refresh();
                setStep({ at: 'person', key: entry.key });
              }}
              onPrintNow={Platform.OS === 'web' ? () => setPrintIds([step.territoryId]) : undefined}
            />
          </View>
        ) : null}

        {step.at !== 'home' && !entry ? (
          <Text style={s.muted}>{t('territories.desk.gone')}</Text>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
      </KeyboardScroll>

      {undo ? (
        <View style={s.toast} accessibilityLiveRegion="polite">
          <Text style={s.toastText}>{undo.text}</Text>
          <Pressable
            onPress={() => reopen.mutate(undo.assignmentId)}
            disabled={reopen.isPending}
            hitSlop={10}
            accessibilityRole="button"
          >
            <Text style={s.toastUndo}>{t('territories.desk.undo')}</Text>
          </Pressable>
        </View>
      ) : null}

      <AssignmentSheet
        action={acting?.action ?? null}
        assignment={
          acting
            ? {
                id: acting.out.assignmentId,
                assignedOn: acting.out.assignedOn,
                dueOn: acting.out.dueOn,
                completedOn: null,
                returnedOn: null,
                method: null,
                extended: acting.out.extended,
              }
            : null
        }
        keeps
        onClose={() => {
          setActing(null);
          void refresh();
        }}
      />
      {printIds ? (
        <PrintMapSheet
          targets={listQ.data.filter((r) => printIds.includes(r.id))}
          all={listQ.data}
          visible
          onClose={() => setPrintIds(null)}
        />
      ) : null}
    </View>
  );
}

/** Initials for the round badge: «Петров Иван» → «ПИ». */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

const TINTS = ['#0e7490', '#7c3aed', '#c2410c', '#15803d', '#0369a1', '#be185d'];
function tint(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

function Avatar({ entry, size = 38 }: { entry: DeskEntry; size?: number }) {
  return (
    <View
      style={[
        s.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tint(entry.key) },
      ]}
    >
      <Text style={[s.avatarText, { fontSize: size * 0.34 }]}>{initials(entry.name)}</Text>
    </View>
  );
}

function Home({
  entries,
  query,
  setQuery,
  groupOf,
  onOpen,
}: {
  entries: DeskEntry[];
  query: string;
  setQuery: (q: string) => void;
  groupOf: (id: string | null) => string | null;
  onOpen: (key: string) => void;
}) {
  const { t } = useTranslation();
  const found = searchDesk(entries, query);
  const { late, soon } = attentionOf(entries);
  const line = (e: DeskEntry, tone: 'late' | 'soon' | null) => (
    <Pressable
      key={e.key}
      onPress={() => onOpen(e.key)}
      style={({ pressed }) => [s.person, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
    >
      <Avatar entry={e} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.name} numberOfLines={1}>
          {e.name}
        </Text>
        <Text style={s.sub} numberOfLines={1}>
          {e.holds.length
            ? e.holds.map((h) => h.number).join(', ')
            : [groupOf(e.serviceGroupId), t('territories.desk.holdsNone')].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {tone === 'late' ? (
        <Text style={[s.pill, s.pillLate]}>{t('territories.desk.lateDays', { count: e.late })}</Text>
      ) : tone === 'soon' ? (
        <Text style={[s.pill, s.pillSoon]}>{t('territories.desk.leftDays', { count: e.left ?? 0 })}</Text>
      ) : !e.publisherId ? (
        <Text style={[s.pill, s.pillMuted]}>{t('territories.desk.noCard')}</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={MUTED} />
    </Pressable>
  );
  return (
    <>
      <View style={s.search}>
        <Ionicons name="search" size={17} color={MUTED} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('territories.desk.search')}
          placeholderTextColor="#94a3b8"
          style={s.searchInput}
          autoCorrect={false}
          accessibilityLabel={t('territories.desk.search')}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button">
            <Ionicons name="close-circle" size={17} color={MUTED} />
          </Pressable>
        ) : null}
      </View>
      {query.trim() ? (
        <View style={s.card}>
          {found.length ? found.slice(0, 30).map((e) => line(e, null)) : <Text style={s.muted}>{t('territories.desk.nobody')}</Text>}
        </View>
      ) : (
        <>
          <Text style={s.section}>{t('territories.desk.late', { count: late.length })}</Text>
          <View style={s.card}>
            {late.length ? late.map((e) => line(e, 'late')) : <Text style={s.muted}>{t('territories.desk.lateNone')}</Text>}
          </View>
          <Text style={s.section}>{t('territories.desk.soon', { count: soon.length })}</Text>
          <View style={s.card}>
            {soon.length ? soon.map((e) => line(e, 'soon')) : <Text style={s.muted}>{t('territories.desk.soonNone')}</Text>}
          </View>
          <Text style={s.small}>{t('territories.desk.homeHint')}</Text>
        </>
      )}
    </>
  );
}

function Person({
  entry,
  desk,
  today,
  lang,
  groupOf,
  busy,
  onWorked,
  onBack,
  onAct,
  onGive,
}: {
  entry: DeskEntry;
  desk: TerritoryDesk;
  today: string;
  lang: string;
  groupOf: (id: string | null) => string | null;
  busy: boolean;
  onWorked: (o: DeskOut) => void;
  onBack: (o: DeskOut) => void;
  onAct: (a: AssignmentAction, o: DeskOut) => void;
  onGive: () => void;
}) {
  const { t } = useTranslation();
  const year = entry.publisherId ? yearOf(desk.history, entry.publisherId, today) : null;
  return (
    <>
      <View style={s.hero}>
        <Avatar entry={entry} size={54} />
        <View style={{ flex: 1 }}>
          <Text style={s.heroName}>{entry.name}</Text>
          <Text style={s.sub}>
            {[groupOf(entry.serviceGroupId), entry.pioneer ? t('territories.desk.pioneer') : null]
              .filter(Boolean)
              .join(' · ') || ' '}
          </Text>
          <View style={s.pills}>
            {!entry.publisherId ? (
              <Text style={[s.pill, s.pillMuted]}>{t('territories.desk.noCard')}</Text>
            ) : entry.hasApp ? (
              <Text style={[s.pill, s.pillApp]}>{t('territories.desk.hasApp')}</Text>
            ) : (
              <Text style={[s.pill, s.pillMuted]}>{t('territories.desk.noApp')}</Text>
            )}
          </View>
        </View>
      </View>

      {entry.holds.length === 0 ? (
        <View style={s.card}>
          <Text style={s.muted}>{t('territories.desk.holdsNone')}</Text>
        </View>
      ) : (
        entry.holds.map((o) => {
          const days = o.dueOn ? Math.round((Date.parse(o.dueOn) - Date.parse(today)) / 86400000) : null;
          const late = days !== null && days < 0;
          const color = late ? LATE : days !== null && days <= 14 ? SOON : OK;
          return (
            <View key={o.assignmentId} style={s.hold}>
              <View style={s.holdHead}>
                <View style={[s.ring, { borderColor: color }]}>
                  <Text style={[s.ringText, { color }]}>
                    {days === null ? '—' : late ? `+${-days}` : String(days)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.number}>{o.number}</Text>
                  <Text style={s.sub}>
                    {[
                      o.forGroupName ? t('territories.desk.forGroup', { group: o.forGroupName }) : o.locality,
                      t('territories.desk.since', { date: formatDayShort(o.assignedOn, lang) }),
                      o.dueOn
                        ? t(late ? 'territories.desk.wasDue' : 'territories.desk.due', {
                            date: formatDayShort(o.dueOn, lang),
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </View>
              <View style={s.acts}>
                <Pressable
                  onPress={() => onWorked(o)}
                  onLongPress={() => onAct('complete', o)}
                  disabled={busy}
                  style={({ pressed }) => [s.act, s.actPrimary, pressed && { opacity: 0.75 }]}
                  accessibilityRole="button"
                  accessibilityHint={t('territories.desk.workedHint')}
                >
                  <Text style={[s.actText, { color: '#fff' }]}>{t('territories.desk.worked')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => onBack(o)}
                  onLongPress={() => onAct('return', o)}
                  disabled={busy}
                  style={({ pressed }) => [s.act, pressed && { opacity: 0.75 }]}
                  accessibilityRole="button"
                >
                  <Text style={s.actText}>{t('territories.desk.back')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => onAct('extend', o)}
                  disabled={busy}
                  style={({ pressed }) => [s.act, pressed && { opacity: 0.75 }]}
                  accessibilityRole="button"
                >
                  <Text style={s.actText}>{t('territories.desk.extend')}</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
      {entry.holds.length ? <Text style={s.small}>{t('territories.desk.longPress')}</Text> : null}

      {year ? (
        <>
          <Text style={s.section}>{t('territories.desk.year')}</Text>
          <View style={s.card}>
            <Text style={s.sub}>
              {t('territories.desk.yearLine', { worked: year.worked, back: year.returned })}
              {year.avgDays !== null ? ` · ${t('territories.desk.avgDays', { count: year.avgDays })}` : ''}
            </Text>
          </View>
        </>
      ) : null}

      {entry.publisherId ? (
        <Pressable
          onPress={onGive}
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={19} color="#fff" />
          <Text style={s.ctaText}>{t('territories.desk.give', { name: entry.name })}</Text>
        </Pressable>
      ) : (
        <Text style={s.small}>{t('territories.desk.noCardGive')}</Text>
      )}
    </>
  );
}

function Give({
  entry,
  desk,
  rows,
  today,
  lang,
  onGiven,
}: {
  entry: DeskEntry;
  desk: TerritoryDesk;
  rows: TerritoryRow[];
  today: string;
  lang: string;
  onGiven: (r: { id: string; dueOn: string | null }, row: TerritoryRow) => void;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<TerritoryCategory>('residential');
  const [place, setPlace] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<TerritoryRow | null>(null);
  const [dueOn, setDueOn] = useState(addDaysISO(today, TERM_DAYS));
  const [forGroup, setForGroup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const led = desk.groups.find((g) => g.overseerPublisherId === entry.publisherId) ?? null;
  const hasBusiness = rows.some((r) => r.category === 'business' && !r.holder);
  const all = freeFor(rows, {
    publisherId: entry.publisherId,
    history: desk.history,
    houses: desk.houses,
    noCalls: desk.noCalls,
    today,
    category,
  });
  const places = [...new Set(all.map((c) => c.row.locality).filter((x): x is string => !!x))]
    .map((p) => ({ p, n: all.filter((c) => c.row.locality === p).length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (c) =>
      (!place || c.row.locality === place) &&
      (!q || c.row.number.toLowerCase().includes(q) || (c.row.locality ?? '').toLowerCase().includes(q)),
  );
  const give = useMutation({
    mutationFn: () =>
      territoriesApi.assign(chosen!.id, {
        publisherId: entry.publisherId!,
        dueOn,
        ...(forGroup && led ? { forGroupId: led.id } : {}),
      }),
    onSuccess: (r) => onGiven({ id: r.id, dueOn: r.dueOn }, chosen!),
    onError: (e) => setError(extractErrorMessage(e)),
  });

  return (
    <>
      {entry.holds.length >= 2 ? (
        <View style={s.warn}>
          <Ionicons name="alert-circle-outline" size={16} color={SOON} />
          <Text style={s.warnText}>{t('territories.desk.holdsMany', { count: entry.holds.length })}</Text>
        </View>
      ) : null}
      {hasBusiness ? (
        <View style={s.chips}>
          {(['residential', 'business'] as TerritoryCategory[]).map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                setCategory(c);
                setPlace(null);
                setChosen(null);
              }}
              style={[s.chip, category === c && s.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: category === c }}
            >
              <Text style={[s.chipText, category === c && s.chipTextOn]}>{t(`territories.category.${c}`)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={s.search}>
        <Ionicons name="search" size={17} color={MUTED} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('territories.desk.findTerritory')}
          placeholderTextColor="#94a3b8"
          style={s.searchInput}
          autoCorrect={false}
          accessibilityLabel={t('territories.desk.findTerritory')}
        />
      </View>
      {places.length > 1 ? (
        <View style={s.chips}>
          <Pressable
            onPress={() => setPlace(null)}
            style={[s.chip, !place && s.chipOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: !place }}
          >
            <Text style={[s.chipText, !place && s.chipTextOn]}>{t('territories.desk.allFree', { count: all.length })}</Text>
          </Pressable>
          {places.map(({ p, n }) => (
            <Pressable
              key={p}
              onPress={() => setPlace(place === p ? null : p)}
              style={[s.chip, place === p && s.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: place === p }}
            >
              <Text style={[s.chipText, place === p && s.chipTextOn]}>{`${p} · ${n}`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={s.section}>{t('territories.desk.freeTitle')}</Text>
      <View style={s.card}>
        {shown.length === 0 ? <Text style={s.muted}>{t('territories.desk.freeNone')}</Text> : null}
        {shown.slice(0, 40).map((c) => {
          const on = chosen?.id === c.row.id;
          return (
            <Pressable
              key={c.row.id}
              onPress={() => {
                setError(null);
                setChosen(on ? null : c.row);
              }}
              style={({ pressed }) => [s.terr, on && s.terrOn, pressed && { opacity: 0.7 }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <View style={[s.tile, on && { backgroundColor: BRAND }]}>
                <Ionicons name="home-outline" size={15} color={on ? '#fff' : BRAND} />
                <Text style={[s.tileText, on && { color: '#fff' }]}>{c.houses ?? '—'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{c.row.number}</Text>
                <Text style={s.sub}>
                  {[
                    c.row.locality,
                    c.row.lastCompletedOn
                      ? t('territories.desk.workedOn', { date: formatDayShort(c.row.lastCompletedOn, lang) })
                      : t('territories.desk.neverWorked'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <View style={s.pills}>
                  {c.longAgo ? <Text style={[s.pill, s.pillLate]}>{t('territories.desk.longAgo')}</Text> : null}
                  {c.hadOn ? (
                    <Text style={[s.pill, s.pillSoon]}>
                      {t('territories.desk.hadOn', { date: formatDayShort(c.hadOn, lang) })}
                    </Text>
                  ) : null}
                  {c.noCalls ? (
                    <Text style={[s.pill, s.pillMuted]}>{t('territories.desk.noCalls', { count: c.noCalls })}</Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {chosen ? (
        <View style={s.confirm}>
          <Text style={s.confirmTitle}>{t('territories.desk.confirm', { number: chosen.number, name: entry.name })}</Text>
          <DateField label={t('territories.desk.dueLabel')} value={dueOn} onChange={setDueOn} />
          {led ? (
            <Pressable
              onPress={() => setForGroup((v) => !v)}
              style={s.groupRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: forGroup }}
            >
              <Ionicons name={forGroup ? 'checkbox' : 'square-outline'} size={20} color={forGroup ? BRAND : '#94a3b8'} />
              <Text style={s.groupText}>{t('territories.desk.forGroupToggle', { group: led.name })}</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable
            onPress={() => give.mutate()}
            disabled={give.isPending}
            style={({ pressed }) => [s.cta, (pressed || give.isPending) && { opacity: 0.8 }]}
            accessibilityRole="button"
          >
            {give.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.ctaText}>{t('territories.desk.giveNow', { number: chosen.number })}</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const shadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 110, gap: 10, width: '100%', maxWidth: 640, alignSelf: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BRAND },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: Platform.OS === 'web' ? 11 : 6,
    ...shadow,
  },
  searchInput: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 15, color: INK, paddingVertical: 4 },
  section: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: MUTED,
    marginTop: 8,
    marginLeft: 4,
  },
  card: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6, ...shadow },
  person: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Manrope_800ExtraBold', color: '#fff' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: INK },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, lineHeight: 17 },
  muted: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: MUTED, paddingVertical: 10 },
  small: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, lineHeight: 17, marginHorizontal: 4 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 4 },
  pill: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11.5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  pillLate: { backgroundColor: '#fff4ed', color: LATE },
  pillSoon: { backgroundColor: '#fffbeb', color: SOON },
  pillApp: { backgroundColor: '#ecfeff', color: BRAND },
  pillMuted: { backgroundColor: '#f1f5f9', color: MUTED },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 4 },
  heroName: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: INK },
  hold: { backgroundColor: '#fff', borderRadius: 18, padding: 14, ...shadow },
  holdHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ring: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12 },
  number: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: INK },
  acts: { flexDirection: 'row', gap: 7, marginTop: 12 },
  act: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#fff',
  },
  actPrimary: { backgroundColor: BRAND, borderColor: BRAND },
  actText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK },
  cta: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BRAND,
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 8,
    ...shadow,
  },
  ctaText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff', ...shadow },
  chipOn: { backgroundColor: INK },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: MUTED },
  chipTextOn: { color: '#fff' },
  terr: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderRadius: 14 },
  terrOn: { backgroundColor: '#ecfeff', marginHorizontal: -8, paddingHorizontal: 8 },
  tile: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#ecfeff', alignItems: 'center', justifyContent: 'center' },
  tileText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, color: BRAND, marginTop: 1 },
  warn: { flexDirection: 'row', gap: 8, backgroundColor: '#fffbeb', borderRadius: 12, padding: 10, alignItems: 'center' },
  warnText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: SOON },
  confirm: { backgroundColor: '#fff', borderRadius: 20, padding: 16, gap: 10, borderWidth: 2, borderColor: BRAND, ...shadow },
  confirmTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: INK },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    maxWidth: 608,
    alignSelf: 'center',
    backgroundColor: INK,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...shadow,
  },
  toastText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#fff' },
  toastUndo: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: '#67e8f9' },
});
