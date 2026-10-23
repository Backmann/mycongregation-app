import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useTranslation } from "react-i18next";
import { Sheet } from "./Sheet";
import {
  extractErrorMessage,
  publicTalksApi,
  talkExchangeApi,
  visitingSpeakersApi,
} from "../lib/api";
import { useAllPublishers } from "../lib/useAllPublishers";

/**
 * «Приехал другой докладчик» — in a minute, on the meeting day
 * (Lionel, 23 October 2026: «это все решается буквально за минуты»).
 *
 * Two questions on one screen and nothing else: who speaks, and on what.
 * The brother is found by a few letters — a guest from the directory, or one
 * of ours; nobody in the list, his name is enough, and the rest of his card
 * can wait. His talks stand as buttons; another number is typed and its
 * title shows at once. The button says the whole outcome before it is
 * pressed, and «seen on every screen» only after the server has it.
 *
 * The replacement itself is the server's one action (talk-exchange
 * replace-speaker): the first visit stays in history as «did not happen»,
 * the host family moves to the guest who came, the programme line changes
 * at once, and the meeting screens read it within two seconds.
 */
type Pick =
  | { kind: "card"; id: string; name: string; talks: number[] }
  | { kind: "ours"; id: string; name: string }
  | { kind: "typed" };

export function QuickReplaceSheet({
  visible,
  weekStartDate,
  currentName,
  onClose,
  onDone,
}: {
  visible: boolean;
  weekStartDate: string;
  /** Who the programme names now — he is the one marked «did not come». */
  currentName: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [typedName, setTypedName] = useState("");
  const [talkNumber, setTalkNumber] = useState<number | null>(null);
  const [otherNumber, setOtherNumber] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSearch("");
    setPick(null);
    setTypedName("");
    setTalkNumber(null);
    setOtherNumber("");
    setOtherOpen(false);
    setDone(false);
  }, [visible]);

  const speakers = useQuery({
    queryKey: ["visiting-speakers"],
    queryFn: () => visitingSpeakersApi.list(),
    enabled: visible,
  });
  const publishers = useAllPublishers({ enabled: visible });
  const talks = useQuery({
    queryKey: ["public-talks", "all-for-picker"],
    queryFn: () => publicTalksApi.list({ limit: 500, includeInactive: true }),
    enabled: visible,
    staleTime: 60 * 60 * 1000,
  });
  const talkByNumber = useMemo(() => {
    const m = new Map<number, { id: string; title: string }>();
    for (const x of talks.data?.data ?? []) m.set(x.number, x);
    return m;
  }, [talks.data]);

  const typed = search.trim().toLowerCase();
  const current = (currentName ?? "").trim().toLowerCase();
  const found = useMemo(() => {
    if (typed.length < 2) return [];
    const guests = (speakers.data ?? [])
      .filter((s) => !s.mergedIntoId)
      .map((s) => ({
        kind: "card" as const,
        id: s.id,
        name: [s.firstName, s.lastName].filter(Boolean).join(" "),
        sub: s.externalCongregation?.name ?? null,
        talks: [...(s.talkNumbers ?? [])].sort((a, b) => a - b),
      }));
    const ours = (publishers.data?.data ?? [])
      .filter((p) => !!p.capabilities?.public_talk_speaker)
      .map((p) => ({
        kind: "ours" as const,
        id: p.id,
        name: [p.firstName, p.lastName].filter(Boolean).join(" "),
        sub: null,
        talks: [] as number[],
      }));
    return [...guests, ...ours]
      .filter((x) => x.name.toLowerCase() !== current)
      .filter(
        (x) =>
          x.name.toLowerCase().includes(typed) ||
          (x.sub ?? "").toLowerCase().includes(typed),
      )
      .slice(0, 6);
  }, [typed, current, speakers.data, publishers.data]);

  const whoName =
    pick?.kind === "typed"
      ? typedName.trim()
      : pick
        ? pick.name
        : "";
  const ready =
    pick?.kind === "typed" ? typedName.trim().split(/\s+/).length >= 2 : !!pick;
  const number =
    talkNumber ??
    (otherOpen && /^\d{1,3}$/.test(otherNumber) ? Number(otherNumber) : null);
  const talk = number != null ? talkByNumber.get(number) ?? null : null;

  const replace = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      talkExchangeApi.replaceSpeaker({
        weekStartDate,
        ...(pick?.kind === "card"
          ? { visitingSpeakerId: pick.id }
          : pick?.kind === "ours"
            ? { publisherId: pick.id }
            : { speakerName: typedName.trim() }),
        ...(talk ? { publicTalkId: talk.id } : {}),
      }),
    onSuccess: () => {
      setDone(true);
      void qc.invalidateQueries({ queryKey: ["conduct-assignments"] });
      void qc.invalidateQueries({ queryKey: ["assignments"] });
      void qc.invalidateQueries({ queryKey: ["talk-exchange"] });
      void qc.invalidateQueries({ queryKey: ["visiting-speakers"] });
      onDone?.();
      setTimeout(onClose, 1600);
    },
  });
  // No answer at all — the hall's Wi-Fi — is said as such, with a retry.
  const offline =
    replace.error instanceof AxiosError && !replace.error.response;

  const chips = pick?.kind === "card" ? pick.talks : [];

  return (
    <Sheet
      visible={visible}
      title={t("quickReplace.title")}
      onClose={onClose}
      closeLabel={t("common.cancel")}
      variant="bottom"
    >
      {done ? (
        <View style={s.doneBox}>
          <Ionicons name="checkmark-circle" size={28} color="#15803d" />
          <Text style={s.doneText}>{t("quickReplace.done")}</Text>
        </View>
      ) : (
        <View style={s.body}>
          <Text style={s.step}>{t("quickReplace.who")}</Text>
          {pick && pick.kind !== "typed" ? (
            <Pressable
              style={[s.row, s.rowOn]}
              onPress={() => {
                setPick(null);
                setTalkNumber(null);
              }}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{pick.name}</Text>
                <Text style={s.rowSub}>
                  {pick.kind === "ours"
                    ? t("quickReplace.ours")
                    : t("quickReplace.change")}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color="#0e7490" />
            </Pressable>
          ) : pick?.kind === "typed" ? (
            <View style={{ gap: 6 }}>
              <TextInput
                style={s.input}
                value={typedName}
                onChangeText={setTypedName}
                placeholder={t("quickReplace.namePlaceholder")}
                placeholderTextColor="#94a3b8"
                autoFocus
                autoCapitalize="words"
              />
              <Text style={s.hint}>{t("quickReplace.nameHint")}</Text>
              <Pressable onPress={() => setPick(null)} hitSlop={6}>
                <Text style={s.link}>{t("quickReplace.backToSearch")}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              <View style={s.searchBox}>
                <Ionicons name="search" size={18} color="#0e7490" />
                <TextInput
                  style={s.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t("quickReplace.searchPlaceholder")}
                  placeholderTextColor="#94a3b8"
                  autoFocus
                />
              </View>
              {found.map((x) => (
                <Pressable
                  key={`${x.kind}-${x.id}`}
                  style={s.row}
                  onPress={() =>
                    setPick(
                      x.kind === "card"
                        ? { kind: "card", id: x.id, name: x.name, talks: x.talks }
                        : { kind: "ours", id: x.id, name: x.name },
                    )
                  }
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName}>{x.name}</Text>
                    <Text style={s.rowSub}>
                      {x.kind === "ours"
                        ? t("quickReplace.ours")
                        : [
                            x.sub,
                            x.talks.length
                              ? t("quickReplace.talks", {
                                  list: x.talks.map((n) => `№${n}`).join(", "),
                                })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </Text>
                  </View>
                </Pressable>
              ))}
              <Pressable
                style={s.row}
                onPress={() => {
                  setPick({ kind: "typed" });
                  setTypedName(search.trim());
                }}
                accessibilityRole="button"
              >
                <Ionicons name="add-circle-outline" size={22} color="#0e7490" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowName, { color: "#0e7490" }]}>
                    {t("quickReplace.notListed")}
                  </Text>
                  <Text style={s.rowSub}>{t("quickReplace.notListedHint")}</Text>
                </View>
              </Pressable>
            </View>
          )}

          <Text style={s.step}>{t("quickReplace.talk")}</Text>
          <View style={s.chips}>
            {chips.map((n) => {
              const on = talkNumber === n;
              return (
                <Pressable
                  key={n}
                  style={[s.chip, on && s.chipOn]}
                  onPress={() => {
                    setTalkNumber(on ? null : n);
                    setOtherOpen(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[s.chipText, on && s.chipTextOn]}>№{n}</Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[s.chip, s.chipDashed, otherOpen && s.chipOn]}
              onPress={() => {
                setOtherOpen(true);
                setTalkNumber(null);
              }}
              accessibilityRole="button"
            >
              <Text style={[s.chipText, otherOpen && s.chipTextOn]}>
                {t("quickReplace.otherNumber")}
              </Text>
            </Pressable>
          </View>
          {otherOpen ? (
            <TextInput
              style={s.input}
              value={otherNumber}
              onChangeText={(v) => setOtherNumber(v.replace(/\D/g, "").slice(0, 3))}
              placeholder="№"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              autoFocus
            />
          ) : null}
          <Text style={s.talkLine}>
            {talk
              ? `№${number} · «${talk.title}»`
              : number != null
                ? t("quickReplace.noSuchTalk", { n: number })
                : t("quickReplace.keepTalk")}
          </Text>

          {ready ? (
            <View style={s.outcome}>
              <Text style={s.outcomeHead}>{t("quickReplace.outcome")}</Text>
              {currentName ? (
                <Text style={s.outcomeLine}>
                  • {t("quickReplace.outcomeMissed", { name: currentName })}
                </Text>
              ) : null}
              <Text style={s.outcomeLine}>• {t("quickReplace.outcomeHost")}</Text>
              <Text style={s.outcomeLine}>• {t("quickReplace.outcomeScreens")}</Text>
            </View>
          ) : null}

          {replace.isError ? (
            <Text style={s.error}>
              {offline
                ? t("quickReplace.offline")
                : extractErrorMessage(replace.error)}
            </Text>
          ) : null}

          <Pressable
            style={[s.confirm, (!ready || replace.isPending) && s.confirmOff]}
            disabled={!ready || replace.isPending}
            onPress={() => replace.mutate()}
            accessibilityRole="button"
          >
            {replace.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.confirmText}>
                {ready
                  ? replace.isError
                    ? t("quickReplace.retry")
                    : number != null && talk
                      ? t("quickReplace.confirmWithTalk", { name: whoName, n: number })
                      : t("quickReplace.confirm", { name: whoName })
                  : t("quickReplace.confirmEmpty")}
              </Text>
            )}
          </Pressable>
          <Text style={s.hint}>{t("quickReplace.undoHint")}</Text>
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  body: { gap: 10, paddingBottom: 8 },
  step: {
    fontSize: 13,
    fontFamily: "Manrope_800ExtraBold",
    letterSpacing: 0.4,
    color: "#0e7490",
    marginTop: 4,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 2,
    borderColor: "#0e7490",
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  searchInput: { fontFamily: "Manrope_400Regular", flex: 1, fontSize: 17, paddingVertical: 10, color: "#0f172a" },
  input: { fontFamily: "Manrope_400Regular",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: "#0f172a",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowOn: { backgroundColor: "#ecfeff", borderColor: "#67e8f9" },
  rowName: { fontSize: 16, fontFamily: "Manrope_700Bold", color: "#0f172a" },
  rowSub: { fontFamily: "Manrope_400Regular", fontSize: 13, color: "#64748b", marginTop: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  chipDashed: { borderStyle: "dashed", borderColor: "#94a3b8" },
  chipOn: { backgroundColor: "#0e7490", borderColor: "#0e7490" },
  chipText: { fontSize: 15, fontFamily: "Manrope_800ExtraBold", color: "#334155" },
  chipTextOn: { color: "#ffffff" },
  talkLine: { fontFamily: "Manrope_400Regular",
    fontSize: 14,
    color: "#334155",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  outcome: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 12,
    gap: 3,
  },
  outcomeHead: { fontSize: 13, fontFamily: "Manrope_800ExtraBold", color: "#475569" },
  outcomeLine: { fontFamily: "Manrope_400Regular", fontSize: 13, color: "#475569", lineHeight: 19 },
  error: { fontFamily: "Manrope_400Regular", fontSize: 14, color: "#b91c1c" },
  confirm: {
    backgroundColor: "#ea580c",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: 54,
    justifyContent: "center",
  },
  confirmOff: { backgroundColor: "#cbd5e1" },
  confirmText: { color: "#ffffff", fontSize: 17, fontFamily: "Manrope_800ExtraBold" },
  hint: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#64748b", textAlign: "center" },
  link: { fontSize: 14, fontFamily: "Manrope_700Bold", color: "#0e7490" },
  doneBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#dcfce7",
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  doneText: { fontSize: 16, fontFamily: "Manrope_800ExtraBold", color: "#14532d", flex: 1 },
});
