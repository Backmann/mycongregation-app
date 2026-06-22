import { useMemo, useState } from 'react';
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
import DateTimePicker, {
  DateType,
  useDefaultStyles,
} from 'react-native-ui-datepicker';
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
  extractErrorMessage,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { PublicTalkSelector } from '../../../components/PublicTalkSelector';

const QK = ['talk-exchange'] as const;
type Filter = 'all' | TalkExchangeDirection;

const toISO = (d: DateType | null | undefined): string | null =>
  d ? dayjs(d).format('YYYY-MM-DD') : null;

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

export default function TalkExchangeLogScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const qc = useQueryClient();
  const defaultStyles = useDefaultStyles();

  const [filter, setFilter] = useState<Filter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TalkExchange | null>(null);

  // form state
  const [direction, setDirection] = useState<TalkExchangeDirection>('incoming');
  const [date, setDate] = useState<string | null>(null);
  const [status, setStatus] = useState<TalkExchangeStatus>('confirmed');
  const [publicTalkId, setPublicTalkId] = useState<string | null>(null);
  const [visitingSpeakerId, setVisitingSpeakerId] = useState<string | null>(null);
  const [hospitalityPublisherId, setHospitalityPublisherId] = useState<string | null>(null);
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [hostCongregationId, setHostCongregationId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const listQuery = useQuery({ queryKey: QK, queryFn: () => talkExchangeApi.list() });
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

  const openAdd = () => {
    setEditing(null);
    setDirection('incoming');
    setDate(null);
    setStatus('confirmed');
    setPublicTalkId(null);
    setVisitingSpeakerId(null);
    setHospitalityPublisherId(null);
    setPublisherId(null);
    setHostCongregationId(null);
    setNote('');
    setModalOpen(true);
  };
  const openEdit = (e: TalkExchange) => {
    setEditing(e);
    setDirection(e.direction);
    setDate(e.date);
    setStatus(e.status);
    setPublicTalkId(e.publicTalkId);
    setVisitingSpeakerId(e.visitingSpeakerId);
    setHospitalityPublisherId(e.hospitalityPublisherId);
    setPublisherId(e.publisherId);
    setHostCongregationId(e.hostCongregationId);
    setNote(e.note ?? '');
    setModalOpen(true);
  };

  const canSave =
    !!date &&
    (direction === 'incoming' ? !!visitingSpeakerId : !!publisherId);

  const save = async () => {
    if (!canSave || !date) return;
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
        await updateMutation.mutateAsync({
          id: saved.id,
          input: { ...input, overwriteProgram: true },
        });
      }
    }
    setModalOpen(false);
  };

  const confirmDelete = (e: TalkExchange) => {
    const doDelete = () => removeMutation.mutate(e.id);
    if (Platform.OS === 'web') {
      if (window.confirm(t('talkCoordinator.log.deleteBody'))) doDelete();
      return;
    }
    Alert.alert(t('talkCoordinator.log.deleteTitle'), t('talkCoordinator.log.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: doDelete },
    ]);
  };

  if (!perms.canCoordinatePublicTalks) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('talkCoordinator.noAccess')}</Text>
      </View>
    );
  }
  if (listQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const all = listQuery.data ?? [];
  const rows = filter === 'all' ? all : all.filter((e) => e.direction === filter);

  const talkLabel = (id: string | null): string | null => {
    if (!id) return null;
    const tk = talkById.get(id);
    return tk ? `№${tk.number}. ${tk.title}` : null;
  };
  const fmtDate = (d: string) => dayjs(d).locale(i18n.language).format('dd, D MMM YYYY');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <View style={styles.filterRow}>
        {(['all', 'incoming', 'outgoing'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {t(`talkCoordinator.log.filter.${f}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>{t('talkCoordinator.log.empty')}</Text>
        ) : (
          rows.map((e) => {
            const incoming = e.direction === 'incoming';
            const speaker = e.visitingSpeakerId ? speakerById.get(e.visitingSpeakerId) : null;
            const host = e.hostCongregationId ? congById.get(e.hostCongregationId) : null;
            const ourBrother = e.publisherId ? pubById.get(e.publisherId) : null;
            const hospitality = e.hospitalityPublisherId ? pubById.get(e.hospitalityPublisherId) : null;
            return (
              <View key={e.id} style={styles.row}>
                <View
                  style={[
                    styles.dirIcon,
                    { backgroundColor: incoming ? '#e0f2fe' : '#fef3c7' },
                  ]}
                >
                  <Ionicons
                    name={incoming ? 'enter-outline' : 'exit-outline'}
                    size={18}
                    color={incoming ? '#0369a1' : '#b45309'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.date}>{fmtDate(e.date)}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        e.status === 'confirmed' ? styles.statusConfirmed : styles.statusTentative,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          e.status === 'confirmed' ? styles.statusTextConfirmed : styles.statusTextTentative,
                        ]}
                      >
                        {t(`talkCoordinator.log.status.${e.status}`)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.main}>
                    {incoming
                      ? `${speaker?.name ?? t('talkCoordinator.log.unknownSpeaker')}${speaker?.cong ? ` (${speaker.cong})` : ''}`
                      : `${ourBrother ?? '—'} → ${host ?? '—'}`}
                  </Text>
                  {!!talkLabel(e.publicTalkId) && (
                    <Text style={styles.sub} numberOfLines={2}>
                      {talkLabel(e.publicTalkId)}
                    </Text>
                  )}
                  {incoming && !!hospitality && (
                    <Text style={styles.sub}>
                      {t('talkCoordinator.log.hostedBy', { name: hospitality })}
                    </Text>
                  )}
                  {!!e.note && <Text style={styles.note}>{e.note}</Text>}
                </View>
                <Pressable hitSlop={6} onPress={() => openEdit(e)} style={styles.iconBtn} disabled={pending}>
                  <Ionicons name="create-outline" size={19} color="#0369a1" />
                </Pressable>
                <Pressable hitSlop={6} onPress={() => confirmDelete(e)} style={styles.iconBtn} disabled={pending}>
                  <Ionicons name="trash-outline" size={19} color="#dc2626" />
                </Pressable>
              </View>
            );
          })
        )}

        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed, pending && styles.disabled]}
          onPress={openAdd}
          disabled={pending}
        >
          <Ionicons name="add-circle-outline" size={18} color="#0369a1" />
          <Text style={styles.addBtnText}>{t('talkCoordinator.log.add')}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {editing ? t('talkCoordinator.log.editTitle') : t('talkCoordinator.log.add')}
              </Text>

              {/* direction */}
              <View style={styles.segment}>
                {(['incoming', 'outgoing'] as TalkExchangeDirection[]).map((d) => (
                  <Pressable
                    key={d}
                    style={[styles.segmentBtn, direction === d && styles.segmentBtnActive]}
                    onPress={() => setDirection(d)}
                  >
                    <Text style={[styles.segmentText, direction === d && styles.segmentTextActive]}>
                      {t(`talkCoordinator.log.filter.${d}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* date */}
              <Text style={styles.fieldLabel}>{t('talkCoordinator.log.date')}</Text>
              <View style={styles.calendarBox}>
                <DateTimePicker
                  mode="single"
                  date={date ? dayjs(date) : undefined}
                  onChange={({ date: d }) => setDate(toISO(d))}
                  firstDayOfWeek={1}
                  locale={i18n.language}
                  styles={defaultStyles}
                />
              </View>

              {/* status */}
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
                    {(speakersQuery.data ?? []).length === 0 && (
                      <Text style={styles.muted}>{t('talkCoordinator.log.noSpeakers')}</Text>
                    )}
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
                          <Text style={[styles.pickChipText, sel && styles.pickChipTextActive]}>
                            {c.name}
                          </Text>
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
                <Pressable style={styles.modalCancel} onPress={() => setModalOpen(false)} disabled={pending}>
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

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  muted: { color: '#64748b', fontSize: 13 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
  },
  filterChipActive: { backgroundColor: '#0ea5e9' },
  filterChipText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  container: { padding: 16, paddingBottom: 40 },
  empty: { padding: 24, color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 8,
  },
  dirIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  date: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  statusConfirmed: { backgroundColor: '#dcfce7' },
  statusTentative: { backgroundColor: '#ffedd5' },
  statusText: { fontSize: 10, fontWeight: '700' },
  statusTextConfirmed: { color: '#166534' },
  statusTextTentative: { color: '#9a3412' },
  main: { fontSize: 15, fontWeight: '600', color: '#0f172a', marginTop: 3 },
  sub: { fontSize: 13, color: '#475569', marginTop: 1 },
  note: { fontSize: 12, color: '#94a3b8', marginTop: 3, fontStyle: 'italic' },
  iconBtn: { padding: 4 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
  },
  addBtnPressed: { backgroundColor: '#e0f2fe' },
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },
  disabled: { opacity: 0.5 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, maxHeight: '88%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 12, marginBottom: 4 },
  segment: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  segmentText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  segmentTextActive: { color: '#0f172a' },
  calendarBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 6, marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickChip: {
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
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  modalConfirm: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#0ea5e9' },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
