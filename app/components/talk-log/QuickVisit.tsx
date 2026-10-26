import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { Sheet } from "../Sheet";
import { FONT } from "../../lib/typography";
import { monthsApart, repeatOf } from "../../lib/talk-repeat";
import { MessagePanel } from "./MessagePanel";

/**
 * «ДОГОВОРИЛСЯ» — ONE FORM FOR WHAT WAS JUST ARRANGED (Lionel, 26 October 2026).
 *
 * Schedules come by phone, by hand, from memory — rarely as a table. So the
 * entry has to take ten seconds right after the conversation: the week in one
 * tap from the free ones, the person from the directory (longest unseen
 * first), the talk in one tap from his own, with what the congregation heard
 * in the last three years in sight. Whatever is missing — the talk, the song,
 * the lunch bag — the weekly summary asks for later; the full form is one tap
 * away for everything else.
 *
 * It writes nothing itself: the journal screen saves the draft, so the one
 * save path (programme conflicts, the frozen-programme notice) stays one.
 */

export type QuickDirection = "incoming" | "outgoing";

export type QuickPerson = {
  id: string;
  name: string;
  /** His congregation — for a guest. */
  sub: string | null;
  /** Last time with us (a guest) or last trip (ours), YYYY-MM-DD. */
  last: string | null;
  /** The next one already booked, YYYY-MM-DD. */
  next: string | null;
  /** The numbers of his talks — a guest's card, or what ours has given. */
  talks: number[];
};
export type QuickWeek = { monday: string; date: string };
export type QuickTalk = {
  id: string;
  number: number;
  title: string;
  isActive: boolean;
  /** The days it was or will be heard in our hall. */
  heard: string[];
};
export type QuickCong = { id: string; name: string; meetingDow: number | null };
export type QuickBooking = {
  direction: QuickDirection;
  personId: string;
  date: string;
};
export type QuickDraft = {
  direction: QuickDirection;
  monday: string;
  date: string;
  visitingSpeakerId: string | null;
  speakerName: string | null;
  speakerCongregation: string | null;
  publisherId: string | null;
  hostCongregationId: string | null;
  publicTalkId: string | null;
  specialTheme: string | null;
};

/** The same person booked within two months: asked about, never refused. */
const DUPLICATE_DAYS = 61;
const SHOWN = 6;
/** Seen with us less than this long ago: early to ask him again. */
const RECENT_MONTHS = 6;
const WEEKS_SHOWN = 5;

function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** «вс, 29 ноября» → «Вс, 29 ноября». */
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

