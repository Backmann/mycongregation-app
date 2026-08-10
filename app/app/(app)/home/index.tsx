import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AttendanceCard } from '../../../components/AttendanceCard';
import { ReportCollectionCard } from '../../../components/ReportCollectionCard';
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
  Publisher,
  publishersApi,
  SpecialEvent,
  specialEventsApi,
  coVisitItemsApi,
  MyCoVisitItem,
  auxiliaryPioneersApi,
  serviceReportsApi,
  serviceGroupsApi,
} from '../../../lib/api';
import { addDays, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { useAuth } from '../../../lib/auth';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import {
  auxMonthSinceLabel,
  auxPeriodLabel,
} from '../../../lib/aux-pioneer-period';
import { monthLabel } from '../../../lib/month-label';
import { LoadError } from '../../../components/LoadError';
import {
  RefinedTask,
  taskMeta,
  taskSubsectionLabel,
  taskTitle,
  taskVisual,
} from '../../../lib/my-tasks';
import {
  buildTimeline,
  MeetingEntry,
  OutgoingTalkEntry,
  TimelineEntry,
} from '../../../lib/home-timeline';
import { MyDot } from '../../../components/MyDot';
import { MyGlowRow } from '../../../components/MyGlowRow';
import { SectionKind } from '../../../lib/section-colors';
import { isCongressEvent } from '../../../lib/week-rules';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GLASS_HEADER_LARGE } from '../../../components/GlassHeader';
import { homeScroll } from '../../../lib/home-scroll';


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

function SkeletonBar({ width, height = 14 }: { width: string; height?: number }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.75,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={{
        width: width as never,
        height,
        borderRadius: 7,
        backgroundColor: '#cbd5e1',
        opacity: pulse,
      }}
    />
  );
}

/** Skeleton placeholder shaped like a content card — no layout jumps. */
function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <View style={[styles.card, { paddingVertical: 14, gap: 12 }]}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ gap: 6 }}>
          <SkeletonBar width={i % 2 ? '55%' : '70%'} />
          <SkeletonBar width="38%" height={10} />
        </View>
      ))}
    </View>
  );
}

