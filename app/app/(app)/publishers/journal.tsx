import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { formatDayRange } from '../../../lib/date-range';
import { readerTitle } from '../../../lib/reader-titles';
// Locales are opt-in per file in dayjs: without these the dates come out in
// English however the app is set, which is exactly what happened here.
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  JournalEntry,
  extractErrorMessage,
  journalApi,
} from '../../../lib/api';
import { Sheet } from '../../../components/Sheet';
import { useAuth } from '../../../lib/auth';
import { failsScreen } from '../../../lib/screen-failure';

/**
 * The change journal, for administrators.
 *
 * A journal is read with a question in mind — "who put Peter on the
 * microphone", "who tried to edit last week" — so it is built as a story, not
 * a table. Each line is a sentence assembled here from translations rather
 * than sent ready-made by the server, because the app speaks three languages
 * and this screen must not be the one that only speaks Russian.
 *
 * Entries are grouped by day, because that is how people remember: "it was
 * Tuesday". Within a day the time sits to the left, so the eye can run down
 * the column and stop where it needs to.
 */

/** Sections whose colour matches the rest of the app's language. */
const SECTION_TONE: Record<string, string> = {
  assignment: '#f97316',
  duty: '#ef4444',
  cleaning: '#0ea5e9',
  publisher: '#8b5cf6',
  service_report: '#14b8a6',
  // Field service is green in the app's colour language, everywhere.
  field_service_meeting: '#22c55e',
  talk_exchange: '#eab308',
  visiting_speaker: '#eab308',
  external_congregation: '#eab308',
  responsibility: '#8b5cf6',
  auxiliary_pioneer: '#22c55e',
  service_group: '#8b5cf6',
  absence: '#64748b',
  hall: '#64748b',
  circuit_overseer: '#f97316',
  special_event: '#f97316',
  local_need: '#f97316',
  cart_location: '#22c55e',
  congregation: '#64748b',
  backup: '#64748b',
  user: '#64748b',
  elder_task: '#64748b',
  elders_meeting: '#64748b',
  agenda_item: '#64748b',
  meeting_settings: '#64748b',
  annual_report: '#0e7490',
  monthly_report: '#0e7490',
};

const SECTION_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  assignment: 'calendar-outline',
  duty: 'people-outline',
  cleaning: 'sparkles-outline',
  publisher: 'person-outline',
  service_report: 'document-text-outline',
  field_service_meeting: 'walk-outline',
  talk_exchange: 'mic-outline',
  visiting_speaker: 'person-circle-outline',
  external_congregation: 'business-outline',
  responsibility: 'ribbon-outline',
  auxiliary_pioneer: 'infinite-outline',
  service_group: 'people-circle-outline',
  absence: 'airplane-outline',
  hall: 'home-outline',
  circuit_overseer: 'star-outline',
  special_event: 'calendar-number-outline',
  local_need: 'bulb-outline',
  cart_location: 'location-outline',
  congregation: 'settings-outline',
  backup: 'shield-checkmark-outline',
  user: 'key-outline',
  elder_task: 'checkbox-outline',
  elders_meeting: 'people-outline',
  agenda_item: 'list-outline',
  meeting_settings: 'time-outline',
  annual_report: 'lock-closed-outline',
  monthly_report: 'lock-closed-outline',
};

/**
 * The three actions that are not ordinary edits. A refusal, a look at somebody
 * else's record and a copy of the database leaving the server are the entries
 * a person opens this screen for, and they must not sit indistinguishable
 * between "added" and "removed".
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOTABLE = new Set(['DENY', 'VIEW', 'DOWNLOAD']);

/** Detail keys the tail already speaks; listing them again would stutter. */
const HANDLED_DETAIL = new Set([
  'reason',
  'document',
  'file',
  'count',
  'bulk',
  'weeks',
]);

const FILTERS = [
  'assignment',
  'duty',
  'cleaning',
  'publisher',
  'service_report',
  'field_service_meeting',
  'talk_exchange',
  'responsibility',
  'auxiliary_pioneer',
  'service_group',
  'absence',
  'special_event',
  'cart_location',
  'congregation',
  'backup',
  'meeting_settings',
  'elder_task',
  'annual_report',
  'monthly_report',
] as const;

