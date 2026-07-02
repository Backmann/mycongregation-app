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
  fieldServiceApi,
  meApi,
  meetingSettingsApi,
  MyAssignmentItem,
  Publisher,
  publishersApi,
  SpecialEvent,
  specialEventsApi,
  coVisitItemsApi,
  MyCoVisitItem,
} from '../../../lib/api';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { addDays, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { useAuth } from '../../../lib/auth';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import {
  refineMyTasks,
  taskMeta,
  taskSubsectionLabel,
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

type FeedEntry = {
  key: string;
  kind: 'midweek' | 'weekend' | 'field_service';
  dateISO: string;
  time: string;
  address: string;
  conductorName: string | null;
  unassignedConductor: boolean;
  topic: string | null;
  sourceUrl: string | null;
  replacedBy: SpecialEvent | null;
  myParts: { section: string | null; title: string }[];
};

/**
 * Every meeting of the next 7 days — congregation meetings from the
 * meeting settings, field-service meetings of this and next week —
 * in one chronological feed. Cards with my assignments are highlighted;
 * an event flagged "replaces meeting" takes the meeting’s place.
 */
function MeetingsFeed() {
  const { t, i18n } = useTranslation();
  const todayISO = formatDateISO(new Date());
  const horizonISO = formatDateISO(
    addDays(new Date(`${todayISO}T00:00:00`), 7),
  );
  const thisMonday = formatDateISO(startOfWeekMonday(new Date()));
  const nextMonday = formatDateISO(
    addDays(startOfWeekMonday(new Date()), 7),
  );

  const { data: overview, isLoading } = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 5 * 60 * 1000,
  });
  const versions = overview?.versions ?? [];

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
  const eventsQuery = useQuery({
    queryKey: ['special-events', 'home'],
    queryFn: () => specialEventsApi.list(),
  });
  const myTasksQuery = useQuery({
    queryKey: ['me', 'assignments'],
    queryFn: () => meApi.assignments(),
    retry: false,
    staleTime: 60 * 1000,
  });

  const publishersById = new Map<string, Publisher>(
    (publishersQuery.data?.data ?? []).map((p) => [p.id, p]),
  );
  const myItems = myTasksQuery.data?.items ?? [];
  const events = eventsQuery.data ?? [];

  const entries: FeedEntry[] = [];

  for (const weekISO of [thisMonday, nextMonday]) {
    const v = effectiveVersionFor(versions, weekISO);
    if (!v) continue;
    for (const kind of ['midweek', 'weekend'] as const) {
      const dow = kind === 'midweek' ? v.midweekDow : v.weekendDow;
      const time = kind === 'midweek' ? v.midweekTime : v.weekendTime;
      if (!dow) continue;
      const dateISO = formatDateISO(
        addDays(new Date(`${weekISO}T00:00:00`), dow - 1),
      );
      if (dateISO < todayISO || dateISO > horizonISO) continue;
      const replacedBy =
        events.find((e) => {
          const isCongress =
            e.type === 'regional_convention' || e.type === 'circuit_assembly';
          if (!e.replacesMeeting && !isCongress) return false;
          const end = e.endDate ?? e.date;
          if (kind === 'weekend') {
            // A convention on either weekend day (Sat or Sun) cancels the weekend
            // meeting, even if logged on only one of the two days.
            const base = new Date(`${weekISO}T00:00:00`);
            const sat = formatDateISO(addDays(base, 5));
            const sun = formatDateISO(addDays(base, 6));
            return e.date <= sun && sat <= end;
          }
          return e.date <= dateISO && dateISO <= end;
        }) ?? null;
      const myParts = myItems
        .filter(
          (it) =>
            (it.kind === 'meeting' || it.kind === 'duty') &&
            it.weekStartDate === weekISO &&
            it.eventType === kind,
        )
        .sort((a, b) => (a.partOrder ?? 999) - (b.partOrder ?? 999))
        .map((it) => ({
          section: taskSubsectionLabel(it, t),
          title: taskTitle(it, t),
        }));
      entries.push({
        key: `${kind}-${dateISO}`,
        kind,
        dateISO,
        time,
        address: v.address,
        conductorName: null,
        unassignedConductor: false,
        topic: null,
        sourceUrl: null,
        replacedBy,
        myParts,
      });
    }
  }

  for (const m of [...(weekA.data ?? []), ...(weekB.data ?? [])]) {
    const dateISO = formatDateISO(
      addDays(new Date(`${m.weekStartDate}T00:00:00`), m.dayOfWeek - 1),
    );
    if (dateISO < todayISO || dateISO > horizonISO) continue;
    const conductor = m.conductorPublisherId
      ? publishersById.get(m.conductorPublisherId) ?? null
      : null;
    const myParts = myItems
      .filter(
        (it) =>
          it.kind === 'field_service' &&
          it.weekStartDate === m.weekStartDate &&
          it.dayOfWeek === m.dayOfWeek &&
          (!it.time || it.time === m.startTime),
      )
      .map(() => ({ section: null, title: t('home.feed.youConduct') }));
    entries.push({
      key: `fs-${m.id}`,
      kind: 'field_service',
      dateISO,
      time: m.startTime,
      address: m.address,
      conductorName: conductor ? conductor.displayName : null,
      unassignedConductor: !conductor,
      topic: m.topic,
      sourceUrl: m.sourceUrl,
      replacedBy: null,
      myParts,
    });
  }

  entries.sort(
    (a, b) =>
      a.dateISO.localeCompare(b.dateISO) || a.time.localeCompare(b.time),
  );

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator style={{ paddingVertical: 16 }} />
      </View>
    );
  }
  if (entries.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>{t('home.feed.empty')}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {entries.map((en) => {
        const mine = en.myParts.length > 0;
        const isToday = en.dateISO === todayISO;
        const dateLabel = new Date(
          `${en.dateISO}T00:00:00`,
        ).toLocaleDateString(i18n.language, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });

        if (en.replacedBy) {
          const e = en.replacedBy;
          const typeLabel = e.type
            ? t(`specialEvents.types.${e.type}`, e.type)
            : null;
          return (
            <Pressable
              key={en.key}
              style={[styles.card, { paddingVertical: 14 }]}
              onPress={() => router.push(`/special-events/${e.id}` as any)}
            >
              <View style={styles.meetingHeader}>
                <Ionicons name="megaphone-outline" size={18} color="#0ea5e9" />
                <Text style={styles.meetingKind}>
                  {typeLabel ?? t('home.kinds.meeting')}
                </Text>
                {isToday ? (
                  <Text style={styles.todayChip}>{t('home.feed.today')}</Text>
                ) : null}
              </View>
              <Text style={styles.meetingDate}>{e.title}</Text>
              <Text style={styles.meetingMeta}>
                {dateLabel}
                {e.time ? ` · ${e.time}` : ''}
                {e.address ? ` · ${e.address}` : ''}
              </Text>
            </Pressable>
          );
        }

        const kindLabel =
          en.kind === 'field_service'
            ? t('home.nextFieldService')
            : t(`home.eventTypes.${en.kind}`);
        return (
          <View
            key={en.key}
            style={[
              styles.card,
              { paddingVertical: 14 },
              mine && styles.feedMine,
            ]}
          >
            <View style={styles.meetingHeader}>
              <Ionicons
                name={en.kind === 'field_service' ? 'walk-outline' : 'calendar'}
                size={18}
                color="#0ea5e9"
              />
              <Text style={styles.meetingKind}>{kindLabel}</Text>
              {isToday ? (
                <Text style={styles.todayChip}>{t('home.feed.today')}</Text>
              ) : null}
            </View>
            <Text style={styles.meetingDate}>{dateLabel}</Text>
            <Text style={styles.meetingMeta}>
              {en.time}
              {en.address ? ` · ${en.address}` : ''}
            </Text>
            {en.kind === 'field_service' ? (
              <Text
                style={[
                  styles.meetingMeta,
                  en.unassignedConductor && styles.fsUnassigned,
                ]}
              >
                {t('fieldService.conductor')}:{' '}
                {en.conductorName ?? t('fieldService.unassigned')}
              </Text>
            ) : null}
            {!!en.topic && <Text style={styles.fsTopic}>{en.topic}</Text>}
            {!!en.sourceUrl && (
              <Pressable
                onPress={() =>
                  Linking.openURL(en.sourceUrl as string).catch(() => {})
                }
                hitSlop={6}
              >
                <Text style={styles.fsLink} numberOfLines={1}>
                  {t('fieldService.openLink')}
                </Text>
              </Pressable>
            )}
            {mine ? (
              <View style={styles.partsBox}>
                <Text style={styles.partsTitle}>{t('home.meeting.myParts')}</Text>
                {en.myParts.map((p, i) => (
                  <View key={i} style={styles.myPartItem}>
                    {p.section && p.section !== en.myParts[i - 1]?.section ? (
                      <Text style={styles.partSubsection} numberOfLines={1}>
                        {p.section}
                      </Text>
                    ) : null}
                    <Text style={styles.partRow} numberOfLines={2}>
                      {'\u2022 '}
                      {p.title}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
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
  outgoing_talk: 'mic-outline',
  co_lunch: 'restaurant-outline',
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
              {taskSubsectionLabel(r.item, t) ? (
                <Text style={styles.eventSubsection} numberOfLines={1}>
                  {taskSubsectionLabel(r.item, t)}
                </Text>
              ) : null}
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

function CoVisitBlock() {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ['co-visit-mine'],
    queryFn: () => coVisitItemsApi.mine(),
    staleTime: 60 * 1000,
  });
  const visits = data ?? [];
  if (visits.length === 0) return null;

  const fmtDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
  const kindName = (k: string) =>
    k === 'accommodation'
      ? t('coVisit.accTitle')
      : k === 'field_service'
      ? t('coVisit.fieldServiceTitle')
      : k === 'lunch'
        ? t('coVisit.lunchesTitle')
        : k === 'lunch_box'
          ? t('coVisit.lunchBoxTitle')
          : k === 'pastoral'
            ? t('coVisit.pastoralTitle')
            : k === 'pioneers'
              ? t('coVisit.pioneersTitle')
              : t('coVisit.eldersTitle');
  const place = (it: MyCoVisitItem) =>
    it.placeKind === 'cart_location'
      ? (it.cartLocationName ?? '')
      : (it.placeText ?? '');
  const withLabel = (it: MyCoVisitItem) =>
    it.kind === 'accommodation'
      ? t('coVisit.accMine')
      : it.kind !== 'field_service' || !it.serviceWith
      ? null
      : it.serviceWith === 'wife'
        ? t('coVisit.mineWithWife')
        : it.serviceWith === 'joint'
          ? t('coVisit.mineJoint')
          : t('coVisit.mineWithCo');

  return (
    <>
      {visits.map(({ visit, items }) => (
        <View key={visit.id} style={coStyles.card}>
          <View style={coStyles.head}>
            <Ionicons name="briefcase-outline" size={18} color="#0e7490" />
            <Text style={coStyles.title}>{t('coVisit.mineTitle')}</Text>
            <Text style={coStyles.period}>
              {fmtDay(visit.date)}
              {visit.endDate && visit.endDate !== visit.date
                ? ` – ${fmtDay(visit.endDate)}`
                : ''}
            </Text>
          </View>
          {items.map((it) => {
            const wl = withLabel(it);
            const key = k(it);
            return (
              <View key={key} style={coStyles.row}>
                <View style={coStyles.when}>
                  <Text style={coStyles.day}>{fmtDay(it.itemDate)}</Text>
                  <Text style={coStyles.time}>{it.startTime ?? '—'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={coStyles.kind}>{kindName(it.kind)}</Text>
                  {wl ? <Text style={coStyles.withText}>{wl}</Text> : null}
                  {place(it) ? (
                    <Text style={coStyles.meta}>{place(it)}</Text>
                  ) : null}
                  {it.note ? (
                    <Text style={coStyles.note}>{it.note}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </>
  );
}
const k = (it: MyCoVisitItem) => it.id;

const coStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#a5f3fc',
    padding: 14,
    marginTop: 16,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: { fontSize: 15, fontWeight: '800', color: '#0e7490', flex: 1 },
  period: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  when: { width: 74 },
  day: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  time: { fontSize: 13, color: '#64748b', marginTop: 1 },
  kind: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  withText: { fontSize: 12.5, color: '#0e7490', fontWeight: '600', marginTop: 1 },
  meta: { fontSize: 13, color: '#475569', marginTop: 1 },
  note: { fontSize: 13, color: '#7c3aed', fontWeight: '600', marginTop: 2 },
});

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
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
    { key: 'absences', label: t('home.actions.absences'), icon: 'airplane', href: '/absences', show: true },
    { key: 'publishers', label: t('home.actions.publishers'), icon: 'people', href: '/publishers', show: canSeeDirectory },
    { key: 'profile', label: t('home.actions.profile'), icon: 'person-circle', href: '/profile', show: true },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>
        {t('home.nextMeetings')}
      </Text>
      <MeetingsFeed />

      <MyTasksCard />

      <CoVisitBlock />

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
  feedMine: { borderLeftWidth: 3, borderLeftColor: '#0ea5e9' },
  todayChip: {
    marginLeft: 'auto',
    fontSize: 10,
    fontWeight: '700',
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
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
  myPartItem: { marginTop: 6 },
  partSubsection: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  noParts: { fontSize: 13, color: '#94a3b8', marginTop: 10 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  eventRowBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  eventTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  eventSubsection: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
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
