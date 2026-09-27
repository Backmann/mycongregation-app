import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import type { MeetingSettingsVersion, SpecialEvent } from '../lib/api';
import { effectiveVersionFor } from '../lib/meeting-schedule';
import {
  addDaysISO,
  daysUntil,
  KIND_LOOK,
  kindOf,
  mondayOfISO,
  visitMidweekDay,
} from '../lib/event-view';

/**
 * The event's page, by kind (27 September).
 *
 * A visit and a convention are not the same thing with different words: a
 * visit rearranges one week of the congregation's own meetings, a
 * convention takes the week away and sends everyone elsewhere. The page
 * says, for each, what people need to know — for a visit, what happens at
 * each meeting of the week; for a convention, its days, where it is, and
 * which of our meetings it takes.
 */

const cap = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);

export function EventHeader({ event, today }: { event: SpecialEvent; today: string }) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const kind = kindOf({ kind: 'event', key: '', date: event.date, end: event.endDate ?? event.date, event });
  const look = KIND_LOOK[kind];
  const end = event.endDate ?? event.date;
  const n = daysUntil(today, event.date);
  const when =
    end < today
      ? t('specialEvents.page.wasAgo', { date: dayjs(event.date).locale(loc).format('D MMMM YYYY') })
      : event.date <= today
        ? t('specialEvents.list.now')
        : n === 1
          ? t('specialEvents.list.tomorrow')
          : n < 14
            ? t('specialEvents.list.inDays', { count: n })
            : n < 60
              ? t('specialEvents.page.inWeeks', { count: Math.round(n / 7) })
              : t('specialEvents.page.inMonths', { count: Math.round(n / 30) });
  const coName = [event.coFirstName, event.coLastName].filter(Boolean).join(' ');
  const isVisit = kind === 'circuit_overseer_visit';
  const title = isVisit && coName ? coName : event.title;
  const d = (iso: string, f: string) => dayjs(iso).locale(loc).format(f);
  const range = end !== event.date;
  const sameMonth = event.date.slice(0, 7) === end.slice(0, 7);
  const dateText = range
    ? sameMonth
      ? `${d(event.date, 'D')}–${d(end, 'D MMMM YYYY')}`
      : `${d(event.date, 'D MMMM')} – ${d(end, 'D MMMM YYYY')}`
    : cap(d(event.date, 'dddd, D MMMM YYYY'));
  const rangeDays = range ? `${d(event.date, 'dddd')} – ${d(end, 'dddd')}` : null;
  const time = event.time ? `${event.time}${event.timeEnd ? `–${event.timeEnd}` : ''}` : null;
  return (
    <View style={styles.header}>
      <View style={styles.kindRow}>
        <View style={[styles.kindIcon, { backgroundColor: look.soft }]}>
          <Ionicons name={look.icon as never} size={20} color={look.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kindLabel, { color: look.color }]}>
            {kind === 'other' ? t('specialEvents.list.kindOther') : t(`specialEvents.types.${kind}`)}
          </Text>
          <Text style={styles.when}>{when}</Text>
        </View>
      </View>
      <Text style={styles.h1}>{title}</Text>
      {isVisit && event.coWifeName ? (
        <Text style={styles.sub}>{t('specialEvents.page.withWife', { name: event.coWifeName })}</Text>
      ) : null}
      <Text style={styles.dateLine}>
        <Text style={styles.dateStrong}>{dateText}</Text>
        {rangeDays ? <Text style={styles.dateSoft}>{` · ${rangeDays}`}</Text> : null}
        {/* A multi-day convention says its hours day by day below. */}
        {time && !isVisit && !(range && (kind === 'regional_convention' || kind === 'circuit_assembly')) ? (
          <Text style={styles.dateSoft}>{` · ${time}`}</Text>
        ) : null}
      </Text>
    </View>
  );
}

/** A filled button: the one thing the page is most often opened for. */
export function PrimaryAction({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon as never} size={18} color="#fff" />
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {children}
    </View>
  );
}

