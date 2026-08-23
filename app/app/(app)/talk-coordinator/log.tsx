import { Fragment, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
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
  publishersApi,
  publicTalksApi,
  PublicTalk,
  VisitingSpeaker,
  meetingSettingsApi,
  specialEventsApi,
  MeetingSettingsVersion,
  extractErrorMessage,
} from '../../../lib/api';
import { Dialog } from '../../../components/Dialog';
import { Sheet } from '../../../components/Sheet';
import { usePermissions } from '../../../lib/permissions';
import { confirm } from '../../../components/ConfirmHost';
import {
  computeSpeakerStats,
  computeOutgoingStats,
  OutgoingStats,
  SpeakerStats,
  visitedRecently,
  wentOutRecently,
} from '../../../lib/speaker-stats';
import { formatRelativeDay } from '../../../lib/relative-time';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { PublicTalkSelector } from '../../../components/PublicTalkSelector';
import { startOfWeekMonday, addDays, formatDateISO } from '../../../lib/dates';
import { notify } from '../../../lib/error-bus';

const QK = ['talk-exchange'] as const;

// Years shown: current + next (auto-rolls over).
const YEAR_FROM = new Date().getFullYear();
const YEAR_TO = YEAR_FROM + 1;

// Only these special events are written onto the planner (Memorial only shows
// when it lands on a weekend row, which happens automatically).
const PLANNER_EVENT_TYPES = new Set([
  'regional_convention',
  'circuit_assembly',
  'special_talk',
  'memorial',
  'circuit_overseer_visit',
]);

type WeekRow = { monday: string; date: string; time: string | null; address: string | null };
type MonthBlock = { key: string; title: string; rows: WeekRow[] };
type SlotState = { incoming?: TalkExchange; outgoing: TalkExchange[] };

function mondayISO(dateISO: string): string {
  return formatDateISO(startOfWeekMonday(new Date(`${dateISO}T00:00:00`)));
}

function effectiveVersionFor(
  dateISO: string,
  versions: MeetingSettingsVersion[],
): MeetingSettingsVersion | null {
  const sorted = [...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return sorted.find((v) => v.effectiveFrom <= dateISO) ?? sorted[sorted.length - 1] ?? null;
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
      rows.push({ monday: mISO, date: formatDateISO(wd), time: v?.weekendTime ?? null, address: v?.address ?? null });
    if (y > YEAR_TO) break;
    monday = addDays(monday, 7);
  }
  return rows;
}

function confirmReplace(title: string, body: string, ok: string, cancel: string): Promise<boolean> {
  return confirm({ title, body, confirmLabel: ok, cancelLabel: cancel });
}

