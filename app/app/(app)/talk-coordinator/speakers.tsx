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
import {
  VisitingSpeaker,
  visitingSpeakersApi,
  externalCongregationsApi,
  publicTalksApi,
  extractErrorMessage,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';

const QK = ['visiting-speakers'] as const;

function speakerName(s: { firstName: string; lastName: string | null }): string {
  return [s.firstName, s.lastName].filter(Boolean).join(' ');
}

export default function SpeakersScreen() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VisitingSpeaker | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [congId, setCongId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [talks, setTalks] = useState<number[]>([]);
  const [talkInput, setTalkInput] = useState('');

  const listQuery = useQuery({ queryKey: QK, queryFn: () => visitingSpeakersApi.list() });
  const congQuery = useQuery({
    queryKey: ['external-congregations'],
    queryFn: () => externalCongregationsApi.list(),
  });
  const talksQuery = useQuery({
    queryKey: ['public-talks', 'all'],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });

  const titleByNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const pt of talksQuery.data?.data ?? []) map.set(pt.number, pt.title);
    return map;
  }, [talksQuery.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  const showError = (e: unknown) => {
    const msg = extractErrorMessage(e);
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert(t('talkCoordinator.errorTitle'), msg);
  };

  const createMutation = useMutation({
    mutationFn: visitingSpeakersApi.create,
    onSuccess: invalidate,
    onError: showError,
  });
  const updateMutation = useMutation({
    mutationFn: (v: { id: string; input: Parameters<typeof visitingSpeakersApi.update>[1] }) =>
      visitingSpeakersApi.update(v.id, v.input),
    onSuccess: invalidate,
    onError: showError,
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => visitingSpeakersApi.remove(id),
    onSuccess: invalidate,
    onError: showError,
  });

  const pending =
    createMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  const openAdd = () => {
    setEditing(null);
    setFirstName('');
    setLastName('');
    setCongId(null);
    setPhone('');
    setNote('');
    setTalks([]);
    setTalkInput('');
    setModalOpen(true);
  };

  const openEdit = (s: VisitingSpeaker) => {
    setEditing(s);
    setFirstName(s.firstName);
    setLastName(s.lastName ?? '');
    setCongId(s.externalCongregationId);
    setPhone(s.phone ?? '');
    setNote(s.note ?? '');
    setTalks([...s.talkNumbers].sort((a, b) => a - b));
    setTalkInput('');
    setModalOpen(true);
  };

  const addTalk = () => {
    const n = parseInt(talkInput.trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 300) return;
    if (!talks.includes(n)) setTalks([...talks, n].sort((a, b) => a - b));
    setTalkInput('');
  };
  const removeTalk = (n: number) => setTalks(talks.filter((x) => x !== n));

  const canSave = firstName.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    const input = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || null,
      externalCongregationId: congId,
      phone: phone.trim() || null,
      note: note.trim() || null,
      talkNumbers: talks,
    };
    if (editing) await updateMutation.mutateAsync({ id: editing.id, input });
    else await createMutation.mutateAsync(input);
    setModalOpen(false);
  };

  const confirmDelete = (s: VisitingSpeaker) => {
    const doDelete = () => removeMutation.mutate(s.id);
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('talkCoordinator.speakers.deleteTitle')}\n\n${speakerName(s)}`)) doDelete();
      return;
    }
    Alert.alert(t('talkCoordinator.speakers.deleteTitle'), speakerName(s), [
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

  const rows = listQuery.data ?? [];
  const congregations = congQuery.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.hint}>{t('talkCoordinator.speakers.hint')}</Text>

        <View style={styles.card}>
          {rows.length === 0 ? (
            <Text style={styles.empty}>{t('talkCoordinator.speakers.empty')}</Text>
          ) : (
            rows.map((s) => (
              <View key={s.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{speakerName(s)}</Text>
                  {!!s.externalCongregation && (
                    <Text style={styles.sub}>{s.externalCongregation.name}</Text>
                  )}
                  {s.talkNumbers.length > 0 && (
                    <Text style={styles.sub} numberOfLines={1}>
                      {t('talkCoordinator.speakers.talksCount', { n: s.talkNumbers.length })}
                    </Text>
                  )}
                </View>
                <Pressable hitSlop={8} onPress={() => openEdit(s)} style={styles.iconBtn} disabled={pending}>
                  <Ionicons name="create-outline" size={20} color="#0369a1" />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => confirmDelete(s)} style={styles.iconBtn} disabled={pending}>
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed, pending && styles.disabled]}
          onPress={openAdd}
          disabled={pending}
        >
          <Ionicons name="add-circle-outline" size={18} color="#0369a1" />
          <Text style={styles.addBtnText}>{t('talkCoordinator.speakers.add')}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {editing ? t('talkCoordinator.speakers.editTitle') : t('talkCoordinator.speakers.add')}
              </Text>

              <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.firstName')}</Text>
              <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholderTextColor="#94a3b8" />

              <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.lastName')}</Text>
              <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholderTextColor="#94a3b8" />

              <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.congregation')}</Text>
              <View style={styles.chipWrap}>
                <Pressable
                  style={[styles.pickChip, congId === null && styles.pickChipActive]}
                  onPress={() => setCongId(null)}
                >
                  <Text style={[styles.pickChipText, congId === null && styles.pickChipTextActive]}>
                    {t('talkCoordinator.speakers.noCongregation')}
                  </Text>
                </Pressable>
                {congregations.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[styles.pickChip, congId === c.id && styles.pickChipActive]}
                    onPress={() => setCongId(c.id)}
                  >
                    <Text style={[styles.pickChipText, congId === c.id && styles.pickChipTextActive]}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.phone')}</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.repertoire')}</Text>
              <View style={styles.talkAddRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={talkInput}
                  onChangeText={setTalkInput}
                  keyboardType="number-pad"
                  placeholder={t('talkCoordinator.speakers.talkNumberPlaceholder')}
                  placeholderTextColor="#94a3b8"
                  onSubmitEditing={addTalk}
                />
                <Pressable style={styles.talkAddBtn} onPress={addTalk}>
                  <Ionicons name="add" size={20} color="#0369a1" />
                </Pressable>
              </View>
              {talks.length > 0 && (
                <View style={styles.chipWrap}>
                  {talks.map((n) => (
                    <Pressable key={n} style={styles.talkChip} onPress={() => removeTalk(n)}>
                      <Text style={styles.talkChipText} numberOfLines={1}>
                        №{n}
                        {titleByNumber.get(n) ? ` · ${titleByNumber.get(n)}` : ''}
                      </Text>
                      <Ionicons name="close" size={14} color="#6d28d9" />
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.note')}</Text>
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
  muted: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  container: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  empty: { padding: 18, color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
  },
  name: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  sub: { fontSize: 13, color: '#475569', marginTop: 1 },
  iconBtn: { padding: 6 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
  },
  addBtnPressed: { backgroundColor: '#e0f2fe' },
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },
  disabled: { opacity: 0.5 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, maxHeight: '85%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    marginTop: 4,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
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
  talkAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  talkAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  talkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#ede9fe',
  },
  talkChipText: { fontSize: 12, color: '#6d28d9', fontWeight: '500', flexShrink: 1 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  modalConfirm: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#0ea5e9' },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
