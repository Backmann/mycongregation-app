import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQueries, useQuery } from "@tanstack/react-query";
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
 * FROM THE START OF THE SERVICE YEAR, OPENED ON THIS WEEK. The feed reaches
 * back to the week holding 1 September and no further — earlier than that the
 * question is history, not the programme. It opens on the current week and,
 * once it has put itself there, never moves again on its own: the moment a
 * person scrolls, or asks for more, the place is theirs.
 *
 * AHEAD BY A BUTTON, IN PIECES. «Show more» adds eight weeks as a request of
 * its own, rather than asking again for everything already on screen — which
 * would also run into the 500 assignments one answer may carry. A button and
 * not loading on scroll: on the web a scroll-triggered load fires unpredictably
 * and can hit the server several times at once.
 *
 * THE END IS WHERE THE WORKBOOKS END. When the last piece ends in a week with
 * no programme at all, the feed stops at the last week that has one and says
 * so, rather than trailing off into empty meetings.
 *
 * THIRD STEP of four. Still to come: each row leading to its own door.
 */

/** How many weeks one «show more» brings. */
const CHUNK = 8;

/** Songs carry no person, so they are not rows a reader looks for. */
const SONG_KEYS = new Set(["mid_song", "weekend_song", "weekend_opening_song"]);

type Kind = "midweek" | "weekend";

/**
 * Monday of the week that holds 1 September of the current service year. It
 * runs September to August, so before September it began last autumn.
 */
function serviceYearMonday(today: Date): Date {
  const year = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  return startOfWeekMonday(new Date(year, 8, 1));
}