/** What changes in the visit's week, meeting by meeting. */
export function VisitWeek({
  event,
  versions,
}: {
  event: SpecialEvent;
  versions: MeetingSettingsVersion[] | undefined;
}) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const week = mondayOfISO(event.date);
  const v = effectiveVersionFor(versions, week);
  const midweek = visitMidweekDay(event);
  const weekend = v ? addDaysISO(week, v.weekendDow - 1) : null;
  const usualMidweekDow = v?.midweekDow ?? null;
  const moved = usualMidweekDow != null && usualMidweekDow !== (event.coMidweekDow ?? 2);
  const coName = [event.coFirstName, event.coLastName].filter(Boolean).join(' ');
  const day = (iso: string) => cap(dayjs(iso).locale(loc).format('dddd, D MMMM'));
  return (
    <Section title={t('specialEvents.page.visitWeek')}>
      <View style={styles.card}>
        <View style={styles.meeting}>
          <View style={styles.meetingHead}>
            <Text style={[styles.meetingKind, { color: '#1d4ed8' }]}>
              {t('specialEvents.page.midweek')}
            </Text>
            {moved ? (
              <Text style={styles.meetingUsual}>
                {t('specialEvents.page.usuallyOn', {
                  day: t(`specialEvents.page.dowOn.${usualMidweekDow}`),
                })}
              </Text>
            ) : null}
          </View>
          <Text style={styles.meetingDay}>
            {day(midweek)}
            {v?.midweekTime ? ` · ${v.midweekTime}` : ''}
          </Text>
          <Text style={styles.change}>
            <Text style={styles.struck}>{t('specialEvents.page.cbs')}</Text>
            {'  →  '}
            <Text style={styles.changeStrong}>{t('specialEvents.page.serviceTalk')}</Text>
          </Text>
          <Text style={styles.changeSoft}>{t('specialEvents.page.songByCo')}</Text>
        </View>
        {weekend ? (
          <View style={[styles.meeting, styles.meetingBorder]}>
            <Text style={[styles.meetingKind, { color: '#7c3aed' }]}>
              {t('specialEvents.page.weekend')}
            </Text>
            <Text style={styles.meetingDay}>
              {day(weekend)}
              {v?.weekendTime ? ` · ${v.weekendTime}` : ''}
            </Text>
            <Text style={styles.change}>
              {t('specialEvents.page.publicTalk')}
              {' — '}
              <Text style={styles.changeStrong}>{coName || t('specialEvents.page.theCo')}</Text>
            </Text>
            <Text style={styles.change}>
              {t('specialEvents.page.watchtower')}
              {' — '}
              <Text style={styles.changeStrong}>{t('specialEvents.page.wtShort')}</Text>
            </Text>
            <Text style={styles.change}>
              {t('specialEvents.page.atTheEnd')}
              {' — '}
              <Text style={styles.changeStrong}>{t('specialEvents.page.concludingTalk')}</Text>
            </Text>
          </View>
        ) : null}
      </View>
    </Section>
  );
}