export default function JournalScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  // The journal is an administrator's screen — the list itself is refused to
  // anybody else — so the button that lives on its rows is an administrator's
  // too. Offering it to an elder promised something he could never reach.
  const mayRevert = user?.role === 'admin';
  const [revertFor, setRevertFor] = useState<JournalEntry | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const wide = useWindowDimensions().width >= 768;

  const query = useInfiniteQuery({
    throwOnError: failsScreen,
    queryKey: ['journal', section],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      journalApi.list({
        limit: 50,
        before: pageParam,
        entityType: section ?? undefined,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: user?.role === 'admin',
  });

  // Names arrive per page; merge them so an entry rendered from page 3 can
  // still name a person first seen on page 1.
  const names = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const page of query.data?.pages ?? []) {
      Object.assign(merged, page.names ?? {});
    }
    return merged;
  }, [query.data]);

  const days = useMemo(() => {
    const items = query.data?.pages.flatMap((p) => p.items) ?? [];
    const groups = new Map<string, JournalEntry[]>();
    for (const item of items) {
      const key = dayjs(item.occurredAt).format('YYYY-MM-DD');
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }
    return [...groups.entries()];
  }, [query.data]);

  const dayLabel = (key: string) => {
    const day = dayjs(key);
    const today = dayjs().startOf('day');
    if (day.isSame(today, 'day')) return t('journal.today');
    if (day.isSame(today.subtract(1, 'day'), 'day')) return t('journal.yesterday');
    return day.locale(i18n.language).format('dd, D MMMM YYYY');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Wide screens wrap the filters: on a laptop the row ran past the
          edge with no sign that it scrolls (walk, 23 October 2026). A phone
          keeps one swiped row — wrapped, it took half the screen. */}
      <ScrollView
        horizontal={!wide}
        scrollEnabled={!wide}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.filters, wide && styles.filtersWrap]}
      >
        <Chip
          label={t('journal.filtersAll')}
          active={section === null}
          onPress={() => setSection(null)}
        />
        {FILTERS.map((key) => (
          <Chip
            key={key}
            label={t(`journal.sections.${key}`)}
            active={section === key}
            tone={SECTION_TONE[key]}
            onPress={() => setSection(section === key ? null : key)}
          />
        ))}
      </ScrollView>

      {query.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : query.isError ? (
        <Text style={[styles.muted, styles.centreText]}>
          {t('journal.loadFailed')}
        </Text>
      ) : days.length === 0 ? (
        <Text style={[styles.muted, styles.centreText]}>
          {t('journal.empty')}
        </Text>
      ) : (
        days.map(([key, entries]) => (
          <View key={key} style={styles.day}>
            <Text style={styles.dayLabel}>{dayLabel(key)}</Text>
            <View style={styles.card}>
              {entries.map((entry, index) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  first={index === 0}
                  language={i18n.language}
                  names={names}
                  canRevert={mayRevert}
                  onRevert={() => setRevertFor(entry)}
                />
              ))}
            </View>
          </View>
        ))
      )}

      {revertFor ? (
        <RevertSheet entry={revertFor} onClose={() => setRevertFor(null)} />
      ) : null}

      {query.hasNextPage ? (
        <Pressable
          style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}
          onPress={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.moreText}>{t('journal.loadMore')}</Text>
          )}
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  tone,
  onPress,
}: {
  label: string;
  active: boolean;
  tone?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { backgroundColor: tone ?? '#0e7490', borderColor: 'transparent' },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A recorded value as a person should read it: an id becomes the name it
 * belongs to, an empty value says "empty" rather than showing nothing, and a
 * date or number is left as it is.
 */
function readValue(
  v: unknown,
  names: Record<string, string>,
  t: (k: string, o?: Record<string, unknown>) => string,
  language: string,
  at?: { entityType: string; field: string },
): string | null {
  if (v === null || v === undefined || v === '') return t('journal.noValue');
  // A list (the brothers a task is given to, a speaker's talk numbers) is
  // each of its values, read the same way. It used to be dropped as «no
  // value» — 30 September, when tasks joined the journal.
  if (Array.isArray(v)) {
    if (v.length === 0) return t('journal.noValue');
    return v
      .map((x) => readValue(x, names, t, language, at))
      .filter((x): x is string => !!x)
      .join(', ');
  }
  const own = at ? fieldWord(at.entityType, at.field, v, t, language) : '';
  if (own) return own;
  if (typeof v === 'string') {
    // A value the journal keeps hidden (a phone number): older rows say it
    // in Russian, newer ones with a mark; both read as the mark.
    // cyrillic-ok: the old rows' own word, recognised to be replaced
    if (v === '<скрыто>' || v === '•••') return '•••';
    // A name first, then a known code word — "incoming" and "confirmed" are
    // for the machine, not for whoever opens the journal.
    if (names[v]) return names[v];
    const word = t(`journal.values.${v}`, { defaultValue: '' });
    if (word) return word;
    // The kinds of special event are already named for the screens that show
    // them; the journal was printing the raw `circuit_overseer_visit` beside
    // them. One dictionary, read from both places, rather than a second copy
    // that drifts.
    const eventKind = t(`specialEvents.types.${v}`, { defaultValue: '' });
    if (eventKind) return eventKind;
    // A part of the programme by its code («treasures_talk») — the same
    // names the schedule prints.
    const part = t(`parts.${v}`, { defaultValue: '' });
    if (part) return part;
    // An id the server could not name is a record since deleted (a talk of
    // a replaced catalogue, a removed guest). The bare uuid told a reader
    // nothing — the Android pass of 28 September.
    if (UUID_RE.test(v)) return t('journal.goneRecord');
    // A bare ISO date reads better as a date.
    // Dates were coming out in English — «4 August 2026» in a Russian
    // journal — because this one call never got the language the rest of the
    // screen already uses.
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return dayjs(v).locale(language).format('D MMMM YYYY');
    }
    // A moment — «published at» — reads as its day and time, not as
    // «2026-10-09T19:29:43.072Z» (the language pass of 20 October 2026).
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
      return dayjs(v).locale(language).format('D MMMM YYYY, HH:mm');
    }
    // A whole structure kept as JSON (a template's meetings, the list a
    // month was published with) is no sentence for a person: it changed.
    if (/^[[{]/.test(v.trim())) return t('journal.structured');
    // 'HH:MM:SS' from a time column: the seconds are noise.
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(v)) return v.slice(0, 5);
    return v;
  }
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');
  if (typeof v === 'number') return String(v);
  return null;
}

