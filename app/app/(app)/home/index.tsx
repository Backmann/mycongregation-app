import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { capitalizeFirst } from "../../../lib/relative-time";
import {
  AttendanceCard,
  useAttendanceDue,
} from "../../../components/AttendanceCard";
import {
  ReportCollectionCard,
  useReportCollection,
} from "../../../components/ReportCollectionCard";
import { usePermissions } from "../../../lib/permissions";
import {
  Absence,
  Assignment,
  MyCoVisitItem,
  Publisher,
  SpecialEvent,
  absencesApi,
  assignmentsApi,
  auxiliaryPioneersApi,
  coVisitItemsApi,
  fieldServiceApi,
  meApi,
  meetingSettingsApi,
  publishersApi,
  serviceGroupsApi,
  serviceReportsApi,
  specialEventsApi,
  tasksApi,
} from "../../../lib/api";
import { addDays, formatDateISO, startOfWeekMonday } from "../../../lib/dates";
import { useAuth } from "../../../lib/auth";
import { useMyPublisher } from "../../../lib/useMyPublisher";
import {
  auxMonthSinceLabel,
  auxPeriodLabel,
} from "../../../lib/aux-pioneer-period";
import { monthLabel } from "../../../lib/month-label";
import { LoadError } from "../../../components/LoadError";
import {
  meetingPartLabel,
  taskMeta,
  taskSubsectionLabel,
  taskTitle,
  taskVisual,
} from "../../../lib/my-tasks";
import {
  DayGroup,
  MeetingEntry,
  MyPartLine,
  TimelineEntry,
  buildTimeline,
} from "../../../lib/home-timeline";
import { digestHome, entryTime } from "../../../lib/home-digest";
import { partDisplay } from "../../../lib/part-display";
import { MyGlowRow } from "../../../components/MyGlowRow";
import { WindowsPlanDialog } from "../../../components/WindowsPlan";
import { SECTION_COLORS, SectionKind } from "../../../lib/section-colors";
import { isCongressEvent } from "../../../lib/week-rules";

/*
 * HOME, REBUILT (26 September) — the screen is the face of the app, so it
 * answers the person's own questions in the order they are asked:
 *
 *   1. who and when — a short greeting with one's own standing;
 *   2. «Ваше ближайшее» — the next thing that is theirs, large, with the one
 *      after it in a line (lib/home-digest.ts picks it);
 *   3. «Нужно сделать» — what only they can do: the report, contacts, tasks,
 *      attendance, the collection; no heading when there is nothing;
 *   4. «Две недели» — the same rows the Programme feed draws: the date large
 *      on the left, what the meeting is about, their own line with a dot;
 *      every row opens its meeting in the Programme;
 *   5. «Скоро» — a convention, a visit, the Memorial beyond the two weeks;
 *   6. «Все мои назначения · ещё N».
 *
 * Gone, each for a reason Lionel agreed to: the row of round buttons (every
 * one of them is one tap away in a tab — «Служение», «Программа»,
 * «Собрание»), the hall's address on every card (it is said only when a
 * meeting is somewhere else), the collapsed «Дальше» (the same list as «Все
 * мои назначения»), and one's own name written twice on a visit.
 */

/**
 * Parts whose stored title is a TOPIC, not what the person does: the card
 * names the role and puts the topic under it.
 */
const ROLE_PARTS = new Set([
  "watchtower_conductor",
  "public_talk_speaker",
  "cbs_conductor",
]);

/** Two columns from this width; the content never grows past MAX_WIDTH. */
const WIDE_FROM = 900;
const MAX_WIDTH = 1000;
const NEAR_DAYS = 14;

/**
 * The clock the screen reads. A tablet left open on Home used to keep
 * «Завтра» for yesterday: the day was taken once, at render. It is now read
 * every minute and whenever the app comes back to the front.
 */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 60 * 1000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");

function SkeletonBar({
  width,
  height = 14,
}: {
  width: string;
  height?: number;
}) {
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
        backgroundColor: "#cbd5e1",
        opacity: pulse,
      }}
    />
  );
}

/** Placeholder shaped like the card it stands for — no layout jumps. */
function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <View style={[s.quietCard, { gap: 12 }]}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ gap: 6 }}>
          <SkeletonBar width={i % 2 ? "55%" : "70%"} />
          <SkeletonBar width="38%" height={10} />
        </View>
      ))}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={s.sectionLabel} accessibilityRole="header">
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// 1. The greeting
// ---------------------------------------------------------------------------

