import { breakable } from "../../../lib/breakable";
import { Fragment, useMemo, useRef, useState, useEffect } from "react";
import type { SetAsideGuest, TalkAttentionItem } from "../../../lib/api";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { HEADER_ICON } from "../../../lib/header";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import "dayjs/locale/de";
import {
  ExternalCongregation,
  SpecialEvent,
  TalkExchange,
  TalkExchangeDirection,
  TalkExchangeInput,
  talkExchangeApi,
  visitingSpeakersApi,
  assignmentsApi,
  externalCongregationsApi,
  publicTalksApi,
  PublicTalk,
  VisitingSpeaker,
  meetingSettingsApi,
  specialEventsApi,
  MeetingSettingsVersion,
  extractErrorMessage,
} from "../../../lib/api";
import { Dialog } from "../../../components/Dialog";
import { Sheet } from "../../../components/Sheet";
import { confirm } from "../../../components/ConfirmHost";
import {
  computeSpeakerStats,
  computeOutgoingStats,
  OutgoingStats,
  SpeakerStats,
  visitedRecently,
  wentOutRecently,
} from "../../../lib/speaker-stats";
import {
  capitalizeFirst,
  formatRelativeDay,
} from "../../../lib/relative-time";
import { PublisherSelector } from "../../../components/PublisherSelector";
import { PublicTalkSelector } from "../../../components/PublicTalkSelector";
import { startOfWeekMonday, addDays, formatDateISO } from "../../../lib/dates";
import { effectiveVersionFor } from "../../../lib/meeting-schedule";
import { notify } from "../../../lib/error-bus";
import { useAllPublishers } from "../../../lib/useAllPublishers";
import { failsScreen } from "../../../lib/screen-failure";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { MessagePanel } from "../../../components/talk-log/MessagePanel";
import {
  guestInvitation,
  guestReminder,
  lunchBagMessage,
} from "../../../lib/talk-messages";
import type { VisitFacts } from "../../../lib/talk-messages";
import { useSongsMap } from "../../../lib/songs";
import { useMyPublisher } from "../../../lib/useMyPublisher";
import { usePermissions } from "../../../lib/permissions";
import {
  AttentionList,
  WeekCards,
  WeekTable,
} from "../../../components/talk-log/JournalWeeks";
import type {
  AttentionRow,
  Line,
  WeekModel,
} from "../../../components/talk-log/JournalWeeks";

const QK = ["talk-exchange"] as const;

// Years shown: current + next (auto-rolls over).
const YEAR_FROM = new Date().getFullYear();
const YEAR_TO = YEAR_FROM + 1;

// Only these special events are written onto the planner (Memorial only shows
// when it lands on a weekend row, which happens automatically). The special
// talk is not an event any more: it is a talk of this journal, with a theme
// instead of a number (27 September).
const PLANNER_EVENT_TYPES = new Set([
  "regional_convention",
  "circuit_assembly",
  "memorial",
  "circuit_overseer_visit",
]);

type WeekRow = {
  monday: string;
  date: string;
  time: string | null;
  address: string | null;
};
type MonthBlock = { key: string; title: string; rows: WeekRow[] };
type JournalView = "ahead" | "past" | "attention";
type SlotState = {
  incoming?: TalkExchange;
  /**
   * Визиты этой недели, которые не состоялись.
   *
   * После замены в неделе живут ДВЕ записи «К нам»: тот, кого ждали, и тот,
   * кто приехал. Держать их в одном поле нельзя — кто-то один вытеснит
   * другого, и в карточке недели окажется человек, которого на встрече не
   * было.
   */
  missed: TalkExchange[];
  outgoing: TalkExchange[];
};

function mondayISO(dateISO: string): string {
  return formatDateISO(startOfWeekMonday(new Date(`${dateISO}T00:00:00`)));
}

function buildWeeks(
  versions: MeetingSettingsVersion[],
  fallback: MeetingSettingsVersion | null,
): WeekRow[] {
  const rows: WeekRow[] = [];
  let monday = startOfWeekMonday(new Date(`${YEAR_FROM - 1}-12-22T00:00:00`));
  for (let i = 0; i < 130; i++) {
    const mISO = formatDateISO(monday);
    // The shared rule (lib/meeting-schedule) — this screen had its own copy.
    const v = effectiveVersionFor(versions, mISO) ?? fallback;
    const dow = v?.weekendDow ?? 7;
    const wd = addDays(monday, dow - 1);
    const y = wd.getFullYear();
    if (y >= YEAR_FROM && y <= YEAR_TO)
      rows.push({
        monday: mISO,
        date: formatDateISO(wd),
        time: v?.weekendTime ?? null,
        address: v?.address ?? null,
      });
    if (y > YEAR_TO) break;
    monday = addDays(monday, 7);
  }
  return rows;
}

function confirmReplace(
  title: string,
  body: string,
  ok: string,
  cancel: string,
): Promise<boolean> {
  return confirm({ title, body, confirmLabel: ok, cancelLabel: cancel });
}