/** A visit's own tools: the schedule of the week, with its printable sheet. */
export function VisitTools({ canView }: { canView: boolean }) {
  const { t } = useTranslation();
  if (!canView) return null;
  return (
    <Section title={t('specialEvents.page.duringVisit')}>
      <Pressable
        onPress={() => router.push('/cart/co-schedule' as never)}
        style={({ pressed }) => [styles.card, styles.linkRow, pressed && styles.pressed]}
      >
        <Ionicons name="navigate-outline" size={20} color="#15803d" />
        <View style={{ flex: 1 }}>
          <Text style={styles.linkTitle}>{t('specialEvents.page.coSchedule')}</Text>
          <Text style={styles.linkHint}>{t('specialEvents.page.coScheduleHint')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      </Pressable>
    </Section>
  );
}

/** Earlier visits — who came and when; the history the next one is planned by. */
export function PastVisits({
  events,
  current,
  today,
}: {
  events: SpecialEvent[] | undefined;
  current: SpecialEvent;
  today: string;
}) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const past = (events ?? [])
    .filter(
      (e) =>
        e.type === 'circuit_overseer_visit' &&
        !e.deletedAt &&
        e.id !== current.id &&
        (e.endDate ?? e.date) < today,
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  if (past.length === 0) return null;
  return (
    <Section title={t('specialEvents.page.pastVisits')}>
      <View style={styles.card}>
        {past.map((e, i) => {
          const end = e.endDate ?? e.date;
          const sameMonth = e.date.slice(0, 7) === end.slice(0, 7);
          const d = (iso: string, f: string) => dayjs(iso).locale(loc).format(f);
          const dates =
            end === e.date
              ? d(e.date, 'D MMMM YYYY')
              : sameMonth
                ? `${d(e.date, 'D')}–${d(end, 'D MMMM YYYY')}`
                : `${d(e.date, 'D MMMM')} – ${d(end, 'D MMMM YYYY')}`;
          const name = [e.coFirstName, e.coLastName].filter(Boolean).join(' ');
          return (
            <Pressable
              key={e.id}
              onPress={() => router.push(`/special-events/${e.id}` as never)}
              style={({ pressed }) => [styles.linkRow, i > 0 && styles.meetingBorder, pressed && styles.pressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>{dates}</Text>
                {name ? <Text style={styles.linkHint}>{name}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
}

/** A convention: its days, where it is, and which of our meetings it takes. */
export function CongressSections({
  event,
  versions,
}: {
  event: SpecialEvent;
  versions: MeetingSettingsVersion[] | undefined;
}) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const end = event.endDate ?? event.date;
  const days: string[] = [];
  for (let d = event.date; d <= end && days.length < 7; d = addDaysISO(d, 1)) days.push(d);
  const from = mondayOfISO(event.date);
  const to = addDaysISO(mondayOfISO(end), 6);
  const d = (iso: string, f: string) => dayjs(iso).locale(loc).format(f);
  const range =
    from.slice(0, 7) === to.slice(0, 7)
      ? `${d(from, 'D')}–${d(to, 'D MMMM')}`
      : `${d(from, 'D MMMM')} – ${d(to, 'D MMMM')}`;
  // The meetings the week would have held — named, so nobody wonders about
  // «the Wednesday one».
  const lost: string[] = [];
  for (let w = from; w <= to; w = addDaysISO(w, 7)) {
    const v = effectiveVersionFor(versions, w);
    if (!v) continue;
    lost.push(d(addDaysISO(w, v.midweekDow - 1), 'dddd, D'));
    lost.push(d(addDaysISO(w, v.weekendDow - 1), 'dddd, D'));
  }
  const time = event.time ? t('specialEvents.page.from', { time: event.time }) : null;
  return (
    <>
      {days.length > 1 ? (
        <Section title={t('specialEvents.page.days')}>
          <View style={styles.card}>
            {days.map((x, i) => (
              <View key={x} style={[styles.dayRow, i > 0 && styles.meetingBorder]}>
                <View style={styles.dayCol}>
                  <Text style={styles.dayNum}>{d(x, 'D')}</Text>
                  <Text style={styles.dayDow}>{d(x, 'dd')}</Text>
                </View>
                <Text style={styles.dayText}>
                  {cap(d(x, 'dddd'))}
                  {time ? ` · ${time}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}
      {event.address || event.mapUrl ? (
        <Section title={t('specialEvents.page.where')}>
          <View style={[styles.card, { padding: 14, gap: 10 }]}>
            {event.address ? (
              <View style={styles.whereRow}>
                <Ionicons name="location-outline" size={20} color="#b45309" />
                <Text style={styles.whereText}>{event.address}</Text>
              </View>
            ) : null}
            {event.mapUrl ? (
              <Pressable style={styles.mapBtn} onPress={() => Linking.openURL(event.mapUrl!)}>
                <Text style={styles.mapText}>{t('specialEvents.actions.openMap')}</Text>
              </Pressable>
            ) : null}
          </View>
        </Section>
      ) : null}
      <Section title={t('specialEvents.page.inCongregation')}>
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>{t('specialEvents.page.noMeetingsWeek', { range })}</Text>
          {lost.length > 0 ? (
            <Text style={styles.warnText}>
              {t('specialEvents.page.neither', { days: lost.join(', ') })}
            </Text>
          ) : null}
        </View>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  kindIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  kindLabel: { fontSize: 14, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  when: { fontSize: 13, color: '#64748b' },
  h1: { fontSize: 26, fontFamily: 'Manrope_800ExtraBold', fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 16, fontFamily: 'Manrope_600SemiBold', fontWeight: '600', color: '#334155' },
  dateLine: { marginTop: 6, fontSize: 16 },
  dateStrong: { fontFamily: 'Manrope_700Bold', fontWeight: '700', color: '#0f172a' },
  dateSoft: { color: '#64748b' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0e7490',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 16,
  },
  primaryText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  section: { marginTop: 22 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  pressed: { backgroundColor: '#f8fafc' },
  meeting: { padding: 14, gap: 4 },
  meetingBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  meetingHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meetingKind: {
    fontSize: 12,
    fontFamily: 'Manrope_800ExtraBold',
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  meetingUsual: { fontSize: 12, color: '#64748b' },
  meetingDay: { fontSize: 18, fontFamily: 'Manrope_800ExtraBold', fontWeight: '800', color: '#0f172a' },
  change: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  changeStrong: { color: '#0f172a', fontFamily: 'Manrope_700Bold', fontWeight: '700' },
  changeSoft: { fontSize: 14, color: '#475569', lineHeight: 20 },
  struck: { textDecorationLine: 'line-through', color: '#94a3b8' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  linkTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: '#0f172a' },
  linkHint: { fontSize: 13, color: '#64748b', marginTop: 2 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10 },
  dayCol: { width: 36, alignItems: 'center' },
  dayNum: { fontSize: 20, fontFamily: 'Manrope_800ExtraBold', fontWeight: '800', color: '#0f172a' },
  dayDow: { fontSize: 11, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  dayText: { fontSize: 15, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: '#0f172a' },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  whereText: { flex: 1, fontSize: 16, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: '#0f172a' },
  mapBtn: {
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  mapText: { fontSize: 14, fontFamily: 'Manrope_700Bold', fontWeight: '700', color: '#92400e' },
  warnBox: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 6,
  },
  warnTitle: { fontSize: 16, fontFamily: 'Manrope_800ExtraBold', fontWeight: '800', color: '#92400e' },
  warnText: { fontSize: 14, color: '#92400e', lineHeight: 20 },
});
