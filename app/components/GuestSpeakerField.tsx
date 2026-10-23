import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { talkExchangeApi, visitingSpeakersApi } from "../lib/api";
import { likelySameName } from "../lib/similar-names";
import { useMayOpen } from "../lib/useMayOpen";

/**
 * The guest of a weekend in the programme form (mockups 10–12, approved by
 * Lionel on 23 October 2026).
 *
 * The journal «К нам» owns who speaks; the line shows it. So a guest who is
 * there is shown as his journal entry — one record for the coordinator and
 * whoever makes the programme — and is changed through it. An empty line is
 * filled by FINDING the guest in the directory: nothing is saved while the
 * name is typed (the form used to save every few letters, and «Ив» became a
 * card). A new brother is saved once, by a button, after «is this him?»
 * where the directory holds a name that looks like his.
 */
export function GuestSpeakerField({
  name,
  congregation,
  talkExchangeId,
  canReplace,
  onPick,
  onNew,
  onReplace,
}: {
  name: string | null;
  congregation: string | null;
  talkExchangeId: string | null;
  /** Those who answer for the talks: «a different speaker came». */
  canReplace: boolean;
  onPick: (cardId: string) => void;
  onNew: (fullName: string, congregation: string | null) => void;
  onReplace: () => void;
}) {
  const { t } = useTranslation();
  const mayOpen = useMayOpen();
  const [choosing, setChoosing] = useState(false);
  const [search, setSearch] = useState("");
  const [newCong, setNewCong] = useState("");
  const [creating, setCreating] = useState(false);
  const [notHim, setNotHim] = useState(false);

  const speakers = useQuery({
    queryKey: ["visiting-speakers"],
    queryFn: () => visitingSpeakersApi.list(),
  });
  const entry = useQuery({
    queryKey: ["talk-exchange", "entry", talkExchangeId],
    queryFn: () => talkExchangeApi.get(talkExchangeId!),
    enabled: !!talkExchangeId && !!name && !choosing,
  });

  const cards = useMemo(
    () =>
      (speakers.data ?? [])
        .filter((s) => !s.mergedIntoId)
        .map((s) => ({
          id: s.id,
          name: [s.firstName, s.lastName].filter(Boolean).join(" "),
          cong: s.externalCongregation?.name ?? null,
          talks: [...(s.talkNumbers ?? [])].sort((a, b) => a - b),
          overseer: !!s.circuitOverseer,
        })),
    [speakers.data],
  );
  const typed = search.trim();
  const low = typed.toLowerCase();
  const hits =
    low.length < 2
      ? []
      : cards
          .filter(
            (c) =>
              c.name.toLowerCase().includes(low) ||
              (c.cong ?? "").toLowerCase().includes(low),
          )
          .slice(0, 6);
  const fullName = typed.split(/\s+/).length >= 2;
  const lookalike =
    creating && !notHim
      ? cards.find((c) => likelySameName(c.name, typed)) ?? null
      : null;

  // ── a guest is there: his entry ─────────────────────────────────────────
  if (name && !choosing) {
    const e = entry.data;
    return (
      <View style={s.card}>
        <View style={s.cardHead}>
          <Ionicons name="book-outline" size={16} color="#0369a1" />
          <Text style={s.overline}>
            {talkExchangeId ? t("guestField.fromJournal") : t("guestField.inProgramme")}
          </Text>
          {e?.meetingCancelled ? (
            <Text style={[s.badge, s.badgeGrey]}>{t("guestField.cancelled")}</Text>
          ) : e?.status === "confirmed" ? (
            <Text style={[s.badge, s.badgeGreen]}>{t("guestField.confirmed")}</Text>
          ) : e?.status === "tentative" ? (
            <Text style={[s.badge, s.badgeAmber]}>{t("guestField.tentative")}</Text>
          ) : null}
        </View>
        <Text style={s.name}>{name}</Text>
        {congregation ? <Text style={s.sub}>{congregation}</Text> : null}
        {e?.note ? (
          <Text style={s.note} numberOfLines={3}>
            {e.note}
          </Text>
        ) : null}
        <View style={s.actions}>
          <Pressable
            style={s.btnLine}
            onPress={() => {
              setChoosing(true);
              setSearch("");
              setCreating(false);
            }}
            accessibilityRole="button"
          >
            <Text style={s.btnLineText}>{t("guestField.choose")}</Text>
          </Pressable>
          {canReplace ? (
            <Pressable style={s.btnLine} onPress={onReplace} accessibilityRole="button">
              <Text style={s.btnLineText}>{t("guestField.replace")}</Text>
            </Pressable>
          ) : null}
          {talkExchangeId && mayOpen("/talk-coordinator/log") ? (
            <Pressable
              style={s.btnLine}
              onPress={() =>
                router.push({
                  pathname: "/talk-coordinator/log",
                  params: { entry: talkExchangeId },
                } as never)
              }
              accessibilityRole="button"
            >
              <Text style={s.btnLineText}>{t("guestField.openEntry")}</Text>
            </Pressable>
          ) : null}
        </View>
        {talkExchangeId ? <Text style={s.hint}>{t("guestField.oneRecord")}</Text> : null}
      </View>
    );
  }

  // ── a new brother, once, by a button ────────────────────────────────────
  if (creating) {
    return (
      <View style={{ gap: 10 }}>
        {lookalike ? (
          <View style={s.ask}>
            <Text style={s.askTitle}>{t("guestField.isItHim")}</Text>
            <Text style={s.askBody}>{t("guestField.isItHimBody", { typed })}</Text>
            <View style={s.askCard}>
              <Text style={s.name}>{lookalike.name}</Text>
              {lookalike.cong ? <Text style={s.sub}>{lookalike.cong}</Text> : null}
            </View>
            <View style={s.actions}>
              <Pressable
                style={[s.btn, s.btnAmber]}
                onPress={() => {
                  onPick(lookalike.id);
                  setChoosing(false);
                  setCreating(false);
                }}
                accessibilityRole="button"
              >
                <Text style={s.btnText}>{t("guestField.yesHim")}</Text>
              </Pressable>
              <Pressable style={s.btnLineAmber} onPress={() => setNotHim(true)} accessibilityRole="button">
                <Text style={s.btnLineAmberText}>{t("guestField.notHim")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <Text style={s.label}>{t("guestField.newName")}</Text>
        <TextInput style={s.input} value={typed} editable={false} />
        <Text style={s.label}>{t("guestField.newCong")}</Text>
        <TextInput
          style={s.input}
          value={newCong}
          onChangeText={setNewCong}
          placeholder={t("guestField.newCongPlaceholder")}
          placeholderTextColor="#94a3b8"
        />
        <Pressable
          style={[s.btn, !!lookalike && s.btnOff]}
          disabled={!!lookalike}
          onPress={() => {
            onNew(typed, newCong.trim() || null);
            setChoosing(false);
            setCreating(false);
          }}
          accessibilityRole="button"
        >
          <Text style={s.btnText}>{t("guestField.saveNew")}</Text>
        </Pressable>
        <Pressable onPress={() => setCreating(false)} hitSlop={6}>
          <Text style={s.link}>{t("guestField.back")}</Text>
        </Pressable>
      </View>
    );
  }

  // ── find him ────────────────────────────────────────────────────────────
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{t("guestField.whoComes")}</Text>
      <View style={s.searchBox}>
        <Ionicons name="search" size={18} color="#0e7490" />
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t("guestField.searchPlaceholder")}
          placeholderTextColor="#94a3b8"
          autoFocus={choosing}
        />
      </View>
      {hits.map((c) => (
        <Pressable
          key={c.id}
          style={s.row}
          onPress={() => {
            onPick(c.id);
            setChoosing(false);
          }}
          accessibilityRole="button"
        >
          <View style={{ flex: 1 }}>
            <Text style={s.rowName}>{c.name}</Text>
            <Text style={s.sub}>
              {[
                c.cong,
                c.talks.length
                  ? t("quickReplace.talks", { list: c.talks.map((n) => `№${n}`).join(", ") })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#0e7490" />
        </Pressable>
      ))}
      {low.length >= 2 ? (
        <Pressable
          style={[s.row, !fullName && s.rowOff]}
          disabled={!fullName}
          onPress={() => {
            setNotHim(false);
            setCreating(true);
          }}
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={22} color={fullName ? "#0e7490" : "#94a3b8"} />
          <View style={{ flex: 1 }}>
            <Text style={[s.rowName, { color: fullName ? "#0e7490" : "#94a3b8" }]}>
              {t("guestField.newSpeaker", { name: typed })}
            </Text>
            <Text style={s.sub}>
              {fullName ? t("guestField.newSpeakerHint") : t("guestField.needFullName")}
            </Text>
          </View>
        </Pressable>
      ) : null}
      <Text style={s.hint}>{t("guestField.nothingSaved")}</Text>
      {choosing ? (
        <Pressable onPress={() => setChoosing(false)} hitSlop={6}>
          <Text style={s.link}>{t("common.cancel")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff",
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  overline: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 11,
    letterSpacing: 0.6,
    color: "#0369a1",
    flex: 1,
  },
  badge: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 11,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: "hidden",
  },
  badgeGreen: { color: "#15803d", backgroundColor: "#dcfce7" },
  badgeAmber: { color: "#a16207", backgroundColor: "#fef9c3" },
  badgeGrey: { color: "#ffffff", backgroundColor: "#64748b" },
  name: { fontFamily: "Manrope_800ExtraBold", fontSize: 17, color: "#0f172a" },
  rowName: { fontFamily: "Manrope_700Bold", fontSize: 15, color: "#0f172a" },
  sub: { fontFamily: "Manrope_400Regular", fontSize: 13, color: "#64748b" },
  note: { fontFamily: "Manrope_400Regular", fontSize: 13, color: "#334155" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  btn: {
    backgroundColor: "#0e7490",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  btnOff: { backgroundColor: "#cbd5e1" },
  btnAmber: { backgroundColor: "#ca8a04" },
  btnText: { fontFamily: "Manrope_700Bold", fontSize: 14, color: "#ffffff" },
  btnLine: {
    borderWidth: 1,
    borderColor: "#a5f3fc",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: "center",
  },
  btnLineText: { fontFamily: "Manrope_700Bold", fontSize: 13, color: "#0e7490" },
  btnLineAmber: {
    borderWidth: 1,
    borderColor: "#ca8a04",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 44,
    justifyContent: "center",
  },
  btnLineAmberText: { fontFamily: "Manrope_700Bold", fontSize: 14, color: "#854d0e" },
  hint: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#64748b", lineHeight: 17 },
  label: { fontFamily: "Manrope_700Bold", fontSize: 13, color: "#475569" },
  input: {
    fontFamily: "Manrope_400Regular",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: "#0f172a",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 2,
    borderColor: "#0e7490",
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontFamily: "Manrope_400Regular", fontSize: 16, paddingVertical: 10, color: "#0f172a" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 52,
    backgroundColor: "#ffffff",
  },
  rowOff: { backgroundColor: "#fafafa" },
  ask: {
    backgroundColor: "#fefce8",
    borderWidth: 1,
    borderColor: "#facc15",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  askTitle: { fontFamily: "Manrope_800ExtraBold", fontSize: 15, color: "#713f12" },
  askBody: { fontFamily: "Manrope_400Regular", fontSize: 13, color: "#854d0e" },
  askCard: { backgroundColor: "#ffffff", borderRadius: 10, padding: 10 },
  link: { fontFamily: "Manrope_700Bold", fontSize: 14, color: "#0e7490" },
});
