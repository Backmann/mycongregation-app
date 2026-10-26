import { Fragment } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { FONT } from "../../lib/typography";

/**
 * THE JOURNAL «К НАМ / ОТ НАС», drawn (Lionel, 25 October 2026).
 *
 * One rule: what is not ready is seen first. A week is one card — its day on
 * the left, its lines on the right: who comes, who goes, and a thin dashed
 * line where somebody is still to be found, saying how long is left. No empty
 * blocks: before this the «К нам» box stretched to the height of the column
 * beside it and drew half a screen of blue with nothing in it.
 *
 * On a wide screen the same weeks are a table: week · к нам · речь · ланч-пакет
 * · от нас.
 *
 * The screen (talk-coordinator/log.tsx) prepares the lines; this file only
 * lays them out, so the two stay apart and the drawing can be read alone.
 */

export type Tone = "in" | "out" | "event";

export interface InLine {
  kind: "in";
  name: string;
  cong: string | null;
  talk: string | null;
  /** A special talk: its theme stands for the talk. */
  special: boolean;
  /** «Песня 45», when the guest's song is known. */
  song: string | null;
  /** The song is the Watchtower study's that day. */
  songRepeats: boolean;
  /** Who brings the lunch bag; null — nobody yet; undefined — not asked. */
  lunch?: string | null;
  restriction: string | null;
  /** The meeting of that weekend is cancelled — a convention, an assembly. */
  cancelled: boolean;
  ourBrother: boolean;
  onPress: () => void;
  onSwap?: () => void;
  onMove?: () => void;
  onNotHeld?: () => void;
}
export interface EventLine {
  kind: "event";
  title: string;
  who: string | null;
  theme: string | null;
  aside: { id: string; name: string; sub: string | null; ours: boolean; onMove?: () => void }[];
}
export interface MissedLine {
  kind: "missed";
  id: string;
  name: string;
  note: string | null;
  onUndo: () => void;
}
export interface InEmptyLine {
  kind: "inEmpty";
  /** «через 3 нед.» — only ahead. */
  left: string | null;
  urgent: boolean;
  onPress: () => void;
  onSwap: () => void;
}
export interface OutLine {
  kind: "out";
  id: string;
  who: string | null;
  host: string | null;
  /** Its own day, when not the weekend's. */
  day: string | null;
  talk: string | null;
  restriction: string | null;
  needsBrother: boolean;
  risk: { text: string; onAck: () => void; acking: boolean } | null;
  onPress: () => void;
}
export interface OutAddLine {
  kind: "outAdd";
  onPress: () => void;
}
export type Line = InLine | EventLine | MissedLine | InEmptyLine | OutLine | OutAddLine;

export interface WeekModel {
  monday: string;
  /** «25», «вс», «окт.». */
  dayNum: string;
  weekday: string;
  /** For the table: «Вс, 25 окт.». */
  dayLabel: string;
  monthKey: string;
  monthTitle: string;
  current: boolean;
  past: boolean;
  lines: Line[];
}

export interface AttentionRow {
  key: string;
  tone: "urgent" | "warn" | "lunch" | "song" | "muted";
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string | null;
  onPress: () => void;
}

const C = {
  ink: "#0f172a",
  sub: "#475569",
  faint: "#94a3b8",
  line: "#eef2f6",
  card: "#ffffff",
  brand: "#14606e",
  in: "#0369a1",
  inBg: "#e0f2fe",
  out: "#b45309",
  outBg: "#fef3c7",
  ev: "#6d28d9",
  evBg: "#ede9fe",
  warn: "#c2410c",
  warnBg: "#ffedd5",
  ok: "#0f766e",
};

/* ------------------------------------------------------------------ phone */

export function WeekCards({ weeks }: { weeks: WeekModel[] }) {
  let month = "";
  return (
    <>
      {weeks.map((w) => {
        const head = w.monthKey !== month;
        month = w.monthKey;
        return (
          <Fragment key={w.monday}>
            {head ? <Text style={s.month}>{w.monthTitle}</Text> : null}
            <WeekCard w={w} />
          </Fragment>
        );
      })}
    </>
  );
}

