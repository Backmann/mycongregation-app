import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { FONT } from "../../lib/typography";
import { monthsApart, repeatOf } from "../../lib/talk-repeat";
import type { QuickBooking, QuickPerson, QuickTalk } from "./QuickVisit";

/**
 * THE JOURNAL AS A TABLE TO TYPE INTO (Lionel, 26 October 2026).
 *
 * A year of guests is entered on a big screen in one sitting, so here every
 * cell is a field: type or pick, Enter saves and goes down, Tab goes right,
 * Esc puts it back. Each cell saves itself when left — no row button — and
 * the line under the table always says what was saved last, with «Отменить».
 * Everything the visit form knows is said in the cell itself: who has not
 * been for long, a talk heard here within three years, the study's song, a
 * sister away that day, the same guest twice within two months, a week the
 * programme already has a speaker for. A guest taken off a filled week is
 * asked about first, with what goes with him (his talk, song, lunch bag).
 *
 * The screen does the writing (log.tsx): one path for the form, «Договорился»
 * and this table — the programme, the frozen past, the change journal.
 */

export type EditTrip = { id: string; text: string; warn: string | null };
export type EditRow = {
  monday: string;
  date: string;
  /** «Вс, 3» */
  dayLabel: string;
  /** The time, or why the week is closed. */
  sub: string | null;
  /** The visit side is closed (circuit visit, cancelled, past) — and why. */
  lock: string | null;
  /** The whole row is closed (a convention) — and why. */
  closed: string | null;
  /** The incoming entry of the week, when there is one. */
  entryId: string | null;
  /** The entry's last change, for the check against another's edit. */
  updatedAt: string | null;
  /** A brother of ours speaks here: no lunch bag. */
  local: boolean;
  who: { name: string; sub: string | null } | null;
  /** The guest's card or our brother — for his talks and the duplicate check. */
  personId: string | null;
  talkId: string | null;
  theme: string | null;
  song: number | null;
  lunch: { id: string; name: string } | null;
  trips: EditTrip[];
  /** Who the programme names for the week while the journal has nobody. */
  programmeSpeaker: string | null;
  canInvite: boolean;
};
export type EditSister = { id: string; name: string; last: string | null };
export type SpeakerChoice =
  | { kind: "guest"; id: string }
  | { kind: "local"; id: string }
  | { kind: "new"; name: string; cong: string | null };
export type CellResult = { ok: true } | { ok: false; note: string };

type Col = "who" | "talk" | "song" | "lunch";
const COLS: Col[] = ["who", "talk", "song", "lunch"];
const DUPLICATE_DAYS = 61;
const RECENT_MONTHS = 6;
const LIST_MAX = 8;

type Pending =
  | {
      kind: "speaker";
      monday: string;
      choice: SpeakerChoice;
      name: string;
      replace: boolean;
      /** The questions still to answer, in order. */
      ask: ("conflict" | "duplicate")[];
      dupDate: string | null;
    }
  | { kind: "remove"; monday: string };

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

