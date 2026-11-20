import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { Publisher } from "../lib/api";
import type { RankFlag, Ranked, RankResult } from "../lib/picker-rank";
import { getPartLabel } from "../lib/parts";

/**
 * The people picker of a programme part, in three groups (Lionel, 19–20
 * November 2026; mockup «Составление программы — вариант В»):
 * «Подходят лучше всего» with the reason, the others by how long they have
 * been without a part, and who cannot that day. Each row says the last part,
 * the weeks since on the right, and only the facts that matter — a pair seen
 * before, another part this meeting, a part next to this week, an own part
 * soon, the turn of a part given in turn.
 *
 * The order and the facts come from lib/picker-rank.ts; this only shows them.
 */
export function RankedPickerList({
  result,
  value,
  people,
  otherName,
  awayLabel,
  awayDate,
  dateOf,
  student,
  onPick,
}: {
  result: RankResult;
  value: string | null | undefined;
  people: Map<string, Publisher>;
  /** The other side of the pair, for «с … ещё не были». */
  otherName?: string | null;
  /** Why someone cannot: «в отъезде · 20–30 нояб.» or the event. */
  awayLabel: (id: string) => string | null;
  /** The meeting's own day, for «Не смогут …». */
  awayDate: string | null;
  /** The meeting day of a week, for the dates in the rows. */
  dateOf: (weekISO: string) => string;
  student: boolean;
  onPick: (p: Publisher) => void;
}) {
  const { t, i18n } = useTranslation();
  const short = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
    });
  // A ministry part by its heading («Развивайте интерес»); any other by its
  // own name — a title like «Песня 41 и молитва | Вступительные слова» says
  // the workbook's line, not the part.
  const partName = (partKey: string, title: string | null) => {
    if (!partKey.startsWith("apply_yourself_")) return getPartLabel(partKey);
    const heading = (title ?? "").split(":")[0].trim();
    return heading || getPartLabel(partKey);
  };
  const firstName = (name?: string | null) =>
    (name ?? "").split(/\s+/).filter(Boolean).slice(-1)[0] ?? "";

  const flagText = (f: RankFlag): { text: string; tone: "pair" | "warn" | "ok" } => {
    switch (f.kind) {
      case "pair":
        return {
          tone: "pair",
          text: t("pickers.rank.pair", {
            name: firstName(otherName),
            date: short(dateOf(f.week)),
          }),
        };
      case "sameMeeting":
        return {
          tone: "warn",
          text: t("pickers.rank.sameMeeting", { part: partName(f.partKey, f.title) }),
        };
      case "prevWeek":
        return { tone: "warn", text: t("pickers.rank.prevWeek") };
      case "nextWeek":
        return { tone: "warn", text: t("pickers.rank.nextWeek") };
      case "ownSoon":
        return {
          tone: "warn",
          text: t("pickers.rank.ownSoon", { date: short(dateOf(f.week)), count: f.weeks }),
        };
      case "rotation":
        return { tone: "warn", text: t("pickers.rank.rotation") };
    }
  };

  const Row = ({ r, current }: { r: Ranked; current?: boolean }) => {
    const p = people.get(r.id);
    if (!p) return null;
    const away = awayLabel(r.id);
    const flags = r.flags.map(flagText);
    if (r.reason === "neverPaired" && otherName)
      flags.unshift({ tone: "ok", text: t("pickers.rank.neverPaired", { name: firstName(otherName) }) });
    const initials = p.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: value === r.id }}
        style={({ pressed }) => [
          styles.row,
          current && styles.rowCurrent,
          away && styles.rowAway,
          pressed && styles.rowPressed,
        ]}
        onPress={() => onPick(p)}
      >
        <View style={[styles.avatar, p.gender === "sister" ? styles.avSister : styles.avBrother]}>
          <Text style={[styles.avText, p.gender === "sister" ? styles.avTextSister : styles.avTextBrother]}>
            {initials}
          </Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={2}>
            {p.displayName}
          </Text>
          {r.last ? (
            <Text style={styles.line}>
              {t("pickers.rank.last", {
                date: short(dateOf(r.last.week)),
                part: partName(r.last.partKey, r.last.title),
              })}
              {student && r.last.role === "assistant" ? ` ${t("pickers.rank.asAssistant")}` : ""}
            </Text>
          ) : (
            <Text style={styles.line}>
              {t(student ? "pickers.rank.neverLine" : "pickers.rank.neverLineTurn")}
            </Text>
          )}
          {(flags.length > 0 || away) && (
            <View style={styles.flags}>
              {away ? (
                <Text style={[styles.flag, styles.flagAway]}>{away}</Text>
              ) : null}
              {flags.map((f, i) => (
                <Text
                  key={i}
                  style={[
                    styles.flag,
                    f.tone === "pair" ? styles.flagPair : f.tone === "ok" ? styles.flagOk : styles.flagWarn,
                  ]}
                >
                  {f.text}
                </Text>
              ))}
            </View>
          )}
        </View>
        <View style={styles.ago}>
          {r.weeksAgo !== null ? (
            <>
              <Text style={styles.agoNum}>{t("pickers.rank.weeks", { count: r.weeksAgo })}</Text>
              <Text style={styles.agoSub}>{t("pickers.rank.ago")}</Text>
            </>
          ) : (
            <Text style={styles.agoSub}>{t("pickers.rank.never")}</Text>
          )}
          {value === r.id && <Ionicons name="checkmark" size={20} color="#0e7490" style={{ marginTop: 4 }} />}
        </View>
      </Pressable>
    );
  };

  const all = [...result.best, ...result.others, ...result.away];
  const current = value ? all.find((r) => r.id === value) : undefined;
  const without = (xs: Ranked[]) => xs.filter((r) => r.id !== value);
  const best = without(result.best);
  const others = without(result.others);
  const away = without(result.away);

  return (
    <View>
      {current && (
        <>
          <Text style={styles.section}>{t("pickers.rank.current")}</Text>
          <Row r={current} current />
        </>
      )}
      {best.length > 0 && (
        <>
          <Text style={styles.section}>{t("pickers.rank.best")}</Text>
          {best.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </>
      )}
      {others.length > 0 && (
        <>
          <Text style={styles.section}>{t("pickers.rank.others")}</Text>
          {others.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </>
      )}
      {away.length > 0 && (
        <>
          <Text style={styles.section}>
            {awayDate
              ? t("pickers.rank.awayOn", { date: short(awayDate), n: away.length })
              : t("pickers.rank.away", { n: away.length })}
          </Text>
          {away.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </>
      )}
      <Text style={styles.note}>{t("pickers.rank.note")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    fontFamily: "Manrope_700Bold",
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#475569",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#eef1f5",
    minHeight: 56,
  },
  rowCurrent: { backgroundColor: "#f0f9ff" },
  rowAway: { opacity: 0.75 },
  rowPressed: { backgroundColor: "#f1f5f9" },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avBrother: { backgroundColor: "#e0f2fe" },
  avSister: { backgroundColor: "#fce7f3" },
  avText: { fontFamily: "Manrope_700Bold", fontSize: 14 },
  avTextBrother: { color: "#075985" },
  avTextSister: { color: "#9d174d" },
  body: { flex: 1, minWidth: 0 },
  name: { fontFamily: "Manrope_700Bold", fontSize: 15.5, color: "#0f172a", lineHeight: 20 },
  line: { fontFamily: "Manrope_500Medium", fontSize: 13, color: "#475569", lineHeight: 19, marginTop: 2 },
  flags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  flag: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 11,
    overflow: "hidden",
  },
  flagPair: { backgroundColor: "#f3e8ff", color: "#6b21a8" },
  flagWarn: { backgroundColor: "#fff7ed", color: "#9a3412" },
  flagOk: { backgroundColor: "#ecfdf5", color: "#065f46" },
  flagAway: { backgroundColor: "#e2e8f0", color: "#1e293b" },
  ago: { alignItems: "flex-end", minWidth: 56 },
  agoNum: { fontFamily: "Manrope_700Bold", fontSize: 14, color: "#0f172a" },
  agoSub: { fontFamily: "Manrope_500Medium", fontSize: 11.5, color: "#64748b" },
  note: {
    fontFamily: "Manrope_500Medium",
    fontSize: 12.5,
    color: "#64748b",
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
  },
});