/** `entity.field` (or `*.field`) → where the screens keep the words for its values. */
const ENUM_WORDS: Record<string, string> = {
  'publisher.status': 'publishers.status.',
  'assignment.status': 'assignments.status.',
  'user.role': 'profile.roles.',
  'user.uiLanguage': 'language',
  'responsibility.type': 'responsibilities.types.',
  'circuit_overseer.role': 'assignments.form.coRole.',
  'field_service_settings.prepareLead': 'fieldService.template.auto.lead.',
  'field_service_settings.unpublishedPolicy': 'fieldService.template.auto.policy.',
  // ISO weekday, 1 = Monday … 7 = Sunday: a bare «6 → 4» said nothing.
  'field_service_meeting.dayOfWeek': 'iso-weekday',
  'external_congregation.meetingDow': 'iso-weekday',
  // A month stored as its first day: «1 сентября 2026» named a day nobody chose.
  '*.startMonth': 'month',
  '*.endMonth': 'month',
};

/** A language by its own name — the way the language switch shows it. */
// cyrillic-ok: a language named in its own language
const LANGUAGE_NAMES: Record<string, string> = { ru: 'Русский', en: 'English', de: 'Deutsch' };

/**
 * Words that only mean something next to their own field.
 *
 * `other`, `people`, `done` are too common to go into the shared
 * `journal.values` dictionary, which is read for EVERY value of every
 * section: «done» there would rename whatever else happens to say done. So a
 * task's values are translated here, by field, from the task screens' own
 * dictionary — one set of words for both places.
 */