export default function TalkExchangeYearScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const qc = useQueryClient();

  const scrollRef = useRef<ScrollView>(null);
  const monthOffsets = useRef<Record<string, number>>({});
  const weekOffsets = useRef<Record<string, number>>({});
  const didInitialScroll = useRef(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TalkExchange | null>(null);
  const [direction, setDirection] = useState<TalkExchangeDirection>('incoming');
  const [week, setWeek] = useState<WeekRow | null>(null);
  // «Заменить докладчика»: целевая неделя, неделя-источник и режим.
  const [swapTarget, setSwapTarget] = useState<WeekRow | null>(null);
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [swapMode, setSwapMode] = useState<'swap' | 'move'>('swap');
  const [swapError, setSwapError] = useState<string | null>(null);
  const [date, setDate] = useState<string>('');
  const [publicTalkId, setPublicTalkId] = useState<string | null>(null);
  const [visitingSpeakerId, setVisitingSpeakerId] = useState<string | null>(null);
  const [speakerNameInput, setSpeakerNameInput] = useState('');
  const [speakerCongInput, setSpeakerCongInput] = useState('');
  const [speakerSearch, setSpeakerSearch] = useState('');
  const [pubSearch, setPubSearch] = useState('');
  const [showAllSpeakers, setShowAllSpeakers] = useState(false);
  const [showAllPubs, setShowAllPubs] = useState(false);
  const [incomingMode, setIncomingMode] = useState<'invited' | 'local'>('invited');
  const [hospitalityPublisherId, setHospitalityPublisherId] = useState<string | null>(null);
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [hostCongregationId, setHostCongregationId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const listQuery = useQuery({ queryKey: QK, queryFn: () => talkExchangeApi.list() });
  const settingsQuery = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
  });
  const eventsQuery = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
  });
  const speakersQuery = useQuery({
    queryKey: ['visiting-speakers'],
    queryFn: () => visitingSpeakersApi.list(),
  });
  const congQuery = useQuery({
    queryKey: ['external-congregations'],
    queryFn: () => externalCongregationsApi.list(),
  });
  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({ limit: 200 }),
  });
  const talksQuery = useQuery({
    queryKey: ['public-talks', 'all'],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });

  const speakerById = useMemo(() => {
    const m = new Map<string, { name: string; cong: string | null; phone: string | null }>();
    for (const s of speakersQuery.data ?? [])
      m.set(s.id, {
        name: [s.firstName, s.lastName].filter(Boolean).join(' '),
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
    for (const p of publishersQuery.data?.data ?? []) m.set(p.id, p.displayName);
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

  const today = new Date().toLocaleDateString('en-CA');
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
      [sp.firstName, sp.lastName].filter(Boolean).join(' ');
    const filtered = q
      ? arr.filter(
          (sp) =>
            nameOf(sp).toLowerCase().includes(q) ||
            (sp.externalCongregation?.name ?? '').toLowerCase().includes(q),
        )
      : arr;
    filtered.sort((a, b) => {
      const la = statsById.get(a.id)?.lastVisit?.date ?? '';
      const lb = statsById.get(b.id)?.lastVisit?.date ?? '';
      return la.localeCompare(lb) || nameOf(a).localeCompare(nameOf(b));
    });
    return filtered;
  }, [speakersQuery.data, speakerSearch, statsById]);
  const visibleSpeakers = useMemo(() => {
    if (speakerSearch.trim() || showAllSpeakers) return sortedSpeakers;
    const top = sortedSpeakers.slice(0, 6);
    if (visitingSpeakerId && !top.some((sp) => sp.id === visitingSpeakerId)) {
      const sel = sortedSpeakers.find((sp) => sp.id === visitingSpeakerId);
      if (sel) return [sel, ...top];
    }
    return top;
  }, [sortedSpeakers, speakerSearch, visitingSpeakerId, showAllSpeakers]);
  const hiddenSpeakerCount = sortedSpeakers.length - visibleSpeakers.length;

  // --- "From us": our outgoing speakers + recency, for the outgoing picker ---
  const ourPubs = useMemo(() => {
    const withTalk = new Set<string>();
    for (const e of listQuery.data ?? [])
      if (e.publisherId) withTalk.add(e.publisherId);
    return (publishersQuery.data?.data ?? []).filter(
      (p) =>
        p.isActive &&
        p.gender === 'brother' &&
        (p.capabilities?.public_talk_speaker === true || withTalk.has(p.id)),
    );
  }, [publishersQuery.data, listQuery.data]);
  const outStatsById = useMemo(() => {
    const tmap = new Map<string, PublicTalk>();
    for (const tk of talksQuery.data?.data ?? []) tmap.set(tk.id, tk);
    const m = new Map<string, OutgoingStats>();
    for (const p of ourPubs)
      m.set(p.id, computeOutgoingStats(p.id, listQuery.data ?? [], tmap, congById, today));
    return m;
  }, [ourPubs, listQuery.data, talksQuery.data, congById, today]);
  const sortedPubs = useMemo(() => {
    const q = pubSearch.trim().toLowerCase();
    const pool = q
      ? (publishersQuery.data?.data ?? []).filter(
          (p) =>
            p.isActive &&
            p.gender === 'brother' &&
            p.displayName.toLowerCase().includes(q),
        )
      : [...ourPubs];
    pool.sort((a, b) => {
      const la = outStatsById.get(a.id)?.lastVisit?.date ?? '';
      const lb = outStatsById.get(b.id)?.lastVisit?.date ?? '';
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

  const byWeek = useMemo(() => {
    const m = new Map<string, SlotState>();
    for (const e of listQuery.data ?? []) {
      const k = mondayISO(e.date);
      const slot = m.get(k) ?? { outgoing: [] };
      if (e.direction === 'incoming') slot.incoming = e;
      else slot.outgoing.push(e);
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
      if (e.direction !== 'incoming' || !e.publicTalkId) continue;
      const arr = m.get(e.publicTalkId) ?? [];
      arr.push(e);
      m.set(e.publicTalkId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
    return m;
  }, [listQuery.data]);

  const eventsForWeekend = useMemo(() => {
    const events = (eventsQuery.data ?? []).filter((ev) => PLANNER_EVENT_TYPES.has(ev.type ?? ''));
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
      title: dayjs(`${key}-01`).locale(i18n.language).format('MMMM YYYY'),
      rows,
    }));
  }, [settingsQuery.data, i18n.language]);

  // Плоский список недель для модалки «Заменить докладчика».
  const weeksFlat = useMemo<WeekRow[]>(
    () => months.flatMap((mb) => mb.rows),
    [months],
  );

  const currentMonthKey = dayjs().format('YYYY-MM');
  /**
   * The month the reader is actually looking at.
   *
   * The bar used to highlight the CALENDAR month for ever, so it said «Авг.
   * 26» while November was on the screen — and pressing the highlighted chip
   * appeared to do nothing, since it was not where you were.
   */
  const [visibleMonth, setVisibleMonth] = useState(currentMonthKey);
  const currentWeekMonday = mondayISO(dayjs().format('YYYY-MM-DD'));

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
  const scrollToCurrentWeek = () => {
    if (didInitialScroll.current) return;
    const week = weekOffsets.current[currentWeekMonday];
    const month = monthOffsets.current[currentMonthKey];
    const off = week ?? month;
    if (off == null) return;

    /**
     * The month heading of the current week, when it is close above.
     *
     * Landing exactly on the week row leaves the reader in the middle of a
     * month with no idea which one — the heading is just off the top. Taking
     * the heading instead, when it is within a screen, gives the week context
     * and still puts it near the top.
     */
    const target =
      month != null && week != null && week - month < 260 ? month : off;
    scrollRef.current?.scrollTo({ y: Math.max(target - 8, 0), animated: false });

    // Locked only once there is nothing left to arrive and shift things.
    const settled =
      !listQuery.isLoading &&
      !settingsQuery.isLoading &&
      weekOffsets.current[currentWeekMonday] != null;
    if (settled) didInitialScroll.current = true;
  };

  const scrollToMonth = (key: string) => {
    const off = monthOffsets.current[key];
    if (off != null) scrollRef.current?.scrollTo({ y: Math.max(off - 8, 0), animated: true });
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QK });
    // Incoming entries write the weekend public-talk slot via server side
    // effects, so refresh the schedule's assignments/events too.
    qc.invalidateQueries({ queryKey: ['assignments'] });
    qc.invalidateQueries({ queryKey: ['special-events'] });
  };
  const showError = (e: unknown) => {
    const msg = extractErrorMessage(e);
    if (Platform.OS === 'web') window.alert(msg);
    else notify(t('talkCoordinator.errorTitle'), msg);
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
    createMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  const swapMutation = useMutation({
    mutationFn: (vars: {
      sourceWeekStartDate: string;
      targetWeekStartDate: string;
      mode: 'swap' | 'move';
    }) => assignmentsApi.swapPublicTalk(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ['assignments'] });
      setSwapTarget(null);
      setSwapSource(null);
      setSwapError(null);
    },
    onError: (e) => setSwapError(extractErrorMessage(e)),
  });

  const openSwap = (w: WeekRow) => {
    setSwapTarget(w);
    setSwapSource(null);
    setSwapMode('swap');
    setSwapError(null);
  };

  const openSlot = (w: WeekRow, dir: TalkExchangeDirection, entry?: TalkExchange) => {
    setWeek(w);
    setEditing(entry ?? null);
    setDirection(dir);
    setDate(entry?.date ?? w.date);
    setPublicTalkId(entry?.publicTalkId ?? null);
    setVisitingSpeakerId(entry?.visitingSpeakerId ?? null);
    if (entry?.visitingSpeakerId) {
      const sp = speakerById.get(entry.visitingSpeakerId);
      setSpeakerNameInput(sp?.name ?? '');
      setSpeakerCongInput(sp?.cong ?? '');
    } else {
      setSpeakerNameInput(entry?.speakerName ?? '');
      setSpeakerCongInput(entry?.speakerCongregation ?? '');
    }
    setHospitalityPublisherId(entry?.hospitalityPublisherId ?? null);
    setPublisherId(entry?.publisherId ?? null);
    setIncomingMode(
      dir === 'incoming' && entry?.publisherId ? 'local' : 'invited',
    );
    setHostCongregationId(entry?.hostCongregationId ?? null);
    setNote(entry?.note ?? '');
    setSpeakerSearch('');
    setPubSearch('');
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
    setSpeakerNameInput(sp?.name ?? '');
    setSpeakerCongInput(sp?.cong ?? '');
  };

  const onPickHost = (id: string | null) => {
    setHostCongregationId(id);
    const h = id ? congById.get(id) : null;
    if (h?.meetingDow && (h.meetingDow === 6 || h.meetingDow === 7) && week) {
      setDate(formatDateISO(addDays(new Date(`${week.monday}T00:00:00`), h.meetingDow - 1)));
    }
  };

  const canSave =
    direction === 'incoming'
      ? incomingMode === 'local'
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
        direction === 'incoming' && incomingMode === 'invited' ? visitingSpeakerId : null,
      speakerName:
        direction === 'incoming' && incomingMode === 'invited' && !visitingSpeakerId
          ? speakerNameInput.trim() || null
          : null,
      speakerCongregation:
        direction === 'incoming' && incomingMode === 'invited' && !visitingSpeakerId
          ? speakerCongInput.trim() || null
          : null,
      hospitalityPublisherId: direction === 'incoming' ? hospitalityPublisherId : null,
      publisherId:
        direction === 'outgoing' || (direction === 'incoming' && incomingMode === 'local')
          ? publisherId
          : null,
      hostCongregationId: direction === 'outgoing' ? hostCongregationId : null,
    };
    const saved = editing
      ? await updateMutation.mutateAsync({ id: editing.id, input })
      : await createMutation.mutateAsync(input);
    if (saved.programConflict) {
      const ok = await confirmReplace(
        t('talkCoordinator.log.conflictTitle'),
        t('talkCoordinator.log.conflictBody'),
        t('talkCoordinator.log.replace'),
        t('common.cancel'),
      );
      if (ok) {
        await updateMutation.mutateAsync({ id: saved.id, input: { ...input, overwriteProgram: true } });
      }
    }
    setOpen(false);
  };

  const del = async () => {
    if (!editing) return;
    if (
      await confirm({
        title: t('talkCoordinator.log.deleteTitle'),
        body: t('talkCoordinator.log.deleteBody'),
        confirmLabel: t('common.delete'),
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
        <Text style={styles.muted}>{t('talkCoordinator.noAccess')}</Text>
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
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    if (!tk.retiredFrom) return t('publicTalks.retiredPlain');
    return tk.retiredUntil
      ? t('publicTalks.pausedBetween', {
          from: day(tk.retiredFrom),
          until: day(tk.retiredUntil),
        })
      : t('publicTalks.retiredFrom', { date: day(tk.retiredFrom) });
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
      ? pubById.get(e.publisherId) ?? null
      : e.visitingSpeakerId
        ? speakerById.get(e.visitingSpeakerId)?.name ?? null
        : e.speakerName;
  const incomingCong = (e: TalkExchange): string | null =>
    e.visitingSpeakerId
      ? speakerById.get(e.visitingSpeakerId)?.cong ?? null
      : e.speakerCongregation;
  const incomingPhone = (e: TalkExchange): string | null =>
    e.visitingSpeakerId ? speakerById.get(e.visitingSpeakerId)?.phone ?? null : null;
  const fmtDay = (d: string) => dayjs(d).locale(i18n.language).format('dd, D MMM');
  const todayISO = dayjs().format('YYYY-MM-DD');
  const host = hostCongregationId ? congById.get(hostCongregationId) ?? null : null;
  const selSpeaker = visitingSpeakerId
    ? (speakersQuery.data ?? []).find((s) => s.id === visitingSpeakerId) ?? null
    : null;
  const selSpeakerCong = selSpeaker?.externalCongregationId
    ? congById.get(selSpeaker.externalCongregationId) ?? null
    : null;
  const weekendDays = week
    ? [5, 6].map((i) => formatDateISO(addDays(new Date(`${week.monday}T00:00:00`), i)))
    : [];
  const talkOccs = publicTalkId
    ? (incomingByTalk.get(publicTalkId) ?? []).filter((o) => o.id !== editing?.id)
    : [];
  const fmtHist = (d: string) => dayjs(d).locale(i18n.language).format('D MMM YYYY');

  const renderBrotherPicker = () => (
    <>
      <Text style={styles.fieldLabel}>
        {t('talkCoordinator.log.ourBrother')}
      </Text>
      <View style={styles.dirSearchRow}>
        <Ionicons name="search" size={15} color="#94a3b8" />
        <TextInput
          style={styles.dirSearchInput}
          value={pubSearch}
          onChangeText={setPubSearch}
          placeholder={t('talkCoordinator.log.brotherSearch')}
          placeholderTextColor="#94a3b8"
        />
        {pubSearch ? (
          <Pressable hitSlop={8} onPress={() => setPubSearch('')}>
            <Ionicons
              name="close-circle"
              size={15}
              color="#cbd5e1"
            />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.dirList}>
        {visiblePubs.map((p) => {
          const sel = publisherId === p.id;
          const st = outStatsById.get(p.id);
          const recent = st ? wentOutRecently(st, today) : false;
          return (
            <Pressable
              key={p.id}
              style={[styles.dirRow, sel && styles.dirRowActive]}
              onPress={() => setPublisherId(sel ? null : p.id)}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.dirName,
                    sel && styles.dirNameActive,
                  ]}
                >
                  {p.displayName}
                </Text>
              </View>
              {st && (st.count > 0 || st.nextVisit) ? (
                <View style={styles.dirBadgeCol}>
                  {st.count > 0 && st.lastVisit ? (
                    <Text
                      style={[
                        styles.dirBadge,
                        recent && styles.dirBadgeRecent,
                      ]}
                    >
                      {t('talkCoordinator.ourSpeakers.status.lastSeen', {
                        count: st.count,
                        rel: formatRelativeDay(
                          st.lastVisit.date,
                          today,
                          t,
                        ),
                      })}
                    </Text>
                  ) : null}
                  {st.nextVisit ? (
                    <View style={styles.dirUpcoming}>
                      <Ionicons
                        name="airplane"
                        size={10}
                        color="#0369a1"
                      />
                      <Text style={styles.dirUpcomingText}>
                        {formatRelativeDay(
                          st.nextVisit.date,
                          today,
                          t,
                        )}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.dirNew}>
                  {t('talkCoordinator.ourSpeakers.status.never')}
                </Text>
              )}
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
        {hiddenPubCount > 0 ? (
          <Pressable
            onPress={() => setShowAllPubs(true)}
            style={styles.dirMoreBtn}
          >
            <Text style={styles.dirMore}>
              {t('talkCoordinator.log.moreSpeakers', {
                n: hiddenPubCount,
              })}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <View style={styles.monthBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthBarInner}>
          {months.map((m) => (
            <Pressable
              key={m.key}
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
                {dayjs(`${m.key}-01`).locale(i18n.language).format('MMM YY')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        onContentSizeChange={scrollToCurrentWeek}
        scrollEventThrottle={64}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y + 12;
          let seen = visibleMonth;
          for (const [key, off] of Object.entries(monthOffsets.current)) {
            if (off <= y) seen = key;
          }
          if (seen !== visibleMonth) setVisibleMonth(seen);
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
              const slot = byWeek.get(w.monday) ?? { outgoing: [] };
              const upcoming = w.date >= todayISO;
              const events = eventsForWeekend(w.monday);
              return (
                <View
                  key={w.monday}
                  style={[styles.weekendRow, !upcoming && styles.weekendPast]}
                  onLayout={(e) => {
                    weekOffsets.current[w.monday] = e.nativeEvent.layout.y;
                    if (w.monday === currentWeekMonday) scrollToCurrentWeek();
                  }}
                >
                  <Text style={styles.weekendDate}>{fmtDay(w.date)}</Text>
                  <View style={styles.slots}>
                    {events.length > 0 ? (
                      <View style={[styles.slot, styles.eventSlot]}>
                        <Text style={styles.eventLabel}>{t('talkCoordinator.log.event')}</Text>
                        <Text style={styles.eventTitle} numberOfLines={2}>
                          {events
                            .map((ev) =>
                              t(`specialEvents.types.${ev.type}`, {
                                defaultValue: ev.title ?? ev.type ?? '',
                              }),
                            )
                            .join(' · ')}
                        </Text>
                      </View>
                    ) : (
                      <Slot
                        label={t('talkCoordinator.log.filter.incoming')}
                        accent="#0369a1"
                        bg="#e0f2fe"
                        entry={slot.incoming}
                        onPress={() => openSlot(w, 'incoming', slot.incoming)}
                        onSwap={() => openSwap(w)}
                        swapHint={t('talkCoordinator.swap.action')}
                      >
                        {slot.incoming ? (
                          <>
                            <Text style={styles.slotMain}>
                              {incomingName(slot.incoming) ?? t('talkCoordinator.log.unknownSpeaker')}
                            </Text>
                            {!!incomingCong(slot.incoming) && (
                              <Text style={styles.slotCong}>
                                {incomingCong(slot.incoming)}
                              </Text>
                            )}
                            {!!incomingPhone(slot.incoming) && (
                              <Text style={styles.slotCong}>
                                {t('talkCoordinator.log.phone')}: {incomingPhone(slot.incoming)}
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
                    )}
                    <View style={styles.outCol}>
                      <Text style={[styles.slotLabel, { color: '#b45309', marginBottom: 4 }]}>
                        {t('talkCoordinator.log.filter.outgoing')}
                      </Text>
                      {slot.outgoing.map((o) => (
                        <Pressable
                          key={o.id}
                          style={styles.outItem}
                          onPress={() => openSlot(w, 'outgoing', o)}
                        >
                          <Text style={styles.outMain}>
                            {o.publisherId ? pubById.get(o.publisherId) ?? '—' : '—'}
                            {o.hostCongregationId
                              ? ` → ${congById.get(o.hostCongregationId)?.name ?? ''}`
                              : ''}
                          </Text>
                          <Text style={styles.outSub}>
                            {o.date !== w.date ? `${fmtDay(o.date)}` : ''}
                            {o.date !== w.date && talkLabel(o.publicTalkId) ? ' · ' : ''}
                            {talkLabel(o.publicTalkId) ?? ''}
                          </Text>
                          {/* Our own brother travelling with it — the case
                              that costs a telephone call if it is missed. */}
                          <RestrictionBadge id={o.publicTalkId} />
                          {!o.publicTalkId && (
                            <Text style={styles.outHint}>{t('talkCoordinator.log.noTalk')}</Text>
                          )}
                        </Pressable>
                      ))}
                      <Pressable style={styles.outAdd} onPress={() => openSlot(w, 'outgoing', undefined)}>
                        <Ionicons name="add" size={14} color="#b45309" />
                        <Text style={styles.outAddText}>{t('talkCoordinator.log.addSlot')}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}
          </Fragment>
        ))}
      </ScrollView>

      {/* «Заменить докладчика»: обмен/перенос содержимого слота между неделями */}
      <Dialog
        visible={swapTarget !== null}
        title={t('talkCoordinator.swap.title', {
          date: swapTarget ? fmtDay(swapTarget.date) : '',
        })}
        icon="swap-horizontal"
        onCancel={() => setSwapTarget(null)}
        cancelLabel={t('common.cancel')}
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
            <Text style={styles.swapHint}>{t('talkCoordinator.swap.hint')}</Text>

            <View style={styles.swapModeRow}>
              {(['swap', 'move'] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[
                    styles.swapModeBtn,
                    swapMode === m && styles.swapModeBtnActive,
                  ]}
                  onPress={() => setSwapMode(m)}
                >
                  <Ionicons
                    name={m === 'swap' ? 'swap-horizontal' : 'arrow-forward'}
                    size={14}
                    color={swapMode === m ? '#fff' : '#0369a1'}
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
                !!byWeek.get(w.monday)?.incoming,
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
                        t('talkCoordinator.log.unknownSpeaker')}
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

            {swapError ? (
              <Text style={styles.swapError}>{swapError}</Text>
            ) : null}
        </View>
      </Dialog>

      <Sheet
        visible={open}
        title={
          direction === 'incoming'
            ? t('talkCoordinator.log.filter.incoming')
            : t('talkCoordinator.log.filter.outgoing')
        }
        subtitle={
          date ? (
            <Text style={styles.editorDate}>
              {dayjs(date).locale(i18n.language).format('dd, D MMM YYYY')}
            </Text>
          ) : undefined
        }
        onClose={() => setOpen(false)}
        closeLabel={t('common.cancel')}
        footer={
          <View style={styles.modalActions}>
            {editing ? (
              <Pressable style={styles.deleteBtn} onPress={del} disabled={pending}>
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Pressable
              style={[styles.modalConfirm, (!canSave || pending) && styles.disabled]}
              onPress={() => void save()}
              disabled={!canSave || pending}
            >
              <Text style={styles.modalConfirmText}>{t('common.save')}</Text>
            </Pressable>
          </View>
        }
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.editorBody}
        >

          {direction === 'incoming' ? (
            <>
              {week && (week.time || week.address) ? (
                <Text style={styles.infoLine}>
                  {[week.time, week.address].filter(Boolean).join(' · ')}
                </Text>
              ) : null}

              <Text style={styles.fieldLabel}>{t('talkCoordinator.log.speakerSource')}</Text>
              <View style={styles.chipWrap}>
                <Pressable
                  style={[styles.pickChip, incomingMode === 'invited' && styles.pickChipActive]}
                  onPress={() => {
                    setIncomingMode('invited');
                    setPublisherId(null);
                  }}
                >
                  <Text style={[styles.pickChipText, incomingMode === 'invited' && styles.pickChipTextActive]}>
                    {t('talkCoordinator.log.visiting')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.pickChip, incomingMode === 'local' && styles.pickChipActive]}
                  onPress={() => {
                    setIncomingMode('local');
                    setVisitingSpeakerId(null);
                    setSpeakerNameInput('');
                    setSpeakerCongInput('');
                  }}
                >
                  <Text style={[styles.pickChipText, incomingMode === 'local' && styles.pickChipTextActive]}>
                    {t('talkCoordinator.log.ourBrother')}
                  </Text>
                </Pressable>
              </View>

              {incomingMode === 'local' && (
                <View style={{ marginTop: 6 }}>{renderBrotherPicker()}</View>
              )}

              {incomingMode === 'invited' && (
                <>
              {(speakersQuery.data ?? []).length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>{t('talkCoordinator.log.fromDirectory')}</Text>
                  <View style={styles.dirSearchRow}>
                    <Ionicons name="search" size={15} color="#94a3b8" />
                    <TextInput
                      style={styles.dirSearchInput}
                      value={speakerSearch}
                      onChangeText={setSpeakerSearch}
                      placeholder={t('talkCoordinator.log.speakerSearch')}
                      placeholderTextColor="#94a3b8"
                    />
                    {speakerSearch ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => setSpeakerSearch('')}
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
                    {visibleSpeakers.map((s) => {
                      const sel = visitingSpeakerId === s.id;
                      const st = statsById.get(s.id);
                      const recent = st ? visitedRecently(st, today) : false;
                      return (
                        <Pressable
                          key={s.id}
                          style={[styles.dirRow, sel && styles.dirRowActive]}
                          onPress={() => pickSpeaker(s.id)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.dirName,
                                sel && styles.dirNameActive,
                              ]}
                            >
                              {[s.firstName, s.lastName]
                                .filter(Boolean)
                                .join(' ')}
                            </Text>
                            {s.externalCongregation ? (
                              <Text style={styles.dirCong}>
                                {s.externalCongregation.name}
                              </Text>
                            ) : null}
                          </View>
                          {st && (st.count > 0 || st.nextVisit) ? (
                            <View style={styles.dirBadgeCol}>
                              {st.count > 0 && st.lastVisit ? (
                                <Text
                                  style={[
                                    styles.dirBadge,
                                    recent && styles.dirBadgeRecent,
                                  ]}
                                >
                                  {t(
                                    'talkCoordinator.speakers.status.lastSeen',
                                    {
                                      count: st.count,
                                      rel: formatRelativeDay(
                                        st.lastVisit.date,
                                        today,
                                        t,
                                      ),
                                    },
                                  )}
                                </Text>
                              ) : null}
                              {st.nextVisit ? (
                                <View style={styles.dirUpcoming}>
                                  <Ionicons
                                    name="airplane"
                                    size={10}
                                    color="#0369a1"
                                  />
                                  <Text style={styles.dirUpcomingText}>
                                    {formatRelativeDay(
                                      st.nextVisit.date,
                                      today,
                                      t,
                                    )}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          ) : (
                            <Text style={styles.dirNew}>
                              {t('talkCoordinator.speakers.status.never')}
                            </Text>
                          )}
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
                    {!speakerSearch && hiddenSpeakerCount > 0 ? (
                      <Pressable
                        onPress={() => setShowAllSpeakers(true)}
                        style={styles.dirMoreBtn}
                      >
                        <Text style={styles.dirMore}>
                          {t('talkCoordinator.log.moreSpeakers', {
                            n: hiddenSpeakerCount,
                          })}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </>
              )}

              <Text style={styles.fieldLabel}>{t('talkCoordinator.log.speakerName')}</Text>
              <TextInput
                style={styles.input}
                value={speakerNameInput}
                onChangeText={(v) => {
                  setSpeakerNameInput(v);
                  setVisitingSpeakerId(null);
                }}
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.fieldLabel}>{t('talkCoordinator.log.speakerCong')}</Text>
              <TextInput
                style={styles.input}
                value={speakerCongInput}
                onChangeText={(v) => {
                  setSpeakerCongInput(v);
                  setVisitingSpeakerId(null);
                }}
                placeholderTextColor="#94a3b8"
              />

              {selSpeaker && (selSpeaker.phone || selSpeakerCong) ? (
                <View style={styles.spInfoBox}>
                  {selSpeaker.phone ? (
                    <Pressable onPress={() => selSpeaker.phone && Linking.openURL(`tel:${selSpeaker.phone}`)}>
                      <Text style={styles.spInfoPhone}>
                        {t('talkCoordinator.log.phone')}: {selSpeaker.phone}
                      </Text>
                    </Pressable>
                  ) : null}
                  {selSpeakerCong ? (
                    <>
                      <Text style={styles.spInfoText}>
                        {[selSpeakerCong.name, selSpeakerCong.city].filter(Boolean).join(', ')}
                      </Text>
                      {(selSpeakerCong.contactName || selSpeakerCong.contactPhone) && (
                        <Text style={styles.spInfoText}>
                          {[selSpeakerCong.contactName, selSpeakerCong.contactPhone].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      {!!selSpeakerCong.address && (
                        <Text style={styles.spInfoText}>{selSpeakerCong.address}</Text>
                      )}
                    </>
                  ) : null}
                </View>
              ) : null}
                </>
              )}

              <View style={{ marginTop: 10 }}>
                <PublicTalkSelector
                  label={t('talkCoordinator.log.talk')}
                  value={publicTalkId}
                  onChange={(talk) => setPublicTalkId(talk?.id ?? null)}
                />
              </View>
              {publicTalkId ? (
                <View style={styles.histBox}>
                  <Text style={styles.histCount}>
                    {t('talkCoordinator.log.givenTimes', { n: talkOccs.length })}
                  </Text>
                  {talkOccs.map((o) => (
                    <Text key={o.id} style={styles.histItem} numberOfLines={1}>
                      {fmtHist(o.date)} · {incomingName(o) ?? t('talkCoordinator.log.unknownSpeaker')}
                    </Text>
                  ))}
                </View>
              ) : null}
              <View style={{ marginTop: 10 }}>
                <PublisherSelector
                  label={t('talkCoordinator.log.hospitality')}
                  value={hospitalityPublisherId}
                  onChange={setHospitalityPublisherId}
                />
              </View>
            </>
          ) : (
            <>
              {renderBrotherPicker()}

              <Text style={styles.fieldLabel}>{t('talkCoordinator.log.hostCongregation')}</Text>
              <View style={styles.chipWrap}>
                {(congQuery.data ?? []).map((c) => {
                  const sel = hostCongregationId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      style={[styles.pickChip, sel && styles.pickChipActive]}
                      onPress={() => onPickHost(sel ? null : c.id)}
                    >
                      <Text style={[styles.pickChipText, sel && styles.pickChipTextActive]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
                {(congQuery.data ?? []).length === 0 && (
                  <Text style={styles.muted}>{t('talkCoordinator.log.noCongregations')}</Text>
                )}
              </View>

              {!!host && (host.address || host.meetingTime || host.mapUrl) && (
                <View style={styles.hostBox}>
                  {(host.meetingTime || host.address) && (
                    <Text style={styles.hostInfo}>
                      {[host.meetingTime, host.address].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {!!host.mapUrl && (
                    <Pressable onPress={() => host.mapUrl && Linking.openURL(host.mapUrl)}>
                      <Text style={styles.hostMap}>{t('talkCoordinator.log.openMap')}</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <Text style={styles.fieldLabel}>{t('talkCoordinator.log.tripDate')}</Text>
              <View style={styles.chipWrap}>
                {weekendDays.map((d) => {
                  const sel = date === d;
                  return (
                    <Pressable
                      key={d}
                      style={[styles.dayChip, sel && styles.pickChipActive]}
                      onPress={() => setDate(d)}
                    >
                      <Text style={[styles.pickChipText, sel && styles.pickChipTextActive]}>
                        {dayjs(d).locale(i18n.language).format('dddd, D MMM')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ marginTop: 10 }}>
                <PublicTalkSelector
                  label={t('talkCoordinator.log.talk')}
                  value={publicTalkId}
                  onChange={(talk) => setPublicTalkId(talk?.id ?? null)}
                />
              </View>
            </>
          )}

          <Text style={styles.fieldLabel}>{t('talkCoordinator.log.note')}</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} multiline placeholderTextColor="#94a3b8" />

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
    <Pressable style={[styles.slot, entry ? { backgroundColor: bg } : styles.slotEmpty]} onPress={onPress}>
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
      {entry ? <View>{children}</View> : <Text style={styles.slotAdd}>+ {t('talkCoordinator.log.addSlot')}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* Amber, boxed and with a mark: this is the one line on the screen that has
     to stop the reader before he telephones anybody. */
  restrictBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 4,
  },
  restrictText: {
    fontSize: 11.5,
    color: '#b45309',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    flexShrink: 1,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  muted: { color: '#64748b', fontSize: 13 },
  monthBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  monthBarInner: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  monthChip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#f1f5f9' },
  monthChipCurrent: { backgroundColor: '#0ea5e9' },
  monthChipText: { fontSize: 12, color: '#475569', fontWeight: '600', fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize' },
  monthChipTextCurrent: { color: '#fff' },
  container: { padding: 12, paddingBottom: 48 },
  slotLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotSwapBtn: { padding: 2 },
  swapBody: { gap: 10 },
  swapHint: { fontSize: 12.5, color: '#64748b' },
  swapModeRow: { flexDirection: 'row', gap: 8 },
  swapModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
  },
  swapModeBtnActive: { backgroundColor: '#0284c7' },
  swapModeText: { fontSize: 12.5, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1' },
  swapModeTextActive: { color: '#fff' },
  swapList: { maxHeight: 300 },
  swapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  swapRowActive: { backgroundColor: '#f0f9ff' },
  swapRowDate: { fontSize: 12, color: '#64748b', textTransform: 'capitalize' },
  swapRowName: { fontSize: 14, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  swapRowTalk: { fontSize: 12, color: '#0369a1' },
  swapError: { fontSize: 12.5, color: '#b91c1c' },
  monthHeader: {
    fontSize: 13,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#64748b',
    textTransform: 'capitalize',
    marginTop: 14,
    marginBottom: 6,
    marginLeft: 4,
  },
  weekendRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    marginBottom: 8,
  },
  weekendPast: { opacity: 0.55 },
  weekendDate: { fontSize: 13, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a', textTransform: 'capitalize', marginBottom: 6 },
  outHint: { fontSize: 11, color: '#dc2626', fontStyle: 'italic', marginTop: 1 },
  slots: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1, borderRadius: 10, padding: 8, minHeight: 56, justifyContent: 'center' },
  slotEmpty: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  eventSlot: { backgroundColor: '#ede9fe' },
  eventLabel: { fontSize: 10, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#6d28d9', textTransform: 'uppercase', letterSpacing: 0.4 },
  eventTitle: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#5b21b6', marginTop: 3 },
  slotLabel: { fontSize: 10, fontWeight: '700', fontFamily: 'Manrope_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  slotMain: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a', marginTop: 3 },
  slotSub: { fontSize: 11, color: '#475569', marginTop: 1 },
  slotCong: { fontSize: 11, color: '#64748b', marginTop: 1 },
  slotAdd: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  outCol: { flex: 1, borderRadius: 10, padding: 8, backgroundColor: '#fffbeb', minHeight: 56 },
  outItem: { paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#fde68a' },
  outMain: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  outSub: { fontSize: 11, color: '#475569', marginTop: 1 },
  outAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6 },
  outAddText: { fontSize: 12, color: '#b45309', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  dirMoreBtn: { paddingVertical: 2 },
  editorBody: { padding: 16, paddingBottom: 24 },
  editorDate: { fontSize: 13, color: '#0ea5e9', fontWeight: '600', fontFamily: 'Manrope_600SemiBold', textTransform: 'capitalize', marginTop: 2 },
  infoLine: { fontSize: 12, color: '#64748b', marginTop: 4 },
  histBox: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  histCount: { fontSize: 12, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#1d4ed8', marginBottom: 4 },
  histItem: { fontSize: 12, color: '#475569', marginTop: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#64748b', marginTop: 12, marginBottom: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dirSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  dirSearchInput: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 0 },
  dirList: { gap: 4 },
  dirRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  dirRowActive: { borderColor: '#0ea5e9', backgroundColor: '#e0f2fe' },
  dirName: { fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  dirNameActive: { color: '#0369a1' },
  dirCong: { fontSize: 12, color: '#64748b', marginTop: 1 },
  dirBadgeCol: { alignItems: 'flex-end', gap: 2 },
  dirBadge: { fontSize: 12, color: '#64748b' },
  dirBadgeRecent: { color: '#b45309', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  dirUpcoming: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dirUpcomingText: { fontSize: 12, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  dirNew: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic' },
  dirMore: { fontSize: 12, color: '#94a3b8', textAlign: 'center', paddingVertical: 6 },
  pickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  dayChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  pickChipActive: { backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' },
  pickChipText: { fontSize: 13, color: '#475569', textTransform: 'capitalize' },
  pickChipTextActive: { color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  hostBox: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  spInfoBox: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  spInfoPhone: { fontSize: 13, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  spInfoText: { fontSize: 12, color: '#475569', marginTop: 2 },
  hostInfo: { fontSize: 13, color: '#92400e' },
  hostMap: { fontSize: 13, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  deleteBtn: { marginRight: 'auto', padding: 8, borderRadius: 8, backgroundColor: '#fef2f2' },
  modalConfirm: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#0ea5e9' },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  disabled: { opacity: 0.5 },
});