function WeekCard({ w }: { w: WeekModel }) {
  const { t } = useTranslation();
  return (
    <View style={[s.card, w.current && s.cardNow, w.past && s.cardPast]}>
      <View style={s.date}>
        <Text style={[s.dayNum, w.past && s.fadedText]}>{w.dayNum}</Text>
        <Text style={s.weekday}>{w.weekday}</Text>
        {w.current ? (
          <View style={s.nowTag}>
            <Text style={s.nowText}>{t("talkCoordinator.journal.now")}</Text>
          </View>
        ) : null}
      </View>
      <View style={s.lines}>
        {w.lines.map((l, i) => (
          <LineView key={i} l={l} past={w.past} />
        ))}
      </View>
    </View>
  );
}

function Dir({ tone, icon }: { tone: Tone; icon: keyof typeof Ionicons.glyphMap }) {
  const fg = tone === "in" ? C.in : tone === "out" ? C.out : C.ev;
  const bg = tone === "in" ? C.inBg : tone === "out" ? C.outBg : C.evBg;
  return (
    <View style={[s.dir, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={13} color={fg} />
    </View>
  );
}

function Restriction({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View style={s.restrict}>
      <Ionicons name="close-circle" size={12} color={C.out} />
      <Text style={s.restrictText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

function LineView({ l, past }: { l: Line; past: boolean }) {
  const { t } = useTranslation();
  switch (l.kind) {
    case "event":
      return (
        <View style={s.ln}>
          <Dir tone="event" icon="star" />
          <View style={s.lnBody}>
            <Text style={s.name}>{l.title}</Text>
            {l.who || l.theme ? (
              <Text style={s.subText}>
                {[l.who, l.theme].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            {l.aside.map((a) => (
              <View key={a.id} style={s.aside}>
                <Text style={s.asideText}>
                  <Text style={s.asideLabel}>{t("talkCoordinator.aside.badge")}: </Text>
                  {a.name}
                  {a.sub ? ` · ${a.sub}` : ""}
                </Text>
                {a.onMove ? (
                  <Pressable onPress={a.onMove} hitSlop={8} accessibilityRole="button">
                    <Text style={s.link}>{t("talkCoordinator.aside.move")}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      );
    case "in":
      return (
        <Pressable
          onPress={l.onPress}
          style={({ pressed }) => [s.ln, pressed && s.pressed]}
          accessibilityRole="button"
        >
          <Dir tone="in" icon="arrow-down" />
          <View style={s.lnBody}>
            <Text style={s.name}>
              {l.name}
              {l.cong ? <Text style={s.cong}> · {l.cong}</Text> : null}
            </Text>
            {l.talk ? (
              <Text style={s.subText}>
                {l.special ? (
                  <Text style={s.special}>{t("talkCoordinator.log.specialTalk")}: </Text>
                ) : null}
                {l.talk}
              </Text>
            ) : !past ? (
              <Text style={s.missing}>{t("talkCoordinator.journal.noTalk")}</Text>
            ) : null}
            <Restriction text={l.restriction} />
            {l.song ? (
              <Text style={[s.meta, l.songRepeats && s.metaWarn]}>
                <Ionicons
                  name={l.songRepeats ? "alert-circle" : "musical-notes-outline"}
                  size={12}
                  color={l.songRepeats ? C.warn : C.sub}
                />{" "}
                {l.songRepeats
                  ? t("talkCoordinator.journal.songRepeats", { song: l.song })
                  : l.song}
              </Text>
            ) : null}
            {l.lunch !== undefined ? (
              <Text style={[s.meta, l.lunch ? s.metaOk : s.metaWarn]}>
                <Ionicons
                  name="bag-handle-outline"
                  size={12}
                  color={l.lunch ? C.ok : C.warn}
                />{" "}
                {l.lunch
                  ? t("talkCoordinator.journal.lunchBy", { name: l.lunch })
                  : t("talkCoordinator.journal.lunchNobody")}
              </Text>
            ) : null}
            {l.cancelled ? (
              <View style={s.cancelled}>
                <Text style={s.cancelledText}>{t("talkCoordinator.cancelled.badge")}</Text>
                <View style={s.row}>
                  {l.onMove ? (
                    <Pressable onPress={l.onMove} hitSlop={6} accessibilityRole="button">
                      <Text style={s.link}>{t("talkCoordinator.cancelled.move")}</Text>
                    </Pressable>
                  ) : null}
                  {l.onNotHeld ? (
                    <Pressable onPress={l.onNotHeld} hitSlop={6} accessibilityRole="button">
                      <Text style={[s.link, { color: C.warn }]}>
                        {t("talkCoordinator.cancelled.notHeld")}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
          {l.onSwap ? (
            <Pressable
              onPress={l.onSwap}
              hitSlop={10}
              style={s.swap}
              accessibilityRole="button"
              accessibilityLabel={t("talkCoordinator.swap.action")}
            >
              <Ionicons name="swap-vertical" size={16} color={C.faint} />
            </Pressable>
          ) : null}
        </Pressable>
      );
    case "missed":
      return (
        <View style={s.missedRow}>
          <Text style={s.missedText} numberOfLines={2}>
            {t("talkCoordinator.log.didNotCome", { name: l.name })}
            {l.note ? ` · ${l.note}` : ""}
          </Text>
          <Pressable onPress={l.onUndo} hitSlop={8} accessibilityRole="button">
            <Text style={s.linkSmall}>{t("talkCoordinator.log.undoReplacement")}</Text>
          </Pressable>
        </View>
      );
    case "inEmpty":
      if (past) {
        return <Text style={s.pastEmpty}>{t("talkCoordinator.journal.nobodyCame")}</Text>;
      }
      return (
        <View style={s.emptyRow}>
          <Pressable
            onPress={l.onPress}
            style={({ pressed }) => [s.empty, l.urgent && s.emptyUrgent, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Text style={s.emptyText}>+ {t("talkCoordinator.journal.invite")}</Text>
            {l.left ? (
              <Text style={[s.emptyLeft, l.urgent && { color: C.warn }]}>{l.left}</Text>
            ) : null}
          </Pressable>
          <Pressable
            onPress={l.onSwap}
            hitSlop={10}
            style={s.swap}
            accessibilityRole="button"
            accessibilityLabel={t("talkCoordinator.swap.action")}
          >
            <Ionicons name="swap-vertical" size={16} color={C.faint} />
          </Pressable>
        </View>
      );
    case "out":
      return (
        <Pressable
          onPress={l.onPress}
          style={({ pressed }) => [s.ln, pressed && s.pressed]}
          accessibilityRole="button"
        >
          <Dir tone="out" icon="arrow-up" />
          <View style={s.lnBody}>
            {l.needsBrother ? (
              <Text style={[s.name, { color: C.warn }]}>
                {t("talkCoordinator.log.needsBrother")}
                {l.host ? <Text style={s.cong}> → {l.host}</Text> : null}
              </Text>
            ) : (
              <Text style={s.name}>
                {l.who ?? "—"}
                {l.host ? <Text style={s.cong}> → {l.host}</Text> : null}
              </Text>
            )}
            {l.day || l.talk ? (
              <Text style={s.subText}>{[l.day, l.talk].filter(Boolean).join(" · ")}</Text>
            ) : !l.needsBrother && !past ? (
              <Text style={s.missing}>{t("talkCoordinator.log.noTalk")}</Text>
            ) : null}
            <Restriction text={l.restriction} />
            {l.risk ? (
              <View style={s.risk}>
                <Text style={s.riskText}>
                  <Text style={s.riskBadge}>{t("talkCoordinator.log.inQuestion")} </Text>
                  {l.risk.text}
                </Text>
                <View style={s.row}>
                  <Pressable
                    onPress={l.risk.onAck}
                    disabled={l.risk.acking}
                    style={s.riskBtn}
                    accessibilityRole="button"
                  >
                    <Text style={s.riskBtnText}>{t("talkCoordinator.log.heGoes")}</Text>
                  </Pressable>
                  <Pressable onPress={l.onPress} style={[s.riskBtn, s.riskBtnMain]} accessibilityRole="button">
                    <Text style={s.riskBtnMainText}>{t("talkCoordinator.log.findReplacement")}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    case "outAdd":
      if (past) return null;
      return (
        <Pressable
          onPress={l.onPress}
          style={({ pressed }) => [s.empty, s.emptyOut, pressed && s.pressed]}
          accessibilityRole="button"
        >
          <Text style={[s.emptyText, { color: C.out }]}>+ {t("talkCoordinator.journal.trip")}</Text>
        </Pressable>
      );
  }
}

/* ------------------------------------------------------------------ wide */

/**
 * The table: the same lines, laid out by what they are about. A cell is the
 * line's own door — a tap opens what it shows.
 */
export function WeekTable({ weeks }: { weeks: WeekModel[] }) {
  const { t } = useTranslation();
  let month = "";
  return (
    <View style={s.table}>
      <View style={[s.tr, s.th]}>
        <Text style={[s.thText, s.cWeek]}>{t("talkCoordinator.journal.colWeek")}</Text>
        <Text style={[s.thText, s.cIn]}>{t("talkCoordinator.log.filter.incoming")}</Text>
        <Text style={[s.thText, s.cTalk]}>{t("talkCoordinator.journal.colTalk")}</Text>
        <Text style={[s.thText, s.cLunch]}>{t("talkCoordinator.journal.colLunch")}</Text>
        <Text style={[s.thText, s.cOut]}>{t("talkCoordinator.log.filter.outgoing")}</Text>
      </View>
      {weeks.map((w) => {
        const head = w.monthKey !== month;
        month = w.monthKey;
        const inLine = w.lines.find((l): l is InLine => l.kind === "in");
        const ev = w.lines.find((l): l is EventLine => l.kind === "event");
        const empty = w.lines.find((l): l is InEmptyLine => l.kind === "inEmpty");
        const missed = w.lines.filter((l): l is MissedLine => l.kind === "missed");
        const outs = w.lines.filter((l): l is OutLine => l.kind === "out");
        const add = w.lines.find((l): l is OutAddLine => l.kind === "outAdd");
        return (
          <Fragment key={w.monday}>
            {head ? (
              <View style={s.trMonth}>
                <Text style={s.trMonthText}>{w.monthTitle}</Text>
              </View>
            ) : null}
            <View style={[s.tr, w.current && s.trNow, w.past && s.trPast]}>
              <View style={s.cWeek}>
                <Text style={s.tdStrong}>{w.dayLabel}</Text>
                {w.current ? <Text style={s.tdNow}>{t("talkCoordinator.journal.now")}</Text> : null}
              </View>
              <View style={s.cIn}>
                {ev ? <LineView l={ev} past={w.past} /> : null}
                {inLine ? (
                  <Pressable onPress={inLine.onPress} accessibilityRole="button">
                    <Text style={s.tdStrong}>{inLine.name}</Text>
                    {inLine.cong ? <Text style={s.tdSub}>{inLine.cong}</Text> : null}
                    {inLine.cancelled ? (
                      <LineView l={{ ...inLine, talk: null, song: null, lunch: undefined, restriction: null }} past={w.past} />
                    ) : null}
                  </Pressable>
                ) : null}
                {!inLine && !ev && empty ? <LineView l={empty} past={w.past} /> : null}
                {missed.map((m) => (
                  <LineView key={m.id} l={m} past={w.past} />
                ))}
              </View>
              <Pressable style={s.cTalk} onPress={inLine?.onPress} disabled={!inLine}>
                {inLine?.talk ? (
                  <Text style={s.td}>
                    {inLine.special ? `${t("talkCoordinator.log.specialTalk")}: ` : ""}
                    {inLine.talk}
                  </Text>
                ) : inLine && !w.past ? (
                  <Text style={s.missing}>{t("talkCoordinator.journal.noTalk")}</Text>
                ) : ev?.theme ? (
                  <Text style={s.td}>{ev.theme}</Text>
                ) : (
                  <Text style={s.tdFaint}>—</Text>
                )}
                {inLine ? <Restriction text={inLine.restriction} /> : null}
                {inLine?.song ? (
                  <Text style={[s.meta, inLine.songRepeats && s.metaWarn]}>
                    {inLine.songRepeats
                      ? t("talkCoordinator.journal.songRepeats", { song: inLine.song })
                      : inLine.song}
                  </Text>
                ) : null}
              </Pressable>
              <Pressable style={s.cLunch} onPress={inLine?.onPress} disabled={!inLine}>
                {inLine && inLine.lunch !== undefined ? (
                  inLine.lunch ? (
                    <Text style={s.td}>{inLine.lunch}</Text>
                  ) : (
                    <Text style={s.tdWarn}>{t("talkCoordinator.journal.lunchNobodyShort")}</Text>
                  )
                ) : (
                  <Text style={s.tdFaint}>—</Text>
                )}
              </Pressable>
              <View style={s.cOut}>
                {outs.map((o) => (
                  <LineView key={o.id} l={o} past={w.past} />
                ))}
                {add && !w.past ? (
                  <Pressable onPress={add.onPress} hitSlop={6} accessibilityRole="button">
                    <Text style={[s.link, { color: C.out }]}>+ {t("talkCoordinator.journal.trip")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------- attention */

export function AttentionList({
  rows,
  emptyText,
}: {
  rows: AttentionRow[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <View style={s.allGood}>
        <Ionicons name="checkmark-circle-outline" size={28} color={C.ok} />
        <Text style={s.allGoodText}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View style={s.attn}>
      {rows.map((r, i) => {
        const fg =
          r.tone === "urgent" ? C.warn : r.tone === "song" ? C.warn : r.tone === "muted" ? C.faint : C.out;
        const bg =
          r.tone === "urgent" || r.tone === "song" ? C.warnBg : r.tone === "muted" ? "#f1f5f9" : C.outBg;
        return (
          <Pressable
            key={r.key}
            onPress={r.onPress}
            style={({ pressed }) => [s.attnRow, i > 0 && s.attnRowLine, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <View style={[s.attnIcon, { backgroundColor: bg }]}>
              <Ionicons name={r.icon} size={17} color={fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.attnTitle}>{r.title}</Text>
              {r.sub ? <Text style={s.attnSub}>{r.sub}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </Pressable>
        );
      })}
    </View>
  );
}

const shadow = {
  shadowColor: "#0f172a",
  shadowOpacity: 0.06,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

const s = StyleSheet.create({
  month: {
    fontFamily: FONT.extrabold,
    fontSize: 12,
    letterSpacing: 0.7,
    color: "#64748b",
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 2,
    marginHorizontal: 4,
  },
  card: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 18,
    paddingVertical: 12,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.05)",
    ...shadow,
  },
  cardNow: { borderWidth: 2, borderColor: C.brand },
  cardPast: { backgroundColor: "#fafbfc" },
  date: { width: 56, alignItems: "center", paddingTop: 1 },
  dayNum: { fontFamily: FONT.extrabold, fontSize: 23, lineHeight: 26, color: C.ink },
  fadedText: { color: "#64748b" },
  weekday: {
    fontFamily: FONT.bold,
    fontSize: 10.5,
    letterSpacing: 0.5,
    color: C.faint,
    textTransform: "uppercase",
  },
  nowTag: { marginTop: 6, backgroundColor: C.brand, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  nowText: { fontFamily: FONT.extrabold, fontSize: 9, color: "#fff", letterSpacing: 0.4 },
  lines: {
    flex: 1,
    minWidth: 0,
    gap: 10,
    borderLeftWidth: 1,
    borderLeftColor: C.line,
    paddingLeft: 12,
  },
  ln: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  lnBody: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.65 },
  dir: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  name: { fontFamily: FONT.bold, fontSize: 14.5, lineHeight: 19, color: C.ink },
  cong: { fontFamily: FONT.medium, fontSize: 12.5, color: "#64748b" },
  subText: { fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 17, color: C.sub, marginTop: 1 },
  special: { fontFamily: FONT.bold, color: C.ev },
  missing: { fontFamily: FONT.medium, fontSize: 12, color: C.faint, marginTop: 1 },
  meta: { fontFamily: FONT.semibold, fontSize: 12, color: C.sub, marginTop: 3 },
  metaOk: { color: C.ok },
  metaWarn: { color: C.warn },
  restrict: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: C.outBg,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
  },
  restrictText: { fontFamily: FONT.semibold, fontSize: 11.5, color: "#92400e" },
  cancelled: { marginTop: 6, backgroundColor: C.warnBg, borderRadius: 10, padding: 8, gap: 4 },
  cancelledText: { fontFamily: FONT.bold, fontSize: 12, color: "#9a3412" },
  row: { flexDirection: "row", gap: 14, flexWrap: "wrap", alignItems: "center", marginTop: 2 },
  link: { fontFamily: FONT.bold, fontSize: 12.5, color: C.in },
  linkSmall: { fontFamily: FONT.bold, fontSize: 11.5, color: C.in },
  swap: { paddingHorizontal: 2, paddingTop: 2 },
  aside: { marginTop: 4, gap: 2 },
  asideText: { fontFamily: FONT.regular, fontSize: 12, color: "#64748b" },
  asideLabel: { fontFamily: FONT.bold, color: C.out },
  missedRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 32 },
  missedText: { flex: 1, fontFamily: FONT.regular, fontSize: 11.5, color: C.faint },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  empty: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  emptyUrgent: { borderColor: "#fdba74", backgroundColor: "#fff7ed" },
  emptyOut: { flex: 0 },
  emptyText: { fontFamily: FONT.bold, fontSize: 13, color: C.in },
  emptyLeft: { fontFamily: FONT.semibold, fontSize: 11.5, color: C.faint },
  pastEmpty: { fontFamily: FONT.medium, fontSize: 12.5, color: C.faint },
  risk: { marginTop: 6, backgroundColor: "#fffbeb", borderRadius: 10, padding: 8, gap: 6 },
  riskText: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: "#78350f" },
  riskBadge: { fontFamily: FONT.extrabold, fontSize: 11, color: "#92400e" },
  riskBtn: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#d97706",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  riskBtnText: { fontFamily: FONT.bold, fontSize: 12.5, color: "#92400e" },
  riskBtnMain: { backgroundColor: "#d97706", borderColor: "#d97706" },
  riskBtnMainText: { fontFamily: FONT.bold, fontSize: 12.5, color: "#fff" },

  table: {
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)",
  },
  tr: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  th: { backgroundColor: "#f8fafc", paddingVertical: 9 },
  thText: { fontFamily: FONT.extrabold, fontSize: 10.5, letterSpacing: 0.6, color: "#64748b", textTransform: "uppercase" },
  trNow: { backgroundColor: "#f0fbfc" },
  trPast: { opacity: 0.8 },
  trMonth: { backgroundColor: "#f8fafc", paddingHorizontal: 14, paddingVertical: 6 },
  trMonthText: { fontFamily: FONT.extrabold, fontSize: 11, letterSpacing: 0.6, color: "#64748b", textTransform: "uppercase" },
  cWeek: { width: 96 },
  cIn: { flex: 1.3, gap: 6 },
  cTalk: { flex: 1.3 },
  cLunch: { width: 150 },
  cOut: { flex: 1.5, gap: 8 },
  td: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, color: C.ink },
  tdStrong: { fontFamily: FONT.bold, fontSize: 13.5, color: C.ink },
  tdSub: { fontFamily: FONT.regular, fontSize: 12, color: "#64748b", marginTop: 1 },
  tdNow: { fontFamily: FONT.bold, fontSize: 11, color: C.brand, marginTop: 2 },
  tdFaint: { fontFamily: FONT.regular, fontSize: 13, color: "#cbd5e1" },
  tdWarn: { fontFamily: FONT.semibold, fontSize: 12.5, color: C.warn },

  attn: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: "rgba(15,23,42,0.05)", ...shadow },
  attnRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  attnRowLine: { borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  attnIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  attnTitle: { fontFamily: FONT.bold, fontSize: 14, lineHeight: 19, color: C.ink },
  attnSub: { fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 17, color: "#64748b", marginTop: 1 },
  allGood: { alignItems: "center", gap: 8, paddingVertical: 40 },
  allGoodText: { fontFamily: FONT.medium, fontSize: 14, color: C.sub, textAlign: "center" },
});
