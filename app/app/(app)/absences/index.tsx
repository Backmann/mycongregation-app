import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Absence, absencesApi } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import { LoadFailure } from '../../../components/LoadFailure';
import { failsScreen } from '../../../lib/screen-failure';
import { formatDay, formatDayRange } from '../../../lib/date-range';
import { addDays, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { absenceNote } from '../../../lib/absence-note';
import { clashLines, useAbsenceClashes } from '../../../lib/useAbsenceClashes';
import { FONT } from '../../../lib/typography';

/**
 * ABSENCES (28 October 2026, mockup «Отсутствия»).
 *
 *  - Who reads them all, reads them all here: the server has always given
 *    every absence to the admin, the elders and whoever holds a
 *    responsibility — they met them in every picker — while this screen
 *    showed such an elder only his own. Writing others' stays with the three
 *    responsibilities that manage absences (and the admin).
 *  - Now, soon, later — instead of one list where tomorrow and February
 *    looked alike; short dates, the year only when it is not this one.
 *  - On a wide screen, eight weeks at a glance: a bar per person.
 *  - The new thing: what each person is GIVEN on the days he is away. An
 *    absence entered after the part was given used to pass unseen.
 *  - A publisher's own list says his dates, not his name on every row.
 */

const WEEKS = 8;
type Kind = 'now' | 'school' | 'trip' | 'own';

function kindOf(a: Absence, today: string): Kind {
  if (a.startDate <= today && (a.endDate ?? a.startDate) >= today) return 'now';
  if (a.pioneerSchoolDutyId) return 'school';
  if (a.talkExchangeId) return 'trip';
  return 'own';
}

const KIND: Record<Kind, { icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string; bar: string; barText: string }> = {
  now: { icon: 'airplane', bg: '#ffe4e6', fg: '#be123c', bar: '#fecdd3', barText: '#9f1239' },
  school: { icon: 'school-outline', bg: '#ede9fe', fg: '#6d28d9', bar: '#ddd6fe', barText: '#5b21b6' },
  trip: { icon: 'mic-outline', bg: '#e0f2fe', fg: '#0369a1', bar: '#bae6fd', barText: '#075985' },
  own: { icon: 'airplane-outline', bg: '#e0f2fe', fg: '#0369a1', bar: '#bae6fd', barText: '#075985' },
};

const daysBetween = (a: string, b: string) =>
  Math.round((+new Date(`${b}T00:00:00`) - +new Date(`${a}T00:00:00`)) / 86400000);

export default function AbsencesListScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [past, setPast] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [width, setWidth] = useState(0);
  const { canManageAbsences, isAdmin, isElder, responsibilities } = usePermissions();
  const { myPublisherId } = useMyPublisher();
  // The server's own reading rule (absences.service canReadAll).
  const readsAll = isAdmin || isElder || canManageAbsences || responsibilities.size > 0;
  const mineOnly = !readsAll;
  const today = formatDateISO(new Date());

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    throwOnError: failsScreen,
    queryKey: ['absences', 'screen', past, showRemoved, mineOnly, myPublisherId],
    queryFn: () =>
      absencesApi.list({
        all: past,
        includeRemoved: showRemoved,
        ...(mineOnly && myPublisherId ? { publisherId: myPublisherId } : {}),
      }),
    enabled: !mineOnly || !!myPublisherId,
  });
  const rows = useMemo(() => data ?? [], [data]);
  const ended = (a: Absence) => (a.endDate ?? a.startDate) < today;
  const shown = past
    ? rows.filter(ended).sort((a, b) => b.startDate.localeCompare(a.startDate))
    : rows.filter((a) => !ended(a));
  const removedCount = rows.filter((a) => a.deletedAt).length;

  const { clashes } = useAbsenceClashes(
    past ? [] : shown.filter((a) => !a.deletedAt).map((a) => ({ key: a.id, publisherId: a.publisherId, startDate: a.startDate, endDate: a.endDate })),
  );

  const horizon = formatDateISO(addDays(new Date(), WEEKS * 7));
  const groups = past
    ? [{ key: 'past', title: null as string | null, items: shown }]
    : [
        { key: 'now', title: t('absences.groups.now'), items: shown.filter((a) => a.startDate <= today) },
        { key: 'soon', title: t('absences.groups.soon'), items: shown.filter((a) => a.startDate > today && a.startDate <= horizon) },
        { key: 'later', title: t('absences.groups.later'), items: shown.filter((a) => a.startDate > horizon) },
      ].filter((g) => g.items.length > 0);

  const nowCount = shown.filter((a) => !a.deletedAt && a.startDate <= today).length;
  const clashCount = [...clashes.values()].length;
  const wide = width >= 860;

  const card = (a: Absence) => {
    const k = kindOf(a, today);
    const end = a.endDate ?? a.startDate;
    const oneDay = end === a.startDate;
    const range = oneDay
      ? formatDay(a.startDate, lang, { weekday: 'short', month: 'short' })
      : formatDayRange(a.startDate, end, lang, { month: 'short' });
    const rel =
      past || a.deletedAt
        ? null
        : a.startDate <= today
          ? t('absences.rel.left', { count: daysBetween(today, end) + 1 })
          : t('absences.rel.in', { count: daysBetween(today, a.startDate) });
    const note = absenceNote(a, t);
    const lines = clashLines(clashes.get(a.id) ?? [], lang);
    return (
      <Pressable
        key={a.id}
        onPress={() => router.push(`/absences/${a.id}` as never)}
        style={({ pressed }) => [styles.card, a.deletedAt && styles.cardRemoved, pressed && styles.pressed]}
        testID={`absence-${a.id}`}
      >
        <View style={[styles.icon, { backgroundColor: KIND[k].bg }]}>
          <Ionicons name={KIND[k].icon} size={17} color={KIND[k].fg} />
        </View>
        <View style={styles.flex}>
          {/* One's own list says the dates; the name would repeat on every row. */}
          {mineOnly ? null : (
            <Text style={[styles.name, a.deletedAt && styles.struck]} numberOfLines={1}>
              {a.publisher?.displayName ?? '—'}
            </Text>
          )}
          <Text style={[mineOnly ? styles.rangeBig : styles.range, a.deletedAt && styles.struck]}>
            {range}
            {rel ? <Text style={styles.rel}>{`  ·  ${rel}`}</Text> : null}
          </Text>
          {note ? (
            <Text style={styles.note} numberOfLines={2}>
              {note}
            </Text>
          ) : null}
          {a.deletedAt ? <Text style={styles.removedTag}>{t('absences.deleted')}</Text> : null}
          {lines.length > 0 ? (
            <View style={styles.clash} testID={`absence-clash-${a.id}`}>
              <Ionicons name="warning-outline" size={14} color="#9a3412" />
              <Text style={styles.clashText}>
                {t(mineOnly ? 'absences.clash.mine' : 'absences.clash.other', { list: lines.join('; ') })}
              </Text>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
      </Pressable>
    );
  };

  if (error) return <LoadFailure error={error} onRetry={() => void refetch()} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <View style={styles.top}>
        <View style={styles.seg}>
          {([false, true] as const).map((p) => (
            <Pressable key={String(p)} onPress={() => setPast(p)} style={[styles.segItem, past === p && styles.segOn]} testID={`absences-${p ? 'past' : 'ahead'}`}>
              <Text style={[styles.segText, past === p && styles.segTextOn]}>
                {p ? t('absences.tabs.past') : t('absences.tabs.ahead')}
              </Text>
            </Pressable>
          ))}
        </View>
        {!past && !mineOnly && nowCount > 0 ? (
          <Text style={[styles.pill, styles.pillNow]}>{t('absences.pills.now', { count: nowCount })}</Text>
        ) : null}
        {!past && clashCount > 0 ? (
          <Text style={[styles.pill, styles.pillClash]} testID="absences-clash-count">
            {t('absences.pills.clashes', { count: clashCount })}
          </Text>
        ) : null}
      </View>

      {isLoading ? <ActivityIndicator style={{ marginTop: 32 }} /> : null}

      {!past && wide && !mineOnly && shown.length > 0 ? (
        <Timeline absences={shown.filter((a) => !a.deletedAt)} clashDays={clashes} today={today} lang={lang} />
      ) : null}

      {!isLoading && shown.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>{past ? t('absences.emptyPast') : t('absences.empty')}</Text>
        </View>
      ) : null}

      {groups.map((g) => (
        <View key={g.key}>
          {g.title ? <Text style={styles.groupTitle}>{g.title}</Text> : null}
          <View style={wide ? styles.grid : undefined}>
            {g.items.map((a) => (
              <View key={a.id} style={wide ? styles.gridCell : undefined}>
                {card(a)}
              </View>
            ))}
          </View>
        </View>
      ))}

      {/* For a publisher who comes here twice a year, a real button at the
          foot; those who keep everyone's have the plus in the header, and
          meet the button only on an empty list (decided 24 August). */}
      {!past && (mineOnly || shown.length === 0) ? (
        <Pressable onPress={() => router.push('/absences/new' as never)} style={({ pressed }) => [styles.add, pressed && styles.pressed]} testID="absences-add">
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addText}>{t('absences.add')}</Text>
        </Pressable>
      ) : null}

      {canManageAbsences ? (
        <Pressable onPress={() => setShowRemoved((v) => !v)} hitSlop={6} style={styles.quiet}>
          <Text style={styles.quietText}>
            {showRemoved ? t('absences.removed.hide') : t('absences.removed.show')}
            {showRemoved && removedCount ? ` · ${removedCount}` : ''}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

/**
 * Eight weeks at a glance: a row per person, a bar per absence — rose for now,
 * violet for the pioneer school, blue for the rest — and an orange dot on a day
 * he is given something.
 */
function Timeline({
  absences,
  clashDays,
  today,
  lang,
}: {
  absences: Absence[];
  clashDays: Map<string, { date: string }[]>;
  today: string;
  lang: string;
}) {
  const { t } = useTranslation();
  const from = formatDateISO(startOfWeekMonday(new Date()));
  const days = WEEKS * 7;
  const to = formatDateISO(addDays(new Date(`${from}T00:00:00`), days - 1));
  const inWindow = absences.filter((a) => a.startDate <= to && (a.endDate ?? a.startDate) >= from);
  const people = new Map<string, { name: string; items: Absence[] }>();
  for (const a of inWindow) {
    const p = people.get(a.publisherId) ?? { name: a.publisher?.displayName ?? '—', items: [] };
    p.items.push(a);
    people.set(a.publisherId, p);
  }
  if (people.size === 0) return null;
  const pos = (iso: string) => Math.max(0, Math.min(days, daysBetween(from, iso)));
  const pct = (n: number) => `${(n / days) * 100}%` as const;
  const short = (name: string) => {
    const [last, first] = name.split(/\s+/);
    return first ? `${last} ${first[0]}.` : last;
  };
  const todayAt = pos(today);
  return (
    <View style={styles.tl} testID="absences-timeline">
      <View style={styles.tlRow}>
        <Text style={[styles.tlName, styles.tlHead]}>{t('absences.timeline.who')}</Text>
        <View style={styles.tlTrack}>
          {Array.from({ length: WEEKS }, (_, w) => (
            <Text key={w} style={[styles.tlWeek, w === 0 && styles.tlWeekNow]}>
              {formatDay(formatDateISO(addDays(new Date(`${from}T00:00:00`), w * 7)), lang, { month: 'short' })}
            </Text>
          ))}
        </View>
      </View>
      {[...people.entries()].map(([pid, p]) => (
        <View key={pid} style={[styles.tlRow, styles.tlLine]}>
          <Text style={styles.tlName} numberOfLines={1}>
            {short(p.name)}
          </Text>
          <View style={styles.tlTrack}>
            {Array.from({ length: WEEKS }, (_, w) => (
              <View key={w} style={styles.tlCell} />
            ))}
            <View style={[styles.tlToday, { left: pct(todayAt + 0.5) }]} />
            {p.items.map((a) => {
              const k = kindOf(a, today);
              const s = pos(a.startDate);
              const e = pos(a.endDate ?? a.startDate) + 1;
              const note = a.pioneerSchoolDutyId ? '' : a.note?.trim() ?? '';
              return (
                <View key={a.id} style={[styles.bar, { left: pct(s), width: pct(Math.max(1, e - s)), backgroundColor: KIND[k].bar }]}>
                  {e - s >= 5 && note ? (
                    <Text style={[styles.barText, { color: KIND[k].barText }]} numberOfLines={1}>
                      {note}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {p.items.flatMap((a) =>
              (clashDays.get(a.id) ?? []).map((c, i) => (
                <View key={`${a.id}${i}`} style={[styles.dot, { left: pct(pos(c.date) + 0.5) }]} />
              )),
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const INK = '#0f172a';
const SOFT = '#64748b';
const LINE = '#e2e8f0';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 12, paddingBottom: 40, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.8 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 },
  seg: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, borderRadius: 12, padding: 3 },
  segItem: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9 },
  segOn: { backgroundColor: '#e0f2fe' },
  segText: { fontFamily: FONT.bold, fontSize: 13.5, color: SOFT },
  segTextOn: { color: '#0369a1' },
  pill: {
    fontFamily: FONT.bold,
    fontSize: 12.5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pillNow: { color: '#be123c', backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  pillClash: { color: '#9a3412', backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  groupTitle: {
    fontFamily: FONT.extrabold,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: SOFT,
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCell: { width: '49%' },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    padding: 12,
    marginBottom: 10,
  },
  cardRemoved: { opacity: 0.6 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: FONT.extrabold, fontSize: 15, color: INK },
  range: { fontFamily: FONT.bold, fontSize: 13.5, color: '#0369a1', marginTop: 2 },
  rangeBig: { fontFamily: FONT.extrabold, fontSize: 15.5, color: INK },
  rel: { fontFamily: FONT.semibold, color: '#94a3b8' },
  struck: { textDecorationLine: 'line-through', color: '#94a3b8' },
  note: { fontFamily: FONT.medium, fontSize: 13, color: SOFT, marginTop: 2 },
  removedTag: { fontFamily: FONT.bold, fontSize: 11.5, color: '#92400e', marginTop: 4 },
  clash: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    backgroundColor: '#fff7ed',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  clashText: { flex: 1, fontFamily: FONT.bold, fontSize: 12.5, color: '#9a3412', lineHeight: 18 },
  emptyBox: { alignItems: 'center', marginTop: 32 },
  empty: { fontFamily: FONT.regular, textAlign: 'center', color: SOFT },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0e7490',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
    alignSelf: 'stretch',
  },
  addText: { fontFamily: FONT.extrabold, fontSize: 14.5, color: '#fff' },
  quiet: { alignSelf: 'center', paddingVertical: 12 },
  quietText: { fontFamily: FONT.medium, fontSize: 12.5, color: '#94a3b8' },
  tl: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: LINE, overflow: 'hidden', marginTop: 8, marginBottom: 4 },
  tlRow: { flexDirection: 'row', alignItems: 'center' },
  tlLine: { borderTopWidth: 1, borderTopColor: '#f1f5f9', height: 38 },
  tlName: { width: 150, paddingLeft: 14, fontFamily: FONT.bold, fontSize: 13, color: INK },
  tlHead: { fontFamily: FONT.bold, fontSize: 11, color: SOFT },
  tlTrack: { flex: 1, flexDirection: 'row', alignSelf: 'stretch', position: 'relative' },
  tlWeek: { flex: 1, textAlign: 'center', paddingVertical: 8, fontFamily: FONT.extrabold, fontSize: 11, color: SOFT },
  tlWeekNow: { color: '#0e7490', backgroundColor: '#ecfeff' },
  tlCell: { flex: 1, borderLeftWidth: 1, borderLeftColor: '#f8fafc' },
  tlToday: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: '#99f6e4' },
  bar: { position: 'absolute', top: 9, height: 20, borderRadius: 6, justifyContent: 'center', paddingHorizontal: 6, overflow: 'hidden' },
  barText: { fontFamily: FONT.bold, fontSize: 11 },
  dot: { position: 'absolute', top: 5, width: 10, height: 10, marginLeft: -5, borderRadius: 5, backgroundColor: '#f97316', borderWidth: 2, borderColor: '#fff' },
});
