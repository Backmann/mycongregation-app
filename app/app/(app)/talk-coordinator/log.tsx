import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { router } from 'expo-router';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  TalkExchange,
  TalkExchangeDirection,
  TalkExchangeInput,
  TalkExchangeStatus,
  talkExchangeApi,
  visitingSpeakersApi,
  externalCongregationsApi,
  publishersApi,
  publicTalksApi,
  meetingSettingsApi,
  extractErrorMessage,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { PublicTalkSelector } from '../../../components/PublicTalkSelector';
import { startOfWeekMonday, addDays, formatDateISO } from '../../../lib/dates';

const QK = ['talk-exchange'] as const;
const YEAR = 2026;

type WeekendRow = { date: string };
type MonthBlock = { key: string; title: string; rows: WeekendRow[] };
type SlotState = { incoming?: TalkExchange; outgoing?: TalkExchange };

/** All weekend meeting dates of YEAR, given the congregation's weekend day (ISO 1–7). */
function buildWeekends(weekendDow: number): string[] {
  const res: string[] = [];
  let monday = startOfWeekMonday(new Date(`${YEAR - 1}-12-22T00:00:00`));
  for (let i = 0; i < 60; i++) {
    const wd = addDays(monday, weekendDow - 1);
    const y = wd.getFullYear();
    if (y === YEAR) res.push(formatDateISO(wd));
    if (y > YEAR) break;
    monday = addDays(monday, 7);
  }
  return res;
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
  const didInitialScroll = useRef(false);

  // ---- editor state ----
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TalkExchange | null>(null);
  const [direction, setDirection] = useState<TalkExchangeDirection>('incoming');
  const [date, setDate] = useState<string>('');
  const [status, setStatus] = useState<TalkExchangeStatus>('confirmed');
  const [publicTalkId, setPublicTalkId] = useState<string | null>(null);
  const [visitingSpeakerId, setVisitingSpeakerId] = useState<string | null>(null);
  const [hospitalityPublisherId, setHospitalityPublisherId] = useState<string | null>(null);
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [hostCongregationId, setHostCongregationId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const listQuery = useQuery({ queryKey: QK, queryFn: () => talkExchangeApi.list() });
  const settingsQuery = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
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
    queryFn: () => publishersApi.list({ limit: 500 }),
  });
  const talksQuery = useQuery({
    queryKey: ['public-talks', 'all'],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });

  const weekendDow = settingsQuery.data?.effective?.weekendDow ?? 7;

  const speakerById = useMemo(() => {
    const m = new Map<string, { name: string; cong: string | null }>();
    for (const s of speakersQuery.data ?? [])
      m.set(s.id, {
        name: [s.firstName, s.lastName].filter(Boolean).join(' '),
        cong: s.externalCongregation?.name ?? null,
      });
    return m;
  }, [speakersQuery.data]);
  const congById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of congQuery.data ?? []) m.set(c.id, c.name);
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

  const byDate = useMemo(() => {
    const m = new Map<string, SlotState>();
    for (const e of listQuery.data ?? []) {
      const slot = m.get(e.date) ?? {};
      if (e.direction === 'incoming') slot.incoming = e;
      else slot.outgoing = e;
      m.set(e.date, slot);
    }
    return m;
  }, [listQuery.data]);

  const months = useMemo<MonthBlock[]>(() => {
    const dates = new Set<string>(buildWeekends(weekendDow));
    for (const e of listQuery.data ?? []) {
      if (e.date.startsWith(`${YEAR}`)) dates.add(e.date);
    }
    const sorted = [...dates].sort();
    const byMonth = new Map<string, WeekendRow[]>();
    for (const d of sorted) {
      const key = d.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push({ date: d });
    }
    return [...byMonth.entries()].map(([key, rows]) => ({
      key,
      title: dayjs(`${key}-01`).locale(i18n.language).format('MMMM'),
      rows,
    }));
  }, [weekendDow, listQuery.data, i18n.language]);

  const currentMonthKey = dayjs().format('YYYY-MM');

  // auto-scroll to current month once layout offsets are known
  useEffect(() => {
    if (didInitialScroll.current) return;
    const off = monthOffsets.current[currentMonthKey];
    if (off != null && months.length > 0) {
      didInitialScroll.current = true;
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(off - 8, 0), animated: false }), 50);
    }
  });

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

  const openSlot = (d: string, dir: TalkExchangeDirection, entry?: TalkExchange) => {
    setEditing(entry ?? null);
    setDirection(dir);
    setDate(d);
    setStatus(entry?.status ?? 'confirmed');
    setPublicTalkId(entry?.publicTalkId ?? null);
    setVisitingSpeakerId(entry?.visitingSpeakerId ?? null);
    setHospitalityPublisherId(entry?.hospitalityPublisherId ?? null);
    setPublisherId(entry?.publisherId ?? null);
    setHostCongregationId(entry?.hostCongregationId ?? null);
    setNote(entry?.note ?? '');
    setOpen(true);
  };

  const canSave =
    !!date && (direction === 'incoming' ? !!visitingSpeakerId : !!publisherId);

  const save = async () => {
    if (!canSave) return;
    const input: TalkExchangeInput = {
      direction,
      date,
      status,
      publicTalkId: publicTalkId ?? null,
      note: note.trim() || null,
      visitingSpeakerId: direction === 'incoming' ? visitingSpeakerId : null,
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
  const fmtWeekend = (d: string) => dayjs(d).locale(i18n.language).format('dd, D MMM');
  const todayISO = dayjs().format('YYYY-MM-DD');

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
                {m.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
        {months.map((m) => (
          <View
            key={m.key}
            onLayout={(e) => {
              monthOffsets.current[m.key] = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.monthHeader}>{m.title}</Text>
            {m.rows.map((row) => {
              const slot = byDate.get(row.date) ?? {};
              const upcoming = row.date >= todayISO;
              return (
                <View key={row.date} style={[styles.weekendRow, !upcoming && styles.weekendPast]}>
                  <Text style={styles.weekendDate}>{fmtWeekend(row.date)}</Text>
                  <View style={styles.slots}>
                    <Slot
                      label={t('talkCoordinator.log.filter.incoming')}
                      accent="#0369a1"
                      bg="#e0f2fe"
                      entry={slot.incoming}
                      onPress={() => openSlot(row.date, 'incoming', slot.incoming)}
                    >
                      {slot.incoming ? (
                        <>
                          <Text style={styles.slotMain} numberOfLines={1}>
                            {slot.incoming.visitingSpeakerId
                              ? speakerById.get(slot.incoming.visitingSpeakerId)?.name ??
                                t('talkCoordinator.log.unknownSpeaker')
                              : t('talkCoordinator.log.unknownSpeaker')}
                          </Text>
                          {!!talkLabel(slot.incoming.publicTalkId) && (
                            <Text style={styles.slotSub} numberOfLines={1}>
                              {talkLabel(slot.incoming.publicTalkId)}
                            </Text>
                          )}
                        </>
                      ) : null}
                    </Slot>
                    <Slot
                      label={t('talkCoordinator.log.filter.outgoing')}
                      accent="#b45309"
                      bg="#fef3c7"
                      entry={slot.outgoing}
                      onPress={() => openSlot(row.date, 'outgoing', slot.outgoing)}
                    >
                      {slot.outgoing ? (
                        <>
                          <Text style={styles.slotMain} numberOfLines={1}>
                            {slot.outgoing.publisherId ? pubById.get(slot.outgoing.publisherId) ?? '—' : '—'}
                            {slot.outgoing.hostCongregationId
                              ? ` → ${congById.get(slot.outgoing.hostCongregationId) ?? ''}`
                              : ''}
                          </Text>
                          {!!talkLabel(slot.outgoing.publicTalkId) && (
                            <Text style={styles.slotSub} numberOfLines={1}>
                              {talkLabel(slot.outgoing.publicTalkId)}
                            </Text>
                          )}
                        </>
                      ) : null}
                    </Slot>
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
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

              <Text style={styles.fieldLabel}>{t('talkCoordinator.log.statusLabel')}</Text>
              <View style={styles.segment}>
                {(['confirmed', 'tentative'] as TalkExchangeStatus[]).map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.segmentBtn, status === s && styles.segmentBtnActive]}
                    onPress={() => setStatus(s)}
                  >
                    <Text style={[styles.segmentText, status === s && styles.segmentTextActive]}>
                      {t(`talkCoordinator.log.status.${s}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {direction === 'incoming' ? (
                <>
                  <Text style={styles.fieldLabel}>{t('talkCoordinator.log.speaker')}</Text>
                  <View style={styles.chipWrap}>
                    {(speakersQuery.data ?? []).map((s) => {
                      const sel = visitingSpeakerId === s.id;
                      return (
                        <Pressable
                          key={s.id}
                          style={[styles.pickChip, sel && styles.pickChipActive]}
                          onPress={() => setVisitingSpeakerId(sel ? null : s.id)}
                        >
                          <Text style={[styles.pickChipText, sel && styles.pickChipTextActive]}>
                            {[s.firstName, s.lastName].filter(Boolean).join(' ')}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      style={[styles.pickChip, styles.linkChip]}
                      onPress={() => {
                        setOpen(false);
                        router.push('/talk-coordinator/speakers' as any);
                      }}
                    >
                      <Ionicons name="add" size={14} color="#0369a1" />
                      <Text style={[styles.pickChipText, { color: '#0369a1' }]}>
                        {t('talkCoordinator.speakers.add')}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <PublicTalkSelector
                      label={t('talkCoordinator.log.talk')}
                      value={publicTalkId}
                      onChange={(talk) => setPublicTalkId(talk?.id ?? null)}
                    />
                  </View>
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
                  <View style={{ marginTop: 10 }}>
                    <PublisherSelector
                      label={t('talkCoordinator.log.ourBrother')}
                      value={publisherId}
                      onChange={setPublisherId}
                      genderFilter="brother"
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
                          onPress={() => setHostCongregationId(sel ? null : c.id)}
                        >
                          <Text style={[styles.pickChipText, sel && styles.pickChipTextActive]}>{c.name}</Text>
                        </Pressable>
                      );
                    })}
                    {(congQuery.data ?? []).length === 0 && (
                      <Text style={styles.muted}>{t('talkCoordinator.log.noCongregations')}</Text>
                    )}
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
      <View style={styles.slotHead}>
        <Text style={[styles.slotLabel, { color: accent }]}>{label}</Text>
        {entry?.status === 'tentative' && (
          <View style={styles.tentativeDot}>
            <Text style={styles.tentativeDotText}>?</Text>
          </View>
        )}
      </View>
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
  weekendDate: { fontSize: 13, fontWeight: '700', color: '#0f172a', textTransform: 'capitalize', marginBottom: 6 },
  slots: { flexDirection: 'row', gap: 8 },
  slot: { flex: 1, borderRadius: 10, padding: 8, minHeight: 56, justifyContent: 'center' },
  slotEmpty: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  slotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  tentativeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tentativeDotText: { fontSize: 9, color: '#fff', fontWeight: '800' },
  slotMain: { fontSize: 13, fontWeight: '600', color: '#0f172a', marginTop: 3 },
  slotSub: { fontSize: 11, color: '#475569', marginTop: 1 },
  slotAdd: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, maxHeight: '88%' },
  editorHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  editorDate: { fontSize: 13, color: '#0ea5e9', fontWeight: '600', textTransform: 'capitalize' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 12, marginBottom: 4 },
  segment: { flexDirection: 'row', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 10, padding: 3 },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  segmentText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  segmentTextActive: { color: '#0f172a' },
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
  pickChipActive: { backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' },
  pickChipText: { fontSize: 13, color: '#475569' },
  pickChipTextActive: { color: '#0369a1', fontWeight: '600' },
  linkChip: { borderStyle: 'dashed', borderColor: '#bae6fd' },
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
