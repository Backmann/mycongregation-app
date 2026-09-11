import { useMemo } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import {
  ExternalCongregation,
  PublicTalk,
  externalCongregationsApi,
  publicTalksApi,
  talkExchangeApi,
} from "../../../../lib/api";
import {
  computeOutgoingStats,
  OutgoingVisit,
} from "../../../../lib/speaker-stats";
import { formatRelativeDay } from "../../../../lib/relative-time";
import { useAllPublishers } from "../../../../lib/useAllPublishers";

const todayISO = () => new Date().toLocaleDateString("en-CA");

export default function OurSpeakerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();

  const publishersQuery = useAllPublishers();
  const congQuery = useQuery({
    queryKey: ["external-congregations"],
    queryFn: () => externalCongregationsApi.list(),
  });
  const entriesQuery = useQuery({
    queryKey: ["talk-exchange"],
    queryFn: () => talkExchangeApi.list(),
  });
  const talksQuery = useQuery({
    queryKey: ["public-talks", "all"],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });

  const publisher =
    (publishersQuery.data?.data ?? []).find((p) => p.id === id) ?? null;

  const talkById = useMemo(() => {
    const m = new Map<string, PublicTalk>();
    for (const tk of talksQuery.data?.data ?? []) m.set(tk.id, tk);
    return m;
  }, [talksQuery.data]);
  const congById = useMemo(() => {
    const m = new Map<string, ExternalCongregation>();
    for (const c of congQuery.data ?? []) m.set(c.id, c);
    return m;
  }, [congQuery.data]);

  const today = todayISO();
  const stats = useMemo(
    () =>
      publisher
        ? computeOutgoingStats(
            publisher.id,
            entriesQuery.data ?? [],
            talkById,
            congById,
            today,
          )
        : null,
    [publisher, entriesQuery.data, talkById, congById, today],
  );

  const loading =
    publishersQuery.isLoading ||
    congQuery.isLoading ||
    entriesQuery.isLoading ||
    talksQuery.isLoading;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!publisher || !stats) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          {t("talkCoordinator.ourSpeakerProfile.notFound")}
        </Text>
      </View>
    );
  }

  const phone = publisher.mobilePhone;
  const appointmentLabel =
    publisher.appointment === "elder" ||
    publisher.appointment === "ministerial_servant"
      ? t(`publishers.appointment.${publisher.appointment}`)
      : null;

  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  /**
   * Снятая речь — сказать прямо, и теми же словами, что в журнале.
   *
   * Карточка о снятии не знала ничего: у брата в предстоящей поездке могла
   * стоять речь, которую больше не преподносят, и заметить это было неоткуда.
   * Слова взяты готовые — чтобы одно и то же в двух местах не называлось
   * по-разному.
   */
  const talkRestriction = (talkNumber: number | null): string | null => {
    if (talkNumber == null) return null;
    const tk = [...talkById.values()].find((x) => x.number === talkNumber);
    if (!tk || tk.isActive) return null;
    const day = (iso: string) =>
      new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    if (!tk.retiredFrom) return t("publicTalks.retiredPlain");
    return tk.retiredUntil
      ? t("publicTalks.pausedBetween", {
          from: day(tk.retiredFrom),
          until: day(tk.retiredUntil),
        })
      : t("publicTalks.retiredFrom", { date: day(tk.retiredFrom) });
  };

  /**
   * Ту же речь — в то же собрание.
   *
   * Проверяется только для предстоящих: в прошлом это уже факт, и говорить о
   * нём поздно. Сведения для проверки лежали рядом и не использовались.
   */
  const repeatsHere = (v: OutgoingVisit): boolean =>
    !!v.talkNumber &&
    !!v.hostCongregationId &&
    stats.pastVisits.some(
      (x) =>
        x.talkNumber === v.talkNumber &&
        x.hostCongregationId === v.hostCongregationId,
    );

  const renderVisit = (v: OutgoingVisit, upcoming = false) => (
    <View key={v.id} style={styles.visitRow}>
      <View style={styles.visitDateCol}>
        <Text style={styles.visitDate}>{fmtDate(v.date)}</Text>
        <Text style={styles.visitRel}>
          {formatRelativeDay(v.date, today, t)}
        </Text>
      </View>
      <View style={styles.visitTalkCol}>
        <Text style={styles.visitHost} numberOfLines={1}>
          {v.local
            ? t("talkCoordinator.ourSpeakerProfile.here")
            : (v.hostCongregation ??
              t("talkCoordinator.ourSpeakerProfile.noCongregation"))}
        </Text>
        {v.talkNumber != null ? (
          <Text style={styles.visitTalk} numberOfLines={2}>
            <Text style={styles.visitNum}>№{v.talkNumber}</Text>
            {v.talkTitle ? ` — ${v.talkTitle}` : ""}
          </Text>
        ) : (
          <Text style={styles.visitTalkMuted}>
            {t("talkCoordinator.ourSpeakerProfile.noTalk")}
          </Text>
        )}
        {talkRestriction(v.talkNumber) ? (
          <Text style={styles.visitWarn}>{talkRestriction(v.talkNumber)}</Text>
        ) : null}
        {upcoming && repeatsHere(v) ? (
          <Text style={styles.visitNote}>
            {t("talkCoordinator.ourSpeakerProfile.sameTalkThere")}
          </Text>
        ) : null}
        {v.tentative ? (
          <Text style={styles.tentative}>
            {t("talkCoordinator.ourSpeakerProfile.tentative")}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.card}>
        <Text style={styles.name}>{publisher.displayName}</Text>
        {appointmentLabel ? (
          <Text style={styles.cong}>{appointmentLabel}</Text>
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
      </View>

      {/* Stats band */}
      {/*
        Жёлтая рамка ушла вместе с полосой «недавно выступал»: решение Лионеля
        11 сентября — такого предупреждения не нужно вовсе. Числа остаются
        числами и ни о чём не просят.
      */}
      <View style={styles.statsBand}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{stats.count}</Text>
          <Text style={styles.statLabel}>
            {t("talkCoordinator.ourSpeakerProfile.timesOut")}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statText}>
            {stats.lastVisit
              ? formatRelativeDay(stats.lastVisit.date, today, t)
              : t("talkCoordinator.ourSpeakerProfile.never")}
          </Text>
          <Text style={styles.statLabel}>
            {t("talkCoordinator.ourSpeakerProfile.lastTime")}
          </Text>
        </View>
        {stats.distinctCongregations > 0 ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{stats.distinctCongregations}</Text>
              <Text style={styles.statLabel}>
                {t("talkCoordinator.ourSpeakerProfile.congregations")}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Upcoming */}
      <Text style={styles.sectionTitle}>
        {t("talkCoordinator.ourSpeakerProfile.upcoming")}
      </Text>
      <View style={styles.card}>
        {stats.futureVisits.length === 0 ? (
          <Text style={styles.sectionEmpty}>
            {t("talkCoordinator.ourSpeakerProfile.noUpcoming")}
          </Text>
        ) : (
          stats.futureVisits.map((v) => renderVisit(v, true))
        )}
      </View>

      {/* History */}
      <Text style={styles.sectionTitle}>
        {t("talkCoordinator.ourSpeakerProfile.history")}
      </Text>
      <View style={styles.card}>
        {stats.pastVisits.length === 0 ? (
          <Text style={styles.sectionEmpty}>
            {t("talkCoordinator.ourSpeakerProfile.noHistory")}
          </Text>
        ) : (
          stats.pastVisits.map((v) => renderVisit(v))
        )}
      </View>

      {/* Repertoire (derived from history) */}
      {stats.repertoire.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>
            {t("talkCoordinator.ourSpeakerProfile.repertoire")}
          </Text>
          <View style={styles.card}>
            <View style={styles.chipWrap}>
              {stats.repertoire.map((r) => (
                /**
                 * Сказанное и назначенное — врозь.
                 *
                 * «×2» складывало одну прочитанную речь с одной назначенной,
                 * будто он уже говорил её дважды. Теперь число — только
                 * произнесённые разы, а назначенная впереди помечается точкой
                 * и подписывается словом.
                 */
                <View
                  key={r.talkNumber}
                  style={[
                    styles.talkChip,
                    r.given === 0 && styles.talkChipPlanned,
                  ]}
                >
                  <Text style={styles.talkChipText}>№{r.talkNumber}</Text>
                  {r.given > 1 ? (
                    <Text style={styles.talkChipCount}>×{r.given}</Text>
                  ) : null}
                  {r.planned > 0 ? (
                    <Text style={styles.talkChipPlannedMark}>
                      {t("talkCoordinator.ourSpeakerProfile.plannedMark")}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
            <Text style={styles.repertoireLegend}>
              {t("talkCoordinator.ourSpeakerProfile.repertoireHint", {
                n: stats.repertoire.length,
              })}
            </Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  statLabel: { fontSize: 11, color: "#94a3b8", textAlign: "center" },

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
  visitHost: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
  },
  visitTalk: { fontSize: 13, color: "#475569", lineHeight: 18, marginTop: 1 },
  visitNum: {
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0369a1",
  },
  /** Снятая речь — предупреждение, его надо увидеть. */
  visitWarn: { fontSize: 12.5, color: "#b45309", marginTop: 3, lineHeight: 17 },
  /** Повтор темы в то же собрание — сведение, сказанное спокойно. */
  visitNote: { fontSize: 12.5, color: "#64748b", marginTop: 3, lineHeight: 17 },
  visitTalkMuted: {
    fontSize: 13,
    color: "#94a3b8",
    fontStyle: "italic",
    marginTop: 1,
  },
  tentative: { fontSize: 11, color: "#b45309", marginTop: 2 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  talkChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#0369a1",
    backgroundColor: "#eff6ff",
  },
  talkChipText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0369a1",
  },
  /** Речь, которую он ещё не говорил, но повезёт. */
  talkChipPlanned: { borderColor: "#bae6fd", backgroundColor: "#f0f9ff" },
  talkChipPlannedMark: { fontSize: 11, color: "#0369a1", marginLeft: 4 },
  talkChipCount: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#64748b",
  },
  repertoireLegend: { fontSize: 12, color: "#94a3b8", marginTop: 10 },
});
