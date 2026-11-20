import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "../../../lib/i18n";
import {
  Assignment,
  assignmentsApi,
  Publisher,
  publisherActivityApi,
  publishersApi,
} from "../../../lib/api";
import { usePermissions } from "../../../lib/permissions";
import { addDays, formatDateISO, parseISODate, startOfWeekMonday } from "../../../lib/dates";
import { failsScreen } from "../../../lib/screen-failure";
import { LoadError } from "../../../components/LoadError";
import { AssignmentSheet } from "../../../components/AssignmentSheet";
import { PANEL_WIDTH, programmeLayout } from "../../../lib/programme-layout";
import { OVERVIEW_WIDTH, SIDE_NAV_FROM } from "../../../lib/screen-width";
import {
  MonthCell,
  partHeading,
  studentMonth,
} from "../../../lib/student-month";
import type { RankItem } from "../../../lib/picker-rank";

/** Two months: a workbook's weeks. */
const WEEKS = 8;
const STEP = 4;
/** The table is a table from here on; narrower, week by week. */
const TABLE_FROM = 700;
const PART_COL = 110;
const WEEK_COL = 160;
/** The least a row is; a long name makes it taller, measured. */
const ROW_MIN = 72;

const dayMonth = (iso: string) =>
  parseISODate(iso).toLocaleDateString(i18n.language, { day: "numeric", month: "short" });

/**
 * «Учебные на месяц» (step 4б, 20 November 2026; guidelines п. 24): the
 * student parts of two months in one table, to plan the workbook as a whole.
 * A cell opens the same part window as the week — beside the table on a
 * computer (variant «В»), over it elsewhere.
 */
