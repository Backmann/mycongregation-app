import {
  createContext,
  useCallback,
  useMemo,
  useContext,
  useState,
  useEffect,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import {
  Assignment,
  assignmentsApi,
  absencesApi,
  CreateAssignmentInput,
  EventType,
  extractErrorMessage,
  Publisher,
  publishersApi,
  meetingSettingsApi,
  readinessApi,
  coVisitItemsApi,
  fieldServiceApi,
  specialEventsApi,
  circuitOverseersApi,
  CircuitOverseer,
} from "../../../lib/api";
import {
  addDays,
  addWeeks,
  formatDateISO,
  startOfWeekMonday,
} from "../../../lib/dates";
import { useSongsMap, enrichSongRef } from "../../../lib/songs";
import {
  getEventTypeLabel,
  getPartLabel,
  PARTS_BY_EVENT,
  buildPartNumbers,
  resolveSubsection,
  buildMidweekPartTimes,
  buildWeekendPartTimes,
  skillCapabilityFromTitle,
  getPartDef,
  type PartInterval,
  Subsection,
  SUBSECTIONS,
} from "../../../lib/parts";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { partDisplay } from "../../../lib/part-display";
import { WeekNavigator } from "../../../components/WeekNavigator";
import { WeekDrawer } from "../../../components/WeekDrawer";
import {
  effectiveVersionFor,
  meetingDate,
} from "../../../lib/meeting-schedule";
import { exportHtmlAsPdf, openPrintWindow } from "../../../lib/pdf";
import {
  buildMeetingSchedulePdfHtml,
  type MeetingPdfWeek,
} from "../../../lib/meetingSchedulePdf";
import { FieldServiceSection } from "../../../components/FieldServiceSection";
import { CongressWeekBanner } from "../../../components/CongressWeekBanner";
import { usePermissions } from "../../../lib/permissions";
import { SpecialEventsWeekBanner } from "../../../components/SpecialEventsWeekBanner";
import { weekRules } from "../../../lib/week-rules";
import { ReplacedMeetingNotice } from "../../../components/ReplacedMeetingNotice";
import { MemorialMeetingBlock } from "../../../components/MemorialMeetingBlock";
import { CollapsibleMeetingBlock } from "../../../components/CollapsibleMeetingBlock";
import { ConductEntry } from "../../../components/ConductEntry";
import { HospitalityZone } from "../../../components/HospitalityZone";
import { AssignmentSheet } from "../../../components/AssignmentSheet";
import { PublishDialog } from "../../../components/PublishDialog";
import { NotifyChangesDialog } from "../../../components/NotifyChangesDialog";
import { useMyPublisher } from "../../../lib/useMyPublisher";
import { MyDot } from "../../../components/MyDot";
import { useMyGlow } from "../../../components/useMyGlow";
import { reportError } from "../../../lib/error-bus";
import { LoadError } from "../../../components/LoadError";
import { SECTION_COLORS } from "../../../lib/section-colors";
import { useDutiesWeek } from "../../../lib/useDutiesWeek";

const EVENT_TYPE_ORDER: EventType[] = [
  "midweek",
  "weekend",
  "cleaning",
  "av_duty",
  "public_witnessing",
];

/** Parse ?week=YYYY-MM-DD into a Monday; fall back to current week. */
function weekFromParam(raw: string | string[] | undefined): Date {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return startOfWeekMonday(d);
  }
  return startOfWeekMonday(new Date());
}

/** IDs of prayer slots auto-filled from the chairman (for the "авто" badge). */
const AutoAssignedContext = createContext<Set<string>>(new Set());