export default function TalkExchangeYearScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const qc = useQueryClient();

  /** «Впереди» opens on this week; the past and «Внимание» are a tap away. */
  const [view, setView] = useState<JournalView>("ahead");
  /** A table from this width; cards below it. */
  const [contentWidth, setContentWidth] = useState(0);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TalkExchange | null>(null);
  const [direction, setDirection] = useState<TalkExchangeDirection>("incoming");
  const [week, setWeek] = useState<WeekRow | null>(null);
  // «Заменить докладчика»: целевая неделя, неделя-источник и режим.
  const [swapTarget, setSwapTarget] = useState<WeekRow | null>(null);
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [swapMode, setSwapMode] = useState<"swap" | "move">("swap");
  const [swapError, setSwapError] = useState<string | null>(null);
  const [date, setDate] = useState<string>("");
  const [publicTalkId, setPublicTalkId] = useState<string | null>(null);
  // Специальная речь: тема вместо номера из каталога.
  const [special, setSpecial] = useState(false);
  const [specialTheme, setSpecialTheme] = useState("");
  const [visitingSpeakerId, setVisitingSpeakerId] = useState<string | null>(
    null,
  );
  const [speakerNameInput, setSpeakerNameInput] = useState("");
  const [speakerCongInput, setSpeakerCongInput] = useState("");
  const [speakerSearch, setSpeakerSearch] = useState("");
  const [pubSearch, setPubSearch] = useState("");
  const [showAllSpeakers, setShowAllSpeakers] = useState(false);
  const [showAllPubs, setShowAllPubs] = useState(false);
  const [incomingMode, setIncomingMode] = useState<"invited" | "local">(
    "invited",
  );
  const [hospitalityPublisherId, setHospitalityPublisherId] = useState<
    string | null
  >(null);
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [hostCongregationId, setHostCongregationId] = useState<string | null>(
    null,
  );
  const [note, setNote] = useState("");
  /** The guest's opening song as typed — a number, or empty. */
  const [openingSong, setOpeningSong] = useState("");
  /** A ready message shown in place of the form (25 October 2026). */
  const [msg, setMsg] = useState<null | "invite" | "remind" | "lunch">(null);
  const songTitles = useSongsMap();
  const { myPublisher } = useMyPublisher();
  const { responsibilities } = usePermissions();
  /** The Watchtower study's songs of the weekends ahead, by week. */
  const weekSongsQuery = useQuery({
    queryKey: [...QK, "week-songs"],
    queryFn: () => talkExchangeApi.weekSongs(),
  });

  const listQuery = useQuery({
    throwOnError: failsScreen,
    queryKey: QK,
    queryFn: () => talkExchangeApi.list(),
  });
  /**
   * Trips of ours that need someone: no brother yet, or the brother away
   * that day or departed (23 October 2026, Lionel: «то собрание будет ждать
   * докладчика с нашего собрания»).
   */
  const attentionQuery = useQuery({
    queryKey: [...QK, "attention"],
    queryFn: () => talkExchangeApi.attention(),
  });
  /**
   * Our own weekends that need somebody (25 October 2026): nobody booked, no
   * lunch bag for the guest, his song sung at the study.
   */
  const incomingAttnQuery = useQuery({
    queryKey: [...QK, "attention", "incoming"],
    queryFn: () => talkExchangeApi.incomingAttention(),
  });
  /**
   * Guests a circuit visit set aside (25 October 2026): shown under the
   * overseer of their week, with «Перенести». A server without the list yet
   * answers 404 — then there is simply nobody to show.
   */
  const asideQuery = useQuery({
    queryKey: [...QK, "set-aside"],
    queryFn: () => talkExchangeApi.setAside().catch(() => []),
  });
  const asideByWeek = useMemo(() => {
    const m = new Map<string, SetAsideGuest[]>();
    for (const g of asideQuery.data ?? []) {
      const wk = mondayISO(String(g.date).slice(0, 10));
      m.set(wk, [...(m.get(wk) ?? []), g]);
    }
    return m;
  }, [asideQuery.data]);
  const attentionById = useMemo(() => {
    const m = new Map<string, TalkAttentionItem>();
    for (const a of attentionQuery.data ?? []) m.set(a.id, a);
    return m;
  }, [attentionQuery.data]);
  const settingsQuery = useQuery({
    queryKey: ["meeting-settings"],
    queryFn: () => meetingSettingsApi.getOverview(),
  });
  const eventsQuery = useQuery({
    queryKey: ["special-events", "all"],
    queryFn: () => specialEventsApi.list({ all: true }),
  });
  const speakersQuery = useQuery({
    queryKey: ["visiting-speakers"],
    queryFn: () => visitingSpeakersApi.list(),
  });
  const congQuery = useQuery({
    queryKey: ["external-congregations"],
    queryFn: () => externalCongregationsApi.list(),
  });
  const publishersQuery = useAllPublishers();
  const talksQuery = useQuery({
    queryKey: ["public-talks", "all"],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });
  /**
   * Слоты публичной речи из программы — ради недель, накрытых событием.
   *
   * В обычную неделю журнал знает докладчика из своей записи. В неделю
   * специальной речи записи нет, а речь есть: она назначена в программе. Без
   * этого запроса такая неделя выглядела пустой, хотя всё известно.
   */
  const talkSlotsQuery = useQuery({
    queryKey: ["assignments", "public-talk-slots"],
    queryFn: () => assignmentsApi.list({ partKey: "public_talk_speaker" }),
  });
  const talkSlotByWeek = useMemo(() => {
    const rows = talkSlotsQuery.data?.data ?? [];
    const m = new Map<string, (typeof rows)[number]>();
    for (const a of rows) m.set(a.weekStartDate, a);
    return m;
  }, [talkSlotsQuery.data]);

  const speakerById = useMemo(() => {
    const m = new Map<
      string,
      {
        name: string;
        cong: string | null;
        phone: string | null;
        overseer: boolean;
        substitute: boolean;
      }
    >();
    for (const s of speakersQuery.data ?? [])
      m.set(s.id, {
        name: [s.firstName, s.lastName].filter(Boolean).join(" "),
        cong: s.externalCongregation?.name ?? null,
        phone: s.phone ?? null,
        overseer: !!s.circuitOverseer,
        substitute: s.circuitRole === "substitute",
      });
    return m;
  }, [speakersQuery.data]);
  const congById = useMemo(() => {
    const m = new Map<string, ExternalCongregation>();
    for (const c of congQuery.data ?? []) m.set(c.id, c);
    return m;
  }, [congQuery.data]);
  const pubById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of publishersQuery.data?.data ?? [])
      m.set(p.id, p.displayName);
    return m;
  }, [publishersQuery.data]);
  const talkById = useMemo(() => {
    // Whether it is still given travels with it now — the label says so.
    const m = new Map<
      string,
      {
        number: number;
        title: string;
        isActive: boolean;
        retiredFrom: string | null;
        retiredUntil: string | null;
      }
    >();
    for (const pt of talksQuery.data?.data ?? [])
      m.set(pt.id, {
        number: pt.number,
        title: pt.title,
        isActive: pt.isActive,
        retiredFrom: pt.retiredFrom ?? null,
        retiredUntil: pt.retiredUntil ?? null,
      });
    return m;
  }, [talksQuery.data]);

  const today = new Date().toLocaleDateString("en-CA");
  const statsById = useMemo(() => {
    const tmap = new Map<string, PublicTalk>();
    for (const tk of talksQuery.data?.data ?? []) tmap.set(tk.id, tk);
    const m = new Map<string, SpeakerStats>();
    const entries = listQuery.data ?? [];
    for (const sp of speakersQuery.data ?? [])
      m.set(sp.id, computeSpeakerStats(sp, entries, tmap, today));
    return m;
  }, [speakersQuery.data, listQuery.data, talksQuery.data, today]);
  const sortedSpeakers = useMemo(() => {
    // The circuit overseer is not chosen here: his entry is written by his
    // visit. He stays in the list only where an entry already names him.
    const arr = (speakersQuery.data ?? []).filter(
      (sp) => !sp.circuitOverseer || sp.id === visitingSpeakerId,
    );
    const q = speakerSearch.trim().toLowerCase();
    const nameOf = (sp: VisitingSpeaker) =>
      [sp.firstName, sp.lastName].filter(Boolean).join(" ");
    const filtered = q
      ? arr.filter(
          (sp) =>
            nameOf(sp).toLowerCase().includes(q) ||
            (sp.externalCongregation?.name ?? "").toLowerCase().includes(q),
        )
      : arr;
    filtered.sort((a, b) => {
      const la = statsById.get(a.id)?.lastVisit?.date ?? "";
      const lb = statsById.get(b.id)?.lastVisit?.date ?? "";
      return la.localeCompare(lb) || nameOf(a).localeCompare(nameOf(b));
    });
    return filtered;
  }, [speakersQuery.data, speakerSearch, statsById, visitingSpeakerId]);
  const visibleSpeakers = useMemo(() => {
    if (speakerSearch.trim() || showAllSpeakers) return sortedSpeakers;
    /**
     * В свёрнутом виде — только те, кого МОЖНО позвать.
     *
     * Шесть мест уходило на тех, кто уже едет к нам: они стоят в списке по
     * давности визита, а раз визит впереди, давность у них наибольшая. Человек
     * открывал список и видел четверых занятых из шести. Занятые никуда не
     * деваются — они в своём разделе, но при раскрытии.
     */
    const free = sortedSpeakers.filter(
      (sp) => !statsById.get(sp.id)?.nextVisit,
    );
    // Если свободных нет вовсе — показываем как есть: пустой список хуже
    // списка занятых.
    const pool = free.length > 0 ? free : sortedSpeakers;
    const top = pool.slice(0, 6);
    if (visitingSpeakerId && !top.some((sp) => sp.id === visitingSpeakerId)) {
      const sel = sortedSpeakers.find((sp) => sp.id === visitingSpeakerId);
      if (sel) return [sel, ...top];
    }
    return top;
  }, [
    sortedSpeakers,
    speakerSearch,
    visitingSpeakerId,
    showAllSpeakers,
    statsById,
  ]);
  const hiddenSpeakerCount = sortedSpeakers.length - visibleSpeakers.length;

  /**
   * Список разложен по смыслу, а не по одному столбцу справа.
   *
   * Раньше в правой колонке стояли ДВЕ разные вещи: «через 2 мес.» — это
   * будущее, брат уже назначен к нам, и «1× · 3 мес. назад» — прошлое, он
   * приезжал однажды. Глаз читал их как один ряд чисел и не понимал, о чём
   * речь; отсюда и вопрос «через сколько времени?».
   *
   * Порядок разделов — по делу координатора: сперва те, кого пора звать,
   * потом никогда не приезжавшие, потом те, кто был недавно и кого звать
   * рано, и в самом конце уже назначенные. Их видно, но приглушённо: знать,
   * что человек занят, нужно, а звать его — нет.
   */
  const speakerGroups = useMemo(() => {
    const upcoming: typeof visibleSpeakers = [];
    const recent: typeof visibleSpeakers = [];
    const never: typeof visibleSpeakers = [];
    const longAgo: typeof visibleSpeakers = [];
    for (const sp of visibleSpeakers) {
      const st = statsById.get(sp.id);
      if (st?.nextVisit) upcoming.push(sp);
      // visitedRecently — про приезжих; wentOutRecently про наших в поездках.
      // Перепутать легко, и типы это ловят.
      else if (st && st.count > 0 && visitedRecently(st, today))
        recent.push(sp);
      else if (!st || st.count === 0) never.push(sp);
      else longAgo.push(sp);
    }
    return [
      { key: "longAgo", tone: "ok" as const, items: longAgo },
      { key: "never", tone: "neutral" as const, items: never },
      { key: "recent", tone: "warn" as const, items: recent },
      { key: "upcoming", tone: "busy" as const, items: upcoming },
    ].filter((g) => g.items.length > 0);
  }, [visibleSpeakers, statsById, today]);

  // --- "From us": our outgoing speakers + recency, for the outgoing picker ---
  const ourPubs = useMemo(() => {
    const withTalk = new Set<string>();
    for (const e of listQuery.data ?? [])
      if (e.publisherId) withTalk.add(e.publisherId);
    return (publishersQuery.data?.data ?? []).filter(
      (p) =>
        p.isActive &&
        p.gender === "brother" &&
        (p.capabilities?.public_talk_speaker === true || withTalk.has(p.id)),
    );
  }, [publishersQuery.data, listQuery.data]);
  const outStatsById = useMemo(() => {
    const tmap = new Map<string, PublicTalk>();
    for (const tk of talksQuery.data?.data ?? []) tmap.set(tk.id, tk);
    const m = new Map<string, OutgoingStats>();
    for (const p of ourPubs)
      m.set(
        p.id,
        computeOutgoingStats(p.id, listQuery.data ?? [], tmap, congById, today),
      );
    return m;
  }, [ourPubs, listQuery.data, talksQuery.data, congById, today]);
  const sortedPubs = useMemo(() => {
    const q = pubSearch.trim().toLowerCase();
    const pool = q
      ? (publishersQuery.data?.data ?? []).filter(
          (p) =>
            p.isActive &&
            p.gender === "brother" &&
            p.displayName.toLowerCase().includes(q),
        )
      : [...ourPubs];
    pool.sort((a, b) => {
      const la = outStatsById.get(a.id)?.lastVisit?.date ?? "";
      const lb = outStatsById.get(b.id)?.lastVisit?.date ?? "";
      return la.localeCompare(lb) || a.displayName.localeCompare(b.displayName);
    });
    return pool;
  }, [ourPubs, pubSearch, publishersQuery.data, outStatsById]);
  const visiblePubs = useMemo(() => {
    const base =
      pubSearch.trim() || showAllPubs ? sortedPubs : sortedPubs.slice(0, 6);
    if (publisherId && !base.some((p) => p.id === publisherId)) {
      const sel = (publishersQuery.data?.data ?? []).find(
        (p) => p.id === publisherId,
      );
      if (sel) return [sel, ...base];
    }
    return base;
  }, [sortedPubs, pubSearch, publisherId, publishersQuery.data, showAllPubs]);
  const hiddenPubCount =
    pubSearch.trim() || showAllPubs ? 0 : Math.max(0, sortedPubs.length - 6);

  /**
   * Наши братья — по тому же правилу, что и приезжие.
   *
   * Здесь стояли те же две беды: «1×» вместо слов и один столбец справа, где
   * «через 6 нед.» (он уезжает) и «4 мес. назад» (он выступал) читались как
   * однородные числа. И третья, своя: самолётик показывал ЛЮБУЮ ближайшую
   * поездку, а решает только одна — та, что совпадает с этим самым днём. Брат,
   * уезжающий 6 декабря, не может в этот день говорить у нас, и об этом надо
   * сказать прямо, а не оставлять «через 3 дн.» на сообразительность.
   */
  const brotherGroups = useMemo(() => {
    const busy: typeof visiblePubs = [];
    const recent: typeof visiblePubs = [];
    const never: typeof visiblePubs = [];
    const longAgo: typeof visiblePubs = [];
    for (const p of visiblePubs) {
      const st = outStatsById.get(p.id);
      const awayToday = (listQuery.data ?? []).some(
        (e) =>
          e.direction === "outgoing" &&
          e.publisherId === p.id &&
          e.status !== "did_not_happen" &&
          e.date.slice(0, 10) === date,
      );
      if (awayToday) busy.push(p);
      else if (st && st.count > 0 && wentOutRecently(st, today)) recent.push(p);
      else if (!st || st.count === 0) never.push(p);
      else longAgo.push(p);
    }
    return [
      { key: "longAgoOut", tone: "ok" as const, items: longAgo },
      { key: "neverOut", tone: "neutral" as const, items: never },
      { key: "recentOut", tone: "warn" as const, items: recent },
      { key: "awayThatDay", tone: "busy" as const, items: busy },
    ].filter((g) => g.items.length > 0);
  }, [visiblePubs, outStatsById, listQuery.data, date, today]);

  /**
   * Rebuild the journal from the programme.
   *
   * The two-way sync began on 23 June 2026; speakers entered before that day
   * never reached the journal. Offered as a deliberate act rather than done
   * quietly on open: it writes entries, and writing without being asked is how
   * an app loses the coordinator's trust.
   */
  const rebuildMutation = useMutation({
    mutationFn: (from: string) => talkExchangeApi.rebuildFromProgramme(from),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["talk-exchange"] });
    },
  });

  /**
   * Сверка журнала с программой — в шапку, а не первой строкой экрана.
   *
   * Это ремонт: он нужен, когда данные правили мимо приложения, когда
   * изменились правила (последний прогон связал четыре визита, не добавив ни
   * одной записи) или после разбора чужого импорта. В обычной жизни зеркало
   * держит журнал и программу вместе само — оно вызывается из семи мест.
   *
   * Раз в год — и занимало самое видное место, выше всего содержимого. Имя
   * тоже сменилось: «восстановить» звучит как спасение после беды, а речь о
   * сверке.
   *
   * Ставится отсюда, а не из раскладки экранов: действию нужны и запрос, и
   * окно подтверждения, которые живут здесь.
   */
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => void askRebuild()}
          style={{ paddingHorizontal: 10 }}
          hitSlop={8}
          disabled={rebuildMutation.isPending}
          accessibilityLabel={t("talkCoordinator.log.rebuild")}
        >
          {rebuildMutation.isPending ? (
            <ActivityIndicator size="small" color={HEADER_ICON} />
          ) : (
            <Ionicons name="sync-outline" size={22} color={HEADER_ICON} />
          )}
        </Pressable>
      ),
    });
    // askRebuild пересоздаётся каждый раз; в зависимостях только то, от чего
    // вид кнопки действительно меняется.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, rebuildMutation.isPending, t]);

  const askRebuild = async () => {
    const from = `${dayjs().year()}-01-01`;
    const ok = await confirm({
      title: t("talkCoordinator.log.rebuildTitle"),
      body: t("talkCoordinator.log.rebuildBody"),
      confirmLabel: t("talkCoordinator.log.rebuildAction"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    const res = await rebuildMutation.mutateAsync(from);
    // Два разных исхода, а не один. Прошлый прогон сказал «добавлено 0» и
    // подписал это словами «значит уже совпадают» — а на деле связал четыре
    // визита с их братьями, и узнать об этом было неоткуда.
    await confirm({
      title: t("talkCoordinator.log.rebuildDone", { count: res.created }),
      body: t("talkCoordinator.log.rebuildDoneBody", {
        weeks: res.weeks,
        linked: res.linked,
      }),
      confirmLabel: t("common.ok"),
    });
  };

  const byWeek = useMemo(() => {
    const m = new Map<string, SlotState>();
    for (const e of listQuery.data ?? []) {
      const k = mondayISO(e.date);
      const slot = m.get(k) ?? { missed: [], outgoing: [] };
      if (e.direction === "incoming") {
        // Состоявшийся визит — тот, что стоит в неделе. Несостоявшиеся живут
        // рядом и подписаны, а не подменяют его: до сих пор в поле оставался
        // последний пришедший из ответа, то есть иногда именно тот, кого на
        // встрече не было.
        if (e.status === "did_not_happen") slot.missed.push(e);
        else slot.incoming = e;
      } else slot.outgoing.push(e);
      m.set(k, slot);
    }
    // sort each week's outgoing by date then brother
    for (const slot of m.values()) {
      slot.outgoing.sort((a, b) => a.date.localeCompare(b.date));
    }
    return m;
  }, [listQuery.data]);

  // Incoming talk history: which public talks were/will be given here, by whom.
  const incomingByTalk = useMemo(() => {
    const m = new Map<string, TalkExchange[]>();
    for (const e of listQuery.data ?? []) {
      // Речь, которую не произнесли, у нас не звучала: иначе подсказка «эта
      // речь у нас уже была» отговаривала бы от темы, которой никто не слышал.
      if (
        e.direction !== "incoming" ||
        !e.publicTalkId ||
        e.status === "did_not_happen"
      )
        continue;
      const arr = m.get(e.publicTalkId) ?? [];
      arr.push(e);
      m.set(e.publicTalkId, arr);
    }
    for (const arr of m.values())
      arr.sort((a, b) => a.date.localeCompare(b.date));
    return m;
  }, [listQuery.data]);

  const eventsForWeekend = useMemo(() => {
    const events = (eventsQuery.data ?? []).filter((ev) =>
      PLANNER_EVENT_TYPES.has(ev.type ?? ""),
    );
    return (monday: string): SpecialEvent[] => {
      const sat = formatDateISO(addDays(new Date(`${monday}T00:00:00`), 5));
      const sun = formatDateISO(addDays(new Date(`${monday}T00:00:00`), 6));
      // A weekend event (e.g. a convention on Saturday OR Sunday) replaces
      // the weekend public talk, so match any overlap with the Sat–Sun window.
      return events.filter((ev) => {
        const end = ev.endDate ?? ev.date;
        return ev.date <= sun && sat <= end;
      });
    };
  }, [eventsQuery.data]);

  // The weeks of a circuit visit — by the visit's own dates, as the server
  // judges a swap (24 October 2026): its talk is the overseer's, and a swap
  // into or out of it is refused.
  const visitWeek = useMemo(() => {
    const visits = (eventsQuery.data ?? []).filter(
      (ev) => ev.type === "circuit_overseer_visit",
    );
    return (monday: string): boolean => {
      const sun = formatDateISO(addDays(new Date(`${monday}T00:00:00`), 6));
      return visits.some((ev) => ev.date >= monday && ev.date <= sun);
    };
  }, [eventsQuery.data]);

  const months = useMemo<MonthBlock[]>(() => {
    const versions = settingsQuery.data?.versions ?? [];
    const fallback = settingsQuery.data?.effective ?? null;
    const weeks = buildWeeks(versions, fallback);
    const byMonth = new Map<string, WeekRow[]>();
    for (const w of weeks) {
      const key = w.date.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(w);
    }
    return [...byMonth.entries()].map(([key, rows]) => ({
      key,
      title: dayjs(`${key}-01`).locale(i18n.language).format("MMMM YYYY"),
      rows,
    }));
  }, [settingsQuery.data, i18n.language]);

  // Плоский список недель для модалки «Заменить докладчика».
  const weeksFlat = useMemo<WeekRow[]>(
    () => months.flatMap((mb) => mb.rows),
    [months],
  );

  const currentWeekMonday = mondayISO(dayjs().format("YYYY-MM-DD"));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QK });
    // Incoming entries write the weekend public-talk slot via server side
    // effects, so refresh the schedule's assignments/events too.
    qc.invalidateQueries({ queryKey: ["assignments"] });
    qc.invalidateQueries({ queryKey: ["special-events"] });
    // A special talk shows on the events screen too.
    qc.invalidateQueries({ queryKey: ["special-talks"] });
    // A talk changed here may settle (or make) a restricted promise.
    qc.invalidateQueries({
      queryKey: ["public-talks", "restricted-scheduled"],
    });
  };
  const showError = (e: unknown) => {
    const msg = extractErrorMessage(e);
    if (Platform.OS === "web") window.alert(msg);
    else notify(t("talkCoordinator.errorTitle"), msg);
  };
  const createMutation = useMutation({
    mutationFn: (input: TalkExchangeInput) => talkExchangeApi.create(input),
    onSuccess: invalidate,
    onError: showError,
  });
  const updateMutation = useMutation({
    mutationFn: (v: { id: string; input: Partial<TalkExchangeInput> }) =>
      talkExchangeApi.update(v.id, v.input),
    onSuccess: invalidate,
    onError: showError,
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => talkExchangeApi.remove(id),
    onSuccess: invalidate,
    onError: showError,
  });
  const ackMutation = useMutation({
    mutationFn: (v: { id: string; reason: "absence" | "departed" }) =>
      talkExchangeApi.attentionAck(v.id, v.reason),
    onSuccess: invalidate,
    onError: showError,
  });
  /**
   * Deleting a trip that still stands asks first what happened (Lionel,
   * 23 October 2026): the brother taken off — the trip stays and somebody
   * else is needed — or the trip itself called off. Shown inside the sheet,
   * not as a window on top of it.
   */
  const [outChoice, setOutChoice] = useState(false);
  const pending =
    createMutation.isPending ||
    updateMutation.isPending ||
    removeMutation.isPending;

  const swapMutation = useMutation({
    mutationFn: (vars: {
      sourceWeekStartDate: string;
      targetWeekStartDate: string;
      mode: "swap" | "move";
    }) => assignmentsApi.swapPublicTalk(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["assignments"] });
      setSwapTarget(null);
      setSwapSource(null);
      setSwapError(null);
    },
    onError: (e) => {
      /**
       * Отказ по прошедшей неделе объясняется словами, а не кодом.
       *
       * Сервер отвечает `WEEK_ALREADY_PAST`, и без этой ветки человек увидел
       * бы английскую строку про недели — то же самое, что уже случалось с
       * «слишком много попыток» на входе. Смысл отказа простой и стоит того,
       * чтобы быть сказанным: тот брат уже выступил, его имя назвали со сцены.
       */
      const code = (e as { response?: { data?: { code?: string } } })?.response
        ?.data?.code;
      setSwapError(
        code === "WEEK_ALREADY_PAST"
          ? t("talkCoordinator.swap.pastRefused")
          : extractErrorMessage(e),
      );
    },
  });

  /**
   * Кончилась ли неделя — по её последнему дню, как судит сервер.
   *
   * Понедельник плюс шесть: в воскресенье утром неделя ещё идёт, и обменять
   * её можно.
   */
  const weekIsOver = (monday: string): boolean =>
    formatDateISO(addDays(new Date(`${monday}T00:00:00`), 6)) < todayISO;

  // The weeks a talk can come from: not past, with a guest, and neither this
  // week nor that one a circuit visit's (the server refuses those, and the
  // note above the list says why for the visit's own week).
  const swapCandidates =
    swapTarget && !visitWeek(swapTarget.monday)
      ? weeksFlat.filter(
          (w) =>
            !visitWeek(w.monday) &&
            w.monday !== swapTarget.monday &&
            !!byWeek.get(w.monday)?.incoming &&
            // Прошедшие недели не предлагаются вовсе: передвинуть можно то,
            // чего ещё не было.
            !weekIsOver(w.monday),
        )
      : [];

  const undoMutation = useMutation({
    mutationFn: (id: string) => talkExchangeApi.undoReplacement(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
  });

  const askUndo = async (entry: TalkExchange) => {
    const ok = await confirm({
      title: t("talkCoordinator.log.undoTitle"),
      body: t("talkCoordinator.log.undoBody", {
        name: incomingName(entry) ?? t("talkCoordinator.log.unknownSpeaker"),
      }),
      confirmLabel: t("talkCoordinator.log.undoReplacement"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    await undoMutation.mutateAsync(entry.id);
  };

  /**
   * A guest booked for a weekend whose meeting was cancelled (mockup 13,
   * 23 October 2026): his entry waits, marked, until the coordinator moves
   * the visit to another week or says it will not take place.
   */
  const [moveEntry, setMoveEntry] = useState<TalkExchange | null>(null);
  /** «Перенести» for a guest a circuit visit set aside (25 October 2026). */
  const moveAsideMutation = useMutation({
    mutationFn: (v: { id: string; week: string }) =>
      talkExchangeApi.moveAside(v.id, v.week),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
    onError: (e) => notify(extractErrorMessage(e)),
  });
  const moveTargets = useMemo(() => {
    if (!moveEntry) return [] as WeekRow[];
    const from = mondayISO(String(moveEntry.date).slice(0, 10));
    const today = mondayISO(formatDateISO(new Date()));
    return weeksFlat
      .filter(
        (w) =>
          w.monday >= today &&
          w.monday !== from &&
          !byWeek.get(w.monday)?.incoming &&
          talkSlotByWeek.get(w.monday)?.status !== "cancelled" &&
          // A congress or the circuit overseer's visit: no guest that weekend.
          eventsForWeekend(w.monday).length === 0,
      )
      .slice(0, 12);
  }, [moveEntry, weeksFlat, byWeek, talkSlotByWeek, eventsForWeekend]);
  const askNotHeld = async (entry: TalkExchange) => {
    const ok = await confirm({
      title: t("talkCoordinator.cancelled.notHeldTitle"),
      body: t("talkCoordinator.cancelled.notHeldBody", {
        name: incomingName(entry) ?? t("talkCoordinator.log.unknownSpeaker"),
      }),
      confirmLabel: t("talkCoordinator.cancelled.notHeld"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    await updateMutation.mutateAsync({
      id: entry.id,
      input: { status: "did_not_happen" },
    });
  };

  const openSwap = (w: WeekRow) => {
    setSwapTarget(w);
    setSwapSource(null);
    setSwapMode("swap");
    setSwapError(null);
  };

  const openSlot = (
    w: WeekRow,
    dir: TalkExchangeDirection,
    entry?: TalkExchange,
  ) => {
    setWeek(w);
    setOutChoice(false);
    setEditing(entry ?? null);
    setDirection(dir);
    setDate(entry?.date ?? w.date);
    setPublicTalkId(entry?.publicTalkId ?? null);
    setSpecial(dir === "incoming" && !!entry?.specialTheme);
    setSpecialTheme(entry?.specialTheme ?? "");
    setVisitingSpeakerId(entry?.visitingSpeakerId ?? null);
    if (entry?.visitingSpeakerId) {
      const sp = speakerById.get(entry.visitingSpeakerId);
      setSpeakerNameInput(sp?.name ?? "");
      setSpeakerCongInput(sp?.cong ?? "");
    } else {
      setSpeakerNameInput(entry?.speakerName ?? "");
      setSpeakerCongInput(entry?.speakerCongregation ?? "");
    }
    setHospitalityPublisherId(entry?.hospitalityPublisherId ?? null);
    setPublisherId(entry?.publisherId ?? null);
    setIncomingMode(
      dir === "incoming" && entry?.publisherId ? "local" : "invited",
    );
    setHostCongregationId(entry?.hostCongregationId ?? null);
    setNote(entry?.note ?? "");
    setOpeningSong(entry?.openingSong ? String(entry.openingSong) : "");
    setMsg(null);
    setSpeakerSearch("");
    setPubSearch("");
    setShowAllSpeakers(false);
    setShowAllPubs(false);
    setOpen(true);
  };

  // Opened from the programme («Открыть запись»): the entry comes up at once
  // (23 October 2026). Once per visit of the screen.
  const params = useLocalSearchParams<{
    entry?: string;
    view?: string;
    msg?: string;
  }>();
  // From the desk's counters: straight to «Внимание».
  useEffect(() => {
    if (params.view === "attention") setView("attention");
  }, [params.view]);
  const openedFromParam = useRef<string | null>(null);
  useEffect(() => {
    const id = typeof params.entry === "string" ? params.entry : null;
    if (!id || openedFromParam.current === id) return;
    const entry = (listQuery.data ?? []).find((e) => e.id === id);
    if (!entry) return;
    const monday = mondayISO(String(entry.date).slice(0, 10));
    const w = weeksFlat.find((x) => x.monday === monday);
    if (!w) return;
    openedFromParam.current = id;
    openSlot(w, entry.direction, entry);
    // From the desk: straight to the message for the guest.
    if (params.msg === "invite" || params.msg === "remind") setMsg(params.msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.entry, listQuery.data, weeksFlat]);

  const pickSpeaker = (id: string) => {
    const sel = visitingSpeakerId === id;
    if (sel) {
      setVisitingSpeakerId(null);
      return;
    }
    const sp = speakerById.get(id);
    setVisitingSpeakerId(id);
    setSpeakerNameInput(sp?.name ?? "");
    setSpeakerCongInput(sp?.cong ?? "");
  };

  const onPickHost = (id: string | null) => {
    setHostCongregationId(id);
    const h = id ? congById.get(id) : null;
    if (h?.meetingDow && (h.meetingDow === 6 || h.meetingDow === 7) && week) {
      setDate(
        formatDateISO(
          addDays(new Date(`${week.monday}T00:00:00`), h.meetingDow - 1),
        ),
      );
    }
  };

  const themeGiven = special && specialTheme.trim().length > 0;
  // The opening song as a number 1–999, or nothing.
  const songNumber = (() => {
    const n = Number(openingSong.trim());
    return Number.isInteger(n) && n >= 1 && n <= 999 ? n : null;
  })();
  const songTyped = openingSong.trim().length > 0;
  const songBad = songTyped && songNumber === null;
  /**
   * Специальную речь можно записать без докладчика: тему филиал сообщает
   * заранее, а кто её скажет, решается позже. Так было со специальной речью
   * 14 марта 2027 года — и программы той недели ещё нет вовсе.
   */
  const canSave = songBad
    ? false
    : direction === "incoming"
      ? special && !themeGiven
        ? false
        : themeGiven ||
          (incomingMode === "local"
            ? !!publisherId
            : !!visitingSpeakerId || speakerNameInput.trim().length > 0)
      : // A trip may stand without a brother yet: the other congregation is
        // waiting for one of ours, and the journal is where that is seen.
        !!date && (!!publisherId || !!hostCongregationId);

  const save = async () => {
    if (!canSave) return;
    const isSpecial = direction === "incoming" && special;
    const input: TalkExchangeInput = {
      direction,
      date,
      publicTalkId: isSpecial ? null : (publicTalkId ?? null),
      ...(direction === "incoming"
        ? { specialTheme: isSpecial ? specialTheme.trim() || null : null }
        : {}),
      note: note.trim() || null,
      visitingSpeakerId:
        direction === "incoming" && incomingMode === "invited"
          ? visitingSpeakerId
          : null,
      speakerName:
        direction === "incoming" &&
        incomingMode === "invited" &&
        !visitingSpeakerId
          ? speakerNameInput.trim() || null
          : null,
      speakerCongregation:
        direction === "incoming" &&
        incomingMode === "invited" &&
        !visitingSpeakerId
          ? speakerCongInput.trim() || null
          : null,
      hospitalityPublisherId:
        direction === "incoming" ? hospitalityPublisherId : null,
      publisherId:
        direction === "outgoing" ||
        (direction === "incoming" && incomingMode === "local")
          ? publisherId
          : null,
      hostCongregationId: direction === "outgoing" ? hostCongregationId : null,
      ...(direction === "incoming" ? { openingSong: songNumber } : {}),
    };
    const saved = editing
      ? await updateMutation.mutateAsync({ id: editing.id, input })
      : await createMutation.mutateAsync(input);
    // The journal keeps its own history; the programme of a week that is
    // already the record is not rewritten by it. Said, so the two are not
    // left to disagree in silence (13 October 2026).
    if (saved.programmeFrozen) {
      notify(
        t("talkCoordinator.log.programmeFrozenTitle"),
        t("talkCoordinator.log.programmeFrozenBody"),
        "success",
      );
    }
    if (saved.programConflict) {
      const ok = await confirmReplace(
        t("talkCoordinator.log.conflictTitle"),
        t("talkCoordinator.log.conflictBody"),
        t("talkCoordinator.log.replace"),
        t("common.cancel"),
      );
      if (ok) {
        await updateMutation.mutateAsync({
          id: saved.id,
          input: { ...input, overwriteProgram: true },
        });
      }
    }
    setOpen(false);
  };

  const del = async () => {
    if (!editing) return;
    if (
      editing.direction === "outgoing" &&
      editing.publisherId &&
      editing.status !== "did_not_happen" &&
      editing.date.slice(0, 10) >= todayISO
    ) {
      setOutChoice(true);
      return;
    }
    if (
      await confirm({
        title: t("talkCoordinator.log.deleteTitle"),
        body: t("talkCoordinator.log.deleteBody"),
        confirmLabel: t("common.delete"),
        danger: true,
      })
    ) {
      await removeMutation.mutateAsync(editing.id);
      setOpen(false);
    }
  };
  if (listQuery.isLoading || settingsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const talkLabel = (id: string | null): string | null => {
    if (!id) return null;
    const tk = talkById.get(id);
    if (!tk) return null;
    /**
     * A talk no longer used says so, right here in the log.
     *
     * This is where the coordinator arranges who comes and who goes — and a
     * retired talk looks exactly like any other unless it is named. Better a
     * line he reads while planning than a telephone call the week before.
     */
    return `№${tk.number}. ${tk.title}`;
  };

  /**
   * The words about a restriction, kept OUT of the title.
   *
   * Buried at the end of a grey line, «снята с 1 сентября» read like part of
   * the talk's name and was missed. It is the one thing on this screen that
   * has to stop somebody, so it is rendered as a badge of its own.
   */
  const talkRestriction = (
    id: string | null,
    onDate?: string | null,
  ): string | null => {
    if (!id) return null;
    const tk = talkById.get(id);
    if (!tk || tk.isActive) return null;
    /**
     * On THAT day (28 September): a talk withdrawn from 1 December is fine on
     * 8 November, and a pause that has ended is over. The badge used to stand
     * on every week alike, so it cried wolf before the date and was learned
     * to be ignored.
     */
    if (onDate && tk.retiredFrom) {
      const started = onDate >= tk.retiredFrom;
      const ended = !!tk.retiredUntil && onDate > tk.retiredUntil;
      if (!started || ended) return null;
    }
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

  /** The badge itself — same shape wherever a talk is named. */
  const RestrictionBadge = ({
    id,
    date,
  }: {
    id: string | null;
    date?: string | null;
  }) => {
    const words = talkRestriction(id, date);
    if (!words) return null;
    return (
      <View style={styles.restrictBadge}>
        <Ionicons name="close-circle" size={12} color="#b45309" />
        <Text style={styles.restrictText} numberOfLines={2}>
          {words}
        </Text>
      </View>
    );
  };
  const incomingName = (e: TalkExchange): string | null =>
    e.publisherId
      ? (pubById.get(e.publisherId) ?? null)
      : e.visitingSpeakerId
        ? (speakerById.get(e.visitingSpeakerId)?.name ?? null)
        : e.speakerName;
  // Where a congregation would stand, the overseer's entry says who he is —
  // otherwise it reads as a visiting speaker from nowhere.
  const incomingCong = (e: TalkExchange): string | null =>
    breakable(incomingCongRaw(e)) ?? null;
  const incomingCongRaw = (e: TalkExchange): string | null =>
    e.visitingSpeakerId
      ? (speakerById.get(e.visitingSpeakerId)?.cong ??
        (speakerById.get(e.visitingSpeakerId)?.overseer
          ? speakerById.get(e.visitingSpeakerId)?.substitute
            ? t("talkCoordinator.speakers.circuitSubstitute")
            : t("talkCoordinator.speakers.circuitOverseer")
          : null))
      : e.speakerCongregation;
  const incomingPhone = (e: TalkExchange): string | null =>
    e.visitingSpeakerId
      ? (speakerById.get(e.visitingSpeakerId)?.phone ?? null)
      : null;
  const fmtDay = (d: string) =>
    // Первая буква, а не каждое слово: месяц стоит не первым, и «13 Сентября» — не по-русски.
    capitalizeFirst(dayjs(d).locale(i18n.language).format("dd, D MMM"));
  const todayISO = dayjs().format("YYYY-MM-DD");

  const host = hostCongregationId
    ? (congById.get(hostCongregationId) ?? null)
    : null;
  const selSpeaker = visitingSpeakerId
    ? ((speakersQuery.data ?? []).find((s) => s.id === visitingSpeakerId) ??
      null)
    : null;
  const selSpeakerCong = selSpeaker?.externalCongregationId
    ? (congById.get(selSpeaker.externalCongregationId) ?? null)
    : null;
  const weekendDays = week
    ? [5, 6].map((i) =>
        formatDateISO(addDays(new Date(`${week.monday}T00:00:00`), i)),
      )
    : [];
  const talkOccs = publicTalkId
    ? (incomingByTalk.get(publicTalkId) ?? []).filter(
        (o) => o.id !== editing?.id,
      )
    : [];
  const fmtHist = (d: string) =>
    dayjs(d).locale(i18n.language).format("D MMM YYYY");

  // ---- The visit's facts for a ready message (25 October 2026) ----------
  const tr = (key: string, vars?: Record<string, string | number>) =>
    String(t(key, vars));
  const studySongs = week
    ? ((weekSongsQuery.data ?? []).find((x) => x.weekStartDate === week.monday)
        ?.study ?? [])
    : [];
  const songRepeats = songNumber !== null && studySongs.includes(songNumber);
  const guestFull =
    incomingMode === "invited" ? speakerNameInput.trim() || null : null;
  const guestFirst = selSpeaker?.firstName?.trim() || guestFull?.split(/\s+/)[0] || null;
  const chosenTalk = publicTalkId ? talkById.get(publicTalkId) : undefined;
  const bringer = hospitalityPublisherId
    ? (publishersQuery.data?.data ?? []).find((p) => p.id === hospitalityPublisherId)
    : undefined;
  const facts: VisitFacts = {
    date: date || week?.date || todayISO,
    today: todayISO,
    time: week?.time ?? null,
    address: week?.address ?? null,
    guestFirstName: guestFirst,
    guestFullName: guestFull,
    guestCongregation: incomingMode === "invited" ? speakerCongInput.trim() || null : null,
    talkNumber: special ? null : (chosenTalk?.number ?? null),
    talkTitle: special ? null : (chosenTalk?.title ?? null),
    specialTheme: special ? specialTheme.trim() || null : null,
    openingSong: songNumber,
    studySongs,
    lunchArranged: !!hospitalityPublisherId,
    senderName: myPublisher?.firstName?.trim() || null,
    senderIsCoordinator:
      responsibilities.has("public_talk_coordinator") ||
      responsibilities.has("public_talk_coordinator_assistant"),
  };
  const messageText =
    msg === "invite"
      ? guestInvitation(tr, facts)
      : msg === "remind"
        ? guestReminder(tr, facts)
        : msg === "lunch"
          ? lunchBagMessage(tr, facts, {
              firstName: bringer?.firstName ?? null,
              sister: bringer?.gender === "sister",
            })
          : "";
  const messagePhone =
    msg === "lunch" ? null : (selSpeaker?.phone ?? null);

  const renderBrotherPicker = () => (
    <>
      <Text style={styles.fieldLabel}>
        {t("talkCoordinator.log.ourBrother")}
      </Text>
      <View style={styles.dirSearchRow}>
        <Ionicons name="search" size={15} color="#94a3b8" />
        <TextInput
          style={styles.dirSearchInput}
          value={pubSearch}
          onChangeText={setPubSearch}
          placeholder={t("talkCoordinator.log.brotherSearch")}
          placeholderTextColor="#94a3b8"
        />
        {pubSearch ? (
          <Pressable hitSlop={8} onPress={() => setPubSearch("")}>
            <Ionicons name="close-circle" size={15} color="#cbd5e1" />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.dirList}>
        {brotherGroups.map((group) => (
          <View key={group.key}>
            <View
              style={[
                styles.grpHead,
                group.tone === "ok" && styles.grpOk,
                group.tone === "warn" && styles.grpWarn,
                group.tone === "busy" && styles.grpBusy,
              ]}
            >
              <Text
                style={[
                  styles.grpTitle,
                  group.tone === "ok" && styles.grpTitleOk,
                  group.tone === "warn" && styles.grpTitleWarn,
                  group.tone === "busy" && styles.grpTitleBusy,
                ]}
              >
                {t(`talkCoordinator.log.group.${group.key}`)}
              </Text>
            </View>
            {group.items.map((p) => {
              const sel = publisherId === p.id;
              const st = outStatsById.get(p.id);
              // Одна фраза вместо кода: «1×» читается как код, а не как «раз».
              const line =
                group.key === "awayThatDay"
                  ? t("talkCoordinator.log.awayThisDay")
                  : st && st.count > 0 && st.lastVisit
                    ? t("talkCoordinator.log.spokeAway", {
                        rel: formatRelativeDay(st.lastVisit.date, today, t),
                        count: st.count,
                      })
                    : null;
              return (
                <Pressable
                  key={p.id}
                  style={[
                    styles.dirRow,
                    sel && styles.dirRowActive,
                    group.tone === "busy" && styles.dirRowBusy,
                  ]}
                  onPress={() => setPublisherId(sel ? null : p.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.dirName, sel && styles.dirNameActive]}>
                      {p.displayName}
                    </Text>
                    {line ? <Text style={styles.dirSub}>{line}</Text> : null}
                  </View>
                  {sel ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="#0ea5e9"
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}

        {hiddenPubCount > 0 ? (
          <Pressable
            onPress={() => setShowAllPubs(true)}
            style={styles.dirMoreBtn}
          >
            <Text style={styles.dirMore}>
              {t("talkCoordinator.log.moreSpeakers", {
                n: hiddenPubCount,
              })}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );

  // ---------------------------------------------------------------------
  // THE WEEKS, AS LINES (Lionel, 25 October 2026). The layout itself is in
  // components/talk-log/JournalWeeks.tsx; here each week says what it holds.
  // ---------------------------------------------------------------------
  const daysTo = (iso: string) =>
    Math.round(
      (new Date(`${iso}T00:00:00`).getTime() -
        new Date(`${todayISO}T00:00:00`).getTime()) /
        86_400_000,
    );
  const leftWords = (iso: string): string => {
    const d = daysTo(iso);
    if (d < 7) return t("talkCoordinator.journal.thisWeek");
    return t("talkCoordinator.journal.left", { count: Math.round(d / 7) });
  };
  const songWord = (n: number) => t("talkCoordinator.journal.song", { n });
  const repeatsByWeek = new Set(
    (incomingAttnQuery.data ?? [])
      .filter((a) => a.reason === "song_repeat")
      .map((a) => a.weekStartDate),
  );
  const weekLines = (w: WeekRow, past: boolean): Line[] => {
    const slot = byWeek.get(w.monday) ?? { missed: [], outgoing: [] };
    const events = eventsForWeekend(w.monday);
    const lines: Line[] = [];
    if (events.length > 0) {
      const slotOf = talkSlotByWeek.get(w.monday);
      const who = slotOf
        ? (slotOf.speakerName ??
          (slotOf.publisherId ? (pubById.get(slotOf.publisherId) ?? null) : null))
        : null;
      const theme = slotOf
        ? talkLabel(slotOf.publicTalkId) || slotOf.partTitle || null
        : null;
      lines.push({
        kind: "event",
        title: events
          .map((ev) =>
            t(`specialEvents.types.${ev.type}`, {
              defaultValue: ev.title ?? ev.type ?? "",
            }),
          )
          .join(" · "),
        who,
        theme,
        aside: (asideByWeek.get(w.monday) ?? []).map((g) => ({
          id: g.id,
          name: g.name ?? t("talkCoordinator.log.unknownSpeaker"),
          sub:
            [incomingCong(g), talkLabel(g.publicTalkId)]
              .filter(Boolean)
              .join(" · ") || null,
          ours: !!g.publisherId,
          onMove: past ? undefined : () => setMoveEntry(g),
        })),
      });
    } else {
      const inc = slot.incoming;
      if (inc) {
        const guest = !inc.publisherId && !inc.circuitVisitId;
        lines.push({
          kind: "in",
          name: incomingName(inc) ?? t("talkCoordinator.log.unknownSpeaker"),
          cong: incomingCong(inc),
          talk: inc.specialTheme?.trim() || talkLabel(inc.publicTalkId),
          special: !!inc.specialTheme?.trim(),
          song: inc.openingSong ? songWord(inc.openingSong) : null,
          songRepeats: !past && repeatsByWeek.has(w.monday),
          // A lunch bag is arranged ahead; a past week is only its record.
          lunch: guest && !past
            ? inc.hospitalityPublisherId
              ? (pubById.get(inc.hospitalityPublisherId) ?? "—")
              : null
            : undefined,
          restriction: talkRestriction(inc.publicTalkId, inc.date),
          cancelled: !!inc.meetingCancelled,
          ourBrother: !!inc.publisherId,
          onPress: () => openSlot(w, "incoming", inc),
          onSwap: past ? undefined : () => openSwap(w),
          onMove: !past && inc.meetingCancelled ? () => setMoveEntry(inc) : undefined,
          onNotHeld:
            !past && inc.meetingCancelled ? () => void askNotHeld(inc) : undefined,
        });
      } else {
        lines.push({
          kind: "inEmpty",
          left: past ? null : leftWords(w.date),
          urgent: !past && daysTo(w.date) <= 28,
          onPress: () => openSlot(w, "incoming", undefined),
          onSwap: () => openSwap(w),
        });
      }
      for (const mv of slot.missed) {
        lines.push({
          kind: "missed",
          id: mv.id,
          name: incomingName(mv) ?? t("talkCoordinator.log.unknownSpeaker"),
          note: mv.note,
          onUndo: () => void askUndo(mv),
        });
      }
    }
    for (const o of slot.outgoing) {
      const att = attentionById.get(o.id);
      lines.push({
        kind: "out",
        id: o.id,
        who: o.publisherId ? (pubById.get(o.publisherId) ?? "—") : null,
        host: o.hostCongregationId
          ? (breakable(congById.get(o.hostCongregationId)?.name) ?? null)
          : null,
        day: o.date !== w.date ? fmtDay(o.date) : null,
        talk: talkLabel(o.publicTalkId),
        restriction: talkRestriction(o.publicTalkId, o.date),
        needsBrother: att?.reason === "needs_brother" || !o.publisherId,
        risk:
          att && att.reason !== "needs_brother"
            ? {
                text: t(`talkCoordinator.log.risk.${att.reason}`),
                acking: ackMutation.isPending,
                onAck: () =>
                  ackMutation.mutate({
                    id: o.id,
                    reason: att.reason as "absence" | "departed",
                  }),
              }
            : null,
        onPress: () => openSlot(w, "outgoing", o),
      });
    }
    if (events.length === 0) {
      lines.push({ kind: "outAdd", onPress: () => openSlot(w, "outgoing", undefined) });
    }
    return lines;
  };
  const weekModel = (w: WeekRow, past: boolean): WeekModel => {
    const d = dayjs(w.date).locale(i18n.language);
    return {
      monday: w.monday,
      dayNum: d.format("D"),
      weekday: d.format("dd"),
      dayLabel: fmtDay(w.date),
      monthKey: w.date.slice(0, 7),
      monthTitle: capitalizeFirst(d.format("MMMM YYYY")),
      current: w.monday === currentWeekMonday,
      past,
      lines: weekLines(w, past),
    };
  };
  const aheadWeeks = weeksFlat
    .filter((w) => w.monday >= currentWeekMonday)
    .map((w) => weekModel(w, false));
  // The past is a record: only the weeks that hold something.
  const pastWeeks = weeksFlat
    .filter((w) => w.monday < currentWeekMonday)
    .reverse()
    .map((w) => weekModel(w, true))
    .filter((m) => m.lines.some((l) => l.kind !== "inEmpty" && l.kind !== "outAdd"));

  // «Внимание»: everything that waits for somebody, by date.
  const weekOf = (iso: string) =>
    weeksFlat.find((x) => x.monday === mondayISO(iso.slice(0, 10)));
  const attnRows: (AttentionRow & { date: string })[] = [];
  for (const a of incomingAttnQuery.data ?? []) {
    const w = weekOf(a.date);
    if (!w) continue;
    const entry = a.entryId
      ? (listQuery.data ?? []).find((e) => e.id === a.entryId)
      : undefined;
    const guest = a.guest ?? t("talkCoordinator.journal.attn.theGuest");
    if (a.reason === "needs_guest") {
      attnRows.push({
        key: `g-${a.weekStartDate}`,
        date: a.date,
        tone: daysTo(a.date) <= 28 ? "urgent" : "warn",
        icon: "alert-circle-outline",
        title: t("talkCoordinator.journal.attn.needsGuest", { day: fmtDay(a.date) }),
        sub: `${leftWords(a.date)} · ${t("talkCoordinator.journal.attn.invite")}`,
        onPress: () => openSlot(w, "incoming", undefined),
      });
    } else if (a.reason === "no_lunch") {
      attnRows.push({
        key: `l-${a.weekStartDate}`,
        date: a.date,
        tone: "lunch",
        icon: "bag-handle-outline",
        title: t("talkCoordinator.journal.attn.noLunch", { day: fmtDay(a.date) }),
        sub: `${guest} · ${t("talkCoordinator.journal.attn.chooseLunch")}`,
        onPress: () => openSlot(w, "incoming", entry),
      });
    } else {
      attnRows.push({
        key: `s-${a.weekStartDate}`,
        date: a.date,
        tone: "song",
        icon: "musical-notes-outline",
        title: t("talkCoordinator.journal.attn.song", {
          day: fmtDay(a.date),
          song: a.song ?? "",
        }),
        sub: `${guest} · ${t("talkCoordinator.journal.attn.askAnother")}`,
        onPress: () => openSlot(w, "incoming", entry),
      });
    }
  }
  for (const a of attentionQuery.data ?? []) {
    const w = weekOf(a.date);
    const entry = (listQuery.data ?? []).find((e) => e.id === a.id);
    if (!w || !entry) continue;
    const host =
      congById.get(a.hostCongregationId ?? "")?.name ??
      t("talkCoordinator.log.outChoice.otherCongregation");
    attnRows.push({
      key: `o-${a.id}`,
      date: a.date,
      tone: a.reason === "needs_brother" ? "urgent" : "warn",
      icon: a.reason === "needs_brother" ? "person-add-outline" : "help-circle-outline",
      title:
        a.reason === "needs_brother"
          ? t("talkCoordinator.journal.attn.needsBrother", { day: fmtDay(a.date), host })
          : t("talkCoordinator.journal.attn.trip", {
              day: fmtDay(a.date),
              who: a.publisherId ? (pubById.get(a.publisherId) ?? "—") : "—",
              host,
            }),
      sub:
        a.reason === "needs_brother"
          ? t("talkCoordinator.log.needsBrotherHint")
          : t(`talkCoordinator.log.risk.${a.reason}`),
      onPress: () => openSlot(w, "outgoing", entry),
    });
  }
  for (const g of asideQuery.data ?? []) {
    const date = String(g.date).slice(0, 10);
    if (date < todayISO) continue;
    attnRows.push({
      key: `a-${g.id}`,
      date,
      tone: "warn",
      icon: "pause-circle-outline",
      title: t("talkCoordinator.journal.attn.aside", {
        day: fmtDay(date),
        name: g.name ?? t("talkCoordinator.log.unknownSpeaker"),
      }),
      sub: t("talkCoordinator.journal.attn.asideHint"),
      onPress: () => setMoveEntry(g),
    });
  }
  for (const e of listQuery.data ?? []) {
    if (
      e.direction !== "incoming" ||
      !e.meetingCancelled ||
      e.status === "did_not_happen" ||
      e.date.slice(0, 10) < todayISO
    )
      continue;
    attnRows.push({
      key: `c-${e.id}`,
      date: e.date.slice(0, 10),
      tone: "warn",
      icon: "calendar-clear-outline",
      title: t("talkCoordinator.journal.attn.cancelled", {
        day: fmtDay(e.date),
        name: incomingName(e) ?? t("talkCoordinator.log.unknownSpeaker"),
      }),
      sub: t("talkCoordinator.cancelled.hint"),
      onPress: () => setMoveEntry(e),
    });
  }
  attnRows.sort((a, b) => a.date.localeCompare(b.date));

  const wideJournal = contentWidth >= 860;
  const shown = view === "past" ? pastWeeks : aheadWeeks;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f1f5f9" }}>
      <ScrollView
        contentContainerStyle={styles.journal}
        onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
      >
        <View style={[styles.journalInner, !wideJournal && styles.journalNarrow]}>
          <SegmentedControl<JournalView>
            segments={[
              { key: "ahead", label: t("talkCoordinator.journal.ahead") },
              { key: "past", label: t("talkCoordinator.journal.past") },
              {
                key: "attention",
                label:
                  attnRows.length > 0
                    ? t("talkCoordinator.journal.attentionN", { n: attnRows.length })
                    : t("talkCoordinator.journal.attention"),
                dot: attnRows.length > 0 ? "#ea580c" : undefined,
              },
            ]}
            value={view}
            onChange={setView}
          />
          {view === "attention" ? (
            <AttentionList
              rows={attnRows}
              emptyText={t("talkCoordinator.journal.allGood")}
            />
          ) : wideJournal ? (
            <WeekTable weeks={shown} />
          ) : (
            <WeekCards weeks={shown} />
          )}
          {view === "past" && shown.length === 0 ? (
            <Text style={styles.journalEmpty}>{t("talkCoordinator.journal.noPast")}</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* «Заменить докладчика»: обмен/перенос содержимого слота между неделями */}
      <Dialog
        visible={swapTarget !== null}
        title={t("talkCoordinator.swap.title", {
          date: swapTarget ? fmtDay(swapTarget.date) : "",
        })}
        icon="swap-horizontal"
        onCancel={() => setSwapTarget(null)}
        cancelLabel={t("common.cancel")}
        confirmLabel={t(`talkCoordinator.swap.confirm.${swapMode}`)}
        confirmDisabled={!swapSource}
        pending={swapMutation.isPending}
        onConfirm={() =>
          swapMutation.mutate({
            sourceWeekStartDate: swapSource!,
            targetWeekStartDate: swapTarget!.monday,
            mode: swapMode,
          })
        }
      >
        <View style={styles.swapBody}>
          <Text style={styles.swapHint}>{t("talkCoordinator.swap.hint")}</Text>

          <View style={styles.swapModeRow}>
            {(["swap", "move"] as const).map((m) => (
              <Pressable
                key={m}
                style={[
                  styles.swapModeBtn,
                  swapMode === m && styles.swapModeBtnActive,
                ]}
                onPress={() => setSwapMode(m)}
              >
                <Ionicons
                  name={m === "swap" ? "swap-horizontal" : "arrow-forward"}
                  size={14}
                  color={swapMode === m ? "#fff" : "#0369a1"}
                />
                <Text
                  style={[
                    styles.swapModeText,
                    swapMode === m && styles.swapModeTextActive,
                  ]}
                >
                  {t(`talkCoordinator.swap.mode.${m}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {swapTarget && visitWeek(swapTarget.monday) ? (
            <Text style={styles.swapVisitNote}>
              {t("talkCoordinator.swap.visitWeek")}
            </Text>
          ) : null}
          <ScrollView style={styles.swapList}>
            {swapCandidates
              .map((w) => {
                const inc = byWeek.get(w.monday)!.incoming!;
                const active = swapSource === w.monday;
                return (
                  <Pressable
                    key={w.monday}
                    style={[styles.swapRow, active && styles.swapRowActive]}
                    onPress={() => setSwapSource(w.monday)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.swapRowDate}>{fmtDay(w.date)}</Text>
                      <Text style={styles.swapRowName} numberOfLines={1}>
                        {incomingName(inc) ??
                          t("talkCoordinator.log.unknownSpeaker")}
                      </Text>
                      {talkLabel(inc.publicTalkId) || inc.specialTheme ? (
                        <Text style={styles.swapRowTalk} numberOfLines={1}>
                          {talkLabel(inc.publicTalkId) ??
                            `${t("talkCoordinator.log.specialTalk")}: ${inc.specialTheme}`}
                        </Text>
                      ) : null}
                      {/* Also where a speaker is being swapped in: the moment a
                        restricted talk would otherwise be chosen. */}
                      <RestrictionBadge id={inc.publicTalkId} date={inc.date} />
                    </View>
                    {active ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#0284c7"
                      />
                    ) : null}
                  </Pressable>
                );
              })}
          </ScrollView>

          {swapCandidates.length === 0 &&
          !(swapTarget && visitWeek(swapTarget.monday)) ? (
            <Text style={styles.swapEmpty}>
              {t("talkCoordinator.swap.noneAvailable")}
            </Text>
          ) : null}

          {swapError ? <Text style={styles.swapError}>{swapError}</Text> : null}
        </View>
      </Dialog>

      <Sheet
        visible={!!moveEntry}
        title={t("talkCoordinator.cancelled.moveTitle")}
        subtitle={
          moveEntry ? (
            <Text style={styles.editorDate}>
              {(moveEntry as SetAsideGuest).name ??
                incomingName(moveEntry) ??
                t("talkCoordinator.log.unknownSpeaker")}
            </Text>
          ) : undefined
        }
        onClose={() => setMoveEntry(null)}
        closeLabel={t("common.cancel")}
        variant="bottom"
      >
        <View style={{ gap: 8, paddingBottom: 8 }}>
          {moveEntry?.setAsideBy ? (
            <Text style={styles.cancelledHint}>
              {t("talkCoordinator.aside.moveHint")}
            </Text>
          ) : null}
          {moveTargets.map((w) => (
            <Pressable
              key={w.monday}
              style={styles.moveRow}
              disabled={updateMutation.isPending || moveAsideMutation.isPending}
              onPress={async () => {
                if (!moveEntry) return;
                if (moveEntry.setAsideBy) {
                  await moveAsideMutation.mutateAsync({
                    id: moveEntry.id,
                    week: w.monday,
                  });
                } else {
                  await updateMutation.mutateAsync({
                    id: moveEntry.id,
                    input: { date: w.date },
                  });
                }
                setMoveEntry(null);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.moveRowText}>{fmtDay(w.date)}</Text>
              <Ionicons name="chevron-forward" size={18} color="#0e7490" />
            </Pressable>
          ))}
          {moveTargets.length === 0 ? (
            <Text style={styles.cancelledHint}>{t("talkCoordinator.cancelled.noWeeks")}</Text>
          ) : null}
        </View>
      </Sheet>

      <Sheet
        visible={open}
        title={
          direction === "incoming"
            ? t("talkCoordinator.log.filter.incoming")
            : t("talkCoordinator.log.filter.outgoing")
        }
        subtitle={
          date ? (
            <Text style={styles.editorDate}>
              {/*
                Первая буква, а не каждое слово.

                Стоял `textTransform: 'capitalize'`, а он поднимает КАЖДОЕ
                слово: «Вс, 6 Дек. 2026». В русском месяц со строчной, и такая
                строка читается как чужая. Месяц целиком, а не «дек.»: в шапке
                места хватает, а сокращение экономит четыре знака и стоит
                секунды.
              */}
              {capitalizeFirst(
                dayjs(date).locale(i18n.language).format("dd, D MMMM YYYY"),
              )}
            </Text>
          ) : undefined
        }
        onClose={() => setOpen(false)}
        closeLabel={t("common.cancel")}
        footer={
          msg ? undefined : outChoice && editing ? (
            <View style={styles.outChoice}>
              <Text style={styles.outChoiceTitle}>
                {t("talkCoordinator.log.outChoice.title", {
                  host:
                    congById.get(editing.hostCongregationId ?? "")?.name ??
                    t("talkCoordinator.log.outChoice.otherCongregation"),
                })}
              </Text>
              <Pressable
                style={[styles.outChoiceBtn, styles.outChoiceBtnMain]}
                disabled={pending}
                onPress={async () => {
                  await updateMutation.mutateAsync({
                    id: editing.id,
                    input: { publisherId: null },
                  });
                  setOpen(false);
                }}
              >
                <Text style={styles.outChoiceMainText}>
                  {t("talkCoordinator.log.outChoice.takeOff")}
                </Text>
                <Text style={styles.outChoiceSub}>
                  {t("talkCoordinator.log.outChoice.takeOffHint")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.outChoiceBtn}
                disabled={pending}
                onPress={async () => {
                  await updateMutation.mutateAsync({
                    id: editing.id,
                    input: { status: "did_not_happen" },
                  });
                  setOpen(false);
                }}
              >
                <Text style={styles.outChoiceDangerText}>
                  {t("talkCoordinator.log.outChoice.cancelled")}
                </Text>
                <Text style={styles.outChoiceSub}>
                  {t("talkCoordinator.log.outChoice.cancelledHint")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.outChoiceBack}
                onPress={() => setOutChoice(false)}
              >
                <Text style={styles.outChoiceBackText}>
                  {t("common.cancel")}
                </Text>
              </Pressable>
            </View>
          ) : (
          <View style={styles.modalActions}>
            {editing ? (
              <Pressable
                style={styles.deleteBtn}
                onPress={del}
                disabled={pending}
              >
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            {/* Подсказка слева от кнопки, а не над ней: строкой выше она
                делала подвал вдвое толще, а сказать нужно немного. */}
            {!canSave ? (
              <Text style={styles.needText} numberOfLines={2}>
                {direction === "incoming"
                  ? special && !themeGiven
                    ? t("talkCoordinator.log.needTheme")
                    : incomingMode === "local"
                      ? t("talkCoordinator.log.needBrother")
                      : t("talkCoordinator.log.needSpeaker")
                  : t("talkCoordinator.log.needBrother")}
              </Text>
            ) : null}
            <Pressable
              style={[
                styles.modalConfirm,
                (!canSave || pending) && styles.disabled,
              ]}
              onPress={() => void save()}
              disabled={!canSave || pending}
            >
              <Text style={styles.modalConfirmText}>{t("common.save")}</Text>
            </Pressable>
          </View>
          )
        }
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.editorBody}
        >
          {msg ? (
            <MessagePanel
              title={t(`talkCoordinator.message.title.${msg}`)}
              text={messageText}
              phone={messagePhone}
              onBack={() => setMsg(null)}
            />
          ) : direction === "incoming" ? (
            <>
              {week && (week.time || week.address) ? (
                <Text style={styles.infoLine}>
                  {[week.time, week.address].filter(Boolean).join(" · ")}
                </Text>
              ) : null}

              <Text style={styles.sectionOver}>
                {t("talkCoordinator.visit.speaker")}
              </Text>
              <View style={styles.chipWrap}>
                <Pressable
                  style={[
                    styles.pickChip,
                    incomingMode === "invited" && styles.pickChipActive,
                  ]}
                  onPress={() => {
                    setIncomingMode("invited");
                    setPublisherId(null);
                  }}
                >
                  <Text
                    style={[
                      styles.pickChipText,
                      incomingMode === "invited" && styles.pickChipTextActive,
                    ]}
                  >
                    {t("talkCoordinator.log.visiting")}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.pickChip,
                    incomingMode === "local" && styles.pickChipActive,
                  ]}
                  onPress={() => {
                    setIncomingMode("local");
                    setVisitingSpeakerId(null);
                    setSpeakerNameInput("");
                    setSpeakerCongInput("");
                  }}
                >
                  <Text
                    style={[
                      styles.pickChipText,
                      incomingMode === "local" && styles.pickChipTextActive,
                    ]}
                  >
                    {t("talkCoordinator.log.ourBrother")}
                  </Text>
                </Pressable>
              </View>

              {/*
                Что произойдёт после сохранения.

                Заголовок говорит «К нам», а последствий два: запись в журнале
                И заполненная программа встречи — та самая, которую председатель
                читает со сцены. Об этом нигде не сказано, и человек не знает,
                нужно ли идти в программу отдельно.
              */}
              <View style={styles.consequence}>
                <Ionicons
                  name="information-circle-outline"
                  size={15}
                  color="#0369a1"
                />
                <Text style={styles.consequenceText}>
                  {t("talkCoordinator.log.alsoFillsProgramme")}
                </Text>
              </View>

              {incomingMode === "local" && (
                <View style={{ marginTop: 6 }}>{renderBrotherPicker()}</View>
              )}

              {incomingMode === "invited" && (
                <>
                  {(speakersQuery.data ?? []).length > 0 && (
                    <>
                      <Text style={styles.fieldLabel}>
                        {t("talkCoordinator.log.fromDirectory")}
                      </Text>
                      {/* Шестеро наверху — не первые попавшиеся: список
                          отсортирован по давности визита, и наверху те, кого
                          дольше всего не было. Стоит это сказать, иначе выбор
                          выглядит случайным. */}
                      {!speakerSearch.trim() && !showAllSpeakers ? (
                        <Text style={styles.dirCaption}>
                          {t("talkCoordinator.log.longestAgoFirst")}
                        </Text>
                      ) : null}
                      <View style={styles.dirSearchRow}>
                        <Ionicons name="search" size={15} color="#94a3b8" />
                        <TextInput
                          style={styles.dirSearchInput}
                          value={speakerSearch}
                          onChangeText={setSpeakerSearch}
                          placeholder={t("talkCoordinator.log.speakerSearch")}
                          placeholderTextColor="#94a3b8"
                        />
                        {speakerSearch ? (
                          <Pressable
                            hitSlop={8}
                            onPress={() => setSpeakerSearch("")}
                          >
                            <Ionicons
                              name="close-circle"
                              size={15}
                              color="#cbd5e1"
                            />
                          </Pressable>
                        ) : null}
                      </View>
                      <View style={styles.dirList}>
                        {speakerGroups.map((group) => (
                          <View key={group.key}>
                            <View
                              style={[
                                styles.grpHead,
                                group.tone === "ok" && styles.grpOk,
                                group.tone === "warn" && styles.grpWarn,
                                group.tone === "busy" && styles.grpBusy,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.grpTitle,
                                  group.tone === "ok" && styles.grpTitleOk,
                                  group.tone === "warn" && styles.grpTitleWarn,
                                  group.tone === "busy" && styles.grpTitleBusy,
                                ]}
                              >
                                {t(`talkCoordinator.log.group.${group.key}`)}
                              </Text>
                            </View>
                            {group.items.map((sp) => {
                              const sel = visitingSpeakerId === sp.id;
                              const st = statsById.get(sp.id);
                              /**
                               * Одна фраза вместо кода.
                               *
                               * «1× · 3 мес. назад» экономило четыре знака и
                               * стоило секунды непонимания: звёздочка читается
                               * как код, а не как «раз». Будущий визит теперь
                               * назван датой — координатор сверяется с
                               * программой числами месяца, а не «через шесть
                               * дней».
                               */
                              const line = st?.nextVisit
                                ? t("talkCoordinator.log.willCome", {
                                    date: fmtDay(st.nextVisit.date),
                                  })
                                : st && st.count > 0 && st.lastVisit
                                  ? t("talkCoordinator.log.wasHere", {
                                      rel: formatRelativeDay(
                                        st.lastVisit.date,
                                        today,
                                        t,
                                      ),
                                      count: st.count,
                                    })
                                  : null;
                              return (
                                <Pressable
                                  key={sp.id}
                                  style={[
                                    styles.dirRow,
                                    sel && styles.dirRowActive,
                                    group.tone === "busy" && styles.dirRowBusy,
                                  ]}
                                  onPress={() => pickSpeaker(sp.id)}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text
                                      style={[
                                        styles.dirName,
                                        sel && styles.dirNameActive,
                                      ]}
                                    >
                                      {[sp.firstName, sp.lastName]
                                        .filter(Boolean)
                                        .join(" ")}
                                    </Text>
                                    <Text style={styles.dirSub}>
                                      {[sp.externalCongregation?.name, line]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </Text>
                                  </View>
                                  {sel ? (
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={18}
                                      color="#0ea5e9"
                                    />
                                  ) : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        ))}
                        {!speakerSearch && hiddenSpeakerCount > 0 ? (
                          <Pressable
                            onPress={() => setShowAllSpeakers(true)}
                            style={styles.dirMoreBtn}
                          >
                            <Text style={styles.dirMore}>
                              {t("talkCoordinator.log.moreSpeakers", {
                                n: hiddenSpeakerCount,
                              })}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </>
                  )}

                  {/*
                    Два пути назвать докладчика — по очереди, а не разом.

                    Раньше список и поля имени стояли одновременно и спорили:
                    выбор из справочника заполнял поля, а правка любого из них
                    молча СНИМАЛА выбор — вместе со связью, на которой держится
                    история визита. Человек поправлял опечатку в собрании и
                    терял привязку, не получив об этом ни слова.

                    Теперь выбранный виден строкой, а поля показываются только
                    когда никого не выбрали: гостя, которого нет в справочнике,
                    по-прежнему вписывают руками — этот путь нужен и остаётся.
                  */}
                  {/*
                    Нижняя половина формы — на белом листе.

                    Оболочка окна залита серым, и наверху это незаметно: там
                    белые карточки списка. Ниже же поля прозрачные, и всё
                    ложилось прямо на серое, читаясь как одно бесформенное
                    пятно. Лист даёт этой части ту же плотность, что и списку.
                  */}
                  <View style={styles.formCard}>
                    {visitingSpeakerId ? (
                      <View style={styles.chosenRow}>
                        <Ionicons
                          name="person-circle-outline"
                          size={18}
                          color="#0369a1"
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.chosenName}>
                            {speakerNameInput}
                          </Text>
                          {speakerCongInput ? (
                            <Text style={styles.chosenCong}>
                              {speakerCongInput}
                            </Text>
                          ) : null}
                        </View>
                        <Pressable
                          hitSlop={8}
                          onPress={() => setVisitingSpeakerId(null)}
                        >
                          <Text style={styles.chosenChange}>
                            {t("talkCoordinator.log.changeSpeaker")}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.orTypeIt}>
                          {t("talkCoordinator.log.orTypeName")}
                        </Text>
                        <Text style={styles.fieldLabel}>
                          {t("talkCoordinator.log.speakerName")}
                        </Text>
                        <TextInput
                          style={styles.input}
                          value={speakerNameInput}
                          onChangeText={setSpeakerNameInput}
                          placeholderTextColor="#94a3b8"
                        />

                        <Text style={styles.fieldLabel}>
                          {t("talkCoordinator.log.speakerCong")}
                        </Text>
                        <TextInput
                          style={styles.input}
                          value={speakerCongInput}
                          onChangeText={setSpeakerCongInput}
                          placeholderTextColor="#94a3b8"
                        />
                      </>
                    )}

                    {selSpeaker && (selSpeaker.phone || selSpeakerCong) ? (
                      <View style={styles.spInfoBox}>
                        {selSpeaker.phone ? (
                          <Pressable
                            onPress={() =>
                              selSpeaker.phone &&
                              Linking.openURL(`tel:${selSpeaker.phone}`)
                            }
                          >
                            <Text style={styles.spInfoPhone}>
                              {t("talkCoordinator.log.phone")}:{" "}
                              {selSpeaker.phone}
                            </Text>
                          </Pressable>
                        ) : null}
                        {selSpeakerCong ? (
                          <>
                            <Text style={styles.spInfoText}>
                              {[selSpeakerCong.name, selSpeakerCong.city]
                                .filter(Boolean)
                                .join(", ")}
                            </Text>
                            {(selSpeakerCong.contactName ||
                              selSpeakerCong.contactPhone) && (
                              <Text style={styles.spInfoText}>
                                {[
                                  selSpeakerCong.contactName,
                                  selSpeakerCong.contactPhone,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </Text>
                            )}
                            {!!selSpeakerCong.address && (
                              <Text style={styles.spInfoText}>
                                {selSpeakerCong.address}
                              </Text>
                            )}
                          </>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </>
              )}

              {/* Лист 2: речь. */}
              <Text style={styles.sectionOver}>
                {t("talkCoordinator.visit.talk")}
              </Text>
              <View style={styles.formCard}>
                {/*
                  Речь из каталога или специальная.

                  Специальная речь раз-два в год приходит от филиала: номера у
                  неё нет, есть тема. Раньше её заводили событием, отдельно от
                  докладчика; теперь это та же речь журнала, только с темой.
                */}
                <View style={styles.chipWrap}>
                  {([false, true] as const).map((sp) => (
                    <Pressable
                      key={String(sp)}
                      style={[
                        styles.pickChip,
                        special === sp && styles.pickChipActive,
                      ]}
                      onPress={() => setSpecial(sp)}
                    >
                      <Text
                        style={[
                          styles.pickChipText,
                          special === sp && styles.pickChipTextActive,
                        ]}
                      >
                        {sp
                          ? t("talkCoordinator.log.specialTalk")
                          : t("talkCoordinator.log.catalogueTalk")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {special ? (
                  <>
                    <Text style={styles.fieldLabel}>
                      {t("talkCoordinator.log.specialTheme")}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={specialTheme}
                      onChangeText={setSpecialTheme}
                      maxLength={255}
                      placeholder={t(
                        "talkCoordinator.log.specialThemePlaceholder",
                      )}
                      placeholderTextColor="#94a3b8"
                    />
                    <Text style={styles.dirCaption}>
                      {t("talkCoordinator.log.specialHint")}
                    </Text>
                  </>
                ) : (
                  <View style={{ marginTop: 8 }}>
                    <PublicTalkSelector
                      label={t("talkCoordinator.log.talk")}
                      value={publicTalkId}
                      onChange={(talk) => setPublicTalkId(talk?.id ?? null)}
                    />
                  </View>
                )}
                {/* When the talk was last heard here — in words, not a counter
                    dressed as a button (25 October 2026). */}
                {!special && publicTalkId ? (
                  <View style={styles.histLine}>
                    <Text style={styles.histText}>
                      {talkOccs.length === 0
                        ? t("talkCoordinator.visit.neverHere")
                        : t("talkCoordinator.visit.heardHere", {
                            list: talkOccs
                              .slice(-3)
                              .map(
                                (o) =>
                                  `${fmtHist(o.date)} · ${
                                    incomingName(o) ??
                                    t("talkCoordinator.log.unknownSpeaker")
                                  }`,
                              )
                              .join("; "),
                          })}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Лист 3: вступительная песня — гость выбирает её сам. */}
              <Text style={styles.sectionOver}>
                {t("talkCoordinator.visit.song")}
              </Text>
              <View style={styles.formCard}>
                <View style={styles.songRow}>
                  <Text style={styles.songNo}>№</Text>
                  <TextInput
                    style={[styles.songInput, (songBad || songRepeats) && styles.songInputBad]}
                    value={openingSong}
                    onChangeText={(v) => setOpeningSong(v.replace(/[^\d]/g, "").slice(0, 3))}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    placeholder="—"
                    placeholderTextColor="#94a3b8"
                    accessibilityLabel={t("talkCoordinator.visit.song")}
                  />
                  <Text style={styles.songTitle} numberOfLines={2}>
                    {songNumber !== null ? (songTitles.get(songNumber) ?? "") : t("talkCoordinator.visit.songUnknown")}
                  </Text>
                </View>
                {songRepeats ? (
                  <Text style={styles.songWarn}>
                    {t("talkCoordinator.visit.songRepeats", { n: songNumber })}
                  </Text>
                ) : studySongs.length > 0 ? (
                  <Text style={styles.songHint}>
                    {t("talkCoordinator.visit.studySongs", { list: studySongs.join(", ") })}
                  </Text>
                ) : (
                  <Text style={styles.songHint}>{t("talkCoordinator.visit.studyUnknown")}</Text>
                )}
              </View>

              {/* Лист 4: ланч-пакет — сестра или брат приносит его в зал. */}
              <Text style={styles.sectionOver}>
                {t("talkCoordinator.visit.lunch")}
              </Text>
              <View style={styles.formCard}>
                <PublisherSelector
                  label={t("talkCoordinator.visit.lunchBy")}
                  value={hospitalityPublisherId}
                  onChange={setHospitalityPublisherId}
                />
              </View>

              {/* Лист 5: готовые сообщения — гостю и тому, кто несёт пакет. */}
              {incomingMode === "invited" ? (
                <>
                  <Text style={styles.sectionOver}>
                    {t("talkCoordinator.visit.messages")}
                  </Text>
                  <View style={styles.msgRow}>
                    <Pressable
                      style={({ pressed }) => [styles.msgBtn, styles.msgBtnMain, pressed && { opacity: 0.8 }]}
                      onPress={() => setMsg("invite")}
                      accessibilityRole="button"
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={16} color="#ffffff" />
                      <Text style={styles.msgBtnMainText}>{t("talkCoordinator.visit.msgInvite")}</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.msgBtn, pressed && { opacity: 0.8 }]}
                      onPress={() => setMsg("remind")}
                      accessibilityRole="button"
                    >
                      <Ionicons name="alarm-outline" size={16} color="#0f4c5a" />
                      <Text style={styles.msgBtnText}>{t("talkCoordinator.visit.msgRemind")}</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.msgBtn,
                        !hospitalityPublisherId && styles.msgBtnOff,
                        pressed && { opacity: 0.8 },
                      ]}
                      disabled={!hospitalityPublisherId}
                      onPress={() => setMsg("lunch")}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name="bag-handle-outline"
                        size={16}
                        color={hospitalityPublisherId ? "#0f4c5a" : "#94a3b8"}
                      />
                      <Text style={[styles.msgBtnText, !hospitalityPublisherId && { color: "#94a3b8" }]}>
                        {t("talkCoordinator.visit.msgLunch")}
                      </Text>
                    </Pressable>
                  </View>
                  {!hospitalityPublisherId ? (
                    <Text style={styles.songHint}>{t("talkCoordinator.visit.msgLunchOff")}</Text>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <>
              {renderBrotherPicker()}

              <Text style={styles.fieldLabel}>
                {t("talkCoordinator.log.hostCongregation")}
              </Text>
              <View style={styles.chipWrap}>
                {(congQuery.data ?? []).map((c) => {
                  const sel = hostCongregationId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      style={[styles.pickChip, sel && styles.pickChipActive]}
                      onPress={() => onPickHost(sel ? null : c.id)}
                    >
                      <Text
                        style={[
                          styles.pickChipText,
                          sel && styles.pickChipTextActive,
                        ]}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })}
                {(congQuery.data ?? []).length === 0 && (
                  <Text style={styles.muted}>
                    {t("talkCoordinator.log.noCongregations")}
                  </Text>
                )}
              </View>

              {!!host && (host.address || host.meetingTime || host.mapUrl) && (
                <View style={styles.hostBox}>
                  {(host.meetingTime || host.address) && (
                    <Text style={styles.hostInfo}>
                      {[host.meetingTime, host.address]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  )}
                  {!!host.mapUrl && (
                    <Pressable
                      onPress={() =>
                        host.mapUrl && Linking.openURL(host.mapUrl)
                      }
                    >
                      <Text style={styles.hostMap}>
                        {t("talkCoordinator.log.openMap")}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              <Text style={styles.fieldLabel}>
                {t("talkCoordinator.log.tripDate")}
              </Text>
              <View style={styles.chipWrap}>
                {weekendDays.map((d) => {
                  const sel = date === d;
                  return (
                    <Pressable
                      key={d}
                      style={[styles.dayChip, sel && styles.pickChipActive]}
                      onPress={() => setDate(d)}
                    >
                      <Text
                        style={[
                          styles.pickChipText,
                          sel && styles.pickChipTextActive,
                        ]}
                      >
                        {capitalizeFirst(dayjs(d).locale(i18n.language).format("dddd, D MMM"))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ marginTop: 10 }}>
                <PublicTalkSelector
                  label={t("talkCoordinator.log.talk")}
                  value={publicTalkId}
                  onChange={(talk) => setPublicTalkId(talk?.id ?? null)}
                />
              </View>
            </>
          )}

          {msg ? null : (
            <>
              <Text style={styles.fieldLabel}>{t("talkCoordinator.log.note")}</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                multiline
                placeholderTextColor="#94a3b8"
              />
            </>
          )}
        </ScrollView>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  journal: { padding: 12, paddingBottom: 48 },
  sectionOver: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: "#64748b",
    marginTop: 14,
    marginBottom: 6,
  },
  histLine: { marginTop: 8 },
  histText: { fontFamily: "Manrope_400Regular", fontSize: 12.5, lineHeight: 17, color: "#475569" },
  songRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  songNo: { fontFamily: "Manrope_700Bold", fontSize: 16, color: "#64748b" },
  songInput: {
    width: 76,
    fontFamily: "Manrope_700Bold",
    fontSize: 18,
    color: "#0f172a",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
    textAlign: "center",
  },
  songInputBad: { borderColor: "#f97316", backgroundColor: "#fff7ed" },
  songTitle: { flex: 1, fontFamily: "Manrope_500Medium", fontSize: 13.5, color: "#334155" },
  songHint: { fontFamily: "Manrope_400Regular", fontSize: 12, lineHeight: 16, color: "#64748b", marginTop: 8 },
  songWarn: { fontFamily: "Manrope_700Bold", fontSize: 12.5, lineHeight: 17, color: "#c2410c", marginTop: 8 },
  msgRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  msgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    backgroundColor: "#e6f2f4",
  },
  msgBtnMain: { backgroundColor: "#0f4c5a" },
  msgBtnOff: { backgroundColor: "#f1f5f9" },
  msgBtnText: { fontFamily: "Manrope_700Bold", fontSize: 13.5, color: "#0f4c5a" },
  msgBtnMainText: { fontFamily: "Manrope_700Bold", fontSize: 13.5, color: "#ffffff" },
  journalInner: { gap: 10, width: "100%", alignSelf: "center" },
  journalNarrow: { maxWidth: 720 },
  journalEmpty: {
    fontFamily: "Manrope_500Medium",
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    paddingVertical: 24,
  },
  /* Amber, boxed and with a mark: this is the one line on the screen that has
     to stop the reader before he telephones anybody. */
  restrictBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 4,
  },
  restrictText: {
    fontSize: 11.5,
    color: "#b45309",
    fontFamily: "Manrope_600SemiBold",
    flexShrink: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  muted: { fontFamily: "Manrope_400Regular", color: "#64748b", fontSize: 13 },
  monthBar: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  monthBarInner: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  monthChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
  },
  monthChipCurrent: { backgroundColor: "#0ea5e9" },
  monthChipText: {
    fontSize: 12,
    color: "#475569",
    fontFamily: "Manrope_600SemiBold",
    textTransform: "capitalize",
  },
  monthChipTextCurrent: { color: "#fff" },
  container: { padding: 12, paddingBottom: 48 },
  slotLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  slotSwapBtn: { padding: 2 },
  asideBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderTopColor: "#93c5fd",
    gap: 2,
  },
  asideHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  asideLabel: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 11,
    letterSpacing: 0.3,
    color: "#b45309",
    textTransform: "uppercase",
  },
  asideName: {
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
    color: "#475569",
    marginTop: 2,
  },
  asideSub: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#94a3b8" },
  asideHint: {
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
    lineHeight: 16,
    color: "#92400e",
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 6,
  },
  asideMove: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderWidth: 1.5,
    borderColor: "#0284c7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  asideMoveText: {
    fontFamily: "Manrope_700Bold",
    fontSize: 12.5,
    color: "#0369a1",
  },
  swapBody: { gap: 10 },
  swapHint: { fontFamily: "Manrope_400Regular", fontSize: 12.5, color: "#64748b" },
  swapModeRow: { flexDirection: "row", gap: 8 },
  swapModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#e0f2fe",
  },
  swapModeBtnActive: { backgroundColor: "#0284c7" },
  swapModeText: {
    fontSize: 12.5,
    fontFamily: "Manrope_700Bold",
    color: "#0369a1",
  },
  swapModeTextActive: { color: "#fff" },
  swapList: { maxHeight: 300 },
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  swapRowActive: { backgroundColor: "#f0f9ff" },
  swapRowDate: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#64748b" },
  swapRowName: {
    fontSize: 14,
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
  },
  swapRowTalk: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#0369a1" },
  swapEmpty: {
    fontFamily: "Manrope_400Regular",
    fontSize: 13,
    color: "#64748b",
    lineHeight: 19,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  swapError: { fontFamily: "Manrope_400Regular", fontSize: 12.5, color: "#b91c1c" },
  monthHeader: {
    fontSize: 13,
    fontFamily: "Manrope_700Bold",
    color: "#64748b",
    textTransform: "capitalize",
    marginTop: 14,
    marginBottom: 6,
    marginLeft: 4,
  },
  weekendRow: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    marginBottom: 8,
  },
  weekendPast: { opacity: 0.55 },
  bareRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bareDate: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
  },
  bareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  // 320 points across (iPhone SE): the date stays on one line.
  bareRowTight: { gap: 4 },
  bareBtnTight: { paddingHorizontal: 7, gap: 1 },
  // On a tablet or a desktop the row is a metre wide: the buttons stand by
  // the date instead of at the far edge.
  bareDateWide: { flex: 0, minWidth: 150 },
  bareIn: { backgroundColor: "#e0f2fe" },
  bareOut: { backgroundColor: "#fef3c7" },
  bareBtnText: { fontSize: 12.5, fontFamily: "Manrope_700Bold" },
  bareSwap: { padding: 4 },
  /** Неделя, у которой ещё нет докладчика: работа, а не ошибка. */
  weekendNeeds: { borderLeftWidth: 3, borderLeftColor: "#f59e0b" },
  pastLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 10,
  },
  pastRule: { flex: 1, height: 1, backgroundColor: "#cbd5e1" },
  pastLabel: {
    fontFamily: "Manrope_400Regular",
    fontSize: 11.5,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  weekendDate: {
    fontSize: 13,
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
    marginBottom: 6,
  },
  outHint: {
    fontFamily: "Manrope_400Regular",
    fontSize: 11,
    color: "#dc2626",
    marginTop: 1,
  },
  slots: { flexDirection: "row", gap: 8 },
  slot: {
    flex: 1,
    borderRadius: 10,
    padding: 8,
    minHeight: 56,
    justifyContent: "center",
  },
  slotEmpty: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
  },
  eventSlot: { backgroundColor: "#ede9fe" },
  eventLabel: {
    fontSize: 10,
    fontFamily: "Manrope_700Bold",
    color: "#6d28d9",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  eventWho: { fontSize: 14, color: "#0f172a", fontFamily: "Manrope_600SemiBold", marginTop: 4 },
  eventTheme: {
    fontFamily: "Manrope_400Regular",
    fontSize: 12.5,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 17,
  },
  eventTitle: {
    fontSize: 13,
    fontFamily: "Manrope_600SemiBold",
    color: "#5b21b6",
    marginTop: 3,
  },
  slotLabel: {
    fontSize: 10,
    fontFamily: "Manrope_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  slotMain: {
    fontSize: 13,
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
    marginTop: 3,
  },
  slotSub: { fontFamily: "Manrope_400Regular", fontSize: 11, color: "#475569", marginTop: 1 },
  specialChip: {
    alignSelf: "flex-start",
    backgroundColor: "#ede9fe",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginTop: 3,
  },
  specialChipText: {
    fontSize: 10,
    fontFamily: "Manrope_700Bold",
    color: "#6d28d9",
    letterSpacing: 0.2,
  },
  inSide: { flex: 1, minWidth: 0 },
  missedBox: { marginBottom: 6, gap: 4 },
  swapVisitNote: {
    fontFamily: "Manrope_400Regular",
    fontSize: 14,
    lineHeight: 20,
    color: "#7a4a06",
    backgroundColor: "#fdf0d9",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  missedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  missedText: { fontFamily: "Manrope_400Regular", flex: 1, fontSize: 12, color: "#b45309", lineHeight: 17 },
  missedUndo: { fontSize: 12, color: "#0369a1", fontFamily: "Manrope_600SemiBold" },
  cancelledBox: {
    marginTop: 8,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#94a3b8",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  cancelledBadge: {
    alignSelf: "flex-start",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 11,
    letterSpacing: 0.4,
    color: "#ffffff",
    backgroundColor: "#64748b",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: "hidden",
  },
  cancelledHint: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#475569", lineHeight: 17 },
  cancelledActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cancelledMove: {
    flexShrink: 1,
    backgroundColor: "#0e7490",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: "center",
  },
  cancelledMoveText: { fontFamily: "Manrope_700Bold", fontSize: 13, color: "#ffffff" },
  cancelledNot: {
    flexShrink: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: "center",
  },
  cancelledNotText: { fontFamily: "Manrope_700Bold", fontSize: 13, color: "#334155" },
  moveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 50,
  },
  moveRowText: { fontFamily: "Manrope_700Bold", fontSize: 15, color: "#0f172a" },
  slotCong: { fontFamily: "Manrope_400Regular", fontSize: 11, color: "#64748b", marginTop: 1 },
  slotAdd: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#94a3b8", marginTop: 4 },
  outCol: {
    flex: 1,
    borderRadius: 10,
    padding: 8,
    backgroundColor: "#fffbeb",
    minHeight: 56,
  },
  outItem: {
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#fde68a",
  },
  outItemRisk: {
    backgroundColor: "#fefce8",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#facc15",
    marginVertical: 4,
  },
  riskBlock: { gap: 4, marginTop: 6 },
  riskBadge: {
    alignSelf: "flex-start",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 10.5,
    letterSpacing: 0.4,
    color: "#ffffff",
    backgroundColor: "#ca8a04",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  riskText: { fontFamily: "Manrope_400Regular", fontSize: 12.5, color: "#713f12" },
  riskActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  riskBtn: {
    borderWidth: 1,
    borderColor: "#ca8a04",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 36,
    justifyContent: "center",
  },
  riskBtnText: { fontFamily: "Manrope_700Bold", fontSize: 13, color: "#854d0e" },
  riskBtnMain: { backgroundColor: "#ca8a04" },
  riskBtnMainText: { fontFamily: "Manrope_700Bold", fontSize: 13, color: "#ffffff" },
  needBrother: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#ea580c",
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    padding: 10,
    gap: 4,
    marginVertical: 4,
  },
  needBrotherLabel: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 10.5,
    letterSpacing: 0.5,
    color: "#c2410c",
  },
  needBrotherHint: { fontFamily: "Manrope_400Regular", fontSize: 12.5, color: "#7c2d12" },
  needBrotherCta: { fontFamily: "Manrope_700Bold", fontSize: 13, color: "#ea580c", marginTop: 2 },
  attnBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fdba74",
    backgroundColor: "#fff7ed",
  },
  attnCount: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#ea580c",
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 32,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 15,
  },
  attnTitle: { fontFamily: "Manrope_800ExtraBold", fontSize: 14.5, color: "#7c2d12" },
  attnSub: { fontFamily: "Manrope_400Regular", fontSize: 12.5, color: "#9a3412" },
  outChoice: { gap: 10, width: "100%" },
  outChoiceTitle: { fontFamily: "Manrope_700Bold", fontSize: 15, color: "#0f172a" },
  outChoiceBtn: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    gap: 3,
    backgroundColor: "#ffffff",
  },
  outChoiceBtnMain: { borderColor: "#0e7490", borderWidth: 1.5, backgroundColor: "#ecfeff" },
  outChoiceMainText: { fontFamily: "Manrope_800ExtraBold", fontSize: 15, color: "#0e7490" },
  outChoiceDangerText: { fontFamily: "Manrope_800ExtraBold", fontSize: 15, color: "#b91c1c" },
  outChoiceSub: { fontFamily: "Manrope_400Regular", fontSize: 12.5, color: "#475569" },
  outChoiceBack: { alignItems: "center", paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  outChoiceBackText: { fontFamily: "Manrope_700Bold", fontSize: 14, color: "#334155" },
  outMain: {
    fontSize: 13,
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
  },
  outSub: { fontFamily: "Manrope_400Regular", fontSize: 11, color: "#475569", marginTop: 1 },
  outAdd: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 6 },
  outAddText: {
    fontSize: 12,
    color: "#b45309",
    fontFamily: "Manrope_600SemiBold",
  },
  dirMoreBtn: { paddingVertical: 2 },
  editorBody: { padding: 16, paddingBottom: 24 },
  editorDate: {
    fontSize: 13,
    color: "#0ea5e9",
    fontFamily: "Manrope_600SemiBold",
    marginTop: 2,
  },
  infoLine: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#64748b", marginTop: 4 },
  histBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  histCount: {
    fontSize: 12,
    fontFamily: "Manrope_700Bold",
    color: "#1d4ed8",
    marginBottom: 4,
  },
  histItem: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#475569", marginTop: 1 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Manrope_600SemiBold",
    color: "#64748b",
    marginTop: 12,
    marginBottom: 4,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dirSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  dirSearchInput: {
    fontFamily: "Manrope_400Regular",
    flex: 1,
    fontSize: 15,
    color: "#0f172a",
    paddingVertical: 0,
  },
  dirList: { gap: 4 },
  dirRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  dirRowActive: { borderColor: "#0ea5e9", backgroundColor: "#e0f2fe" },
  dirName: {
    fontSize: 15,
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
  },
  dirNameActive: { color: "#0369a1" },
  consequence: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: "#f0f9ff",
  },
  consequenceText: {
    fontFamily: "Manrope_400Regular",
    flex: 1,
    fontSize: 12.5,
    color: "#0c4a6e",
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    marginTop: 12,
  },
  grpHead: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  grpOk: { backgroundColor: "#ecfdf5" },
  grpWarn: { backgroundColor: "#fffbeb" },
  grpBusy: { backgroundColor: "#eff6ff" },
  grpTitle: {
    fontSize: 12,
    fontFamily: "Manrope_700Bold",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  grpTitleOk: { color: "#047857" },
  grpTitleWarn: { color: "#b45309" },
  grpTitleBusy: { color: "#1d4ed8" },
  /** Уже назначенные приглушены: знать о них надо, звать — нет. */
  dirRowBusy: { opacity: 0.6 },
  dirSub: { fontFamily: "Manrope_400Regular", fontSize: 12.5, color: "#64748b", marginTop: 2 },
  chosenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff",
    marginTop: 8,
  },
  chosenName: { fontSize: 15, fontFamily: "Manrope_700Bold", color: "#0f172a" },
  chosenCong: { fontFamily: "Manrope_400Regular", fontSize: 13, color: "#64748b", marginTop: 1 },
  chosenChange: { fontSize: 13, color: "#0369a1", fontFamily: "Manrope_600SemiBold" },
  orTypeIt: {
    fontFamily: "Manrope_400Regular",
    fontSize: 13,
    color: "#64748b",
    marginTop: 12,
    marginBottom: 2,
  },
  dirCaption: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#94a3b8", marginBottom: 4 },
  needText: {
    fontFamily: "Manrope_400Regular",
    flex: 1,
    fontSize: 12.5,
    color: "#b45309",
    lineHeight: 17,
    marginRight: 4,
  },
  dirCong: { fontSize: 12, color: "#64748b", marginTop: 1 },
  dirBadgeCol: { alignItems: "flex-end", gap: 2 },
  dirBadge: { fontSize: 12, color: "#64748b" },
  dirBadgeRecent: {
    color: "#b45309",
    fontFamily: "Manrope_600SemiBold",
  },
  dirUpcoming: { flexDirection: "row", alignItems: "center", gap: 3 },
  dirUpcomingText: {
    fontSize: 12,
    color: "#0369a1",
    fontFamily: "Manrope_600SemiBold",
  },
  dirNew: { fontSize: 12, color: "#94a3b8" },
  dirMore: {
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 6,
  },
  pickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  dayChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  pickChipActive: { backgroundColor: "#e0f2fe", borderColor: "#0ea5e9" },
  pickChipText: { fontFamily: "Manrope_400Regular", fontSize: 13, color: "#475569" },
  pickChipTextActive: {
    color: "#0369a1",
    fontFamily: "Manrope_600SemiBold",
  },
  hostBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  spInfoBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  spInfoPhone: {
    fontSize: 13,
    color: "#0369a1",
    fontFamily: "Manrope_600SemiBold",
  },
  spInfoText: { fontFamily: "Manrope_400Regular", fontSize: 12, color: "#475569", marginTop: 2 },
  hostInfo: { fontFamily: "Manrope_400Regular", fontSize: 13, color: "#92400e" },
  hostMap: {
    fontSize: 13,
    color: "#0369a1",
    fontFamily: "Manrope_600SemiBold",
    marginTop: 4,
  },
  input: {
    fontFamily: "Manrope_400Regular",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f172a",
  },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  deleteBtn: {
    marginRight: "auto",
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
  },
  modalConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#0ea5e9",
  },
  modalConfirmText: {
    fontSize: 15,
    color: "#fff",
    fontFamily: "Manrope_600SemiBold",
  },
  disabled: { opacity: 0.5 },
});
