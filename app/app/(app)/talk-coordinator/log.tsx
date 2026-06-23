import { Fragment, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
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
  externalCongregationsApi,
  publishersApi,
  publicTalksApi,
  meetingSettingsApi,
  specialEventsApi,
  MeetingSettingsVersion,
  extractErrorMessage,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { PublicTalkSelector } from '../../../components/PublicTalkSelector';
import { startOfWeekMonday, addDays, formatDateISO } from '../../../lib/dates';

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
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(window.confirm(`${title}\n\n${body}`));
      return;
    }
    Alert.alert(title, body, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, onPress: () => resolve(true) },
    ]);
  });
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
  const [date, setDate] = useState<string>('');
  const [publicTalkId, setPublicTalkId] = useState<string | null>(null);
  const [visitingSpeakerId, setVisitingSpeakerId] = useState<string | null>(null);
  const [speakerNameInput, setSpeakerNameInput] = useState('');
  const [speakerCongInput, setSpeakerCongInput] = useState('');
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
    const m = new Map<string, { number: number; title: string }>();
    for (const pt of talksQuery.data?.data ?? []) m.set(pt.id, { number: pt.number, title: pt.title });
    return m;
  }, [talksQuery.data]);

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

  const eventsForDate = useMemo(() => {
    const events = (eventsQuery.data ?? []).filter((ev) => PLANNER_EVENT_TYPES.has(ev.type ?? ''));
    return (d: string): SpecialEvent[] =>
      events.filter((ev) => {
        const end = ev.endDate ?? ev.date;
        return ev.date <= d && d <= end;
      });
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

  const currentMonthKey = dayjs().format('YYYY-MM');
  const currentWeekMonday = mondayISO(dayjs().format('YYYY-MM-DD'));

  // On open, scroll to the current week row (fires as soon as that row lays out).
  const scrollToCurrentWeek = () => {
    if (didInitialScroll.current) return;
    const off = weekOffsets.current[currentWeekMonday] ?? monthOffsets.current[currentMonthKey];
    if (off != null) {
      didInitialScroll.current = true;
      scrollRef.current?.scrollTo({ y: Math.max(off - 8, 0), animated: false });
    }
  };

  const scrollToMonth = (key: string) => {
    const off = monthOffsets.current[key];
    if (off != null) scrollRef.current?.scrollTo({ y: Math.max(off - 8, 0), animated: true });
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  const showError = (e: unknown) => {
    const msg = extractErrorMessage(e);
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert(t('talkCoordinator.errorTitle'), msg);
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
    setHostCongregationId(entry?.hostCongregationId ?? null);
    setNote(entry?.note ?? '');
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
      ? !!visitingSpeakerId || speakerNameInput.trim().length > 0
      : !!publisherId && !!date;

  const save = async () => {
    if (!canSave) return;
    const input: TalkExchangeInput = {
      direction,
      date,
      publicTalkId: publicTalkId ?? null,
      note: note.trim() || null,
      visitingSpeakerId: direction === 'incoming' ? visitingSpeakerId : null,
      speakerName: direction === 'incoming' && !visitingSpeakerId ? speakerNameInput.trim() || null : null,
      speakerCongregation:
        direction === 'incoming' && !visitingSpeakerId ? speakerCongInput.trim() || null : null,
      hospitalityPublisherId: direction === 'incoming' ? hospitalityPublisherId : null,
      publisherId: direction === 'outgoing' ? publisherId : null,
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

  const del = () => {
    if (!editing) return;
    const doDelete = async () => {
      await removeMutation.mutateAsync(editing.id);
      setOpen(false);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('talkCoordinator.log.deleteBody'))) void doDelete();
      return;
    }
    Alert.alert(t('talkCoordinator.log.deleteTitle'), t('talkCoordinator.log.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void doDelete() },
    ]);
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
    return tk ? `№${tk.number}. ${tk.title}` : null;
  };
  const incomingName = (e: TalkExchange): string | null =>
    e.visitingSpeakerId ? speakerById.get(e.visitingSpeakerId)?.name ?? null : e.speakerName;
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <View style={styles.monthBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthBarInner}>
          {months.map((m) => (
            <Pressable
              key={m.key}
              style={[styles.monthChip, m.key === currentMonthKey && styles.monthChipCurrent]}
              onPress={() => scrollToMonth(m.key)}
            >
              <Text style={[styles.monthChipText, m.key === currentMonthKey && styles.monthChipTextCurrent]}>
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
              const events = eventsForDate(w.date);
              return (
                <View
                  key={w.monday}
                  style={[styles.weekendRow, !upcoming && styles.weekendPast]}
                  onLayout={(e) => {
                    weekOffsets.current[w.monday] = e.nativeEvent.layout.y;
                    if (w.monday === currentWeekMonday) scrollToCurrentWeek();
                  }}
                >
                  <View style={styles.weekendHead}>
                    <Text style={styles.weekendDate}>{fmtDay(w.date)}</Text>
                    {w.date > todayISO && (
                      <View style={styles.upcomingBadge}>
                        <Text style={styles.upcomingBadgeText}>{t('talkCoordinator.log.upcoming')}</Text>
                      </View>
                    )}
                  </View>
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

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
          />
          <View style={styles.modalCard}>
            <Pressable style={styles.modalClose} onPress={() => setOpen(false)} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close" size={22} color="#94a3b8" />
            </Pressable>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.editorHead}>
                <Text style={styles.modalTitle}>
                  {direction === 'incoming'
                    ? t('talkCoordinator.log.filter.incoming')
                    : t('talkCoordinator.log.filter.outgoing')}
                </Text>
                <Text style={styles.editorDate}>
                  {date ? dayjs(date).locale(i18n.language).format('dd, D MMM YYYY') : ''}
                </Text>
              </View>

              {direction === 'incoming' ? (
                <>
                  {week && (week.time || week.address) ? (
                    <Text style={styles.infoLine}>
                      {[week.time, week.address].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}

                  {(speakersQuery.data ?? []).length > 0 && (
                    <>
                      <Text style={styles.fieldLabel}>{t('talkCoordinator.log.fromDirectory')}</Text>
                      <View style={styles.chipWrap}>
                        {(speakersQuery.data ?? []).map((s) => {
                          const sel = visitingSpeakerId === s.id;
                          return (
                            <Pressable
                              key={s.id}
                              style={[styles.pickChip, sel && styles.pickChipActive]}
                              onPress={() => pickSpeaker(s.id)}
                            >
                              <Text style={[styles.pickChipText, sel && styles.pickChipTextActive]}>
                                {[s.firstName, s.lastName].filter(Boolean).join(' ')}
                              </Text>
                            </Pressable>
                          );
                        })}
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
                  <View style={{ marginTop: 6 }}>
                    <PublisherSelector
                      label={t('talkCoordinator.log.ourBrother')}
                      value={publisherId}
                      onChange={setPublisherId}
                      genderFilter="brother"
                      requiredCapability="public_talk_speaker"
                    />
                  </View>

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

              <View style={styles.modalActions}>
                {editing ? (
                  <Pressable style={styles.deleteBtn} onPress={del} disabled={pending}>
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </Pressable>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <Pressable style={styles.modalCancel} onPress={() => setOpen(false)} disabled={pending}>
                  <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalConfirm, (!canSave || pending) && styles.disabled]}
                  onPress={() => void save()}
                  disabled={!canSave || pending}
                >
                  <Text style={styles.modalConfirmText}>{t('common.save')}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Slot({
  label,
  accent,
  bg,
  entry,
  onPress,
  children,
}: {
  label: string;
  accent: string;
  bg: string;
  entry?: TalkExchange;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Pressable style={[styles.slot, entry ? { backgroundColor: bg } : styles.slotEmpty]} onPress={onPress}>
      <Text style={[styles.slotLabel, { color: accent }]}>{label}</Text>
      {entry ? <View>{children}</View> : <Text style={styles.slotAdd}>+ {t('talkCoordinator.log.addSlot')}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  muted: { color: '#64748b', fontSize: 13 },
  monthBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  monthBarInner: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  monthChip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#f1f5f9' },
  monthChipCurrent: { backgroundColor: '#0ea5e9' },
  monthChipText: { fontSize: 12, color: '#475569', fontWeight: '600', textTransform: 'capitalize' },
  monthChipTextCurrent: { color: '#fff' },
  container: { padding: 12, paddingBottom: 48 },
  monthHeader: {
    fontSize: 13,
    fontWeight: '700',
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
  weekendDate: { fontSize: 13, fontWeight: '700', color: '#0f172a', textTransform: 'capitalize' },
  weekendHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  upcomingBadge: { backgroundColor: '#fef3c7', paddingVertical: 1, paddingHorizontal: 7, borderRadius: 6 },
  upcomingBadgeText: { fontSize: 10, fontWeight: '700', color: '#b45309', textTransform: 'uppercase', letterSpacing: 0.3 },
  outHint: { fontSize: 11, color: '#dc2626', fontStyle: 'italic', marginTop: 1 },
  slots: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1, borderRadius: 10, padding: 8, minHeight: 56, justifyContent: 'center' },
  slotEmpty: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  eventSlot: { backgroundColor: '#ede9fe' },
  eventLabel: { fontSize: 10, fontWeight: '700', color: '#6d28d9', textTransform: 'uppercase', letterSpacing: 0.4 },
  eventTitle: { fontSize: 13, fontWeight: '600', color: '#5b21b6', marginTop: 3 },
  slotLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  slotMain: { fontSize: 13, fontWeight: '600', color: '#0f172a', marginTop: 3 },
  slotSub: { fontSize: 11, color: '#475569', marginTop: 1 },
  slotCong: { fontSize: 11, color: '#64748b', marginTop: 1 },
  slotAdd: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  outCol: { flex: 1, borderRadius: 10, padding: 8, backgroundColor: '#fffbeb', minHeight: 56 },
  outItem: { paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#fde68a' },
  outMain: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  outSub: { fontSize: 11, color: '#475569', marginTop: 1 },
  outAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 6 },
  outAddText: { fontSize: 12, color: '#b45309', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 16 },
  modalClose: { position: 'absolute', top: 10, right: 10, zIndex: 5, padding: 4 },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, maxHeight: '88%' },
  editorHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  editorDate: { fontSize: 13, color: '#0ea5e9', fontWeight: '600', textTransform: 'capitalize' },
  infoLine: { fontSize: 12, color: '#64748b', marginTop: 4 },
  histBox: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  histCount: { fontSize: 12, fontWeight: '700', color: '#1d4ed8', marginBottom: 4 },
  histItem: { fontSize: 12, color: '#475569', marginTop: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 12, marginBottom: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
  pickChipTextActive: { color: '#0369a1', fontWeight: '600' },
  hostBox: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  spInfoBox: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  spInfoPhone: { fontSize: 13, color: '#0369a1', fontWeight: '600' },
  spInfoText: { fontSize: 12, color: '#475569', marginTop: 2 },
  hostInfo: { fontSize: 13, color: '#92400e' },
  hostMap: { fontSize: 13, color: '#0369a1', fontWeight: '600', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  deleteBtn: { marginRight: 'auto', padding: 8, borderRadius: 8, backgroundColor: '#fef2f2' },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  modalConfirm: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#0ea5e9' },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