/**
 * A changed field's name. A pioneer school's duty carries its day and role IN
 * the name — «2026-11-25 · microphone 2» — written by the server so the line
 * needs no lookup; here it becomes «25 ноября · Микрофон 2».
 */
function fieldLabel(
  entityType: string,
  field: string,
  t: (k: string, o?: Record<string, unknown>) => string,
  language: string,
): string {
  if (entityType === 'pioneer_school_duty') {
    const m = /^(\d{4}-\d{2}-\d{2}) · ([a-z_]+)(?: (\d+))?$/.exec(field);
    if (m) {
      const role = t(`duties.types.${m[2]}`, { defaultValue: m[2] });
      return `${dayjs(m[1]).locale(language).format('D MMMM')} · ${role}${m[3] ? ` ${m[3]}` : ''}`;
    }
    const d = /^(\d{4}-\d{2}-\d{2}) · (.+)$/.exec(field);
    if (d) return `${dayjs(d[1]).locale(language).format('D MMMM')} · ${d[2]}`;
  }
  return t(`journal.fieldNames.${field}`, { defaultValue: field });
}

function fieldWord(
  entityType: string,
  field: string,
  v: unknown,
  t: (k: string, o?: Record<string, unknown>) => string,
  language: string,
): string {
  // A stored code word for which a screen already has its words: the same
  // dictionary, read from here too (the language pass of 20 October 2026).
  // No screen keeps words for these yet — the journal keeps its own.
  if (typeof v === 'string') {
    if (entityType === 'co_visit_item' && field === 'kind') {
      return t(`journal.words.coVisitKind.${v}`, { defaultValue: '' });
    }
    if (entityType === 'cart_location' && field === 'kind') {
      return t(`journal.words.cartKind.${v}`, { defaultValue: '' });
    }
    if (entityType === 'memorial_item' && field === 'section') {
      return t(`journal.words.memorialSection.${v}`, { defaultValue: '' });
    }
  }
  const dict = ENUM_WORDS[`${entityType}.${field}`] ?? ENUM_WORDS[`*.${field}`];
  if (dict && (typeof v === 'string' || typeof v === 'number')) {
    if (dict === 'iso-weekday') {
      const n = Number(v);
      return n >= 1 && n <= 7 ? dayjs().locale(language).day(n % 7).format('dddd') : '';
    }
    if (dict === 'language') return LANGUAGE_NAMES[String(v)] ?? '';
    if (dict === 'month') {
      return /^\d{4}-\d{2}(-\d{2})?$/.test(String(v))
        ? dayjs(`${String(v).slice(0, 7)}-01`).locale(language).format('MMMM YYYY')
        : '';
    }
    // Each entry ends in a dot, so the families stay visible to
    // scripts/check-i18n-unused.mjs.
    return t(`${dict}${v}`, { defaultValue: '' });
  }
  // A yes/no on a card or a kept sheet: «true» is the machine's word.
  if (typeof v === 'boolean') {
    if (
      field === 'confirmed' ||
      field === 'isDeaf' ||
      field === 'isBlind' ||
      field === 'isImprisoned' ||
      // A programme part corrected after it became the record (13 October 2026).
      field === 'retroactive'
    ) {
      return v ? t('common.yes') : t('common.no');
    }
  }
  if (entityType === 'publisher' && typeof v === 'string') {
    // What the card's own screens call these — one dictionary, two readers.
    if (field === 'appointment') {
      return t(`publishers.appointment.${v}`, { defaultValue: '' });
    }
    if (field === 'pioneerType') {
      return t(`publishers.pioneer.options.${v}`, { defaultValue: '' });
    }
    if (field === 'removalReason') {
      return t(`publishers.removal.${v}`, { defaultValue: '' });
    }
    // A stretch of the pioneer history (30 October 2026), written by the
    // server as «regular 1995-09–1999-08»: said as the card says it.
    if (field === 'pioneerHistory') {
      const m = /^(\w+) (\d{4}-\d{2})–(\d{4}-\d{2})?$/.exec(v);
      if (!m) return '';
      const month = (ym: string) => dayjs(`${ym}-01`).locale(language).format('MMMM YYYY');
      return `${t(`publishers.pioneer.detail.${m[1]}`, { defaultValue: m[1] })} · ${month(m[2])} – ${
        m[3] ? month(m[3]) : '…'
      }`;
    }
    // Point 9 (30 October 2026): «2027-01-18–» or «2027-01-18–2028-03-02».
    if (field === 'pioneerNoQuota') {
      const m = /^(\d{4}-\d{2}-\d{2})–(\d{4}-\d{2}-\d{2})?$/.exec(v);
      if (!m) return '';
      return m[2]
        ? formatDayRange(m[1], m[2], language, { year: 'always' })
        : t('noQuota.from', { from: dayjs(m[1]).locale(language).format('D MMMM YYYY') });
    }
    // Journaled from 30 October 2026 — the form's own words.
    if (field === 'spiritualStatus') {
      const key = { other_sheep: 'otherSheep', anointed: 'anointed', unknown: 'unknown' }[v];
      return key ? t(`publishers.spiritualStatus.${key}`) : '';
    }
    return '';
  }
  if (entityType === 'meeting_settings') {
    // ISO weekday, 1 = Monday … 7 = Sunday, as the schedule stores it. A bare
    // «3» next to «День будней» says nothing.
    if ((field === 'midweekDow' || field === 'weekendDow') && typeof v === 'number') {
      return dayjs().locale(language).day(v % 7).format('dddd');
    }
    return '';
  }
  // An agenda item's outcome was printed as the machine's word —
  // «reviewed» — beside a label left in English (5 October).
  if (entityType === 'agenda_item') {
    return field === 'outcome' && typeof v === 'string'
      ? t(`agenda.items.outcome.${v}`, { defaultValue: '' })
      : '';
  }
  if (entityType !== 'elder_task' || typeof v !== 'string') return '';
  switch (field) {
    case 'kind':
      return t(`tasks.calendar.${v}`, { defaultValue: '' });
    case 'area':
      return t(`tasks.areas.${v}`, { defaultValue: '' });
    case 'assigneeKind':
      if (v === 'people') return t('tasks.form.assigneePeople');
      if (v === 'service_committee') return t('tasks.assignee.serviceCommittee');
      if (v === 'body_of_elders') return t('tasks.assignee.bodyOfElders');
      return '';
    case 'status':
      return t(`journal.taskStatus.${v}`, { defaultValue: '' });
    default:
      return '';
  }
}

