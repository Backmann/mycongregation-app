import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  Absence,
  absencesApi,
  Assignment,
  assignmentsApi,
  fieldServiceApi,
  FieldServiceMeeting,
  meApi,
  MeetingSettingsVersion,
  meetingSettingsApi,
  MyAssignmentItem,
  Publisher,
  publishersApi,
  SpecialEvent,
  specialEventsApi,
} from '../../../lib/api';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { addDays, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { getPartLabel } from '../../../lib/parts';
import { usePermissions } from '../../../lib/permissions';
import { useAuth } from '../../../lib/auth';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import {
  refineMyTasks,
  taskMeta,
  taskTitle,
} from '../../../lib/my-tasks';

const pad = (n: number) => String(n).padStart(2, '0');
const ddmm = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;

function rangeLabel(start: Date, end: Date, loc: string): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const startStr = start.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const endStr = end.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${startStr} \u2013 ${endStr}`;
}

function absenceRangeLabel(a: Absence, loc: string): string {
  const start = new Date(`${a.startDate}T00:00:00`);
  if (!a.endDate) {
    return start.toLocaleDateString(loc, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  const end = new Date(`${a.endDate}T00:00:00`);
  const sameYear = start.getFullYear() === end.getFullYear();
  const s = start.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const e = end.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${s} \u2013 ${e}`;
}

type NextMeeting = {
  kind: 'midweek' | 'weekend';
  date: Date;
  dateISO: string;
  weekStartISO: string;
  time: string;
  address: string;
};

/** Earliest upcoming meeting (today counts), looking up to 2 weeks ahead. */
function computeNextMeeting(
  versions: MeetingSettingsVersion[],
  todayISO: string,
): NextMeeting | null {
  const today = new Date(`${todayISO}T00:00:00`);
  const thisMonday = startOfWeekMonday(today);
  const candidates: NextMeeting[] = [];
  for (let w = 0; w < 2; w++) {
    const monday = addDays(thisMonday, w * 7);
    const weekStartISO = formatDateISO(monday);
    const v = effectiveVersionFor(versions, weekStartISO);
    if (!v) continue;
    for (const kind of ['midweek', 'weekend'] as const) {
      const dow = kind === 'midweek' ? v.midweekDow : v.weekendDow;
      const time = kind === 'midweek' ? v.midweekTime : v.weekendTime;
      if (!dow) continue;
      const date = addDays(monday, dow - 1);
      const dateISO = formatDateISO(date);
      if (dateISO < todayISO) continue;
      candidates.push({
        kind,
        date,
        dateISO,
        weekStartISO,
        time,
        address: v.address,
      });
    }
  }
  candidates.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return candidates[0] ?? null;
}

function NextMeetingCard({ myPublisherId }: { myPublisherId: string | null }) {
  const { t, i18n } = useTranslation();
  const todayISO = formatDateISO(new Date());

  const { data: overview, isLoading } = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 5 * 60 * 1000,
  });

  const next = overview
    ? computeNextMeeting(overview.versions, todayISO)
    : null;

  const { data: weekAssignments } = useQuery({
    queryKey: ['assignments', 'home-week', next?.weekStartISO, myPublisherId],
    queryFn: () =>
      assignmentsApi.list({
        weekStart: next!.weekStartISO,
        weekEnd: next!.weekStartISO,
        limit: 200,
      }),
    enabled: !!next && !!myPublisherId,
    retry: false,
    staleTime: 60 * 1000,
  });
  const myParts: Assignment[] = (weekAssignments?.data ?? []).filter(
    (a) =>
      a.status !== 'cancelled' &&
      !a.deletedAt &&
      (a.publisherId === myPublisherId ||
        a.assistantPublisherId === myPublisherId),
  );

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator style={{ paddingVertical: 16 }} />
      </View>
    );
  }
  if (!next) return null;

  const dateLabel = next.date.toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <View style={[styles.card, { paddingVertical: 14 }]}>
      <View style={styles.meetingHeader}>
        <Ionicons name="calendar" size={18} color="#0ea5e9" />
        <Text style={styles.meetingKind}>
          {t(`home.meeting.${next.kind}`)}
        </Text>
      </View>
      <Text style={styles.meetingDate}>{dateLabel}</Text>
      <Text style={styles.meetingMeta}>
        {next.time}
        {next.address ? ` · ${next.address}` : ''}
      </Text>
      {myPublisherId ? (
        myParts.length > 0 ? (
          <View style={styles.partsBox}>
            <Text style={styles.partsTitle}>{t('home.meeting.myParts')}</Text>
            {myParts.map((a) => (
              <Text key={a.id} style={styles.partRow} numberOfLines={1}>
                {'\u2022 '}
                {a.partTitle || getPartLabel(a.partKey)}
                {a.assistantPublisherId === myPublisherId
                  ? ` (${t('home.meeting.asAssistant')})`
                  : ''}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.noParts}>{t('home.meeting.noParts')}</Text>
        )
      ) : null}
    </View>
  );
}