export default function ScheduleIndexScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const [publishingType, setPublishingType] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifyingType, setNotifyingType] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ week?: string; meeting?: string }>();
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [publishPrompt, setPublishPrompt] = useState<{
    eventType: "midweek" | "weekend";
    weekStartDate: string;
  } | null>(null);
  const [notifyPrompt, setNotifyPrompt] = useState<{
    eventType: "midweek" | "weekend";
    weekStartDate: string;
  } | null>(null);
  const weekStart = weekFromParam(params.week);
  const weekStartISO = formatDateISO(weekStart);
  const setWeekStart = (d: Date) => {
    router.setParams({ week: formatDateISO(startOfWeekMonday(d)) });
  };
  const nextWeekISO = formatDateISO(addWeeks(weekStart, 1));

  // SWITCHING WEEKS WITHOUT THE PAGE JUMPING (25 September). A new week used
  // to empty the screen to a spinner and refill it a second later, piece by
  // piece — Lionel saw the layout twitch on every arrow. Now the week being
  // left stays on screen, dimmed and untouchable, until the new one has
  // arrived; and the weeks on either side are fetched ahead, so an arrow
  // usually lands on data already in hand.
  const assignmentsQuery = useQuery({
    queryKey: ["assignments", weekStartISO],
    queryFn: () =>
      assignmentsApi.list({
        weekStart: weekStartISO,
        weekEnd: nextWeekISO,
      }),
    placeholderData: keepPreviousData,
  });
  // The previous week's rows under the new week's date: shown only dimmed,
  // and not pressable — an edit must never land on a week not on screen.
  const showingPreviousWeek = assignmentsQuery.isPlaceholderData;

  const specialEventsQuery = useQuery({
    queryKey: ["special-events", "all"],
    queryFn: () => specialEventsApi.list({ all: true }),
  });

  const circuitOverseersQuery = useQuery({
    queryKey: ["circuit-overseers"],
    queryFn: () => circuitOverseersApi.list(),
    enabled: perms.canManageEvents,
  });

  const coPickMutation = useMutation({
    mutationFn: async ({
      eventId,
      c,
    }: {
      eventId: string;
      c: CircuitOverseer;
    }) => {
      const coName = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
      await specialEventsApi.update(eventId, {
        coFirstName: c.firstName,
        coLastName: c.lastName,
        coWifeName: c.wifeName ?? null,
        coRole: c.role,
      });
      // Put the overseer on his talks for this week directly, using the rows
      // already loaded here, so the schedule reflects the pick immediately and
      // reliably (independent of any server-side week matching).
      const coKeys = [
        "co_service_talk",
        "co_concluding_talk",
        "public_talk_speaker",
      ];
      const coParts = (assignmentsQuery.data?.data ?? []).filter(
        (a) => coKeys.includes(a.partKey) && a.speakerName !== coName,
      );
      await Promise.all(
        coParts.map((a) =>
          assignmentsApi.update(a.id, {
            speakerName: coName,
            publisherId: null,
          }),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["special-events"] });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
    },
  });
  const publishersQuery = useQuery({
    queryKey: ["publishers", "roster"],
    queryFn: () => publishersApi.roster(),
  });
  const meetingSettingsQuery = useQuery({
    queryKey: ["meeting-settings"],
    queryFn: () => meetingSettingsApi.getOverview(),
  });
  const meetingVersion = effectiveVersionFor(
    meetingSettingsQuery.data?.versions,
    weekStartISO,
  );

  // Week drawer helpers. The drawer lists real meeting dates, so resolve the
  // weekday from the settings version effective for THAT week, and let a
  // circuit-overseer visit move the midweek meeting (usually to Tuesday).
  const allSpecialEvents = specialEventsQuery.data;
  const settingsVersions = meetingSettingsQuery.data?.versions;
  const coVisitForWeek = useCallback(
    (weekStartISO2: string) => {
      const sunISO = formatDateISO(addDays(new Date(weekStartISO2), 6));
      return (allSpecialEvents ?? []).find(
        (e) =>
          e.type === "circuit_overseer_visit" &&
          e.date <= sunISO &&
          (e.endDate ?? e.date) >= weekStartISO2,
      );
    },
    [allSpecialEvents],
  );
  const drawerDowForWeek = useCallback(
    (weekStartISO2: string, k: "midweek" | "weekend"): number | null => {
      const v = effectiveVersionFor(settingsVersions, weekStartISO2);
      if (k === "weekend") return v?.weekendDow ?? null;
      const visit = coVisitForWeek(weekStartISO2);
      if (visit) return visit.coMidweekDow ?? 2;
      return v?.midweekDow ?? null;
    },
    [settingsVersions, coVisitForWeek],
  );
  const drawerIsCoVisitWeek = useCallback(
    (weekStartISO2: string) => !!coVisitForWeek(weekStartISO2),
    [coVisitForWeek],
  );
  // Opens the picked meeting's section after a drawer jump. The week is part
  // of the focus because switching weeks unmounts the sections while the new
  // week loads — on remount `initiallyOpen` reopens the right one, and the
  // counter handles the case where the sections stay mounted.
  const [meetingFocus, setMeetingFocus] = useState<{
    kind: "midweek" | "weekend";
    weekISO: string;
    n: number;
  } | null>(null);
  const focusOn = (k: "midweek" | "weekend") =>
    meetingFocus?.kind === k && meetingFocus.weekISO === weekStartISO;

  // A link may name the meeting it is about — the meeting feed does, so that
  // tapping a Wednesday opens the Wednesday rather than the whole week. This is
  // the same focus the week drawer sets; the address only asks for it.
  useEffect(() => {
    const m = params.meeting;
    if (m !== "midweek" && m !== "weekend") return;
    setMeetingFocus({ kind: m, weekISO: weekStartISO, n: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.meeting, params.week]);

  const absencesQuery = useQuery({
    queryKey: ["absences", "schedule"],
    queryFn: () => absencesApi.list(),
  });
  const {
    canEditFieldServiceMeetings,
    canEditMidweekSchedule,
    canEditWeekendSchedule,
  } = usePermissions();
  // The badge figures, as the server counts them. Asked for only by the
  // people the endpoint answers — the same three responsibilities its guard
  // checks — so that nobody else collects a 403 on every screen load.
  const canSeeReadiness =
    perms.canEditMidweekSchedule ||
    perms.canEditWeekendSchedule ||
    perms.canEditDuties;
  const readinessQuery = useQuery({
    queryKey: ["readiness", weekStartISO],
    queryFn: () => readinessApi.list(weekStartISO, nextWeekISO),
    enabled: canSeeReadiness,
    placeholderData: keepPreviousData,
  });
  // The neighbouring weeks, fetched ahead with the very same keys and
  // requests as above, so the next arrow finds them in the cache.
  useEffect(() => {
    for (const d of [addWeeks(weekStart, -1), addWeeks(weekStart, 1)]) {
      const from = formatDateISO(d);
      const to = formatDateISO(addWeeks(d, 1));
      void queryClient.prefetchQuery({
        queryKey: ["assignments", from],
        queryFn: () => assignmentsApi.list({ weekStart: from, weekEnd: to }),
      });
      if (canSeeReadiness)
        void queryClient.prefetchQuery({
          queryKey: ["readiness", from],
          queryFn: () => readinessApi.list(from, to),
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartISO, canSeeReadiness]);

  // Read only, from the shared module: the Memorial block lists who serves
  // that evening, and the hospitality zone weighs helpers' load. Editing duties
  // lives in «Meeting duties».
  const { duties, activityById } = useDutiesWeek(weekStartISO, nextWeekISO);

  const fieldServiceQuery = useQuery({
    queryKey: ["field-service", weekStartISO],
    queryFn: () => fieldServiceApi.list({ weekStart: weekStartISO }),
    placeholderData: keepPreviousData,
  });
  const fieldServiceMeetings = fieldServiceQuery.data ?? [];
  // During a circuit-overseer visit the week's field service is planned in the
  // visit schedule, not here, so this section stood empty exactly when there
  // was the most going on. Shown, not edited: these belong to the visit.
  const coVisitFieldServiceQuery = useQuery({
    queryKey: ["co-visit-field-service"],
    queryFn: () => coVisitItemsApi.fieldService(),
    staleTime: 5 * 60 * 1000,
  });
  const weekEndISO = formatDateISO(addDays(weekStart, 6));
  const visitFieldServiceMeetings = (coVisitFieldServiceQuery.data ?? [])
    .flatMap((w) => w.meetings)
    .filter((m) => m.itemDate >= weekStartISO && m.itemDate <= weekEndISO);
  const invalidateFieldService = () => {
    queryClient.invalidateQueries({
      queryKey: ["field-service"],
    });
    queryClient.invalidateQueries({
      queryKey: ["field-service-conductor-stats"],
    });
    queryClient.invalidateQueries({
      queryKey: ["field-service-topic-history"],
    });
    // Same reason as on the field-service screen: the overseer's group counts
    // are derived from these meetings, and a meeting can be saved from here
    // too. Two places save, so two places must refresh.
    queryClient.invalidateQueries({ queryKey: ["service-overseer"] });
  };
  const createFieldServiceMutation = useMutation({
    mutationFn: (input: Parameters<typeof fieldServiceApi.create>[0]) =>
      fieldServiceApi.create(input),
    onSuccess: () => invalidateFieldService(),
  });
  const updateFieldServiceMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      input: Parameters<typeof fieldServiceApi.update>[1];
    }) => fieldServiceApi.update(vars.id, vars.input),
    onSuccess: () => invalidateFieldService(),
  });
  const removeFieldServiceMutation = useMutation({
    mutationFn: (id: string) => fieldServiceApi.remove(id),
    onSuccess: () => invalidateFieldService(),
  });


  const createWeekMutation = useMutation({
    mutationFn: (eventType: EventType) => {
      const parts = PARTS_BY_EVENT[eventType] ?? [];
      const inputs: CreateAssignmentInput[] = parts.map((p) => ({
        weekStartDate: weekStartISO,
        eventType,
        partKey: p.key,
        partOrder: p.defaultOrder,
        partDurationMin: p.defaultDurationMin || undefined,
        status: "draft",
      }));
      return assignmentsApi.bulkCreate(inputs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["assignments", weekStartISO],
      });
    },
  });

  // Add an extra "Living as Christians" part: place it right after the last
  // Christian-Life talk and before the Congregation Bible Study, making room by
  // bumping the order of everything at/after the new slot. Then open the editor.
  const addChristianLifeMut = useMutation({
    mutationFn: async () => {
      const cache = queryClient.getQueryData<{ data: Assignment[] }>([
        "assignments",
        weekStartISO,
      ]);
      const midweek = (cache?.data ?? []).filter(
        (a) => a.eventType === "midweek",
      );
      const cl = midweek.filter(
        (a) => resolveSubsection(a.partKey) === "christian_life",
      );
      const living = cl.filter((a) =>
        a.partKey.startsWith("living_christians"),
      );
      const cbs = cl.filter((a) => a.partKey.startsWith("cbs"));
      let anchor: number;
      if (living.length) anchor = Math.max(...living.map((a) => a.partOrder));
      else if (cbs.length)
        anchor = Math.min(...cbs.map((a) => a.partOrder)) - 1;
      else if (cl.length) anchor = Math.max(...cl.map((a) => a.partOrder));
      else anchor = 10;
      const newOrder = anchor + 1;
      const toBump = midweek
        .filter((a) => a.partOrder >= newOrder)
        .sort((a, b) => b.partOrder - a.partOrder);
      for (const a of toBump) {
        await assignmentsApi.update(a.id, { partOrder: a.partOrder + 1 });
      }
      return assignmentsApi.create({
        weekStartDate: weekStartISO,
        eventType: "midweek",
        partKey: "living_christians_extra",
        partOrder: newOrder,
        partTitle: "",
        partDurationMin: 5,
        status: "draft",
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      setEditing(created);
    },
  });

  const weekEvents = (specialEventsQuery.data ?? []).filter(
    (e) => e.date < nextWeekISO && (e.endDate ?? e.date) >= weekStartISO,
  );
  const assignments = assignmentsQuery.data?.data ?? [];
  // Prayer slots that currently mirror the chairman (rule on) -> "авто" badge.
  const automationOn =
    meetingSettingsQuery.data?.congregation.assignmentAutomationEnabled ??
    false;
  const autoAssignedIds: Set<string> = (() => {
    const ids = new Set<string>();
    if (!automationOn) return ids;
    const chairmen = new Map<string, string | null>();
    for (const a of assignments) {
      if (
        a.partKey === "midweek_chairman" ||
        a.partKey === "weekend_chairman"
      ) {
        chairmen.set(`${a.weekStartDate}|${a.eventType}`, a.publisherId);
      }
    }
    for (const a of assignments) {
      const isPrayer =
        a.partKey === "midweek_closing_prayer" ||
        a.partKey === "weekend_opening_prayer";
      if (!isPrayer || !a.publisherId) continue;
      const chair = chairmen.get(`${a.weekStartDate}|${a.eventType}`);
      if (chair && a.publisherId === chair) ids.add(a.id);
    }
    return ids;
  })();
  const publishersById = new Map<string, Publisher>(
    (publishersQuery.data?.data ?? []).map((p) => [p.id, p]),
  );

  const grouped = new Map<EventType, Assignment[]>();
  for (const a of assignments) {
    const arr = grouped.get(a.eventType) ?? [];
    arr.push(a);
    grouped.set(a.eventType, arr);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.partOrder - b.partOrder);
  }

  // The week's rules (which day each meeting really falls on, what replaces it,
  // whether the congregation meets at all) live in lib/week-rules so this
  // screen and the home timeline cannot drift apart.
  //
  // MEMOISED, and that is not a nicety. Several effects and lists below depend
  // on the rules, and `weekRules` builds a fresh object every call: an
  // unmemoised one is a new value on every render, so an effect listing it
  // would fire on every render for ever. Now it changes only when its three
  // inputs do.
  const specialEvents = specialEventsQuery.data;
  const rules = useMemo(
    () =>
      weekRules({
        weekStartISO,
        version: meetingVersion,
        events: specialEvents ?? [],
      }),
    [weekStartISO, meetingVersion, specialEvents],
  );
  const coVisitEvent = rules.coVisit ?? undefined;
  const dowFor = (kind: "midweek" | "weekend") => rules.dowOf(kind);
  const midweekReplacedBy = rules.replacedBy("midweek");
  const weekendReplacedBy = rules.replacedBy("weekend");
  // Absence visibility: publishers away on each meeting's actual calendar day.
  const mwDow = dowFor("midweek");
  const weDow = dowFor("weekend");
  const midweekDateISO = mwDow
    ? formatDateISO(addDays(weekStart, mwDow - 1))
    : null;
  const weekendDateISO = weDow
    ? formatDateISO(addDays(weekStart, weDow - 1))
    : null;
  const absentIdsFor = (dateISO: string | null): Set<string> => {
    const set = new Set<string>();
    if (!dateISO) return set;
    for (const a of absencesQuery.data ?? []) {
      const end = a.endDate ?? a.startDate;
      if (a.startDate <= dateISO && end >= dateISO) set.add(a.publisherId);
    }
    return set;
  };
  const midweekAbsentIds = absentIdsFor(midweekDateISO);
  const weekendAbsentIds = absentIdsFor(weekendDateISO);
  // A regional convention or circuit assembly means no congregation meetings
  // that week — both meetings are hidden, and so are the doors to duties and
  // cleaning (field-service meetings stay, since they can still happen midweek).
  const congressThisWeek = rules.congress ?? undefined;

  // Circuit overseer display name (for the assignment sheet).
  const circuitOverseer = coVisitEvent
    ? {
        displayName: [coVisitEvent.coFirstName, coVisitEvent.coLastName]
          .filter(Boolean)
          .join(" ")
          .trim(),
        role: coVisitEvent.coRole ?? "overseer",
      }
    : null;

  // Manager-only picker shown on the CO talk parts: switch which overseer is
  // visiting this week. It updates the event snapshot, so the name flows to
  // both the midweek and weekend talks (and the banner) at once.
  const coPicker =
    coVisitEvent && perms.canManageEvents && circuitOverseersQuery.data
      ? {
          overseers: circuitOverseersQuery.data,
          current: {
            firstName: coVisitEvent.coFirstName ?? "",
            lastName: coVisitEvent.coLastName ?? "",
          },
          pending: coPickMutation.isPending,
          onPick: (c: CircuitOverseer) =>
            coPickMutation.mutate({ eventId: coVisitEvent.id, c }),
        }
      : null;
  // Songs are not assigned to a person, so they must not count toward the
  // progress badge (otherwise meetings always look under-filled).
  const BADGE_SONG_KEYS = new Set<string>([
    "mid_song",
    "weekend_song",
    "weekend_opening_song",
  ]);
  const badgeParts = (list: Assignment[]) =>
    list.filter((x) => !BADGE_SONG_KEYS.has(x.partKey));
  /**
   * The badge, preferring the server's count.
   *
   * The client count below cannot know that the circuit overseer's service
   * talk has nobody to be assigned to, so a visit week reads «10 из 11» and
   * can never be complete. Where the server answers, its figures win; where
   * it does not — a reader without the responsibility, a week still
   * loading — the old count stands, and for such a reader it gives the same
   * answer anyway.
   */
  const badgeOf = (
    kind: "midweek" | "weekend",
    list: Assignment[],
  ): { assigned: number; total: number } => {
    const fromServer = readinessQuery.data
      ?.find((w) => w.weekStart === weekStartISO)
      ?.meetings.find((m) => m.kind === kind);
    if (fromServer?.programme.loaded) {
      return {
        assigned: fromServer.programme.assigned,
        total: fromServer.programme.total,
      };
    }
    return { assigned: assignedCount(list), total: badgeParts(list).length };
  };
  const assignedCount = (list: Assignment[]) =>
    badgeParts(list).filter((x) => x.publisherId && x.status !== "cancelled")
      .length;
  const meetingDateLabel = (kind: DutyMeeting): string | null => {
    if (kind === "memorial") {
      const iso = rules.memorial?.date;
      if (!iso) return null;
      const when = new Date(`${iso}T00:00:00`).toLocaleDateString(
        i18n.language,
        { weekday: "long", day: "numeric", month: "long" },
      );
      return rules.memorial?.time ? `${when} · ${rules.memorial.time}` : when;
    }
    if (!meetingVersion) return null;
    const dow = dowFor(kind);
    if (!dow) return null;
    const dateStr = addDays(weekStart, dow - 1).toLocaleDateString(
      i18n.language,
      {
        weekday: "long",
        day: "numeric",
        month: "long",
      },
    );
    const rawTime =
      kind === "midweek"
        ? meetingVersion.midweekTime
        : meetingVersion.weekendTime;
    const time = (rawTime || "").slice(0, 5);
    return time ? `${dateStr} · ${time}` : dateStr;
  };
  const meetingAddress = (): string | null => meetingVersion?.address || null;

  type DutyMeeting = "midweek" | "weekend" | "memorial";

  // Print the whole month's midweek meeting programme as a one-page A4 grid
  // (parts × weeks) for the congregation notice board. Uses the month that the
  // currently viewed week belongs to.
  const [printingMonth, setPrintingMonth] = useState(false);
  const printMonthMeeting = async (kind: "midweek" | "weekend") => {
    if (!meetingVersion) return;
    const dow =
      kind === "midweek"
        ? meetingVersion.midweekDow
        : meetingVersion.weekendDow;
    if (!dow) return;
    const win = openPrintWindow();
    setPrintingMonth(true);
    try {
      // All Mondays whose meeting date falls in the same month as the viewed week.
      // A week belongs to the month of its MONDAY (start of week), matching the
      // workbook's structure: e.g. 29 Jun–5 Jul belongs to June, 31 Aug–6 Sep to
      // August — even though the midweek meeting itself may fall in the next
      // month. The month is taken from the currently viewed week's Monday.
      const month = weekStart.getMonth();
      const year = weekStart.getFullYear();
      const mondays: Date[] = [];
      // First Monday of the month's first week: the Monday on/before the 1st.
      const firstOfMonth = new Date(year, month, 1);
      let m = startOfWeekMonday(firstOfMonth);
      for (let i = 0; i < 6; i++) {
        // Keep weeks whose Monday is in this month.
        if (m.getMonth() === month && m.getFullYear() === year) {
          mondays.push(new Date(m));
        }
        m = addWeeks(m, 1);
      }
      // viewedMeeting is used only for the month label below.
      const viewedMeeting = new Date(year, month, 1);

      // A regional convention / circuit assembly replaces the whole week's
      // meeting; show the event (type, theme, place, dates) instead of parts.
      const events = specialEventsQuery.data ?? [];
      const congressForWeek = (mon: Date) => {
        const meetingISO = formatDateISO(meetingDate(mon, dow));
        const satISO = formatDateISO(addDays(mon, 5));
        const sunISO = formatDateISO(addDays(mon, 6));
        return events.find((e) => {
          if (e.type !== "regional_convention" && e.type !== "circuit_assembly")
            return false;
          const end = e.endDate ?? e.date;
          // Covers the meeting day, or (for the weekend) the Sat/Sun span.
          return (
            (e.date <= meetingISO && end >= meetingISO) ||
            (e.date <= sunISO && satISO <= end)
          );
        });
      };
      const fmtRange = (start: string, end: string | null): string => {
        const s = new Date(`${start}T00:00:00`).toLocaleDateString(
          i18n.language,
          { day: "numeric", month: "long" },
        );
        if (!end || end === start) return s;
        const e = new Date(`${end}T00:00:00`).toLocaleDateString(
          i18n.language,
          {
            day: "numeric",
            month: "long",
          },
        );
        return `${s} — ${e}`;
      };

      // The midweek meeting moves during a circuit-overseer visit (commonly to
      // Tuesday), stored per-visit on the event. Use the visit's day for that
      // week so the printed date and weekday are correct.
      const visitForWeek = (mon: Date) => {
        const monISO = formatDateISO(mon);
        const sunISO = formatDateISO(addDays(mon, 6));
        return events.find((e) => {
          if (e.type !== "circuit_overseer_visit") return false;
          const end = e.endDate ?? e.date;
          return e.date <= sunISO && end >= monISO; // visit overlaps this week
        });
      };
      const dowForWeek = (mon: Date): number => {
        if (kind !== "midweek") return dow;
        const visit = visitForWeek(mon);
        if (visit) return visit.coMidweekDow ?? 2; // default Tuesday
        return dow;
      };

      const weeks: MeetingPdfWeek[] = mondays.map((mon) => {
        const congress = congressForWeek(mon);
        const weekDow = dowForWeek(mon);
        const visit = kind === "midweek" ? visitForWeek(mon) : undefined;
        return {
          weekStartDate: formatDateISO(mon),
          meetingDateLabel: meetingDate(mon, weekDow).toLocaleDateString(
            i18n.language,
            { day: "numeric", month: "long" },
          ),
          headerNote:
            visit && !congress ? t("schedule.print.coVisitNote") : null,
          event: congress
            ? {
                typeLabel: t(`specialEvents.types.${congress.type}`),
                title: congress.title || null,
                place: congress.address || null,
                dateLabel: fmtRange(congress.date, congress.endDate),
              }
            : null,
        };
      });
      if (weeks.length === 0) {
        win?.close();
        return;
      }

      // Load the month's assignments in one range request. The server filters
      // weekStartDate < weekEnd (exclusive), so pass the Monday AFTER the last
      // week to include the final week itself.
      const lastMonday = mondays[mondays.length - 1];
      const res = await assignmentsApi.list({
        weekStart: weeks[0].weekStartDate,
        weekEnd: formatDateISO(addWeeks(lastMonday, 1)),
        eventType: kind,
      });
      const rows = res.data ?? [];
      // Index by week + partKey for O(1) cell lookup.
      const byWeekPart = new Map<string, Assignment>();
      for (const a of rows) {
        byWeekPart.set(`${a.weekStartDate}|${a.partKey}`, a);
      }
      const nameOf = (id: string | null): string | null =>
        id ? (publishersById.get(id)?.displayName ?? null) : null;

      // Midweek only: stamp each part with its start time, using the very same
      // timeline the on-screen schedule shows (chairman, middle song and the
      // CBS reader deliberately get none, but still consume their minutes).
      const timeById = new Map<string, string>();
      if (kind === "midweek") {
        for (const w of weeks) {
          const items = rows
            .filter((a) => a.weekStartDate === w.weekStartDate)
            .map((a) => ({
              id: a.id,
              partKey: a.partKey,
              partDurationMin: a.partDurationMin,
            }));
          if (items.length === 0) continue;
          buildMidweekPartTimes(items, meetingVersion.midweekTime).forEach(
            (iv, id) => timeById.set(id, iv.start),
          );
        }
      }

      // Real part name from the workbook title (mirrors the on-screen display):
      // if the title is "<name>: <detail>" use the name before the colon; else
      // the whole title; else the generic part label.
      // Parts whose name is fixed (chairman, prayers, Bible reading, CBS, etc.)
      // always use the generic label; only workbook parts (talks, apply-yourself
      // assignments, living-as-Christians) take their real name from partTitle.
      const FIXED_NAME_PARTS = new Set<string>([
        "midweek_chairman",
        "midweek_opening_prayer",
        "midweek_closing_prayer",
        "bible_reading",
        "cbs_conductor",
        "cbs_reader",
        "co_service_talk",
        "weekend_chairman",
        "weekend_opening_prayer",
        "weekend_closing_prayer",
      ]);
      const realPartName = (
        partKey: string,
        partTitle: string | null,
      ): string => {
        // Watchtower reader shows just "Чтец"; the conductor's theme is prefixed
        // with "Сторожевая Башня:" so the board reader knows what it belongs to.
        if (partKey === "watchtower_reader") {
          return t("schedule.weekend.reader");
        }
        if (partKey === "watchtower_conductor") {
          const theme = partTitle
            ? partTitle.indexOf(": ") > 0
              ? partTitle.slice(partTitle.indexOf(": ") + 2)
              : partTitle
            : null;
          const prefix = t("schedule.print.watchtowerPrefix");
          return theme ? `${prefix}: ${theme}` : prefix;
        }
        if (FIXED_NAME_PARTS.has(partKey)) return getPartLabel(partKey);
        if (partTitle) {
          const idx = partTitle.indexOf(": ");
          if (idx > 0) return partTitle.slice(0, idx);
          return partTitle;
        }
        return getPartLabel(partKey);
      };

      // Sections in display order with their accent colors and part keys.
      const partDefs = PARTS_BY_EVENT[kind] ?? [];
      const order: string[] =
        kind === "midweek"
          ? ["opening", "treasures", "apply_yourself", "christian_life"]
          : [
              "opening",
              "public_talk",
              "watchtower",
              "concluding_talk",
              "closing",
            ];
      const keysBySection = new Map<string, string[]>();
      for (const p of partDefs) {
        const sub = resolveSubsection(p.key);
        const arr = keysBySection.get(sub) ?? [];
        arr.push(p.key);
        keysBySection.set(sub, arr);
      }
      const sections = order
        .filter((sub) => keysBySection.has(sub))
        .map((sub) => {
          const meta = SUBSECTIONS[sub as keyof typeof SUBSECTIONS];
          return {
            key: sub,
            color: meta.color,
            colorMuted: meta.colorMuted,
            partKeys: keysBySection.get(sub) ?? [],
          };
        });

      const cellFor = (weekStart: string, partKey: string) => {
        const a = byWeekPart.get(`${weekStart}|${partKey}`);
        if (!a) return null;
        // External public-talk speaker: show name + their congregation.
        let name: string | null;
        if (a.speakerName) {
          name = a.speakerCongregation
            ? `${a.speakerName} (${a.speakerCongregation})`
            : a.speakerName;
        } else {
          name = nameOf(a.publisherId);
        }
        const assistant = nameOf(a.assistantPublisherId);
        return {
          partName: realPartName(partKey, a.partTitle),
          name: name ?? null,
          assistant: assistant ?? null,
          time: timeById.get(a.id) ?? null,
        };
      };

      const monthLabel = viewedMeeting.toLocaleDateString(i18n.language, {
        month: "long",
        year: "numeric",
      });
      const time = (
        (kind === "midweek"
          ? meetingVersion.midweekTime
          : meetingVersion.weekendTime) || ""
      ).slice(0, 5);
      const html = buildMeetingSchedulePdfHtml({
        eventType: kind,
        weeks,
        sections,
        cellFor,
        congregationName: meetingSettingsQuery.data?.congregation.name ?? null,
        hallAddress: meetingVersion.address ?? null,
        monthLabel,
        timeLabel: time || null,
        locale: i18n.language,
        // Five-week months (with part times on the midweek sheet) need tighter
        // rows to stay on one page.
        compact: weeks.length >= 5,
        labels: {
          title:
            kind === "midweek"
              ? t("schedule.print.midweekTitle")
              : t("schedule.print.weekendTitle"),
          subtitleDow:
            mondays.length > 0
              ? meetingDate(mondays[0], dow).toLocaleDateString(i18n.language, {
                  weekday: "long",
                })
              : "",
          emptyCell: "—",
        },
      });
      await exportHtmlAsPdf(html, {
        fileName:
          kind === "midweek"
            ? t("schedule.print.midweekTitle")
            : t("schedule.print.weekendTitle"),
        preopenedWindow: win,
      });
    } catch (e) {
      // Printing used to fail in silence: the print window just vanished.
      win?.close();
      reportError(extractErrorMessage(e));
    } finally {
      setPrintingMonth(false);
    }
  };

  const draftCount = (list: Assignment[]) =>
    list.filter((x) => String(x.status) === "draft").length;
  const changedCount = (list: Assignment[]) =>
    list.filter((x) => x.changedSincePublish).length;
  const publishMeetingNow = async (
    eventType: "midweek" | "weekend",
    weekStartDate: string,
    notify = true,
  ) => {
    setPublishingType(eventType);
    try {
      await assignmentsApi.publish({ weekStartDate, eventType, notify });
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(msg);
      }
    } finally {
      setPublishingType(null);
    }
  };
  const notifyChangesNow = async (
    eventType: "midweek" | "weekend",
    weekStartDate: string,
  ) => {
    setNotifyingType(eventType);
    try {
      await assignmentsApi.notifyChanges({ weekStartDate, eventType });
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(msg);
      }
    } finally {
      setNotifyingType(null);
    }
  };

  const hospitalityMutation = useMutation({
    mutationFn: (v: {
      existing: Assignment | null;
      publisherId: string | null;
      weekStartDate: string;
    }) =>
      v.existing
        ? assignmentsApi.update(v.existing.id, { publisherId: v.publisherId })
        : assignmentsApi.create({
            weekStartDate: v.weekStartDate,
            eventType: "weekend",
            partKey: "weekend_hospitality",
            partOrder: 99,
            partTitle: "Гостеприимство",
            publisherId: v.publisherId,
            status: "draft",
          }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["assignments"] }),
  });

  const hasMidweek = (grouped.get("midweek")?.length ?? 0) > 0;
  const hasWeekend = (grouped.get("weekend")?.length ?? 0) > 0;
  const isEmpty = assignments.length === 0;
  const canEditEditing =
    editing == null
      ? false
      : editing.eventType === "weekend"
        ? canEditWeekendSchedule
        : editing.eventType === "midweek"
          ? canEditMidweekSchedule
          : perms.isAdmin;

  return (
    <AutoAssignedContext.Provider value={autoAssignedIds}>
      <View style={styles.container}>
        <WeekNavigator
          weekStart={weekStart}
          onChange={setWeekStart}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <WeekDrawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          currentWeekStart={weekStart}
          onPick={(ws, k) => {
            setWeekStart(ws);
            setMeetingFocus({
              kind: k,
              weekISO: formatDateISO(ws),
              n: Date.now(),
            });
          }}
          dowForWeek={drawerDowForWeek}
          isCoVisitWeek={drawerIsCoVisitWeek}
        />
        <AssignmentSheet
          assignment={editing}
          weekStartISO={weekStartISO}
          canEdit={canEditEditing}
          circuitOverseer={circuitOverseer}
          coPicker={coPicker}
          onClose={() => setEditing(null)}
        />
        <PublishDialog
          open={!!publishPrompt}
          busy={publishingType === publishPrompt?.eventType}
          onPublish={(notify) => {
            if (publishPrompt) {
              void publishMeetingNow(
                publishPrompt.eventType,
                publishPrompt.weekStartDate,
                notify,
              );
            }
            setPublishPrompt(null);
          }}
          onCancel={() => setPublishPrompt(null)}
        />
        <NotifyChangesDialog
          open={!!notifyPrompt}
          busy={
            notifyingType === notifyPrompt?.eventType ||
            publishingType === notifyPrompt?.eventType
          }
          onConfirm={(notify) => {
            if (notifyPrompt) {
              if (notify) {
                void notifyChangesNow(
                  notifyPrompt.eventType,
                  notifyPrompt.weekStartDate,
                );
              } else {
                // Silent: a no-notify re-publish clears the "changed since
                // publish" flags without sending any push.
                void publishMeetingNow(
                  notifyPrompt.eventType,
                  notifyPrompt.weekStartDate,
                  false,
                );
              }
            }
            setNotifyPrompt(null);
          }}
          onCancel={() => setNotifyPrompt(null)}
        />

        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={assignmentsQuery.isRefetching}
              onRefresh={() => assignmentsQuery.refetch()}
            />
          }
        >
          {assignmentsQuery.error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {extractErrorMessage(assignmentsQuery.error)}
              </Text>
            </View>
          )}

          {/* The meeting's date, time and address come from the settings, the
              names from the roster: drawn before those arrive, each card got
              its date line a moment later and its title slid up by a line.
              Wait for all three once — later weeks find them in the cache. */}
          {assignmentsQuery.isLoading ||
          meetingSettingsQuery.isPending ||
          publishersQuery.isPending ? (
            <ActivityIndicator size="large" style={{ marginTop: 32 }} />
          ) : assignmentsQuery.isError ? (
            // Without this the week simply looked empty — as if nothing had been
            // scheduled — when in fact the data never arrived.
            <LoadError onRetry={() => assignmentsQuery.refetch()} />
          ) : (
            <View
              style={showingPreviousWeek ? styles.previousWeek : undefined}
              pointerEvents={showingPreviousWeek ? "none" : "auto"}
            >
              <SpecialEventsWeekBanner events={weekEvents} />
              {congressThisWeek && (
                <CongressWeekBanner event={congressThisWeek} />
              )}
              {EVENT_TYPE_ORDER.map((eventType) => {
                const items = grouped.get(eventType) ?? [];
                if (
                  congressThisWeek &&
                  (eventType === "midweek" || eventType === "weekend")
                ) {
                  return null;
                }
                // BEFORE the emptiness check on purpose: on a Memorial week
                // there are no assignments for the meeting it takes — the
                // workbook has not been imported that far ahead — and the block
                // must still appear. It is the meeting of that week.
                if (
                  rules.memorialTakes === eventType &&
                  rules.memorial &&
                  !congressThisWeek
                ) {
                  return (
                    <MemorialMeetingBlock
                      key="memorial"
                      event={rules.memorial}
                      canEdit={perms.isAdmin || perms.isElder}
                      hiddenCount={items.length}
                      duties={duties}
                      publishersById={publishersById}
                    />
                  );
                }
                if (items.length === 0) return null;
                const numbers = buildPartNumbers(items);
                const partTimes =
                  eventType === "midweek"
                    ? buildMidweekPartTimes(
                        items,
                        meetingSettingsQuery.data?.effective?.midweekTime,
                      )
                    : eventType === "weekend"
                      ? buildWeekendPartTimes(
                          items,
                          meetingSettingsQuery.data?.effective?.weekendTime,
                        )
                      : null;
                if (eventType === "midweek" && midweekReplacedBy) {
                  return (
                    <ReplacedMeetingNotice
                      key="midweek"
                      event={midweekReplacedBy}
                      eventType="midweek"
                      hiddenCount={items.length}
                    />
                  );
                }
                if (eventType === "weekend" && weekendReplacedBy) {
                  return (
                    <ReplacedMeetingNotice
                      key="weekend"
                      event={weekendReplacedBy}
                      eventType="weekend"
                      hiddenCount={items.length}
                    />
                  );
                }
                if (eventType === "midweek") {
                  return (
                    <CollapsibleMeetingBlock
                      key="midweek"
                      initiallyOpen={focusOn("midweek")}
                      openSignal={
                        focusOn("midweek") ? meetingFocus?.n : undefined
                      }
                      accent={SECTION_COLORS.meeting.color}
                      icon="calendar-outline"
                      title={getEventTypeLabel("midweek")}
                      meta={meetingDateLabel("midweek")}
                      metaAddress={meetingAddress()}
                      onPrint={
                        perms.isElder || perms.isAdmin
                          ? () => printMonthMeeting("midweek")
                          : undefined
                      }
                      printBusy={printingMonth}
                      assigned={badgeOf("midweek", items).assigned}
                      total={badgeOf("midweek", items).total}
                      actionLabel={
                        !perms.canEditMidweekSchedule
                          ? undefined
                          : draftCount(items) > 0
                            ? t("schedule.publish.button")
                            : changedCount(items) > 0
                              ? t("schedule.notifyChanges.button")
                              : undefined
                      }
                      actionBusy={
                        publishingType === "midweek" ||
                        notifyingType === "midweek"
                      }
                      onAction={() =>
                        draftCount(items) > 0
                          ? setPublishPrompt({
                              eventType: "midweek",
                              weekStartDate: items[0].weekStartDate,
                            })
                          : setNotifyPrompt({
                              eventType: "midweek",
                              weekStartDate: items[0].weekStartDate,
                            })
                      }
                    >
                      <ConductEntry
                        week={items[0].weekStartDate}
                        chairmanPublisherId={
                          items.find((a) => a.partKey === "midweek_chairman")
                            ?.publisherId ?? null
                        }
                      />
                      <MidweekSections
                        canEdit={perms.canEditMidweekSchedule}
                        onEdit={setEditing}
                        onAddChristianLife={() => addChristianLifeMut.mutate()}
                        addingChristianLife={addChristianLifeMut.isPending}
                        items={items}
                        numbers={numbers}
                        times={partTimes}
                        publishersById={publishersById}
                        absentIds={midweekAbsentIds}
                      />
                    </CollapsibleMeetingBlock>
                  );
                }
                if (eventType === "weekend") {
                  const hospitality =
                    items.find((a) => a.partKey === "weekend_hospitality") ??
                    null;
                  const programItems = items.filter(
                    (a) => a.partKey !== "weekend_hospitality",
                  );
                  return (
                    <CollapsibleMeetingBlock
                      key="weekend"
                      initiallyOpen={focusOn("weekend")}
                      openSignal={
                        focusOn("weekend") ? meetingFocus?.n : undefined
                      }
                      accent={SECTION_COLORS.meeting.color}
                      icon="calendar-outline"
                      title={getEventTypeLabel("weekend")}
                      meta={meetingDateLabel("weekend")}
                      metaAddress={meetingAddress()}
                      onPrint={
                        perms.isElder || perms.isAdmin
                          ? () => printMonthMeeting("weekend")
                          : undefined
                      }
                      printBusy={printingMonth}
                      assigned={badgeOf("weekend", programItems).assigned}
                      total={badgeOf("weekend", programItems).total}
                      actionLabel={
                        !perms.canEditWeekendSchedule
                          ? undefined
                          : draftCount(items) > 0
                            ? t("schedule.publish.button")
                            : changedCount(items) > 0
                              ? t("schedule.notifyChanges.button")
                              : undefined
                      }
                      actionBusy={
                        publishingType === "weekend" ||
                        notifyingType === "weekend"
                      }
                      onAction={() =>
                        draftCount(items) > 0
                          ? setPublishPrompt({
                              eventType: "weekend",
                              weekStartDate: items[0].weekStartDate,
                            })
                          : setNotifyPrompt({
                              eventType: "weekend",
                              weekStartDate: items[0].weekStartDate,
                            })
                      }
                    >
                      <WeekendSections
                        canEdit={perms.canEditWeekendSchedule}
                        items={programItems}
                        numbers={numbers}
                        times={partTimes}
                        publishersById={publishersById}
                        onEdit={setEditing}
                        absentIds={weekendAbsentIds}
                      />
                      <HospitalityZone
                        hospitality={hospitality}
                        canEdit={perms.canEditWeekendSchedule}
                        publishersById={publishersById}
                        activityById={activityById}
                        weekStartISO={weekStartISO}
                        onChange={(publisherId) =>
                          hospitalityMutation.mutate({
                            existing: hospitality,
                            publisherId,
                            weekStartDate: items[0].weekStartDate,
                          })
                        }
                      />
                    </CollapsibleMeetingBlock>
                  );
                }
                return (
                  <View key={eventType} style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      {getEventTypeLabel(eventType)} ({items.length})
                    </Text>
                    <View style={styles.sectionBody}>
                      {items.map((a) => (
                        <AssignmentRow
                          key={a.id}
                          assignment={a}
                          onEdit={setEditing}
                          canEdit={perms.isAdmin}
                          publisher={
                            a.publisherId
                              ? (publishersById.get(a.publisherId) ?? null)
                              : null
                          }
                          assistant={
                            a.assistantPublisherId
                              ? (publishersById.get(a.assistantPublisherId) ??
                                null)
                              : null
                          }
                          displayNumber={numbers.get(a.id) ?? null}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}

              {/* Duties and cleaning moved to screens of their own (Congregation →
                  Meetings, Kingdom Hall). Two doors stand where the sections were,
                  so whoever looks for them here learns where they went. */}
              {!congressThisWeek && (
                <View style={styles.movedDoors}>
                  {perms.canEditDuties || perms.isElder || perms.isAdmin ? (
                    <MovedDoor
                      icon="people-outline"
                      color={SECTION_COLORS.duty.color}
                      title={t("congregationHub.duties")}
                      subtitle={t("schedule.movedTo", { path: `${t("tabs.publishers")} → ${t("congregationHub.sections.meetings")}` })}
                      onPress={() => router.push("/publishers/duties" as never)}
                    />
                  ) : null}
                  <MovedDoor
                    icon="sparkles-outline"
                    color={SECTION_COLORS.cleaning.color}
                    title={t("congregationHub.cleaning")}
                    subtitle={t("schedule.movedTo", { path: `${t("tabs.publishers")} → ${t("congregationHub.sections.hall")}` })}
                    onPress={() => router.push(`/publishers/cleaning-week?week=${weekStartISO}` as never)}
                  />
                </View>
              )}

              {/* Встречи для проповеди — разворачивающаяся секция */}
              <CollapsibleMeetingBlock
                accent={SECTION_COLORS.field_service.color}
                icon="navigate-outline"
                title={t("fieldService.title")}
                assigned={0}
                total={0}
                showBadge={false}
              >
                <FieldServiceSection
                  meetings={fieldServiceMeetings}
                  visitMeetings={visitFieldServiceMeetings}
                  hideHeader
                  publishersById={publishersById}
                  canEdit={canEditFieldServiceMeetings}
                  weekStartISO={weekStartISO}
                  onCreate={(input) => createFieldServiceMutation.mutate(input)}
                  onUpdate={(id, input) =>
                    updateFieldServiceMutation.mutate({ id, input })
                  }
                  onRemove={(id) => removeFieldServiceMutation.mutate(id)}
                  pending={
                    createFieldServiceMutation.isPending ||
                    updateFieldServiceMutation.isPending ||
                    removeFieldServiceMutation.isPending
                  }
                />
              </CollapsibleMeetingBlock>


              {isEmpty && (
                <Text style={styles.emptyHint}>
                  {t("schedule.noAssignments")}
                </Text>
              )}

              {/* Create buttons — show one per missing event type that has a template */}
              <View style={styles.createButtons}>
                {!hasMidweek && canEditMidweekSchedule && (
                  <CreateButton
                    label={t("schedule.createEmptyMidweek", {
                      count: PARTS_BY_EVENT.midweek.length,
                    })}
                    primary={isEmpty}
                    onPress={() => createWeekMutation.mutate("midweek")}
                    disabled={createWeekMutation.isPending}
                  />
                )}
                {!hasWeekend && canEditWeekendSchedule && (
                  <CreateButton
                    label={t("schedule.createEmptyWeekend", {
                      count: PARTS_BY_EVENT.weekend.length,
                    })}
                    primary={isEmpty && !PARTS_BY_EVENT.midweek.length}
                    onPress={() => createWeekMutation.mutate("weekend")}
                    disabled={createWeekMutation.isPending}
                  />
                )}
              </View>

              {createWeekMutation.error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>
                    {extractErrorMessage(createWeekMutation.error)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

      </View>
    </AutoAssignedContext.Provider>
  );
}

/** A door to where a section moved: its icon, its name, where it lives now. */
function MovedDoor({
  icon,
  color,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.movedDoor, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <View style={[styles.movedIcon, { backgroundColor: `${color}14` }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.movedBody}>
        <Text style={styles.movedTitle}>{title}</Text>
        <Text style={styles.movedSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </Pressable>
  );
}

const SUBSECTION_ORDER: Subsection[] = [
  "opening",
  "treasures",
  "apply_yourself",
  "christian_life",
];

function MidweekSections({
  times,
  items,
  numbers,
  publishersById,
  onEdit,
  onAddChristianLife,
  addingChristianLife,
  canEdit,
  absentIds,
}: {
  items: Assignment[];
  numbers: Map<string, number | null>;
  times?: Map<string, PartInterval> | null;
  publishersById: Map<string, Publisher>;
  onEdit: (a: Assignment) => void;
  onAddChristianLife?: () => void;
  addingChristianLife?: boolean;
  canEdit: boolean;
  absentIds?: Set<string>;
}) {
  const { t } = useTranslation();

  const bySubsection = new Map<Subsection, Assignment[]>();
  for (const a of items) {
    const sub = resolveSubsection(a.partKey);
    const arr = bySubsection.get(sub) ?? [];
    arr.push(a);
    bySubsection.set(sub, arr);
  }

  return (
    <>
      {SUBSECTION_ORDER.map((sub) => {
        const arr = bySubsection.get(sub) ?? [];
        if (arr.length === 0) return null;
        const meta = SUBSECTIONS[sub];
        return (
          <View
            key={sub}
            style={[styles.weekendCard, { borderLeftColor: meta.color }]}
          >
            <View
              style={[
                styles.weekendCardHead,
                { backgroundColor: meta.colorMuted },
              ]}
            >
              <View style={styles.weekendCardIcon}>
                <Ionicons
                  name={meta.icon as any}
                  size={15}
                  color={meta.color}
                />
              </View>
              <Text style={[styles.weekendCardTitle, { color: meta.color }]}>
                {t(meta.i18nKey)}
              </Text>
              {canEdit && sub === "christian_life" && onAddChristianLife ? (
                <Pressable
                  onPress={onAddChristianLife}
                  disabled={addingChristianLife}
                  hitSlop={8}
                  accessibilityLabel={t("schedule.addChristianLife")}
                >
                  {addingChristianLife ? (
                    <ActivityIndicator size="small" color={meta.color} />
                  ) : (
                    <Ionicons name="add" size={20} color={meta.color} />
                  )}
                </Pressable>
              ) : null}
            </View>
            <View style={styles.weekendCardBody}>
              {arr.map((a) => (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  partTime={times?.get(a.id) ?? null}
                  onEdit={onEdit}
                  publisher={
                    a.publisherId
                      ? (publishersById.get(a.publisherId) ?? null)
                      : null
                  }
                  assistant={
                    a.assistantPublisherId
                      ? (publishersById.get(a.assistantPublisherId) ?? null)
                      : null
                  }
                  displayNumber={numbers.get(a.id) ?? null}
                  canEdit={canEdit}
                  absentIds={absentIds}
                  accentTint={meta.color}
                />
              ))}
            </View>
          </View>
        );
      })}
    </>
  );
}

const WEEKEND_SUBSECTION_ORDER: Subsection[] = [
  "opening",
  "public_talk",
  "watchtower",
  "concluding_talk",
  "closing",
];

// Only the two main parts get a colored, labeled section card. The opening
// rows (chairman / song / prayer) and the closing prayer render as plain rows
// without a banner — the weekend program has no "opening"/"closing" headings.
const WEEKEND_BANNER_SUBSECTIONS = new Set<Subsection>([
  "public_talk",
  "watchtower",
  "concluding_talk",
]);

function WeekendSections({
  items,
  numbers,
  times,
  publishersById,
  onEdit,
  canEdit,
  absentIds,
}: {
  items: Assignment[];
  numbers: Map<string, number | null>;
  times?: Map<string, PartInterval> | null;
  publishersById: Map<string, Publisher>;
  onEdit: (a: Assignment) => void;
  canEdit: boolean;
  absentIds?: Set<string>;
}) {
  const { t } = useTranslation();

  const bySubsection = new Map<Subsection, Assignment[]>();
  const concludingOrder = items.find(
    (a) => a.partKey === "co_concluding_talk",
  )?.partOrder;
  for (const a of items) {
    let sub = resolveSubsection(a.partKey);
    // A CO visit adds a second weekend song — the concluding song, sung right
    // before the closing prayer. Group it with the closing prayer (above it),
    // not with the pre-study song in the Watchtower section.
    if (
      a.partKey === "weekend_song" &&
      concludingOrder != null &&
      a.partOrder >= concludingOrder
    ) {
      sub = "closing";
    }
    const arr = bySubsection.get(sub) ?? [];
    arr.push(a);
    bySubsection.set(sub, arr);
  }

  const renderRows = (arr: Assignment[], accentColor?: string, tint?: string) =>
    arr.map((a) => (
      <AssignmentRow
        key={a.id}
        assignment={a}
        partTime={times?.get(a.id) ?? null}
        onEdit={onEdit}
        publisher={
          a.publisherId ? (publishersById.get(a.publisherId) ?? null) : null
        }
        assistant={
          a.assistantPublisherId
            ? (publishersById.get(a.assistantPublisherId) ?? null)
            : null
        }
        displayNumber={numbers.get(a.id) ?? null}
        canEdit={canEdit}
        absentIds={absentIds}
        accentColor={accentColor}
        accentTint={tint}
      />
    ));

  return (
    <>
      {WEEKEND_SUBSECTION_ORDER.map((sub) => {
        const arr = bySubsection.get(sub) ?? [];
        if (arr.length === 0) return null;
        if (!WEEKEND_BANNER_SUBSECTIONS.has(sub)) {
          return (
            <View key={sub} style={[styles.sectionBody, { marginTop: 12 }]}>
              {renderRows(arr)}
            </View>
          );
        }
        const meta = SUBSECTIONS[sub];
        return (
          <View
            key={sub}
            style={[styles.weekendCard, { borderLeftColor: meta.color }]}
          >
            <View
              style={[
                styles.weekendCardHead,
                { backgroundColor: meta.colorMuted },
              ]}
            >
              <View style={styles.weekendCardIcon}>
                <Ionicons
                  name={meta.icon as any}
                  size={15}
                  color={meta.color}
                />
              </View>
              <Text style={[styles.weekendCardTitle, { color: meta.color }]}>
                {t(meta.i18nKey)}
              </Text>
            </View>
            <View style={styles.weekendCardBody}>
              {renderRows(arr, undefined, meta.color)}
            </View>
          </View>
        );
      })}
    </>
  );
}

function CreateButton({
  label,
  primary,
  onPress,
  disabled,
}: {
  label: string;
  primary: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.createButton,
        primary ? styles.createPrimary : styles.createSecondary,
        disabled && { opacity: 0.6 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.createButtonText,
          primary ? styles.createPrimaryText : styles.createSecondaryText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}


function AssignmentRow({
  assignment,
  publisher,
  assistant,
  accentColor,
  accentTint,
  displayNumber,
  partTime,
  onEdit,
  canEdit,
  absentIds,
}: {
  assignment: Assignment;
  publisher: Publisher | null;
  assistant: Publisher | null;
  accentColor?: string;
  /** Section color used only to tint the number/overline, not a left rail. */
  accentTint?: string;
  displayNumber?: number | null;
  /** Computed time interval (midweek only) shown under the number circle. */
  partTime?: PartInterval | null;
  onEdit: (a: Assignment) => void;
  canEdit: boolean;
  absentIds?: Set<string>;
}) {
  const { t } = useTranslation();
  const { myPublisherId } = useMyPublisher();
  const isAuto = useContext(AutoAssignedContext).has(assignment.id);
  const isMine =
    !!myPublisherId &&
    (assignment.publisherId === myPublisherId ||
      assignment.assistantPublisherId === myPublisherId);
  const glow = useMyGlow(isMine, "meeting");
  const {
    label: rawPartLabel,
    subtitle: rawSubtitle,
    overline,
  } = partDisplay(assignment.partKey, assignment.partTitle);
  const songTitles = useSongsMap();
  const isStudentTalkRow =
    !!getPartDef(assignment.partKey)?.hasAssistant &&
    skillCapabilityFromTitle(assignment.partTitle) === "fs_talk";
  const durationSuffix =
    assignment.partDurationMin != null &&
    ["treasures", "apply_yourself", "christian_life"].includes(
      resolveSubsection(assignment.partKey) as string,
    )
      ? ` (${assignment.partDurationMin} ${t("schedule.minShort")})`
      : "";
  const partLabel =
    (enrichSongRef(rawPartLabel, songTitles) ?? rawPartLabel) + durationSuffix;
  const subtitle = enrichSongRef(rawSubtitle, songTitles);

  // Resolve who is assigned: local publisher OR invited speaker fallback
  const hasInvitedSpeaker = !publisher && !!assignment.speakerName;

  // Songs (e.g. the middle song) are informational — no assignment, no editing.
  const isSong =
    assignment.partKey === "mid_song" ||
    assignment.partKey === "weekend_song" ||
    assignment.partKey === "weekend_opening_song";
  if (isSong) {
    const hasSongNumber = /\d/.test(assignment.partTitle ?? "");
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          accentColor
            ? { borderLeftWidth: 3, borderLeftColor: accentColor }
            : null,
          pressed && styles.rowPressed,
        ]}
        onPress={canEdit ? () => onEdit(assignment) : undefined}
        disabled={!canEdit}
      >
        <View style={styles.badgeCol}>
          <View style={[styles.orderBadge, styles.orderBadgeInfo]}>
            <Ionicons name="musical-notes-outline" size={15} color="#94a3b8" />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.partLabel}>{partLabel}</Text>
          {hasSongNumber ? null : (
            <Text style={styles.songHint}>{t("schedule.songHint")}</Text>
          )}
        </View>
        {canEdit ? <Text style={styles.chevron}>›</Text> : null}
      </Pressable>
    );
  }

  const inner = (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        accentColor
          ? { borderLeftWidth: 3, borderLeftColor: accentColor }
          : null,
        pressed && styles.rowPressed,
      ]}
      onPress={canEdit ? () => onEdit(assignment) : undefined}
      disabled={!canEdit}
    >
      <View style={styles.badgeCol}>
        <View
          style={[
            styles.orderBadge,
            (accentTint ?? accentColor)
              ? { backgroundColor: (accentTint ?? accentColor) + "1A" }
              : null,
            displayNumber == null && styles.orderBadgeInfo,
          ]}
        >
          <Text
            style={[
              styles.orderText,
              (accentTint ?? accentColor)
                ? { color: accentTint ?? accentColor }
                : null,
            ]}
          >
            {displayNumber ?? "·"}
          </Text>
        </View>
        {partTime ? (
          <View style={styles.timePill}>
            <Text style={styles.timePillStart}>{partTime.start}</Text>
            <Text style={styles.timePillEnd}>{partTime.end}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        {overline ? (
          <Text
            style={[
              styles.overline,
              (accentTint ?? accentColor)
                ? { color: accentTint ?? accentColor }
                : null,
            ]}
          >
            {overline}
          </Text>
        ) : null}
        <View style={styles.partLabelRow}>
          {isMine ? <MyDot /> : null}
          <Text style={styles.partLabel}>{partLabel}</Text>
          {isAuto ? (
            <View style={styles.autoBadge}>
              <Ionicons name="flash" size={10} color="#0369a1" />
              <Text style={styles.autoBadgeText}>
                {t("schedule.autoBadge")}
              </Text>
            </View>
          ) : null}
        </View>
        {subtitle && (
          <Text style={styles.partTitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
        <View style={styles.pairRow}>
          {publisher ? (
            <View style={[styles.chip, styles.chipMain]}>
              <Ionicons name="person-outline" size={13} color="#0c4a6e" />
              <Text style={styles.chipMainText}>{publisher.displayName}</Text>
              {absentIds?.has(publisher.id) ? (
                <Ionicons
                  name="airplane"
                  size={12}
                  color="#b45309"
                  style={{ marginLeft: 4 }}
                />
              ) : null}
            </View>
          ) : hasInvitedSpeaker ? (
            <View style={[styles.chip, styles.chipSpeaker]}>
              <Text style={styles.chipSpeakerText}>
                {assignment.speakerName}
                {assignment.speakerCongregation ? (
                  <Text style={styles.chipSpeakerCong}>
                    {" · "}
                    {assignment.speakerCongregation}
                  </Text>
                ) : null}
              </Text>
            </View>
          ) : (
            <View style={[styles.chip, styles.chipEmpty]}>
              <Ionicons name="person-add-outline" size={13} color="#94a3b8" />
              <Text style={styles.chipEmptyText}>
                {t("schedule.unassigned")}
              </Text>
            </View>
          )}
          {assistant && !isStudentTalkRow && (
            <View style={[styles.chip, styles.chipAssistant]}>
              <Ionicons name="people-outline" size={13} color="#475569" />
              <Text style={styles.chipAssistantText}>
                {assistant.displayName}
              </Text>
              {absentIds?.has(assistant.id) ? (
                <Ionicons
                  name="airplane"
                  size={12}
                  color="#b45309"
                  style={{ marginLeft: 4 }}
                />
              ) : null}
            </View>
          )}
        </View>
        {assignment.status === "cancelled" ? (
          <View style={styles.statusDotRow}>
            <View style={[styles.statusDot, styles.statusDotCancelled]} />
            <Text style={[styles.statusDotLabel, styles.statusDotLabelCancel]}>
              {t("assignments.status.cancelled")}
            </Text>
          </View>
        ) : assignment.changedSincePublish ? (
          <View style={styles.statusDotRow}>
            <View style={[styles.statusDot, styles.statusDotChanged]} />
            <Text style={[styles.statusDotLabel, styles.statusDotLabelChanged]}>
              {t("schedule.notifyChanges.badge")}
            </Text>
          </View>
        ) : null}
      </View>
      {canEdit ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
  if (isMine) {
    return (
      <Animated.View
        style={[
          styles.rowMineGlow,
          {
            backgroundColor: glow.backgroundColor,
            borderColor: glow.borderColor,
          },
        ]}
      >
        {inner}
      </Animated.View>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  previousWeek: { opacity: 0.45 },
  movedDoors: { gap: 8, marginTop: 12 },
  movedDoor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  movedIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  movedBody: { flex: 1, minWidth: 0 },
  movedTitle: { fontSize: 15.5, fontFamily: "Manrope_700Bold", color: "#0f172a" },
  movedSub: { fontSize: 13, fontFamily: "Manrope_500Medium", color: "#64748b", marginTop: 2 },
  // On phones the two meetings stack instead of sharing the width: side by side
  // each block gets ~166px, which breaks labels and squeezes the selectors.
  // 'stretch' matters: once the direction flips to a column, the row's
  // 'flex-start' would start governing the horizontal axis and each card would
  // shrink to its content and hug the left edge instead of filling the width.
  // Stacked, the column must size to its content: keeping flex:1 would make the
  // two cards share the available height, and the taller one lost its bottom
  // rows and the "add duty" button.
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  overline: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#7c3aed",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  emptyHint: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginTop: 32,
    marginBottom: 8,
  },
  createButtons: { padding: 16, gap: 8 },
  createButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  createPrimary: { backgroundColor: "#0ea5e9" },
  createSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#0ea5e9",
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  createPrimaryText: { color: "#fff" },
  createSecondaryText: { color: "#0ea5e9" },

  section: { marginTop: 16 },
  weekendCard: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    borderLeftWidth: 4,
    borderLeftColor: "#7c3aed",
    borderWidth: 0.5,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  weekendCardHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 9,
  },
  weekendCardIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  weekendCardTitle: {
    fontSize: 13,
    fontWeight: "800",
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 0.3,
    flex: 1,
  },
  weekendCardBody: {
    paddingBottom: 2,
  },
  subsectionBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  subsectionBannerText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    flex: 1,
  },
  subsectionBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  bannerAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#64748b",
    textTransform: "uppercase",
    paddingHorizontal: 20,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  sectionBody: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
    alignItems: "center",
  },
  rowPressed: { backgroundColor: "#f8fafc" },
  badgeCol: {
    width: 56,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timePill: {
    marginTop: 3,
    alignSelf: "stretch",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 9,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  timePillStart: {
    fontSize: 12.5,
    fontWeight: "800",
    fontFamily: "Manrope_800ExtraBold",
    color: "#475569",
    lineHeight: 15,
  },
  timePillEnd: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#94a3b8",
    lineHeight: 13,
  },
  orderBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
  },
  orderText: {
    color: "#0369a1",
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    fontSize: 13,
  },
  orderBadgeInfo: { backgroundColor: "#f1f5f9" },
  partLabel: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
  },
  partLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  autoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#e0f2fe",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  autoBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0369a1",
  },
  rowMineGlow: {
    borderWidth: 1,
    borderRadius: 12,
    marginVertical: 2,
    overflow: "hidden",
  },
  songHint: {
    fontSize: 13,
    color: "#94a3b8",
    fontStyle: "italic",
    marginTop: 2,
  },
  partTitle: {
    fontSize: 13,
    color: "#475569",
    marginTop: 2,
    fontStyle: "italic",
  },
  pairRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  chipMain: { backgroundColor: "#e0f2fe" },
  chipMainText: {
    fontSize: 13,
    color: "#0c4a6e",
    fontWeight: "500",
    fontFamily: "Manrope_500Medium",
  },
  chipAssistant: { backgroundColor: "#f1f5f9" },
  chipAssistantText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "500",
    fontFamily: "Manrope_500Medium",
  },
  chipSpeaker: { backgroundColor: "#ede9fe" },
  chipSpeakerText: {
    fontSize: 13,
    color: "#6d28d9",
    fontWeight: "500",
    fontFamily: "Manrope_500Medium",
  },
  chipSpeakerCong: {
    fontSize: 13,
    color: "#9b7fd4",
    fontWeight: "400",
    fontFamily: "Manrope_400Regular",
  },
  chipEmpty: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    paddingVertical: 3,
  },
  chipEmptyText: { fontSize: 13, color: "#94a3b8", fontStyle: "italic" },
  statusDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotChanged: { backgroundColor: "#d97706" },
  statusDotCancelled: { backgroundColor: "#dc2626" },
  statusDotLabel: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  statusDotLabelChanged: { color: "#b45309" },
  statusDotLabelCancel: { color: "#b91c1c" },
  chevron: { color: "#cbd5e1", fontSize: 24, marginLeft: 8 },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: "#dc2626", fontSize: 14 },
});
