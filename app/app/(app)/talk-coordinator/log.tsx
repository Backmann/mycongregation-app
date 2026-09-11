import { Fragment, useMemo, useRef, useState, useEffect } from "react";
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
import { useNavigation } from "expo-router";
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
import { usePermissions } from "../../../lib/permissions";
import { confirm } from "../../../components/ConfirmHost";
import {
  computeSpeakerStats,
  computeOutgoingStats,
  OutgoingStats,
  SpeakerStats,
  visitedRecently,
  wentOutRecently,
} from "../../../lib/speaker-stats";
import { formatRelativeDay } from "../../../lib/relative-time";
import { PublisherSelector } from "../../../components/PublisherSelector";
import { PublicTalkSelector } from "../../../components/PublicTalkSelector";
import { startOfWeekMonday, addDays, formatDateISO } from "../../../lib/dates";
import { notify } from "../../../lib/error-bus";
import { useAllPublishers } from "../../../lib/useAllPublishers";

const QK = ["talk-exchange"] as const;

// Years shown: current + next (auto-rolls over).
const YEAR_FROM = new Date().getFullYear();
const YEAR_TO = YEAR_FROM + 1;

// Only these special events are written onto the planner (Memorial only shows
// when it lands on a weekend row, which happens automatically).
const PLANNER_EVENT_TYPES = new Set([
  "regional_convention",
  "circuit_assembly",
  "special_talk",
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

function effectiveVersionFor(
  dateISO: string,
  versions: MeetingSettingsVersion[],
): MeetingSettingsVersion | null {
  const sorted = [...versions].sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom),
  );
  return (
    sorted.find((v) => v.effectiveFrom <= dateISO) ??
    sorted[sorted.length - 1] ??
    null
  );
}

