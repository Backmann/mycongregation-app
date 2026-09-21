import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import {
  assignmentsApi,
  cleaningApi,
  fieldServiceApi,
  meetingSettingsApi,
  publishersApi,
  readinessApi,
  serviceGroupsApi,
  specialEventsApi,
} from "../../../lib/api";
import type {
  Assignment,
  CleaningAssignment,
  FieldServiceMeeting,
  ReadinessMeeting,
  SpecialEvent,
} from "../../../lib/api";
import { usePermissions } from "../../../lib/permissions";
import { weekRules } from "../../../lib/week-rules";
import { effectiveVersionFor } from "../../../lib/meeting-schedule";
import { addDays, formatDateISO, startOfWeekMonday } from "../../../lib/dates";
import { partDisplay } from "../../../lib/part-display";
import { buildMidweekPartTimes } from "../../../lib/parts";

/**
 * THE MEETING FEED — what is coming, meeting by meeting.
 *
 * READING ONLY. Nothing here edits and nothing here writes — not even the empty
 * duty rows the schedule screen creates for itself when a week is opened. A
 * feed showing many weeks at once would otherwise stamp duties onto every week
 * somebody scrolled past; the live database already carries 368 such rows from
 * one July afternoon.
 *
 * ITS OWN ROW, NOT THE EDITOR'S. The schedule screen's AssignmentRow answers an
 * editor's questions — is this a draft, was it changed after publishing, was it
 * assigned automatically, where do I tap to change it. A reader asks none of
 * them. What must be ONE truth is the meaning of a part — its name, its length,
 * its time — and that already lives in lib/part-display, lib/parts and
 * lib/run-order, where this screen takes it from.
 *
 * WHICH MEETINGS A WEEK HOLDS comes from the week rules, never worked out here:
 * a convention week holds none, a visit moves the midweek meeting, the Memorial
 * takes one by the kind of day it falls on.
 *
 * CLEANING BELONGS TO THE WEEK, not to a day: one group cleans after both
 * meetings, so it is a line under the week, never inside a card — where it
 * would appear twice. Its words are the cleaning section's own
 * (cleaning.slots.*), so the feed says it exactly as the place it is edited.
 *
 * THE MEMORIAL is a card of its own, not a meeting with a missing programme:
 * its order of service lives elsewhere, and readiness does not count it.
 *
 * SECOND STEP of four. Still to come: scrolling back to the start of the
 * service year, and each row leading to its own door.
 */

/** How far ahead the first step reaches. */
const WEEKS = 8;

/** Songs carry no person, so they are not rows a reader looks for. */
const SONG_KEYS = new Set(["mid_song", "weekend_song", "weekend_opening_song"]);

type Kind = "midweek" | "weekend";