export default function MeetingFeedScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  // The same three responsibilities the server's guard checks, so the people
  // who ask are exactly the people it answers.
  const canSeeReadiness =
    perms.canEditMidweekSchedule ||
    perms.canEditWeekendSchedule ||
    perms.canEditDuties;

  const currentMonday = useMemo(() => startOfWeekMonday(new Date()), []);
  const firstMonday = useMemo(() => serviceYearMonday(new Date()), []);
  const thisWeek = formatDateISO(currentMonday);
  const startWeek = formatDateISO(firstMonday);
  const hasPast = startWeek < thisWeek;
  const [chunks, setChunks] = useState(1);

  // The past of the service year as one piece, then eight weeks at a time.
  // Every range is exclusive at its end, as everywhere in this API.
  const spans = useMemo(() => {
    const out: { from: string; to: string }[] = [];
    if (hasPast) out.push({ from: startWeek, to: thisWeek });
    for (let i = 0; i < chunks; i++)
      out.push({
        from: formatDateISO(addDays(currentMonday, i * CHUNK * 7)),
        to: formatDateISO(addDays(currentMonday, (i + 1) * CHUNK * 7)),
      });
    return out;
  }, [hasPast, startWeek, thisWeek, currentMonday, chunks]);

  const assignmentsQs = useQueries({
    queries: spans.map((sp) => ({
      queryKey: ["assignments", "range", sp.from, sp.to],
      queryFn: () =>
        assignmentsApi.list({ weekStart: sp.from, weekEnd: sp.to, limit: 500 }),
    })),
  });
  const readinessQs = useQueries({
    queries: spans.map((sp) => ({
      queryKey: ["readiness", "range", sp.from, sp.to],
      queryFn: () => readinessApi.list(sp.from, sp.to),
      enabled: canSeeReadiness,
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
  // Same key as the home screen — the group names are the same list.
  const groupsQ = useQuery({
    queryKey: ["service-groups"],
    queryFn: () => serviceGroupsApi.list({}),
    staleTime: 30 * 60 * 1000,
  });

  const allAssignments = assignmentsQs.flatMap((q) => q.data?.data ?? []);
  const allReadiness = readinessQs.flatMap((q) => q.data ?? []);
  const allCleaning = cleaningQs.flatMap((q) => q.data ?? []);
  const allField = fieldQs.flatMap((q) => q.data ?? []);

  const groupName = new Map<string, string>();
  for (const g of groupsQ.data?.data ?? []) groupName.set(g.id, g.name);

  const cleaningOf = new Map<string, CleaningAssignment[]>();
  for (const c of allCleaning) {
    const arr = cleaningOf.get(c.weekStartDate) ?? [];
    arr.push(c);
    cleaningOf.set(c.weekStartDate, arr);
  }

  const fieldOf = new Map<string, FieldServiceMeeting[]>();
  for (const f of allField) {
    const arr = fieldOf.get(f.weekStartDate) ?? [];
    arr.push(f);
    fieldOf.set(f.weekStartDate, arr);
  }
  for (const arr of fieldOf.values())
    arr.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));

  const nameOf = new Map<string, string>();
  for (const p of publishersQ.data?.data ?? []) nameOf.set(p.id, p.displayName);

  const partsOf = new Map<string, Assignment[]>();
  for (const a of allAssignments) {
    const k = `${a.weekStartDate}|${a.eventType}`;
    const arr = partsOf.get(k) ?? [];
    arr.push(a);
    partsOf.set(k, arr);
  }
  for (const arr of partsOf.values()) arr.sort((a, b) => a.partOrder - b.partOrder);

  // Where the workbooks end. Imported weeks run without gaps, so if the last
  // piece ends in a week with no programme at all, the programme ended inside
  // it — and a «show more» would only bring empty weeks.
  const lastSpan = spans[spans.length - 1];
  const lastSpanWeek = formatDateISO(addDays(new Date(`${lastSpan.to}T00:00:00`), -7));
  const lastLoaded = !!assignmentsQs[assignmentsQs.length - 1]?.data;
  const lastProgrammeWeek = allAssignments.reduce<string | null>(
    (m, a) => (!m || a.weekStartDate > m ? a.weekStartDate : m),
    null,
  );
  const reachedEnd =
    lastLoaded && !allAssignments.some((a) => a.weekStartDate === lastSpanWeek);
  const endWeek = reachedEnd
    ? lastProgrammeWeek && lastProgrammeWeek > thisWeek
      ? lastProgrammeWeek
      : thisWeek
    : lastSpanWeek;

  const weeks: string[] = [];
  for (
    let w = firstMonday;
    formatDateISO(w) <= endWeek;
    w = addDays(w, 7)
  )
    weeks.push(formatDateISO(w));

  // OPEN ON THIS WEEK, ONCE. Everything above it must have arrived first, or
  // the place is measured before the weeks that push it down; then the screen
  // puts itself there and never again — the first scroll, the first «show
  // more», and the place belongs to the person.
  const scrollRef = useRef<ScrollView>(null);
  const placed = useRef(false);
  const thisWeekY = useRef<number | null>(null);
  const aboveSettled =
    !eventsQ.isLoading &&
    !settingsQ.isLoading &&
    (!hasPast ||
      [assignmentsQs[0], readinessQs[0], cleaningQs[0], fieldQs[0]].every(
        (q) => !q.isLoading,
      ));
  // Placed only once the layout has gone quiet. On the web a week reports its
  // new position AFTER the effect that would read it has run, so placing at
  // once used the position from before the weeks above had arrived — and
  // locked the feed a week too high. Every new report pushes the move back a
  // little; when nothing has moved for a moment, the position is the real one.
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placeOnThisWeek = () => {
    if (placed.current || !aboveSettled) return;
    if (placeTimer.current) clearTimeout(placeTimer.current);
    placeTimer.current = setTimeout(() => {
      if (placed.current || thisWeekY.current === null) return;
      // Measured inside the column; the content's padding lies above it, less a
      // little air so the heading does not sit flush against the bar.
      scrollRef.current?.scrollTo({
        y: Math.max(0, thisWeekY.current + 6),
        animated: false,
      });
      placed.current = true;
    }, 150);
  };
  useEffect(placeOnThisWeek);
  useEffect(
    () => () => {
      if (placeTimer.current) clearTimeout(placeTimer.current);
    },
    [],
  );

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
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      onScrollBeginDrag={() => {
        placed.current = true;
      }}
      onContentSizeChange={placeOnThisWeek}
    >
      <View style={styles.column}>
        <View style={styles.yearStart}>
          <View style={styles.weekRule} />
          <Text style={styles.yearStartText}>{t("feed.serviceYearStart")}</Text>
          <View style={styles.weekRule} />
        </View>
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
            <View
              key={week}
              style={styles.week}
              onLayout={
                week === thisWeek
                  ? (e) => {
                      thisWeekY.current = e.nativeEvent.layout.y;
                      placeOnThisWeek();
                    }
                  : undefined
              }
            >
              <View style={styles.weekHead}>
                <Text style={styles.weekRange}>
                  {weekRangeLabel(week)}
                </Text>
                <View style={styles.weekRule} />
                {week === thisWeek ? (
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
                const readiness = allReadiness
                  .find((w) => w.weekStart === week)
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

        {reachedEnd ? (
          <View style={styles.end}>
            <Text style={styles.endTitle}>{t("feed.end")}</Text>
            {lastProgrammeWeek ? (
              <Text style={styles.endNote}>
                {t("feed.endLoadedTo", {
                  date: dayMonth(
                    formatDateISO(addDays(new Date(`${lastProgrammeWeek}T00:00:00`), 6)),
                  ),
                })}
              </Text>
            ) : null}
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}
            onPress={() => {
              // Asking for more is choosing a place: never jump back after it.
              placed.current = true;
              setChunks((c) => c + 1);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.moreText}>{t("feed.loadMore")}</Text>
          </Pressable>
        )}
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
  yearStart: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  yearStartText: { fontSize: 12, fontWeight: "600", color: "#94a3b8" },
  end: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    gap: 5,
  },
  endTitle: { fontSize: 15, fontWeight: "600", color: "#475569" },
  endNote: { fontSize: 14, color: "#64748b" },
  more: {
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    minHeight: 44,
    justifyContent: "center",
  },
  moreText: { fontSize: 14, fontWeight: "600", color: "#0369a1" },
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
