import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { JournalEntry, journalApi } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

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
  congregation: '#64748b',
  backup: '#64748b',
  User: '#64748b',
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
  congregation: 'settings-outline',
  backup: 'shield-checkmark-outline',
  User: 'key-outline',
};

/**
 * The three actions that are not ordinary edits. A refusal, a look at somebody
 * else's record and a copy of the database leaving the server are the entries
 * a person opens this screen for, and they must not sit indistinguishable
 * between "added" and "removed".
 */
const NOTABLE = new Set(['DENY', 'VIEW', 'DOWNLOAD']);

const FILTERS = [
  'assignment',
  'duty',
  'cleaning',
  'publisher',
  'service_report',
  'field_service_meeting',
  'talk_exchange',
  'congregation',
  'backup',
] as const;

export default function JournalScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [section, setSection] = useState<string | null>(null);

  const query = useInfiniteQuery({
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

  if (user?.role !== 'admin') {
    return (
      <View style={styles.centre}>
        <Text style={styles.muted}>{t('journal.noAccess')}</Text>
      </View>
    );
  }

  const dayLabel = (key: string) => {
    const day = dayjs(key);
    const today = dayjs().startOf('day');
    if (day.isSame(today, 'day')) return t('journal.today');
    if (day.isSame(today.subtract(1, 'day'), 'day')) return t('journal.yesterday');
    return day.locale(i18n.language).format('dd, D MMMM YYYY');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
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
                />
              ))}
            </View>
          </View>
        ))
      )}

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
): string | null {
  if (v === null || v === undefined || v === '') return t('journal.noValue');
  if (typeof v === 'string') return names[v] ?? v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function Row({
  entry,
  first,
  language,
  names,
}: {
  entry: JournalEntry;
  first: boolean;
  language: string;
  names: Record<string, string>;
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
  const changes: { label: string; was: string | null; now: string | null }[] =
    [];
  if (!entry.redacted) {
    for (const field of entry.changedFields) {
      const label = t(`journal.fieldNames.${field}`, { defaultValue: field });
      changes.push({
        label,
        was: readValue(entry.before?.[field], names, t),
        now: readValue(entry.detail?.[field], names, t),
      });
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
        {parts.length > 0 ? (
          <Text style={[styles.tail, notable && styles.tailNotable]}>
            {parts.join(' · ')}
          </Text>
        ) : null}
        {changes.map((c) => (
          <View key={c.label} style={styles.change}>
            <Text style={styles.changeLabel}>{c.label}</Text>
            <Text style={styles.changeValue}>
              {c.was !== null ? <Text style={styles.was}>{c.was}</Text> : null}
              {c.was !== null && c.now !== null ? '  →  ' : ''}
              {c.now !== null ? <Text style={styles.now}>{c.now}</Text> : null}
            </Text>
          </View>
        ))}
        {entry.redacted ? (
          <Text style={styles.redacted}>{t('journal.redacted')}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { paddingBottom: 40 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centreText: { textAlign: 'center', marginTop: 40 },
  muted: { color: '#64748b', fontSize: 14 },

  filters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
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
  sentence: { fontSize: 14.5, color: '#0f172a', lineHeight: 20 },
  strong: { fontFamily: 'Manrope_700Bold' },
  tail: { fontSize: 12.5, color: '#64748b', marginTop: 2, lineHeight: 17 },
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
  changeValue: { fontSize: 13, lineHeight: 19, color: '#334155' },
  // The old value is stated quietly and struck through; the new one carries
  // the weight, because that is what holds now.
  was: { color: '#94a3b8', textDecorationLine: 'line-through' },
  now: { color: '#0f172a', fontFamily: 'Manrope_600SemiBold' },
  redacted: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 },

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