function buildWeeks(
  versions: MeetingSettingsVersion[],
  fallback: MeetingSettingsVersion | null,
): WeekRow[] {
  const rows: WeekRow[] = [];
  let monday = startOfWeekMonday(new Date(`${YEAR_FROM - 1}-12-22T00:00:00`));
  for (let i = 0; i < 130; i++) {
    const mISO = formatDateISO(monday);
    const v = effectiveVersionFor(mISO, versions) ?? fallback;
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
  const perms = usePermissions();
  const qc = useQueryClient();

  const scrollRef = useRef<ScrollView>(null);
  const monthOffsets = useRef<Record<string, number>>({});
  const weekOffsets = useRef<Record<string, number>>({});
  const didInitialScroll = useRef(false);

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

  const listQuery = useQuery({
    queryKey: QK,
    queryFn: () => talkExchangeApi.list(),
  });
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
      { name: string; cong: string | null; phone: string | null }
    >();
    for (const s of speakersQuery.data ?? [])
      m.set(s.id, {
        name: [s.firstName, s.lastName].filter(Boolean).join(" "),
        cong: s.externalCongregation?.name ?? null,
        phone: s.phone ?? null,
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
    const arr = [...(speakersQuery.data ?? [])];
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
  }, [speakersQuery.data, speakerSearch, statsById]);
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

  /**
   * Первая неделя, которая ещё впереди — у неё и ставится черта.
   *
   * Считается один раз по всему списку, а не в каждой карточке: иначе черта
   * появлялась бы в каждом месяце заново. День берётся здесь же: этот расчёт
   * стоит выше, чем `todayISO`, а переносить объявления ради одной строки —
   * лишний повод что-нибудь сдвинуть.
   */
  const firstUpcomingWeek = useMemo(() => {
    const today = dayjs().format("YYYY-MM-DD");
    for (const m of months)
      for (const w of m.rows) if (w.date >= today) return w.monday;
    return null;
  }, [months]);

  // Плоский список недель для модалки «Заменить докладчика».
  const weeksFlat = useMemo<WeekRow[]>(
    () => months.flatMap((mb) => mb.rows),
    [months],
  );

  const currentMonthKey = dayjs().format("YYYY-MM");
  /**
   * The month the reader is actually looking at.
   *
   * The bar used to highlight the CALENDAR month for ever, so it said «Авг.
   * 26» while November was on the screen — and pressing the highlighted chip
   * appeared to do nothing, since it was not where you were.
   */
  const [visibleMonth, setVisibleMonth] = useState(currentMonthKey);
  const monthBarRef = useRef<ScrollView>(null);
  const chipOffsets = useRef<Record<string, number>>({});

  /** Bring a month's chip into view, a little in from the left edge. */
  const showChip = (key: string) => {
    const x = chipOffsets.current[key];
    if (x == null) return;
    monthBarRef.current?.scrollTo({ x: Math.max(x - 16, 0), animated: false });
  };
  const currentWeekMonday = mondayISO(dayjs().format("YYYY-MM-DD"));

  /**
   * Open on the current week.
   *
   * The catch is WHEN to stop trying. The weeks are built from the meeting
   * settings, so they lay out at once — while the entries are still on their
   * way. Scroll then, mark it done, and every row above the current week
   * afterwards grows a card taller: the page ends up somewhere in the past and
   * never corrects itself. On the web the entries usually arrive first, which
   * is why this only ever showed on Android.
   *
   * So the position is fixed on every content-size change until the data is
   * actually in, and only then locked.
   */
  /**
   * Put the current week at the very top, and keep it there while the page
   * settles.
   *
   * Two things move underneath this. The rows are laid out before the entries
   * arrive, so every card that gains a speaker grows and pushes the week down;
   * and `onLayout` for those rows fires AFTER `onContentSizeChange`, so the
   * offsets are one beat stale exactly when we read them. One scroll, however
   * well timed, therefore lands a week or two early — which is what Android
   * kept showing.
   *
   * So it is not one scroll: it repeats while the page settles, each time with
   * fresher offsets.
   *
   * ОТКУДА БРАЛСЯ ПРОМАХ НА ANDROID. Прежде оно останавливалось, когда два
   * прохода подряд давали одно и то же место. Записи чаще всего лежат в
   * памяти, поэтому «данные пришли» становится правдой мгновенно, и два ранних
   * прохода совпадали ДО того, как карточки выросли: замок защёлкивался на
   * стылом месте и больше не открывался. В браузере записи успевали
   * отрисоваться раньше — там и промаха не было.
   *
   * Теперь останавливает не совпадение, а ЧЕЛОВЕК: как только он тронул
   * список, положение принадлежит ему. Плюс общий срок в три секунды, чтобы
   * страница не подпрыгивала вечно, если что-то продолжает шевелиться.
   */
  const lastTarget = useRef<number>(-1);

  /** Когда экран открылся — по этому судим, не пора ли перестать поправлять. */
  const openedAt = useRef<number>(Date.now());

  const placeCurrentWeek = () => {
    if (didInitialScroll.current) return;
    // Три секунды на укладку — дальше страница живёт сама.
    if (Date.now() - openedAt.current > 3000) {
      didInitialScroll.current = true;
      return;
    }
    const week = weekOffsets.current[currentWeekMonday];
    if (week == null) {
      const month = monthOffsets.current[currentMonthKey];
      if (month != null) {
        scrollRef.current?.scrollTo({
          y: Math.max(month - 8, 0),
          animated: false,
        });
      }
      return;
    }

    const target = Math.max(week - 8, 0);
    scrollRef.current?.scrollTo({ y: target, animated: false });
    setVisibleMonth(currentMonthKey);
    showChip(currentMonthKey);

    lastTarget.current = target;
  };

  const scrollToCurrentWeek = () => {
    placeCurrentWeek();
    // A few more passes as the cards fill out; cheap, and they stop as soon as
    // two land identically.
    // Проходы гуще и дольше: на телефоне карточки дорастают позже, чем в
    // браузере, и последний проход должен прийтись уже на выросшие.
    [0, 60, 200, 500, 900, 1500, 2500].forEach((ms) =>
      setTimeout(placeCurrentWeek, ms),
    );
  };

  const scrollToMonth = (key: string) => {
    const off = monthOffsets.current[key];
    if (off != null)
      scrollRef.current?.scrollTo({ y: Math.max(off - 8, 0), animated: true });
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QK });
    // Incoming entries write the weekend public-talk slot via server side
    // effects, so refresh the schedule's assignments/events too.
    qc.invalidateQueries({ queryKey: ["assignments"] });
    qc.invalidateQueries({ queryKey: ["special-events"] });
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
    setEditing(entry ?? null);
    setDirection(dir);
    setDate(entry?.date ?? w.date);
    setPublicTalkId(entry?.publicTalkId ?? null);
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
    setSpeakerSearch("");
    setPubSearch("");
    setShowAllSpeakers(false);
    setShowAllPubs(false);
    setOpen(true);
  };

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

  const canSave =
    direction === "incoming"
      ? incomingMode === "local"
        ? !!publisherId
        : !!visitingSpeakerId || speakerNameInput.trim().length > 0
      : !!publisherId && !!date;

  const save = async () => {
    if (!canSave) return;
    const input: TalkExchangeInput = {
      direction,
      date,
      publicTalkId: publicTalkId ?? null,
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
    };
    const saved = editing
      ? await updateMutation.mutateAsync({ id: editing.id, input })
      : await createMutation.mutateAsync(input);
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

  if (!perms.canCoordinatePublicTalks) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t("talkCoordinator.noAccess")}</Text>
      </View>
    );
  }
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
  const talkRestriction = (id: string | null): string | null => {
    if (!id) return null;
    const tk = talkById.get(id);
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

  /** The badge itself — same shape wherever a talk is named. */
  const RestrictionBadge = ({ id }: { id: string | null }) => {
    const words = talkRestriction(id);
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
  const incomingCong = (e: TalkExchange): string | null =>
    e.visitingSpeakerId
      ? (speakerById.get(e.visitingSpeakerId)?.cong ?? null)
      : e.speakerCongregation;
  const incomingPhone = (e: TalkExchange): string | null =>
    e.visitingSpeakerId
      ? (speakerById.get(e.visitingSpeakerId)?.phone ?? null)
      : null;
  /** Заглавной только первое слово: месяц в русском со строчной. */
  const capitalizeFirst = (x: string) =>
    x.length > 0 ? x[0].toUpperCase() + x.slice(1) : x;

  const fmtDay = (d: string) =>
    dayjs(d).locale(i18n.language).format("dd, D MMM");
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f1f5f9" }}>
      <View style={styles.monthBar}>
        {/* The bar scrolls itself. It never did — so on opening it sat on
            «Янв. 26» while August was on screen, and the highlighted chip was
            off to the left where nobody would look for it. */}
        <ScrollView
          ref={monthBarRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthBarInner}
        >
          {months.map((m) => (
            <Pressable
              key={m.key}
              onLayout={(e) => {
                chipOffsets.current[m.key] = e.nativeEvent.layout.x;
                if (m.key === visibleMonth) showChip(m.key);
              }}
              style={[
                styles.monthChip,
                m.key === visibleMonth && styles.monthChipCurrent,
              ]}
              onPress={() => scrollToMonth(m.key)}
            >
              <Text
                style={[
                  styles.monthChipText,
                  m.key === visibleMonth && styles.monthChipTextCurrent,
                ]}
              >
                {dayjs(`${m.key}-01`).locale(i18n.language).format("MMM YY")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        ref={scrollRef}
        {...{
          /**
           * Тронул список — значит место выбрал он.
           *
           * Это и есть замок: не догадка о том, что вёрстка улеглась, а
           * действие человека. Пока он не притронулся, экран вправе поправлять
           * себя; как только притронулся — молчит.
           */
          onScrollBeginDrag: () => {
            didInitialScroll.current = true;
          },
        }}
        contentContainerStyle={styles.container}
        onContentSizeChange={scrollToCurrentWeek}
        scrollEventThrottle={64}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y + 12;
          let seen = visibleMonth;
          for (const [key, off] of Object.entries(monthOffsets.current)) {
            if (off <= y) seen = key;
          }
          if (seen !== visibleMonth) {
            setVisibleMonth(seen);
            showChip(seen);
          }
        }}
      >
        {months.map((m) => (
          <Fragment key={m.key}>
            <Text
              style={styles.monthHeader}
              onLayout={(e) => {
                monthOffsets.current[m.key] = e.nativeEvent.layout.y;
              }}
            >
              {m.title}
            </Text>
            {m.rows.map((w) => {
              const slot = byWeek.get(w.monday) ?? { missed: [], outgoing: [] };
              const upcoming = w.date >= todayISO;
              const events = eventsForWeekend(w.monday);
              /**
               * Где кончается прошлое.
               *
               * Приглушение было, но при беглом взгляде прошлая неделя от
               * будущей почти не отличалась — а смысл разный: прошлую менять
               * нельзя, будущую надо заполнять. Черта ставится один раз, у
               * первой будущей недели, и только если выше неё что-то было.
               */
              const firstUpcoming = upcoming && w.monday === firstUpcomingWeek;
              /**
               * Неделя без докладчика — работа, а не ошибка.
               *
               * «К нам» без записи это дыра в программе: неделя есть, речи
               * нет, и кто-то должен её закрыть. «От нас» без записи — обычное
               * дело, наши братья ездят не каждую неделю. Обе половины
               * показывались одинаковым бледным «+ Добавить», и глаз не
               * отличал недоделанное от нормального.
               *
               * Только для БУДУЩИХ недель и только там, где неделю не накрыло
               * событие: в прошлом пометка бессмысленна — его не исправляют, а
               * под событием речи и не должно быть.
               */
              const needsSpeaker =
                upcoming &&
                events.length === 0 &&
                !byWeek.get(w.monday)?.incoming;
              return (
                <Fragment key={w.monday}>
                  {firstUpcoming ? (
                    <View style={styles.pastLine}>
                      <View style={styles.pastRule} />
                      <Text style={styles.pastLabel}>
                        {t("talkCoordinator.log.upcomingFrom")}
                      </Text>
                      <View style={styles.pastRule} />
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.weekendRow,
                      !upcoming && styles.weekendPast,
                      needsSpeaker && styles.weekendNeeds,
                    ]}
                    onLayout={(e) => {
                      weekOffsets.current[w.monday] = e.nativeEvent.layout.y;
                      // The row's own layout is the freshest word on where it
                      // is; every time it moves, put it back at the top.
                      if (w.monday === currentWeekMonday) placeCurrentWeek();
                    }}
                  >
                    <Text style={styles.weekendDate}>{fmtDay(w.date)}</Text>
                    <View style={styles.slots}>
                      {events.length > 0 ? (
                        <View style={[styles.slot, styles.eventSlot]}>
                          <Text style={styles.eventLabel}>
                            {t("talkCoordinator.log.event")}
                          </Text>
                          <Text style={styles.eventTitle} numberOfLines={2}>
                            {events
                              .map((ev) =>
                                t(`specialEvents.types.${ev.type}`, {
                                  defaultValue: ev.title ?? ev.type ?? "",
                                }),
                              )
                              .join(" · ")}
                          </Text>
                          {/*
                          Специальная речь — это тоже речь: у неё есть тема и
                          докладчик, и координатору они нужны так же, как в
                          обычную неделю. Раньше здесь стояло одно название
                          рода события, и неделя выглядела пустой.

                          Берётся из программы встречи — там она и назначается.
                        */}
                          {(() => {
                            const slotOf = talkSlotByWeek.get(w.monday);
                            if (!slotOf) return null;
                            const who =
                              slotOf.speakerName ??
                              (slotOf.publisherId
                                ? (pubById.get(slotOf.publisherId) ?? null)
                                : null);
                            const theme =
                              talkLabel(slotOf.publicTalkId) ||
                              slotOf.partTitle ||
                              null;
                            if (!who && !theme) return null;
                            return (
                              <>
                                {who ? (
                                  <Text style={styles.eventWho}>{who}</Text>
                                ) : null}
                                {theme ? (
                                  <Text
                                    style={styles.eventTheme}
                                    numberOfLines={2}
                                  >
                                    {theme}
                                  </Text>
                                ) : null}
                              </>
                            );
                          })()}
                        </View>
                      ) : (
                        <>
                          {slot.missed.length > 0 ? (
                            <View style={styles.missedBox}>
                              {slot.missed.map((mv) => (
                                <View key={mv.id} style={styles.missedRow}>
                                  <Ionicons
                                    name="close-circle-outline"
                                    size={13}
                                    color="#b45309"
                                  />
                                  <Text style={styles.missedText}>
                                    {t("talkCoordinator.log.didNotCome", {
                                      name:
                                        incomingName(mv) ??
                                        t("talkCoordinator.log.unknownSpeaker"),
                                    })}
                                    {mv.note ? ` · ${mv.note}` : ""}
                                  </Text>
                                  {/* Отметка «не приехал» верна ровно пока она
                                  правда. Замену делают в спешке перед
                                  встречей, и ошибиться легко — а стереть
                                  ложное пятно было нечем. */}
                                  <Pressable
                                    hitSlop={8}
                                    disabled={undoMutation.isPending}
                                    onPress={() => askUndo(mv)}
                                  >
                                    <Text style={styles.missedUndo}>
                                      {t("talkCoordinator.log.undoReplacement")}
                                    </Text>
                                  </Pressable>
                                </View>
                              ))}
                            </View>
                          ) : null}
                          <Slot
                            label={t("talkCoordinator.log.filter.incoming")}
                            accent="#0369a1"
                            bg="#e0f2fe"
                            entry={slot.incoming}
                            onPress={() =>
                              openSlot(w, "incoming", slot.incoming)
                            }
                            onSwap={() => openSwap(w)}
                            swapHint={t("talkCoordinator.swap.action")}
                          >
                            {slot.incoming ? (
                              <>
                                <Text style={styles.slotMain}>
                                  {incomingName(slot.incoming) ??
                                    t("talkCoordinator.log.unknownSpeaker")}
                                </Text>
                                {!!incomingCong(slot.incoming) && (
                                  <Text style={styles.slotCong}>
                                    {incomingCong(slot.incoming)}
                                  </Text>
                                )}
                                {!!incomingPhone(slot.incoming) && (
                                  <Text style={styles.slotCong}>
                                    {t("talkCoordinator.log.phone")}:{" "}
                                    {incomingPhone(slot.incoming)}
                                  </Text>
                                )}
                                {!!talkLabel(slot.incoming.publicTalkId) && (
                                  <Text style={styles.slotSub}>
                                    {talkLabel(slot.incoming.publicTalkId)}
                                  </Text>
                                )}
                                <RestrictionBadge
                                  id={slot.incoming.publicTalkId}
                                />
                              </>
                            ) : null}
                          </Slot>
                        </>
                      )}
                      <View style={styles.outCol}>
                        <Text
                          style={[
                            styles.slotLabel,
                            { color: "#b45309", marginBottom: 4 },
                          ]}
                        >
                          {t("talkCoordinator.log.filter.outgoing")}
                        </Text>
                        {slot.outgoing.map((o) => (
                          <Pressable
                            key={o.id}
                            style={styles.outItem}
                            onPress={() => openSlot(w, "outgoing", o)}
                          >
                            <Text style={styles.outMain}>
                              {o.publisherId
                                ? (pubById.get(o.publisherId) ?? "—")
                                : "—"}
                              {o.hostCongregationId
                                ? ` → ${congById.get(o.hostCongregationId)?.name ?? ""}`
                                : ""}
                            </Text>
                            <Text style={styles.outSub}>
                              {o.date !== w.date ? `${fmtDay(o.date)}` : ""}
                              {o.date !== w.date && talkLabel(o.publicTalkId)
                                ? " · "
                                : ""}
                              {talkLabel(o.publicTalkId) ?? ""}
                            </Text>
                            {/* Our own brother travelling with it — the case
                              that costs a telephone call if it is missed. */}
                            <RestrictionBadge id={o.publicTalkId} />
                            {!o.publicTalkId && (
                              <Text style={styles.outHint}>
                                {t("talkCoordinator.log.noTalk")}
                              </Text>
                            )}
                          </Pressable>
                        ))}
                        <Pressable
                          style={styles.outAdd}
                          onPress={() => openSlot(w, "outgoing", undefined)}
                        >
                          <Ionicons name="add" size={14} color="#b45309" />
                          <Text style={styles.outAddText}>
                            {t("talkCoordinator.log.addSlot")}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Fragment>
              );
            })}
          </Fragment>
        ))}
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

          <ScrollView style={styles.swapList}>
            {weeksFlat
              .filter(
                (w) =>
                  w.monday !== swapTarget?.monday &&
                  !!byWeek.get(w.monday)?.incoming &&
                  // Прошедшие недели не предлагаются вовсе. Сервер их и так
                  // отвергнет, но список, показывающий невозможное, заставляет
                  // человека выяснять правила на отказах — а правило простое:
                  // передвинуть можно то, чего ещё не было.
                  !weekIsOver(w.monday),
              )
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
                      {talkLabel(inc.publicTalkId) ? (
                        <Text style={styles.swapRowTalk} numberOfLines={1}>
                          {talkLabel(inc.publicTalkId)}
                        </Text>
                      ) : null}
                      {/* Also where a speaker is being swapped in: the moment a
                        restricted talk would otherwise be chosen. */}
                      <RestrictionBadge id={inc.publicTalkId} />
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

          {weeksFlat.filter(
            (w) =>
              w.monday !== swapTarget?.monday &&
              !!byWeek.get(w.monday)?.incoming &&
              !weekIsOver(w.monday),
          ).length === 0 ? (
            <Text style={styles.swapEmpty}>
              {t("talkCoordinator.swap.noneAvailable")}
            </Text>
          ) : null}

          {swapError ? <Text style={styles.swapError}>{swapError}</Text> : null}
        </View>
      </Dialog>

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
                  ? incomingMode === "local"
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
        }
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.editorBody}
        >
          {direction === "incoming" ? (
            <>
              {week && (week.time || week.address) ? (
                <Text style={styles.infoLine}>
                  {[week.time, week.address].filter(Boolean).join(" · ")}
                </Text>
              ) : null}

              <Text style={styles.fieldLabel}>
                {t("talkCoordinator.log.speakerSource")}
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

              {/* Лист 2: что и кем сопровождается — речь, приём, заметка. */}
              <View style={styles.formCard}>
                <View style={{ marginTop: 2 }}>
                  <PublicTalkSelector
                    label={t("talkCoordinator.log.talk")}
                    value={publicTalkId}
                    onChange={(talk) => setPublicTalkId(talk?.id ?? null)}
                  />
                </View>
                {publicTalkId ? (
                  <View style={styles.histBox}>
                    <Text style={styles.histCount}>
                      {t("talkCoordinator.log.givenTimes", {
                        n: talkOccs.length,
                      })}
                    </Text>
                    {talkOccs.map((o) => (
                      <Text
                        key={o.id}
                        style={styles.histItem}
                        numberOfLines={1}
                      >
                        {fmtHist(o.date)} ·{" "}
                        {incomingName(o) ??
                          t("talkCoordinator.log.unknownSpeaker")}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <View style={{ marginTop: 10 }}>
                  <PublisherSelector
                    label={t("talkCoordinator.log.hospitality")}
                    value={hospitalityPublisherId}
                    onChange={setHospitalityPublisherId}
                  />
                </View>
              </View>
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
                        {dayjs(d).locale(i18n.language).format("dddd, D MMM")}
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

          <Text style={styles.fieldLabel}>{t("talkCoordinator.log.note")}</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            multiline
            placeholderTextColor="#94a3b8"
          />
        </ScrollView>
      </Sheet>
    </SafeAreaView>
  );
}

function Slot({
  label,
  accent,
  bg,
  entry,
  onPress,
  onSwap,
  swapHint,
  children,
}: {
  label: string;
  accent: string;
  bg: string;
  entry?: TalkExchange;
  onPress: () => void;
  onSwap?: () => void;
  swapHint?: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      style={[styles.slot, entry ? { backgroundColor: bg } : styles.slotEmpty]}
      onPress={onPress}
    >
      <View style={styles.slotLabelRow}>
        <Text style={[styles.slotLabel, { color: accent }]}>{label}</Text>
        {onSwap ? (
          <Pressable
            onPress={onSwap}
            hitSlop={10}
            accessibilityLabel={swapHint}
            style={styles.slotSwapBtn}
          >
            <Ionicons name="swap-horizontal" size={15} color={accent} />
          </Pressable>
        ) : null}
      </View>
      {entry ? (
        <View>{children}</View>
      ) : (
        <Text style={styles.slotAdd}>+ {t("talkCoordinator.log.addSlot")}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    flexShrink: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  muted: { color: "#64748b", fontSize: 13 },
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
    fontWeight: "600",
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
  swapBody: { gap: 10 },
  swapHint: { fontSize: 12.5, color: "#64748b" },
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
    fontWeight: "700",
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
  swapRowDate: { fontSize: 12, color: "#64748b", textTransform: "capitalize" },
  swapRowName: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
  },
  swapRowTalk: { fontSize: 12, color: "#0369a1" },
  swapEmpty: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 19,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  swapError: { fontSize: 12.5, color: "#b91c1c" },
  monthHeader: {
    fontSize: 13,
    fontWeight: "700",
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
    fontSize: 11.5,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  weekendDate: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
    textTransform: "capitalize",
    marginBottom: 6,
  },
  outHint: {
    fontSize: 11,
    color: "#dc2626",
    fontStyle: "italic",
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
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#6d28d9",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  eventWho: { fontSize: 14, color: "#0f172a", fontWeight: "600", marginTop: 4 },
  eventTheme: {
    fontSize: 12.5,
    color: "#64748b",
    marginTop: 2,
    lineHeight: 17,
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#5b21b6",
    marginTop: 3,
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  slotMain: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
    marginTop: 3,
  },
  slotSub: { fontSize: 11, color: "#475569", marginTop: 1 },
  missedBox: { marginBottom: 6, gap: 4 },
  missedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  missedText: { flex: 1, fontSize: 12, color: "#b45309", lineHeight: 17 },
  missedUndo: { fontSize: 12, color: "#0369a1", fontWeight: "600" },
  slotCong: { fontSize: 11, color: "#64748b", marginTop: 1 },
  slotAdd: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
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
  outMain: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
  },
  outSub: { fontSize: 11, color: "#475569", marginTop: 1 },
  outAdd: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 6 },
  outAddText: {
    fontSize: 12,
    color: "#b45309",
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  dirMoreBtn: { paddingVertical: 2 },
  editorBody: { padding: 16, paddingBottom: 24 },
  editorDate: {
    fontSize: 13,
    color: "#0ea5e9",
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    marginTop: 2,
  },
  infoLine: { fontSize: 12, color: "#64748b", marginTop: 4 },
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
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#1d4ed8",
    marginBottom: 4,
  },
  histItem: { fontSize: 12, color: "#475569", marginTop: 1 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
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
    fontWeight: "600",
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
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  grpTitleOk: { color: "#047857" },
  grpTitleWarn: { color: "#b45309" },
  grpTitleBusy: { color: "#1d4ed8" },
  /** Уже назначенные приглушены: знать о них надо, звать — нет. */
  dirRowBusy: { opacity: 0.6 },
  dirSub: { fontSize: 12.5, color: "#64748b", marginTop: 2 },
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
  chosenName: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  chosenCong: { fontSize: 13, color: "#64748b", marginTop: 1 },
  chosenChange: { fontSize: 13, color: "#0369a1", fontWeight: "600" },
  orTypeIt: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 12,
    marginBottom: 2,
  },
  dirCaption: { fontSize: 12, color: "#94a3b8", marginBottom: 4 },
  needText: {
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
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  dirUpcoming: { flexDirection: "row", alignItems: "center", gap: 3 },
  dirUpcomingText: {
    fontSize: 12,
    color: "#0369a1",
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  dirNew: { fontSize: 12, color: "#94a3b8", fontStyle: "italic" },
  dirMore: {
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
  pickChipText: { fontSize: 13, color: "#475569", textTransform: "capitalize" },
  pickChipTextActive: {
    color: "#0369a1",
    fontWeight: "600",
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
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  spInfoText: { fontSize: 12, color: "#475569", marginTop: 2 },
  hostInfo: { fontSize: 13, color: "#92400e" },
  hostMap: {
    fontSize: 13,
    color: "#0369a1",
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    marginTop: 4,
  },
  input: {
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
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  disabled: { opacity: 0.5 },
});