function Row({
  entry,
  first,
  language,
  names,
  canRevert,
  onRevert,
}: {
  entry: JournalEntry;
  first: boolean;
  language: string;
  names: Record<string, string>;
  canRevert: boolean;
  onRevert: () => void;
}) {
  const { t } = useTranslation();
  const tone = SECTION_TONE[entry.entityType] ?? '#64748b';
  const notable = NOTABLE.has(entry.action);

  const actor =
    entry.source === 'system'
      ? t('journal.system')
      : (entry.actor?.name ?? t('journal.someone'));

  const section = t(`journal.sections.${entry.entityType}`, {
    defaultValue: entry.entityType,
  });
  const action = t(`journal.actions.${entry.action}`, {
    defaultValue: entry.action,
  });

  // Which item this concerns: the meeting, its date, the part. Without it a
  // line says a publisher was replaced but never says on what.
  const ctx = entry.context;
  const contextBits: string[] = [];
  if (ctx?.eventType) {
    contextBits.push(
      t(`assignments.eventTypeShort.${ctx.eventType}`, {
        defaultValue: ctx.eventType,
      }),
    );
  }
  if (ctx?.date) {
    // The year is spoken when it is not this one. A task due «31 августа»
    // read as last August while it said 2027 — 30 September.
    const d = dayjs(ctx.date).locale(language);
    const day = d.format(d.year() === dayjs().year() ? 'D MMMM' : 'D MMMM YYYY');
    // A part or a duty is dated by its WEEK (the Monday), not by the meeting
    // day: said as a week, not as «Mittwoch · 26. Oktober» for a Monday
    // (walk in German, 23 October 2026).
    const byWeek =
      ctx.eventType === 'midweek' || ctx.eventType === 'weekend';
    contextBits.push(byWeek ? t('journal.weekOf', { date: day }) : day);
  }
  // A specific title beats a generic kind; fall back to the kind's own name.
  const kindName = ctx?.kind
    ? t(`parts.${ctx.kind}`, {
        defaultValue: t(`duties.types.${ctx.kind}`, {
          defaultValue: t(`cleaning.slots.${ctx.kind}`, {
            // A task the app raised, by its own name.
            defaultValue:
              entry.entityType === 'elder_task'
                ? t(`tasks.calendar.${ctx.kind}`, { defaultValue: '' })
                : '',
          }),
        }),
      })
    : '';
  // A sheet kept as sent, by the period it covers: «2025/26», «август 2026».
  const sheetName =
    entry.entityType === 'annual_report' && ctx?.title
      ? `${ctx.title}/${String(Number(ctx.title) + 1).slice(2)}`
      : entry.entityType === 'monthly_report' && ctx?.title
        ? dayjs(`${ctx.title}-01`).locale(language).format('MMMM YYYY')
        : '';
  const what = sheetName || readerTitle(ctx?.title) || kindName;
  if (what) contextBits.push(what);
  const contextLine = contextBits.join(' · ');

  // The tail is what makes a line answer a question instead of merely
  // recording one: whom it concerned, which fields moved, why it was refused.
  const parts: string[] = [];
  if (entry.subject?.name) {
    parts.push(t('journal.about', { name: entry.subject.name }));
  }
  if (entry.action === 'VIEW' && entry.detail?.document === 'S-21') {
    parts.push(t('journal.s21'));
  }
  if (entry.action === 'DENY' && typeof entry.detail?.reason === 'string') {
    parts.push(
      t(`journal.denyReason.${entry.detail.reason}`, {
        defaultValue: String(entry.detail.reason),
      }),
    );
  }
  if (entry.action === 'DOWNLOAD' && typeof entry.detail?.file === 'string') {
    parts.push(String(entry.detail.file));
  }
  if (typeof entry.detail?.count === 'number') {
    parts.push(t('journal.bulk', { count: entry.detail.count }));
  }
  // Each changed field on its own line, "label: was → now". A bare list of
  // field names answered nothing — the question is who replaced whom.
  //
  // Some changes are recorded WITHOUT their values on purpose: a publisher's
  // phone, e-mail and address are personal, so the journal keeps the fact that
  // they changed and never the numbers. Those entries carry no before and no
  // after at all, and rendering them through the usual path produced
  // "empty → empty", which reads as a fault rather than as discretion. They
  // now simply say the field was changed.
  const changes: {
    label: string;
    was: string | null;
    now: string | null;
    valuesKept: boolean;
  }[] = [];
  if (!entry.redacted) {
    for (const field of entry.changedFields) {
      const label = fieldLabel(entry.entityType, field, t, language);
      const hadWas = entry.before !== null && field in entry.before;
      const hadNow = entry.detail !== null && field in entry.detail;
      // A creation has no "before" — showing "empty → X" invents a history
      // that never existed. State the value it was given.
      const isCreate = entry.action === 'CREATE';
      changes.push({
        label,
        was: isCreate
          ? null
          : readValue(entry.before?.[field], names, t, language, {
              entityType: entry.entityType,
              field,
            }),
        now: readValue(entry.detail?.[field], names, t, language, {
          entityType: entry.entityType,
          field,
        }),
        valuesKept: hadWas || hadNow,
      });
    }

    // An event — a deletion, a view, a download — has no changed fields, but it
    // DOES carry the facts recorded at the time: which talk, for which date,
    // which speaker. They were being stored and never shown, so "deleted ·
    // Public talks" said nothing about what was deleted.
    if (entry.changedFields.length === 0 && entry.detail) {
      for (const [key, value] of Object.entries(entry.detail)) {
        // These are already spoken in the tail above; saying them twice reads
        // as a stutter.
        if (HANDLED_DETAIL.has(key)) continue;
        const shown = readValue(value, names, t, language, {
          entityType: entry.entityType,
          field: key,
        });
        if (shown === null || shown === t('journal.noValue')) continue;
        changes.push({
          label: t(`journal.fieldNames.${key}`, { defaultValue: key }),
          was: null,
          now: shown,
          valuesKept: true,
        });
      }
    }
  }

  return (
    <View style={[styles.row, !first && styles.rowDivided]}>
      <Text style={styles.time}>
        {dayjs(entry.occurredAt).locale(language).format('HH:mm')}
      </Text>

      <View style={[styles.dot, { backgroundColor: tone }]}>
        <Ionicons
          name={SECTION_ICON[entry.entityType] ?? 'ellipse-outline'}
          size={13}
          color="#fff"
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.sentence}>
          <Text style={styles.strong}>{actor}</Text>
          {` ${action} · ${section}`}
        </Text>
        {contextLine ? (
          <Text style={styles.context}>{contextLine}</Text>
        ) : null}
        {parts.length > 0 ? (
          <Text style={[styles.tail, notable && styles.tailNotable]}>
            {parts.join(' · ')}
          </Text>
        ) : null}
        {changes.map((c) => (
          <View key={c.label} style={styles.change}>
            <Text style={styles.changeLabel}>{c.label}</Text>
            {c.valuesKept ? (
              <Text style={styles.changeValue}>
                {c.was !== null ? (
                  <Text style={styles.was}>{c.was}</Text>
                ) : null}
                {c.was !== null && c.now !== null ? '  →  ' : ''}
                {c.now !== null ? (
                  <Text style={styles.now}>{c.now}</Text>
                ) : null}
              </Text>
            ) : (
              <Text style={styles.changedOnly}>
                {t('journal.changedNoValues')}
              </Text>
            )}
          </View>
        ))}
        {entry.redacted ? (
          <Text style={styles.redacted}>{t('journal.redacted')}</Text>
        ) : null}
        {/* Two conditions, both from someone who knows: the server says this
            entry can be put back, and the reader is someone who could have
            made the edit himself. The app no longer guesses at either. */}
        {canRevert && entry.canRevert ? (
          <Pressable onPress={onRevert} hitSlop={6} style={styles.revertBtn}>
            <Ionicons name="arrow-undo-outline" size={14} color="#0ea5e9" />
            <Text style={styles.revertText}>{t('journal.revert')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}


/**
 * «Вернуть как было» — shown before it is done, never instead of.
 *
 * Two things the reader needs and only the server knows: what exactly would
 * change, and whether anybody has edited the record since. The second is a
 * warning and not a wall — the elder reading a week-old entry usually knows
 * what stood there better than the app does, and that was Lionel's call.
 */
function RevertSheet({
  entry,
  onClose,
}: {
  entry: JournalEntry;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const plan = useQuery({
    queryKey: ['journal', entry.id, 'revert'],
    queryFn: () => journalApi.revertPlan(entry.id),
  });
  const apply = useMutation({
    meta: { inlineError: true },
    mutationFn: () => journalApi.revert(entry.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['journal'] });
      onClose();
    },
  });

  const shown = (v: unknown) =>
    v === null || v === undefined || v === ''
      ? t('journal.noValue')
      : String(v);

  return (
    <Sheet
      visible
      onClose={onClose}
      variant="bottom"
      title={t('journal.revert')}
      footer={
        plan.data?.supported ? (
          <Pressable
            style={styles.revertGo}
            disabled={apply.isPending}
            onPress={() => apply.mutate()}
          >
            <Text style={styles.revertGoText}>{t('journal.revertDo')}</Text>
          </Pressable>
        ) : null
      }
    >
      {plan.isLoading ? (
        <ActivityIndicator style={{ marginVertical: 20 }} />
      ) : plan.error ? (
        <Text style={styles.revertNo}>{extractErrorMessage(plan.error)}</Text>
      ) : !plan.data?.supported ? (
        <Text style={styles.revertNo}>
          {t(`journal.revertNo.${plan.data?.reason ?? 'entityNotSupported'}`, {
            defaultValue: t('journal.revertNo.entityNotSupported'),
          })}
        </Text>
      ) : (
        <>
          {plan.data.changedAfter > 0 ? (
            <View style={styles.revertWarn}>
              <Ionicons name="alert-circle" size={16} color="#b45309" />
              <Text style={styles.revertWarnText}>
                {t('journal.revertTouchedSince', {
                  count: plan.data.changedAfter,
                })}
              </Text>
            </View>
          ) : null}
          {plan.data.fields.map((f) => (
            <View key={f.field} style={styles.change}>
              <Text style={styles.changeLabel}>
                {t(`journal.fieldNames.${f.field}`, { defaultValue: f.field })}
              </Text>
              <Text style={styles.changeValue}>
                <Text style={styles.was}>{shown(f.from)}</Text>
                {'  →  '}
                <Text style={styles.now}>{shown(f.to)}</Text>
              </Text>
            </View>
          ))}
          {apply.isError ? (
            <Text style={styles.revertNo}>
              {extractErrorMessage(apply.error)}
            </Text>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  revertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  revertText: {
    fontSize: 12.5,
    color: '#0ea5e9',
    fontFamily: 'Manrope_600SemiBold',
  },
  revertWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  revertWarnText: { fontFamily: 'Manrope_400Regular', flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  revertNo: { fontFamily: 'Manrope_400Regular', fontSize: 13.5, color: '#64748b', lineHeight: 19 },
  revertGo: {
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  revertGoText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { paddingBottom: 40 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centreText: { textAlign: 'center', marginTop: 40 },
  muted: { fontFamily: 'Manrope_400Regular', color: '#64748b', fontSize: 14 },

  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filtersWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  chipText: {
    fontSize: 13,
    color: '#334155',
    fontFamily: 'Manrope_600SemiBold',
  },
  chipTextActive: { color: '#fff' },

  day: { marginTop: 8 },
  dayLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#94a3b8',
    fontFamily: 'Manrope_700Bold',
    marginLeft: 16,
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    borderRadius: 14,
    paddingHorizontal: 12,
  },

  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 11, gap: 10 },
  rowDivided: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  time: {
    width: 42,
    fontSize: 12,
    color: '#94a3b8',
    fontFamily: 'Manrope_600SemiBold',
    paddingTop: 2,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentence: { fontFamily: 'Manrope_400Regular', fontSize: 14.5, color: '#0f172a', lineHeight: 20 },
  strong: { fontFamily: 'Manrope_700Bold' },
  tail: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#64748b', marginTop: 2, lineHeight: 17 },
  // Which item — stated once, quietly, above the values that changed.
  context: {
    fontSize: 12.5,
    color: '#475569',
    marginTop: 2,
    lineHeight: 17,
    fontFamily: 'Manrope_600SemiBold',
  },
  // A refusal, a look at someone's card, a database leaving the server: the
  // reason this screen exists, so they carry their own weight.
  tailNotable: { color: '#b45309', fontFamily: 'Manrope_600SemiBold' },
  change: { marginTop: 4 },
  changeLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: 'Manrope_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  changeValue: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#334155' },
  // The old value is stated quietly and struck through; the new one carries
  // the weight, because that is what holds now.
  was: { color: '#94a3b8', textDecorationLine: 'line-through' },
  // Values deliberately not kept — say so plainly instead of showing blanks.
  changedOnly: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#64748b' },
  now: { color: '#0f172a', fontFamily: 'Manrope_600SemiBold' },
  redacted: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#94a3b8', marginTop: 2 },

  more: {
    marginTop: 16,
    marginHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  moreText: { color: '#0e7490', fontFamily: 'Manrope_700Bold', fontSize: 14 },
});
