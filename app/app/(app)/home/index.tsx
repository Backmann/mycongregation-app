import {
  ActivityIndicator,
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
  meApi,
  MeetingSettingsVersion,
  meetingSettingsApi,
  MyAssignmentItem,
  SpecialEvent,
  specialEventsApi,
} from '../../../lib/api';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { addDays, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { getPartLabel } from '../../../lib/parts';
import { usePermissions } from '../../../lib/permissions';
import { useAuth } from '../../../lib/auth';
import { useMyPublisher } from '../../../lib/useMyPublisher';

function eventDateLabel(e: SpecialEvent, loc: string): string {
  const start = new Date(`${e.date}T00:00:00`);
  if (!e.endDate) {
    return start.toLocaleDateString(loc, { day: 'numeric', month: 'long' });
  }
  const end = new Date(`${e.endDate}T00:00:00`);
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}\u2013${end.toLocaleDateString(loc, {
      day: 'numeric',
      month: 'long',
    })}`;
  }
  return `${start.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
  })} \u2013 ${end.toLocaleDateString(loc, { day: 'numeric', month: 'long' })}`;
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

  type Refined = {
    item: MyAssignmentItem;
    dateISO: string;
    weekOnly: boolean;
    meetingTime?: string;
  };
  const refined: Refined[] = [];
  for (const item of data.items) {
    let dateISO: string | null = null;
    let weekOnly = false;
    let meetingTime: string | undefined;
    if (item.date) {
      dateISO = item.date;
    } else if (
      item.kind === 'field_service' &&
      item.weekStartDate &&
      item.dayOfWeek
    ) {
      dateISO = formatDateISO(
        addDays(new Date(`${item.weekStartDate}T00:00:00`), item.dayOfWeek - 1),
      );
    } else if (
      (item.kind === 'meeting' || item.kind === 'duty') &&
      item.weekStartDate &&
      (item.eventType === 'midweek' || item.eventType === 'weekend')
    ) {
      const v = effectiveVersionFor(versions, item.weekStartDate);
      const dow =
        item.eventType === 'midweek' ? v?.midweekDow : v?.weekendDow;
      if (v && dow) {
        dateISO = formatDateISO(
          addDays(new Date(`${item.weekStartDate}T00:00:00`), dow - 1),
        );
        meetingTime =
          item.eventType === 'midweek' ? v.midweekTime : v.weekendTime;
      }
    }
    if (!dateISO) {
      dateISO = item.weekStartDate ?? item.sortDate;
      weekOnly = true;
    }
    // Drop items already in the past (week-scoped: past once the week ends).
    if (weekOnly) {
      const weekEnd = formatDateISO(
        addDays(new Date(`${dateISO}T00:00:00`), 6),
      );
      if (weekEnd < todayISO) continue;
    } else if (dateISO < todayISO) {
      continue;
    }
    refined.push({ item, dateISO, weekOnly, meetingTime });
  }
  if (refined.length === 0) return null;
  refined.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const top = refined.slice(0, 5);

  const labelFor = (item: MyAssignmentItem): string => {
    if (item.kind === 'duty') {
      return t(`home.dutyTypes.${item.label}`, item.label);
    }
    if (item.kind === 'cleaning') {
      return t(`home.cleaningSlots.${item.label}`, item.label);
    }
    if (item.kind === 'meeting') {
      return (
        item.label +
        (item.asAssistant ? ` (${t('home.meeting.asAssistant')})` : '')
      );
    }
    if (item.kind === 'field_service') {
      return t('home.fieldService.leading');
    }
    return item.label;
  };

  const dateFor = (r: Refined): string => {
    const d = new Date(`${r.dateISO}T00:00:00`);
    if (r.weekOnly) {
      return t('home.weekOf', {
        date: d.toLocaleDateString(i18n.language, {
          day: 'numeric',
          month: 'long',
        }),
      });
    }
    return d.toLocaleDateString(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  };

  const metaFor = (r: Refined): string => {
    const bits: string[] = [dateFor(r)];
    const time = r.item.time ?? r.meetingTime;
    if (time) {
      bits.push(
        r.item.endTime ? `${time}\u2013${r.item.endTime}` : time,
      );
    }
    if (
      (r.item.kind === 'meeting' || r.item.kind === 'duty') &&
      (r.item.eventType === 'midweek' || r.item.eventType === 'weekend')
    ) {
      bits.push(t(`home.eventTypes.${r.item.eventType}`));
    } else {
      bits.push(t(`home.kinds.${r.item.kind}`));
    }
    if (r.item.kind === 'field_service' && r.item.location) {
      bits.push(r.item.location);
    }
    return bits.join(' \u00b7 ');
  };

  return (
    <>
      <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>
        {t('home.myTasks')}
      </Text>
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
                {labelFor(r.item)}
              </Text>
              <Text style={styles.eventDate} numberOfLines={2}>
                {metaFor(r)}
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
  const { t, i18n } = useTranslation();
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
            <Pressable
              key={e.id}
              style={[styles.eventRow, idx > 0 && styles.eventRowBorder]}
              onPress={() => router.push(`/special-events/${e.id}` as any)}
            >
              <Ionicons
                name="megaphone-outline"
                size={18}
                color="#0ea5e9"
                style={{ marginRight: 10 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTitle} numberOfLines={2}>
                  {e.title}
                </Text>
                <Text style={styles.eventDate}>
                  {eventDateLabel(e, i18n.language)}
                  {e.time ? ` · ${e.time}` : ''}
                </Text>
                {e.address ? (
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {e.address}
                  </Text>
                ) : null}
                {e.note ? (
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {e.note}
                  </Text>
                ) : null}
                {e.replacesMeeting ? (
                  <View style={styles.replacesChip}>
                    <Text style={styles.replacesChipText}>
                      {t('home.events.replacesMeeting')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </Pressable>
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
  eventMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  replacesChip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  replacesChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#c2410c',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
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