function GreetingHeader({ now }: { now: Date }) {
  const { t, i18n } = useTranslation();
  const { myPublisher } = useMyPublisher();
  const currentMonth = `${formatDateISO(now).slice(0, 7)}-01`;
  const { data: auxStatus } = useQuery({
    queryKey: ["aux-pioneers", "mine", currentMonth],
    queryFn: () => auxiliaryPioneersApi.mine(currentMonth),
  });
  const hour = now.getHours();
  const key =
    hour >= 5 && hour < 11
      ? "morning"
      : hour >= 11 && hour < 17
        ? "day"
        : hour >= 17 && hour < 23
          ? "evening"
          : "night";
  const name = myPublisher?.firstName ?? "";
  const dateLine = now.toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // «До отмены» — единственный случай без конца, и только он заслуживает
  // знака бесконечности.
  const endlessAux = !!auxStatus?.current?.untilCancelled;

  // Своё назначение, и только своё: главная — экран про себя. Полным словом:
  // «Пом. собр.» было сокращением там, где места хватает на «Помощник
  // собрания».
  const appointment = myPublisher?.appointment ?? "none";
  const appointmentLabel =
    appointment === "elder"
      ? t("publishers.appointment.elder")
      : appointment === "ministerial_servant"
        ? t("publishers.appointment.ministerial_servant")
        : null;

  // Тип пионерского служения — СОСТОЯНИЕ; подсобное — СРОК.
  const pioneerType = myPublisher?.pioneerType ?? "none";
  const namedPioneer = ["regular", "special", "missionary"].includes(
    pioneerType,
  );
  const nowLabel = namedPioneer
    ? t(`publishers.pioneer.detail.${pioneerType}`)
    : auxStatus?.current
      ? t("auxPioneer.badgeServing", {
          period: auxPeriodLabel(t, i18n.language, auxStatus.current, {
            hideCurrentYear: true,
          }),
        })
      : null;
  const aheadLabel =
    !nowLabel && auxStatus?.upcoming
      ? t("auxPioneer.badgeUpcoming", {
          month: auxMonthSinceLabel(
            i18n.language,
            auxStatus.upcoming.startMonth,
            {
              hideCurrentYear: true,
            },
          ),
        })
      : null;

  return (
    <View style={s.greeting}>
      <Text style={s.greetingText}>
        {t(`home.greeting.${key}`)}
        {name ? `, ${name}` : ""}
      </Text>
      <View style={s.greetingLine}>
        <Text style={s.greetingDate}>{capitalizeFirst(dateLine)}</Text>
        {appointmentLabel ? (
          <View style={[s.badge, s.appointmentBadge]}>
            <Ionicons name="ribbon-outline" size={12} color="#4C4088" />
            <Text style={[s.badgeText, s.appointmentBadgeText]}>
              {appointmentLabel}
            </Text>
          </View>
        ) : null}
        {nowLabel ? (
          <View style={s.badge}>
            <Ionicons
              name={endlessAux ? "infinite" : "leaf-outline"}
              size={12}
              color="#0F6E56"
            />
            <Text style={s.badgeText}>{nowLabel}</Text>
          </View>
        ) : aheadLabel ? (
          <View style={[s.badge, s.badgeAhead]}>
            <Ionicons name="calendar-outline" size={12} color="#3F6C8F" />
            <Text style={[s.badgeText, s.badgeAheadText]}>{aheadLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 3. «Нужно сделать»
// ---------------------------------------------------------------------------

/** One's own report for the month just closed: due, handed in, or nothing. */
function useReportStanding() {
  const { canViewServiceSummary } = usePermissions();
  const { data } = useQuery({
    queryKey: ["reports", "my-standing"],
    queryFn: () => serviceReportsApi.myStanding(),
    staleTime: 5 * 60 * 1000,
  });
  const collection = useReportCollection();
  if (!data || !data.applicable || !data.reportMonth) return null;
  // Кто собирает отчёты, видит карточку сбора — и в ней уже есть он сам.
  // Скрывается ТОЛЬКО зелёное «сдан»; несданный — это дело при любых правах.
  if (data.submitted && canViewServiceSummary && collection) return null;
  return { submitted: !!data.submitted, reportMonth: data.reportMonth };
}

function usePending() {
  const { data } = useQuery({
    queryKey: ["me", "pending"],
    queryFn: () => meApi.pending(),
    staleTime: 5 * 60 * 1000,
  });
  return data && data.items.length > 0 ? data : null;
}

function Strip({
  icon,
  text,
  sub,
  onPress,
  tone = "due",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  sub?: string | null;
  onPress: () => void;
  tone?: "due" | "done";
}) {
  const due = tone === "due";
  return (
    <Pressable
      style={({ pressed }) => [
        s.strip,
        due ? s.stripDue : s.stripDone,
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={20} color={due ? "#b45309" : "#16794f"} />
      <View style={{ flex: 1 }}>
        <Text style={[s.stripText, due ? s.stripTextDue : s.stripTextDone]}>
          {text}
        </Text>
        {sub ? (
          <Text style={[s.stripSub, due ? s.stripTextDue : s.stripTextDone]}>
            {sub}
          </Text>
        ) : null}
      </View>
      {due ? (
        <Ionicons name="chevron-forward" size={18} color="#b45309" />
      ) : null}
    </Pressable>
  );
}

/**
 * «Сдан» is said as plainly as «не сдан» (an empty place reads as a fault —
 * decided 21 September), but it is not a thing to do: it sits quietly under
 * the greeting, and only the report still due stands among the tasks.
 */
function ReportDone() {
  const { t, i18n } = useTranslation();
  const report = useReportStanding();
  if (!report?.submitted) return null;
  const month = monthLabel(i18n.language, report.reportMonth, {
    hideCurrentYear: true,
  });
  return (
    <Pressable
      onPress={() => router.push("/service-reports" as never)}
      style={({ pressed }) => [s.reportDone, pressed && { opacity: 0.6 }]}
      accessibilityRole="link"
    >
      <Ionicons name="checkmark-circle" size={16} color="#16794f" />
      <Text style={s.reportDoneText}>
        {t("home.report.submitted", { month })}
      </Text>
    </Pressable>
  );
}

function TodoSection() {
  const { t, i18n } = useTranslation();
  const report = useReportStanding();
  const pending = usePending();
  const collection = useReportCollection();
  const attendance = useAttendanceDue();
  const reportDue = !!report && !report.submitted;
  if (!reportDue && !pending && !collection && !attendance) return null;

  const dayMonth = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "long",
    });

  return (
    <View style={s.section}>
      <SectionLabel>{t("home.todo.title")}</SectionLabel>
      {reportDue && report ? (
        <Strip
          icon="document-text-outline"
          text={t("home.todo.report", {
            month: monthLabel(i18n.language, report.reportMonth, {
              hideCurrentYear: true,
            }),
          })}
          onPress={() =>
            router.push(
              `/service-reports/new?reportMonth=${report.reportMonth}` as never,
            )
          }
        />
      ) : null}
      {pending?.items.map((item) => {
        const isTask = item.kind === "task";
        const label = isTask
          ? item.dueOn
            ? t(
                item.overdue
                  ? "home.pending.taskOverdue"
                  : "home.pending.taskDue",
                {
                  title: item.title ?? "",
                  date: dayMonth(item.dueOn),
                },
              )
            : (item.title ?? "")
          : t("home.pending.contacts");
        return (
          <Strip
            key={item.id ?? item.kind}
            icon={isTask ? "checkbox-outline" : "call-outline"}
            text={label}
            onPress={() =>
              router.push(
                (isTask ? "/profile/my-tasks" : "/profile/contacts") as never,
              )
            }
          />
        );
      })}
      {pending && pending.more > 0 ? (
        <Strip
          icon="ellipsis-horizontal"
          text={t("home.pending.more", { count: pending.more })}
          onPress={() => router.push("/profile/my-tasks" as never)}
        />
      ) : null}
      <ReportCollectionCard />
      <AttendanceCard />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared bits of rows
// ---------------------------------------------------------------------------

const KIND_COLOR: Record<string, string> = {
  midweek: "#2563eb",
  weekend: "#7c3aed",
  field_service: "#16a34a",
  event: "#b45309",
  memorial: "#b45309",
};

/** Section hue for one's own row, by what it is. */
function ownKind(en: TimelineEntry): SectionKind {
  if (en.type === "meeting")
    return en.kind === "field_service" ? "field_service" : "meeting";
  if (en.type === "task") {
    const k = en.task.item.kind;
    return k === "cleaning"
      ? "cleaning"
      : k === "cart" || k === "field_service"
        ? "field_service"
        : "meeting";
  }
  if (en.type === "co_visit")
    return en.item.kind === "field_service" ? "field_service" : "meeting";
  return "meeting";
}

/** Where a row leads: its meeting in the Programme, or its own page. */
function openEntry(en: TimelineEntry) {
  if (en.type === "meeting") {
    if (en.replacedBy && !en.memorial) {
      router.push(`/special-events/${en.replacedBy.id}` as never);
      return;
    }
    if (!en.weekStartISO) return;
    const meeting = en.memorial
      ? "memorial"
      : en.kind === "field_service"
        ? "field"
        : en.kind;
    router.push({
      pathname: "/schedule",
      params:
        meeting === "field"
          ? { week: en.weekStartISO, meeting, day: en.dateISO }
          : { week: en.weekStartISO, meeting },
    } as never);
    return;
  }
  if (en.type === "event" || en.type === "visit") {
    router.push(`/special-events/${en.event.id}` as never);
  }
}

function canOpen(en: TimelineEntry): boolean {
  if (en.type === "meeting") return !!en.weekStartISO || !!en.replacedBy;
  return en.type === "event" || en.type === "visit";
}

function Chip({
  text,
  tone,
  mine,
}: {
  text: string;
  tone: "green" | "teal" | "blue";
  mine?: boolean;
}) {
  const palette = mine
    ? { bg: "#ffedd5", fg: "#9a3412" }
    : tone === "green"
      ? { bg: "#f0fdf4", fg: "#15803d" }
      : tone === "teal"
        ? { bg: "#ecfeff", fg: "#0e7490" }
        : { bg: "#eff6ff", fg: "#1d4ed8" };
  return (
    <View style={[s.chip, { backgroundColor: palette.bg }]}>
      {mine ? <View style={[s.dot, { backgroundColor: "#f97316" }]} /> : null}
      <Text style={[s.chipText, { color: palette.fg }]}>{text}</Text>
    </View>
  );
}

/** A part line in its pieces: the part, «помощник», and the pair. */
function partText(p: MyPartLine, t: TFunction): string {
  const label = p.label ?? p.title;
  return p.asAssistant ? `${label} — ${t("home.meeting.asAssistant")}` : label;
}

function whenLabel(
  dateISO: string,
  time: string | null,
  locale: string,
): string {
  const day = capitalizeFirst(
    new Date(`${dateISO}T00:00:00`).toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
  );
  return time ? `${day} · ${time}` : day;
}

/** «сегодня», «через 2 часа», «завтра», «через 4 дня». */
function relativeLabel(
  dateISO: string,
  time: string | null,
  now: Date,
  todayISO: string,
  t: TFunction,
): string {
  const days = Math.round(
    (new Date(`${dateISO}T00:00:00`).getTime() -
      new Date(`${todayISO}T00:00:00`).getTime()) /
      86400000,
  );
  if (days === 0) {
    if (time && /^\d{1,2}:\d{2}/.test(time)) {
      const [h, m] = time.split(":").map(Number);
      const mins = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
      if (mins <= 0) return t("home.next.nowOn");
      if (mins < 60) return t("home.next.inMinutes", { count: mins });
      return t("home.next.inHours", { count: Math.floor(mins / 60) });
    }
    return t("home.next.today");
  }
  if (days === 1) return t("home.next.tomorrow");
  return t("home.next.inDays", { count: days });
}

function absenceRange(a: Absence, locale: string): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" } : {}),
    });
  if (!a.endDate || a.endDate === a.startDate) return fmt(a.startDate, true);
  return `${fmt(a.startDate, a.startDate.slice(0, 4) !== a.endDate.slice(0, 4))} – ${fmt(a.endDate, true)}`;
}

function coVisitKindLabel(kind: string, t: TFunction): string {
  switch (kind) {
    case "accommodation":
      return t("coVisit.accTitle");
    case "field_service":
      return t("coVisit.fieldServiceTitle");
    case "lunch":
      return t("coVisit.lunchesTitle");
    case "lunch_box":
      return t("coVisit.lunchBoxTitle");
    case "pastoral":
      return t("coVisit.pastoralTitle");
    case "pioneers":
      return t("coVisit.pioneersTitle");
    default:
      return t("coVisit.eldersTitle");
  }
}

function coVisitWithLabel(it: MyCoVisitItem, t: TFunction): string | null {
  if (it.kind === "accommodation") return t("coVisit.accMine");
  if (it.kind !== "field_service" || !it.serviceWith) return null;
  return it.serviceWith === "wife"
    ? t("coVisit.mineWithWife")
    : it.serviceWith === "joint"
      ? t("coVisit.mineJoint")
      : t("coVisit.mineWithCo");
}

function coVisitPlace(it: MyCoVisitItem): string {
  return it.placeKind === "cart_location"
    ? (it.cartLocationName ?? "")
    : (it.placeText ?? "");
}

/** The name of a field-service meeting: the visit, a group's, the combined one. */
function fieldTitle(en: MeetingEntry, t: TFunction): string {
  if (en.serviceOverseerVisit) return t("feed.fieldVisitTitle");
  if (en.isGeneral) return t("feed.fieldGeneral");
  return t("feed.fieldOpen");
}

/** «Ваша группа Ahlen · Marktplatz 1» — whose meeting and where. */
function fieldWhere(
  en: MeetingEntry,
  myGroupName: string | null,
  t: TFunction,
): string {
  const group = en.groupName
    ? en.groupName === myGroupName
      ? t("home.list.yourGroup", { name: en.groupName })
      : t("feed.fieldGroup", { group: en.groupName })
    : null;
  return [group, en.address].filter(Boolean).join(" · ");
}

/** Who goes: the conductor and, on a visit, the overseer and his assistant. */
function FieldPeople({
  en,
  myName,
}: {
  en: MeetingEntry;
  myName: string | null;
}) {
  const { t } = useTranslation();
  const chips: React.ReactNode[] = [];
  if (en.conductorName) {
    chips.push(
      <Chip
        key="c"
        tone="green"
        text={t("home.list.conducts", { name: en.conductorName })}
        mine={en.myRole === "conduct"}
      />,
    );
  } else if (en.unassignedConductor && en.weekStartISO) {
    chips.push(
      <Chip
        key="c"
        tone="green"
        text={t("home.list.conducts", { name: t("fieldService.unassigned") })}
      />,
    );
  }
  if (en.visitPeople?.overseer) {
    chips.push(
      <Chip
        key="o"
        tone="teal"
        text={`${t("fieldService.overseer")}: ${en.visitPeople.overseer}`}
        mine={en.myRole === "overseer" || en.visitPeople.overseer === myName}
      />,
    );
  }
  if (en.visitPeople?.assistant) {
    chips.push(
      <Chip
        key="a"
        tone="teal"
        text={`${t("fieldService.overseerAssistant")}: ${en.visitPeople.assistant}`}
        mine={en.myRole === "assistant" || en.visitPeople.assistant === myName}
      />,
    );
  }
  return chips.length ? <View style={s.chips}>{chips}</View> : null;
}

// ---------------------------------------------------------------------------
// 2. «Ваше ближайшее»
// ---------------------------------------------------------------------------

function NextCard({
  entry,
  following,
  awayDuring,
  isFar,
  now,
  todayISO,
  myGroupName,
  myName,
  onWindows,
}: {
  entry: TimelineEntry;
  following: TimelineEntry | null;
  awayDuring: Absence | null;
  isFar: boolean;
  now: Date;
  todayISO: string;
  myGroupName: string | null;
  myName: string | null;
  onWindows: (w: number[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;

  // Nothing of one's own in the two weeks: a quiet card that still says
  // when the next thing is, and leads to the full list.
  if (isFar) {
    return (
      <View style={s.section}>
        <SectionLabel>{t("home.next.title")}</SectionLabel>
        <Pressable
          style={({ pressed }) => [s.quietCard, pressed && { opacity: 0.7 }]}
          onPress={() => router.push("/home/my-assignments" as never)}
          accessibilityRole="link"
        >
          <Text style={s.quietTitle}>{t("home.next.nothingNear")}</Text>
          <Text style={s.quietSub}>
            {t("home.next.following", {
              when: shortDay(entry.dateISO, loc),
              what: shortWhat(entry, t),
            })}
          </Text>
        </Pressable>
      </View>
    );
  }

  const kind = ownKind(entry);
  const time = entryTime(entry);
  const tone = SECTION_COLORS[kind].color;
  const body = (
    <NextBody
      entry={entry}
      myGroupName={myGroupName}
      myName={myName}
      onWindows={onWindows}
    />
  );
  const pressable = canOpen(entry);

  return (
    <View style={s.section}>
      <SectionLabel>{t("home.next.title")}</SectionLabel>
      <Pressable
        onPress={pressable ? () => openEntry(entry) : undefined}
        disabled={!pressable}
        accessibilityRole={pressable ? "button" : undefined}
        style={({ pressed }) => pressed && { opacity: 0.85 }}
      >
        <MyGlowRow kind={kind} radius={16} style={s.nextCard}>
          <View style={s.nextHead}>
            <View style={[s.nextDot, { backgroundColor: tone }]} />
            <Text style={[s.nextWhen, { color: darker(kind) }]}>
              {whenLabel(entry.dateISO, time, loc)}
            </Text>
            <Text style={[s.nextRel, { color: darker(kind) }]}>
              {relativeLabel(entry.dateISO, time, now, todayISO, t)}
            </Text>
          </View>
          {body}
          {awayDuring ? (
            <View style={s.awayNote}>
              <Ionicons name="warning-outline" size={17} color="#b45309" />
              <Text style={s.awayText}>
                {t("home.next.away", { range: absenceRange(awayDuring, loc) })}
              </Text>
            </View>
          ) : null}
        </MyGlowRow>
      </Pressable>
      {following ? (
        <Text style={s.followingLine}>
          {t("home.next.following", {
            when: shortDay(following.dateISO, loc),
            what: shortWhat(following, t),
          })}
        </Text>
      ) : null}
    </View>
  );
}

function darker(kind: SectionKind): string {
  return kind === "field_service"
    ? "#15803d"
    : kind === "cleaning"
      ? "#0369a1"
      : kind === "duty"
        ? "#b91c1c"
        : "#c2410c";
}

function shortDay(dateISO: string, loc: string): string {
  return new Date(`${dateISO}T00:00:00`).toLocaleDateString(loc, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** One short phrase for «Следующее — …»: the first own line of the row. */
function shortWhat(en: TimelineEntry, t: TFunction): string {
  const lower = (x: string) => (x ? x.charAt(0).toLowerCase() + x.slice(1) : x);
  if (en.type === "meeting") {
    const p = en.myParts[0];
    // A talk is named by its title, and a title keeps its capital letter.
    if (p?.partKey === "treasures_talk")
      return t("home.next.talkNamed", { title: p.label ?? p.title });
    if (p) return lower(partText(p, t));
    if (en.weeklyCleaning)
      return lower(t("home.timeline.cleaningAfterMeeting"));
    return lower(
      t(`home.eventTypes.${en.kind === "field_service" ? "midweek" : en.kind}`),
    );
  }
  if (en.type === "task") return lower(taskTitle(en.task.item, t));
  if (en.type === "outgoing_talk")
    return lower(t("home.timeline.outgoingTalk"));
  if (en.type === "co_visit") return lower(coVisitKindLabel(en.item.kind, t));
  return "";
}

function NextBody({
  entry,
  myGroupName,
  myName,
  onWindows,
}: {
  entry: TimelineEntry;
  myGroupName: string | null;
  myName: string | null;
  onWindows: (w: number[]) => void;
}) {
  const { t, i18n } = useTranslation();
  if (entry.type === "meeting" && entry.kind !== "field_service") {
    const kindName = entry.memorial
      ? t("home.eventTypes.memorial")
      : t(`home.eventTypes.${entry.kind}`);
    const lines = [...entry.myParts];
    // What the meeting is about — unless that is his own part already said.
    const ownTitles = new Set(
      lines.flatMap((p) => [p.label ?? p.title, p.topic ?? ""]),
    );
    const aboutTitle = entry.memorial ? entry.memorial.title : entry.title;
    const about = [
      aboutTitle && !ownTitles.has(aboutTitle) ? aboutTitle : null,
      entry.speaker,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <>
        <View style={{ gap: 6 }}>
          {lines.map((p, i) => (
            <View key={i} style={{ gap: 2 }}>
              <View style={s.partLine}>
                <Text style={i === 0 ? s.nextMain : s.nextSecond}>
                  {partText(p, t)}
                </Text>
                {p.partnerName ? (
                  <Chip
                    tone="blue"
                    text={t("home.next.pair", { name: p.partnerName })}
                  />
                ) : null}
              </View>
              {p.topic ? <Text style={s.nextTopic}>«{p.topic}»</Text> : null}
            </View>
          ))}
          {entry.weeklyCleaning ? (
            <Text style={lines.length ? s.nextSecond : s.nextMain}>
              {t("home.timeline.cleaningAfterMeeting")}
            </Text>
          ) : null}
          {!entry.atHall && entry.address ? (
            <Text style={s.nextPlace}>{entry.address}</Text>
          ) : null}
        </View>
        <View style={s.nextFoot}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text
              style={[
                s.nextFootKind,
                {
                  color: entry.memorial
                    ? KIND_COLOR.memorial
                    : KIND_COLOR[entry.kind],
                },
              ]}
            >
              {kindName}
            </Text>
            {about ? (
              <Text style={s.nextFootAbout} numberOfLines={2}>
                {about}
              </Text>
            ) : null}
          </View>
          <Text style={s.nextFootLink}>{t("home.next.programme")} ›</Text>
        </View>
      </>
    );
  }
  if (entry.type === "meeting") {
    // Field service.
    const title =
      entry.myRole === "conduct"
        ? t("home.next.fieldConduct")
        : entry.myRole === "overseer"
          ? t("home.feed.youVisitAsOverseer")
          : entry.myRole === "assistant"
            ? t("home.feed.youVisitAsAssistant")
            : fieldTitle(entry, t);
    const where = fieldWhere(entry, myGroupName, t);
    return (
      <View style={{ gap: 6 }}>
        <Text style={s.nextMain}>{title}</Text>
        {entry.serviceOverseerVisit && entry.myRole ? (
          <Text style={s.nextSecond}>{t("feed.fieldVisitTitle")}</Text>
        ) : null}
        {where ? <Text style={s.nextPlace}>{where}</Text> : null}
        <FieldPeople en={entry} myName={myName} />
        {entry.topic ? <Text style={s.topic}>{entry.topic}</Text> : null}
      </View>
    );
  }
  if (entry.type === "task") {
    const it = entry.task.item;
    const windows =
      it.kind === "cleaning" && it.windows?.length ? it.windows : null;
    return (
      <View style={{ gap: 6 }}>
        {taskSubsectionLabel(it, t) ? (
          <Text style={s.nextOverline}>{taskSubsectionLabel(it, t)}</Text>
        ) : null}
        <Text style={s.nextMain}>{taskTitle(it, t)}</Text>
        <Text style={s.nextPlace}>
          {taskMeta(entry.task, t, i18n.language)}
        </Text>
        {windows ? (
          <Pressable
            onPress={() => onWindows(windows)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={s.link}>
              {t("home.cleaning.windows", { list: windows.join(", ") })} ·{" "}
              {t("home.next.onPlan")} ›
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  if (entry.type === "outgoing_talk") {
    const it = entry.task.item;
    const where = [it.congregationName, it.location]
      .filter(Boolean)
      .join(" · ");
    return (
      <View style={{ gap: 6 }}>
        <Text style={[s.nextOverline, { color: KIND_COLOR.weekend }]}>
          {t("home.timeline.outgoingTalk")}
        </Text>
        <Text style={s.nextMain}>{taskTitle(it, t)}</Text>
        {where ? <Text style={s.nextPlace}>{where}</Text> : null}
        {it.mapUrl ? (
          <Pressable
            onPress={() => Linking.openURL(it.mapUrl as string).catch(() => {})}
            hitSlop={8}
          >
            <Text style={s.link}>{t("home.timeline.openMap")} ›</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  if (entry.type === "co_visit") {
    const it = entry.item;
    const wl = coVisitWithLabel(it, t);
    const place = coVisitPlace(it);
    return (
      <View style={{ gap: 6 }}>
        <Text style={s.nextMain}>{coVisitKindLabel(it.kind, t)}</Text>
        {wl ? <Text style={s.nextSecond}>{wl}</Text> : null}
        {place ? <Text style={s.nextPlace}>{place}</Text> : null}
        {it.note ? <Text style={s.topic}>{it.note}</Text> : null}
      </View>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. «Две недели»
// ---------------------------------------------------------------------------

function MineLine({ text }: { text: string }) {
  return (
    <View style={s.mineLine}>
      <View style={[s.dot, { backgroundColor: "#f97316" }]} />
      <Text style={s.mineText}>{text}</Text>
    </View>
  );
}

function EntryBody({
  en,
  nextKey,
  todayISO,
  myGroupName,
  myName,
}: {
  en: TimelineEntry;
  nextKey: string | null;
  todayISO: string;
  myGroupName: string | null;
  myName: string | null;
}) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const isNext = en.key === nextKey;
  const tomorrow = formatDateISO(addDays(new Date(`${todayISO}T00:00:00`), 1));
  const dayWord =
    en.dateISO === todayISO
      ? t("home.timeline.today").toLowerCase()
      : en.dateISO === tomorrow
        ? t("home.timeline.tomorrow").toLowerCase()
        : null;
  const overline = (kindName: string, color: string, time: string | null) => (
    <Text style={[s.rowKind, { color }]}>
      {[kindName, time, dayWord].filter(Boolean).join(" · ")}
    </Text>
  );

  if (en.type === "meeting" && en.replacedBy && !en.memorial) {
    const e = en.replacedBy;
    return (
      <>
        {overline(
          e.type
            ? t(`specialEvents.types.${e.type}`, e.type)
            : t("feed.kindSpecial"),
          KIND_COLOR.event,
          e.time ?? null,
        )}
        <Text style={s.rowTitle}>{e.title}</Text>
        {e.address ? <Text style={s.rowSub}>{e.address}</Text> : null}
      </>
    );
  }
  if (en.type === "meeting" && en.kind !== "field_service") {
    const mine = isNext
      ? t("home.list.mineAbove")
      : [
          // The first talk names the weekday's row; when it is his, the row
          // already says its title, and the line says only that it is his.
          ...en.myParts.map((p) =>
            p.partKey === "treasures_talk" && (p.label ?? p.title) === en.title
              ? t("home.list.talkIsYours")
              : partText(p, t),
          ),
          ...(en.weeklyCleaning
            ? [t("home.timeline.cleaningAfterMeeting")]
            : []),
        ].join(" · ");
    return (
      <>
        {overline(
          en.memorial
            ? t("home.eventTypes.memorial")
            : t(
                en.kind === "midweek" ? "feed.kindMidweek" : "feed.kindWeekend",
              ),
          en.memorial ? KIND_COLOR.memorial : KIND_COLOR[en.kind],
          en.time || null,
        )}
        <Text style={s.rowTitle}>
          {en.memorial
            ? en.memorial.title
            : (en.title ?? t(`home.eventTypes.${en.kind}`))}
        </Text>
        {en.speaker ? <Text style={s.rowSub}>{en.speaker}</Text> : null}
        {!en.atHall && en.address ? (
          <Text style={s.rowSub}>{en.address}</Text>
        ) : null}
        {mine ? <MineLine text={mine} /> : null}
      </>
    );
  }
  if (en.type === "meeting") {
    const where = fieldWhere(en, myGroupName, t);
    const mine = en.myRole ? (isNext ? t("home.list.mineAbove") : null) : null;
    return (
      <>
        {overline(
          t("feed.kindField"),
          KIND_COLOR.field_service,
          en.time || null,
        )}
        <Text style={s.rowTitle}>{fieldTitle(en, t)}</Text>
        {where ? <Text style={s.rowPlain}>{where}</Text> : null}
        <FieldPeople en={en} myName={myName} />
        {en.fieldNote?.kind === "onlyFor" ? (
          <Text style={s.rowNote}>
            {t("feed.fieldOnlyFor", { group: en.fieldNote.groupName })}
          </Text>
        ) : null}
        {en.folded ? (
          <Text style={s.rowQuiet}>
            {en.folded.kind === "groupOnVisit"
              ? t("home.list.groupOnVisit")
              : t("home.list.youOnVisit", { count: en.folded.count })}
          </Text>
        ) : null}
        {en.topic ? <Text style={s.topic}>{en.topic}</Text> : null}
        {en.sourceUrl ? (
          <Pressable
            onPress={() =>
              Linking.openURL(en.sourceUrl as string).catch(() => {})
            }
            hitSlop={6}
          >
            <Text style={s.link}>{t("fieldService.openLink")}</Text>
          </Pressable>
        ) : null}
        {mine ? <MineLine text={mine} /> : null}
      </>
    );
  }
  if (en.type === "task") {
    const it = en.task.item;
    const v = taskVisual(it);
    return (
      <>
        <Text style={[s.rowKind, { color: v.color }]}>
          {[taskSubsectionLabel(it, t), entryTime(en), dayWord]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <Text style={s.rowTitle}>{taskTitle(it, t)}</Text>
        <MineLine
          text={isNext ? t("home.list.mineAbove") : t("home.list.mine")}
        />
      </>
    );
  }
  if (en.type === "outgoing_talk") {
    const it = en.task.item;
    return (
      <>
        {overline(
          t("home.timeline.outgoingTalk"),
          KIND_COLOR.weekend,
          it.time ?? null,
        )}
        <Text style={s.rowTitle}>{taskTitle(it, t)}</Text>
        {it.congregationName ? (
          <Text style={s.rowSub}>{it.congregationName}</Text>
        ) : null}
        <MineLine
          text={isNext ? t("home.list.mineAbove") : t("home.list.mine")}
        />
      </>
    );
  }
  if (en.type === "co_visit") {
    const it = en.item;
    return (
      <>
        {overline(
          coVisitKindLabel(it.kind, t),
          "#0e7490",
          it.startTime ?? null,
        )}
        {coVisitWithLabel(it, t) ? (
          <Text style={s.rowTitle}>{coVisitWithLabel(it, t)}</Text>
        ) : null}
        {coVisitPlace(it) ? (
          <Text style={s.rowSub}>{coVisitPlace(it)}</Text>
        ) : null}
        <MineLine
          text={isNext ? t("home.list.mineAbove") : t("home.list.mine")}
        />
      </>
    );
  }
  if (en.type === "absence") {
    return (
      <View style={s.absence}>
        <Ionicons name="airplane-outline" size={15} color="#94a3b8" />
        <Text style={s.absenceText}>
          {t("home.timeline.away")} · {absenceRange(en.absence, loc)}
          {en.absence.note ? ` · ${en.absence.note}` : ""}
        </Text>
      </View>
    );
  }
  if (en.type === "visit") {
    const e = en.event;
    const congress = isCongressEvent(e);
    return (
      <View style={[s.banner, congress && s.bannerCongress]}>
        <Ionicons
          name={congress ? "megaphone" : "briefcase"}
          size={17}
          color={congress ? "#b45309" : "#0e7490"}
        />
        <View style={{ flex: 1 }}>
          <Text style={[s.bannerTitle, congress && { color: "#92400e" }]}>
            {congress ? e.title : t("coVisit.mineTitle")}
          </Text>
          <Text style={[s.bannerSub, congress && { color: "#b45309" }]}>
            {eventRange(e, loc)}
          </Text>
        </View>
      </View>
    );
  }
  if (en.type === "elders_meeting") {
    return (
      <>
        {overline(t("agenda.homeRow"), "#534AB7", en.time)}
        {en.place ? <Text style={s.rowSub}>{en.place}</Text> : null}
      </>
    );
  }
  // An event.
  const e = en.event;
  return (
    <>
      {overline(
        e.type
          ? t(`specialEvents.types.${e.type}`, e.type)
          : t("feed.kindSpecial"),
        KIND_COLOR.event,
        e.time ?? null,
      )}
      <Text style={s.rowTitle}>{e.title}</Text>
      {e.address ? <Text style={s.rowSub}>{e.address}</Text> : null}
    </>
  );
}

function eventRange(e: SpecialEvent, loc: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(loc, {
      day: "numeric",
      month: "long",
    });
  return e.endDate && e.endDate !== e.date
    ? `${fmt(e.date)} – ${fmt(e.endDate)}`
    : fmt(e.date);
}

function DayRow({
  group,
  nextKey,
  todayISO,
  myGroupName,
  myName,
}: {
  group: DayGroup;
  nextKey: string | null;
  todayISO: string;
  myGroupName: string | null;
  myName: string | null;
}) {
  const { i18n } = useTranslation();
  const d = new Date(`${group.dateISO}T00:00:00`);
  const weekday = d
    .toLocaleDateString(i18n.language, { weekday: "short" })
    .replace(".", "")
    .toUpperCase();
  const isToday = group.dateISO === todayISO;
  return (
    <View style={s.dayRow}>
      <View style={s.dateCol}>
        <Text style={[s.dateNum, isToday && s.dateToday]}>{d.getDate()}</Text>
        <Text style={[s.dateDow, isToday && s.dateToday]}>{weekday}</Text>
      </View>
      <View style={s.dayEntries}>
        {group.entries.map((en) => {
          const body = (
            <EntryBody
              en={en}
              nextKey={nextKey}
              todayISO={todayISO}
              myGroupName={myGroupName}
              myName={myName}
            />
          );
          return canOpen(en) ? (
            <Pressable
              key={en.key}
              onPress={() => openEntry(en)}
              style={({ pressed }) => [s.entry, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              {body}
            </Pressable>
          ) : (
            <View key={en.key} style={s.entry}>
              {body}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The data, in one place
// ---------------------------------------------------------------------------

function useHomeData(todayISO: string) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { myPublisherId, myPublisher } = useMyPublisher();
  const baseMonday = startOfWeekMonday(new Date(`${todayISO}T00:00:00`));
  const mon0 = formatDateISO(baseMonday);

  const overviewQ = useQuery({
    queryKey: ["meeting-settings"],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 5 * 60 * 1000,
  });
  // Three weeks in ONE request; the end bound is exclusive.
  const fieldServiceQ = useQuery({
    queryKey: ["field-service", "range", mon0],
    queryFn: () =>
      fieldServiceApi.list({
        weekStart: mon0,
        weekEnd: formatDateISO(addDays(baseMonday, 21)),
      }),
    staleTime: 60 * 1000,
  });
  // The published programme — what each meeting is about. The same span and
  // key as the first piece of the Programme feed, so the two share one
  // request.
  const programmeTo = formatDateISO(addDays(baseMonday, 8 * 7));
  const programmeQ = useQuery({
    queryKey: ["assignments", "range", mon0, programmeTo],
    queryFn: () =>
      assignmentsApi.list({
        weekStart: mon0,
        weekEnd: programmeTo,
        limit: 500,
      }),
    staleTime: 60 * 1000,
  });
  const publishersQ = useQuery({
    queryKey: ["publishers", "roster"],
    queryFn: () => publishersApi.roster(),
    staleTime: 5 * 60 * 1000,
  });
  const groupsQ = useQuery({
    queryKey: ["service-groups"],
    queryFn: () => serviceGroupsApi.list({}),
    staleTime: 30 * 60 * 1000,
  });
  const eventsQ = useQuery({
    queryKey: ["special-events", "home"],
    queryFn: () => specialEventsApi.list(),
  });
  const tasksQ = useQuery({
    queryKey: ["me", "assignments"],
    queryFn: () => meApi.assignments(),
    enabled: !!user,
    retry: false,
    staleTime: 60 * 1000,
  });
  const absencesQ = useQuery({
    queryKey: ["absences", "mine", myPublisherId],
    queryFn: () => absencesApi.list({ publisherId: myPublisherId! }),
    enabled: !!myPublisherId,
    retry: false,
    staleTime: 60 * 1000,
  });
  const eldersMeetingsQ = useQuery({
    queryKey: ["tasks", "meetings"],
    queryFn: () => tasksApi.meetings(),
    enabled: user?.role === "admin" || user?.role === "elder",
    retry: false,
  });
  const coVisitQ = useQuery({
    queryKey: ["co-visit-mine"],
    queryFn: () => coVisitItemsApi.mine(),
    staleTime: 60 * 1000,
  });
  const coFieldServiceQ = useQuery({
    queryKey: ["co-visit-field-service"],
    queryFn: () => coVisitItemsApi.fieldService(),
    staleTime: 5 * 60 * 1000,
  });

  const groupNameById = useMemo(
    () =>
      new Map(
        (groupsQ.data?.data ?? []).map((g: { id: string; name: string }) => [
          g.id,
          g.name,
        ]),
      ),
    [groupsQ.data],
  );

  const timeline = useMemo(() => {
    const publishersById = new Map<string, Publisher>(
      (publishersQ.data?.data ?? []).map((p) => [p.id, p]),
    );
    const nameOf = (id: string | null) =>
      id ? (publishersById.get(id)?.displayName ?? null) : null;
    // What each meeting is about, as the feed names it: the weekend by its
    // public talk and speaker (a visiting speaker is stored by name, with his
    // congregation), the weekday by its first talk.
    const meetingTitles = new Map<
      string,
      { title: string | null; speaker: string | null }
    >();
    const byMeeting = new Map<string, Assignment[]>();
    for (const a of programmeQ.data?.data ?? []) {
      const k = `${a.weekStartDate}|${a.eventType}`;
      byMeeting.set(k, [...(byMeeting.get(k) ?? []), a]);
    }
    for (const [k, parts] of byMeeting) {
      const [, eventType] = k.split("|");
      if (eventType === "weekend") {
        const talk = parts.find((p) => p.partKey === "public_talk_speaker");
        if (!talk) continue;
        const who = talk.speakerName?.trim() || nameOf(talk.publisherId);
        const from =
          !talk.publisherId && talk.speakerName?.trim()
            ? talk.speakerCongregation?.trim()
            : null;
        meetingTitles.set(k, {
          title: partDisplay(talk.partKey, talk.partTitle).label,
          speaker: who
            ? from
              ? `${who} · ${from}`
              : who
            : t("feed.speakerUnassigned"),
        });
      } else if (eventType === "midweek") {
        const first = parts.find((p) => p.partKey === "treasures_talk");
        if (first)
          meetingTitles.set(k, {
            title: partDisplay(first.partKey, first.partTitle).label,
            speaker: null,
          });
      }
    }
    return buildTimeline({
      versions: overviewQ.data?.versions ?? [],
      fieldServiceMeetings: fieldServiceQ.data ?? [],
      publishersById,
      groupNameById,
      myServiceGroupId: myPublisher?.serviceGroupId ?? null,
      myPublisherId: myPublisherId ?? null,
      events: eventsQ.data ?? [],
      eldersMeetings: eldersMeetingsQ.data ?? [],
      absences: absencesQ.data ?? [],
      coVisits: coVisitQ.data ?? [],
      coFieldService: coFieldServiceQ.data ?? [],
      myItems: tasksQ.data?.items ?? [],
      todayISO,
      youConductLabel: t("home.feed.youConduct"),
      youVisitLabels: {
        overseer: t("home.feed.youVisitAsOverseer"),
        assistant: t("home.feed.youVisitAsAssistant"),
      },
      resolvePart: (it) => ({
        section: taskSubsectionLabel(it, t),
        title: taskTitle(it, t),
        // The reader of the Bible study is «Чтец» in the programme, under
        // its section's heading; on its own it needs the rest of its name.
        label:
          it.kind !== "meeting"
            ? taskTitle(it, t)
            : it.partKey === "cbs_reader"
              ? t("home.parts.cbsReader")
              : it.partKey && ROLE_PARTS.has(it.partKey)
                ? t(`parts.${it.partKey}`)
                : meetingPartLabel(it),
        topic:
          it.kind === "meeting" && it.partKey && ROLE_PARTS.has(it.partKey)
            ? meetingPartLabel(it) !== t(`parts.${it.partKey}`)
              ? meetingPartLabel(it)
              : null
            : null,
        partKey: it.partKey,
        asAssistant: !!it.asAssistant,
        partnerName: it.partnerName ?? null,
      }),
      meetingTitles,
      nearDays: NEAR_DAYS,
    });
    // i18n.language is a dep so titles re-resolve on language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    overviewQ.data,
    groupNameById,
    fieldServiceQ.data,
    programmeQ.data,
    publishersQ.data,
    eventsQ.data,
    tasksQ.data,
    absencesQ.data,
    eldersMeetingsQ.data,
    coVisitQ.data,
    coFieldServiceQ.data,
    myPublisher?.serviceGroupId,
    myPublisherId,
    todayISO,
    i18n.language,
  ]);

  // A source that failed says so, instead of looking like «nothing there».
  const partialFailure = [
    fieldServiceQ,
    programmeQ,
    eventsQ,
    absencesQ,
    coVisitQ,
    publishersQ,
  ].some((q) => q.isError && !q.data);

  return {
    timeline,
    events: eventsQ.data ?? [],
    absences: absencesQ.data ?? [],
    loading:
      (overviewQ.isLoading && !overviewQ.data) ||
      (tasksQ.isLoading && !tasksQ.data),
    failed:
      (overviewQ.isError && !overviewQ.data) ||
      (tasksQ.isError && !tasksQ.data),
    partialFailure,
    retry: () => {
      overviewQ.refetch();
      tasksQ.refetch();
    },
    myGroupName: myPublisher?.serviceGroupId
      ? (groupNameById.get(myPublisher.serviceGroupId) ?? null)
      : null,
    myName: myPublisherId
      ? ((publishersQ.data?.data ?? []).find((p) => p.id === myPublisherId)
          ?.displayName ?? null)
      : null,
  };
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const now = useNow();
  const todayISO = formatDateISO(now);
  const nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_FROM;
  const [refreshing, setRefreshing] = useState(false);
  const [windows, setWindows] = useState<number[] | null>(null);

  const data = useHomeData(todayISO);
  const digest = useMemo(
    () =>
      digestHome({
        timeline: data.timeline,
        todayISO,
        nowHM,
        absences: data.absences,
        events: data.events,
        nearDays: NEAR_DAYS,
      }),
    [data.timeline, todayISO, nowHM, data.absences, data.events],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  };

  const nearTo = formatDateISO(
    addDays(new Date(`${todayISO}T00:00:00`), NEAR_DAYS),
  );
  const fmtDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "long",
    });

  const next = data.loading ? (
    <View style={s.section}>
      <SectionLabel>{t("home.next.title")}</SectionLabel>
      <SkeletonCard rows={2} />
    </View>
  ) : digest.next ? (
    <NextCard
      entry={digest.next}
      following={digest.nextIsFar ? null : digest.following}
      awayDuring={digest.awayDuring}
      isFar={digest.nextIsFar}
      now={now}
      todayISO={todayISO}
      myGroupName={data.myGroupName}
      myName={data.myName}
      onWindows={setWindows}
    />
  ) : null;

  const list = (
    <View style={s.section}>
      <View style={s.listHead}>
        <Text style={s.listTitle} accessibilityRole="header">
          {t("home.list.title")}
        </Text>
        <Text style={s.listRange}>
          {fmtDay(todayISO)} – {fmtDay(nearTo)}
        </Text>
      </View>
      {data.partialFailure ? (
        <Text style={s.partial}>{t("home.list.partial")}</Text>
      ) : null}
      {data.loading ? (
        <SkeletonCard rows={4} />
      ) : data.failed ? (
        <LoadError onRetry={data.retry} />
      ) : data.timeline.near.length === 0 ? (
        <View style={s.quietCard}>
          <Text style={s.quietSub}>{t("home.timeline.emptyNear")}</Text>
        </View>
      ) : (
        data.timeline.near.map((g, i) => {
          const month = g.dateISO.slice(0, 7);
          const prev =
            i === 0
              ? todayISO.slice(0, 7)
              : data.timeline.near[i - 1].dateISO.slice(0, 7);
          return (
            <View key={g.dateISO}>
              {month !== prev ? (
                <Text style={s.monthLabel}>
                  {capitalizeFirst(
                    new Date(`${g.dateISO}T00:00:00`).toLocaleDateString(
                      i18n.language,
                      { month: "long" },
                    ),
                  )}
                </Text>
              ) : null}
              <DayRow
                group={g}
                nextKey={
                  digest.next && !digest.nextIsFar ? digest.next.key : null
                }
                todayISO={todayISO}
                myGroupName={data.myGroupName}
                myName={data.myName}
              />
            </View>
          );
        })
      )}
      <Pressable
        onPress={() => router.push("/home/my-assignments" as never)}
        style={({ pressed }) => [s.allMine, pressed && { opacity: 0.6 }]}
        accessibilityRole="link"
      >
        <Text style={s.allMineText}>{t("home.list.allMine")}</Text>
        <Text style={s.allMineHint}>
          {digest.moreCount > 0 && digest.moreUntil
            ? `${t("home.list.more", { count: digest.moreCount, date: fmtDay(digest.moreUntil) })} ›`
            : "›"}
        </Text>
      </Pressable>
    </View>
  );

  const soon = digest.soon.length ? (
    <View style={s.section}>
      <SectionLabel>{t("home.soon.title")}</SectionLabel>
      {digest.soon.map((e) => {
        const congress = isCongressEvent(e) || e.type === "memorial";
        const weeks = Math.max(
          1,
          Math.round(
            (new Date(`${e.date}T00:00:00`).getTime() -
              new Date(`${todayISO}T00:00:00`).getTime()) /
              (7 * 86400000),
          ),
        );
        const title =
          e.type === "circuit_overseer_visit"
            ? t("coVisit.mineTitle")
            : e.type === "memorial"
              ? t("home.eventTypes.memorial")
              : e.title;
        return (
          <Pressable
            key={e.id}
            onPress={() => router.push(`/special-events/${e.id}` as never)}
            style={({ pressed }) => [
              s.banner,
              congress && s.bannerCongress,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
          >
            <Ionicons
              name={
                e.type === "circuit_overseer_visit" ? "briefcase" : "megaphone"
              }
              size={18}
              color={congress ? "#b45309" : "#0e7490"}
            />
            <View style={{ flex: 1 }}>
              <Text style={[s.bannerTitle, congress && { color: "#92400e" }]}>
                {title}
              </Text>
              <Text style={[s.bannerSub, congress && { color: "#b45309" }]}>
                {eventRange(e, i18n.language)} ·{" "}
                {t("home.soon.inWeeks", { count: weeks })}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={congress ? "#b45309" : "#0e7490"}
            />
          </Pressable>
        );
      })}
    </View>
  ) : null;

  return (
    <>
      <ScrollView
        style={s.container}
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={[s.frame, wide && s.frameWide]}>
          {wide ? (
            <>
              <View style={s.colLeft}>
                <GreetingHeader now={now} />
                <ReportDone />
                {next}
                <TodoSection />
                {soon}
              </View>
              <View style={s.colRight}>{list}</View>
            </>
          ) : (
            <>
              <GreetingHeader now={now} />
              <ReportDone />
              {next}
              <TodoSection />
              {list}
              {soon}
            </>
          )}
        </View>
      </ScrollView>
      <WindowsPlanDialog windows={windows} onClose={() => setWindows(null)} />
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 16, paddingBottom: 40, alignItems: "center" },
  frame: { width: "100%", maxWidth: MAX_WIDTH, gap: 22 },
  frameWide: { flexDirection: "row", alignItems: "flex-start", gap: 40 },
  colLeft: { width: 400, gap: 22 },
  colRight: { flex: 1, minWidth: 0 },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#64748b",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  greeting: { gap: 4 },
  greetingText: {
    fontSize: 23,
    fontWeight: "800",
    fontFamily: "Manrope_800ExtraBold",
    color: "#0f172a",
  },
  greetingLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  greetingDate: { fontSize: 13.5, color: "#64748b" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#E1F5EE",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0F6E56",
  },
  appointmentBadge: { backgroundColor: "#EDEAF7" },
  appointmentBadgeText: { color: "#4C4088" },
  badgeAhead: { backgroundColor: "#E8EFF6" },
  badgeAheadText: { color: "#3F6C8F" },
  reportDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: -12,
  },
  reportDoneText: {
    fontSize: 13,
    color: "#166534",
    fontFamily: "Manrope_600SemiBold",
    fontWeight: "600",
  },

  nextCard: { padding: 16, gap: 12 },
  nextHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  nextDot: { width: 10, height: 10, borderRadius: 5 },
  nextWhen: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
  },
  nextRel: {
    marginLeft: "auto",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: "hidden",
  },
  partLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  nextOverline: {
    fontSize: 12.5,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#64748b",
  },
  nextMain: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "800",
    fontFamily: "Manrope_800ExtraBold",
    color: "#0f172a",
  },
  nextSecond: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
  },
  nextPlace: { fontSize: 14, color: "#334155" },
  nextFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(15,23,42,0.07)",
    paddingTop: 10,
  },
  nextFootKind: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
  },
  nextFootAbout: { fontSize: 13, color: "#64748b" },
  nextTopic: {
    fontSize: 14.5,
    color: "#334155",
    fontFamily: "Manrope_600SemiBold",
    fontWeight: "600",
  },
  nextFootLink: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0369a1",
  },
  followingLine: { fontSize: 13, color: "#64748b", paddingLeft: 4 },
  awayNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "#fffbeb",
    borderRadius: 10,
    padding: 10,
  },
  awayText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
    color: "#92400e",
    fontFamily: "Manrope_600SemiBold",
  },

  quietCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  quietTitle: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
  },
  quietSub: { fontSize: 13.5, color: "#64748b" },

  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  stripDue: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  stripDone: { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
  stripText: {
    fontSize: 14.5,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
  },
  stripSub: { fontSize: 13, marginTop: 1 },
  stripTextDue: { color: "#92400e" },
  stripTextDone: { color: "#166534" },

  listHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: "800",
    fontFamily: "Manrope_800ExtraBold",
    color: "#0f172a",
  },
  listRange: { fontSize: 13, color: "#64748b" },
  partial: { fontSize: 12.5, color: "#b45309" },
  monthLabel: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: "Manrope_800ExtraBold",
    color: "#64748b",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingTop: 14,
    paddingBottom: 4,
    paddingLeft: 4,
  },
  dayRow: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f6",
  },
  dateCol: { width: 38, alignItems: "center", paddingTop: 2 },
  dateNum: {
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "800",
    fontFamily: "Manrope_800ExtraBold",
    color: "#0f172a",
  },
  dateDow: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#64748b",
    marginTop: 2,
  },
  dateToday: { color: "#0369a1" },
  dayEntries: { flex: 1, minWidth: 0, gap: 12 },
  entry: { gap: 3 },
  rowKind: { fontSize: 12.5, fontWeight: "700", fontFamily: "Manrope_700Bold" },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
  },
  rowSub: { fontSize: 13, color: "#64748b" },
  rowPlain: { fontSize: 13, color: "#0f172a" },
  rowNote: {
    fontSize: 12.5,
    color: "#b45309",
    fontFamily: "Manrope_600SemiBold",
    fontWeight: "600",
  },
  rowQuiet: { fontSize: 12.5, color: "#94a3b8" },
  topic: { fontSize: 13, color: "#475569", fontStyle: "italic" },
  link: {
    fontSize: 13,
    color: "#0369a1",
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
  },
  mineLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 1,
  },
  mineText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#c2410c",
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  chipText: { fontSize: 12, fontWeight: "700", fontFamily: "Manrope_700Bold" },
  absence: { flexDirection: "row", alignItems: "center", gap: 8 },
  absenceText: {
    flexShrink: 1,
    fontSize: 13.5,
    color: "#64748b",
    fontFamily: "Manrope_500Medium",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ecfeff",
    borderWidth: 1,
    borderColor: "#a5f3fc",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  bannerCongress: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  bannerTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0e7490",
  },
  bannerSub: { fontSize: 13, color: "#0891b2", marginTop: 1 },
  allMine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  allMineText: {
    fontSize: 14.5,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0369a1",
  },
  allMineHint: {
    fontSize: 13.5,
    color: "#64748b",
    fontFamily: "Manrope_600SemiBold",
  },
});
