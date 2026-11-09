/**
 * «Изменено» (9 November 2026, Lionel's choice «б»): marks on the person's
 * own assignments that changed since they last saw Home, on any device —
 * a small yellow line «Изменено · было: …» inside the row, «новое» for one
 * that is new, and «Снято с вас» for one taken away while it is still ahead.
 *
 * The server keeps what Home showed (GET /me/agenda/changes); Home says it
 * was seen a few seconds after it is shown (POST /me/agenda/seen), and the
 * marks stay on screen until the next fetch — the next visit. The rows tie
 * themselves to the answer by their agenda ids (lib/home-changes.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { meApi } from "../lib/api";
import {
  beforeBits,
  changesFor,
  removedAhead,
  type AgendaChange,
  type AgendaChanges,
} from "../lib/home-changes";

export const AGENDA_CHANGES_KEY = ["me", "agenda-changes"] as const;

/** Seconds Home is on screen before it counts as seen. */
const SEEN_AFTER_MS = 3000;

/**
 * The changes since Home was last seen. Fetched once and kept for ten
 * minutes: Home says «seen» right after showing them, and a refetch on every
 * tab switch would take the marks away while the person is still reading.
 */
export function useAgendaChanges(enabled = true) {
  return useQuery({
    queryKey: AGENDA_CHANGES_KEY,
    queryFn: () => meApi.agendaChanges(),
    enabled,
    staleTime: 10 * 60_000,
    // An older server has no such route: no marks, no retries.
    retry: false,
  });
}

/**
 * Home was on screen with its marks: tell the server, once per answer. Only
 * when the answer came (a failed fetch must not wipe what was never shown)
 * and Home itself is loaded and in front.
 */
export function useMarkSeen(homeReady: boolean) {
  const q = useAgendaChanges();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const done = useRef<number | null>(null);
  const seen = useMutation({ mutationFn: () => meApi.agendaSeen() });
  const { mutate } = seen;
  const stamp = q.isSuccess ? q.dataUpdatedAt : null;
  useEffect(() => {
    if (!focused || !homeReady || stamp === null || done.current === stamp) return;
    const timer = setTimeout(() => {
      done.current = stamp;
      mutate();
    }, SEEN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [focused, homeReady, stamp, mutate]);
}

function dayAndHour(dateISO: string, start: string | null, loc: string): string {
  const day = new Date(`${dateISO}T00:00:00`).toLocaleDateString(loc, {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  return start ? `${day} · ${start}` : day;
}

/** «ср, 11 ноября · 19:00 · напарник Тимо Ланг» — what it was, only what changed. */
export function beforeText(c: AgendaChange, t: TFunction, loc: string): string | null {
  const b = beforeBits(c);
  if (!b) return null;
  const bits: string[] = [];
  if (b.date) bits.push(dayAndHour(b.date, b.start, loc));
  else if (b.start) bits.push(b.start);
  if (b.title) bits.push(`«${b.title}»`);
  if (b.with) {
    bits.push(
      b.with.length === 0
        ? t("home.changes.noPartner")
        : t(b.with.length > 1 ? "home.changes.partners" : "home.changes.partner", {
            names: b.with.join(", "),
          }),
    );
  }
  if (b.place !== null) {
    bits.push(b.place ? t("home.changes.place", { place: b.place }) : t("home.changes.noPlace"));
  }
  return bits.length ? bits.join(" · ") : null;
}

/**
 * The mark inside a row. Changed ones say what was; one line each, the same
 * line once (a moved meeting moves every part of his in it). A row with only
 * new assignments gets the small «новое».
 */
export function ChangeMark({
  ids,
  style,
}: {
  ids: (string | null | undefined)[];
  style?: StyleProp<ViewStyle>;
}) {
  const { t, i18n } = useTranslation();
  const { data } = useAgendaChanges();
  const mine = changesFor(ids, data);
  if (mine.length === 0) return null;
  const changed = mine.filter((c) => c.kind === "changed");
  if (changed.length === 0) {
    return (
      <View style={[s.newWrap, style]}>
        <Text style={s.newText}>{t("home.changes.new")}</Text>
      </View>
    );
  }
  const lines = [
    ...new Set(changed.map((c) => beforeText(c, t, i18n.language)).filter(Boolean)),
  ] as string[];
  return (
    <View style={[s.changed, style]} accessibilityRole="text">
      <Ionicons name="swap-horizontal" size={14} color="#78350f" style={{ marginTop: 2 }} />
      <Text style={s.changedText}>
        <Text style={s.changedHead}>{t("home.changes.changed")}</Text>
        {lines.slice(0, 2).map((l) => (
          <Text key={l}>
            {" · "}
            {t("home.changes.was", { what: l })}
          </Text>
        ))}
      </Text>
    </View>
  );
}

/** «Снято с вас»: assignments taken away that were still ahead. */
export function RemovedCard({
  todayISO,
  data,
}: {
  todayISO: string;
  data: AgendaChanges | undefined;
}) {
  const { t, i18n } = useTranslation();
  const gone = removedAhead(data, todayISO);
  if (gone.length === 0) return null;
  return (
    <View style={s.removed}>
      <Text style={s.removedTitle} accessibilityRole="header">
        {t("home.changes.removedTitle")}
      </Text>
      {gone.slice(0, 4).map((r) => (
        <Text key={r.id} style={s.removedLine}>
          <Text style={s.removedWhen}>{dayAndHour(r.date, r.start, i18n.language)}</Text>
          {" · "}
          <Text style={s.removedWhat}>{r.title}</Text>
        </Text>
      ))}
      <Text style={s.removedHint}>{t("home.changes.removedHint")}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  changed: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 9,
    maxWidth: "100%",
  },
  changedText: { flexShrink: 1, color: "#78350f", fontSize: 13.5, lineHeight: 19, fontFamily: "Manrope_600SemiBold" },
  changedHead: { fontFamily: "Manrope_800ExtraBold" },
  newWrap: {
    alignSelf: "flex-start",
    marginTop: 5,
    backgroundColor: "#fde68a",
    borderRadius: 999,
    paddingVertical: 1,
    paddingHorizontal: 8,
  },
  newText: { color: "#78350f", fontSize: 12, fontFamily: "Manrope_800ExtraBold" },
  removed: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 14,
    padding: 12,
  },
  removedTitle: { color: "#78350f", fontSize: 14, fontFamily: "Manrope_800ExtraBold", marginBottom: 4 },
  removedLine: { color: "#78350f", fontSize: 14.5, lineHeight: 21, fontFamily: "Manrope_500Medium" },
  removedWhen: { fontFamily: "Manrope_700Bold" },
  removedWhat: { textDecorationLine: "line-through" },
  removedHint: { color: "#92400e", fontSize: 12.5, marginTop: 4, fontFamily: "Manrope_500Medium" },
});