export default function MeetingFeedScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  // The same three responsibilities the server's guard checks, so the people
  // who ask are exactly the people it answers.
  const canSeeReadiness =
    perms.canEditMidweekSchedule ||
    perms.canEditWeekendSchedule ||
    perms.canEditDuties;

  const firstMonday = useMemo(() => startOfWeekMonday(new Date()), []);
  const from = formatDateISO(firstMonday);
  // Exclusive, as every range in this API reads it.
  const to = formatDateISO(addDays(firstMonday, WEEKS * 7));
  const weeks = useMemo(
    () =>
      Array.from({ length: WEEKS }, (_, i) =>
        formatDateISO(addDays(firstMonday, i * 7)),
      ),
    [firstMonday],
  );

  const assignmentsQ = useQuery({
    queryKey: ["assignments", "range", from, to],
    queryFn: () =>
      assignmentsApi.list({ weekStart: from, weekEnd: to, limit: 500 }),
  });
  // Same keys as the schedule screen, so the cache is shared.
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
  const readinessQ = useQuery({
    queryKey: ["readiness", "range", from, to],
    queryFn: () => readinessApi.list(from, to),
    enabled: canSeeReadiness,
  });

  const cleaningQ = useQuery({
    queryKey: ["cleaning", "range", from, to],
    queryFn: () => cleaningApi.range(from, to),
  });
  // Same key as the home screen — the group names are the same list.
  const groupsQ = useQuery({
    queryKey: ["service-groups"],
    queryFn: () => serviceGroupsApi.list({}),
    staleTime: 30 * 60 * 1000,
  });
  const fieldQ = useQuery({
    queryKey: ["field-service", "range", from, to],
    queryFn: () => fieldServiceApi.list({ weekStart: from, weekEnd: to }),
  });

  const groupName = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groupsQ.data?.data ?? []) m.set(g.id, g.name);
    return m;
  }, [groupsQ.data]);

  const cleaningOf = useMemo(() => {
    const m = new Map<string, CleaningAssignment[]>();
    for (const c of cleaningQ.data ?? []) {
      const arr = m.get(c.weekStartDate) ?? [];
      arr.push(c);
      m.set(c.weekStartDate, arr);
    }
    return m;
  }, [cleaningQ.data]);

  const fieldOf = useMemo(() => {
    const m = new Map<string, FieldServiceMeeting[]>();
    for (const f of fieldQ.data ?? []) {
      const arr = m.get(f.weekStartDate) ?? [];
      arr.push(f);
      m.set(f.weekStartDate, arr);
    }
    for (const arr of m.values())
      arr.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
    return m;
  }, [fieldQ.data]);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of publishersQ.data?.data ?? []) m.set(p.id, p.displayName);
    return m;
  }, [publishersQ.data]);

  const partsOf = useMemo(() => {
    const m = new Map<string, Assignment[]>();
    for (const a of assignmentsQ.data?.data ?? []) {
      const k = `${a.weekStartDate}|${a.eventType}`;
      const arr = m.get(k) ?? [];
      arr.push(a);
      m.set(k, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.partOrder - b.partOrder);
    return m;
  }, [assignmentsQ.data]);

  const lang = i18n.language;
  const dayMonth = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(lang, {
      day: "numeric",
      month: "long",
    });

  // «21 — 27 сентября» within a month, «28 сентября — 4 октября» across two:
  // the month once, where once is enough.
  const weekRangeLabel = (week: string) => {
    const a = new Date(`${week}T00:00:00`);
    const b = addDays(a, 6);
    const sameMonth = a.getMonth() === b.getMonth();
    return t("feed.weekRange", {
      from: sameMonth
        ? a.toLocaleDateString(lang, { day: "numeric" })
        : dayMonth(week),
      to: dayMonth(formatDateISO(b)),
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.column}>
        {weeks.map((week) => {
          const version = effectiveVersionFor(settingsQ.data?.versions, week);
          const rules = weekRules({
            weekStartISO: week,
            version,
            events: eventsQ.data ?? [],
          });
          const kinds = (["midweek", "weekend"] as Kind[]).filter(
            (k) => !rules.isTakenAway(k) && !!rules.dateOf(k),
          );

          return (
            <View key={week} style={styles.week}>
              <View style={styles.weekHead}>
                <Text style={styles.weekRange}>
                  {weekRangeLabel(week)}
                </Text>
                <View style={styles.weekRule} />
                {week === from ? (
                  <Text style={styles.thisWeek}>{t("feed.thisWeek")}</Text>
                ) : null}
              </View>

              {!rules.meetingsHeld ? (
                <View style={styles.noMeetings}>
                  <Text style={styles.noMeetingsText}>
                    {t("feed.noMeetings")}
                  </Text>
                </View>
              ) : null}

              {(cleaningOf.get(week) ?? [])
                .filter((c) => !!c.serviceGroupId)
                .sort((a, b) => SLOT_ORDER.indexOf(a.slotType) - SLOT_ORDER.indexOf(b.slotType))
                .map((c) => (
                  <View key={c.id} style={styles.cleaning}>
                    <Ionicons name="home-outline" size={16} color="#475569" />
                    <Text style={styles.cleaningText}>
                      {t("feed.cleaningLine", {
                        slot: t(`cleaning.slots.${c.slotType}`),
                        group: groupName.get(c.serviceGroupId as string) ?? "",
                      })}
                    </Text>
                  </View>
                ))}

              {rules.memorial && rules.memorialTakes ? (
                <MemorialCard
                  event={rules.memorial}
                  takes={rules.memorialTakes}
                />
              ) : null}

              {kinds.map((kind) => {
                const date = rules.dateOf(kind) as string;
                const time =
                  (kind === "midweek" ? version?.midweekTime : version?.weekendTime) ??
                  null;
                const readiness = readinessQ.data
                  ?.find((w) => w.weekStart === week)
                  ?.meetings.find((m) => m.kind === kind);
                return (
                  <MeetingCard
                    key={kind}
                    kind={kind}
                    date={date}
                    time={time}
                    items={partsOf.get(`${week}|${kind}`) ?? []}
                    readiness={canSeeReadiness ? readiness : undefined}
                    nameOf={nameOf}
                    movedByVisit={kind === "midweek" && !!rules.coVisit}
                  />
                );
              })}

              {(fieldOf.get(week) ?? []).length > 0 ? (
                <FieldServiceRow
                  week={week}
                  meetings={fieldOf.get(week) ?? []}
                  groupName={groupName}
                  nameOf={nameOf}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function MeetingCard({
  kind,
  date,
  time,
  items,
  readiness,
  nameOf,
  movedByVisit,
}: {
  kind: Kind;
  date: string;
  time: string | null;
  items: Assignment[];
  readiness?: ReadinessMeeting;
  nameOf: Map<string, string>;
  movedByVisit: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const lang = i18n.language;

  const at = new Date(`${date}T00:00:00`);
  const weekday = at.toLocaleDateString(lang, { weekday: "long" });
  const day = at.toLocaleDateString(lang, { day: "numeric", month: "long" });

  const rows = items.filter((a) => !SONG_KEYS.has(a.partKey));
  // A meeting nobody has started on: its rows speak in the same calm voice as
  // the card, not in amber one by one.
  const notStarted = rows.length > 0 && rows.every((a) => !a.publisherId);
  const times =
    kind === "midweek" && time ? buildMidweekPartTimes(items, time) : null;

  // What the card says about itself. Only those who assemble the programme are
  // handed a readiness figure at all; for everybody else this stays empty.
  let status: { tone: "ok" | "warn" | "muted"; text: string } | null = null;
  if (readiness) {
    const p = readiness.programme;
    if (!p.loaded) status = { tone: "muted", text: t("feed.notLoaded") };
    else if (p.missing.length === 0) status = { tone: "ok", text: t("feed.ready") };
    // Nobody at all is not a hole but a week not started yet — for a week a
    // month ahead that is the ordinary course of work, and painting it amber
    // would turn the feed into one long alarm.
    else if (p.assigned === 0) status = { tone: "muted", text: t("feed.noneYet") };
    // Naming the gaps helps while there are a few; fourteen names in a row say
    // nothing a count would not.
    else if (p.missing.length <= 3)
      status = {
        tone: "warn",
        text: t("feed.missing", {
          parts: p.missing.map((k) => partDisplay(k, null).label).join(", "),
        }),
      };
    else
      status = {
        tone: "warn",
        text: t("feed.missingCount", { count: p.missing.length, total: p.total }),
      };
  }

  return (
    <View style={[styles.card, status?.tone === "warn" && styles.cardWarn]}>
      <View style={styles.cardHead}>
        <Text style={styles.weekday}>
          {weekday.charAt(0).toUpperCase() + weekday.slice(1)}
        </Text>
        <Text style={styles.dayTime}>
          {time ? t("feed.timeAt", { day, time }) : day}
        </Text>
      </View>

      {movedByVisit ? (
        <View style={styles.tag}>
          <Text style={styles.tagText}>{t("feed.movedByVisit")}</Text>
        </View>
      ) : null}

      {status ? (
        <View style={styles.statusRow}>
          <Ionicons
            name={
              status.tone === "ok"
                ? "checkmark"
                : status.tone === "warn"
                  ? "alert-circle-outline"
                  : "time-outline"
            }
            size={16}
            color={TONE[status.tone]}
          />
          <Text style={[styles.statusText, { color: TONE[status.tone] }]}>
            {status.text}
          </Text>
        </View>
      ) : null}

      {rows.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <Text style={styles.toggleText}>
            {open ? t("feed.hideProgramme") : t("feed.showProgramme")}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color="#0369a1"
          />
        </Pressable>
      ) : null}

      {open
        ? rows.map((a) => {
            const shown = partDisplay(a.partKey, a.partTitle);
            const people = [a.publisherId, a.assistantPublisherId]
              .map((id) => (id ? nameOf.get(id) : undefined))
              .filter((n): n is string => !!n)
              .join(" · ");
            const start = times?.get(a.id)?.start;
            return (
              <View key={a.id} style={styles.row}>
                <Text style={styles.rowTime}>{start ?? ""}</Text>
                <View style={styles.rowBody}>
                  <Text style={styles.rowLabel}>{shown.label}</Text>
                  <Text
                    style={[
                      styles.rowPeople,
                      !people && !notStarted && styles.rowNobody,
                    ]}
                  >
                    {people || t("feed.unassigned")}
                  </Text>
                </View>
              </View>
            );
          })
        : null}

      {readiness ? (
        <View style={styles.duties}>
          <Text style={styles.dutiesLabel}>{t("feed.duties")}</Text>
          <Text style={styles.dutiesCount}>
            {t("feed.dutiesCount", {
              assigned: readiness.duties.assigned,
              total: readiness.duties.total,
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** The order the cleaning section itself lists its slots in. */
const SLOT_ORDER = ["after_meeting", "thorough", "general"];

function MemorialCard({
  event,
  takes,
}: {
  event: SpecialEvent;
  takes: Kind;
}) {
  const { t, i18n } = useTranslation();
  const at = new Date(`${event.date}T00:00:00`);
  const weekday = at.toLocaleDateString(i18n.language, { weekday: "long" });
  const day = at.toLocaleDateString(i18n.language, { day: "numeric", month: "long" });
  return (
    <View style={[styles.card, styles.cardMemorial]}>
      <View style={styles.memorialTag}>
        <Text style={styles.memorialTagText}>{t("feed.memorial")}</Text>
      </View>
      <View style={styles.cardHead}>
        <Text style={styles.weekday}>
          {weekday.charAt(0).toUpperCase() + weekday.slice(1)}
        </Text>
        <Text style={styles.dayTime}>
          {event.time ? t("feed.timeAt", { day, time: event.time }) : day}
        </Text>
      </View>
      <Text style={styles.memorialNote}>
        {takes === "midweek"
          ? t("feed.memorialInsteadMidweek")
          : t("feed.memorialInsteadWeekend")}
      </Text>
    </View>
  );
}

/**
 * Field-ministry meetings, folded into one line per week: they are many and
 * short, and a reader wants to know that they are there before wanting to see
 * each of them.
 */
function FieldServiceRow({
  week,
  meetings,
  groupName,
  nameOf,
}: {
  week: string;
  meetings: FieldServiceMeeting[];
  groupName: Map<string, string>;
  nameOf: Map<string, string>;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Pressable
        style={({ pressed }) => [styles.fieldHead, pressed && styles.pressed]}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name="navigate-outline" size={16} color="#6d28d9" />
        <Text style={styles.fieldTitle}>
          {t("feed.fieldService", { count: meetings.length })}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color="#6d28d9" />
      </Pressable>
      {open
        ? meetings.map((m) => {
            const date = formatDateISO(addDays(new Date(`${week}T00:00:00`), m.dayOfWeek - 1));
            const weekday = new Date(`${date}T00:00:00`).toLocaleDateString(i18n.language, {
              weekday: "short",
              day: "numeric",
            });
            const group = m.serviceGroupId ? groupName.get(m.serviceGroupId) : undefined;
            const conductor = m.conductorPublisherId ? nameOf.get(m.conductorPublisherId) : undefined;
            return (
              <View key={m.id} style={styles.fieldRow}>
                <Text style={styles.fieldWhen}>
                  {t("feed.timeAt", { day: weekday, time: m.startTime })}
                </Text>
                <Text style={styles.fieldWhere}>
                  {[group, m.address].filter(Boolean).join(" · ")}
                </Text>
                {conductor ? (
                  <Text style={styles.fieldWho}>{t("feed.conductor", { name: conductor })}</Text>
                ) : null}
              </View>
            );
          })
        : null}
    </View>
  );
}

const TONE = { ok: "#15803d", warn: "#a15c07", muted: "#64748b" } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f1f5f9" },
  content: { padding: 14, paddingBottom: 40, alignItems: "center" },
  column: { width: "100%", maxWidth: 720, gap: 18 },
  week: { gap: 10 },
  weekHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  weekRange: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  weekRule: { flex: 1, height: 1, backgroundColor: "#cbd5e1" },
  thisWeek: { fontSize: 12, fontWeight: "600", color: "#0369a1" },
  noMeetings: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
  },
  noMeetingsText: { fontSize: 14, color: "#64748b" },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  cardWarn: { borderColor: "#fcd9a4" },
  cardHead: { flexDirection: "row", alignItems: "baseline", gap: 9, flexWrap: "wrap" },
  weekday: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  dayTime: { fontSize: 15, color: "#64748b" },
  tag: {
    alignSelf: "flex-start",
    backgroundColor: "#eef2ff",
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  tagText: { fontSize: 12, fontWeight: "600", color: "#3730a3" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  statusText: { fontSize: 14, fontWeight: "600", flexShrink: 1 },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    minHeight: 44,
  },
  pressed: { opacity: 0.6 },
  toggleText: { fontSize: 14, fontWeight: "600", color: "#0369a1" },
  row: { flexDirection: "row", gap: 11, paddingVertical: 4 },
  rowTime: { width: 40, fontSize: 13, color: "#94a3b8", textAlign: "right", paddingTop: 1 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, color: "#0f172a" },
  rowPeople: { fontSize: 13, color: "#64748b", marginTop: 1 },
  rowNobody: { color: "#a15c07" },
  duties: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 11,
  },
  dutiesLabel: { flex: 1, fontSize: 14, color: "#475569" },
  dutiesCount: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  cleaning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#e8eef3",
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cleaningText: { flex: 1, fontSize: 14, color: "#334155" },
  cardMemorial: { borderColor: "#c4b5fd" },
  memorialTag: {
    alignSelf: "flex-start",
    backgroundColor: "#ede9fe",
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  memorialTagText: { fontSize: 12, fontWeight: "700", color: "#5b21b6" },
  memorialNote: { fontSize: 14, color: "#64748b" },
  field: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  fieldHead: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 44 },
  fieldTitle: { flex: 1, fontSize: 14, fontWeight: "600", color: "#0f172a" },
  fieldRow: { borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingVertical: 9 },
  fieldWhen: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  fieldWhere: { fontSize: 13, color: "#64748b", marginTop: 1 },
  fieldWho: { fontSize: 13, color: "#64748b", marginTop: 1 },
});