function NextFieldServiceCard() {
  const { t, i18n } = useTranslation();
  const todayISO = formatDateISO(new Date());
  const thisMonday = formatDateISO(startOfWeekMonday(new Date()));
  const nextMonday = formatDateISO(
    addDays(startOfWeekMonday(new Date()), 7),
  );

  const weekA = useQuery({
    queryKey: ['field-service', thisMonday],
    queryFn: () => fieldServiceApi.list({ weekStart: thisMonday }),
    staleTime: 60 * 1000,
  });
  const weekB = useQuery({
    queryKey: ['field-service', nextMonday],
    queryFn: () => fieldServiceApi.list({ weekStart: nextMonday }),
    staleTime: 60 * 1000,
  });
  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all-for-schedule'],
    queryFn: () => publishersApi.list({ limit: 200 }),
    staleTime: 5 * 60 * 1000,
  });
  const publishersById = new Map<string, Publisher>(
    (publishersQuery.data?.data ?? []).map((p) => [p.id, p]),
  );

  type Dated = { m: FieldServiceMeeting; dateISO: string };
  const dated: Dated[] = [];
  for (const m of [...(weekA.data ?? []), ...(weekB.data ?? [])]) {
    const dateISO = formatDateISO(
      addDays(new Date(`${m.weekStartDate}T00:00:00`), m.dayOfWeek - 1),
    );
    if (dateISO < todayISO) continue;
    dated.push({ m, dateISO });
  }
  dated.sort(
    (a, b) =>
      a.dateISO.localeCompare(b.dateISO) ||
      a.m.startTime.localeCompare(b.m.startTime),
  );
  const next = dated[0];
  if (!next) return null;

  const m = next.m;
  const conductor = m.conductorPublisherId
    ? publishersById.get(m.conductorPublisherId) ?? null
    : null;
  const dateLabel = new Date(`${next.dateISO}T00:00:00`).toLocaleDateString(
    i18n.language,
    { weekday: 'long', day: 'numeric', month: 'long' },
  );

  return (
    <>
      <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>
        {t('home.nextFieldService')}
      </Text>
      <View style={[styles.card, { paddingVertical: 14 }]}>
        <View style={styles.meetingHeader}>
          <Ionicons name="walk-outline" size={18} color="#0ea5e9" />
          <Text style={styles.meetingKind}>
            {t(`fieldService.days.${m.dayOfWeek}`)} · {m.startTime}
          </Text>
        </View>
        <Text style={styles.meetingDate}>{dateLabel}</Text>
        <Text style={styles.meetingMeta}>{m.address}</Text>
        <Text
          style={[styles.meetingMeta, !conductor && styles.fsUnassigned]}
        >
          {t('fieldService.conductor')}:{' '}
          {conductor ? conductor.displayName : t('fieldService.unassigned')}
        </Text>
        {!!m.topic && <Text style={styles.fsTopic}>{m.topic}</Text>}
        {!!m.sourceUrl && (
          <Pressable
            onPress={() =>
              Linking.openURL(m.sourceUrl as string).catch(() => {})
            }
            hitSlop={6}
          >
            <Text style={styles.fsLink} numberOfLines={1}>
              {t('fieldService.openLink')}
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

function EventHomeRow({
  event: e,
  first,
}: {
  event: SpecialEvent;
  first: boolean;
}) {
  const { t, i18n } = useTranslation();
  const start = new Date(`${e.date}T00:00:00`);
  const end = e.endDate ? new Date(`${e.endDate}T00:00:00`) : null;
  const typeLabel = e.type
    ? t(`specialEvents.types.${e.type}`, e.type)
    : null;
  const meta = [e.time, e.address].filter(Boolean).join(' · ');
  return (
    <Pressable
      style={[styles.eventRow, !first && styles.eventRowBorder]}
      onPress={() => router.push(`/special-events/${e.id}` as any)}
    >
      {end ? (
        <View style={[styles.evBadge, styles.evBadgeRange]}>
          <Text style={styles.evRangeNum}>{ddmm(start)}</Text>
          <Ionicons name="arrow-down" size={11} color="#0369a1" />
          <Text style={styles.evRangeNum}>{ddmm(end)}</Text>
        </View>
      ) : (
        <View style={styles.evBadge}>
          <Text style={styles.evDay}>
            {start.toLocaleDateString(i18n.language, { day: '2-digit' })}
          </Text>
          <Text style={styles.evMon}>
            {start.toLocaleDateString(i18n.language, { month: 'short' })}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 10 }}>
        {typeLabel ? (
          <Text style={styles.evTypeTag}>{typeLabel}</Text>
        ) : null}
        <Text style={styles.eventTitle} numberOfLines={2}>
          {e.title}
        </Text>
        {end ? (
          <Text style={styles.evRange}>
            {rangeLabel(start, end, i18n.language)}
          </Text>
        ) : null}
        {meta ? (
          <Text style={styles.evMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {e.note ? (
          <Text style={styles.evMeta} numberOfLines={1}>
            {e.note}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}

const TASK_ICONS: Record<MyAssignmentItem['kind'], keyof typeof Ionicons.glyphMap> = {
  meeting: 'calendar-outline',
  duty: 'construct-outline',
  cleaning: 'sparkles-outline',
  cart: 'cart-outline',
  field_service: 'walk-outline',
};

function MyTasksCard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const todayISO = formatDateISO(new Date());

  const { data: overview } = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 5 * 60 * 1000,
  });
  const versions = overview?.versions ?? [];

  const { data } = useQuery({
    queryKey: ['me', 'assignments'],
    queryFn: () => meApi.assignments(),
    enabled: !!user,
    retry: false,
    staleTime: 60 * 1000,
  });

  if (!data || data.items.length === 0) return null;

  const refined = refineMyTasks(data.items, versions, todayISO);
  if (refined.length === 0) return null;
  const top = refined.slice(0, 3);

  return (
    <>
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>{t('home.myTasks')}</Text>
        <Pressable
          onPress={() => router.push('/home/my-assignments' as any)}
          hitSlop={8}
        >
          <Text style={styles.link}>
            {t('home.allTasks', { count: refined.length })}
          </Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        {top.map((r, idx) => (
          <View
            key={`${r.item.kind}-${idx}-${r.dateISO}`}
            style={[styles.eventRow, idx > 0 && styles.eventRowBorder]}
          >
            <Ionicons
              name={TASK_ICONS[r.item.kind]}
              size={18}
              color="#0ea5e9"
              style={{ marginRight: 10 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle} numberOfLines={1}>
                {taskTitle(r.item, t)}
              </Text>
              <Text style={styles.eventDate} numberOfLines={2}>
                {taskMeta(r, t, i18n.language)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

function MyAbsencesBlock({ myPublisherId }: { myPublisherId: string | null }) {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ['absences', 'mine', myPublisherId],
    queryFn: () => absencesApi.list({ publisherId: myPublisherId! }),
    enabled: !!myPublisherId,
    retry: false,
    staleTime: 60 * 1000,
  });
  const mine = (data ?? []).slice(0, 3);
  if (!myPublisherId || mine.length === 0) return null;

  return (
    <>
      <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>
        {t('home.myAbsences')}
      </Text>
      <View style={styles.card}>
        {mine.map((a, idx) => (
          <View
            key={a.id}
            style={[styles.eventRow, idx > 0 && styles.eventRowBorder]}
          >
            <Ionicons
              name="airplane-outline"
              size={18}
              color="#b45309"
              style={{ marginRight: 10 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>
                {absenceRangeLabel(a, i18n.language)}
              </Text>
              {a.note ? (
                <Text style={styles.eventDate} numberOfLines={1}>
                  {a.note}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

type Tile = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  show: boolean;
};

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canManageAbsences } = usePermissions();
  const { myPublisherId } = useMyPublisher();
  const canSeeDirectory =
    user?.role === 'admin' ||
    user?.role === 'elder' ||
    user?.canViewPrivateData === true;

  const { data: events, isLoading } = useQuery({
    queryKey: ['special-events', 'home'],
    queryFn: () => specialEventsApi.list(),
  });
  const upcoming = (events ?? []).slice(0, 3);

  const tiles: Tile[] = [
    { key: 'schedule', label: t('home.actions.schedule'), icon: 'calendar', href: '/schedule', show: true },
    { key: 'report', label: t('home.actions.report'), icon: 'document-text', href: '/service-reports', show: true },
    { key: 'events', label: t('home.actions.events'), icon: 'megaphone', href: '/special-events', show: true },
    { key: 'absences', label: t('home.actions.absences'), icon: 'airplane', href: '/absences', show: canManageAbsences },
    { key: 'publishers', label: t('home.actions.publishers'), icon: 'people', href: '/publishers', show: canSeeDirectory },
    { key: 'profile', label: t('home.actions.profile'), icon: 'person-circle', href: '/profile', show: true },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>
        {t('home.nextMeeting')}
      </Text>
      <NextMeetingCard myPublisherId={myPublisherId} />

      <NextFieldServiceCard />

      <MyTasksCard />

      <MyAbsencesBlock myPublisherId={myPublisherId} />

      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <Text style={styles.sectionTitle}>{t('home.upcomingEvents')}</Text>
        <Pressable onPress={() => router.push('/special-events' as any)} hitSlop={8}>
          <Text style={styles.link}>{t('home.allEvents')}</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        {isLoading ? (
          <ActivityIndicator style={{ paddingVertical: 16 }} />
        ) : upcoming.length === 0 ? (
          <Text style={styles.muted}>{t('home.noEvents')}</Text>
        ) : (
          upcoming.map((e, idx) => (
            <EventHomeRow key={e.id} event={e} first={idx === 0} />
          ))
        )}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>
        {t('home.quickActions')}
      </Text>
      <View style={styles.tiles}>
        {tiles
          .filter((x) => x.show)
          .map((x) => (
            <Pressable
              key={x.key}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={() => router.push(x.href as any)}
            >
              <Ionicons name={x.icon} size={26} color="#0ea5e9" />
              <Text style={styles.tileLabel}>{x.label}</Text>
            </Pressable>
          ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  link: { fontSize: 14, color: '#0ea5e9', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  muted: { color: '#94a3b8', textAlign: 'center', paddingVertical: 20 },
  meetingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meetingKind: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  meetingDate: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 6,
    textTransform: 'capitalize',
  },
  meetingMeta: { fontSize: 14, color: '#64748b', marginTop: 2 },
  partsBox: {
    marginTop: 10,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 10,
  },
  partsTitle: { fontSize: 12, fontWeight: '700', color: '#0369a1', marginBottom: 4 },
  partRow: { fontSize: 14, color: '#0f172a', marginTop: 2 },
  noParts: { fontSize: 13, color: '#94a3b8', marginTop: 10 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  eventRowBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  eventTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  eventDate: { fontSize: 13, color: '#0369a1', marginTop: 2 },
  evBadge: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    paddingVertical: 8,
  },
  evBadgeRange: { paddingVertical: 10 },
  evDay: { fontSize: 20, fontWeight: '700', color: '#0369a1' },
  evMon: {
    fontSize: 11,
    color: '#0369a1',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  evRangeNum: { fontSize: 14, fontWeight: '700', color: '#0369a1' },
  evTypeTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  evRange: { fontSize: 13, color: '#0369a1', fontWeight: '500', marginTop: 2 },
  evMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  fsUnassigned: { color: '#cbd5e1' },
  fsTopic: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 4,
  },
  fsLink: { fontSize: 13, color: '#0369a1', fontWeight: '600', marginTop: 6 },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  tile: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 8,
  },
  tilePressed: { backgroundColor: '#f1f5f9' },
  tileLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
});