/** Warm one-line greeting with the person's name and today's date. */
function GreetingHeader() {
  const { t, i18n } = useTranslation();
  const { myPublisher } = useMyPublisher();
  const currentMonth = `${new Date().toISOString().slice(0, 7)}-01`;
  const { data: auxStatus } = useQuery({
    queryKey: ['aux-pioneers', 'mine', currentMonth],
    queryFn: () => auxiliaryPioneersApi.mine(currentMonth),
  });
  const hour = new Date().getHours();
  const key =
    hour >= 5 && hour < 11
      ? 'morning'
      : hour >= 11 && hour < 17
        ? 'day'
        : hour >= 17 && hour < 23
          ? 'evening'
          : 'night';
  const name = myPublisher?.firstName ?? '';
  const dateLine = new Date().toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // «До отмены» — единственный случай без конца, и только он заслуживает
  // знака бесконечности.
  const endlessAux = !!auxStatus?.current?.untilCancelled;

  // Своё назначение, если оно есть. Только своё и только здесь: главная —
  // это экран про себя, а не про собрание, и у сестёр тут просто ничего.
  const appointment = myPublisher?.appointment ?? 'none';
  const appointmentLabel =
    appointment === 'elder'
      ? t('publishers.tags.elder')
      : appointment === 'ministerial_servant'
        ? t('publishers.tags.ms')
        : null;

  // Тип пионерского служения — это СОСТОЯНИЕ: месяцы к нему не относятся.
  // Подсобное — это СРОК, и без срока значок почти ничего не сообщает.
  const pioneerType = myPublisher?.pioneerType ?? 'none';
  const namedPioneer = ['regular', 'special', 'missionary'].includes(
    pioneerType,
  );
  const nowLabel = namedPioneer
    ? t(`publishers.pioneer.detail.${pioneerType}`)
    : auxStatus?.current
      ? t('auxPioneer.badgeServing', {
          period: auxPeriodLabel(t, i18n.language, auxStatus.current, {
            hideCurrentYear: true,
          }),
        })
      : null;
  // Сейчас ничего, но период уже оформлен: знать в июле, что август назначен,
  // — это и есть польза. Значок тише и с другим значком: это ещё не сейчас.
  const aheadLabel =
    !nowLabel && auxStatus?.upcoming
      ? t('auxPioneer.badgeUpcoming', {
          month: auxMonthSinceLabel(
            i18n.language,
            auxStatus.upcoming.startMonth,
            { hideCurrentYear: true },
          ),
        })
      : null;

  return (
    <View style={styles.greeting}>
      <Text style={styles.greetingText}>
        {t(`home.greeting.${key}`)}
        {name ? `, ${name}` : ''}
      </Text>
      <Text style={styles.greetingDate}>{dateLine}</Text>
      <View style={styles.badgeRow}>
        {appointmentLabel ? (
          <View style={[styles.auxBadge, styles.appointmentBadge]}>
            <Ionicons name="ribbon-outline" size={13} color="#4C4088" />
            <Text style={[styles.auxBadgeText, styles.appointmentBadgeText]}>
              {appointmentLabel}
            </Text>
          </View>
        ) : null}
        {nowLabel ? (
          <View style={styles.auxBadge}>
            {/* Бесконечность — только там, где она правда что-то значит:
                подсобное служение «до отмены» не имеет конца. У общего пионера
                конца тоже нет, но он и не срок, а состояние; у подсобного со
                сроком конец есть, и знак бесконечности рядом с ним просто
                неправда. Раньше он стоял у всех сразу и не сообщал ничего. */}
            <Ionicons
              name={endlessAux ? 'infinite' : 'leaf-outline'}
              size={13}
              color="#0F6E56"
            />
            <Text style={styles.auxBadgeText}>{nowLabel}</Text>
          </View>
        ) : aheadLabel ? (
          <View style={[styles.auxBadge, styles.auxBadgeAhead]}>
            <Ionicons name="calendar-outline" size={13} color="#3F6C8F" />
            <Text style={[styles.auxBadgeText, styles.auxBadgeAheadText]}>
              {aheadLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Собственное состояние отчёта за прошлый месяц. Пустое место читается как
 * поломка, поэтому «сдан» проговаривается так же явно, как «не сдан».
 */
function ReportStandingCard() {
  const { t, i18n } = useTranslation();
  const { data } = useQuery({
    queryKey: ['reports', 'my-standing'],
    queryFn: () => serviceReportsApi.myStanding(),
    staleTime: 5 * 60 * 1000,
  });

  if (!data || !data.applicable || !data.reportMonth) return null;

  const month = monthLabel(i18n.language, data.reportMonth, {
    hideCurrentYear: true,
  });

  if (data.submitted) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.reportCard,
          styles.reportCardDone,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => router.push('/service-reports' as any)}
      >
        <Ionicons name="checkmark-circle" size={20} color="#16794f" />
        <Text style={[styles.reportText, styles.reportTextDone]}>
          {t('home.report.submitted', { month })}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.reportCard,
        styles.reportCardDue,
        pressed && { opacity: 0.7 },
      ]}
      onPress={() =>
        router.push(
          `/service-reports/new?reportMonth=${data.reportMonth}` as any,
        )
      }
    >
      <Ionicons name="document-text-outline" size={20} color="#b45309" />
      <Text style={[styles.reportText, styles.reportTextDue]}>
        {t('home.report.outstanding', { month })}
      </Text>
      <Ionicons name="chevron-forward" size={18} color="#b45309" />
    </Pressable>
  );
}

const FEED_ACCENT: Record<
  string,
  { color: string; bg: string; icon: string }
> = {
  weekend: { color: '#7c3aed', bg: '#f5f3ff', icon: 'people-outline' },
  midweek: { color: '#2563eb', bg: '#eff6ff', icon: 'book-outline' },
  field_service: { color: '#16a34a', bg: '#f0fdf4', icon: 'walk-outline' },
  event: { color: '#d97706', bg: '#fffbeb', icon: 'megaphone-outline' },
};

const NEAR_DAYS = 14;

/** Section hue for a personal task, by what the task is. */
function taskGlowKind(kind: RefinedTask['item']['kind']): SectionKind {
  switch (kind) {
    case 'cleaning':
      return 'cleaning';
    case 'cart':
    case 'field_service':
      return 'field_service';
    default:
      return 'meeting';
  }
}

/** Section hue for the personal glow/dot of a timeline entry. */
function glowKindFor(en: TimelineEntry): SectionKind {
  if (en.type === 'meeting') {
    return en.kind === 'field_service' ? 'field_service' : 'meeting';
  }
  if (en.type === 'task') return taskGlowKind(en.task.item.kind);
  return 'meeting';
}

/** «Сегодня» / «Завтра» / «пн, 28 июля» — the day header of a group. */
function dayHeaderLabel(
  dateISO: string,
  todayISO: string,
  t: (k: string) => string,
  locale: string,
): string {
  const d = new Date(`${dateISO}T00:00:00`);
  const tomorrow = formatDateISO(addDays(new Date(`${todayISO}T00:00:00`), 1));
  if (dateISO === todayISO) return t('home.timeline.today');
  if (dateISO === tomorrow) return t('home.timeline.tomorrow');
  return d.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * One quiet background row — a meeting nobody has assigned me to, or an event.
 * It is present but does not compete with my own rows for attention.
 */
function BackgroundRow({
  icon,
  accent,
  kindLabel,
  title,
  meta,
  extra,
  cleaning,
  onPress,
}: {
  icon: string;
  accent: string;
  kindLabel: string;
  title: string;
  meta: string | null;
  extra?: React.ReactNode;
  cleaning?: string | null;
  onPress?: () => void;
}) {
  const body = (
    <View style={tl.bgRow}>
      <View style={[tl.bgDot, { borderColor: accent }]} />
      <View style={{ flex: 1 }}>
        <View style={tl.bgHead}>
          <Ionicons name={icon as never} size={14} color={accent} />
          <Text style={[tl.bgKind, { color: accent }]}>{kindLabel}</Text>
        </View>
        <Text style={tl.bgTitle}>{title}</Text>
        {meta ? <Text style={tl.bgMeta}>{meta}</Text> : null}
        {extra}
        {cleaning ? <Text style={tl.cleaningLine}>{cleaning}</Text> : null}
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={17} color="#cbd5e1" />
      ) : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** A meeting entry: quiet by default, breathing and detailed when it is mine. */
function MeetingRow({
  entry,
  todayISO,
}: {
  entry: MeetingEntry;
  todayISO: string;
}) {
  const { t, i18n } = useTranslation();
  const dateLabel = new Date(`${entry.dateISO}T00:00:00`).toLocaleDateString(
    i18n.language,
    { weekday: 'long', day: 'numeric', month: 'long' },
  );

  // A convention/assembly cancelled this meeting: show the event in its place.
  if (entry.replacedBy) {
    const e = entry.replacedBy;
    const typeLabel = e.type
      ? t(`specialEvents.types.${e.type}`, e.type)
      : t('home.kinds.meeting');
    return (
      <BackgroundRow
        icon={FEED_ACCENT.event.icon}
        accent={FEED_ACCENT.event.color}
        kindLabel={typeLabel}
        title={e.title}
        meta={[dateLabel, e.time, e.address].filter(Boolean).join(' \u00b7 ')}
        onPress={() => router.push(`/special-events/${e.id}` as any)}
      />
    );
  }

  const kindLabel =
    entry.kind === 'field_service'
      ? t('home.nextFieldService')
      : t(`home.eventTypes.${entry.kind}`);
  const ac = FEED_ACCENT[entry.kind] ?? FEED_ACCENT.midweek;
  const meta = [entry.time, entry.address].filter(Boolean).join(' \u00b7 ');

  const generalBadge =
    entry.kind === 'field_service' && entry.isGeneral ? (
      <View style={tl.generalBadge}>
        <Ionicons name="people" size={12} color="#7c3aed" />
        <Text style={tl.generalBadgeText}>{t('fieldService.generalBadge')}</Text>
      </View>
    ) : null;

  const fsExtra =
    entry.kind === 'field_service' ? (
      <>
        {generalBadge}
        {/* The group and the visit, in the third and last place a
            field-service meeting is drawn. Two out of three showing it made a
            saved visit look unsaved. */}
        {entry.groupName ? (
          <Text style={tl.fsGroup}>{entry.groupName}</Text>
        ) : null}
        {entry.serviceOverseerVisit ? (
          <View style={tl.fsVisitBadge}>
            <Ionicons name="walk" size={12} color="#0e7490" />
            <Text style={tl.fsVisitText}>
              {t('fieldService.overseerVisitBadge')}
            </Text>
          </View>
        ) : null}
        {entry.conductorName || entry.unassignedConductor ? (
          <Text
            style={[
              tl.bgMeta,
              entry.unassignedConductor && tl.fsUnassigned,
            ]}
          >
            {t('fieldService.conductor')}:{' '}
            {entry.conductorName ?? t('fieldService.unassigned')}
          </Text>
        ) : null}
        {entry.topic ? <Text style={tl.fsTopic}>{entry.topic}</Text> : null}
        {entry.sourceUrl ? (
          <Pressable
            onPress={() =>
              Linking.openURL(entry.sourceUrl as string).catch(() => {})
            }
            hitSlop={6}
          >
            <Text style={tl.fsLink}>
              {t('fieldService.openLink')}
            </Text>
          </Pressable>
        ) : null}
      </>
    ) : null;

  // Not mine — a quiet background row.
  if (entry.myParts.length === 0) {
    return (
      <BackgroundRow
        icon={ac.icon}
        accent={ac.color}
        kindLabel={kindLabel}
        title={meta || dateLabel}
        meta={null}
        extra={fsExtra}
        cleaning={
          entry.weeklyCleaning ? t('home.timeline.cleaningAfterMeeting') : null
        }
      />
    );
  }

  // Mine — breathing glow, my parts spelled out.
  return (
    <MyGlowRow kind={glowKindFor(entry)} radius={12} style={tl.mineRow}>
      <View style={tl.mineHead}>
        <MyDot size={8} kind={glowKindFor(entry)} />
        <Text style={[tl.mineKind, { color: ac.color }]}>{kindLabel}</Text>
        {generalBadge}
      </View>
      {meta ? <Text style={tl.mineTitle}>{meta}</Text> : null}
      {fsExtra}
      {entry.weeklyCleaning ? (
        <Text style={tl.cleaningLine}>
          {t('home.timeline.cleaningAfterMeeting')}
        </Text>
      ) : null}
      <View style={tl.partsBox}>
        {entry.myParts.map((p, i) => (
          <View key={i}>
            {p.section && p.section !== entry.myParts[i - 1]?.section ? (
              <Text style={tl.partSection}>
                {p.section}
              </Text>
            ) : null}
            <Text style={tl.partRow}>
              {'\u2022 '}
              {p.title}
            </Text>
          </View>
        ))}
      </View>
    </MyGlowRow>
  );
}

/** A personal non-meeting task (cleaning, cart, outgoing talk, co-lunch). */
function TaskRow({ task: r }: { task: RefinedTask }) {
  const { t, i18n } = useTranslation();
  const v = taskVisual(r.item);
  return (
    <MyGlowRow kind={taskGlowKind(r.item.kind)} radius={12} style={tl.mineRow}>
      <View style={tl.taskHead}>
        <View style={[tl.kindChip, { backgroundColor: v.bg }]}>
          <Ionicons name={v.icon as never} size={15} color={v.color} />
        </View>
        <View style={{ flex: 1 }}>
          {taskSubsectionLabel(r.item, t) ? (
            <Text style={tl.mineKind}>
              {taskSubsectionLabel(r.item, t)}
            </Text>
          ) : null}
          <Text style={tl.mineTitle}>
            {taskTitle(r.item, t)}
          </Text>
          <Text style={tl.mineMeta}>
            {taskMeta(r, t, i18n.language)}
          </Text>
        </View>
      </View>
    </MyGlowRow>
  );
}

/** An event nobody assigned — background, tappable to its page. */
function EventRow({ event: e }: { event: SpecialEvent }) {
  const { t, i18n } = useTranslation();
  const start = new Date(`${e.date}T00:00:00`);
  const typeLabel = e.type ? t(`specialEvents.types.${e.type}`, e.type) : null;
  const dateLabel = e.endDate
    ? rangeLabel(start, new Date(`${e.endDate}T00:00:00`), i18n.language)
    : start.toLocaleDateString(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
  return (
    <BackgroundRow
      icon={FEED_ACCENT.event.icon}
      accent={FEED_ACCENT.event.color}
      kindLabel={typeLabel ?? t('home.upcomingEvents')}
      title={e.title}
      meta={[dateLabel, e.time, e.address].filter(Boolean).join(' \u00b7 ')}
      onPress={() => router.push(`/special-events/${e.id}` as any)}
    />
  );
}

/**
 * «Тебя нет» — a quiet away-period row. Not a task and not an event: a muted
 * plane, the date range, no section dot and no chevron.
 */
function AbsenceRow({ absence: a }: { absence: Absence }) {
  const { t, i18n } = useTranslation();
  return (
    <View style={tl.absenceRow}>
      <Ionicons name="airplane-outline" size={16} color="#94a3b8" />
      <View style={{ flex: 1 }}>
        <Text style={tl.absenceText}>
          {t('home.timeline.away')} · {absenceRangeLabel(a, i18n.language)}
        </Text>
        {a.note ? (
          <Text style={tl.absenceNote}>
            {a.note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A talk in another congregation: the trip, the away-period it causes and the
 * home meeting being missed are one fact, so they are one row. The home
 * meeting for that day is dropped by the builder.
 */
function OutgoingTalkRow({ entry }: { entry: OutgoingTalkEntry }) {
  const { t, i18n } = useTranslation();
  const it = entry.task.item;
  const where = [it.congregationName, it.location].filter(Boolean).join(' \u00b7 ');
  return (
    <MyGlowRow kind="meeting" radius={12} style={tl.mineRow}>
      <View style={tl.mineHead}>
        <Ionicons name="megaphone-outline" size={15} color="#7c3aed" />
        <Text style={[tl.mineKind, { color: '#7c3aed' }]}>
          {t('home.timeline.outgoingTalk')}
        </Text>
        {it.time ? <Text style={tl.mineMeta}>{it.time}</Text> : null}
      </View>
      <Text style={tl.mineTitle}>{taskTitle(it, t)}</Text>
      {where ? <Text style={tl.mineMeta}>{where}</Text> : null}
      {it.mapUrl ? (
        <Pressable
          onPress={() => Linking.openURL(it.mapUrl as string).catch(() => {})}
          hitSlop={6}
        >
          <Text style={tl.fsLink}>{t('home.timeline.openMap')}</Text>
        </Pressable>
      ) : null}
      {entry.absence ? (
        <Text style={tl.talkAway}>
          {absenceRangeLabel(entry.absence, i18n.language)}
        </Text>
      ) : null}
    </MyGlowRow>
  );
}

function TimelineRow({
  entry,
  todayISO,
}: {
  entry: TimelineEntry;
  todayISO: string;
}) {
  if (entry.type === 'meeting') {
    return <MeetingRow entry={entry} todayISO={todayISO} />;
  }
  if (entry.type === 'task') {
    return <TaskRow task={entry.task} />;
  }
  if (entry.type === 'absence') {
    return <AbsenceRow absence={entry.absence} />;
  }
  if (entry.type === 'visit') {
    return <VisitBanner event={entry.event} />;
  }
  if (entry.type === 'co_visit') {
    return <CoVisitRow item={entry.item} />;
  }
  if (entry.type === 'outgoing_talk') {
    return <OutgoingTalkRow entry={entry} />;
  }
  return <EventRow event={entry.event} />;
}

/** kind → title for a CO-visit item (shared by the near row and the far row). */
function coVisitKindLabel(kind: string, t: (k: string) => string): string {
  switch (kind) {
    case 'accommodation':
      return t('coVisit.accTitle');
    case 'field_service':
      return t('coVisit.fieldServiceTitle');
    case 'lunch':
      return t('coVisit.lunchesTitle');
    case 'lunch_box':
      return t('coVisit.lunchBoxTitle');
    case 'pastoral':
      return t('coVisit.pastoralTitle');
    case 'pioneers':
      return t('coVisit.pioneersTitle');
    default:
      return t('coVisit.eldersTitle');
  }
}

function coVisitWithLabel(
  it: MyCoVisitItem,
  t: (k: string) => string,
): string | null {
  if (it.kind === 'accommodation') return t('coVisit.accMine');
  if (it.kind !== 'field_service' || !it.serviceWith) return null;
  return it.serviceWith === 'wife'
    ? t('coVisit.mineWithWife')
    : it.serviceWith === 'joint'
      ? t('coVisit.mineJoint')
      : t('coVisit.mineWithCo');
}

function coVisitPlace(it: MyCoVisitItem): string {
  return it.placeKind === 'cart_location'
    ? (it.cartLocationName ?? '')
    : (it.placeText ?? '');
}

/**
 * The circuit-overseer visit — a distinctive teal banner naming the whole
 * special week, so the days beneath it read as out of the ordinary.
 */
function VisitBanner({ event: e }: { event: SpecialEvent }) {
  const { t, i18n } = useTranslation();
  const start = new Date(`${e.date}T00:00:00`);
  const range = e.endDate
    ? rangeLabel(start, new Date(`${e.endDate}T00:00:00`), i18n.language)
    : start.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });
  const congress = isCongressEvent(e);
  // A convention keeps its own title — the week is named after it, and the
  // type line says what kind of week it is. A visit has a fixed name.
  const title = congress
    ? e.title
    : t('coVisit.mineTitle');
  const typeLabel =
    congress && e.type ? t(`specialEvents.types.${e.type}`, e.type) : null;
  return (
    <Pressable
      style={({ pressed }) => [
        tl.visitBanner,
        congress && tl.congressBanner,
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => router.push(`/special-events/${e.id}` as any)}
    >
      <Ionicons
        name={congress ? 'megaphone' : 'briefcase'}
        size={18}
        color={congress ? '#b45309' : '#0e7490'}
      />
      <View style={{ flex: 1 }}>
        {typeLabel ? (
          <Text style={[tl.visitType, congress && tl.congressText]}>
            {typeLabel}
          </Text>
        ) : null}
        <Text style={[tl.visitTitle, congress && tl.congressTitle]}>
          {title}
        </Text>
        <Text style={[tl.visitRange, congress && tl.congressText]}>
          {range}
        </Text>
      </View>
    </Pressable>
  );
}

/** One of my own CO-visit items — a personal, breathing row. */
function CoVisitRow({ item: it }: { item: MyCoVisitItem }) {
  const { t } = useTranslation();
  const wl = coVisitWithLabel(it, t);
  const place = coVisitPlace(it);
  const kind: SectionKind =
    it.kind === 'field_service' ? 'field_service' : 'meeting';
  return (
    <MyGlowRow kind={kind} radius={12} style={tl.mineRow}>
      <View style={tl.mineHead}>
        <MyDot size={8} kind={kind} />
        <Text style={[tl.mineKind, { color: '#0e7490' }]}>
          {coVisitKindLabel(it.kind, t)}
        </Text>
        {it.startTime ? (
          <Text style={[tl.mineMeta, tl.mineTime]}> · {it.startTime}</Text>
        ) : null}
      </View>
      {wl ? <Text style={tl.mineTitle}>{wl}</Text> : null}
      {place ? <Text style={tl.mineMeta}>{place}</Text> : null}
      {it.note ? <Text style={tl.coNote}>{it.note}</Text> : null}
    </MyGlowRow>
  );
}

/**
 * The single chronological stream — my assignments, meetings and events in one
 * timeline. Personal rows breathe and carry weight; the background stays quiet.
 * Two zones: the next 14 days mixed and grouped by day, then a collapsed list
 * of my own assignments further out. Replaces the old My-tasks, Meetings and
 * Events blocks; absences and the circuit-overseer visit are still their own
 * blocks for now.
 */
function HomeTimeline() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { myPublisherId } = useMyPublisher();
  const [showFar, setShowFar] = useState(false);
  const todayISO = formatDateISO(new Date());
  const baseMonday = startOfWeekMonday(new Date());
  const mon0 = formatDateISO(baseMonday);
  const mon1 = formatDateISO(addDays(baseMonday, 7));
  const mon2 = formatDateISO(addDays(baseMonday, 14));

  const overviewQ = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 5 * 60 * 1000,
  });
  const fsA = useQuery({
    queryKey: ['field-service', mon0],
    queryFn: () => fieldServiceApi.list({ weekStart: mon0 }),
    staleTime: 60 * 1000,
  });
  const fsB = useQuery({
    queryKey: ['field-service', mon1],
    queryFn: () => fieldServiceApi.list({ weekStart: mon1 }),
    staleTime: 60 * 1000,
  });
  const fsC = useQuery({
    queryKey: ['field-service', mon2],
    queryFn: () => fieldServiceApi.list({ weekStart: mon2 }),
    staleTime: 60 * 1000,
  });
  const publishersQ = useQuery({
    queryKey: ['publishers', 'roster'],
    queryFn: () => publishersApi.roster(),
    staleTime: 5 * 60 * 1000,
  });
  // Group names for the field-service visit line — the timeline can only say
  // «группа Ahlen» if somebody hands it the names.
  const groupsQ = useQuery({
    queryKey: ['service-groups'],
    queryFn: () => serviceGroupsApi.list({}),
    staleTime: 30 * 60 * 1000,
  });
  const eventsQ = useQuery({
    queryKey: ['special-events', 'home'],
    queryFn: () => specialEventsApi.list(),
  });
  const tasksQ = useQuery({
    queryKey: ['me', 'assignments'],
    queryFn: () => meApi.assignments(),
    enabled: !!user,
    retry: false,
    staleTime: 60 * 1000,
  });
  const absencesQ = useQuery({
    queryKey: ['absences', 'mine', myPublisherId],
    queryFn: () => absencesApi.list({ publisherId: myPublisherId! }),
    enabled: !!myPublisherId,
    retry: false,
    staleTime: 60 * 1000,
  });
  const coVisitQ = useQuery({
    queryKey: ['co-visit-mine'],
    queryFn: () => coVisitItemsApi.mine(),
    staleTime: 60 * 1000,
  });
  const coFieldServiceQ = useQuery({
    queryKey: ['co-visit-field-service'],
    queryFn: () => coVisitItemsApi.fieldService(),
    staleTime: 5 * 60 * 1000,
  });

  const timeline = useMemo(() => {
    const publishersById = new Map<string, Publisher>(
      (publishersQ.data?.data ?? []).map((p) => [p.id, p]),
    );
    return buildTimeline({
      versions: overviewQ.data?.versions ?? [],
      fieldServiceMeetings: [
        ...(fsA.data ?? []),
        ...(fsB.data ?? []),
        ...(fsC.data ?? []),
      ],
      publishersById,
      groupNameById: new Map(
        (groupsQ.data?.data ?? []).map((g: { id: string; name: string }) => [
          g.id,
          g.name,
        ]),
      ),
      events: eventsQ.data ?? [],
      absences: absencesQ.data ?? [],
      coVisits: coVisitQ.data ?? [],
      coFieldService: coFieldServiceQ.data ?? [],
      myItems: tasksQ.data?.items ?? [],
      todayISO,
      youConductLabel: t('home.feed.youConduct'),
      resolvePart: (it) => ({
        section: taskSubsectionLabel(it, t),
        title: taskTitle(it, t),
      }),
      nearDays: NEAR_DAYS,
    });
    // i18n.language is a dep so titles re-resolve on language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    overviewQ.data,
    groupsQ.data,
    fsA.data,
    fsB.data,
    fsC.data,
    publishersQ.data,
    eventsQ.data,
    tasksQ.data,
    absencesQ.data,
    coVisitQ.data,
    coFieldServiceQ.data,
    todayISO,
    i18n.language,
  ]);

  const farCount = timeline.far.reduce((n, g) => n + g.entries.length, 0);

  const header = (
    <View style={[styles.sectionHeader, { marginTop: 24 }]}>
      <Text style={styles.sectionTitle}>{t('home.timeline.title')}</Text>
    </View>
  );

  if (
    (overviewQ.isLoading && !overviewQ.data) ||
    (tasksQ.isLoading && !tasksQ.data)
  ) {
    return (
      <>
        {header}
        <SkeletonCard rows={4} />
      </>
    );
  }
  if (
    (overviewQ.isError && !overviewQ.data) ||
    (tasksQ.isError && !tasksQ.data)
  ) {
    return (
      <>
        {header}
        <LoadError
          onRetry={() => {
            overviewQ.refetch();
            tasksQ.refetch();
          }}
        />
      </>
    );
  }

  return (
    <>
      {header}
      {timeline.near.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{t('home.timeline.emptyNear')}</Text>
        </View>
      ) : (
        timeline.near.map((group) => (
          <View key={group.dateISO} style={{ marginBottom: 4 }}>
            <Text style={tl.dayHeader}>
              {dayHeaderLabel(group.dateISO, todayISO, t, i18n.language)}
            </Text>
            <View style={tl.dayBody}>
              {group.entries.map((en) => (
                <TimelineRow key={en.key} entry={en} todayISO={todayISO} />
              ))}
            </View>
          </View>
        ))
      )}

      {timeline.far.length > 0 ? (
        <>
          <Pressable
            style={tl.farToggle}
            onPress={() => setShowFar((v) => !v)}
            hitSlop={6}
          >
            <Ionicons
              name={showFar ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#64748b"
            />
            <Text style={tl.farToggleTitle}>{t('home.timeline.far')}</Text>
            <Text style={tl.farToggleHint}>
              {t('home.timeline.farHint', { count: farCount })}
            </Text>
          </Pressable>
          {showFar
            ? timeline.far.map((group) => (
                <View key={`far-${group.dateISO}`} style={{ marginBottom: 4 }}>
                  <Text style={tl.dayHeader}>
                    {dayHeaderLabel(group.dateISO, todayISO, t, i18n.language)}
                  </Text>
                  <View style={tl.dayBody}>
                    {group.entries.map((en) => (
                      <TimelineRow key={en.key} entry={en} todayISO={todayISO} />
                    ))}
                  </View>
                </View>
              ))
            : null}
        </>
      ) : null}
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
  // Shared with the header, which the navigator renders separately.
  const scrollY = homeScroll;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const canSeeDirectory =
    user?.role === 'admin' ||
    user?.role === 'elder' ||
    user?.canViewPrivateData === true;
  const canManageTasks = user?.role === 'admin' || user?.role === 'elder';

  const tiles: Tile[] = [
    { key: 'report', label: t('home.actions.report'), icon: 'document-text', href: '/service-reports', show: true },
    { key: 'events', label: t('home.actions.events'), icon: 'megaphone', href: '/special-events', show: true },
    { key: 'absences', label: t('home.actions.absences'), icon: 'airplane', href: '/absences', show: true },
    // No «Возвещатели» tile for those who can browse the roster: the tab at
    // the bottom already takes them there, and two doors into one room is one
    // door too many on a screen meant for what needs doing today.
    //
    // «Моя группа» STAYS for everyone else, because for them it is not a
    // duplicate — the tab is hidden and this is their only way in.
    // Elders and admins only — the server refuses everyone else anyway, and a
    // tile leading to a refusal is worse than no tile.
    // Elders and admins ONLY — matching the server, which refuses everyone
    // else. `canSeeDirectory` also lets in anyone granted access to private
    // data, so a servant with that right saw the tile and was then turned
    // away: a door that opens onto a refusal is worse than no door.
    { key: 'tasks', label: t('home.actions.tasks'), icon: 'checkbox', href: '/tasks', show: canManageTasks },
    { key: 'myGroup', label: t('home.actions.myGroup'), icon: 'people-circle', href: '/publishers', show: !canSeeDirectory },
  ];

  return (
    <Animated.ScrollView
      style={styles.container}
      // The header floats over this list rather than sitting above it, so the
      // top padding is what keeps the first card from starting underneath it.
      contentContainerStyle={{
        padding: 16,
        // The bar's TALL height: the list begins just below it, and what the
        // collapse frees goes to the content rather than to a gap.
        paddingTop: GLASS_HEADER_LARGE + insets.top + 8,
        paddingBottom: 40,
      }}
      scrollEventThrottle={16}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        // false: the bar's height collapses with this value, and height is
        // beyond the native driver.
        { useNativeDriver: false },
      )}
    >
      <GreetingHeader />

      {/* Быстрые действия — горизонтальная лента круглых иконок */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.actionStrip}
        contentContainerStyle={styles.actionStripContent}
      >
        {tiles
          .filter((x) => x.show)
          .map((x) => (
            <Pressable
              key={x.key}
              style={({ pressed }) => [
                styles.actionItem,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => router.push(x.href as any)}
            >
              <View style={styles.actionCircle}>
                <Ionicons name={x.icon} size={24} color="#0284c7" />
              </View>
              <Text
                style={styles.actionLabel}
                numberOfLines={2}
                // Каждая плитка фиксированной ширины, поэтому системное
                // увеличение шрифта рвало длинные подписи посреди слова
                // («Возвещател/и»). Ограничиваем множитель, а не отключаем
                // масштабирование совсем — иначе людям со слабым зрением
                // подпись останется крошечной.
                maxFontSizeMultiplier={1.2}
              >
                {x.label}
              </Text>
            </Pressable>
          ))}
      </ScrollView>

      <ReportStandingCard />

      <ReportCollectionCard />

      <AttendanceCard />

      <HomeTimeline />

    </Animated.ScrollView>
  );
}

const tl = StyleSheet.create({
  dayHeader: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#475569',
    marginTop: 14,
    marginBottom: 6,
  },
  bgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  bgDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    marginTop: 4,
  },
  bgHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 1,
  },
  bgKind: { fontSize: 12, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  bgTitle: { fontSize: 14, color: '#475569', fontFamily: 'Manrope_500Medium' },
  bgMeta: { fontSize: 12.5, color: '#94a3b8', marginTop: 1 },
  fsGroup: {
    fontSize: 12.5,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    marginTop: 1,
  },
  fsVisitBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#cffafe',
    marginTop: 3,
  },
  fsVisitText: {
    fontSize: 11.5,
    color: '#0e7490',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  fsUnassigned: { color: '#dc2626' },
  fsTopic: {
    fontSize: 12.5,
    color: '#475569',
    marginTop: 2,
    fontStyle: 'italic',
  },
  fsLink: {
    fontSize: 12.5,
    color: '#0ea5e9',
    marginTop: 2,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  mineRow: { padding: 12 },
  mineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  mineKind: {
    // flexShrink so a long name yields instead of pushing the time off the
    // screen: «Встреча со старейшинами и помощниками собрания» ran past the
    // right edge and took the time with it. Four kinds of row share this
    // header, so the fix belongs to the style, not to any one of them.
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  mineTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  mineTime: { flexShrink: 0 },
  mineMeta: { fontSize: 12.5, color: '#64748b', marginTop: 1 },
  partsBox: { marginTop: 8, gap: 3 },
  partSection: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    marginTop: 3,
  },
  partRow: { fontSize: 13.5, color: '#0f172a' },
  taskHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  kindChip: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  visitTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0e7490',
  },
  visitRange: { fontSize: 12.5, color: '#0891b2', marginTop: 1 },
  cleaningLine: {
    fontSize: 12.5,
    color: '#0d9488',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 3,
  },
  talkAway: {
    fontSize: 12.5,
    color: '#7c3aed',
    marginTop: 3,
    fontFamily: 'Manrope_500Medium',
  },
  visitType: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0891b2',
    marginBottom: 1,
  },
  congressBanner: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  congressTitle: { color: '#92400e' },
  congressText: { color: '#b45309' },
  coNote: {
    fontSize: 12.5,
    color: '#7c3aed',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 2,
  },
  absenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  absenceText: {
    fontSize: 13.5,
    color: '#64748b',
    fontFamily: 'Manrope_500Medium',
  },
  absenceNote: { fontSize: 12.5, color: '#94a3b8', marginTop: 1 },
  farToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
  },
  farToggleTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  farToggleHint: { fontSize: 12.5, color: '#94a3b8' },
  // A day's rows sit slightly inset, so the eye sees they belong to the
  // header above rather than floating on their own.
  dayBody: { gap: 6, paddingLeft: 10 },
  generalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: '#f5f3ff',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  generalBadgeText: {
    fontSize: 11.5,
    color: '#7c3aed',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  greeting: { marginBottom: 14 },
  kindChip: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  feedCard: {
    paddingVertical: 14,
    borderLeftWidth: 4,
    borderRadius: 14,
    overflow: 'hidden',
  },
  greetingText: { fontSize: 22, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', color: '#0f172a' },
  greetingDate: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  // Два значка стоят рядом и переносятся на узком экране, а не жмутся.
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  auxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#E1F5EE',
  },
  auxBadgeText: { fontSize: 12, fontWeight: '600', color: '#0F6E56' },
  // Назначение — свой тихий цвет, чтобы не спорить с пионерским значком.
  appointmentBadge: { backgroundColor: '#EDEAF7' },
  appointmentBadgeText: { color: '#4C4088' },
  // Период ещё впереди — тот же значок, но приглушённый: это не «сейчас».
  auxBadgeAhead: { backgroundColor: '#E8EFF6' },
  auxBadgeAheadText: { color: '#3F6C8F' },
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  reportCardDue: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  reportCardDone: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  reportText: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  reportTextDue: { color: '#92400e' },
  reportTextDone: { color: '#166534' },
  actionStrip: { marginHorizontal: -16, marginBottom: 4 },
  actionStripContent: { paddingHorizontal: 16, gap: 14 },
  actionItem: { alignItems: 'center', width: 78 },
  actionCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  actionLabel: {
    fontSize: 10.5,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  link: { fontSize: 14, color: '#0ea5e9', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
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
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
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
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  meetingDate: {
    fontSize: 17,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
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
  partsTitle: { fontSize: 12, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1', marginBottom: 4 },
  partRow: { fontSize: 14, color: '#0f172a', marginTop: 2 },
  myPartItem: { marginTop: 6 },
  partSubsection: {
    fontSize: 10,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
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
  eventTitle: { fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  eventSubsection: {
    fontSize: 11,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
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
  evDay: { fontSize: 20, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1' },
  evMon: {
    fontSize: 11,
    color: '#0369a1',
    textTransform: 'uppercase',
    marginTop: 1,
  },
  evRangeNum: { fontSize: 14, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1' },
  evTypeTag: {
    fontSize: 11,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  evRange: { fontSize: 13, color: '#0369a1', fontWeight: '500', fontFamily: 'Manrope_500Medium', marginTop: 2 },
  evMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  fsUnassigned: { color: '#cbd5e1' },
  fsTopic: {
    fontSize: 13,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 4,
  },
  fsLink: { fontSize: 13, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold', marginTop: 6 },
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
  tileLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
});
