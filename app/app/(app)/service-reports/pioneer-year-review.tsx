import { useState } from "react";
import { capitalizeFirst } from "../../../lib/relative-time";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import "dayjs/locale/de";
import i18n from "../../../lib/i18n";
import {
  PioneerMonthLine,
  PioneerYearRow,
  serviceReportsApi,
} from "../../../lib/api";
import { LoadFailure } from "../../../components/LoadFailure";

/**
 * Where each regular pioneer stands, at the end of the service year.
 *
 * The screen behind the calendar task «Обзор служения общих пионеров»: without
 * it the brothers would open twelve S-21 cards and add up by hand, which is
 * both slow and the kind of arithmetic that goes wrong quietly.
 *
 * THREE THINGS IT REFUSES TO DO. It never says a man should stop pioneering —
 * that decision belongs to the service committee, and a screen that phrased it
 * would be making it. It models no credit hours: a pioneer writes those in his
 * own note, so the notes are shown beside the numbers instead. And it never
 * presents a total without saying which months are counted — read on 20 August
 * without that line, every man in the list looks behind.
 */
export default function PioneerYearReviewScreen() {
  const { t } = useTranslation();
  /**
   * Какой год смотрим — берётся из ссылки.
   *
   * Без года экран открывает ТЕКУЩИЙ служебный, а с сентября это уже
   * начавшийся: отчётов в нём ещё нет, и все десять пионеров показываются с
   * нулями. Задача же говорит о годе, который закончился 31 августа, и несёт
   * его метку с собой.
   */
  const { year: yearParam, window: windowParam } = useLocalSearchParams<{
    year?: string;
    window?: string;
  }>();
  /**
   * Год и окно — из ссылки, а без неё решает сервер по дате собрания: до 20
   * октября — закончившийся год, с февраля по апрель — «сентябрь – февраль».
   * На экране оба переключаются (28 сентября: прежде год был только тот, что
   * в ссылке, а полугодовой обзор не открывался вовсе).
   */
  const [year, setYear] = useState<number | undefined>(() =>
    yearParam ? parseInt(String(yearParam), 10) || undefined : undefined,
  );
  const [win, setWin] = useState<"half" | "year" | undefined>(() =>
    windowParam === "half" || windowParam === "year" ? windowParam : undefined,
  );

  /** Чья история по месяцам раскрыта — по одному человеку, не все разом. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["pioneer-year-review", year ?? "auto", win ?? "auto"],
    queryFn: () => serviceReportsApi.getPioneerYearReview(year, win),
    placeholderData: (prev) => prev,
  });

  /**
   * The month in the case a sentence needs: «Пионер с августа», not «с август».
   *
   * Russian declines it, and `format('MMMM')` gives the dictionary form. The
   * day-and-month format is the one every locale writes correctly, so it is
   * asked for and the day dropped — one line instead of a table of endings.
   */
  const monthName = (iso: string) => {
    const full = dayjs(iso).locale(i18n.language).format("D MMMM");
    return full.split(" ").slice(1).join(" ") || full;
  };

  /**
   * The month as a name — with the year where it stands alone, because a
   * service year spans two of them: «сентябрь 2026», «отчёты за сентябрь». The
   * declined form above is for «с августа»; used for these it read
   * «Служебный год: сентября 2026 — августа 2027» (28 September).
   */
  const monthTitle = (iso: string) =>
    dayjs(iso).locale(i18n.language).format("MMMM YYYY");
  const monthPlain = (iso: string) =>
    dayjs(iso).locale(i18n.language).format("MMMM");

  if (isLoading) {
    return <ActivityIndicator size="large" style={{ marginTop: 48 }} />;
  }
  if (error || !data) {
    return <LoadFailure error={error} onRetry={() => void refetch()} />;
  }

  const part = data.window === "part";
  const windowMonths = data.windowMonths ?? 12;
  const complete = data.windowComplete ?? data.monthsElapsed >= 12;
  /** The final word «не дотянул до 560» belongs only to a finished year. */
  const finalYear = !part && complete;
  const expectedGoal = data.expectedGoal ?? 600;
  const expectedMin = data.expectedMinimum ?? 560;
  const shortCount = data.rows.filter((r) => r.short).length;
  const now = new Date();
  const runningYear =
    now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();

  const monthLine = (m: PioneerMonthLine) => (
    <View
      key={m.reportMonth}
      style={[styles.mRow, m.state === "notPioneer" && styles.mRowDim]}
    >
      <Text style={styles.mName}>{capitalizeFirst(monthPlain(m.reportMonth))}</Text>
      <View style={{ flex: 1 }}>
        <View style={styles.mFigures}>
          {m.state === "reported" ? (
            <Text style={styles.mHours}>
              {t("pioneerReview.hours", { count: m.hours ?? 0 })}
            </Text>
          ) : (
            <Text
              style={[
                styles.mState,
                m.state === "missing" && styles.mStateMissing,
              ]}
            >
              {t(`pioneerReview.state.${m.state}`)}
            </Text>
          )}
          {m.bibleStudies ? (
            <Text style={styles.mStudies}>
              {t("pioneerReview.studies", { count: m.bibleStudies })}
            </Text>
          ) : null}
        </View>
        {m.note ? <Text style={styles.mNote}>{m.note}</Text> : null}
      </View>
    </View>
  );

  const card = (row: PioneerYearRow) => {
    const measured = row.toMinimum !== null && !row.endedIn;
    return (
    <View
      key={row.publisherId}
      style={[
        styles.card,
        row.short && styles.cardShort,
        row.shortSoFar && styles.cardPending,
      ]}
    >
      <View style={styles.head}>
        <Text style={styles.name}>{row.displayName}</Text>
        <Text style={[styles.hours, row.short && styles.hoursShort]}>
          {t("pioneerReview.hours", { count: row.hours })}
        </Text>
      </View>

      {/*
        Темп — наверх: он отвечает на вопрос, ради которого экран открывают, —
        дотянет ли. Сумма одинакова у того, кто идёт ровно, и у того, кто
        остановился в мае.
      */}
      {row.pace !== null ? (
        <Text style={styles.paceLead}>
          {t("pioneerReview.pace", {
            // «37,8», not «37.8», in Russian and German.
            pace: row.pace.toLocaleString(i18n.language),
            count: row.monthsReported,
          })}
        </Text>
      ) : (
        <Text style={styles.paceLead}>{t("pioneerReview.noReports")}</Text>
      )}

      {/*
        Полоса меряет то же, что и слова под ней: в законченном году — 600 с
        отметкой 560, в середине года — темп за прошедшие месяцы. Прежде она
        всегда мерила год, и в феврале все стояли на трети.
      */}
      {measured && expectedGoal > 0 ? (
        <View style={styles.bar}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.min(100, (row.hours / expectedGoal) * 100)}%`,
              },
              (row.short || row.shortSoFar) && styles.barFillShort,
            ]}
          />
          <View
            style={[
              styles.barMark,
              { left: `${(expectedMin / expectedGoal) * 100}%` },
            ]}
          />
        </View>
      ) : null}

      {/*
        Месяцы без отчёта названы вслух: месяц без отчёта не то же, что месяц
        с нулём, и человек без августовского отчёта не должен выглядеть
        недобравшим полсотни часов.
      */}
      {row.missingMonths.length > 0 ? (
        <Text style={styles.missing}>
          {t("pioneerReview.missing", {
            // «за август», not «за августа»: after «за» the month stands as
            // it is (the declined form is for «с августа»).
            months: row.missingMonths.map(monthPlain).join(", "),
            count: row.missingMonths.length,
          })}
        </Text>
      ) : null}

      {row.endedIn ? (
        /* He stopped inside the window: the months after are not his. */
        <Text style={styles.since}>
          {t("pioneerReview.endedIn", { month: monthName(row.endedIn) })}
        </Text>
      ) : row.startedMidYear ? (
        /* No target for him: he was not a pioneer for the whole window. */
        <Text style={styles.since}>
          {t("pioneerReview.sinceOnly", {
            month: row.pioneerSince ? monthName(row.pioneerSince) : "",
          })}
        </Text>
      ) : measured ? (
        <View style={styles.figures}>
          {finalYear ? (
            <>
              {row.toMinimum && row.toMinimum > 0 ? (
                <Text style={styles.toMinimum}>
                  {t("pioneerReview.toMinimum", { count: row.toMinimum })}
                </Text>
              ) : (
                <Text style={styles.meets}>{t("pioneerReview.meets")}</Text>
              )}
              {row.toGoal && row.toGoal > 0 ? (
                <Text style={styles.toGoal}>
                  {t("pioneerReview.toGoal", { count: row.toGoal })}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              {row.toMinimum && row.toMinimum > 0 ? (
                <Text style={styles.toMinimum}>
                  {t("pioneerReview.toMinimumPart", {
                    count: row.toMinimum,
                    expected: expectedMin,
                  })}
                </Text>
              ) : (
                <Text style={styles.meets}>
                  {t("pioneerReview.meetsPart", {
                    expected: expectedMin,
                    months: data.monthsElapsed,
                  })}
                </Text>
              )}
              {row.toGoal && row.toGoal > 0 ? (
                <Text style={styles.toGoal}>
                  {t("pioneerReview.toGoalPart", {
                    count: row.toGoal,
                    expected: expectedGoal,
                  })}
                </Text>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {/* The figure a conversation in the middle of the year is about. */}
      {!finalYear && measured && row.yearLeftToMinimum != null ? (
        <Text style={styles.yearLeft}>
          {row.yearLeftToMinimum > 0
            ? t("pioneerReview.yearLeft", {
                count: row.yearLeftToMinimum,
                perMonth: row.perMonthToMinimum ?? 0,
              })
            : t("pioneerReview.yearLeftDone")}
        </Text>
      ) : null}

      {/* Hours for only a few months, and no date of appointment on the card:
          the low total may mean «he became a pioneer in May». We do not guess —
          we say what is missing and let the brothers check. */}
      {measured &&
      !row.pioneerSince &&
      row.monthsReported > 0 &&
      row.monthsReported < data.monthsElapsed - 1 ? (
        <Text style={styles.unknownSince}>
          {t("pioneerReview.checkSince", {
            count: row.monthsReported,
            of: data.monthsElapsed,
          })}
        </Text>
      ) : null}

      {/*
        История по месяцам — под свёрткой (28 сентября, просьба Лионеля:
        раскрыть пионера и увидеть его месяцы). В ней же заметки: там пишут
        засчитанные часы.
      */}
      {row.months && row.months.length > 0 ? (
        <Pressable
          onPress={() => toggle(row.publisherId)}
          hitSlop={6}
          style={styles.notesToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open.has(row.publisherId) }}
        >
          <Ionicons
            name={open.has(row.publisherId) ? "chevron-up" : "chevron-down"}
            size={14}
            color="#0369a1"
          />
          <Text style={styles.notesToggleText}>
            {row.notes.length > 0
              ? t("pioneerReview.historyNotes", { count: row.notes.length })
              : t("pioneerReview.history")}
          </Text>
        </Pressable>
      ) : null}
      {open.has(row.publisherId) && row.months ? (
        <View style={styles.history}>{row.months.map(monthLine)}</View>
      ) : null}
    </View>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#f1f5f9" }}
      contentContainerStyle={styles.container}
    >
      {/*
        За какой год смотрим — сказано прямо.

        Экран знал год всегда (он приходит в ответе), но нигде его не называл.
        Поэтому подмена и осталась незамеченной: в сентябре открывался
        начавшийся год с нулями у всех, и понять это было неоткуда.
      */}
      <View style={styles.switchRow}>
        <Pressable
          onPress={() => setYear(data.serviceYear - 1)}
          hitSlop={8}
          style={styles.arrow}
          accessibilityRole="button"
          accessibilityLabel={t("pioneerReview.prevYear")}
        >
          <Ionicons name="chevron-back" size={18} color="#0369a1" />
        </Pressable>
        <Text style={styles.yearLine}>
          {capitalizeFirst(
            t("pioneerReview.forYear", {
              from: monthTitle(data.firstMonth),
              to: monthTitle(data.lastMonth),
            }),
          )}
        </Text>
        <Pressable
          onPress={() => setYear(data.serviceYear + 1)}
          disabled={data.serviceYear >= runningYear}
          hitSlop={8}
          style={[
            styles.arrow,
            data.serviceYear >= runningYear && { opacity: 0.3 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t("pioneerReview.nextYear")}
        >
          <Ionicons name="chevron-forward" size={18} color="#0369a1" />
        </Pressable>
        {isFetching ? <ActivityIndicator size="small" /> : null}
      </View>
      <View style={styles.chips}>
        {(["half", "year"] as const).map((w) => {
          const on = (w === "half") === part;
          return (
            <Pressable
              key={w}
              onPress={() => {
                setYear(data.serviceYear);
                setWin(w);
              }}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {t(w === "half" ? "pioneerReview.windowHalf" : "pioneerReview.windowYear")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.lede}>
        <Ionicons name="information-circle-outline" size={16} color="#0369a1" />
        <View style={{ flex: 1 }}>
          <Text style={styles.ledeText}>
            {t("pioneerReview.counted", {
              count: data.monthsElapsed,
              of: windowMonths,
            })}
            {data.collectingMonth
              ? " " +
                t("pioneerReview.collecting", {
                  month: monthPlain(data.collectingMonth),
                })
              : ""}
          </Text>
          <Text style={styles.ledeHint}>
            {t(
              part
                ? "pioneerReview.ruleHalf"
                : finalYear
                  ? "pioneerReview.rule"
                  : "pioneerReview.ruleRunning",
            )}
          </Text>
        </View>
      </View>

      {data.rows.length === 0 ? (
        <Text style={styles.empty}>{t("pioneerReview.nobody")}</Text>
      ) : (
        <>
          <Text style={styles.summary}>
            {shortCount > 0
              ? t(
                  finalYear
                    ? "pioneerReview.shortCount"
                    : "pioneerReview.shortCountPart",
                  { count: shortCount, total: data.rows.length },
                )
              : t(
                  finalYear
                    ? "pioneerReview.allFine"
                    : "pioneerReview.allFinePart",
                  { count: data.rows.length },
                )}
          </Text>
          {data.rows.map(card)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  yearLine: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e0f2fe",
  },
  chips: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  chipOn: { backgroundColor: "#0369a1", borderColor: "#0369a1" },
  chipText: { fontSize: 13, color: "#334155", fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  yearLeft: { fontSize: 13, color: "#334155", marginTop: 6 },
  history: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#eef2f6",
  },
  mRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  mRowDim: { opacity: 0.5 },
  mName: { width: 92, fontSize: 13, color: "#475569" },
  mFigures: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  mHours: { fontSize: 13, color: "#0f172a", fontWeight: "700" },
  mState: { fontSize: 13, color: "#64748b" },
  mStateMissing: { color: "#b45309", fontWeight: "600" },
  mStudies: { fontSize: 13, color: "#64748b" },
  mNote: { fontSize: 12.5, color: "#334155", lineHeight: 18, marginTop: 2 },
  lede: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  ledeText: { fontSize: 13, color: "#075985", lineHeight: 19 },
  ledeHint: { fontSize: 12, color: "#0369a1", lineHeight: 17, marginTop: 4 },
  summary: {
    fontSize: 12.5,
    color: "#64748b",
    marginBottom: 10,
    marginLeft: 2,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e8edf3",
    padding: 14,
    marginBottom: 10,
  },
  cardShort: { borderColor: "#fbbf24", backgroundColor: "#fffbeb" },
  head: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 15.5,
    color: "#0f172a",
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  hours: {
    fontSize: 19,
    color: "#0f172a",
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
  },
  hoursShort: { color: "#92400e" },
  figures: { flexDirection: "row", gap: 14, flexWrap: "wrap", marginTop: 6 },
  toMinimum: {
    fontSize: 13,
    color: "#92400e",
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  meets: { fontSize: 13, color: "#15803d" },
  toGoal: { fontSize: 13, color: "#64748b" },
  since: { fontSize: 13, color: "#475569", marginTop: 6 },
  unknownSince: {
    fontSize: 12.5,
    color: "#b45309",
    lineHeight: 18,
    marginTop: 6,
  },
  /** Тень статуса, когда год ещё не собран: не обвинение, а вопрос. */
  cardPending: { borderColor: "#fcd34d", backgroundColor: "#fffdf5" },
  paceLead: { fontSize: 14, color: "#0f172a", fontWeight: "600", marginTop: 2 },
  /** Полоса: где он и куда идёт. Отметка — порог 560 внутри цели 600. */
  bar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e2e8f0",
    marginTop: 8,
    overflow: "hidden",
    position: "relative",
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: "#0ea5e9" },
  barFillShort: { backgroundColor: "#f59e0b" },
  barMark: {
    position: "absolute",
    top: 0,
    width: 2,
    height: 8,
    backgroundColor: "#475569",
  },
  missing: {
    fontSize: 13,
    color: "#b45309",
    marginTop: 8,
    lineHeight: 18,
  },
  notesToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  notesToggleText: { fontSize: 13, color: "#0369a1", fontWeight: "600" },
  pace: { fontSize: 12.5, color: "#64748b", marginTop: 8 },
  note: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#eef2f6",
  },
  noteMonth: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#94a3b8",
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
  },
  noteText: { fontSize: 13, color: "#334155", lineHeight: 19, marginTop: 2 },
  empty: { fontSize: 14, color: "#64748b", textAlign: "center", marginTop: 32 },
});
