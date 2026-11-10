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
import { meetingChangeOn, takesMeetingMode } from "../../../lib/event-meeting";
import { MeetingChangeNote } from "../../../components/MeetingChangeNote";
import { WindowsLine, WindowsPlanDialog } from "../../../components/WindowsPlan";
import { effectiveVersionFor } from "../../../lib/meeting-schedule";
import { addDays, formatDateISO, parseISODate, startOfWeekMonday } from "../../../lib/dates";
import { partDisplay } from "../../../lib/part-display";
import { readerTitle } from "../../../lib/reader-titles";
import { MEETING_LENGTH_MIN } from "../../../lib/home-digest";
import { useSongsMap, enrichSongRef } from "../../../lib/songs";
import { FieldCancelled, FieldMoved, FieldNotice } from "../../../components/FieldNotice";
import { movedDayLabel, movedFromShown, rowKey, withMoveStandIns } from "../../../lib/field-moves";
import { FieldMeetingBlock, WhoLine, type FieldHelper, type FieldWho } from "../../../components/FieldMeetingBlock";
import { arrangeFieldDay, noteForPlace } from "../../../lib/field-audience";
import type { FieldPlace } from "../../../lib/field-audience";
import {
  SUBSECTIONS,
  buildMidweekPartTimes,
  buildPartNumbers,
  buildWeekendPartTimes,
  getPartLabel,
  resolveSubsection,
  sectionInk,
} from "../../../lib/parts";
import { useMyPublisher } from "../../../lib/useMyPublisher";
import { KeptEnd, KeptNotice, LoadFailed } from "../../../components/ConnectionState";
import { earlierPiece } from "../../../lib/offline-keep";
import { useAuth } from "../../../lib/auth";
import { sessionVerdict } from "../../../lib/session-verdict";
import { FONT } from "../../../lib/typography";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { MemorialMeetingBlock } from "../../../components/MemorialMeetingBlock";
import { ConductResultLink } from "../../../components/ConductEntry";
import {
  ChairLine,
  PairLine,
  PartLine,
  PrayerLine,
  SectionChip,
  SongLine,
  Topic,
} from "../../../components/ProgrammeSheet";
import { lowerFirst } from "../../../lib/lower-first";
import { capitalizeFirst } from "../../../lib/relative-time";
import { useMeetingMoves } from "../../../lib/useMeetingMoves";
import { MovedMark, movedWhen } from "../../../components/MovedMark";
import { useNotHeld } from "../../../components/NotHeldCard";

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
const upperFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
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
  // An event: a quiet slate (9 November 2026) — the amber it wore before is
  // the workbook's gold now, and means one section and nothing else.
  special: { color: "#475569", icon: "star-outline" },
} as const;
/**
 * The date tile's ground for each colour a row is drawn in (the redesign of
 * 9 November 2026): the date reads as WHAT the day is before a word is read.
 */
const TILE_BG: Record<string, string> = {
  "#0e7490": "#e0f1f5",
  "#6d28d9": "#efe9fb",
  "#15803d": "#e3f3e7",
  "#475569": "#eef1f5",
};
/** The Memorial: a tile of its own, filled. */
const MEMORIAL_COLOR = "#7f1d1d";

/** «19:30» → minutes into the day. */
const hm = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
/** Minutes into the day → «20:45». */
const clock = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * The minute of the day, kept current while `active` — only a meeting of
 * today runs a clock, so the feed does not tick for every row.
 */
