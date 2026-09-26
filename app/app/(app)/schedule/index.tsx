import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  assignmentsApi,
  cleaningApi,
  dutiesApi,
  fieldServiceApi,
  meApi,
  meetingSettingsApi,
  publishersApi,
  readinessApi,
  serviceGroupsApi,
  specialEventsApi,
} from "../../../lib/api";
import type {
  Assignment,
  CleaningAssignment,
  Duty,
  FieldServiceMeeting,
  ReadinessMeeting,
  SpecialEvent,
} from "../../../lib/api";
import { usePermissions } from "../../../lib/permissions";
import { isCongressEvent, weekRules } from "../../../lib/week-rules";
import { WindowsLine, WindowsPlanDialog } from "../../../components/WindowsPlan";
import { effectiveVersionFor } from "../../../lib/meeting-schedule";
import { addDays, formatDateISO, parseISODate, startOfWeekMonday } from "../../../lib/dates";
import { partDisplay } from "../../../lib/part-display";
import {
  SUBSECTIONS,
  buildMidweekPartTimes,
  buildWeekendPartTimes,
  getPartLabel,
  resolveSubsection,
} from "../../../lib/parts";
import { useMyPublisher } from "../../../lib/useMyPublisher";
import { FONT } from "../../../lib/typography";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { MemorialMeetingBlock } from "../../../components/MemorialMeetingBlock";
import {
  ChairLine,
  PairLine,
  PartLine,
  PrayerLine,
  SectionChip,
  SongLine,
  Topic,
} from "../../../components/ProgrammeSheet";

/**
 * THE PROGRAMME — what is coming, one date at a time.
 *
 * A LIST OF DATES, not of weeks. Each meeting is a row: the day large on the
 * left, one main line and one supporting line, «yours» in blue. The nearest
 * meeting opens by itself, so it can be read without a tap. Field-ministry
 * meetings are one row per DAY — a week can hold many, and one by one they
 * would drown the congregation's meetings.
 *
 * AN OPEN MEETING IS THE WHOLE EVENING, on three tabs — programme, duties,
 * cleaning — so nothing has to be scrolled through to reach the next thing.
 * It always opens on the programme; when what is yours sits on another tab, a
 * line above the tabs says so and takes you there. Predictable, and nothing of
 * yours is lost.
 *
 * READING ONLY. Nothing here writes — duties are READ (GET /duties is a plain
 * query; creating them is the separate POST /duties/generate, which only the
 * editing screen calls). A feed that stamped empty rows on every week scrolled
 * past is exactly what put 368 rows into one July afternoon.
 *
 * ONE TRUTH, TAKEN FROM WHERE IT LIVES. Names of parts from part-display, times
 * from parts (buildMidweekPartTimes / buildWeekendPartTimes, the schedule
 * screen's own), section colours from SUBSECTIONS, the words from the locale
 * files. Which meetings a week holds comes from the week rules.
 *
 * PAST MEETINGS sit above the «today» line, muted, without readiness or doors.
 * The feed opens on that line and, once placed, never moves on its own.
 */

const CHUNK = 8;
type Kind = "midweek" | "weekend";
type Tab = "programme" | "duties" | "cleaning";
type Filter = "all" | "midweek" | "weekend" | "field";

const SONG_KEYS = new Set(["mid_song", "weekend_song", "weekend_opening_song"]);
const PRAYER_KEYS = new Set([
  "midweek_opening_prayer",
  "midweek_closing_prayer",
  "weekend_opening_prayer",
  "weekend_closing_prayer",
]);
const CHAIR_KEYS = new Set(["midweek_chairman", "weekend_chairman"]);
/** Readers are shown with the part they read for, not as rows of their own. */
const READER_OF: Record<string, string> = {
  cbs_conductor: "cbs_reader",
  watchtower_conductor: "watchtower_reader",
};
const READER_KEYS = new Set(Object.values(READER_OF));
/**
 * Parts whose displayed name is their TOPIC (a talk title, a Watchtower
 * article). In «yours» a person needs the role, not the topic: «public talk»,
 * not «No 78. Serve Jehovah joyfully!».
 */
const ROLE_KEYS = new Set(["public_talk_speaker", "watchtower_conductor", "watchtower_reader", "cbs_reader"]);
/** Sections that carry a label; opening and closing are plain rows (as in SUBSECTIONS). */
const LABELLED = new Set(["treasures", "apply_yourself", "christian_life", "public_talk", "watchtower"]);
/**
 * EACH KIND OF MEETING ITS OWN COLOUR AND SIGN (25 September). Weekday and
 * weekend were one amber dot, told apart only by reading the title. The
 * weekday takes the colour of its first section («Сокровища», #0e7490), the
 * weekend that of the public talk; field ministry keeps its green and the
 * paper plane of the «Служение» tab. They differ in lightness as well as hue.
 */
const KIND = {
  midweek: { color: "#0e7490", icon: "book-outline" },
  weekend: { color: "#6d28d9", icon: "sunny-outline" },
  field: { color: "#15803d", icon: "paper-plane-outline" },
  special: { color: "#b45309", icon: "star-outline" },
} as const;
const PAST_COLOR = "#94a3b8";
const TAB_DOT: Record<Tab, string> = { programme: "#f59e0b", duties: "#dc2626", cleaning: "#0ea5e9" };
const SLOT_ORDER = ["after_meeting", "thorough", "general"];

const INK = "#0f172a";
const MUTE = "#475569";
const SOFT = "#64748b";
const ACC = "#0369a1";
const ACC_BG = "#e0f2fe";
const OK = "#15803d";
const WARN = "#b45309";

function serviceYearMonday(today: Date): Date {
  const year = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  return startOfWeekMonday(new Date(year, 8, 1));
}
const atMidnight = (iso: string) => new Date(`${iso}T00:00:00`);
/** «2026-09» → «2026-10». */
function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
const maxISO = (a: string, b: string) => (a > b ? a : b);
const minISO = (a: string, b: string) => (a < b ? a : b);
/** 31 August that closes the current service year (it runs September to August). */
function serviceYearEndISO(today: Date): string {
  const start = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  return `${start + 1}-08-31`;
}

type MeetingItem = { type: "meeting"; id: string; date: string; week: string; kind: Kind; time: string | null; movedByVisit: boolean };
type FieldItem = { type: "field"; id: string; date: string; week: string; meetings: FieldServiceMeeting[] };
type SpecialItem = { type: "special"; id: string; date: string; title: string; line: string };
/**
 * The Memorial — a meeting of its own kind, opened like one (23 September).
 * Its programme once lived only on the old screen; with the feed as the
 * Programme tab, a notification «the Memorial programme is out» would have
 * led to a row that could not open.
 */
type MemorialItem = {
  type: "memorial";
  id: string;
  date: string;
  week: string;
  takes: Kind;
  event: SpecialEvent;
  line: string;
};
type Item = MeetingItem | FieldItem | SpecialItem | MemorialItem;