export function QuickVisit({
  visible,
  start,
  onClose,
  freeIn,
  allWeeks,
  speakers,
  brothers,
  congregations,
  talks,
  bookings,
  today,
  saving,
  onSave,
  onFullForm,
  seriesWeeks = [],
  onSaveSeries,
  invitationFor,
}: {
  visible: boolean;
  /**
   * Which way and, from an empty week, which week. `series`: «по одной
   * неделе» — the empty weeks one after another (26 October 2026).
   */
  start: { direction: QuickDirection; monday?: string | null; series?: boolean };
  onClose: () => void;
  /** Weekends ahead with nobody coming — no circuit visit, no convention. */
  freeIn: QuickWeek[];
  /** Every week ahead, for a trip of ours. */
  allWeeks: QuickWeek[];
  speakers: QuickPerson[];
  brothers: QuickPerson[];
  congregations: QuickCong[];
  talks: QuickTalk[];
  bookings: QuickBooking[];
  today: string;
  saving: boolean;
  onSave: (draft: QuickDraft) => void;
  onFullForm: (direction: QuickDirection, monday: string | null) => void;
  /** The weeks a series walks through, in order. */
  seriesWeeks?: QuickWeek[];
  /** Saves one week of a series; the new entry's id, or null when it failed. */
  onSaveSeries?: (draft: QuickDraft) => Promise<string | null>;
  /** The ready invitation for a visit saved in the series. */
  invitationFor?: (
    entryId: string,
  ) => { title: string; text: string; phone: string | null } | null;
}) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [dir, setDir] = useState<QuickDirection>(start.direction);
  const [monday, setMonday] = useState<string | null>(start.monday ?? null);
  const [moreWeeks, setMoreWeeks] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [newGuest, setNewGuest] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCong, setNewCong] = useState("");
  const [hostId, setHostId] = useState<string | null>(null);
  const [hostSearch, setHostSearch] = useState("");
  const [talkId, setTalkId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  // ---- «По одной неделе» ----
  const series = !!start.series;
  /** The weeks as they were when the series began: saving one does not reshuffle the rest. */
  const [walk, setWalk] = useState<QuickWeek[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"week" | "done" | "msg">("week");
  const [saved, setSaved] = useState<
    { entryId: string; name: string; date: string; talk: string | null }[]
  >([]);
  const [skipped, setSkipped] = useState(0);
  const [msgFor, setMsgFor] = useState<string | null>(null);
  /** Invitations sent from this summary — a mark for this window only. */
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // A fresh form each time it opens.
  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setDir(start.direction);
    setMonday(start.monday ?? null);
    setMoreWeeks(false);
    setPersonId(null);
    setSearch("");
    setShowAll(false);
    setNewGuest(false);
    setNewName("");
    setNewCong("");
    setHostId(null);
    setHostSearch("");
    setTalkId(null);
    setTyped("");
    if (start.series) {
      setWalk(seriesWeeks);
      setIdx(0);
      setPhase("week");
      setSaved([]);
      setSkipped(0);
      setMsgFor(null);
      setSent(new Set());
      setDir("incoming");
      setMonday(seriesWeeks[0]?.monday ?? null);
    }
    // seriesWeeks is read once, when the series opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, start.direction, start.monday, start.series]);

  /** On to the next week of the series — or to its summary. */
  const nextWeek = () => {
    setPersonId(null);
    setSearch("");
    setShowAll(false);
    setNewGuest(false);
    setNewName("");
    setNewCong("");
    setTalkId(null);
    setTyped("");
    const n = idx + 1;
    if (n >= walk.length) {
      setPhase("done");
      return;
    }
    setIdx(n);
    setMonday(walk[n].monday);
  };

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

  const weeks = dir === "incoming" ? freeIn : allWeeks;
  // A week preset from outside the list (an empty week opened in the
  // journal) is shown first, so it is seen as chosen.
  const weekChips = useMemo(() => {
    const base = moreWeeks ? weeks : weeks.slice(0, WEEKS_SHOWN);
    if (monday && !base.some((w) => w.monday === monday)) {
      const w = [...weeks, ...allWeeks].find((x) => x.monday === monday);
      if (w) return [w, ...base];
    }
    return base;
  }, [weeks, allWeeks, moreWeeks, monday]);
  const host = congregations.find((c) => c.id === hostId) ?? null;
  const date = useMemo(() => {
    if (!monday) return null;
    const w = [...weeks, ...allWeeks].find((x) => x.monday === monday);
    if (dir === "outgoing" && host?.meetingDow)
      return addDaysISO(monday, host.meetingDow - 1);
    return w?.date ?? addDaysISO(monday, 6);
  }, [monday, weeks, allWeeks, dir, host]);

  const people = dir === "incoming" ? speakers : brothers;
  const q = search.trim().toLowerCase();
  const matched = q
    ? people.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sub ?? "").toLowerCase().includes(q),
      )
    : people;
  const shownPeople =
    q || showAll ? matched : matched.slice(0, SHOWN);
  const person = people.find((p) => p.id === personId) ?? null;

  const hostQ = hostSearch.trim().toLowerCase();
  const hosts = (
    hostQ
      ? congregations.filter((c) => c.name.toLowerCase().includes(hostQ))
      : congregations
  ).slice(0, hostId || hostQ ? 8 : 6);
  if (host && !hosts.some((c) => c.id === host.id)) hosts.unshift(host);

  /** The same person already booked within two months of the date. */
  const duplicate = useMemo(() => {
    if (!personId || !date) return null;
    const near = bookings
      .filter(
        (b) =>
          b.direction === dir &&
          b.personId === personId &&
          Math.abs(daysBetween(b.date, date)) <= DUPLICATE_DAYS,
      )
      .sort(
        (a, b) =>
          Math.abs(daysBetween(a.date, date)) -
          Math.abs(daysBetween(b.date, date)),
      );
    return near[0]?.date ?? null;
  }, [bookings, personId, date, dir]);

  const personLine = (p: QuickPerson): { text: string; tone: Tone } => {
    const bits: string[] = [];
    if (p.sub) bits.push(p.sub);
    const booked = date
      ? bookings.find(
          (b) =>
            b.direction === dir &&
            b.personId === p.id &&
            Math.abs(daysBetween(b.date, date)) <= DUPLICATE_DAYS,
        )
      : undefined;
    if (booked) {
      bits.push(t("talkCoordinator.quick.bookedOn", { day: fmt(booked.date) }));
      return { text: bits.join(" · "), tone: "warn" };
    }
    if (p.next) {
      bits.push(t("talkCoordinator.quick.nextOn", { day: fmt(p.next) }));
      return { text: bits.join(" · "), tone: "busy" };
    }
    if (!p.last) {
      bits.push(
        dir === "incoming"
          ? t("talkCoordinator.quick.neverCame")
          : t("talkCoordinator.quick.neverWent"),
      );
      return { text: bits.join(" · "), tone: "ok" };
    }
    // Recently: said as when he WAS, in orange — it is early to ask again.
    if (monthsApart(p.last, today) < RECENT_MONTHS) {
      bits.push(
        dir === "incoming"
          ? t("talkCoordinator.quick.wasAgo", { span: ago(p.last) })
          : t("talkCoordinator.quick.wentAgo", { span: ago(p.last) }),
      );
      return { text: bits.join(" · "), tone: "warn" };
    }
    bits.push(
      dir === "incoming"
        ? t("talkCoordinator.quick.notFor", { span: ago(p.last) })
        : t("talkCoordinator.quick.notOutFor", { span: ago(p.last) }),
    );
    return { text: bits.join(" · "), tone: "ok" };
  };

  // ---- Step 2: the talk -------------------------------------------------
  const byNumber = useMemo(() => {
    const m = new Map<number, QuickTalk>();
    for (const tk of talks) m.set(tk.number, tk);
    return m;
  }, [talks]);
  const repertoire = (person?.talks ?? [])
    .map((n) => byNumber.get(n))
    .filter((x): x is QuickTalk => !!x)
    .sort((a, b) => a.number - b.number);
  const typedTrim = typed.trim();
  const typedNumber = /^\d{1,3}$/.test(typedTrim) ? Number(typedTrim) : null;
  const typedTalk = typedNumber !== null ? byNumber.get(typedNumber) : undefined;
  const typedTheme =
    dir === "incoming" && typedTrim && typedNumber === null ? typedTrim : null;
  const chosenTalkId = typedTrim ? (typedTalk?.id ?? null) : talkId;

  const talkFlag = (tk: QuickTalk): { text: string; tone: Tone } | null => {
    if (!tk.isActive)
      return { text: t("talkCoordinator.quick.retired"), tone: "warn" };
    if (dir !== "incoming" || !date) return null;
    const rep = repeatOf(tk.heard, date);
    if (rep)
      return {
        text:
          rep < date
            ? t("talkCoordinator.quick.heardAgo", { span: ago(rep, date) })
            : t("talkCoordinator.quick.heardNext", { day: fmt(rep) }),
        tone: "warn",
      };
    return tk.heard.some((d) => d < date)
      ? { text: t("talkCoordinator.quick.notIn3"), tone: "ok" }
      : { text: t("talkCoordinator.quick.neverHeard"), tone: "ok" };
  };

  const who =
    dir === "incoming" && newGuest ? newName.trim() : (person?.name ?? "");
  const step1Ready =
    !!monday &&
    (dir === "incoming"
      ? newGuest
        ? newName.trim().length > 0
        : !!person
      : !!person || !!hostId);

  const pick = (id: string) => {
    setPersonId(id);
    setNewGuest(false);
    // The week is known: straight on to the talk, as in the conversation.
    // In a series the talk is on the same screen.
    if (!series && monday && (dir === "incoming" || hostId)) setStep(2);
  };

  const draft = (): QuickDraft | null => {
    if (!monday || !date) return null;
    return {
      direction: dir,
      monday,
      date,
      visitingSpeakerId:
        dir === "incoming" && !newGuest ? (person?.id ?? null) : null,
      speakerName: dir === "incoming" && newGuest ? newName.trim() : null,
      speakerCongregation:
        dir === "incoming" && newGuest ? newCong.trim() || null : null,
      publisherId: dir === "outgoing" ? (person?.id ?? null) : null,
      hostCongregationId: dir === "outgoing" ? hostId : null,
      publicTalkId: typedTheme ? null : chosenTalkId,
      specialTheme: typedTheme,
    };
  };
  const save = () => {
    const d = draft();
    if (d) onSave(d);
  };
  const saveAndNext = async () => {
    const d = draft();
    if (!d || !onSaveSeries) return;
    setBusy(true);
    try {
      const id = await onSaveSeries(d);
      if (!id) return; // the reason is said by the screen; the week stays
      const tk = d.publicTalkId
        ? talks.find((x) => x.id === d.publicTalkId)
        : undefined;
      setSaved((xs) => [
        ...xs,
        {
          entryId: id,
          name: who,
          date: d.date,
          talk: tk ? `№${tk.number}` : d.specialTheme,
        },
      ]);
      nextWeek();
    } finally {
      setBusy(false);
    }
  };
  const typedBad = typedNumber !== null && !typedTalk;

  const seriesWeek = walk[idx];
  const seriesFooter =
    phase === "week" ? (
      <View style={s.footer}>
        <Pressable
          style={({ pressed }) => [
            s.primary,
            (!step1Ready || busy || typedBad) && s.disabled,
            pressed && s.pressed,
          ]}
          disabled={!step1Ready || busy || typedBad}
          onPress={() => void saveAndNext()}
          accessibilityRole="button"
          testID="series-save"
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={s.primaryText}>
              {t("talkCoordinator.quick.saveNext")}
            </Text>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.secondary, pressed && s.pressed]}
          onPress={() => {
            setSkipped((n) => n + 1);
            nextWeek();
          }}
          disabled={busy}
          accessibilityRole="button"
          testID="series-skip"
        >
          <Text style={s.secondaryText}>{t("talkCoordinator.quick.skipWeek")}</Text>
        </Pressable>
      </View>
    ) : phase === "done" ? (
      <View style={s.footer}>
        <Pressable
          style={({ pressed }) => [s.secondary, pressed && s.pressed]}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={s.secondaryText}>{t("talkCoordinator.quick.close")}</Text>
        </Pressable>
      </View>
    ) : undefined;
  /** «Готово» in the middle of a series: the summary, if anything was written. */
  const closeSeries = () => {
    if (phase === "week" && saved.length > 0) setPhase("done");
    else onClose();
  };

  const title =
    series
      ? phase === "week"
        ? t("talkCoordinator.quick.seriesTitle")
        : t("talkCoordinator.quick.seriesDone")
      : step === 1
      ? t("talkCoordinator.quick.title")
      : [who || host?.name || "", date ? fmt(date) : ""]
          .filter(Boolean)
          .join(" · ");

  const footer =
    step === 1 ? (
      <View style={s.footer}>
        <Pressable
          style={({ pressed }) => [
            s.primary,
            !step1Ready && s.disabled,
            pressed && s.pressed,
          ]}
          disabled={!step1Ready}
          onPress={() => setStep(2)}
          accessibilityRole="button"
          testID="quick-next"
        >
          <Text style={s.primaryText}>{t("talkCoordinator.quick.next")}</Text>
        </Pressable>
        <Pressable
          onPress={() => onFullForm(dir, monday)}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={[s.link, s.center]}>
            {t("talkCoordinator.quick.fullForm")}
          </Text>
        </Pressable>
      </View>
    ) : (
      <View style={s.footer}>
        <Pressable
          style={({ pressed }) => [
            s.primary,
            (saving || typedBad) && s.disabled,
            pressed && s.pressed,
          ]}
          disabled={saving || typedBad}
          onPress={save}
          accessibilityRole="button"
          testID="quick-save"
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={s.primaryText}>{t("talkCoordinator.quick.save")}</Text>
          )}
        </Pressable>
        {!chosenTalkId && !typedTheme ? (
          <Text style={s.caption}>{t("talkCoordinator.quick.talkLater")}</Text>
        ) : null}
      </View>
    );

  const personBlock = (
    <>
    <Text style={s.over}>
      {dir === "incoming"
        ? t("talkCoordinator.quick.whoComes")
        : t("talkCoordinator.quick.whoGoes")}
    </Text>
    <View style={s.search}>
      <Ionicons name="search" size={15} color="#94a3b8" />
      <TextInput
        style={s.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder={
          dir === "incoming"
            ? t("talkCoordinator.quick.guestSearch")
            : t("talkCoordinator.quick.brotherSearch")
        }
        placeholderTextColor="#94a3b8"
        testID="quick-search"
      />
    </View>
    <View style={s.list}>
      {shownPeople.map((p) => {
        const line = personLine(p);
        const on = p.id === personId;
        return (
          <Pressable
            key={p.id}
            style={({ pressed }) => [
              s.person,
              on && s.personOn,
              pressed && s.pressed,
            ]}
            onPress={() => pick(p.id)}
            accessibilityRole="button"
            testID="quick-person"
            accessibilityState={{ selected: on }}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.personName}>{p.name}</Text>
              <Text style={[s.personSub, TONE[line.tone]]}>
                {line.text}
              </Text>
            </View>
            {on ? (
              <Ionicons name="checkmark" size={18} color="#0f4c5a" />
            ) : (
              <Ionicons
                name="chevron-forward"
                size={16}
                color="#cbd5e1"
              />
            )}
          </Pressable>
        );
      })}
      {matched.length === 0 ? (
        <Text style={s.caption}>{t("pickers.noMatches")}</Text>
      ) : null}
    </View>
    {!q && matched.length > SHOWN ? (
      <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={6}>
        <Text style={s.link}>
          {showAll
            ? t("talkCoordinator.quick.showFewer")
            : t("talkCoordinator.quick.showAll", {
                count: matched.length - SHOWN,
              })}
        </Text>
      </Pressable>
    ) : null}
    {dir === "incoming" ? (
      newGuest ? (
        <View style={s.newBox}>
          <TextInput
            style={s.input}
            value={newName}
            onChangeText={setNewName}
            placeholder={t("talkCoordinator.quick.newName")}
            placeholderTextColor="#94a3b8"
            autoFocus
          />
          <TextInput
            style={s.input}
            value={newCong}
            onChangeText={setNewCong}
            placeholder={t("talkCoordinator.quick.newCong")}
            placeholderTextColor="#94a3b8"
          />
          <Text style={s.caption}>
            {t("talkCoordinator.quick.newHint")}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setNewGuest(true);
            setPersonId(null);
            setNewName(search.trim());
          }}
          hitSlop={6}
          accessibilityRole="button"
        >
          <Text style={s.link}>+ {t("talkCoordinator.quick.newGuest")}</Text>
        </Pressable>
      )
    ) : null}
    </>
  );

  const talkBlock = (
    <>
    <Text style={s.over}>
      {repertoire.length > 0
        ? dir === "incoming"
          ? t("talkCoordinator.quick.histTalks")
          : t("talkCoordinator.quick.ourTalks")
        : t("talkCoordinator.quick.whichTalk")}
    </Text>
    {repertoire.map((tk) => {
      // A number typed in picks its row too: one choice, seen once.
      const on = typedTrim ? typedTalk?.id === tk.id : tk.id === talkId;
      const flag = talkFlag(tk);
      return (
        <Pressable
          key={tk.id}
          style={({ pressed }) => [
            s.talk,
            flag?.tone === "warn" && s.talkWarn,
            on && s.talkOn,
            pressed && s.pressed,
          ]}
          onPress={() => {
            setTyped("");
            setTalkId(on ? null : tk.id);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: on }}
        >
          <Text style={s.talkNo}>№{tk.number}</Text>
          <Text style={s.talkTitle} numberOfLines={2}>
            {tk.title}
          </Text>
          {flag ? (
            <Text style={[s.talkFlag, TONE[flag.tone]]}>{flag.text}</Text>
          ) : null}
        </Pressable>
      );
    })}
    <TextInput
      style={[s.input, typedBad && s.inputBad]}
      value={typed}
      onChangeText={setTyped}
      placeholder={
        dir === "incoming"
          ? t("talkCoordinator.quick.typeTalkOrTheme")
          : t("talkCoordinator.quick.typeTalk")
      }
      placeholderTextColor="#94a3b8"
      testID="quick-talk-input"
    />
    {typedTalk ? (
      <Text
        style={[
          s.typedLine,
          talkFlag(typedTalk)?.tone === "warn" && TONE.warn,
        ]}
      >
        №{typedTalk.number} «{typedTalk.title}»
        {talkFlag(typedTalk) ? ` — ${talkFlag(typedTalk)!.text}` : ""}
      </Text>
    ) : typedBad ? (
      <Text style={[s.typedLine, TONE.warn]}>
        {t("talkCoordinator.quick.noSuchTalk")}
      </Text>
    ) : typedTheme ? (
      <Text style={s.typedLine}>
        {t("talkCoordinator.quick.asTheme")}
      </Text>
    ) : null}
    {duplicate ? (
      <View style={s.dup}>
        <Text style={s.dupText}>
          {t(
            dir === "incoming"
              ? "talkCoordinator.quick.dupIn"
              : "talkCoordinator.quick.dupOut",
            {
              name: who,
              day: fmt(duplicate, "D MMMM"),
              date: date ? fmt(date, "D MMMM") : "",
            },
          )}
        </Text>
      </View>
    ) : null}
    </>
  );

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={series ? closeSeries : onClose}
      closeLabel={
        series
          ? phase === "week"
            ? t("talkCoordinator.quick.done")
            : t("talkCoordinator.quick.close")
          : t("common.cancel")
      }
      footer={series ? seriesFooter : footer}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.body}
      >
        {series ? (
          phase === "week" ? (
            seriesWeek ? (
              <>
                <View>
                  <View style={s.bar}>
                    <View
                      style={[
                        s.barFill,
                        { width: `${Math.round(((idx + 1) / walk.length) * 100)}%` },
                      ]}
                    />
                  </View>
                  <View style={s.barLine}>
                    <Text style={s.barText}>
                      {t("talkCoordinator.quick.weekOf", {
                        n: idx + 1,
                        total: walk.length,
                      })}
                    </Text>
                    <Text style={s.barText}>
                      {t("talkCoordinator.quick.savedN", { n: saved.length })}
                    </Text>
                  </View>
                </View>
                <Text style={s.big}>
                  {cap(dayjs(seriesWeek.date).locale(i18n.language).format("dd, D MMMM"))}
                </Text>
                {personBlock}
                {person || (newGuest && newName.trim()) ? talkBlock : null}
              </>
            ) : (
              <Text style={s.caption}>{t("talkCoordinator.quick.noFree")}</Text>
            )
          ) : phase === "done" ? (
            <>
              <View style={s.sum}>
                <View style={s.sumBox}>
                  <Text style={s.sumNum}>{saved.length}</Text>
                  <Text style={s.sumLabel}>{t("talkCoordinator.quick.sumSaved")}</Text>
                </View>
                <View style={s.sumBox}>
                  <Text style={s.sumNum}>{skipped}</Text>
                  <Text style={s.sumLabel}>{t("talkCoordinator.quick.sumSkipped")}</Text>
                </View>
              </View>
              {saved.length > 0 ? (
                <Text style={s.over}>{t("talkCoordinator.quick.inviteGuests")}</Text>
              ) : null}
              {saved.map((x) => (
                <View key={x.entryId} style={s.inv}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.personName}>{x.name}</Text>
                    <Text style={s.invSub}>
                      {[
                        cap(dayjs(x.date).locale(i18n.language).format("dd, D MMMM")),
                        x.talk ?? t("talkCoordinator.quick.noTalkYet"),
                      ].join(" · ")}
                    </Text>
                  </View>
                  {sent.has(x.entryId) ? (
                    <Text style={s.invDone}>✓ {t("talkCoordinator.quick.sent")}</Text>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [s.invBtn, pressed && s.pressed]}
                      onPress={() => {
                        setMsgFor(x.entryId);
                        setPhase("msg");
                      }}
                      accessibilityRole="button"
                      testID="series-invite"
                    >
                      <Text style={s.invBtnText}>{t("talkCoordinator.quick.message")}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              <Text style={s.caption}>{t("talkCoordinator.quick.seriesHint")}</Text>
            </>
          ) : (
            (() => {
              const inv = msgFor && invitationFor ? invitationFor(msgFor) : null;
              return inv ? (
                <MessagePanel
                  title={inv.title}
                  text={inv.text}
                  phone={inv.phone}
                  onBack={() => setPhase("done")}
                  backLabel={t("talkCoordinator.quick.backToList")}
                  onSent={() =>
                    setSent((xs) => new Set([...xs, msgFor as string]))
                  }
                />
              ) : (
                <Text style={s.caption}>…</Text>
              );
            })()
          )
        ) : step === 1 ? (
          <>
            <View style={s.seg}>
              {(["incoming", "outgoing"] as const).map((d) => (
                <Pressable
                  key={d}
                  style={[s.segBtn, dir === d && s.segBtnOn]}
                  onPress={() => {
                    if (d === dir) return;
                    setDir(d);
                    setPersonId(null);
                    setNewGuest(false);
                    setSearch("");
                    setShowAll(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: dir === d }}
                  testID={`quick-dir-${d}`}
                >
                  <Text style={[s.segText, dir === d && s.segTextOn]}>
                    {t(`talkCoordinator.log.filter.${d}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.over}>{t("talkCoordinator.quick.when")}</Text>
            <View style={s.chips}>
              {weekChips.map((w) => {
                const on = w.monday === monday;
                return (
                  <Pressable
                    key={w.monday}
                    style={[s.chip, on && s.chipOn]}
                    onPress={() => setMonday(on ? null : w.monday)}
                    accessibilityRole="button"
                    testID="quick-week"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.chipText, on && s.chipTextOn]}>
                      {fmt(
                        dir === "outgoing" && host?.meetingDow
                          ? addDaysISO(w.monday, host.meetingDow - 1)
                          : w.date,
                      )}
                    </Text>
                  </Pressable>
                );
              })}
              {weeks.length > WEEKS_SHOWN ? (
                <Pressable
                  style={[s.chip, s.chipGhost]}
                  onPress={() => setMoreWeeks((v) => !v)}
                  accessibilityRole="button"
                >
                  <Text style={s.chipGhostText}>
                    {moreWeeks
                      ? t("talkCoordinator.quick.fewerWeeks")
                      : t("talkCoordinator.quick.moreWeeks")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {dir === "incoming" && weeks.length === 0 ? (
              <Text style={s.caption}>{t("talkCoordinator.quick.noFree")}</Text>
            ) : null}

            {dir === "outgoing" ? (
              <>
                <Text style={s.over}>{t("talkCoordinator.quick.where")}</Text>
                <View style={s.search}>
                  <Ionicons name="search" size={15} color="#94a3b8" />
                  <TextInput
                    style={s.searchInput}
                    value={hostSearch}
                    onChangeText={setHostSearch}
                    placeholder={t("talkCoordinator.quick.congSearch")}
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={s.chips}>
                  {hosts.map((c) => {
                    const on = c.id === hostId;
                    return (
                      <Pressable
                        key={c.id}
                        style={[s.chip, on && s.chipOn]}
                        onPress={() => setHostId(on ? null : c.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[s.chipText, on && s.chipTextOn]}>
                          {c.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {personBlock}
          </>
        ) : (
          <>
            <Pressable
              onPress={() => setStep(1)}
              hitSlop={8}
              style={s.back}
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={16} color="#0369a1" />
              <Text style={s.backText}>{t("talkCoordinator.quick.back")}</Text>
            </Pressable>
            {talkBlock}
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

type Tone = "ok" | "warn" | "busy";
const TONE = StyleSheet.create({
  ok: { color: "#0f766e" },
  warn: { color: "#c2410c" },
  busy: { color: "#94a3b8" },
});

const s = StyleSheet.create({
  // On a wide screen the form keeps a phone's measure, centred.
  body: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 10,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  seg: { flexDirection: "row", gap: 8, marginTop: 4 },
  segBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  segBtnOn: { backgroundColor: "#0f4c5a", borderColor: "#0f4c5a" },
  segText: { fontFamily: FONT.bold, fontSize: 14, color: "#0f172a" },
  segTextOn: { color: "#ffffff" },
  over: {
    fontFamily: FONT.extrabold,
    fontSize: 11.5,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: "#64748b",
    marginTop: 8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  chipOn: { backgroundColor: "#0f4c5a", borderColor: "#0f4c5a" },
  chipText: { fontFamily: FONT.bold, fontSize: 13.5, color: "#0f172a" },
  chipTextOn: { color: "#ffffff" },
  chipGhost: { borderStyle: "dashed", borderColor: "#bae6fd" },
  chipGhostText: { fontFamily: FONT.bold, fontSize: 13.5, color: "#0369a1" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONT.regular,
    fontSize: 15,
    color: "#0f172a",
    padding: 0,
  },
  list: { gap: 0 },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
    borderRadius: 8,
  },
  personOn: { backgroundColor: "#ecfeff" },
  personName: { fontFamily: FONT.bold, fontSize: 15, color: "#0f172a" },
  personSub: { fontFamily: FONT.medium, fontSize: 12.5, marginTop: 1 },
  link: {
    fontFamily: FONT.bold,
    fontSize: 14,
    color: "#0369a1",
    paddingVertical: 6,
  },
  newBox: { gap: 8 },
  center: { textAlign: "center", paddingVertical: 2 },
  input: {
    fontFamily: FONT.regular,
    fontSize: 15,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputBad: { borderColor: "#fdba74", backgroundColor: "#fff7ed" },
  caption: {
    fontFamily: FONT.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: "#64748b",
    textAlign: "center",
  },
  back: { flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { fontFamily: FONT.bold, fontSize: 14, color: "#0369a1" },
  talk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  talkWarn: { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
  talkOn: { borderColor: "#0f4c5a", backgroundColor: "#f0fdfa" },
  talkNo: { fontFamily: FONT.extrabold, fontSize: 16, color: "#0f172a", minWidth: 48 },
  talkTitle: { flex: 1, fontFamily: FONT.medium, fontSize: 13.5, lineHeight: 18, color: "#0f172a" },
  talkFlag: { fontFamily: FONT.bold, fontSize: 11.5, maxWidth: 110, textAlign: "right" },
  typedLine: { fontFamily: FONT.medium, fontSize: 13, color: "#0f766e" },
  dup: {
    backgroundColor: "#fff7ed",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  dupText: { fontFamily: FONT.medium, fontSize: 13.5, lineHeight: 19, color: "#c2410c" },
  footer: {
    gap: 8,
    alignItems: "stretch",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  primary: {
    backgroundColor: "#0f4c5a",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { fontFamily: FONT.extrabold, fontSize: 15.5, color: "#ffffff" },
  disabled: { opacity: 0.45 },
  secondary: {
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  secondaryText: { fontFamily: FONT.extrabold, fontSize: 15, color: "#0f172a" },
  bar: { height: 5, borderRadius: 3, backgroundColor: "#e2e8f0", overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#0f4c5a", borderRadius: 3 },
  barLine: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  barText: { fontFamily: FONT.semibold, fontSize: 12, color: "#64748b" },
  big: { fontFamily: FONT.extrabold, fontSize: 19, color: "#0f172a", marginTop: 4 },
  sum: { flexDirection: "row", gap: 10 },
  sumBox: { flex: 1, backgroundColor: "#f8fafc", borderRadius: 14, padding: 12, alignItems: "center" },
  sumNum: { fontFamily: FONT.extrabold, fontSize: 24, color: "#0f172a" },
  sumLabel: { fontFamily: FONT.semibold, fontSize: 12, color: "#64748b" },
  inv: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  invSub: { fontFamily: FONT.medium, fontSize: 12, color: "#64748b", marginTop: 1 },
  invBtn: { backgroundColor: "#16a34a", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  invBtnText: { fontFamily: FONT.extrabold, fontSize: 12.5, color: "#ffffff" },
  invDone: { fontFamily: FONT.extrabold, fontSize: 12.5, color: "#16a34a" },
  pressed: { opacity: 0.85 },
});