function useMinuteClock(active: boolean): number | null {
  const read = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  const [now, setNow] = useState<number | null>(active ? read() : null);
  useEffect(() => {
    if (!active) {
      setNow(null);
      return;
    }
    setNow(read());
    const id = setInterval(() => setNow(read()), 30_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
const PAST_COLOR = "#94a3b8";
const SLOT_ORDER = ["after_meeting", "thorough", "general"];

const INK = "#0f172a";
const MUTE = "#475569";
const SOFT = "#64748b";
const PLAIN = "#334155";
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

type MeetingItem = {
  type: "meeting";
  id: string;
  date: string;
  week: string;
  kind: Kind;
  time: string | null;
  movedByVisit: boolean;
  /** Moved for this one week — its usual day and hour (5 November 2026). */
  movedFrom: { date: string | null; time: string | null } | null;
  /** An event that day changes the meeting — another hour, place, programme. */
  change: SpecialEvent | null;
};
type FieldItem = { type: "field"; id: string; date: string; week: string; meetings: FieldServiceMeeting[] };
type SpecialItem = {
  type: "special";
  id: string;
  date: string;
  title: string;
  line: string;
  /** An event with a page of its own: the row opens it. */
  eventId?: string;
  /** Its own hour, when it has one. */
  time?: string | null;
  /** The meetings it takes away: their leftover assignments get a mark. */
  notHeld?: { week: string; kind: Kind | null };
};
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
  const { user } = useAuth();
  const { myPublisherId: me, myPublisher } = useMyPublisher();
  const myGroupId = myPublisher?.serviceGroupId ?? null;
  const canSeeReadiness =
    perms.canEditMidweekSchedule || perms.canEditWeekendSchedule || perms.canEditDuties;

  const today = formatDateISO(new Date());
  // A MEETING OF TODAY THAT IS ALREADY OVER (5 October 2026).
  //
  // «Past» was a matter of the date alone, so on the evening after a meeting
  // the feed still opened on it — whole, first, as though it lay ahead — and
  // the next one was a screen below. Home has had the rule since 26
  // September (lib/home-digest isOver: the hour plus a meeting's length);
  // the same length is used here, so the two screens agree on when a
  // meeting stops being «next». A meeting with no hour on record is never
  // called over on its own day.
  const overToday = (x: { date: string; time?: string | null }) => {
    if (x.date !== today || !x.time || !/^\d{1,2}:\d{2}/.test(x.time)) return false;
    const [h, m] = x.time.split(":").map(Number);
    const now = new Date();
    return h * 60 + (m || 0) + MEETING_LENGTH_MIN < now.getHours() * 60 + now.getMinutes();
  };
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
  // `meeting=field` with `day` (YYYY-MM-DD) opens that day's field service —
  // Home's rows lead here, each to its own meeting (26 September).
  const params = useLocalSearchParams<{ week?: string; meeting?: string; day?: string }>();
  const targetWeek = useMemo(() => {
    const w = typeof params.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : null;
    if (!w) return null;
    const monday = formatDateISO(startOfWeekMonday(parseISODate(w)));
    return monday >= startWeek ? monday : null;
  }, [params.week, startWeek]);
  const targetKind: Kind | "memorial" | "field" | null =
    params.meeting === "midweek" ||
    params.meeting === "weekend" ||
    params.meeting === "memorial" ||
    params.meeting === "field"
      ? params.meeting
      : null;
  const targetDay = typeof params.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : null;
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
      // Called-off meetings too, drawn crossed out (13 October 2026).
      queryFn: () => fieldServiceApi.list({ weekStart: sp.from, weekEnd: sp.to, cancelled: true }),
    })),
  });
  const moves = useMeetingMoves();
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

  // EVERYTHING the feed is drawn from — for «shown from before» and for the
  // retry. And what makes it «did not load»: the programme piece at the end,
  // or the meeting times (without them no meeting is drawn at all). Until 8
  // October either failure left an empty feed and «Показать ещё», which in a
  // hall with no signal reads as «nothing is planned».
  // NO SIGNAL, AND THIS MONDAY'S PIECE WAS NEVER KEPT (9 October 2026): the
  // first piece of the feed — from this Monday — is taken from an earlier
  // kept piece that still reaches these weeks (lib/offline-keep.ts). Only
  // that piece: later ones were never kept anywhere.
  const curIdx = spans.findIndex((sp) => sp.from === thisWeek);
  const cur = curIdx >= 0 ? spans[curIdx] : null;
  const has = (qs: { data?: unknown }[]) => curIdx >= 0 && qs[curIdx]?.data !== undefined;
  const earlier = useMemo(
    () => ({
      assignments: cur && !has(assignmentsQs) ? earlierPiece<Assignment>("assignments", user?.id, cur.from, cur.to) : null,
      duties: cur && !has(dutiesQs) ? earlierPiece<Duty>("duties", user?.id, cur.from, cur.to) : null,
      cleaning: cur && !has(cleaningQs) ? earlierPiece<CleaningAssignment>("cleaning", user?.id, cur.from, cur.to) : null,
      field: cur && !has(fieldQs) ? earlierPiece<FieldServiceMeeting>("field-service", user?.id, cur.from, cur.to) : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cur?.from, cur?.to, user?.id, has(assignmentsQs), has(dutiesQs), has(cleaningQs), has(fieldQs)],
  );
  const standIns = [
    [earlier.assignments, assignmentsQs[curIdx]],
    [earlier.duties, dutiesQs[curIdx]],
    [earlier.cleaning, cleaningQs[curIdx]],
    [earlier.field, fieldQs[curIdx]],
  ] as const;
  const feedQueries = [
    ...assignmentsQs,
    ...dutiesQs,
    ...cleaningQs,
    ...fieldQs,
    eventsQ,
    settingsQ,
    publishersQ,
    groupsQ,
  ];
  // For «shown from before»: an earlier piece counts as the request's own old answer.
  const keptAsked = standIns
    .filter(([e, q]) => e && q)
    .map(([e, q]) => ({ data: e!.rows, isError: true, error: q!.error, dataUpdatedAt: e!.at }));
  // The programme piece at the end stands in from an earlier one: the feed
  // knows the weeks only up to where that piece ends — and must not call
  // that «the end of the programme».
  const keptEnd = curIdx === assignmentsQs.length - 1 && earlier.assignments ? earlier.assignments.coveredTo : null;
  const feedFailed = [keptEnd ? undefined : assignmentsQs[assignmentsQs.length - 1], settingsQ].find(
    (q) => q && q.isError && q.data === undefined,
  );
  const retryFeed = () => {
    for (const q of feedQueries) if (q.isError) void q.refetch();
  };

  const allAssignments = assignmentsQs.flatMap((q, i) => q.data?.data ?? (i === curIdx ? (earlier.assignments?.rows ?? []) : []));
  const allReadiness = readinessQs.flatMap((q) => q.data ?? []);
  const allDuties = dutiesQs.flatMap((q, i) => q.data ?? (i === curIdx ? (earlier.duties?.rows ?? []) : []));
  const allCleaning = cleaningQs.flatMap((q, i) => q.data ?? (i === curIdx ? (earlier.cleaning?.rows ?? []) : []));
  // A moved meeting is said on its old day too (lib/field-moves.ts).
  const allField = withMoveStandIns(
    fieldQs.flatMap((q, i) => q.data ?? (i === curIdx ? (earlier.field?.rows ?? []) : [])),
    formatDateISO(new Date()),
  );

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
  const keptLastWeek = keptEnd ? formatDateISO(addDays(atMidnight(keptEnd), -7)) : null;
  const programmeEnd = keptLastWeek
    ? keptLastWeek < lastSpanWeek
      ? keptLastWeek
      : lastSpanWeek
    : reachedEnd
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
  // UNDER «ПРОПОВЕДЬ» THE FEED RUNS TO THE LAST MEETING PLANNED (stage 4,
  // October 2026), not to the last workbook: a month prepared two months
  // ahead is out before its workbook is, and the feed used to stop short of
  // it with «Дальше программы нет» — untrue for this filter. The loaded
  // pieces hold the meetings already; only the last week drawn moves.
  const lastFieldWeek = allField.reduce<string | null>(
    (m, f) => (!m || f.weekStartDate > m ? f.weekStartDate : m),
    null,
  );
  const fieldOnly = filter === "field";
  const endWeek = [
    programmeEnd,
    targetWeek ?? "",
    fieldOnly && lastFieldWeek ? minISO(lastFieldWeek, lastSpanWeek) : "",
  ].reduce(maxISO);
  // The meetings end where the last loaded piece holds none: one more piece
  // is offered while the latest one still has meetings in it.
  const fieldReachedEnd =
    lastLoaded && !!fieldQs[fieldQs.length - 1]?.data && !allField.some((f) => f.weekStartDate >= lastSpan.from);

  // Every dated thing the weeks hold, in date order.
  const items: Item[] = [];
  for (let w = firstMonday; formatDateISO(w) <= endWeek; w = addDays(w, 7)) {
    const week = formatDateISO(w);
    const version = effectiveVersionFor(settingsQ.data?.versions, week);
    const rules = weekRules({ weekStartISO: week, version, events: eventsQ.data ?? [] , moves });
    if (!rules.meetingsHeld && rules.congress) {
      items.push({
        type: "special",
        id: `congress|${week}`,
        date: rules.congress.date,
        title: t(`specialEvents.types.${rules.congress.type}`),
        line: t("feed.noMeetings"),
        notHeld: { week, kind: null },
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
      if (!date) continue;
      if (rules.isTakenAway(kind)) {
        // A branch representative's visit or «Other» that takes the meeting's
        // place stands in the feed where the meeting would have been — until
        // now the meeting just vanished and nothing said why.
        const by = rules.replacedBy(kind);
        if (!rules.congress && by && by.type !== "memorial" && takesMeetingMode(by.type)) {
          items.push({
            type: "special",
            id: `replaced|${by.id}|${date}`,
            date,
            title: by.title,
            line: t("feed.noMeetingThatDay"),
            eventId: by.id,
            notHeld: { week, kind },
          });
        }
        continue;
      }
      const change = meetingChangeOn(eventsQ.data, date);
      items.push({
        type: "meeting",
        id: `${week}|${kind}`,
        date,
        week,
        kind,
        // The hour the rules give — an event's changed hour included.
        time: rules.timeOf(kind),
        movedByVisit: kind === "midweek" && !!rules.coVisit,
        movedFrom: rules.meetingOf(kind).moved?.from ?? null,
        change,
      });
    }
    // EVENTS ON THEIR OWN DAYS (27 September): a clean-up day, a group
    // gathering, a branch representative's day that leaves the meeting as it
    // is — the congregation plans its week by them too, and the feed was the
    // one place they were missing. Those that change or replace a meeting are
    // already told on the meeting's own row.
    const weekEnd = formatDateISO(addDays(w, 6));
    for (const e of eventsQ.data ?? []) {
      if (!takesMeetingMode(e.type)) continue;
      if (e.meetingMode === "changed" || e.meetingMode === "none" || e.replacesMeeting) continue;
      if (e.date < week || e.date > weekEnd) continue;
      items.push({
        type: "special",
        id: `event|${e.id}`,
        date: e.date,
        title: e.title,
        line: [
          e.endDate && e.endDate !== e.date
            ? t("feed.until", {
                date: new Date(`${e.endDate}T00:00:00`).toLocaleDateString(i18n.language, {
                  day: "numeric",
                  month: "long",
                }),
              })
            : null,
          e.address,
        ]
          .filter(Boolean)
          .join(" · "),
        eventId: e.id,
        time: e.time ? `${e.time}${e.timeEnd ? `–${e.timeEnd}` : ""}` : null,
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
      moves,
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
    const tail = effect ? lowerFirst(effect, lang) : "";
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
  // «N встреч» counts the congregation's meetings — or, under «Проповедь»,
  // the field-service days: before, that button promised «0 встреч» there.
  const nextPastCount = nextPastMonth
    ? pastAll.filter((x) => x.date.slice(0, 7) === nextPastMonth && (x.type === "field") === fieldOnly).length
    : 0;
  // The nearest meeting opens by itself — readable without a tap. Sent to a
  // week, it is that week's meeting: the one named, else its first.
  // The Memorial opens like a meeting, and is found by the kind it takes too:
  // «?meeting=memorial» names it, and so does the kind it replaced.
  const inTarget = targetWeek
    ? items.filter(
        (x) => (x.type === "meeting" || x.type === "memorial" || (targetKind === "field" && x.type === "field")) && x.week === targetWeek,
      )
    : [];
  const isTarget = (x: Item) =>
    (x.type === "field" && targetKind === "field" && x.date === targetDay) ||
    (x.type === "meeting" && x.kind === targetKind) ||
    (x.type === "memorial" && (targetKind === "memorial" || x.takes === targetKind));
  const targetOpen = (targetKind && inTarget.find(isTarget)?.id) || inTarget[0]?.id || null;
  const defaultOpen = targetWeek
    ? targetOpen
    : // The nearest one still ahead: today's, unless it is over already.
      (coming.find((x) => (x.type === "meeting" && !overToday(x)) || x.type === "memorial")?.id ?? null);
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
  }, [targetWeek, targetKind, targetDay]);
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
  // From 1024 (9 November 2026): at 900 the list's 440 points left the
  // meeting a strip of 300, its programme a word to a line. Between, the
  // phone's one column reads better. The list narrows on the smaller of the
  // wide screens.
  const wide = width >= 1024;
  const listWidth = width >= 1400 ? 440 : width >= 1200 ? 400 : 360;
  const [detailWidth, setDetailWidth] = useState(0);
  const isOpen = (id: string) => openId === id || (!wide && lingering === id);
  const choose = (id: string) => {
    release();
    setOpenChoice(id);
  };
  const meetingProps = (x: MeetingItem) => ({
    item: x,
    // Over is past: quiet in the list, and nothing left to prepare in it.
    past: x.date < today || overToday(x),
    overToday: overToday(x),
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
        <>
        <Row
          date={x.date}
          kindLabel={t("feed.kindSpecial")}
          icon="star-outline"
          title={x.title}
          time={x.time ?? null}
          line={x.line || null}
          color={KIND.special.color}
          past={isPast}
          onPress={x.eventId ? () => router.push(`/special-events/${x.eventId}`) : undefined}
        />
        {x.notHeld ? <NotHeldChip week={x.notHeld.week} kind={x.notHeld.kind} /> : null}
        </>
      );
    } else if (x.type === "memorial") {
      body = (
        <>
        <MemorialDay
          item={x}
          past={isPast}
          open={isOpen(x.id)}
          onToggle={onToggle}
          mode={mode}
          duties={dutiesOf.get(`${x.week}|memorial`) ?? []}
          canEdit={perms.isAdmin || perms.isElder}
        />
        <NotHeldChip week={x.week} kind={x.takes} />
        </>
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
          myGroupId={myGroupId}
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
    node: feedFailed ? (
      <LoadFailed
        style={{ marginHorizontal: 0 }}
        onRetry={retryFeed}
        unreachable={sessionVerdict(feedFailed.error) === "unreachable"}
      />
    ) : keptEnd ? (
      <KeptEnd onRetry={retryFeed} />
    ) : (fieldOnly ? fieldReachedEnd : reachedEnd) ? (
      <>
        <View style={styles.end}>
          <Text style={styles.endTitle}>{t(fieldOnly ? "feed.endField" : "feed.end")}</Text>
          {lastProgrammeWeek && !fieldOnly ? (
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
    <View style={wide ? [styles.listPane, { width: listWidth }] : styles.screen}>
      {bar}
      <KeptNotice queries={[...feedQueries, ...keptAsked]} onRetry={retryFeed} style={{ marginBottom: 6 }} />
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
    <Meeting
      key={chosen.id}
      {...meetingProps(chosen)}
      open
      onToggle={() => {}}
      mode="detail"
      // Two columns of sections once the white card is wide enough for two
      // programme rows side by side (the card's padding and gap included).
      columns={detailWidth >= 600}
    />
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
      myGroupId={myGroupId}
      nameOf={nameOf}
      groupName={groupName}
    />
  ) : null;

  return (
    <View style={styles.split}>
      {listScroll}
      <ScrollView
        style={styles.detailPane}
        contentContainerStyle={styles.detailContent}
        onLayout={(e) => setDetailWidth(e.nativeEvent.layout.width)}
      >
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

/**
 * The head of a meeting shown whole on the right of a wide screen (9 November
 * 2026, «вариант 5»): a band tinted in the meeting's colour, the date as a
 * large filled tile, which meeting and its title large, then the hour and the
 * one line that matters as two quiet chips, and what is yours in blue.
 */
function DetailHead({
  date,
  time,
  label,
  title,
  line,
  mine,
  status,
  color,
}: {
  date: string;
  time?: string | null;
  /** «Будний день», «Публичная речь», «Проповедь». */
  label: string;
  title: string;
  line?: string | null;
  mine?: string | null;
  status?: { color: string; text: string } | null;
  color: string;
}) {
  const { i18n } = useTranslation();
  const d = atMidnight(date);
  const day = d.toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" });
  const dow = d.toLocaleDateString(i18n.language, { weekday: "short" }).replace(".", "").toUpperCase();
  return (
    <View style={[styles.hero, { backgroundColor: TILE_BG[color] ?? "#eef1f5" }]}>
      <View style={styles.heroTop}>
        <View style={[styles.heroTile, { backgroundColor: color }]}>
          <Text style={styles.heroDay}>{d.getDate()}</Text>
          <Text style={styles.heroDow}>{dow}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.heroLabel, { color }]}>{`${label} · ${day}`}</Text>
          <Text style={styles.heroTitle}>{title}</Text>
          <View style={styles.heroChips}>
            {time ? (
              <View style={styles.heroChip}>
                <Ionicons name="time-outline" size={15} color={color} />
                <Text style={[styles.heroChipText, styles.heroChipTime]}>{time}</Text>
              </View>
            ) : null}
            {line ? (
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>{line}</Text>
              </View>
            ) : null}
          </View>
          {status ? (
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: status.color }]} />
              <Text style={styles.status}>{status.text}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {mine ? (
        <View style={styles.heroMine}>
          <View style={styles.mineDot}>
            <Ionicons name="person" size={11} color="#ffffff" />
          </View>
          <Text style={styles.heroMineText}>{mine}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The collapsed row every dated thing shares. */
/**
 * «N назначений без встречи ›» under an event that takes meetings away
 * (8 November 2026): seen in the list without opening the week, and only by
 * whoever may take them off (the server filters what it gives).
 */
function NotHeldChip({ week, kind }: { week: string; kind: Kind | null }) {
  const { t } = useTranslation();
  const q = useNotHeld();
  const n = (q.data?.meetings ?? [])
    .filter((m) => m.weekStartDate === week && (kind === null || m.eventType === kind))
    .reduce((sum, m) => sum + (m.canParts ? m.parts.length : 0) + (m.canDuties ? m.duties.length : 0), 0);
  if (n === 0) return null;
  return (
    <Pressable
      style={({ pressed }) => [styles.notHeldChip, pressed && { opacity: 0.7 }]}
      onPress={() => router.push(`/schedule/edit?week=${week}`)}
      accessibilityRole="button"
      testID={`not-held-chip-${week}`}
    >
      <Ionicons name="alert-circle-outline" size={16} color="#7c2d12" />
      <Text style={styles.notHeldChipText}>{t("notHeld.chip", { n })}</Text>
      <Ionicons name="chevron-forward" size={14} color="#7c2d12" />
    </Pressable>
  );
}

function Row({
  date,
  kindLabel,
  title,
  time,
  line,
  lines,
  who,
  meetings,
  notices,
  cancelled,
  moved,
  mine,
  status,
  tag,
  tagMoved,
  color,
  solid,
  live,
  past,
  open,
  select,
  onPress,
}: {
  date: string;
  /** Which kind of meeting, small and in its colour, above the title. */
  kindLabel: string;
  /** Kept for callers; the card shows the date tile instead of a sign. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** The main line: what the meeting is about. */
  title: string;
  time?: string | null;
  line?: string | null;
  /** Several lines under the title, one each — a field-service day's meetings. */
  lines?: string[];
  /** Field service, one meeting: who leads it, as every screen says it. */
  who?: FieldWho;
  /**
   * Field service, several meetings on the day: each its own two lines — the
   * time and the meeting, then who leads it (14 October 2026: one long line
   * «10:30 · Общая встреча собрания · ведёт …» broke inside the name).
   */
  meetings?: { key: string; time: string; title: string; who: string | null }[];
  /** Field service: what is different this time, in amber, one per meeting that says so. */
  notices?: string[];
  /** Field service: the day's one meeting is called off — its reason, in red. */
  cancelled?: (string | null)[];
  /** Field service: moved meetings — «перенесена с …» / «на …», in blue. */
  moved?: { from?: string; to?: string }[];
  /** What is yours in it — shown with a «Вы» mark. */
  mine?: string | null;
  status?: { color: string; text: string } | null;
  tag?: string | null;
  /** «перенесена» wears the amber of the moved mark everywhere else. */
  tagMoved?: boolean;
  color: string;
  /** The date tile filled in the colour, the date white — the Memorial. */
  solid?: boolean;
  /**
   * Going on now: the tile filled, «идёт сейчас» after the label, and in
   * place of the line under the title a bar of how far it has gone with the
   * span and the part on now.
   */
  live?: { progress: number; text: string } | null;
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
  // THE CARD (9 November 2026, «вариант 5»): a tile with the date in the
  // colour of what the day is; then what it is, in that colour; the title;
  // the hour in bold with the one line that matters after it.
  const filled = solid || !!live;
  const tileBg = past ? "#f1f5f9" : filled ? color : (TILE_BG[color] ?? "#eef1f5");
  const tileInk = past ? PAST_COLOR : filled ? "#ffffff" : color;
  const content = (
    <>
      <View style={[styles.tile, { backgroundColor: tileBg }]}>
        <Text style={[styles.day, { color: tileInk }]}>{d.getDate()}</Text>
        <Text style={[styles.dow, { color: tileInk }]}>{dow}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.kind, { color: tone }]}>{live ? `${kindLabel} · ${t("feed.liveNow")}` : kindLabel}</Text>
        <Text style={[styles.title, past && styles.pastTitle]}>
          {title}
        </Text>
        {live ? (
          <View style={styles.live}>
            <View style={styles.liveBar}>
              <View
                style={[
                  styles.liveFill,
                  { backgroundColor: color, width: `${Math.round(Math.min(1, Math.max(0, live.progress)) * 100)}%` },
                ]}
              />
            </View>
            <Text style={[styles.liveText, { color }]}>{live.text}</Text>
          </View>
        ) : time || line ? (
          <Text style={styles.line}>
            {time ? <Text style={[styles.lineTime, past && styles.pastTitle]}>{time}</Text> : null}
            {time && line ? " · " : null}
            {line ?? null}
          </Text>
        ) : null}
        {who ? (
          <View style={styles.whoLine}>
            <WhoLine who={who} />
          </View>
        ) : null}
        {meetings?.map((x) => (
          <View key={x.key} style={styles.dayMeeting}>
            <Text style={styles.dayMeetingTime}>{x.time}</Text>
            <View style={styles.dayMeetingBody}>
              <Text style={styles.dayMeetingTitle}>{x.title}</Text>
              {x.who ? <Text style={styles.dayMeetingWho}>{x.who}</Text> : null}
            </View>
          </View>
        ))}
        {lines?.map((l, i) => (
          <Text key={i} style={styles.line}>
            {l}
          </Text>
        ))}
        {notices?.map((n, i) => <FieldNotice key={`n${i}`} text={n} />)}
        {moved?.map((mv, i) => <FieldMoved key={`m${i}`} from={mv.from} to={mv.to} />)}
        {cancelled?.map((r, i) => <FieldCancelled key={`c${i}`} reason={r} />)}
        {mine ? (
          // The sign of «yours», not the word «Вы» (26 September): the list
          // may be read on someone else's device. A filled mark now, the
          // one blue that means «yours» across the app.
          <View style={[styles.minePill, past && styles.minePillPast]}>
            <View style={styles.mineDot} accessibilityLabel={t("feed.you")}>
              <Ionicons name="person" size={11} color={past ? SOFT : "#ffffff"} />
            </View>
            <Text style={[styles.mine, past && styles.minePast]}>{mine}</Text>
          </View>
        ) : null}
        {status ? (
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={styles.status}>{status.text}</Text>
          </View>
        ) : null}
        {tag ? (
          tagMoved ? (
            <View style={styles.tagMoved}>
              <Ionicons name="swap-horizontal" size={14} color={PLAIN} />
              <Text style={styles.tagMovedText}>{tag}</Text>
            </View>
          ) : (
            <Text style={styles.tag}>{tag}</Text>
          )
        ) : null}
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
  overToday = false,
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
  columns = false,
}: {
  item: MeetingItem;
  past: boolean;
  /**
   * Over, but still of today: quiet like any past meeting, and the edit
   * links stay until midnight — a substitution made at the last minute is
   * written down after the meeting, not before it (5 October).
   */
  overToday?: boolean;
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
  /** The programme's sections in two columns (the right side of a wide screen). */
  columns?: boolean;
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
  // «Представитель филиала», or the title of an «Other» event.
  const eventLabel = (e: SpecialEvent) =>
    e.type ? t(`specialEvents.types.${e.type}`, { defaultValue: e.title }) : e.title;
  const chair = parts.find((p) => CHAIR_KEYS.has(p.partKey));
  const talk = parts.find((p) => p.partKey === "public_talk_speaker");
  // THE CARD SAYS WHICH MEETING IT IS (9 November 2026, «вариант 5»): the
  // weekday is «Жизнь и служение», whatever its first talk — that talk on the
  // closed card read as the meeting's theme («всё также вижу первую речь»);
  // the weekend is its public talk, who gives it and from where.
  let cardLabel = item.kind === "midweek" ? t("feed.kindMidweekDay") : t("feed.kindWeekendDay");
  let title = item.kind === "midweek" ? t("feed.midweekTitle") : kindTitle;
  let line: string;
  if (parts.length === 0) line = t("feed.notLoaded");
  else if (item.kind === "weekend" && talk) {
    cardLabel = t("feed.kindPublicTalk");
    title = partDisplay(talk.partKey, talk.partTitle).label;
    const speaker = who(talk);
    const from = whoFrom(talk);
    line = speaker ? (from ? `${speaker} · ${from}` : speaker) : t("feed.speakerUnassigned");
  } else {
    line = t("feed.chairman", { name: (chair?.publisherId && name(chair.publisherId)) || t("feed.unassigned") });
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
  // Chairing is yours too — said with the rest, since the line above now
  // names him like anybody else.
  const mineList = [
    ...(me && chair?.publisherId === me ? [t("feed.chairmanLabel")] : []),
    ...myParts,
    ...myDuties,
  ];
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
    status = !p.loaded ? { color: SOFT, text: capitalizeFirst(duties) } : { color: prog.c, text: `${prog.s} · ${duties}` };
  }

  const mineInProgramme = myParts.length > 0;
  const mineInDuties = myDuties.length > 0;

  // GOING ON NOW (9 November 2026): on its own day, from its hour to its hour
  // plus a meeting's length — the length Home and «over» already use.
  const nowMin = useMinuteClock(item.date === formatDateISO(new Date()) && !!item.time && !past);
  let live: { progress: number; text: string } | null = null;
  const startMin = item.time && /^\d{1,2}:\d{2}/.test(item.time) ? hm(item.time) : null;
  if (nowMin !== null && startMin !== null && nowMin >= startMin && nowMin < startMin + MEETING_LENGTH_MIN) {
    const times = item.kind === "midweek" ? buildMidweekPartTimes(parts, item.time) : buildWeekendPartTimes(parts, item.time);
    const onNow = parts.find((p) => {
      const iv = times.get(p.id);
      return !!iv && hm(iv.start) <= nowMin && nowMin < hm(iv.end);
    });
    const span = t("feed.liveSpan", { from: item.time?.slice(0, 5), to: clock(startMin + MEETING_LENGTH_MIN) });
    live = {
      progress: (nowMin - startMin) / MEETING_LENGTH_MIN,
      text: onNow ? `${span} · ${t("feed.liveNowPart", { part: partDisplay(onNow.partKey, onNow.partTitle).label })}` : span,
    };
  }

  return (
    // The screenshot script finds a meeting by week and kind to check that a
    // link to a week lands on it (data-testid on the web; nothing visible).
    <View testID={mode === "detail" ? undefined : `meeting-${item.week}-${item.kind}`}>
      {mode !== "detail" ? (
      <Row
        date={item.date}
        kindLabel={cardLabel}
        title={title}
        time={item.time}
        line={line}
        mine={mine}
        status={status}
        tag={
          item.movedFrom
            ? // The whole of it on the card — «перенесена · обычно ср, 11
              // нояб., 19:00» — so the open sheet need not say it again.
              item.movedFrom.date
              ? `${t("schedule.move.moved")} · ${t("schedule.move.markFrom", {
                  when: movedWhen(item.movedFrom.date, item.movedFrom.time, i18n.language),
                })}`
              : t("schedule.move.moved")
            : item.movedByVisit
            ? t("feed.movedByVisit")
            : item.change
              ? t("feed.withChanges", { event: eventLabel(item.change) })
              : item.kind === "weekend" && talk?.specialTalk
                ? t("feed.specialTalk")
                : null
        }
        tagMoved={!!item.movedFrom}
        color={KIND[item.kind].color}
        live={live}
        past={past}
        open={open}
        select={mode === "row"}
        onPress={onToggle}
      />
      ) : (
        <DetailHead
          date={item.date}
          time={item.time}
          label={item.kind === "weekend" && talk?.specialTalk ? upperFirst(t("feed.specialTalk")) : cardLabel}
          title={title}
          color={past ? PAST_COLOR : KIND[item.kind].color}
          line={line}
          mine={mine ? t(past ? "feed.minePast" : "feed.mine", { list: mine }) : null}
          status={status}
        />
      )}
      {(mode === "inline" && open) || mode === "detail" ? (
        <View style={[styles.inset, mode === "detail" && styles.insetDetail]}>
          {mode === "detail" && item.movedFrom?.date ? (
            <MovedMark mode="from" dateISO={item.movedFrom.date} time={item.movedFrom.time} />
          ) : null}
          {item.change ? (
            <Pressable onPress={() => router.push(`/special-events/${item.change!.id}`)}>
              <MeetingChangeNote event={item.change} />
            </Pressable>
          ) : null}
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
            tone={past ? PAST_COLOR : KIND[item.kind].color}
            segments={[
              { key: "programme", label: t("feed.tabProgramme") },
              { key: "duties", label: t("feed.tabDuties") },
              { key: "cleaning", label: t("feed.tabCleaning") },
            ]}
          />
          {tab === "programme" && columns ? (
            <Programme parts={parts} kind={item.kind} time={item.time} me={me} name={name} who={who} whoFrom={whoFrom} columns />
          ) : null}
          {tab === "programme" && columns ? null : (
          <View style={mode === "detail" ? styles.cardDetail : styles.card}>
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
                              hour: "2-digit", hour12: false,
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
          )}
          {(!past || overToday) && tab === "programme" && canEditProgramme ? (
            <EditLink
              label={t("feed.editProgramme")}
              onPress={() => router.push(`/schedule/edit?week=${item.week}&meeting=${item.kind}` as never)}
            />
          ) : null}
          {tab === "programme" && (item.kind === "midweek" || item.kind === "weekend") ? (
            // How the meeting ran, while it is kept — here, at the meeting
            // itself, and no longer on the Home screen (Lionel, 25 October
            // 2026: Home is for what is to be done today). Both meetings.
            <View style={styles.conductLink}>
              <ConductResultLink
                week={item.week}
                kind={item.kind}
                chairmanPublisherId={
                  parts.find((p) => p.partKey === (item.kind === "weekend" ? "weekend_chairman" : "midweek_chairman"))
                    ?.publisherId ?? null
                }
              />
            </View>
          ) : null}
          {(!past || overToday) && tab === "duties" && canEditDuties ? (
            // Straight to this meeting's sheet — duties live in their own screen
            // now, not in the programme screen.
            <EditLink
              label={t("feed.editDuties")}
              onPress={() => router.push(`/publishers/duties-meeting?week=${item.week}&meeting=${item.kind}` as never)}
            />
          ) : null}
          {(!past || overToday) && tab === "cleaning" && canEditCleaning ? (
            <EditLink
              label={t("feed.editCleaning")}
              onPress={() => router.push(`/publishers/cleaning-week?week=${item.week}` as never)}
            />
          ) : null}
          {mode === "inline" ? <CollapseLink onPress={onToggle} /> : null}
          <WindowsPlanDialog windows={planWindows} onClose={() => setPlanWindows(null)} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * «Свернуть» at the foot of an open meeting (9 November 2026): a long
 * programme is read to its end, and the chevron that closes it is a screen
 * away by then.
 */
function CollapseLink({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.collapse, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Ionicons name="chevron-up" size={16} color={PLAIN} />
      <Text style={styles.collapseText}>{t("feed.collapse")}</Text>
    </Pressable>
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
  columns = false,
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
  /**
   * Two columns, each a card: the weekday breaks before «Христианская жизнь»,
   * the weekend before the Watchtower study — where the printed sheet's
   * halves are.
   */
  columns?: boolean;
}) {
  const { t } = useTranslation();
  // One request for the whole feed, an hour in the cache (lib/songs).
  const songTitles = useSongsMap();
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
  let splitAt: number | null = null;
  // The colour of the section a part is in: the part's name is written in it,
  // the people in black under it (the redesign of 9 November 2026).
  let tone = INK;
  // The workbook numbers the weekday's parts 1, 2, 3…; the weekend's are not
  // numbered there, so not here either.
  const numbers = kind === "midweek" ? buildPartNumbers(parts) : new Map<string, number | null>();
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
        if (splitAt === null && (sub === "christian_life" || sub === "watchtower")) splitAt = out.length;
        out.push(
          <SectionChip
            key={`s${p.id}`}
            label={t(meta.i18nKey)}
            color={meta.color}
            soft={meta.colorMuted}
            ink={sectionInk(meta)}
            icon={meta.icon}
          />,
        );
        tone = sectionInk(meta);
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
      // «Песня 35 — Удостоверяйтесь…»: the name from the congregation's song
      // list, as «Составление программы» has shown it all along (5 October —
      // the readers of the Programme saw the number alone). No list, or a
      // number not in it: the number stays as it was.
      const text = readerTitle(p.partTitle) || shown.label;
      out.push(<SongLine key={p.id} time={start} text={enrichSongRef(text, songTitles) ?? text} />);
    } else if (PRAYER_KEYS.has(p.partKey)) {
      const text = [enrichSongRef(shown.subtitle, songTitles), shown.label].filter(Boolean).join(" · ");
      out.push(<PrayerLine key={p.id} time={start} label={text} name={person} mine={mine} />);
    } else if (p.partKey === "public_talk_speaker") {
      // The talk's theme in full here too (10 November 2026: «когда плашка
      // раскрывается, тоже информация нужна») — the open sheet is read on its
      // own, on a wide screen without the card above it; then who gives it
      // and from where. A special talk says so above its theme.
      out.push(
        <PartLine
          key={p.id}
          time={start}
          minutes={t("feed.minutesOnly", { n: p.partDurationMin ?? 30 })}
          title={shown.label}
          subtitle={p.specialTalk ? upperFirst(t("feed.specialTalk")) : null}
          name={person}
          extra={whoFrom(p)}
          mine={mine}
          tone={tone}
        />,
      );
    } else if (p.partKey === "watchtower_conductor") {
      const reader = parts.find((x) => x.partKey === "watchtower_reader");
      out.push(
        <PartLine
          key={p.id}
          time={start}
          minutes={t("feed.minutesOnly", { n: p.partDurationMin ?? 60 })}
          title={shown.label}
          name={person}
          helper={
            reader
              ? { label: t("feed.pairReader"), name: who(reader), mine: !!me && reader.publisherId === me }
              : null
          }
          mine={mine}
          tone={tone}
        />,
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
        ? { label: t("feed.pairAssistant"), name: name(p.assistantPublisherId), mine: !!me && p.assistantPublisherId === me }
        : reader
          ? { label: t("feed.pairReader"), name: who(reader), mine: !!me && reader.publisherId === me }
          : null;
      out.push(
        <PartLine
          key={p.id}
          time={start}
          minutes={minutes}
          number={numbers.get(p.id) ?? null}
          title={shown.label}
          // The workbook's note under a part: on the reader's own part and
          // its pair, so they prepare the same scene; and the passage of the
          // Bible reading for everyone (9 November 2026). Elsewhere the sheet
          // stays a list of names and times.
          subtitle={
            mine || (!!me && p.assistantPublisherId === me) || p.partKey === "bible_reading"
              ? shown.subtitle
              : null
          }
          name={person}
          extra={helper ? null : whoFrom(p)}
          helper={helper}
          mine={mine}
          tone={tone}
        />,
      );
    }
  }
  if (columns) {
    const cut = splitAt ?? out.length;
    return (
      <View style={styles.columns}>
        <View style={[styles.cardDetail, styles.column]}>{out.slice(0, cut)}</View>
        {cut < out.length ? <View style={[styles.cardDetail, styles.column]}>{out.slice(cut)}</View> : null}
      </View>
    );
  }
  return <>{out}</>;
}

/**
 * Field-ministry meetings of one day — one row, no tabs: nothing to switch
 * between. WHO EACH MEETING IS FOR is said on it, by the rule every screen
 * shares (lib/field-audience): a service overseer's visit, a group's own
 * meeting, the combined one, or one open to all. The person's own group comes
 * with them; other groups' meetings are folded away under one line; and on
 * a day the person's group is visited, the other meetings say they are not
 * for that group this time — it goes to the visit only (Lionel, 26 September).
 */
function FieldDay({
  item,
  past,
  open,
  onToggle,
  mode = "inline",
  me,
  myGroupId,
  nameOf,
  groupName,
}: {
  item: FieldItem;
  past: boolean;
  open: boolean;
  onToggle: () => void;
  mode?: "inline" | "row" | "detail";
  me: string | null;
  myGroupId: string | null;
  nameOf: Map<string, string>;
  groupName: Map<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const [showOthers, setShowOthers] = useState(false);
  const day = arrangeFieldDay(item.meetings, myGroupId, me);
  const group = (m: FieldServiceMeeting) => (m.serviceGroupId ? groupName.get(m.serviceGroupId) ?? "" : "");
  const labelOf = (p: FieldPlace) => {
    const base =
      p.audience === "visit"
        ? t("feed.fieldVisit", { group: group(p.meeting) })
        : p.audience === "group"
          ? t("feed.fieldGroup", { group: group(p.meeting) })
          : p.audience === "general"
            ? t("feed.fieldGeneral")
            : t("feed.fieldOpen");
    return p.own ? `${base} ${t("feed.fieldYours")}` : base;
  };
  const noteOf = (p: FieldPlace) => {
    const n = noteForPlace(p, myGroupId);
    if (!n) return null;
    const g = n.kind === "notForYourGroup" ? "" : groupName.get(n.groupId) ?? "";
    return n.kind === "notForYourGroup"
      ? t("feed.fieldNotForYourGroup")
      : n.kind === "awayOnVisit"
        ? t("feed.fieldAwayOnVisit", { group: g })
        : t("feed.fieldOnlyFor", { group: g });
  };

  // Conducting first; then going to a visit as the service overseer or his
  // assistant without conducting it — he goes, and the row should say so.
  // A meeting called off is nobody's to lead or go to (13 October 2026).
  const mineAt = item.meetings.find((m) => !m.cancelledAt && !!me && m.conductorPublisherId === me);
  const helpingAt = mineAt ? undefined : day.shown.find((p) => p.mine && !p.meeting.cancelledAt)?.meeting;
  const ownVisit = day.shown.find((p) => p.audience === "visit" && p.own && !p.meeting.cancelledAt);
  // THE ROW READS WITHOUT A TAP (stage 4, October 2026). It used to say
  // «Встреча для проповеди» under a chip that already said «Проповедь», and
  // the one thing people open it for — which meeting, and who conducts —
  // sat inside. Now the title is the meeting itself (the one the person
  // conducts first: a conductor from the visited group leads the combined
  // meeting, not the visit), and each meeting gets its own line with its
  // conductor, as the planner's list has them.
  const lead = mineAt ? day.shown.find((p) => p.meeting.id === mineAt.id) : undefined;
  const title = lead
    ? labelOf(lead)
    : ownVisit
      ? t("feed.fieldVisitTitle")
      : day.shown.length === 1 && !day.others.length
        ? labelOf(day.shown[0])
        : t("feed.fieldService");
  // «Встреча по группам» is each group on its own: nobody conducts it as a
  // whole, so no conductor there is not a gap to announce.
  const conductorOf = (p: FieldPlace): string | null => {
    // Moved away: where to. Called off: that, not who would have led it.
    if (p.meeting.movedTo)
      return t("fieldService.moved.to", { date: movedDayLabel(p.meeting.movedTo, i18n.language) }).toLocaleLowerCase(i18n.language);
    if (p.meeting.cancelledAt) return t("fieldService.cancelled.label").toLocaleLowerCase(i18n.language);
    const id = p.meeting.conductorPublisherId;
    if (!id) return p.audience === "open" ? null : t("feed.fieldNoConductor");
    return t("feed.fieldLedBy", { name: nameOf.get(id) ?? "" });
  };
  // Standing alone under the title the line starts a sentence of its own.
  const upper = (x: string) => x.charAt(0).toLocaleUpperCase(i18n.language) + x.slice(1);
  // One meeting on the day, and it is called off: the red strip with its
  // reason says it; the line under the title would only repeat it.
  const single = day.shown.length === 1 && !day.others.length ? day.shown[0] : null;
  const singleOff = single?.meeting.cancelledAt && !single.meeting.movedTo ? single.meeting : null;
  // The day's one meeting is a stand-in for one moved away: the blue strip says where.
  const singleMoved = single?.meeting.movedTo ? single.meeting : null;
  // Moved lines read in the collapsed row too: «перенесена с …» on the new
  // day, and, for a stand-in alone on its day, «перенесена на …».
  const today = formatDateISO(new Date());
  type Move = { to?: string; from?: string };
  const moves = [...day.shown, ...day.others]
    .map((p): Move | null => {
      if (p.meeting.movedTo) return p === single ? { to: movedDayLabel(p.meeting.movedTo, i18n.language) } : null;
      const from = movedFromShown(p.meeting, today);
      return from ? { from: movedDayLabel(from, i18n.language) } : null;
    })
    .filter((x): x is Move => !!x);
  // One meeting, not yours: who leads it, in the line every screen draws.
  const singleWho: FieldWho | undefined =
    single && !singleOff && !singleMoved && !lead && !(ownVisit && !lead)
      ? single.meeting.conductorPublisherId
        ? { kind: "name", name: nameOf.get(single.meeting.conductorPublisherId) ?? "" }
        : single.audience === "open"
          ? undefined
          : { kind: "empty" }
      : undefined;
  // Several: each its own two lines.
  const several =
    !singleOff && !singleMoved && !(ownVisit && !lead) && !(day.shown.length === 1 && !day.others.length)
      ? day.shown
          .filter((p) => p !== lead)
          .map((p) => {
            const w = conductorOf(p);
            return { key: p.meeting.id, time: p.meeting.startTime, title: labelOf(p), who: w ? upper(w) : null };
          })
      : [];
  const lines =
    singleOff || singleMoved
      ? []
      : ownVisit && !lead
      ? // The group goes to the visit and nowhere else that day: the other
        // meetings wait inside, each saying so.
        [
          [t("feed.fieldVisitLine", { time: ownVisit.meeting.startTime, group: group(ownVisit.meeting) }), conductorOf(ownVisit)]
            .filter(Boolean)
            .join(" · "),
        ]
      : [
          // One meeting: the title names it, the line says who leads it. The
          // one the person conducts is the title, and «ведёте в …» below.
          ...(day.others.length ? [t("feed.fieldOthers", { count: day.others.length })] : []),
        ];
  const mine = mineAt
    ? t("feed.youLeadShort", { time: mineAt.startTime })
    : helpingAt
      ? t("feed.youGoShort", { time: helpingAt.startTime })
      : null;
  const firstTime = (day.shown[0] ?? day.others[0])?.meeting.startTime ?? null;
  const line = lines.join(" · ");
  // The notice is read in the collapsed row too: what is different this
  // Saturday must not wait for a tap. Several meetings with a notice each —
  // one strip each, in the day's order; the same text twice is said once.
  const notices = [...new Set(
    [...day.shown, ...day.others]
      .filter((p) => !p.meeting.cancelledAt)
      .map((p) => p.meeting.notice?.trim() ?? "")
      .filter(Boolean),
  )];

  // Open, the day says only what its row did not: one meeting — what it is
  // about, where, the material, who goes with the overseer; several, or the
  // wide screen's right side — each meeting whole (variant A, 14 October
  // 2026: the open day repeated the title and the notice of the row above).
  const whole = mode === "detail" || !single || ownVisit !== undefined;
  const narrowScreen = useWindowDimensions().width < 361;
  const lineOf = (p: FieldPlace, i: number) => {
    const m = p.meeting;
    const helpers: FieldHelper[] = [];
    if (p.audience === "visit" && !m.cancelledAt) {
      if (m.serviceOverseerPublisherId && m.serviceOverseerPublisherId !== m.conductorPublisherId)
        helpers.push({
          label: t("fieldService.overseer"),
          name: nameOf.get(m.serviceOverseerPublisherId) ?? "",
          mine: !!me && m.serviceOverseerPublisherId === me,
        });
      if (m.serviceOverseerAssistantId && m.serviceOverseerAssistantId !== m.conductorPublisherId)
        helpers.push({
          label: t("fieldService.overseerAssistant"),
          name: nameOf.get(m.serviceOverseerAssistantId) ?? "",
          mine: !!me && m.serviceOverseerAssistantId === me,
        });
    }
    const who: FieldWho = m.conductorPublisherId
      ? !!me && m.conductorPublisherId === me
        ? { kind: "mine" }
        : { kind: "name", name: nameOf.get(m.conductorPublisherId) ?? "" }
      : p.audience === "open"
        ? null
        : { kind: "empty" };
    return (
      <View key={rowKey(m)} style={[styles.fieldBlock, i > 0 && styles.fieldBlockNext]}>
        <FieldMeetingBlock
          time={whole ? m.startTime : null}
          timeLayout={whole ? (narrowScreen ? "inline" : "column") : "none"}
          title={whole ? labelOf(p) : null}
          who={whole ? who : null}
          helpers={helpers}
          notice={whole ? m.notice : null}
          cancelled={!!m.cancelledAt}
          cancelReason={whole ? m.cancelReason : null}
          movedTo={whole && m.movedTo ? movedDayLabel(m.movedTo, i18n.language) : null}
          movedFrom={whole ? (movedFromShown(m, today) ? movedDayLabel(m.movedFromDate as string, i18n.language) : null) : null}
          topic={m.topic}
          place={m.address}
          sourceUrl={m.sourceUrl}
          note={noteOf(p)}
        />
      </View>
    );
  };

  return (
    <View>
      {mode !== "detail" ? (
        <Row
          date={item.date}
          kindLabel={t("feed.kindField")}
          icon={ownVisit ? "walk-outline" : KIND.field.icon}
          title={title}
          time={firstTime}
          lines={lines}
          who={singleWho}
          meetings={several}
          notices={notices}
          cancelled={singleOff ? [singleOff.cancelReason ?? null] : undefined}
          moved={moves.length ? moves : undefined}
          mine={mine}
          color={KIND.field.color}
          past={past}
          open={open}
          select={mode === "row"}
          onPress={onToggle}
        />
      ) : (
        <DetailHead date={item.date} label={t("feed.kindField")} title={title} color={past ? PAST_COLOR : KIND.field.color} line={line} mine={mineAt ? t("feed.youLead", { time: mineAt.startTime }) : helpingAt ? t("feed.youGo", { time: helpingAt.startTime }) : null} />
      )}
      {(mode === "inline" && open) || mode === "detail" ? (
        <View style={[styles.inset, mode === "detail" && styles.insetDetail]}>
          <View style={mode === "detail" ? [styles.cardDetail, styles.cardFirst] : [styles.card, styles.cardFirst]}>
            {day.shown.map(lineOf)}
            {day.others.length ? (
              <Pressable
                style={({ pressed }) => [styles.othersToggle, pressed && styles.pressed]}
                onPress={() => setShowOthers((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showOthers }}
              >
                <Text style={styles.othersToggleText}>
                  {showOthers ? t("feed.fieldOthersHide") : t("feed.fieldOthers", { count: day.others.length })}
                </Text>
                <Ionicons name={showOthers ? "chevron-up" : "chevron-down"} size={16} color={SOFT} />
              </Pressable>
            ) : null}
            {showOthers ? day.others.map(lineOf) : null}
          </View>
          {mode === "inline" ? <CollapseLink onPress={onToggle} /> : null}
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
          color={MEMORIAL_COLOR}
          solid
          past={past}
          open={open}
          select={mode === "row"}
          onPress={onToggle}
        />
      ) : (
        <DetailHead date={item.date} time={item.event.time ?? null} label={t("feed.kindMemorial")} title={title} color={past ? PAST_COLOR : MEMORIAL_COLOR} line={line} />
      )}
      {(mode === "inline" && open) || mode === "detail" ? (
        <View style={[styles.inset, mode === "detail" && styles.insetDetail]}>
          <View style={mode === "detail" ? [styles.cardDetail, styles.cardFirst] : [styles.card, styles.cardFirst]}>
            <MemorialMeetingBlock bare event={item.event} canEdit={false} hiddenCount={0} duties={duties} />
          </View>
          {canEdit ? (
            <EditLink
              label={t("feed.editProgramme")}
              onPress={() => router.push(`/schedule/edit?week=${item.week}&meeting=${item.takes}` as never)}
            />
          ) : null}
          {mode === "inline" ? <CollapseLink onPress={onToggle} /> : null}
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
  conductLink: { marginTop: 10, marginBottom: -12 },
  windowsIndent: { marginTop: -2, marginBottom: 8 },
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
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
  monthRow: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 2 },
  monthText: { fontSize: 17, fontFamily: FONT.extrabold, color: INK },
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
  fieldAbout: { marginTop: 4, gap: 4 },
  fieldBlock: { paddingVertical: 10 },
  fieldBlockNext: { borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  whoLine: { marginTop: 3 },
  dayMeeting: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 6 },
  dayMeetingTime: { minWidth: 42, fontSize: 14, lineHeight: 19, fontFamily: FONT.extrabold, color: INK },
  dayMeetingBody: { flex: 1, minWidth: 0 },
  dayMeetingTitle: { fontSize: 14.5, lineHeight: 19, fontFamily: FONT.bold, color: INK },
  dayMeetingWho: { fontSize: 13.5, lineHeight: 18, fontFamily: FONT.medium, color: MUTE, marginTop: 1 },
  fieldTopic: { fontSize: 14, fontFamily: FONT.medium, color: "#475569" },
  othersToggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    marginTop: 4,
  },
  othersToggleText: { fontSize: 14, fontFamily: FONT.bold, color: MUTE },
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
  todayText: { fontSize: 13.5, fontFamily: FONT.extrabold, color: ACC },
  todayRule: { flex: 1, height: 2, borderRadius: 2, backgroundColor: ACC_BG },
  // Each dated thing is a card of its own (9 November 2026, «вариант 5»):
  // white on the grey ground, rounded, a hairline of shadow.
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 44,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  // Open, the card goes on below the row: the programme is part of it.
  rowOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, shadowOpacity: 0 },
  rowSelected: { backgroundColor: "#f2fafc", borderColor: "#0e7490" },
  split: { flex: 1, flexDirection: "row", backgroundColor: "#eef1f4" },
  listPane: { flexGrow: 0, borderRightWidth: 1, borderRightColor: "#e2e8f0" },
  listContent: { paddingBottom: 40 },
  detailPane: { flex: 1, backgroundColor: "#eef1f4" },
  detailContent: { padding: 20, alignItems: "center" },
  // The chosen meeting: one white card, its head a tinted band.
  detailColumn: {
    width: "100%",
    maxWidth: 1100,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  insetDetail: { marginHorizontal: 0, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, borderWidth: 0 },
  hero: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 16 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 18 },
  heroTile: { width: 64, height: 70, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  heroDay: { fontSize: 29, lineHeight: 31, fontFamily: FONT.extrabold, color: "#ffffff", fontVariant: ["tabular-nums"] },
  heroDow: { fontSize: 12.5, fontFamily: FONT.extrabold, color: "#ffffff", marginTop: 3, opacity: 0.9 },
  heroLabel: { fontSize: 14, fontFamily: FONT.bold },
  heroTitle: { fontSize: 26, lineHeight: 32, fontFamily: FONT.extrabold, color: INK, letterSpacing: -0.3, marginTop: 2 },
  heroChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dbe5ea",
    paddingHorizontal: 11,
    paddingVertical: 4,
    maxWidth: "100%",
  },
  heroChipText: { flexShrink: 1, fontSize: 14, fontFamily: FONT.semibold, color: PLAIN },
  heroChipTime: { fontFamily: FONT.extrabold, color: INK, fontVariant: ["tabular-nums"] },
  heroMine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: ACC,
  },
  heroMineText: { flex: 1, fontSize: 14.5, fontFamily: FONT.bold, color: "#ffffff" },
  // The programme in two columns where the right side is wide enough.
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  column: { flex: 1, minWidth: 0 },
  tile: { width: 50, height: 56, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  notHeldChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginLeft: 90,
    marginTop: 8,
    marginBottom: 2,
    marginRight: 16,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 99,
    backgroundColor: "#fff7ed",
    borderWidth: 1.5,
    borderColor: "#fcd9a8",
  },
  notHeldChipText: { fontSize: 13.5, fontFamily: FONT.extrabold, color: "#7c2d12", flexShrink: 1 },
  day: { fontSize: 23, lineHeight: 25, fontFamily: FONT.extrabold, fontVariant: ["tabular-nums"] },
  dow: { fontSize: 12, fontFamily: FONT.extrabold, marginTop: 2 },
  rowBody: { flex: 1, minWidth: 0 },
  kind: { fontSize: 13.5, lineHeight: 18, fontFamily: FONT.bold },
  title: { fontSize: 17.5, lineHeight: 23, fontFamily: FONT.extrabold, color: INK, marginTop: 2 },
  pastTitle: { color: SOFT },
  line: { fontSize: 15, lineHeight: 20, fontFamily: FONT.medium, color: MUTE, marginTop: 4 },
  lineTime: { fontFamily: FONT.extrabold, color: INK, fontVariant: ["tabular-nums"] },
  live: { marginTop: 9, gap: 6 },
  liveBar: { height: 6, borderRadius: 99, backgroundColor: "#e2e8f0", overflow: "hidden" },
  liveFill: { height: "100%", borderRadius: 99 },
  liveText: { fontSize: 13.5, lineHeight: 18, fontFamily: FONT.bold, fontVariant: ["tabular-nums"] },
  minePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 9,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: ACC,
    maxWidth: "100%",
  },
  minePillPast: { backgroundColor: "#e2e8f0" },
  mineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  mine: { flexShrink: 1, fontSize: 14, lineHeight: 19, fontFamily: FONT.bold, color: "#ffffff" },
  minePast: { color: MUTE },
  statusRow: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  status: { fontSize: 13.5, fontFamily: FONT.semibold, color: MUTE, flexShrink: 1 },
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
  // Moved: an outline with arrows — not a colour of its own, so the colours
  // keep meaning what the meeting is (9 November 2026).
  tagMoved: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    maxWidth: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  tagMovedText: { flexShrink: 1, fontSize: 13.5, fontFamily: FONT.bold, color: PLAIN },
  chev: { marginTop: 4 },
  // The open part of the card, under its row, on the same white.
  inset: {
    backgroundColor: "#ffffff",
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 8,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: "transparent",
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
  // The sheet inside an open card: no frame of its own — the bands and the
  // rows reach the card's edges past the inset's padding.
  card: { marginTop: 10 },
  // On the right of a wide screen the sheet is a card of its own.
  cardDetail: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8edf3",
    borderRadius: 16,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingBottom: 6,
    marginTop: 10,
  },
  collapse: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  collapseText: { fontSize: 14, fontFamily: FONT.bold, color: PLAIN },
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