export default function StudentMonthScreen() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canEdit = perms.canEditMidweekSchedule;
  const { width: windowW } = useWindowDimensions();
  const [areaW, setAreaW] = useState(() =>
    Math.min(OVERVIEW_WIDTH, windowW - (windowW >= SIDE_NAV_FROM ? 232 : 0)),
  );
  const [from, setFrom] = useState(() => formatDateISO(startOfWeekMonday(new Date())));
  const [editing, setEditing] = useState<Assignment | null>(null);
  // Each row of cells as tall as its longest cell; the part number on the
  // left takes the same height (the numbers stay while the weeks scroll).
  const [rowH, setRowH] = useState<Record<string, number>>({});
  const layout = programmeLayout(windowW, areaW, !!editing);

  const weeks = Array.from({ length: WEEKS }, (_, i) =>
    formatDateISO(addDays(parseISODate(from), 7 * i)),
  );
  const to = formatDateISO(addDays(parseISODate(from), 7 * WEEKS));

  const rowsQuery = useQuery({
    throwOnError: failsScreen,
    queryKey: ["assignments", "students", from],
    queryFn: () =>
      assignmentsApi.list({ weekStart: from, weekEnd: to, eventType: "midweek", limit: 500 }),
  });
  // The pickers' own history: 26 weeks back, the planned weeks ahead.
  const activityQuery = useQuery({
    queryKey: ["publisher-activity", from, "students"],
    queryFn: () => publisherActivityApi.getActivity({ weekStart: from, weeks: 26, ahead: WEEKS }),
    staleTime: 60_000,
  });
  const publishersQuery = useQuery({
    queryKey: ["publishers", "roster"],
    queryFn: () => publishersApi.roster(),
  });

  const rows: Assignment[] = rowsQuery.data?.data ?? [];
  const items = new Map<string, RankItem[]>(
    (activityQuery.data ?? []).map((a) => [a.publisherId, a.items as RankItem[]]),
  );
  const people = new Map<string, Publisher>(
    (publishersQuery.data?.data ?? []).map((p) => [p.id, p]),
  );
  const name = (id: string | null) => (id ? (people.get(id)?.displayName ?? "…") : "");
  const month = studentMonth(
    weeks,
    rows.map((r) => ({
      id: r.id,
      weekStartDate: r.weekStartDate,
      eventType: r.eventType,
      partKey: r.partKey,
      partTitle: r.partTitle ?? null,
      publisherId: r.publisherId ?? null,
      assistantPublisherId: r.assistantPublisherId ?? null,
      status: r.status,
    })),
    (id) => items.get(id) ?? [],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const open = (c: MonthCell) => {
    const a = byId.get(c.row.id);
    if (a) setEditing(a);
  };
  // A table stays a table while a part is open beside it: the cell just
  // pressed must not jump into a list.
  const wide = areaW >= TABLE_FROM;
  const tableW = PART_COL + WEEKS * WEEK_COL;
  const roomW = areaW - (layout.panel && editing ? PANEL_WIDTH : 0) - 32;

  const cellView = (c: MonthCell | undefined, compact = false) => {
    if (!c) return <Text style={styles.none}>—</Text>;
    const heading = c.row.partKey === "bible_reading" ? null : partHeading(c.row.partTitle);
    const isOpen = editing?.id === c.row.id;
    return (
      <Pressable
        onPress={() => open(c)}
        style={({ pressed, hovered }: any) => [
          styles.cell,
          compact && styles.cellCompact,
          !c.student && styles.cellOther,
          isOpen && styles.cellOpen,
          (pressed || hovered) && styles.cellHover,
        ]}
        accessibilityRole="button"
      >
        {heading ? (
          <Text style={styles.cellHeading} numberOfLines={2}>
            {heading}
          </Text>
        ) : null}
        {c.empty ? (
          <Text style={styles.assign}>{t("schedule.students.assign")}</Text>
        ) : (
          <>
            <Text style={styles.lead}>
              {name(c.row.publisherId)}
            </Text>
            {c.row.assistantPublisherId ? (
              <Text style={styles.assistant}>
                {t("schedule.students.with", { name: name(c.row.assistantPublisherId) })}
              </Text>
            ) : null}
          </>
        )}
        {c.flags.map((f, i) => (
          <Text key={i} style={styles.flag}>
            {f.kind === "pairBefore"
              ? t("schedule.students.pairBefore", { date: dayMonth(f.week) })
              : t("schedule.students.twoInRow", { name: name(f.personId) })}
          </Text>
        ))}
      </Pressable>
    );
  };

  const loading = rowsQuery.isLoading || publishersQuery.isPending;
  const flagged = month.lines.reduce(
    (n, l) => n + [...l.cells.values()].filter((c) => c.flags.length > 0).length,
    0,
  );
  const empty = month.lines.reduce(
    (n, l) => n + [...l.cells.values()].filter((c) => c.student && c.empty).length,
    0,
  );

  return (
    <View
      style={styles.screen}
      onLayout={(e) => setAreaW(Math.round(e.nativeEvent.layout.width))}
    >
      {layout.panel ? null : (
        <AssignmentSheet
          assignment={editing}
          weekStartISO={editing?.weekStartDate.slice(0, 10) ?? from}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
        />
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.nav}>
          <Pressable
            onPress={() => setFrom(formatDateISO(addDays(parseISODate(from), -7 * STEP)))}
            style={styles.navBtn}
            accessibilityLabel={t("schedule.students.earlier")}
          >
            <Ionicons name="chevron-back" size={20} color="#0369a1" />
          </Pressable>
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={styles.range}>
              {dayMonth(weeks[0])} – {dayMonth(formatDateISO(addDays(parseISODate(to), -1)))}
            </Text>
            <Text style={styles.summary}>
              {t("schedule.students.summary", { empty, flagged })}
            </Text>
          </View>
          <Pressable
            onPress={() => setFrom(formatDateISO(addDays(parseISODate(from), 7 * STEP)))}
            style={styles.navBtn}
            accessibilityLabel={t("schedule.students.later")}
          >
            <Ionicons name="chevron-forward" size={20} color="#0369a1" />
          </Pressable>
        </View>
        <Text style={styles.lead2}>{t("schedule.students.lead")}</Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : rowsQuery.isError ? (
          <LoadError onRetry={() => rowsQuery.refetch()} />
        ) : month.lines.length === 0 ? (
          <Text style={styles.nothing}>{t("schedule.students.nothing")}</Text>
        ) : wide ? (
          <>
          {tableW > roomW ? (
            <Text style={styles.more}>{t("schedule.students.scrollMore")}</Text>
          ) : null}
          {/* The part numbers stay; only the weeks scroll. Rows have one
              height, so the two halves line up. */}
          <View style={styles.tableRow}>
            <View>
              <View style={[styles.th, styles.partCol]} />
              {month.lines.map((l) => (
                <View
                  key={l.partKey}
                  style={[styles.partCol, styles.partCell, { height: rowH[l.partKey] ?? ROW_MIN }]}
                >
                  <Text style={styles.partNo}>№{l.number}</Text>
                  {l.partKey === "bible_reading" ? (
                    <Text style={styles.partName}>{t("schedule.students.bibleReading")}</Text>
                  ) : null}
                </View>
              ))}
            </View>
            <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={styles.table}>
              <View>
                <View style={styles.tr}>
                  {weeks.map((w) => (
                    <View key={w} style={[styles.th, styles.weekCol]}>
                      <Text style={styles.thText}>{dayMonth(w)}</Text>
                    </View>
                  ))}
                </View>
                {month.lines.map((l) => (
                  <View
                    key={l.partKey}
                    style={[styles.tr, { minHeight: ROW_MIN }]}
                    onLayout={(e) => {
                      const h = Math.round(e.nativeEvent.layout.height);
                      setRowH((all) => (all[l.partKey] === h ? all : { ...all, [l.partKey]: h }));
                    }}
                  >
                    {weeks.map((w) => (
                      <View key={w} style={styles.weekCol}>
                        {cellView(l.cells.get(w))}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
          </>
        ) : (
          weeks.map((w) => {
            const cells = month.lines
              .map((l) => ({ l, c: l.cells.get(w) }))
              .filter((x) => !!x.c);
            if (cells.length === 0) return null;
            return (
              <View key={w} style={styles.weekCard}>
                <Text style={styles.weekTitle}>{dayMonth(w)}</Text>
                {cells.map(({ l, c }) => (
                  <View key={l.partKey} style={styles.weekLine}>
                    <Text style={styles.partNoSmall}>№{l.number}</Text>
                    <View style={{ flex: 1 }}>{cellView(c, true)}</View>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
      {layout.panel && editing ? (
        <View style={{ width: PANEL_WIDTH }}>
          <AssignmentSheet
            panel
            assignment={editing}
            weekStartISO={editing.weekStartDate.slice(0, 10)}
            canEdit={canEdit}
            onClose={() => setEditing(null)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: "row", backgroundColor: "#f1f5f9" },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  nav: { flexDirection: "row", alignItems: "center", gap: 8 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
  },
  range: { fontFamily: "Manrope_700Bold", fontSize: 16, color: "#0f172a" },
  summary: { fontFamily: "Manrope_500Medium", fontSize: 12.5, color: "#64748b", marginTop: 2 },
  lead2: { fontFamily: "Manrope_400Regular", fontSize: 13, color: "#475569", lineHeight: 18 },
  nothing: { fontFamily: "Manrope_400Regular", fontSize: 14, color: "#64748b", marginTop: 16 },
  table: { paddingBottom: 4 },
  tableRow: { flexDirection: "row" },
  tr: { flexDirection: "row", alignItems: "stretch" },
  th: { height: 28, paddingHorizontal: 6, justifyContent: "center" },
  thText: { fontFamily: "Manrope_600SemiBold", fontSize: 12, color: "#64748b" },
  partCol: { width: PART_COL },
  weekCol: { width: WEEK_COL, padding: 3 },
  more: { fontFamily: "Manrope_500Medium", fontSize: 12, color: "#0369a1", alignSelf: "flex-end" },
  partCell: { paddingVertical: 8, paddingRight: 6 },
  partNo: { fontFamily: "Manrope_700Bold", fontSize: 14, color: "#0f172a" },
  partName: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#64748b" },
  partNoSmall: { fontFamily: "Manrope_700Bold", fontSize: 13, color: "#0f172a", width: 32, paddingTop: 8 },
  cell: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 8,
    gap: 2,
  },
  cellCompact: { minHeight: 0 },
  cellOther: { backgroundColor: "#f8fafc" },
  cellOpen: { borderColor: "#0ea5e9", backgroundColor: "#e0f2fe" },
  cellHover: { borderColor: "#94a3b8" },
  cellHeading: { fontFamily: "Manrope_500Medium", fontSize: 11.5, color: "#64748b" },
  lead: { fontFamily: "Manrope_600SemiBold", fontSize: 13, color: "#0f172a" },
  assistant: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#475569" },
  assign: { fontFamily: "Manrope_600SemiBold", fontSize: 13, color: "#0369a1" },
  flag: { fontFamily: "Manrope_500Medium", fontSize: 11.5, color: "#b45309", lineHeight: 15 },
  none: { fontFamily: "Manrope_400Regular", fontSize: 13, color: "#cbd5e1", padding: 8 },
  weekCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    gap: 6,
  },
  weekTitle: { fontFamily: "Manrope_700Bold", fontSize: 14, color: "#0f172a" },
  weekLine: { flexDirection: "row", gap: 6 },
});
