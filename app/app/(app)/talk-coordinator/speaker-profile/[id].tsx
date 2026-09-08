import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import {
  PublicTalk,
  publicTalksApi,
  talkExchangeApi,
  visitingSpeakersApi,
} from "../../../../lib/api";
import {
  computeSpeakerStats,
  SpeakerVisit,
  visitedRecently,
} from "../../../../lib/speaker-stats";
import { formatRelativeDay } from "../../../../lib/relative-time";
import { Dialog } from "../../../../components/Dialog";

const todayISO = () => new Date().toLocaleDateString("en-CA");

export default function SpeakerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();

  const speakersQuery = useQuery({
    queryKey: ["visiting-speakers"],
    queryFn: () => visitingSpeakersApi.list(),
  });
  const entriesQuery = useQuery({
    queryKey: ["talk-exchange"],
    queryFn: () => talkExchangeApi.list(),
  });
  const talksQuery = useQuery({
    queryKey: ["public-talks", "all"],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });

  const speaker = (speakersQuery.data ?? []).find((s) => s.id === id) ?? null;

  /** Имя для показа — как в списке справочника. */
  const speakerName = (x: { firstName: string; lastName: string | null }) =>
    [x.firstName, x.lastName].filter(Boolean).join(" ");

  /**
   * Сколько раз он у нас был — считаем прямо здесь, из уже загруженных
   * записей. Полные подсчёты для каждой карточки в списке слияния были бы
   * дороже смысла: нужно одно число рядом с именем.
   */
  const visitsOf = (speakerId: string) =>
    (entriesQuery.data ?? []).filter(
      (e) =>
        e.direction === "incoming" &&
        e.visitingSpeakerId === speakerId &&
        e.status !== "did_not_happen",
    ).length;

  const qc = useQueryClient();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergePick, setMergePick] = useState<string | null>(null);

  /**
   * Кого предлагать в пару — все, кроме него самого.
   *
   * Поиск, а не весь справочник: двойника ищут по знакомой фамилии, и список
   * из тридцати карточек только мешает. Совпадения ищутся и по имени, и по
   * собранию — «Rotariuk» человек может помнить именно по Dortmund-Russisch.
   */
  const mergeCandidates = useMemo(() => {
    const q = mergeSearch.trim().toLowerCase();
    const all = (speakersQuery.data ?? []).filter((c) => c.id !== id);
    if (q.length < 2) return all.slice(0, 5);
    return all
      .filter(
        (c) =>
          speakerName(c).toLowerCase().includes(q) ||
          (c.externalCongregation?.name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [speakersQuery.data, mergeSearch, id]);

  const mergeMutation = useMutation({
    mutationFn: () => visitingSpeakersApi.merge(String(id), mergePick!),
    onSuccess: () => {
      setMergeOpen(false);
      setMergePick(null);
      setMergeSearch("");
      void qc.invalidateQueries({ queryKey: ["visiting-speakers"] });
      void qc.invalidateQueries({ queryKey: ["talk-exchange"] });
    },
  });

  /**
   * Which of his talks are no longer to be given — from the query this screen
   * already makes, rather than a second one for the same rows.
   *
   * His repertoire is a list of bare numbers, so a retired talk looked exactly
   * like any other, and inviting a brother with a talk that must not be given
   * is a telephone call nobody wants to make twice.
   */
  const retired = useMemo(
    () =>
      new Map(
        (talksQuery.data?.data ?? [])
          .filter((tk) => !tk.isActive)
          .map((tk) => [tk.number, tk.retiredFrom ?? null]),
      ),
    [talksQuery.data],
  );

  const talkById = useMemo(() => {
    const m = new Map<string, PublicTalk>();
    for (const tk of talksQuery.data?.data ?? []) m.set(tk.id, tk);
    return m;
  }, [talksQuery.data]);

  const today = todayISO();
  const stats = useMemo(
    () =>
      speaker
        ? computeSpeakerStats(speaker, entriesQuery.data ?? [], talkById, today)
        : null,
    [speaker, entriesQuery.data, talkById, today],
  );

  const loading =
    speakersQuery.isLoading || entriesQuery.isLoading || talksQuery.isLoading;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!speaker || !stats) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          {t("talkCoordinator.speakerProfile.notFound")}
        </Text>
      </View>
    );
  }

  const name = [speaker.firstName, speaker.lastName].filter(Boolean).join(" ");
  const recent = visitedRecently(stats, today);
  const phone = speaker.phone;

  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const avgLabel =
    stats.avgIntervalDays == null
      ? null
      : stats.avgIntervalDays < 14
        ? t("relative.d", { n: stats.avgIntervalDays })
        : stats.avgIntervalDays < 60
          ? t("relative.w", { n: Math.round(stats.avgIntervalDays / 7) })
          : t("relative.mo", { n: Math.round(stats.avgIntervalDays / 30.44) });

  const renderVisit = (v: SpeakerVisit) => (
    <View key={v.id} style={styles.visitRow}>
      <View style={styles.visitDateCol}>
        <Text style={styles.visitDate}>{fmtDate(v.date)}</Text>
        <Text style={styles.visitRel}>
          {formatRelativeDay(v.date, today, t)}
        </Text>
      </View>
      <View style={styles.visitTalkCol}>
        {v.talkNumber != null ? (
          <Text style={styles.visitTalk} numberOfLines={2}>
            <Text style={styles.visitNum}>№{v.talkNumber}</Text>
            {v.talkTitle ? ` — ${v.talkTitle}` : ""}
          </Text>
        ) : (
          <Text style={styles.visitTalkMuted}>
            {t("talkCoordinator.speakerProfile.noTalk")}
          </Text>
        )}
        {v.tentative ? (
          <Text style={styles.tentative}>
            {t("talkCoordinator.speakerProfile.tentative")}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.card}>
        <Text style={styles.name}>{name}</Text>
        {speaker.externalCongregation ? (
          <Text style={styles.cong}>{speaker.externalCongregation.name}</Text>
        ) : null}
        {phone ? (
          <Pressable
            style={styles.phoneRow}
            onPress={() => void Linking.openURL(`tel:${phone}`)}
          >
            <Ionicons name="call-outline" size={15} color="#0369a1" />
            <Text style={styles.phone}>{phone}</Text>
          </Pressable>
        ) : null}
        {speaker.note ? <Text style={styles.note}>{speaker.note}</Text> : null}
      </View>

      {/* Stats band */}
      <View style={[styles.statsBand, recent && styles.statsBandRecent]}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{stats.count}</Text>
          <Text style={styles.statLabel}>
            {t("talkCoordinator.speakerProfile.timesHere")}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statText, recent && styles.statTextRecent]}>
            {stats.lastVisit
              ? formatRelativeDay(stats.lastVisit.date, today, t)
              : t("talkCoordinator.speakerProfile.never")}
          </Text>
          <Text style={styles.statLabel}>
            {t("talkCoordinator.speakerProfile.lastTime")}
          </Text>
        </View>
        {avgLabel ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statText}>~{avgLabel}</Text>
              <Text style={styles.statLabel}>
                {t("talkCoordinator.speakerProfile.avgInterval")}
              </Text>
            </View>
          </>
        ) : null}
      </View>
      {recent ? (
        <View style={styles.recentWarn}>
          <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
          <Text style={styles.recentWarnText}>
            {t("talkCoordinator.speakerProfile.recentWarning")}
          </Text>
        </View>
      ) : null}

      {/* Upcoming */}
      <Text style={styles.sectionTitle}>
        {t("talkCoordinator.speakerProfile.upcoming")}
      </Text>
      <View style={styles.card}>
        {stats.futureVisits.length === 0 ? (
          <Text style={styles.sectionEmpty}>
            {t("talkCoordinator.speakerProfile.noUpcoming")}
          </Text>
        ) : (
          stats.futureVisits.map(renderVisit)
        )}
      </View>

      {/* History */}
      <Text style={styles.sectionTitle}>
        {t("talkCoordinator.speakerProfile.history")}
      </Text>
      <View style={styles.card}>
        {stats.pastVisits.length === 0 ? (
          <Text style={styles.sectionEmpty}>
            {t("talkCoordinator.speakerProfile.noHistory")}
          </Text>
        ) : (
          stats.pastVisits.map(renderVisit)
        )}
      </View>

      {/*
        Назначался и не приехал.
        Отдельной полосой, а не вперемешку с визитами: в счёт это не идёт, но
        и молчать нельзя — по этому решают, звать ли снова.
      */}
      {stats.missedVisits.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>
            {t("talkCoordinator.speakerProfile.missed")}
          </Text>
          <View style={styles.card}>{stats.missedVisits.map(renderVisit)}</View>
        </>
      ) : null}

      {/* Repertoire */}
      {speaker.talkNumbers.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>
            {t("talkCoordinator.speakerProfile.repertoire")}
          </Text>
          <View style={styles.card}>
            <View style={styles.chipWrap}>
              {[...speaker.talkNumbers]
                .sort((a, b) => a - b)
                .map((n) => {
                  const given = stats.givenTalkNumbers.has(n);
                  const isRetired = retired.has(n);
                  return (
                    <View
                      key={n}
                      style={[
                        styles.talkChip,
                        given && styles.talkChipGiven,
                        isRetired && styles.talkChipRetired,
                      ]}
                    >
                      {isRetired ? (
                        <Ionicons
                          name="close-circle"
                          size={12}
                          color="#b45309"
                        />
                      ) : null}
                      {given ? (
                        <Ionicons name="checkmark" size={12} color="#94a3b8" />
                      ) : null}
                      <Text
                        style={[
                          styles.talkChipText,
                          given && styles.talkChipTextGiven,
                          isRetired && styles.talkChipTextRetired,
                        ]}
                      >
                        №{n}
                      </Text>
                    </View>
                  );
                })}
            </View>
            <Text style={styles.repertoireLegend}>
              {t("talkCoordinator.speakerProfile.repertoireLegend", {
                fresh: stats.freshTalkNumbers.length,
              })}
            </Text>
            {/* Named, not merely coloured: colour is for the glance, words for
                whoever reads colour poorly — and for whoever is about to ring
                this brother up. */}
            {[...speaker.talkNumbers].some((n) => retired.has(n)) ? (
              <Text style={styles.retiredLegend}>
                {t("talkCoordinator.speakerProfile.retiredInRepertoire", {
                  numbers: [...speaker.talkNumbers]
                    .filter((n) => retired.has(n))
                    .sort((a, b) => a - b)
                    .join(", "),
                })}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {/* Edit */}
      <Pressable
        style={styles.editBtn}
        onPress={() =>
          router.push(`/talk-coordinator/speakers?edit=${speaker.id}` as any)
        }
      >
        <Ionicons name="create-outline" size={18} color="#0369a1" />
        <Text style={styles.editBtnText}>
          {t("talkCoordinator.speakerProfile.edit")}
        </Text>
      </Pressable>

      {/*
        Объединение двойников.

        Один брат заводится дважды, когда имя пишут по-разному — «Иван
        Ротарюк» и «Rotariuk Iwan». История делится надвое ровно там, где она
        нужна: при решении, кого звать. Отсюда, из карточки, потому что здесь
        видно, чья это история: сколько визитов и когда был последний.

        Эта карточка ОСТАЁТСЯ, выбранная становится следом. Так понятнее, чем
        выбирать обе в списке и потом решать, какая из них главная.
      */}
      <Pressable style={styles.mergeBtn} onPress={() => setMergeOpen(true)}>
        <Ionicons name="git-merge-outline" size={18} color="#7c3aed" />
        <Text style={styles.mergeBtnText}>
          {t("talkCoordinator.merge.action")}
        </Text>
      </Pressable>

      <Dialog
        visible={mergeOpen}
        title={t("talkCoordinator.merge.title")}
        icon="git-merge-outline"
        iconTint="#7c3aed"
        iconBg="#f5f3ff"
        cancelLabel={t("common.cancel")}
        onCancel={() => {
          setMergeOpen(false);
          setMergePick(null);
        }}
      >
        <Text style={styles.mergeLead}>
          {t("talkCoordinator.merge.lead", { name: speakerName(speaker) })}
        </Text>
        <TextInput
          style={styles.mergeSearch}
          value={mergeSearch}
          onChangeText={setMergeSearch}
          placeholder={t("talkCoordinator.merge.searchHint")}
          placeholderTextColor="#94a3b8"
        />
        {mergeCandidates.map((c) => {
          const on = mergePick === c.id;
          const cs = visitsOf(c.id);
          return (
            <Pressable
              key={c.id}
              style={[styles.mergeRow, on && styles.mergeRowOn]}
              onPress={() => setMergePick(on ? null : c.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.mergeName}>{speakerName(c)}</Text>
                <Text style={styles.mergeSub}>
                  {[
                    c.externalCongregation?.name,
                    cs > 0
                      ? t("talkCoordinator.merge.visits", { n: cs })
                      : t("talkCoordinator.merge.noVisits"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              {on ? (
                <Ionicons name="checkmark-circle" size={18} color="#7c3aed" />
              ) : null}
            </Pressable>
          );
        })}
        {mergeSearch.trim().length >= 2 && mergeCandidates.length === 0 ? (
          <Text style={styles.mergeNone}>
            {t("talkCoordinator.merge.noMatches")}
          </Text>
        ) : null}
        <Text style={styles.mergeNote}>{t("talkCoordinator.merge.note")}</Text>
        <Pressable
          style={[styles.mergeConfirm, !mergePick && styles.mergeConfirmOff]}
          disabled={!mergePick || mergeMutation.isPending}
          onPress={() => mergeMutation.mutate()}
        >
          {mergeMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.mergeConfirmText}>
              {t("talkCoordinator.merge.confirm")}
            </Text>
          )}
        </Pressable>
      </Dialog>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  talkChipRetired: {
    backgroundColor: "#fef3c7",
    borderColor: "#fcd34d",
  },
  talkChipTextRetired: {
    color: "#b45309",
    textDecorationLine: "line-through",
  },
  retiredLegend: {
    fontSize: 12,
    color: "#b45309",
    marginTop: 6,
    lineHeight: 17,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  muted: { color: "#64748b", fontSize: 15, textAlign: "center" },
  container: { padding: 16, paddingBottom: 48 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    marginBottom: 14,
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
  },
  cong: { fontSize: 14, color: "#475569", marginTop: 2 },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  phone: { fontSize: 15, color: "#0369a1" },
  note: { fontSize: 14, color: "#475569", marginTop: 10, lineHeight: 19 },

  statsBand: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 12,
    marginBottom: 14,
  },
  statsBandRecent: { borderColor: "#fcd34d", backgroundColor: "#fffbeb" },
  stat: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  statDivider: { width: 1, backgroundColor: "#e2e8f0" },
  statNum: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
  },
  statText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
    textAlign: "center",
  },
  statTextRecent: { color: "#b45309" },
  statLabel: { fontSize: 11, color: "#94a3b8", textAlign: "center" },

  recentWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 10,
    marginTop: -4,
    marginBottom: 14,
  },
  recentWarnText: { flex: 1, fontSize: 13, color: "#92400e" },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionEmpty: { fontSize: 14, color: "#94a3b8" },

  visitRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f1f5f9",
  },
  visitDateCol: { width: 96 },
  visitDate: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
  },
  visitRel: { fontSize: 12, color: "#94a3b8", marginTop: 1 },
  visitTalkCol: { flex: 1 },
  visitTalk: { fontSize: 14, color: "#0f172a", lineHeight: 19 },
  visitNum: {
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0369a1",
  },
  visitTalkMuted: { fontSize: 14, color: "#94a3b8", fontStyle: "italic" },
  tentative: { fontSize: 11, color: "#b45309", marginTop: 2 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  talkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#0369a1",
    backgroundColor: "#eff6ff",
  },
  talkChipGiven: { borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  talkChipText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0369a1",
  },
  talkChipTextGiven: {
    color: "#94a3b8",
    fontWeight: "500",
    fontFamily: "Manrope_500Medium",
  },
  repertoireLegend: { fontSize: 12, color: "#94a3b8", marginTop: 10 },

  mergeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd6fe",
    backgroundColor: "#faf5ff",
  },
  mergeBtnText: { fontSize: 15, color: "#7c3aed", fontWeight: "600" },
  mergeLead: { fontSize: 13.5, color: "#334155", lineHeight: 19 },
  mergeSearch: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#0f172a",
    marginTop: 8,
  },
  mergeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    marginTop: 6,
  },
  mergeRowOn: { borderColor: "#a78bfa", backgroundColor: "#f5f3ff" },
  mergeName: { fontSize: 14.5, color: "#0f172a", fontWeight: "600" },
  mergeSub: { fontSize: 12.5, color: "#64748b", marginTop: 1 },
  mergeNone: { fontSize: 12.5, color: "#64748b", marginTop: 6 },
  mergeNote: { fontSize: 12, color: "#64748b", lineHeight: 17, marginTop: 10 },
  mergeConfirm: {
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#7c3aed",
  },
  mergeConfirmOff: { opacity: 0.45 },
  mergeConfirmText: { color: "#fff", fontSize: 14.5, fontWeight: "700" },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0369a1",
    backgroundColor: "#fff",
  },
  editBtnText: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0369a1",
  },
});