export default function ProgrammeFeedScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const perms = usePermissions();
  const { myPublisherId: me } = useMyPublisher();
  const canSeeReadiness =
    perms.canEditMidweekSchedule || perms.canEditWeekendSchedule || perms.canEditDuties;

  const today = formatDateISO(new Date());
  const currentMonday = useMemo(() => startOfWeekMonday(new Date()), []);
  const firstMonday = useMemo(() => serviceYearMonday(new Date()), []);
  const thisWeek = formatDateISO(currentMonday);
  const startWeek = formatDateISO(firstMonday);
  const hasPast = startWeek < thisWeek;

  // A WEEK FROM THE ADDRESS (23 September). The feed is the «Программа» tab
  // now, and every «look at that week» in the app leads here: a notification
  // that the programme is out, the Memorial row on Home, an event, the circuit
  // overseer's schedule, a retired talk still booked. `week` is any day of the
  // week wanted; `meeting` (midweek | weekend) says which meeting to open.
  // Without them the feed opens on today, as it always did. A week before the
  // start of the service year is not in the feed at all — then it opens on
  // today rather than pretend.
  const params = useLocalSearchParams<{ week?: string; meeting?: string }>();
  const targetWeek = useMemo(() => {
    const w = typeof params.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : null;
    if (!w) return null;
    const monday = formatDateISO(startOfWeekMonday(parseISODate(w)));
    return monday >= startWeek ? monday : null;
  }, [params.week, startWeek]);
  const targetKind: Kind | "memorial" | null =
    params.meeting === "midweek" || params.meeting === "weekend" || params.meeting === "memorial"
      ? params.meeting
      : null;
  // Load far enough ahead to hold the week asked for.
  const chunksFor = (week: string | null) =>
    week && week > thisWeek
      ? Math.max(1, Math.ceil((Math.round((atMidnight(week).getTime() - currentMonday.getTime()) / (7 * 86400000)) + 1) / CHUNK))
      : 1;
  const [chunks, setChunks] = useState(() => chunksFor(targetWeek));

  // PAST MEETINGS ARE ASKED FOR, A MONTH AT A TIME (25 September). The whole
  // service year behind «today» used to be read and drawn on every opening —
  // in August almost a year of programme, above a line nobody looks past. Now
  // the feed opens with none of it; «Прошедшие · сентябрь» shows that month,
  // «Раньше» the one before, back to the start of the service year. Nothing
  // is fetched for a month until it is shown. `pastFrom` is the earliest
  // month shown (YYYY-MM), or null for none. A link to a past week shows the
  // months back to it, so the week asked for is there to land on.
  const pastFromFor = (week: string | null) => (week && week < thisWeek ? week.slice(0, 7) : null);
  const [pastFrom, setPastFrom] = useState<string | null>(() => pastFromFor(targetWeek));
  const [filter, setFilter] = useState<Filter>("all");

  // The past months shown, one piece each (they never overlap: a month's piece
  // ends on the Monday the next one starts), then eight weeks at a time ahead.
  const spans = useMemo(() => {
    const out: { from: string; to: string }[] = [];
    if (hasPast && pastFrom) {
      for (let m = pastFrom; m <= thisWeek.slice(0, 7); m = nextMonth(m)) {
        const from = maxISO(startWeek, formatDateISO(startOfWeekMonday(atMidnight(`${m}-01`))));
        const to = minISO(thisWeek, formatDateISO(startOfWeekMonday(atMidnight(`${nextMonth(m)}-01`))));
        if (from < to) out.push({ from, to });
      }
    }
    for (let i = 0; i < chunks; i++)
      out.push({
        from: formatDateISO(addDays(currentMonday, i * CHUNK * 7)),
        to: formatDateISO(addDays(currentMonday, (i + 1) * CHUNK * 7)),
      });
    return out;
  }, [hasPast, pastFrom, startWeek, thisWeek, currentMonday, chunks]);

  const assignmentsQs = useQueries({
    queries: spans.map((sp) => ({
      queryKey: ["assignments", "range", sp.from, sp.to],
      queryFn: () => assignmentsApi.list({ weekStart: sp.from, weekEnd: sp.to, limit: 500 }),
    })),
  });
  const readinessQs = useQueries({
    queries: spans.map((sp) => ({
      queryKey: ["readiness", "range", sp.from, sp.to],
      queryFn: () => readinessApi.list(sp.from, sp.to),
      enabled: canSeeReadiness,
    })),
  });
  const dutiesQs = useQueries({
    queries: spans.map((sp) => ({
      queryKey: ["duties", "range", sp.from, sp.to],
      queryFn: () => dutiesApi.list({ weekStart: sp.from, weekEnd: sp.to }),
    })),
  });
  const cleaningQs = useQueries({
    queries: spans.map((sp) => ({
      queryKey: ["cleaning", "range", sp.from, sp.to],
      queryFn: () => cleaningApi.range(sp.from, sp.to),
    })),
  });
  const fieldQs = useQueries({
    queries: spans.map((sp) => ({
      queryKey: ["field-service", "range", sp.from, sp.to],
      queryFn: () => fieldServiceApi.list({ weekStart: sp.from, weekEnd: sp.to }),
    })),
  });
  const eventsQ = useQuery({
    queryKey: ["special-events", "all"],
    queryFn: () => specialEventsApi.list({ all: true }),
  });
  const settingsQ = useQuery({
    queryKey: ["meeting-settings"],
    queryFn: () => meetingSettingsApi.getOverview(),
  });
  const publishersQ = useQuery({
    queryKey: ["publishers", "roster"],
    queryFn: () => publishersApi.roster(),
  });
  const groupsQ = useQuery({
    queryKey: ["service-groups"],
    queryFn: () => serviceGroupsApi.list({}),
    staleTime: 30 * 60 * 1000,
  });

  // THE FIRST SECOND WITHOUT JUMPS (25 September). The feed used to paint as
  // each request came back — first the bare rows, then the names, «yours»,
  // readiness — and kept «today» at the top by scrolling after every growth.
  // On a phone that was a visible twitch: «today» at the top, pushed down,
  // pulled back. Now the feed is laid out and placed on «today» out of sight,
  // and shown once what it was waiting for has arrived — or after a few
  // seconds regardless, so a slow or failed request never keeps it hidden.
  // Only the first landing is veiled; «show more» later appends in view.
  // The same key and request as useMyPublisher: one fetch, read in two places.
  const meQ = useQuery({
    queryKey: ["me-publisher"],
    queryFn: () => meApi.publisher(),
    staleTime: 5 * 60 * 1000,
  });
  const waitingFor = [
    ...assignmentsQs,
    ...dutiesQs,
    ...cleaningQs,
    ...fieldQs,
    ...(canSeeReadiness ? readinessQs : []),
    eventsQ,
    settingsQ,
    publishersQ,
    groupsQ,
    meQ,
  ].some((q) => q.isPending && q.fetchStatus !== "idle");
  const [shown, setShown] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (shown) return;
    // One beat after the last answer, so the placement on «today» (made in
    // onLayout) is done before anyone sees the list.
    const t = setTimeout(() => setShown(true), waitingFor ? 5000 : 80);
    return () => clearTimeout(t);
  }, [waitingFor, shown]);
  useEffect(() => {
    if (shown) Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [shown, fade]);

  const allAssignments = assignmentsQs.flatMap((q) => q.data?.data ?? []);
  const allReadiness = readinessQs.flatMap((q) => q.data ?? []);
  const allDuties = dutiesQs.flatMap((q) => q.data ?? []);
  const allCleaning = cleaningQs.flatMap((q) => q.data ?? []);
  const allField = fieldQs.flatMap((q) => q.data ?? []);

  const nameOf = new Map<string, string>();
  for (const p of publishersQ.data?.data ?? []) nameOf.set(p.id, p.displayName);
  const groupName = new Map<string, string>();
  for (const g of groupsQ.data?.data ?? []) groupName.set(g.id, g.name);

  const byKey = <T,>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of xs) {
      const k = key(x);
      const arr = m.get(k) ?? [];
      arr.push(x);
      m.set(k, arr);
    }
    return m;
  };
  const partsOf = byKey(allAssignments, (a) => `${a.weekStartDate}|${a.eventType}`);
  for (const arr of partsOf.values()) arr.sort((a, b) => a.partOrder - b.partOrder);
  const dutiesOf = byKey(allDuties, (d) => `${d.weekStartDate}|${d.eventType}`);
  for (const arr of dutiesOf.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.slotIndex - b.slotIndex);
  const cleaningOf = byKey(allCleaning, (c) => c.weekStartDate);
  const fieldOf = byKey(allField, (f) => f.weekStartDate);

  // Where the programme ends (as before): if the last piece ends in a week with
  // no programme at all, the workbooks ended inside it.
  const lastSpan = spans[spans.length - 1];
  const lastSpanWeek = formatDateISO(addDays(atMidnight(lastSpan.to), -7));
  const lastLoaded = !!assignmentsQs[assignmentsQs.length - 1]?.data;
  const lastProgrammeWeek = allAssignments.reduce<string | null>(
    (m, a) => (!m || a.weekStartDate > m ? a.weekStartDate : m),
    null,
  );
  const reachedEnd = lastLoaded && !allAssignments.some((a) => a.weekStartDate === lastSpanWeek);
  const programmeEnd = reachedEnd
    ? lastProgrammeWeek && lastProgrammeWeek > thisWeek
      ? lastProgrammeWeek
      : thisWeek
    : lastSpanWeek;
  // A week asked for by the address is shown even past the programme's end
  // (24 September). The Memorial is the case: its programme is published
  // before the workbooks for its week are imported, and «the Memorial
  // programme is out» led to a feed that stopped short of it — the week sat
  // only in «Впереди», with nothing to open. The old screen had the same trap
  // and drew the block anyway; so does the feed now, for the week sent to.
  const endWeek = targetWeek && targetWeek > programmeEnd ? targetWeek : programmeEnd;

  // Every dated thing the weeks hold, in date order.
  const items: Item[] = [];
  for (let w = firstMonday; formatDateISO(w) <= endWeek; w = addDays(w, 7)) {
    const week = formatDateISO(w);
    const version = effectiveVersionFor(settingsQ.data?.versions, week);
    const rules = weekRules({ weekStartISO: week, version, events: eventsQ.data ?? [] });
    if (!rules.meetingsHeld && rules.congress) {
      items.push({
        type: "special",
        id: `congress|${week}`,
        date: rules.congress.date,
        title: t(`specialEvents.types.${rules.congress.type}`),
        line: t("feed.noMeetings"),
      });
    }
    if (rules.memorial && rules.memorialTakes) {
      items.push({
        type: "memorial",
        id: `memorial|${week}`,
        date: rules.memorial.date,
        week,
        takes: rules.memorialTakes,
        event: rules.memorial,
        line:
          rules.memorialTakes === "midweek"
            ? t("feed.memorialInsteadMidweek")
            : t("feed.memorialInsteadWeekend"),
      });
    }
    for (const kind of ["midweek", "weekend"] as Kind[]) {
      const date = rules.dateOf(kind);
      if (!date || rules.isTakenAway(kind)) continue;
      items.push({
        type: "meeting",
        id: `${week}|${kind}`,
        date,
        week,
        kind,
        time: (kind === "midweek" ? version?.midweekTime : version?.weekendTime) ?? null,
        movedByVisit: kind === "midweek" && !!rules.coVisit,
      });
    }
    const byDay = byKey(fieldOf.get(week) ?? [], (f) =>
      formatDateISO(addDays(w, f.dayOfWeek - 1)),
    );
    for (const [date, ms] of byDay) {
      ms.sort((a, b) => a.startTime.localeCompare(b.startTime));
      items.push({ type: "field", id: `field|${date}`, date, week, meetings: ms });
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.type === "field" ? -1 : 1));

  // AHEAD — what lies beyond the programme, to the end of the service year: a
  // visit, a convention, the Memorial. The congregation needs these before the
  // workbook for their week is loaded, and the feed stops where the workbooks
  // stop. Each line says what the week's own rules say about it — the same
  // rules as everywhere else here — so «Ahead» cannot disagree with what the
  // feed will show once the programme reaches that week.
  const shownUntil = formatDateISO(addDays(atMidnight(endWeek), 6));
  const yearEnd = serviceYearEndISO(new Date());
  const ahead: SpecialEvent[] = reachedEnd
    ? (eventsQ.data ?? [])
        .filter(
          (e) =>
            (e.type === "circuit_overseer_visit" || e.type === "memorial" || isCongressEvent(e)) &&
            e.date > shownUntil &&
            e.date <= yearEnd,
        )
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const dm = (iso: string) => atMidnight(iso).toLocaleDateString(lang, { day: "numeric", month: "long" });
  const aheadTitle = (e: SpecialEvent) =>
    e.type === "memorial" ? t("eventTypes.memorial") : t(`specialEvents.types.${e.type}`);
  const aheadLine = (e: SpecialEvent) => {
    const week = formatDateISO(startOfWeekMonday(atMidnight(e.date)));
    const rules = weekRules({
      weekStartISO: week,
      version: effectiveVersionFor(settingsQ.data?.versions, week),
      events: eventsQ.data ?? [],
    });
    // «23 — 28 февраля» within a month, as the week labels once were: the month once.
    const sameMonth = !!e.endDate && e.endDate.slice(0, 7) === e.date.slice(0, 7);
    const span =
      e.endDate && e.endDate !== e.date
        ? t("feed.dateRange", {
            from: sameMonth ? atMidnight(e.date).toLocaleDateString(lang, { day: "numeric" }) : dm(e.date),
            to: dm(e.endDate),
          })
        : dm(e.date);
    let effect = "";
    if (e.type === "memorial") {
      effect = rules.memorialTakes === "weekend" ? t("feed.memorialInsteadWeekend") : t("feed.memorialInsteadMidweek");
    } else if (isCongressEvent(e)) {
      effect = t("feed.noMeetings");
    } else {
      const d = rules.dateOf("midweek");
      if (d) effect = t("feed.visitMidweekOn", { day: atMidnight(d).toLocaleDateString(lang, { weekday: "long" }) });
    }
    // After the date the effect reads as the rest of one sentence. These are
    // the app's own set phrases, with no names in them, so the first letter can
    // go down safely.
    const tail = effect ? effect.charAt(0).toLocaleLowerCase(lang) + effect.slice(1) : "";
    return [span, tail].filter(Boolean).join(" · ");
  };

  // WHAT THE CHIPS ABOVE THE FEED LEAVE IN (25 September): the three kinds of
  // meeting apart, in date order still. A convention or the Memorial is part
  // of «all» only — it is neither a weekday nor a weekend meeting.
  const keep = (x: Item) =>
    filter === "all" ||
    (filter === "field" ? x.type === "field" : x.type === "meeting" && x.kind === filter);
  const shownItems = items.filter(keep);
  const pastAll = shownItems.filter((x) => x.date < today);
  const past = pastFrom ? pastAll.filter((x) => x.date.slice(0, 7) >= pastFrom) : [];
  const coming = shownItems.filter((x) => x.date >= today);
  // The month «Раньше» / «Прошедшие» would show next, and how many meetings
  // it holds (from the week rules, so known before anything is fetched).
  const pastMonths = [...new Set(pastAll.map((x) => x.date.slice(0, 7)))].sort();
  const nextPastMonth = [...pastMonths].reverse().find((m) => !pastFrom || m < pastFrom) ?? null;
  const nextPastCount = nextPastMonth
    ? pastAll.filter((x) => x.date.slice(0, 7) === nextPastMonth && x.type !== "field").length
    : 0;
  // The nearest meeting opens by itself — readable without a tap. Sent to a
  // week, it is that week's meeting: the one named, else its first.
  // The Memorial opens like a meeting, and is found by the kind it takes too:
  // «?meeting=memorial» names it, and so does the kind it replaced.
  const inTarget = targetWeek
    ? items.filter((x) => (x.type === "meeting" || x.type === "memorial") && x.week === targetWeek)
    : [];
  const isTarget = (x: Item) =>
    (x.type === "meeting" && x.kind === targetKind) ||
    (x.type === "memorial" && (targetKind === "memorial" || x.takes === targetKind));
  const targetOpen = (targetKind && inTarget.find(isTarget)?.id) || inTarget[0]?.id || null;
  const defaultOpen = targetWeek
    ? targetOpen
    : (coming.find((x) => x.type === "meeting" || x.type === "memorial")?.id ?? null);
  // ONE MEETING OPEN AT A TIME — AND THE ONE TAPPED STAYS UNDER THE FINGER
  // (25 September, Lionel's choice). Opening a meeting closes the one open
  // before it. When that one stands ABOVE, everything below it moves up by its
  // height; how that is kept from showing differs by platform, and each way is
  // proved on its own platform (walkthrough C08 frame by frame on the web,
  // scripts/android-check.mjs on the phone):
  //  - WEB: the tapped row's place on screen is read before the change and
  //    after it, before the browser paints, and the list is scrolled by the
  //    difference (see the layout effect below). The DOM answers both reads at
  //    once, so nothing is left to timing.
  //  - ANDROID / iOS: the ScrollView keeps its first visible child where it
  //    was when the content above it changes (maintainVisibleContentPosition,
  //    done natively in the same mount pass). That child is the first one whose
  //    BOTTOM is below the top of the list (MaintainVisibleScrollPositionHelper).
  //  - BOTH: a card above that is still partly on screen does not close at
  //    once. It cannot: closing it takes its height out from above the tapped
  //    row, and when less than that height has been scrolled, no scrolling can
  //    put the row back (on the stand: 586 points scrolled, 670 to take back —
  //    the row went from 420 to 338 whatever was done). And on the phone that
  //    card would itself be the child kept in place. So it stays open until it
  //    has left the screen upwards (`lingering`), and closes then; a card
  //    already out of sight closes at once. Either way, nothing on screen
  //    moves.
  const [openChoice, setOpenChoice] = useState<string | null | undefined>(undefined);
  const openId = openChoice === undefined ? defaultOpen : openChoice;
  const [lingering, setLingering] = useState<string | null>(null);
  // OPEN ON TODAY — AND HOLD IT THERE UNTIL THE PERSON MOVES.
  //
  // A one-off placement is not enough here. The rows above «today» grow after
  // the first paint: names arrive with the roster, «yours» once it is known
  // who you are, readiness a moment later. So the feed keeps «today» at the
  // top while things arrive, and lets go the moment the person acts: a
  // finger, the wheel, a key, a mouse press, a tap on a row, «show more».
  //
  // WHERE A ROW IS is the sum of the HEIGHTS of everything above it. Every
  // piece of the feed reports its height; positions are not trusted, because
  // on the web onLayout comes from a ResizeObserver, which reports a change of
  // SIZE and never a row being pushed down. Heights are reported every time,
  // on every platform, and the pieces are the ScrollView's own children, in
  // order, with nothing between them.
  //
  // Movement is caught as the person's ACT, not guessed from where the screen
  // stands: the browser itself shifts the scroll when content above grows
  // (scroll anchoring), which a position check would take for a person.
  const scrollRef = useRef<ScrollView>(null);
  const released = useRef(false);
  const target = useRef<number | null>(null);
  const heights = useRef(new Map<string, number>());
  const scrollY = useRef(0);
  const release = () => {
    released.current = true;
  };
  // A new week in the address while the feed is already open (a notification
  // tapped with the tab showing) is a new landing: hold again, open afresh.
  useEffect(() => {
    released.current = false;
    target.current = null;
    setOpenChoice(undefined);
    setLingering(null);
    setPastFrom((p) => {
      const need = pastFromFor(targetWeek);
      return need && (!p || need < p) ? need : p;
    });
    setChunks((c) => Math.max(c, chunksFor(targetWeek)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWeek, targetKind]);
  // On the web a wheel or a key moves the list without any drag, so listen for
  // the act itself. Native touch is onScrollBeginDrag below.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const w = globalThis as unknown as {
      addEventListener?: (type: string, fn: () => void, opts?: { passive?: boolean }) => void;
      removeEventListener?: (type: string, fn: () => void) => void;
    };
    const acts = ["wheel", "touchstart", "keydown", "mousedown"];
    for (const a of acts) w.addEventListener?.(a, release, { passive: true });
    return () => {
      for (const a of acts) w.removeEventListener?.(a, release);
    };
  }, []);

  const monthOf = (ym: string) => {
    const name = atMidnight(`${ym}-01`).toLocaleDateString(lang, { month: "long" });
    return name.charAt(0).toLocaleUpperCase(lang) + name.slice(1);
  };
  const monthYear = (ym: string) => `${monthOf(ym)} ${ym.slice(0, 4)}`;

  // WIDE: from 900 points the feed becomes two columns — the list of dates on
  // the left, the chosen meeting whole on the right. The same list, the same
  // «today» line and holding; a tap chooses a meeting instead of opening it in
  // place, and the nearest one is chosen to begin with, as on a phone it opens
  // by itself. One meeting component in three forms — open in place, a list
  // row, the whole right side — not a second copy that one change would miss.
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const isOpen = (id: string) => openId === id || (!wide && lingering === id);
  const choose = (id: string) => {
    release();
    setOpenChoice(id);
  };
  const meetingProps = (x: MeetingItem) => ({
    item: x,
    past: x.date < today,
    me,
    parts: partsOf.get(`${x.week}|${x.kind}`) ?? [],
    duties: dutiesOf.get(`${x.week}|${x.kind}`) ?? [],
    cleaning: cleaningOf.get(x.week) ?? [],
    readiness: canSeeReadiness
      ? allReadiness.find((w) => w.weekStart === x.week)?.meetings.find((m) => m.kind === x.kind)
      : undefined,
    nameOf,
    groupName,
    canEditProgramme: x.kind === "midweek" ? perms.canEditMidweekSchedule : perms.canEditWeekendSchedule,
    canEditDuties: perms.canEditDuties,
    canEditCleaning: perms.canEditCleaning,
  });

  // THE FEED AS A FLAT LIST OF PIECES, top to bottom. Flat because the native
  // ScrollView keeps its first visible CHILD in place (see «one meeting open»
  // above): with the rows wrapped in one column, that child would be the whole
  // column, which never moves. Each piece carries the month of its row (for the
  // month at the top) and the id of its item (to find a tapped row).
  type Piece = { key: string; node: ReactNode; month?: string; itemId?: string; isToday?: boolean; date?: string };
  const pieces: Piece[] = [];
  const pushItem = (x: Item, isPast: boolean, prevMonth: string | null) => {
    const month = x.date.slice(0, 7);
    if (month !== prevMonth) {
      pieces.push({
        key: `m|${x.id}`,
        month,
        date: x.date,
        node: (
          <View style={styles.monthRow}>
            <Text style={styles.monthText}>{monthYear(month)}</Text>
          </View>
        ),
      });
    }
    const onToggle = () => (wide ? choose(x.id) : toggle(x.id));
    const mode = wide ? ("row" as const) : ("inline" as const);
    let body: ReactNode;
    if (x.type === "special") {
      body = (
        <Row
          date={x.date}
          kindLabel={t("feed.kindSpecial")}
          icon="star-outline"
          title={x.title}
          line={x.line}
          color={KIND.special.color}
          past={isPast}
        />
      );
    } else if (x.type === "memorial") {
      body = (
        <MemorialDay
          item={x}
          past={isPast}
          open={isOpen(x.id)}
          onToggle={onToggle}
          mode={mode}
          duties={dutiesOf.get(`${x.week}|memorial`) ?? []}
          canEdit={perms.isAdmin || perms.isElder}
        />
      );
    } else if (x.type === "field") {
      body = (
        <FieldDay
          item={x}
          past={isPast}
          open={isOpen(x.id)}
          onToggle={onToggle}
          mode={mode}
          me={me}
          nameOf={nameOf}
          groupName={groupName}
        />
      );
    } else {
      body = <Meeting {...meetingProps(x)} open={isOpen(x.id)} onToggle={onToggle} mode={mode} />;
    }
    pieces.push({ key: x.id, node: body, month, itemId: x.id, date: x.date });
  };

  // Past: one line that asks for them, and once shown, the months shown.
  if (pastAll.length > 0) {
    pieces.push({
      key: "pastHead",
      node: (
        <PastHead
          shown={!!pastFrom}
          next={nextPastMonth ? { month: monthOf(nextPastMonth), count: nextPastCount } : null}
          onMore={() => {
            release();
            if (nextPastMonth) setPastFrom(nextPastMonth);
          }}
          onHide={() => {
            release();
            setPastFrom(null);
          }}
        />
      ),
    });
    // The start of the service year, once the feed shows all the way back to it.
    if (pastFrom && !nextPastMonth) {
      pieces.push({
        key: "yearStart",
        node: (
          <View style={styles.yearStart}>
            <View style={styles.rule} />
            <Text style={styles.yearStartText}>{t("feed.serviceYearStart")}</Text>
            <View style={styles.rule} />
          </View>
        ),
      });
    }
    let prev: string | null = null;
    for (const x of past) {
      pushItem(x, true, prev === null ? (x.date.slice(0, 7) === today.slice(0, 7) ? today.slice(0, 7) : null) : prev);
      prev = x.date.slice(0, 7);
    }
  }
  const todayLabel = atMidnight(today).toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" });
  pieces.push({
    key: "today",
    isToday: true,
    month: today.slice(0, 7),
    node: (
      <View style={styles.today}>
        <Text style={styles.todayText}>{t("feed.today", { date: todayLabel })}</Text>
        <View style={styles.todayRule} />
      </View>
    ),
  });
  {
    // The month heading comes where the month changes; the month of «today»
    // needs none — the line at the top already says it.
    let prev: string | null = today.slice(0, 7);
    for (const x of coming) {
      pushItem(x, false, prev);
      prev = x.date.slice(0, 7);
    }
  }
  pieces.push({
    key: "tail",
    node: reachedEnd ? (
      <>
        <View style={styles.end}>
          <Text style={styles.endTitle}>{t("feed.end")}</Text>
          {lastProgrammeWeek ? (
            <Text style={styles.endNote}>
              {t("feed.endLoadedTo", {
                date: atMidnight(formatDateISO(addDays(atMidnight(lastProgrammeWeek), 6))).toLocaleDateString(lang, {
                  day: "numeric",
                  month: "long",
                }),
              })}
            </Text>
          ) : null}
        </View>
        {filter === "all" && ahead.length > 0 ? <Text style={styles.label}>{t("feed.ahead")}</Text> : null}
        {filter === "all"
          ? ahead.map((e) => (
              <Row
                key={`ahead|${e.id}`}
                date={e.date}
                kindLabel={t("feed.kindSpecial")}
                icon="star-outline"
                title={aheadTitle(e)}
                line={aheadLine(e)}
                color={KIND.special.color}
                past={false}
              />
            ))
          : null}
        {filter !== "all" ? (
          <View style={styles.filtered}>
            <Text style={styles.filteredText}>{t(`feed.onlyShown.${filter}`)}</Text>
            <Pressable
              style={({ pressed }) => [styles.filteredAll, pressed && styles.pressed]}
              onPress={() => pickFilter("all")}
              accessibilityRole="button"
            >
              <Text style={styles.filteredAllText}>{t("feed.showAll")}</Text>
            </Pressable>
          </View>
        ) : null}
      </>
    ) : (
      <Pressable
        style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        onPress={() => {
          release();
          setChunks((c) => c + 1);
        }}
        accessibilityRole="button"
      >
        <Text style={styles.moreText}>{t("feed.loadMore")}</Text>
      </Pressable>
    ),
  });

  // Where the feed lands: «today», or the first row of the week asked for (with
  // its month heading, which belongs to it).
  const cutAt = (() => {
    if (!targetWeek) return pieces.findIndex((f) => f.isToday);
    let i = pieces.findIndex((f) => f.date !== undefined && f.date >= targetWeek);
    if (i < 0) return pieces.findIndex((f) => f.isToday);
    while (i > 0 && pieces[i - 1].key.startsWith("m|") && pieces[i - 1].date === pieces[i].date) i--;
    return i;
  })();
  const topOf = (index: number) => {
    let y = 0;
    for (let i = 0; i < index; i++) {
      const h = heights.current.get(pieces[i].key);
      if (h === undefined) return null;
      y += h;
    }
    return y;
  };
  const indexOfItem = (id: string) => pieces.findIndex((f) => f.itemId === id);

  const anchor = () => {
    if (released.current) return;
    const y = topOf(cutAt);
    if (y === null || target.current === y) return;
    target.current = y;
    scrollRef.current?.scrollTo({ y, animated: false });
    scrollY.current = y;
    updateMonth();
  };
  useEffect(anchor);

  // THE MONTH AT THE TOP: the month of the first row not yet scrolled past.
  const [barMonth, setBarMonth] = useState(today.slice(0, 7));
  const updateMonth = () => {
    let y = 0;
    for (const f of pieces) {
      const h = heights.current.get(f.key) ?? 0;
      if (f.month && y + h > scrollY.current + 1) {
        if (f.month !== barMonth) setBarMonth(f.month);
        return;
      }
      y += h;
    }
  };
  const onScroll = (y: number) => {
    scrollY.current = y;
    updateMonth();
    // A card left open above the tapped one (native, see above) closes once it
    // is out of sight upwards — then the ScrollView keeps what is on screen.
    if (lingering) {
      const i = indexOfItem(lingering);
      const top = i >= 0 ? topOf(i) : null;
      const h = i >= 0 ? heights.current.get(pieces[i].key) : undefined;
      if (i < 0 || (top !== null && h !== undefined && top + h <= y + 1)) {
        // On the web, hold the first piece on screen where it is.
        let at = 0;
        for (let j = 0; j < pieces.length; j++) {
          const hj = heights.current.get(pieces[j].key) ?? 0;
          if (at + hj > y) {
            holdOnWeb(pieces[j].key);
            break;
          }
          at += hj;
        }
        setLingering(null);
      }
    }
  };

  // WEB: keep the tapped row where it was (see «one meeting open» above).
  const els = useRef(new Map<string, { getBoundingClientRect?: () => { top: number } }>());
  const keepInPlace = useRef<{ key: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const k = keepInPlace.current;
    if (!k || Platform.OS !== "web") return;
    keepInPlace.current = null;
    const now = els.current.get(k.key)?.getBoundingClientRect?.().top;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => { scrollTop: number } } | null)
      ?.getScrollableNode?.();
    if (now === undefined || !node) return;
    const d = now - k.top;
    if (Math.abs(d) >= 0.5) node.scrollTop += d;
  });

  const toggle = (id: string) => {
    release();
    if (openId === id) {
      setOpenChoice(null);
      return;
    }
    if (lingering === id) {
      // The card still showing above came back into use: it is the open one
      // now, and the one below it closes (below — nothing above moves).
      setLingering(null);
      setOpenChoice(id);
      return;
    }
    const iPrev = openId ? indexOfItem(openId) : -1;
    const iNew = indexOfItem(id);
    if (openId && iPrev >= 0 && iPrev < iNew) {
      const top = topOf(iPrev);
      const h = heights.current.get(pieces[iPrev].key);
      // Still partly on screen: close it once it has left (see above).
      // (A point of slack: heights are fractional, the scroll position whole.)
      if (top === null || h === undefined || top + h > scrollY.current + 1) setLingering(openId);
      else holdOnWeb(pieces[iNew].key);
    }
    setOpenChoice(id);
  };
  /** WEB: remember where a piece is on screen now, to keep it there after the change. */
  const holdOnWeb = (key: string) => {
    if (Platform.OS !== "web") return;
    const top = els.current.get(key)?.getBoundingClientRect?.().top;
    if (top !== undefined) keepInPlace.current = { key, top };
  };
  const pickFilter = (f: Filter) => {
    setFilter(f);
    // A new filter is a new landing: back to «today», held until touched.
    released.current = false;
    target.current = null;
  };

  const bar = (
    <View style={styles.bar}>
      <Text style={styles.barMonth} accessibilityRole="header">
        {monthYear(barMonth)}
      </Text>
      {/* One line, whatever the language: «Predigtdienst» is long. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsScroll}
      >
        {(["all", "midweek", "weekend", "field"] as Filter[]).map((f) => {
          const on = filter === f;
          const color = f === "all" ? INK : KIND[f].color;
          return (
            <Pressable
              key={f}
              onPress={() => pickFilter(f)}
              style={({ pressed }) => [
                styles.chip,
                on ? { backgroundColor: color, borderColor: color } : null,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, { color: on ? "#ffffff" : color }]}>{t(`feed.filter.${f}`)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const listScroll = (
    <View style={wide ? styles.listPane : styles.screen}>
      {bar}
      <Animated.View style={[styles.fill, { opacity: fade }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.fill}
          contentContainerStyle={styles.content}
          onScrollBeginDrag={release}
          onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          onContentSizeChange={anchor}
          maintainVisibleContentPosition={Platform.OS === "web" ? undefined : { minIndexForVisible: 0 }}
        >
          {pieces.map((f) => (
            <View
              key={f.key}
              testID={f.itemId ? `piece-${f.itemId}` : undefined}
              ref={(el) => {
                if (el) els.current.set(f.key, el as never);
                else els.current.delete(f.key);
              }}
              style={wide ? styles.pieceWide : styles.piece}
              onLayout={(e) => {
                heights.current.set(f.key, e.nativeEvent.layout.height);
                anchor();
                updateMonth();
              }}
            >
              {f.node}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
      {!shown ? (
        <View style={styles.veil} pointerEvents="none">
          <ActivityIndicator size="large" color="#94a3b8" />
        </View>
      ) : null}
    </View>
  );
  if (!wide) return listScroll;

  const chosen = items.find((x) => x.id === openId);
  const detail = !chosen ? null : chosen.type === "meeting" ? (
    <Meeting key={chosen.id} {...meetingProps(chosen)} open onToggle={() => {}} mode="detail" />
  ) : chosen.type === "memorial" ? (
    <MemorialDay
      key={chosen.id}
      item={chosen}
      past={chosen.date < today}
      open
      onToggle={() => {}}
      mode="detail"
      duties={dutiesOf.get(`${chosen.week}|memorial`) ?? []}
      canEdit={perms.isAdmin || perms.isElder}
    />
  ) : chosen.type === "field" ? (
    <FieldDay
      key={chosen.id}
      item={chosen}
      past={chosen.date < today}
      open
      onToggle={() => {}}
      mode="detail"
      me={me}
      nameOf={nameOf}
      groupName={groupName}
    />
  ) : null;

  return (
    <View style={styles.split}>
      {listScroll}
      <ScrollView style={styles.detailPane} contentContainerStyle={styles.detailContent}>
        <View style={styles.detailColumn}>{detail}</View>
      </ScrollView>
    </View>
  );
}

/**
 * The line above «today» that asks for past meetings, and — once they are
 * shown — heads them. Both states are ONE row of one height, so the tap that
 * turns one into the other moves nothing: the months shown appear BELOW it,
 * and an earlier month («Раньше») below it again, above the one shown before.
 */
function PastHead({
  shown,
  next,
  onMore,
  onHide,
}: {
  shown: boolean;
  next: { month: string; count: number } | null;
  onMore: () => void;
  onHide: () => void;
}) {
  const { t } = useTranslation();
  if (!shown) {
    return (
      <View style={styles.pastHead}>
        <Pressable
          style={({ pressed }) => [styles.pastAsk, pressed && styles.pressed]}
          onPress={onMore}
          accessibilityRole="button"
        >
          <Ionicons name="chevron-up" size={16} color={MUTE} />
          <Text style={styles.pastAskText}>
            {next ? t("feed.pastShow", { month: next.month, count: next.count }) : t("feed.past")}
          </Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.pastHead}>
      <Text style={styles.pastLabel}>{t("feed.past")}</Text>
      {next ? (
        <Pressable
          style={({ pressed }) => [styles.pastBtn, pressed && styles.pressed]}
          onPress={onMore}
          accessibilityRole="button"
        >
          <Text style={styles.pastBtnText}>{t("feed.pastEarlier", { month: next.month })}</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.pastBtn, pressed && styles.pressed]}
        onPress={onHide}
        accessibilityRole="button"
      >
        <Text style={styles.pastBtnText}>{t("feed.pastHide")}</Text>
      </Pressable>
    </View>
  );
}

/** The large head of a meeting shown whole on the right of a wide screen. */
function DetailHead({
  date,
  time,
  kind,
  line,
  mine,
  status,
}: {
  date: string;
  time?: string | null;
  kind: string;
  line?: string | null;
  mine?: string | null;
  status?: { color: string; text: string } | null;
}) {
  const { i18n } = useTranslation();
  const d = atMidnight(date).toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" });
  const head = d.charAt(0).toLocaleUpperCase(i18n.language) + d.slice(1);
  return (
    <View style={styles.detailHead}>
      <Text style={styles.detailTitle}>{time ? `${head} · ${time}` : head}</Text>
      <Text style={styles.detailSub}>{[kind, line].filter(Boolean).join(" · ")}</Text>
      {mine ? <Text style={styles.detailMine}>{mine}</Text> : null}
      {status ? (
        <View style={[styles.statusRow, styles.detailStatus]}>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <Text style={styles.status}>{status.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The collapsed row every dated thing shares. */
function Row({
  date,
  kindLabel,
  icon,
  title,
  time,
  line,
  mine,
  status,
  tag,
  color,
  past,
  open,
  select,
  onPress,
}: {
  date: string;
  /** Which kind of meeting, small and in its colour, above the title. */
  kindLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** The main line: what the meeting is about. */
  title: string;
  time?: string | null;
  line?: string | null;
  /** What is yours in it — shown with a «Вы» mark. */
  mine?: string | null;
  status?: { color: string; text: string } | null;
  tag?: string | null;
  color: string;
  past: boolean;
  open?: boolean;
  /** A list row on a wide screen: a tap chooses the meeting instead of opening it here. */
  select?: boolean;
  onPress?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const d = atMidnight(date);
  const dow = d.toLocaleDateString(i18n.language, { weekday: "short" }).replace(".", "").toUpperCase();
  const tone = past ? PAST_COLOR : color;
  const content = (
    <>
      <View style={styles.dateCol}>
        <Text style={[styles.day, past && styles.pastText]}>{d.getDate()}</Text>
        <Text style={styles.dow}>{dow}</Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Ionicons name={icon} size={14} color={tone} />
          <Text style={[styles.kind, { color: tone }]}>{time ? `${kindLabel} · ${time}` : kindLabel}</Text>
        </View>
        <Text style={[styles.title, past && styles.pastTitle]} numberOfLines={2}>
          {title}
        </Text>
        {line ? <Text style={styles.line}>{line}</Text> : null}
        {mine ? (
          <View style={styles.mineRow}>
            <Text style={[styles.minePill, past && styles.minePillPast]}>{t("feed.you")}</Text>
            <Text style={[styles.mine, past && styles.minePast]}>{mine}</Text>
          </View>
        ) : null}
        {status ? (
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={styles.status}>{status.text}</Text>
          </View>
        ) : null}
        {tag ? <Text style={styles.tag}>{tag}</Text> : null}
      </View>
      {onPress ? (
        <Ionicons name={select ? "chevron-forward" : open ? "chevron-up" : "chevron-down"} size={18} color={SOFT} style={styles.chev} />
      ) : null}
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, open && !select && styles.rowOpen, open && select && styles.rowSelected, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={select ? { selected: !!open } : { expanded: !!open }}
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

function Meeting({
  item,
  past,
  open,
  onToggle,
  mode = "inline",
  me,
  parts,
  duties,
  cleaning,
  readiness,
  nameOf,
  groupName,
  canEditProgramme,
  canEditDuties,
  canEditCleaning,
}: {
  item: MeetingItem;
  past: boolean;
  open: boolean;
  onToggle: () => void;
  /** Open in place (phone), a list row (wide, left), or whole (wide, right). */
  mode?: "inline" | "row" | "detail";
  me: string | null;
  parts: Assignment[];
  duties: Duty[];
  cleaning: CleaningAssignment[];
  readiness?: ReadinessMeeting;
  nameOf: Map<string, string>;
  groupName: Map<string, string>;
  canEditProgramme: boolean;
  canEditDuties: boolean;
  canEditCleaning: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>("programme");
  const [planWindows, setPlanWindows] = useState<number[] | null>(null);
  const name = (id: string | null) => (id ? nameOf.get(id) ?? null : null);
  // Who takes a part. A speaker from another congregation — and the circuit
  // overseer — is written into the programme BY NAME, with no card of ours
  // behind it (speakerName, no publisherId); the feed looked only at the card
  // and showed «докладчик не назначен» for every visiting speaker (25
  // September, Lionel: «в выходной день нет докладчиков»). The planning screen
  // has always read both; so does the feed now.
  const who = (p: Assignment | undefined) =>
    !p ? null : p.speakerName?.trim() ? p.speakerName.trim() : name(p.publisherId);
  const whoFrom = (p: Assignment | undefined) =>
    p && !p.publisherId && p.speakerName?.trim() ? p.speakerCongregation?.trim() || null : null;

  const micCount = duties.filter((d) => d.dutyType === "microphone").length;
  const dutyLabel = (d: Duty) =>
    d.dutyType === "custom"
      ? d.customLabel || t("duties.types.custom")
      : t(`duties.types.${d.dutyType}`) +
        (d.dutyType === "microphone" && micCount > 1 ? ` ${d.slotIndex + 1}` : "");

  // THE ROW SAYS WHAT THE MEETING IS ABOUT (25 September): the weekday by its
  // first talk, the weekend by its public talk; the line under it says who —
  // the chairman on a weekday, the speaker (and where he comes from) at the
  // weekend. Before, the row's big words were «Встреча в будний день» on
  // every other row, and what mattered sat grey below.
  const kindTitle = item.kind === "midweek" ? t("eventTypes.midweek") : t("eventTypes.weekend");
  const chair = parts.find((p) => CHAIR_KEYS.has(p.partKey));
  const talk = parts.find((p) => p.partKey === "public_talk_speaker");
  const firstTalk = parts.find((p) => p.partKey === "treasures_talk");
  let title = kindTitle;
  let line: string;
  if (parts.length === 0) line = t("feed.notLoaded");
  else if (item.kind === "weekend" && talk) {
    title = partDisplay(talk.partKey, talk.partTitle).label;
    const speaker = who(talk);
    const from = whoFrom(talk);
    line = speaker ? (from ? `${speaker} · ${from}` : speaker) : t("feed.speakerUnassigned");
  } else {
    if (item.kind === "midweek" && firstTalk) title = partDisplay(firstTalk.partKey, firstTalk.partTitle).label;
    line = chair?.publisherId
      ? chair.publisherId === me
        ? t("feed.chairmanYou")
        : t("feed.chairman", { name: name(chair.publisherId) ?? "" })
      : t("feed.chairman", { name: t("feed.unassigned") });
  }

  // What is yours — parts (not chairing: the line above already says it) and duties.
  const myParts = parts
    .filter((p) => !CHAIR_KEYS.has(p.partKey) && (p.publisherId === me || p.assistantPublisherId === me))
    .map((p) => {
      const label = ROLE_KEYS.has(p.partKey) ? getPartLabel(p.partKey) : partDisplay(p.partKey, p.partTitle).label;
      // Helping is not taking the part: say so, as Home does.
      return p.publisherId !== me ? t("feed.mineAsAssistant", { part: label }) : label;
    });
  const myDuties = duties.filter((d) => d.publisherId === me).map(dutyLabel);
  // Case as the app writes it. Lowering the first letter would be wrong for a
  // topic that starts with a name («Иегова поддерживает…»).
  const mineList = [...myParts, ...myDuties];
  const mine = me && mineList.length ? mineList.join(", ") : null;

  // Readiness — only to those who assemble, only ahead.
  let status: { color: string; text: string } | null = null;
  if (readiness && !past) {
    const p = readiness.programme;
    const prog = !p.loaded
      ? { c: SOFT, s: t("feed.notLoaded") }
      : p.missing.length === 0
        ? { c: OK, s: t("feed.ready") }
        : p.assigned === 0
          ? { c: SOFT, s: t("feed.noneYet") }
          : p.missing.length <= 3
            ? { c: WARN, s: t("feed.missing", { parts: p.missing.map((k) => partDisplay(k, null).label).join(", ") }) }
            : { c: WARN, s: t("feed.missingCount", { count: p.missing.length, total: p.total }) };
    const duties = t("feed.dutiesShort", { assigned: readiness.duties.assigned, total: readiness.duties.total });
    // «Not loaded» is already the row's own line; saying it again here was a
    // repeat, so only the duties count remains.
    status = !p.loaded ? { color: SOFT, text: duties } : { color: prog.c, text: `${prog.s} · ${duties}` };
  }

  const mineInProgramme = myParts.length > 0;
  const mineInDuties = myDuties.length > 0;

  return (
    // The screenshot script finds a meeting by week and kind to check that a
    // link to a week lands on it (data-testid on the web; nothing visible).
    <View testID={mode === "detail" ? undefined : `meeting-${item.week}-${item.kind}`}>
      {mode !== "detail" ? (
      <Row
        date={item.date}
        kindLabel={item.kind === "midweek" ? t("feed.kindMidweek") : t("feed.kindWeekend")}
        icon={KIND[item.kind].icon}
        title={title}
        time={item.time}
        line={line}
        mine={mine}
        status={status}
        tag={item.movedByVisit ? t("feed.movedByVisit") : null}
        color={KIND[item.kind].color}
        past={past}
        open={open}
        select={mode === "row"}
        onPress={onToggle}
      />
      ) : (
        <DetailHead
          date={item.date}
          time={item.time}
          kind={title === kindTitle ? kindTitle : `${kindTitle} · ${title}`}
          line={line}
          mine={mine ? t(past ? "feed.minePast" : "feed.mine", { list: mine }) : null}
          status={status}
        />
      )}
      {(mode === "inline" && open) || mode === "detail" ? (
        <View style={[styles.inset, mode === "detail" && styles.insetDetail]}>
          {tab === "programme" && mineInDuties && !mineInProgramme ? (
            <Pressable
              style={({ pressed }) => [styles.strip, pressed && styles.pressed]}
              onPress={() => setTab("duties")}
              accessibilityRole="button"
            >
              <Text style={styles.stripText}>
                {t(past ? "feed.minePast" : "feed.mine", { list: myDuties.join(", ") })}
              </Text>
              <Text style={styles.stripTab}>{t("feed.tabDuties")}</Text>
              <Ionicons name="chevron-forward" size={14} color={ACC} />
            </Pressable>
          ) : null}
          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            segments={[
              { key: "programme", label: t("feed.tabProgramme"), dot: TAB_DOT.programme },
              { key: "duties", label: t("feed.tabDuties"), dot: TAB_DOT.duties },
              { key: "cleaning", label: t("feed.tabCleaning"), dot: TAB_DOT.cleaning },
            ]}
          />
          <View style={styles.card}>
            {tab === "programme" ? (
              <Programme parts={parts} kind={item.kind} time={item.time} me={me} name={name} who={who} whoFrom={whoFrom} />
            ) : tab === "duties" ? (
              duties.length ? (
                duties.map((d) => (
                  <PairLine key={d.id} label={dutyLabel(d)} name={name(d.publisherId)} mine={!!me && d.publisherId === me} />
                ))
              ) : (
                <Text style={styles.empty}>{t("feed.noDuties")}</Text>
              )
            ) : cleaning.filter((c) => c.serviceGroupId).length ? (
              [...cleaning]
                .filter((c) => c.serviceGroupId)
                .sort((a, b) => SLOT_ORDER.indexOf(a.slotType) - SLOT_ORDER.indexOf(b.slotType))
                .map((c) => (
                  <View key={c.id}>
                  <PairLine
                    label={t(`cleaning.slots.${c.slotType}`)}
                    name={groupName.get(c.serviceGroupId as string) ?? null}
                    extra={
                      c.slotType === "thorough"
                        ? c.thoroughPlannedAt
                          ? new Date(c.thoroughPlannedAt).toLocaleString(i18n.language, {
                              weekday: "long",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : t("feed.dayNotSet")
                        : null
                    }
                  />
                  {/* The windows this week, and one tap to where they are. */}
                  {c.slotType === "thorough" && c.windows?.length ? (
                    <View style={styles.windowsIndent}>
                      <WindowsLine windows={c.windows} onOpen={() => setPlanWindows(c.windows)} />
                    </View>
                  ) : null}
                  </View>
                ))
            ) : (
              <Text style={styles.empty}>{t("feed.noCleaning")}</Text>
            )}
          </View>
          {!past && tab === "programme" && canEditProgramme ? (
            <EditLink
              label={t("feed.editProgramme")}
              onPress={() => router.push(`/schedule/edit?week=${item.week}&meeting=${item.kind}` as never)}
            />
          ) : null}
          {!past && tab === "duties" && canEditDuties ? (
            // Straight to this meeting's sheet — duties live in their own screen
            // now, not in the programme screen.
            <EditLink
              label={t("feed.editDuties")}
              onPress={() => router.push(`/publishers/duties-meeting?week=${item.week}&meeting=${item.kind}` as never)}
            />
          ) : null}
          {!past && tab === "cleaning" && canEditCleaning ? (
            <EditLink
              label={t("feed.editCleaning")}
              onPress={() => router.push(`/publishers/cleaning-week?week=${item.week}` as never)}
            />
          ) : null}
          <WindowsPlanDialog windows={planWindows} onClose={() => setPlanWindows(null)} />
        </View>
      ) : null}
    </View>
  );
}

/** The programme of one meeting, read top to bottom. */
function Programme({
  parts,
  kind,
  time,
  me,
  name,
  who,
  whoFrom,
}: {
  parts: Assignment[];
  kind: Kind;
  time: string | null;
  me: string | null;
  name: (id: string | null) => string | null;
  /** The person of a part — a publisher, or a guest written by name. */
  who: (p: Assignment | undefined) => string | null;
  /** A guest's congregation, when the part is his. */
  whoFrom: (p: Assignment | undefined) => string | null;
}) {
  const { t } = useTranslation();
  if (parts.length === 0) return <Text style={styles.empty}>{t("feed.notLoaded")}</Text>;
  const times = kind === "midweek" ? buildMidweekPartTimes(parts, time) : buildWeekendPartTimes(parts, time);
  const out: ReactNode[] = [];
  // The chairman heads the programme, weekday and weekend alike — the planning
  // screen has him, and a programme without him left a reader asking who leads
  // (25 September). Shown even when not yet named: an empty chair is news too.
  const chair = parts.find((p) => CHAIR_KEYS.has(p.partKey));
  if (chair) {
    out.push(
      <ChairLine
        key={`chair-${chair.id}`}
        label={t("feed.chairmanLabel")}
        name={name(chair.publisherId)}
        mine={!!me && chair.publisherId === me}
      />,
    );
  }
  let lastSub: string | null = null;
  // The colour of the section a part is in: its people are written in it, so
  // the eye finds the names down the sheet (25 September).
  let tone = INK;
  // Songs get no interval of their own from the schedule screen's counter; a
  // song starts where the part before it ends — the same minute, no new rule.
  let lastEnd: string | null = null;
  for (const p of parts) {
    if (READER_KEYS.has(p.partKey)) continue;
    // The chairman is set at the head of the programme, above.
    if (CHAIR_KEYS.has(p.partKey)) continue;
    // A weekend opening song with no number is a line of one word; the prayer
    // right below carries the moment.
    if (p.partKey === "weekend_opening_song" && !p.partTitle) continue;
    const sub = resolveSubsection(p.partKey);
    if (sub !== lastSub) {
      if (LABELLED.has(sub)) {
        const meta = SUBSECTIONS[sub];
        out.push(<SectionChip key={`s${p.id}`} label={t(meta.i18nKey)} color={meta.color} soft={meta.colorMuted} />);
        tone = meta.color;
      } else tone = INK;
      lastSub = sub;
    }
    const interval = times.get(p.id);
    const start = interval?.start ?? (SONG_KEYS.has(p.partKey) ? lastEnd : null);
    if (interval?.end) lastEnd = interval.end;
    const shown = partDisplay(p.partKey, p.partTitle);
    const person = who(p);
    const mine = !!me && p.publisherId === me;
    const minutes = p.partDurationMin ? t("feed.minutesOnly", { n: p.partDurationMin }) : null;
    if (SONG_KEYS.has(p.partKey)) {
      out.push(<SongLine key={p.id} time={start} text={p.partTitle || shown.label} />);
    } else if (PRAYER_KEYS.has(p.partKey)) {
      const text = [shown.subtitle, shown.label].filter(Boolean).join(" · ");
      out.push(<PrayerLine key={p.id} time={start} label={text} name={person} mine={mine} />);
    } else if (p.partKey === "public_talk_speaker" || p.partKey === "co_concluding_talk") {
      out.push(
        <Topic key={p.id} meta={t("feed.minutes", { time: start ?? "", n: p.partDurationMin ?? 30 })} title={shown.label}>
          <PairLine label={t("feed.speaker")} name={person} extra={whoFrom(p)} mine={mine} tone={tone} />
        </Topic>,
      );
    } else if (p.partKey === "watchtower_conductor") {
      const reader = parts.find((x) => x.partKey === "watchtower_reader");
      out.push(
        <Topic key={p.id} meta={t("feed.minutes", { time: start ?? "", n: p.partDurationMin ?? 60 })} title={shown.label}>
          <PairLine label={t("feed.lead")} name={person} mine={mine} tone={tone} />
          <PairLine
            label={t("schedule.weekend.reader")}
            name={who(reader)}
            mine={!!me && reader?.publisherId === me}
            tone={tone}
          />
        </Topic>,
      );
    } else {
      const readerKey = READER_OF[p.partKey];
      const reader = readerKey ? parts.find((x) => x.partKey === readerKey) : undefined;
      // The second person of a part — the assistant, or the reader of the
      // Bible study — on a line of his own, NAMED AS WHAT HE IS. «Вы» marks
      // the line that is yours and no other: an assistant looking at the
      // sheet once saw «Вы» in the student's place and his own name under it
      // as though he were the partner (25 September, Lionel: the part is
      // Irina Benz's, Dina Backmann helps — the sheet said «Вы · Бакманн
      // Дина»).
      const helper = p.assistantPublisherId
        ? { label: t("feed.assistantLabel"), name: name(p.assistantPublisherId), mine: !!me && p.assistantPublisherId === me }
        : reader
          ? { label: t("feed.readerLabel"), name: who(reader), mine: !!me && reader.publisherId === me }
          : null;
      out.push(
        <PartLine
          key={p.id}
          time={start}
          minutes={minutes}
          title={shown.label}
          name={person}
          extra={helper ? null : whoFrom(p)}
          helper={helper}
          mine={mine}
          tone={tone}
        />,
      );
    }
  }
  return <>{out}</>;
}

/** Field-ministry meetings of one day — one row, no tabs: nothing to switch between. */
function FieldDay({
  item,
  past,
  open,
  onToggle,
  mode = "inline",
  me,
  nameOf,
  groupName,
}: {
  item: FieldItem;
  past: boolean;
  open: boolean;
  onToggle: () => void;
  mode?: "inline" | "row" | "detail";
  me: string | null;
  nameOf: Map<string, string>;
  groupName: Map<string, string>;
}) {
  const { t } = useTranslation();
  const what = (m: FieldServiceMeeting) =>
    (m.serviceGroupId ? groupName.get(m.serviceGroupId) : null) ?? t("fieldService.generalBadge");
  const mineAt = item.meetings.find((m) => !!me && m.conductorPublisherId === me);
  const title = item.meetings.length > 1 ? t("feed.fieldService") : t("feed.fieldServiceOne");
  const line = item.meetings.map((m) => t("feed.fieldAt", { what: what(m), time: m.startTime })).join(" · ");
  const mine = mineAt ? t("feed.youLeadShort", { time: mineAt.startTime }) : null;
  return (
    <View>
      {mode !== "detail" ? (
        <Row
          date={item.date}
          kindLabel={t("feed.kindField")}
          icon={KIND.field.icon}
          title={title}
          time={item.meetings[0]?.startTime ?? null}
          line={line}
          mine={mine}
          color={KIND.field.color}
          past={past}
          open={open}
          select={mode === "row"}
          onPress={onToggle}
        />
      ) : (
        <DetailHead date={item.date} kind={title} line={line} mine={mineAt ? t("feed.youLead", { time: mineAt.startTime }) : null} />
      )}
      {(mode === "inline" && open) || mode === "detail" ? (
        <View style={[styles.inset, mode === "detail" && styles.insetDetail]}>
          <View style={[styles.card, styles.cardFirst]}>
            {item.meetings.map((m) => (
              <PartLine
                key={m.id}
                time={m.startTime}
                title={what(m)}
                subtitle={m.address}
                name={m.conductorPublisherId ? nameOf.get(m.conductorPublisherId) ?? null : null}
                mine={!!me && m.conductorPublisherId === me}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The Memorial in the feed: a row like a meeting's, and open, its programme —
 * the very block the old screen shows, read-only here (editing is done in
 * «Составление программы», where the edit link leads, as for any meeting).
 * The whole programme is for the whole congregation (decided 31 August).
 */
function MemorialDay({
  item,
  past,
  open,
  onToggle,
  mode = "inline",
  duties,
  canEdit,
}: {
  item: MemorialItem;
  past: boolean;
  open: boolean;
  onToggle: () => void;
  mode?: "inline" | "row" | "detail";
  duties: Duty[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const title = t("eventTypes.memorial");
  const line = [item.event.address, item.line].filter(Boolean).join(" · ");
  return (
    <View testID={mode === "detail" ? undefined : `memorial-${item.week}`}>
      {mode !== "detail" ? (
        <Row
          date={item.date}
          kindLabel={t("feed.kindMemorial")}
          icon="flame-outline"
          title={title}
          time={item.event.time ?? null}
          line={line}
          color={KIND.special.color}
          past={past}
          open={open}
          select={mode === "row"}
          onPress={onToggle}
        />
      ) : (
        <DetailHead date={item.date} time={item.event.time ?? null} kind={title} line={line} />
      )}
      {(mode === "inline" && open) || mode === "detail" ? (
        <View style={[styles.inset, mode === "detail" && styles.insetDetail]}>
          <View style={[styles.card, styles.cardFirst]}>
            <MemorialMeetingBlock bare event={item.event} canEdit={false} hiddenCount={0} duties={duties} />
          </View>
          {canEdit ? (
            <EditLink
              label={t("feed.editProgramme")}
              onPress={() => router.push(`/schedule/edit?week=${item.week}&meeting=${item.takes}` as never)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function EditLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.edit, pressed && styles.pressed]} onPress={onPress} accessibilityRole="link">
      <Text style={styles.editText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  windowsIndent: { marginTop: -2, marginBottom: 8 },
  screen: { flex: 1, backgroundColor: "#ffffff" },
  fill: { flex: 1 },
  veil: { ...StyleSheet.absoluteFillObject, alignItems: "center", paddingTop: 96 },
  content: { paddingBottom: 40 },
  // Every piece of the feed is a child of the ScrollView itself (see «the feed
  // as a flat list»), so the column's width is set on each piece.
  piece: { width: "100%", maxWidth: 720, alignSelf: "center" },
  pieceWide: { width: "100%" },
  bar: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
    zIndex: 1,
  },
  barMonth: { fontSize: 18, fontFamily: FONT.extrabold, color: INK, letterSpacing: -0.2 },
  chipsScroll: { marginHorizontal: -16, flexGrow: 0 },
  chips: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    justifyContent: "center",
  },
  chipText: { fontSize: 14, fontFamily: FONT.bold },
  monthRow: {
    backgroundColor: "#f1f5f9",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  monthText: { fontSize: 16, fontFamily: FONT.extrabold, color: INK },
  pastHead: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  pastAsk: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  pastAskText: { fontSize: 14, fontFamily: FONT.bold, color: "#334155" },
  pastLabel: {
    flex: 1,
    fontSize: 12,
    fontFamily: FONT.bold,
    letterSpacing: 1.2,
    color: SOFT,
    textTransform: "uppercase",
  },
  pastBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    justifyContent: "center",
  },
  pastBtnText: { fontSize: 13, fontFamily: FONT.bold, color: "#334155" },
  filtered: {
    margin: 16,
    marginTop: 0,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    alignItems: "center",
    gap: 10,
  },
  filteredText: { fontSize: 14, fontFamily: FONT.semibold, color: MUTE, textAlign: "center" },
  filteredAll: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: INK,
    justifyContent: "center",
  },
  filteredAllText: { fontSize: 14, fontFamily: FONT.bold, color: "#ffffff" },
  pressed: { opacity: 0.7 },
  yearStart: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  yearStartText: { fontSize: 12, fontFamily: FONT.semibold, color: SOFT },
  rule: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  label: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
    fontSize: 12,
    fontFamily: FONT.bold,
    letterSpacing: 1.2,
    color: SOFT,
    textTransform: "uppercase",
  },
  today: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 },
  todayText: { fontSize: 12, fontFamily: FONT.extrabold, letterSpacing: 0.7, color: ACC, textTransform: "uppercase" },
  todayRule: { flex: 1, height: 2, borderRadius: 2, backgroundColor: ACC_BG },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 44,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowOpen: { borderBottomWidth: 0 },
  rowSelected: { backgroundColor: "#f0f9ff" },
  split: { flex: 1, flexDirection: "row", backgroundColor: "#ffffff" },
  listPane: { width: 440, flexGrow: 0, borderRightWidth: 1, borderRightColor: "#e2e8f0" },
  listContent: { paddingBottom: 40 },
  detailPane: { flex: 1, backgroundColor: "#f6f8fb" },
  detailContent: { padding: 24, alignItems: "center" },
  detailColumn: { width: "100%", maxWidth: 760 },
  insetDetail: { backgroundColor: "transparent", paddingHorizontal: 0, borderBottomWidth: 0 },
  detailHead: { paddingBottom: 12 },
  detailTitle: { fontSize: 24, fontFamily: FONT.extrabold, color: INK, letterSpacing: -0.3 },
  detailSub: { fontSize: 15, fontFamily: FONT.medium, color: SOFT, marginTop: 4 },
  detailMine: { fontSize: 14, fontFamily: FONT.bold, color: ACC, marginTop: 8 },
  detailStatus: { paddingLeft: 0 },
  dateCol: { width: 40, alignItems: "center", paddingTop: 1 },
  day: { fontSize: 25, lineHeight: 27, fontFamily: FONT.extrabold, color: INK, fontVariant: ["tabular-nums"] },
  dow: { fontSize: 11, fontFamily: FONT.bold, letterSpacing: 0.9, color: SOFT, marginTop: 3 },
  pastText: { color: SOFT },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  kind: { fontSize: 13, fontFamily: FONT.bold, fontVariant: ["tabular-nums"] },
  title: { fontSize: 16, lineHeight: 21, fontFamily: FONT.bold, color: INK, marginTop: 3 },
  pastTitle: { color: MUTE },
  line: { fontSize: 14, fontFamily: FONT.medium, color: MUTE, marginTop: 2 },
  mineRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6 },
  minePill: {
    flexShrink: 0,
    marginTop: 1,
    fontSize: 11,
    fontFamily: FONT.extrabold,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: ACC,
    backgroundColor: ACC_BG,
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  minePillPast: { color: SOFT, backgroundColor: "#f1f5f9" },
  mine: { flexShrink: 1, fontSize: 14, fontFamily: FONT.semibold, color: ACC },
  minePast: { color: SOFT },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: 12, fontFamily: FONT.medium, color: SOFT, flexShrink: 1 },
  tag: {
    alignSelf: "flex-start",
    marginTop: 6,
    fontSize: 12,
    fontFamily: FONT.bold,
    color: "#5b21b6",
    backgroundColor: "#ede9fe",
    borderRadius: 7,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  chev: { marginTop: 4 },
  inset: {
    backgroundColor: "#f6f8fb",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: ACC_BG,
    marginBottom: 10,
  },
  stripText: { flex: 1, fontSize: 14, fontFamily: FONT.semibold, color: ACC },
  stripTab: { fontSize: 13, fontFamily: FONT.bold, color: ACC },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8edf3",
    borderRadius: 16,
    // The chairman's block and the section bands reach the card's edges.
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
    marginTop: 10,
  },
  cardFirst: { marginTop: 0 },
  empty: { fontSize: 14, fontFamily: FONT.medium, color: SOFT, paddingVertical: 12 },
  edit: {
    minHeight: 44,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  editText: { fontSize: 14, fontFamily: FONT.bold, color: ACC },
  end: {
    margin: 16,
    padding: 18,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "#f6f8fb",
    alignItems: "center",
    gap: 4,
  },
  endTitle: { fontSize: 15, fontFamily: FONT.bold, color: MUTE },
  endNote: { fontSize: 14, fontFamily: FONT.medium, color: SOFT },
  more: {
    alignSelf: "center",
    marginTop: 16,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    justifyContent: "center",
  },
  moreText: { fontSize: 14, fontFamily: FONT.bold, color: ACC },
});
