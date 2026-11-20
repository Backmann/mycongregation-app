import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { publisherActivityApi, type Assignment, type Publisher } from "../lib/api";
import { partDisplay } from "../lib/part-display";
import { buildMidweekRunOrder, totalRunMinutes } from "../lib/run-order";
import { checkWeek, type CheckLine, type CheckRow } from "../lib/week-check";

/**
 * «Проверка недели» (mockup «Составление программы — вариант В», 20 November
 * 2026): what in this week asks for a look, in one card above the meetings —
 * the empty parts (the server's own count, as on the «N из M» badge), a
 * student part not given three weeks ahead (guidelines п. 24), a person away
 * on the day, a part not yet sent out, the same pair again, a meeting longer
 * than 1 h 45 min (п. 20), one person on two parts. A line with a part opens
 * that part. The rules are lib/week-check.ts.
 */
export function WeekCheck({
  week,
  items,
  missing,
  dates,
  absent,
  numbers,
  publishersById,
  onOpen,
}: {
  week: string;
  items: Assignment[];
  missing: { midweek: readonly string[]; weekend: readonly string[] };
  dates: { midweek: string | null; weekend: string | null };
  absent: { midweek: ReadonlySet<string>; weekend: ReadonlySet<string> };
  numbers: Map<string, number | null>;
  publishersById: Map<string, Publisher>;
  onOpen: (a: Assignment) => void;
}) {
  const { t, i18n } = useTranslation();
  const [all, setAll] = useState(false);
  // The same request and key as the part's pickers: one cache for both.
  const activity = useQuery({
    queryKey: ["publisher-activity", week, "rank"],
    queryFn: () => publisherActivityApi.getActivity({ weekStart: week, weeks: 26, ahead: 12 }),
    staleTime: 60 * 1000,
  });
  const byId = new Map((activity.data ?? []).map((a) => [a.publisherId, a.items]));
  const midweek = items.filter((a) => a.eventType === "midweek" && a.status !== "cancelled");
  const minutes =
    midweek.length > 0
      ? totalRunMinutes(
          buildMidweekRunOrder(
            midweek.map((a) => ({
              id: a.id,
              partKey: a.partKey,
              partDurationMin: a.partDurationMin ?? null,
              partTitle: a.partTitle ?? null,
              partOrder: a.partOrder ?? null,
            })),
          ),
        )
      : null;
  const rows: CheckRow[] = items
    .filter((a) => a.eventType === "midweek" || a.eventType === "weekend")
    .map((a) => ({
      id: a.id,
      eventType: a.eventType as "midweek" | "weekend",
      partKey: a.partKey,
      partTitle: a.partTitle ?? null,
      publisherId: a.publisherId ?? null,
      assistantPublisherId: a.assistantPublisherId ?? null,
      status: a.status,
      weekStartDate: a.weekStartDate,
    }));
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const lines = checkWeek({
    rows,
    missing,
    dates,
    today: todayISO,
    absent,
    itemsOf: (id) => byId.get(id) ?? [],
    midweekMinutes: minutes,
  });

  const name = (id: string | null | undefined) =>
    (id && publishersById.get(id)?.displayName) || "—";
  const part = (row: CheckRow) => {
    const n = numbers.get(row.id);
    const label = partDisplay(row.partKey, row.partTitle).label;
    return n ? `№${n} ${label}` : label;
  };
  const short = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short" });
  const byRow = new Map(items.map((a) => [a.id, a]));

  const text = (l: CheckLine): string => {
    switch (l.kind) {
      case "late":
        return t("schedule.weekCheck.late", { part: part(l.row), count: l.days });
      case "empty":
        return t("schedule.weekCheck.empty", { part: part(l.row) });
      case "away":
        return t("schedule.weekCheck.away", {
          name: name(l.personId),
          part: l.rows.map(part).join(", "),
        });
      case "emptyMany":
        return t("schedule.weekCheck.emptyMany", {
          meeting: t(`eventTypes.${l.eventType}`),
          count: l.count,
        });
      case "unsent":
        return t("schedule.weekCheck.unsent", { part: part(l.row), count: l.days });
      case "pair":
        return t("schedule.weekCheck.pair", {
          part: part(l.row),
          lead: name(l.row.publisherId),
          assistant: name(l.row.assistantPublisherId),
          date: short(l.week),
        });
      case "long":
        return t("schedule.weekCheck.long", {
          hours: Math.floor(l.minutes / 60),
          minutes: l.minutes % 60,
        });
      case "double":
        return t("schedule.weekCheck.double", {
          name: name(l.personId),
          parts: l.rows.map((r) => partDisplay(r.partKey, r.partTitle).label).join(", "),
        });
    }
  };
  const tone = (l: CheckLine) =>
    l.kind === "late" || l.kind === "away" || l.kind === "long"
      ? "#c2410c"
      : l.kind === "pair"
        ? "#7c3aed"
        : l.kind === "double"
          ? "#0e7490"
          : "#d97706";

  return (
    <View style={styles.card} accessibilityLabel={t("schedule.weekCheck.title")}>
      <Text style={styles.title}>{t("schedule.weekCheck.title")}</Text>
      {lines.length === 0 ? (
        <View style={styles.line}>
          <Ionicons name="checkmark" size={18} color="#047857" />
          <Text style={styles.ok}>{t("schedule.weekCheck.allGood")}</Text>
        </View>
      ) : (
        (all ? lines : lines.slice(0, SHOWN)).map((l, i) => {
          const row = "row" in l ? byRow.get(l.row.id) : undefined;
          const body = (
            <>
              <View style={[styles.dot, { backgroundColor: tone(l) }]} />
              <Text style={styles.lineText}>{text(l)}</Text>
              {row ? <Ionicons name="chevron-forward" size={16} color="#94a3b8" /> : null}
            </>
          );
          return row ? (
            <Pressable
              key={i}
              accessibilityRole="button"
              style={({ pressed }) => [styles.line, pressed && styles.pressed]}
              onPress={() => onOpen(row)}
            >
              {body}
            </Pressable>
          ) : (
            <View key={i} style={styles.line}>
              {body}
            </View>
          );
        })
      )}
      {lines.length > SHOWN ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.line, pressed && styles.pressed]}
          onPress={() => setAll((v) => !v)}
        >
          <Text style={styles.more}>
            {all
              ? t("schedule.weekCheck.less")
              : t("schedule.weekCheck.more", { count: lines.length - SHOWN })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Lines shown before «Ещё N»: the card is a look, not the programme. */
const SHOWN = 4;

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e9ef",
    borderRadius: 16,
    marginHorizontal: 12,
    marginTop: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  title: {
    fontFamily: "Manrope_700Bold",
    fontSize: 15.5,
    color: "#0f172a",
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#eef1f5",
    minHeight: 44,
  },
  pressed: { backgroundColor: "#f1f5f9" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  lineText: { flex: 1, fontFamily: "Manrope_600SemiBold", fontSize: 14, color: "#1e293b", lineHeight: 20 },
  more: { fontFamily: "Manrope_700Bold", fontSize: 14, color: "#0e7490" },
  ok: { flex: 1, fontFamily: "Manrope_500Medium", fontSize: 14, color: "#334155", lineHeight: 20 },
});