export function EditTable({
  rows,
  speakers,
  brothers,
  sisters,
  absentOn,
  talks,
  studySongs,
  bookings,
  today,
  onSpeaker,
  onTalk,
  onSong,
  onLunch,
  onRemove,
  onTrip,
  onInvite,
  status,
  onUndo,
  undoing,
}: {
  rows: EditRow[];
  speakers: QuickPerson[];
  brothers: QuickPerson[];
  sisters: EditSister[];
  absentOn: (publisherId: string, date: string) => boolean;
  talks: QuickTalk[];
  studySongs: (monday: string) => number[];
  bookings: QuickBooking[];
  today: string;
  onSpeaker: (
    row: EditRow,
    choice: SpeakerChoice,
    replaceProgramme: boolean,
  ) => Promise<CellResult>;
  onTalk: (
    row: EditRow,
    talkId: string | null,
    theme: string | null,
  ) => Promise<CellResult>;
  onSong: (row: EditRow, song: number | null) => Promise<CellResult>;
  onLunch: (row: EditRow, sisterId: string | null) => Promise<CellResult>;
  onRemove: (row: EditRow) => Promise<CellResult>;
  /** A trip of ours: an existing one opens its form, null starts a new one. */
  onTrip: (row: EditRow, tripId: string | null) => void;
  onInvite: (row: EditRow) => void;
  status: { at: string; what: string } | null;
  onUndo: () => void;
  undoing: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState<{ monday: string; col: Col } | null>(
    null,
  );
  const [text, setText] = useState("");
  const [hl, setHl] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [newCong, setNewCong] = useState("");
  const picked = useRef(false);
  /**
   * Where the cursor goes once the journal has answered: a guest just
   * written into an empty week opens his talk — but the row learns it has a
   * visit only when the list comes back.
   */
  const [want, setWant] = useState<{ monday: string; col: Col } | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byNumber = useMemo(() => {
    const m = new Map<number, QuickTalk>();
    for (const tk of talks) m.set(tk.number, tk);
    return m;
  }, [talks]);
  const talkById = useMemo(() => {
    const m = new Map<string, QuickTalk>();
    for (const tk of talks) m.set(tk.id, tk);
    return m;
  }, [talks]);
  const personById = useMemo(() => {
    const m = new Map<string, QuickPerson>();
    for (const p of [...speakers, ...brothers]) m.set(p.id, p);
    return m;
  }, [speakers, brothers]);

  const fmt = (iso: string, f = "D MMM") =>
    dayjs(iso).locale(i18n.language).format(f).replace(/\.$/, "");
  const ago = (iso: string, base = today) => {
    const m = monthsApart(iso, base);
    if (m < 1) return t("talkCoordinator.quick.lessMonth");
    if (m < 12) return t("talkCoordinator.quick.months", { n: m });
    const y = Math.floor(m / 12);
    const r = m % 12;
    return r === 0
      ? t("talkCoordinator.quick.years", { y })
      : t("talkCoordinator.quick.yearsMonths", { y, m: r });
  };
  const key = (monday: string, col: Col) => `${monday}:${col}`;

  /** Whether a cell can be typed into. */
  const editable = (r: EditRow, col: Col): boolean => {
    if (r.closed || r.lock) return false;
    if (col === "who") return true;
    if (!r.entryId) return false;
    if (col === "lunch") return !r.local;
    return true;
  };

  const startEdit = (r: EditRow, col: Col) => {
    if (!editable(r, col)) return;
    picked.current = false;
    setNotes((n) => {
      const c = { ...n };
      delete c[key(r.monday, col)];
      return c;
    });
    setPending(null);
    setHl(0);
    setNewCong("");
    setActive({ monday: r.monday, col });
    setText(
      col === "talk"
        ? r.talkId
          ? String(talkById.get(r.talkId)?.number ?? "")
          : (r.theme ?? "")
        : col === "song"
          ? r.song
            ? String(r.song)
            : ""
          : "",
    );
  };
  const stop = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setActive(null);
    setText("");
  };
  /** The same column, the next row that takes it — or the next column. */
  const move = (r: EditRow, col: Col, how: "down" | "right") => {
    if (how === "right") {
      for (let c = COLS.indexOf(col) + 1; c < COLS.length; c++) {
        if (editable(r, COLS[c])) return startEdit(r, COLS[c]);
      }
    }
    const i = rows.findIndex((x) => x.monday === r.monday);
    for (let j = i + 1; j < rows.length; j++) {
      const target = how === "right" ? "who" : col;
      if (editable(rows[j], target)) return startEdit(rows[j], target);
    }
    stop();
  };

  const run = async (
    r: EditRow,
    col: Col,
    job: () => Promise<CellResult>,
    then?: "down" | "right",
  ) => {
    const k = key(r.monday, col);
    setSaving(k);
    stop();
    try {
      const res = await job();
      if (!res.ok) setNotes((n) => ({ ...n, [k]: res.note }));
      else if (col === "who" && then === "right" && !r.entryId)
        setWant({ monday: r.monday, col: "talk" });
      else if (then) move(r, col, then);
    } finally {
      setSaving(null);
    }
  };

  useEffect(() => {
    if (!want) return;
    const r = rows.find((x) => x.monday === want.monday);
    if (r && editable(r, want.col)) {
      setWant(null);
      startEdit(r, want.col);
    }
    // startEdit and editable read only what is passed in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, want]);
  useEffect(() => {
    if (!want) return;
    const id = setTimeout(() => setWant(null), 5000);
    return () => clearTimeout(id);
  }, [want]);

  // ---- The guest ----------------------------------------------------------
  const whoOptions = (r: EditRow) => {
    const q = text.trim().toLowerCase();
    const match = (p: QuickPerson) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.sub ?? "").toLowerCase().includes(q);
    const guests = speakers.filter(match);
    const ours = q ? brothers.filter(match) : [];
    const lineOf = (p: QuickPerson, ourBrother: boolean) => {
      const booked = bookings.find(
        (b) =>
          b.direction === "incoming" &&
          b.personId === p.id &&
          b.date !== r.date &&
          Math.abs(daysBetween(b.date, r.date)) <= DUPLICATE_DAYS,
      );
      if (booked)
        return {
          text: t("talkCoordinator.quick.bookedOn", { day: fmt(booked.date) }),
          tone: "warn" as const,
        };
      if (ourBrother)
        return { text: t("talkCoordinator.table.ourBrother"), tone: "busy" as const };
      if (!p.last)
        return { text: t("talkCoordinator.quick.neverCame"), tone: "ok" as const };
      if (monthsApart(p.last, today) < RECENT_MONTHS)
        return {
          text: t("talkCoordinator.quick.wasAgo", { span: ago(p.last) }),
          tone: "warn" as const,
        };
      return {
        text: t("talkCoordinator.quick.notFor", { span: ago(p.last) }),
        tone: "ok" as const,
      };
    };
    const opts: {
      key: string;
      choice: SpeakerChoice;
      name: string;
      line: string;
      tone: Tone;
    }[] = [];
    for (const p of guests.slice(0, LIST_MAX)) {
      const l = lineOf(p, false);
      opts.push({
        key: p.id,
        choice: { kind: "guest", id: p.id },
        name: p.name,
        line: [p.sub, l.text, p.talks.length ? t("talkCoordinator.table.talksOf", { list: p.talks.slice(0, 4).join(", ") }) : null]
          .filter(Boolean)
          .join(" · "),
        tone: l.tone,
      });
    }
    for (const p of ours.slice(0, 4)) {
      const l = lineOf(p, true);
      opts.push({
        key: `o-${p.id}`,
        choice: { kind: "local", id: p.id },
        name: p.name,
        line: l.text,
        tone: l.tone,
      });
    }
    return opts;
  };

  const chooseSpeaker = (r: EditRow, choice: SpeakerChoice, name: string) => {
    picked.current = true;
    const ask: ("conflict" | "duplicate")[] = [];
    if (!r.entryId && r.programmeSpeaker && r.programmeSpeaker !== name)
      ask.push("conflict");
    const pid = choice.kind === "new" ? null : choice.id;
    const dup = pid
      ? bookings
          .filter(
            (b) =>
              // A visit with us, not a trip of ours: our brother speaking here and
              // going elsewhere is a lawful pair (13 September 2026, 26 October).
              b.direction === "incoming" &&
              b.personId === pid &&
              b.date !== r.date &&
              Math.abs(daysBetween(b.date, r.date)) <= DUPLICATE_DAYS,
          )
          .sort(
            (a, b) =>
              Math.abs(daysBetween(a.date, r.date)) -
              Math.abs(daysBetween(b.date, r.date)),
          )[0]
      : undefined;
    if (dup) ask.push("duplicate");
    stop();
    if (ask.length > 0) {
      setPending({
        kind: "speaker",
        monday: r.monday,
        choice,
        name,
        replace: false,
        ask,
        dupDate: dup?.date ?? null,
      });
      return;
    }
    void run(r, "who", () => onSpeaker(r, choice, false), "right");
  };
  const answer = (r: EditRow, yes: boolean) => {
    if (!pending) return;
    if (!yes) {
      setPending(null);
      return;
    }
    if (pending.kind === "remove") {
      setPending(null);
      void run(r, "who", () => onRemove(r));
      return;
    }
    const [first, ...rest] = pending.ask;
    const replace = pending.replace || first === "conflict";
    if (rest.length > 0) {
      setPending({ ...pending, ask: rest, replace });
      return;
    }
    const choice = pending.choice;
    setPending(null);
    void run(r, "who", () => onSpeaker(r, choice, replace), "right");
  };

  // ---- The talk -----------------------------------------------------------
  const talkFlag = (tk: QuickTalk, date: string) => {
    if (!tk.isActive)
      return { text: t("talkCoordinator.quick.retired"), tone: "warn" as Tone };
    const rep = repeatOf(tk.heard, date);
    if (rep)
      return {
        text:
          rep < date
            ? t("talkCoordinator.quick.heardAgo", { span: ago(rep, date) })
            : t("talkCoordinator.quick.heardNext", { day: fmt(rep) }),
        tone: "warn" as Tone,
      };
    return tk.heard.some((d) => d < date)
      ? { text: t("talkCoordinator.quick.notIn3"), tone: "ok" as Tone }
      : { text: t("talkCoordinator.quick.neverHeard"), tone: "ok" as Tone };
  };
  const commitTalk = (r: EditRow, then?: "down" | "right") => {
    const v = text.trim();
    const n = /^\d{1,3}$/.test(v) ? Number(v) : null;
    const cur = r.talkId ? String(talkById.get(r.talkId)?.number ?? "") : (r.theme ?? "");
    if (v === cur) {
      if (then) move(r, "talk", then);
      else stop();
      return;
    }
    if (n !== null && !byNumber.get(n)) {
      setNotes((x) => ({ ...x, [key(r.monday, "talk")]: t("talkCoordinator.quick.noSuchTalk") }));
      stop();
      return;
    }
    const talkId = n !== null ? byNumber.get(n)!.id : null;
    const theme = n === null && v ? v : null;
    void run(r, "talk", () => onTalk(r, talkId, theme), then);
  };

  // ---- The song -----------------------------------------------------------
  const commitSong = (r: EditRow, then?: "down" | "right") => {
    const v = text.trim();
    const n = v ? Number(v) : null;
    if ((n ?? null) === (r.song ?? null)) {
      if (then) move(r, "song", then);
      else stop();
      return;
    }
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 999)) {
      setNotes((x) => ({ ...x, [key(r.monday, "song")]: t("talkCoordinator.table.badSong") }));
      stop();
      return;
    }
    void run(r, "song", () => onSong(r, n), then);
  };

  // ---- The lunch bag -------------------------------------------------------
  const lunchOptions = (r: EditRow) => {
    const q = text.trim().toLowerCase();
    return sisters
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (a.last ?? "").localeCompare(b.last ?? "") ||
          a.name.localeCompare(b.name),
      )
      .slice(0, LIST_MAX)
      .map((p) => {
        const away = absentOn(p.id, r.date);
        return {
          key: p.id,
          name: p.name,
          line: away
            ? t("talkCoordinator.table.awayThatDay")
            : p.last
              ? t("talkCoordinator.table.broughtAgo", { span: ago(p.last) })
              : t("talkCoordinator.table.neverBrought"),
          tone: (away ? "warn" : "ok") as Tone,
        };
      });
  };

  // ---- Keys ---------------------------------------------------------------
  type KeyEv = { nativeEvent: { key: string }; preventDefault?: () => void };
  const onKey = (
    r: EditRow,
    col: Col,
    e: KeyEv,
    optCount: number,
    pickHl: () => void,
  ) => {
    const k = e.nativeEvent.key;
    if (k === "Escape") {
      stop();
    } else if (k === "ArrowDown" && optCount > 0) {
      e.preventDefault?.();
      setHl((h) => Math.min(optCount - 1, h + 1));
    } else if (k === "ArrowUp" && optCount > 0) {
      e.preventDefault?.();
      setHl((h) => Math.max(0, h - 1));
    } else if (k === "Tab") {
      e.preventDefault?.();
      if (col === "talk") commitTalk(r, "right");
      else if (col === "song") commitSong(r, "right");
      else if (text.trim() && optCount > 0) pickHl();
      else move(r, col, "right");
    } else if (k === "Enter") {
      if (col === "talk") commitTalk(r, "down");
      else if (col === "song") commitSong(r, "down");
      else if (optCount > 0 && (text.trim() || col === "lunch")) pickHl();
      else move(r, col, "down");
    }
  };
  /** Leaving a free field saves it; leaving a list only closes it. */
  const onBlur = (r: EditRow, col: Col) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      if (picked.current) return;
      if (col === "talk") commitTalk(r);
      else if (col === "song") commitSong(r);
      else stop();
    }, 180);
  };

  // ---- Render ---------------------------------------------------------------
  const cellNote = (r: EditRow, col: Col) => notes[key(r.monday, col)];

  const renderWho = (r: EditRow) => {
    const on = active?.monday === r.monday && active.col === "who";
    const k = key(r.monday, "who");
    if (r.closed || r.lock) return null;
    if (on) {
      const opts = whoOptions(r);
      const q = text.trim();
      const pickHl = () => {
        const o = opts[hl];
        if (o) chooseSpeaker(r, o.choice, o.name);
      };
      return (
        <View style={[st.cellWrap, st.top]}>
          <TextInput
            style={[st.input, st.cell, st.cellFocus]}
            value={text}
            onChangeText={(v) => {
              setText(v);
              setHl(0);
            }}
            placeholder={r.who?.name ?? t("talkCoordinator.quick.guestSearch")}
            placeholderTextColor="#94a3b8"
            autoFocus
            onKeyPress={(e) => onKey(r, "who", e as unknown as KeyEv, opts.length, pickHl)}
            onSubmitEditing={() => undefined}
            onBlur={() => onBlur(r, "who")}
            testID="table-who-input"
          />
          <View style={st.dd}>
            {opts.map((o, i) => (
              <Pressable
                key={o.key}
                style={[st.opt, i === hl && st.optHl]}
                onPress={() => chooseSpeaker(r, o.choice, o.name)}
                accessibilityRole="button"
                testID="table-who-option"
              >
                <Text style={st.optName}>{o.name}</Text>
                <Text style={[st.optLine, TONE[o.tone]]} numberOfLines={1}>
                  {o.line}
                </Text>
              </Pressable>
            ))}
            {q ? (
              <View style={st.newBox}>
                <Text style={st.newTitle}>
                  + {t("talkCoordinator.table.newGuest", { name: q })}
                </Text>
                <View style={st.newRow}>
                  <TextInput
                    style={[st.newInput]}
                    value={newCong}
                    onChangeText={setNewCong}
                    onFocus={() => {
                      picked.current = true;
                    }}
                    placeholder={t("talkCoordinator.quick.newCong")}
                    placeholderTextColor="#94a3b8"
                  />
                  <Pressable
                    style={st.newBtn}
                    onPress={() =>
                      chooseSpeaker(r, { kind: "new", name: q, cong: newCong.trim() || null }, q)
                    }
                    accessibilityRole="button"
                  >
                    <Text style={st.newBtnText}>{t("talkCoordinator.table.add")}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {r.entryId ? (
              <Pressable
                style={st.opt}
                onPress={() => {
                  picked.current = true;
                  stop();
                  setPending({ kind: "remove", monday: r.monday });
                }}
                accessibilityRole="button"
                testID="table-remove"
              >
                <Text style={st.removeText}>{t("talkCoordinator.table.removeVisit")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    }
    const dup = r.personId
      ? bookings.find(
          (b) =>
            // A visit with us, not a trip of ours: our brother speaking here and
            // going elsewhere is a lawful pair (13 September 2026, 26 October).
            b.direction === "incoming" &&
            b.personId === r.personId &&
            b.date !== r.date &&
            Math.abs(daysBetween(b.date, r.date)) <= DUPLICATE_DAYS,
        )
      : undefined;
    return (
      <View style={st.cellWrap}>
        <Pressable
          style={[st.cell, dup && st.cellWarn]}
          onPress={() => startEdit(r, "who")}
          accessibilityRole="button"
          testID="table-who"
        >
          {r.who ? (
            <>
              <Text style={st.v} numberOfLines={1}>
                {r.who.name}
              </Text>
              <Text style={[st.s, dup && TONE.warn]} numberOfLines={2}>
                {dup
                  ? t("talkCoordinator.quick.bookedOn", { day: fmt(dup.date) })
                  : r.local
                    ? t("talkCoordinator.table.ourBrother")
                    : (r.who.sub ?? "")}
              </Text>
            </>
          ) : (
            <Text style={st.ph}>{t("talkCoordinator.table.whoPh")}</Text>
          )}
          {saving === k ? <ActivityIndicator size="small" style={st.spin} /> : null}
        </Pressable>
        {cellNote(r, "who") ? <Text style={st.note}>{cellNote(r, "who")}</Text> : null}
      </View>
    );
  };

  const renderTalk = (r: EditRow) => {
    const on = active?.monday === r.monday && active.col === "talk";
    const k = key(r.monday, "talk");
    if (!r.entryId) {
      return (
        <View style={[st.cell, st.cellWait]}>
          <Text style={st.ph}>{t("talkCoordinator.table.talkPh")}</Text>
          <Text style={[st.s, { color: "#0369a1" }]}>{t("talkCoordinator.table.waitsGuest")}</Text>
        </View>
      );
    }
    const person = r.personId ? personById.get(r.personId) : undefined;
    if (on) {
      const reps = (person?.talks ?? [])
        .map((n) => byNumber.get(n))
        .filter((x): x is QuickTalk => !!x)
        .sort((a, b) => a.number - b.number);
      const pickHl = () => {
        const tk = reps[hl];
        if (!tk) return;
        picked.current = true;
        void run(r, "talk", () => onTalk(r, tk.id, null), "down");
      };
      const typedN = /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : null;
      const typed = typedN !== null ? byNumber.get(typedN) : undefined;
      return (
        <View style={[st.cellWrap, st.top]}>
          <TextInput
            style={[st.input, st.cell, st.cellFocus]}
            value={text}
            onChangeText={(v) => {
              setText(v);
              setHl(-1);
            }}
            placeholder={t("talkCoordinator.quick.typeTalkOrTheme")}
            placeholderTextColor="#94a3b8"
            autoFocus
            onKeyPress={(e) =>
              onKey(r, "talk", e as unknown as KeyEv, hl >= 0 ? reps.length : 0, pickHl)
            }
            onBlur={() => onBlur(r, "talk")}
            testID="table-talk-input"
          />
          {typed ? (
            <View style={st.dd}>
              <View style={st.opt}>
                <Text style={st.optName}>
                  №{typed.number} {typed.title}
                </Text>
                <Text style={[st.optLine, TONE[talkFlag(typed, r.date).tone]]}>
                  {talkFlag(typed, r.date).text}
                </Text>
              </View>
            </View>
          ) : reps.length > 0 ? (
            <View style={st.dd}>
              <Text style={st.ddOver}>{t("talkCoordinator.quick.histTalks")}</Text>
              {reps.map((tk, i) => {
                const f = talkFlag(tk, r.date);
                return (
                  <Pressable
                    key={tk.id}
                    style={[st.opt, i === hl && st.optHl]}
                    onPress={() => {
                      picked.current = true;
                      void run(r, "talk", () => onTalk(r, tk.id, null), "down");
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={st.optName} numberOfLines={1}>
                      №{tk.number} {tk.title}
                    </Text>
                    <Text style={[st.optLine, TONE[f.tone]]}>{f.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      );
    }
    const tk = r.talkId ? talkById.get(r.talkId) : undefined;
    const flag = tk ? talkFlag(tk, r.date) : null;
    return (
      <View style={st.cellWrap}>
        <Pressable
          style={[st.cell, flag?.tone === "warn" && st.cellWarn]}
          onPress={() => startEdit(r, "talk")}
          accessibilityRole="button"
          testID="table-talk"
        >
          {tk ? (
            <>
              <Text style={st.v} numberOfLines={1}>
                №{tk.number} {tk.title}
              </Text>
              {flag ? <Text style={[st.s, TONE[flag.tone]]}>{flag.text}</Text> : null}
            </>
          ) : r.theme ? (
            <>
              <Text style={st.v} numberOfLines={2}>
                {r.theme}
              </Text>
              <Text style={st.s}>{t("talkCoordinator.table.special")}</Text>
            </>
          ) : (
            <Text style={st.ph}>{t("talkCoordinator.table.talkPh")}</Text>
          )}
          {saving === k ? <ActivityIndicator size="small" style={st.spin} /> : null}
        </Pressable>
        {cellNote(r, "talk") ? <Text style={st.note}>{cellNote(r, "talk")}</Text> : null}
      </View>
    );
  };

  const renderSong = (r: EditRow) => {
    const on = active?.monday === r.monday && active.col === "song";
    const k = key(r.monday, "song");
    if (!r.entryId)
      return (
        <View style={[st.cell, st.cellLock]}>
          <Text style={[st.ph, { textAlign: "center" }]}>—</Text>
        </View>
      );
    if (on)
      return (
        <View style={[st.cellWrap, st.top]}>
          <TextInput
            style={[st.input, st.cell, st.cellFocus]}
            value={text}
            onChangeText={(v) => setText(v.replace(/[^\d]/g, "").slice(0, 3))}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="№"
            placeholderTextColor="#94a3b8"
            autoFocus
            onKeyPress={(e) => onKey(r, "song", e as unknown as KeyEv, 0, () => undefined)}
            onBlur={() => onBlur(r, "song")}
            testID="table-song-input"
          />
        </View>
      );
    const bad = r.song !== null && studySongs(r.monday).includes(r.song);
    return (
      <View style={st.cellWrap}>
        <Pressable
          style={[st.cell, bad && st.cellWarn]}
          onPress={() => startEdit(r, "song")}
          accessibilityRole="button"
          testID="table-song"
        >
          {r.song ? (
            <>
              <Text style={st.v}>{r.song}</Text>
              {bad ? <Text style={[st.s, TONE.warn]}>{t("talkCoordinator.table.studySong")}</Text> : null}
            </>
          ) : (
            <Text style={st.ph}>№</Text>
          )}
          {saving === k ? <ActivityIndicator size="small" style={st.spin} /> : null}
        </Pressable>
        {cellNote(r, "song") ? <Text style={st.note}>{cellNote(r, "song")}</Text> : null}
      </View>
    );
  };

  const renderLunch = (r: EditRow) => {
    const on = active?.monday === r.monday && active.col === "lunch";
    const k = key(r.monday, "lunch");
    if (!r.entryId || r.local)
      return (
        <View style={[st.cell, st.cellLock]}>
          <Text style={st.ph}>
            {r.local ? "—" : t("talkCoordinator.table.afterGuest")}
          </Text>
        </View>
      );
    if (on) {
      const opts = lunchOptions(r);
      const pickHl = () => {
        const o = opts[hl];
        if (!o) return;
        picked.current = true;
        void run(r, "lunch", () => onLunch(r, o.key), "down");
      };
      return (
        <View style={[st.cellWrap, st.top]}>
          <TextInput
            style={[st.input, st.cell, st.cellFocus]}
            value={text}
            onChangeText={(v) => {
              setText(v);
              setHl(0);
            }}
            placeholder={r.lunch?.name ?? t("talkCoordinator.table.lunchPh")}
            placeholderTextColor="#94a3b8"
            autoFocus
            onKeyPress={(e) => onKey(r, "lunch", e as unknown as KeyEv, opts.length, pickHl)}
            onBlur={() => onBlur(r, "lunch")}
            testID="table-lunch-input"
          />
          <View style={st.dd}>
            {opts.map((o, i) => (
              <Pressable
                key={o.key}
                style={[st.opt, i === hl && st.optHl]}
                onPress={() => {
                  picked.current = true;
                  void run(r, "lunch", () => onLunch(r, o.key), "down");
                }}
                accessibilityRole="button"
              >
                <Text style={st.optName}>{o.name}</Text>
                <Text style={[st.optLine, TONE[o.tone]]}>{o.line}</Text>
              </Pressable>
            ))}
            {r.lunch ? (
              <Pressable
                style={st.opt}
                onPress={() => {
                  picked.current = true;
                  void run(r, "lunch", () => onLunch(r, null));
                }}
                accessibilityRole="button"
              >
                <Text style={st.removeText}>{t("talkCoordinator.table.nobody")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    }
    const away = r.lunch ? absentOn(r.lunch.id, r.date) : false;
    const last = r.lunch ? sisters.find((x) => x.id === r.lunch!.id)?.last : null;
    return (
      <View style={st.cellWrap}>
        <Pressable
          style={[st.cell, away && st.cellWarn]}
          onPress={() => startEdit(r, "lunch")}
          accessibilityRole="button"
          testID="table-lunch"
        >
          {r.lunch ? (
            <>
              <Text style={st.v} numberOfLines={1}>
                {r.lunch.name}
              </Text>
              {away ? (
                <Text style={[st.s, TONE.warn]}>{t("talkCoordinator.table.awayThatDay")}</Text>
              ) : last && last < r.date ? (
                <Text style={st.s}>{t("talkCoordinator.table.broughtAgo", { span: ago(last, r.date) })}</Text>
              ) : null}
            </>
          ) : (
            <Text style={st.ph}>{t("talkCoordinator.table.lunchPh")}</Text>
          )}
          {saving === k ? <ActivityIndicator size="small" style={st.spin} /> : null}
        </Pressable>
        {cellNote(r, "lunch") ? <Text style={st.note}>{cellNote(r, "lunch")}</Text> : null}
      </View>
    );
  };

  const renderTrips = (r: EditRow) => (
    <View style={[st.cell, st.trips]}>
      {r.trips.map((tr) => (
        <Pressable
          key={tr.id}
          onPress={() => onTrip(r, tr.id)}
          accessibilityRole="button"
        >
          <Text style={st.v} numberOfLines={2}>
            {tr.text}
          </Text>
          {tr.warn ? <Text style={[st.s, TONE.warn]}>{tr.warn}</Text> : null}
        </Pressable>
      ))}
      <Pressable onPress={() => onTrip(r, null)} accessibilityRole="button" testID="table-trip-add">
        <Text style={r.trips.length ? st.addMore : st.ph}>
          {r.trips.length ? `+ ${t("talkCoordinator.table.moreTrip")}` : t("talkCoordinator.table.tripPh")}
        </Text>
      </Pressable>
    </View>
  );

  const renderQuestion = (r: EditRow) => {
    if (!pending || pending.monday !== r.monday) return null;
    let body = "";
    let yes = "";
    let no = "";
    if (pending.kind === "remove") {
      const goes = [
        r.talkId
          ? `${t("talkCoordinator.table.goesTalk")} №${talkById.get(r.talkId)?.number ?? ""}`
          : r.theme
            ? `${t("talkCoordinator.table.goesTalk")} «${r.theme}»`
            : null,
        r.song ? `${t("talkCoordinator.table.goesSong")} ${r.song}` : null,
        r.lunch ? t("talkCoordinator.table.goesLunch", { name: r.lunch.name }) : null,
      ].filter(Boolean);
      body =
        t("talkCoordinator.table.removeQ", {
          name: r.who?.name ?? "",
          day: fmt(r.date, "D MMMM"),
        }) + (goes.length ? ` ${t("talkCoordinator.table.goesWith", { list: goes.join(", ") })}` : "");
      yes = t("talkCoordinator.table.remove");
      no = t("talkCoordinator.table.keep");
    } else if (pending.ask[0] === "conflict") {
      body = t("talkCoordinator.table.conflictQ", {
        who: r.programmeSpeaker ?? "",
        name: pending.name,
      });
      yes = t("talkCoordinator.table.replace");
      no = t("talkCoordinator.table.keepOther", { who: r.programmeSpeaker ?? "" });
    } else {
      body = t("talkCoordinator.quick.dupIn", {
        name: pending.name,
        day: fmt(pending.dupDate ?? r.date, "D MMMM"),
        date: fmt(r.date, "D MMMM"),
      });
      yes = t("talkCoordinator.table.yesBook");
      no = t("talkCoordinator.table.no");
    }
    return (
      <View style={st.q}>
        <Text style={st.qText}>{body}</Text>
        <View style={st.qBtns}>
          <Pressable style={st.qYes} onPress={() => answer(r, true)} accessibilityRole="button" testID="table-q-yes">
            <Text style={st.qYesText}>{yes}</Text>
          </Pressable>
          <Pressable style={st.qNo} onPress={() => answer(r, false)} accessibilityRole="button" testID="table-q-no">
            <Text style={st.qNoText}>{no}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  let month = "";
  return (
    <View>
      <View style={st.table}>
        <View style={[st.tr, st.th]}>
          <Text style={[st.thText, st.cWeek]}>{t("talkCoordinator.table.week")}</Text>
          <Text style={[st.thText, st.cWho]}>{t("talkCoordinator.log.filter.incoming")}</Text>
          <Text style={[st.thText, st.cTalk]}>{t("talkCoordinator.table.talk")}</Text>
          <Text style={[st.thText, st.cSong]}>{t("talkCoordinator.table.song")}</Text>
          <Text style={[st.thText, st.cLunch]}>{t("talkCoordinator.table.lunch")}</Text>
          <Text style={[st.thText, st.cTrips]}>{t("talkCoordinator.log.filter.outgoing")}</Text>
          <View style={st.cAct} />
        </View>
        {rows.map((r) => {
          const m = r.date.slice(0, 7);
          const head = m !== month;
          month = m;
          const isActive = active?.monday === r.monday || pending?.monday === r.monday;
          return (
            <View key={r.monday} style={isActive ? st.rowActive : undefined}>
              {head ? (
                <Text style={st.mon}>
                  {dayjs(`${m}-01`).locale(i18n.language).format("MMMM YYYY")}
                </Text>
              ) : null}
              <View style={st.tr} testID={`table-row-${r.monday}`}>
                <View style={st.cWeek}>
                  <Text style={st.wk}>{r.dayLabel}</Text>
                  {r.sub ? <Text style={st.wkSub}>{r.sub}</Text> : null}
                </View>
                {r.closed ? (
                  <View style={[st.cell, st.cellLock, { flex: 1 }]}>
                    <Text style={st.lockText}>{r.closed}</Text>
                  </View>
                ) : r.lock ? (
                  <>
                    <View style={[st.cell, st.cellLock, st.cLockSpan]}>
                      <Text style={st.lockText}>{r.lock}</Text>
                    </View>
                    <View style={st.cTrips}>{renderTrips(r)}</View>
                    <View style={st.cAct} />
                  </>
                ) : (
                  <>
                    <View style={st.cWho}>
                      {renderWho(r)}
                      {renderQuestion(r)}
                    </View>
                    <View style={st.cTalk}>{renderTalk(r)}</View>
                    <View style={st.cSong}>{renderSong(r)}</View>
                    <View style={st.cLunch}>{renderLunch(r)}</View>
                    <View style={st.cTrips}>{renderTrips(r)}</View>
                    <View style={st.cAct}>
                      {r.canInvite ? (
                        <Pressable
                          style={st.env}
                          onPress={() => onInvite(r)}
                          accessibilityRole="button"
                          accessibilityLabel={t("talkCoordinator.desk.msgGuest")}
                        >
                          <Ionicons name="mail-outline" size={16} color="#0f4c5a" />
                        </Pressable>
                      ) : null}
                    </View>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>
      <View style={st.foot}>
        {status ? (
          <>
            <View style={st.dot} />
            <Text style={st.footText}>
              {t("talkCoordinator.table.savedAt", { at: status.at, what: status.what })}
            </Text>
            <Pressable onPress={onUndo} disabled={undoing} hitSlop={6} accessibilityRole="button" testID="table-undo">
              <Text style={st.footLink}>
                {undoing ? "…" : t("talkCoordinator.table.undo")}
              </Text>
            </Pressable>
          </>
        ) : (
          <Text style={st.footText}>{t("talkCoordinator.table.hint")}</Text>
        )}
      </View>
    </View>
  );
}

type Tone = "ok" | "warn" | "busy";
const TONE = StyleSheet.create({
  ok: { color: "#0f766e" },
  warn: { color: "#c2410c" },
  busy: { color: "#94a3b8" },
});

const st = StyleSheet.create({
  table: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)",
  },
  tr: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#eef2f6",
  },
  th: { borderTopWidth: 0, paddingTop: 12, paddingBottom: 8 },
  thText: {
    fontFamily: FONT.extrabold,
    fontSize: 10.5,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: "#64748b",
  },
  rowActive: { zIndex: 30, position: "relative" },
  mon: {
    fontFamily: FONT.extrabold,
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: "#94a3b8",
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 5,
    borderTopWidth: 1,
    borderTopColor: "#eef2f6",
    backgroundColor: "#fafbfc",
  },
  cWeek: { width: 84 },
  cWho: { flex: 1.25, minWidth: 0 },
  cTalk: { flex: 1.35, minWidth: 0 },
  cSong: { width: 84 },
  cLunch: { flex: 1, minWidth: 0 },
  cTrips: { flex: 1.25, minWidth: 0 },
  cAct: { width: 34, alignItems: "center", paddingTop: 6 },
  // The visit's four columns as one: their shares, plus the song's fixed
  // width and the three gaps between them.
  cLockSpan: { flexGrow: 1.25 + 1.35 + 1, flexShrink: 1, flexBasis: 84 + 30, minWidth: 0 },
  wk: { fontFamily: FONT.extrabold, fontSize: 14, color: "#0f172a", paddingTop: 9 },
  wkSub: { fontFamily: FONT.semibold, fontSize: 11, color: "#94a3b8", marginTop: 1 },
  cellWrap: { position: "relative" },
  top: { zIndex: 40 },
  cell: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
    backgroundColor: "#ffffff",
    justifyContent: "center",
  },
  input: { fontFamily: FONT.semibold, fontSize: 13.5, color: "#0f172a" },
  cellFocus: {
    borderWidth: 2,
    borderColor: "#0f4c5a",
    paddingHorizontal: 9,
    paddingVertical: 7,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as never } : {}),
  },
  cellWarn: { backgroundColor: "#fff7ed", borderColor: "#fdba74" },
  cellWait: { borderStyle: "dashed", borderColor: "#7dd3fc", backgroundColor: "#f0f9ff" },
  cellLock: { backgroundColor: "#f1f5f9", borderStyle: "dashed" },
  lockText: { fontFamily: FONT.medium, fontSize: 12.5, color: "#94a3b8", lineHeight: 17 },
  v: { fontFamily: FONT.bold, fontSize: 13.5, color: "#0f172a", lineHeight: 17 },
  s: { fontFamily: FONT.semibold, fontSize: 11.5, color: "#64748b", marginTop: 1 },
  ph: { fontFamily: FONT.regular, fontSize: 13, color: "#94a3b8" },
  spin: { position: "absolute", right: 8, top: 11 },
  note: { fontFamily: FONT.semibold, fontSize: 11.5, color: "#c2410c", marginTop: 4 },
  trips: { gap: 6 },
  addMore: { fontFamily: FONT.extrabold, fontSize: 12, color: "#0369a1" },
  dd: {
    position: "absolute",
    top: 44,
    left: 0,
    width: 330,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
    zIndex: 50,
  },
  ddOver: {
    fontFamily: FONT.extrabold,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: "#94a3b8",
    paddingHorizontal: 9,
    paddingTop: 6,
    paddingBottom: 3,
  },
  opt: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9 },
  optHl: { backgroundColor: "#ecfeff" },
  optName: { fontFamily: FONT.bold, fontSize: 13.5, color: "#0f172a" },
  optLine: { fontFamily: FONT.semibold, fontSize: 11.5, marginTop: 1 },
  removeText: { fontFamily: FONT.extrabold, fontSize: 13, color: "#dc2626" },
  newBox: { paddingHorizontal: 9, paddingVertical: 7, gap: 6, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  newTitle: { fontFamily: FONT.extrabold, fontSize: 13, color: "#0369a1" },
  newRow: { flexDirection: "row", gap: 6 },
  newInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontFamily: FONT.regular,
    fontSize: 13,
    color: "#0f172a",
  },
  newBtn: { backgroundColor: "#0f4c5a", borderRadius: 9, paddingHorizontal: 12, justifyContent: "center" },
  newBtnText: { fontFamily: FONT.extrabold, fontSize: 12.5, color: "#ffffff" },
  q: {
    marginTop: 6,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  qText: { fontFamily: FONT.semibold, fontSize: 12.5, lineHeight: 17, color: "#9a3412" },
  qBtns: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  qYes: { backgroundColor: "#0f4c5a", borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6 },
  qYesText: { fontFamily: FONT.extrabold, fontSize: 12, color: "#ffffff" },
  qNo: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6 },
  qNoText: { fontFamily: FONT.extrabold, fontSize: 12, color: "#0f172a" },
  env: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#ecfeff",
    alignItems: "center",
    justifyContent: "center",
  },
  foot: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" },
  footText: { fontFamily: FONT.medium, fontSize: 12.5, color: "#64748b" },
  footLink: { fontFamily: FONT.extrabold, fontSize: 12.5, color: "#0369a1" },
});
