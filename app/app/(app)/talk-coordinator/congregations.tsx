import { useState } from 'react';
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
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  ExternalCongregation,
  externalCongregationsApi,
  extractErrorMessage,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';

const QK = ['external-congregations'] as const;

export default function CongregationsScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalCongregation | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [note, setNote] = useState('');
  const [address, setAddress] = useState('');
  const [meetingDow, setMeetingDow] = useState<number | null>(null);
  const [meetingTime, setMeetingTime] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [showMore, setShowMore] = useState(false);

  const dayLabel = (dow: number) =>
    dayjs('2024-01-01').add(dow - 1, 'day').locale(i18n.language).format('dd');

  const listQuery = useQuery({ queryKey: QK, queryFn: () => externalCongregationsApi.list() });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  const showError = (e: unknown) => {
    const msg = extractErrorMessage(e);
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert(t('talkCoordinator.errorTitle'), msg);
  };

  const createMutation = useMutation({
    mutationFn: externalCongregationsApi.create,
    onSuccess: invalidate,
    onError: showError,
  });
  const updateMutation = useMutation({
    mutationFn: (v: { id: string; input: Parameters<typeof externalCongregationsApi.update>[1] }) =>
      externalCongregationsApi.update(v.id, v.input),
    onSuccess: invalidate,
    onError: showError,
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => externalCongregationsApi.remove(id),
    onSuccess: invalidate,
    onError: showError,
  });

  const pending =
    createMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  const openAdd = () => {
    setEditing(null);
    setName('');
    setCity('');
    setContactName('');
    setContactPhone('');
    setNote('');
    setAddress('');
    setMeetingDow(null);
    setMeetingTime('');
    setMapUrl('');
    setShowMore(false);
    setModalOpen(true);
  };

  const openEdit = (c: ExternalCongregation) => {
    setEditing(c);
    setName(c.name);
    setCity(c.city ?? '');
    setContactName(c.contactName ?? '');
    setContactPhone(c.contactPhone ?? '');
    setNote(c.note ?? '');
    setAddress(c.address ?? '');
    setMeetingDow(c.meetingDow ?? null);
    setMeetingTime(c.meetingTime ?? '');
    setMapUrl(c.mapUrl ?? '');
    setShowMore(Boolean(c.city || c.address || c.mapUrl || c.contactName || c.contactPhone || c.note));
    setModalOpen(true);
  };

  const canSave = name.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    const input = {
      name: name.trim(),
      city: city.trim() || null,
      contactName: contactName.trim() || null,
      contactPhone: contactPhone.trim() || null,
      note: note.trim() || null,
      address: address.trim() || null,
      meetingDow: meetingDow,
      meetingTime: meetingTime.trim() || null,
      mapUrl: mapUrl.trim() || null,
    };
    if (editing) await updateMutation.mutateAsync({ id: editing.id, input });
    else await createMutation.mutateAsync(input);
    setModalOpen(false);
  };

  const confirmDelete = (c: ExternalCongregation) => {
    const doDelete = () => removeMutation.mutate(c.id);
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('talkCoordinator.congregations.deleteTitle')}\n\n${c.name}`)) doDelete();
      return;
    }
    Alert.alert(t('talkCoordinator.congregations.deleteTitle'), c.name, [
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.hint}>{t('talkCoordinator.congregations.hint')}</Text>

        <View style={styles.card}>
          {rows.length === 0 ? (
            <Text style={styles.empty}>{t('talkCoordinator.congregations.empty')}</Text>
          ) : (
            rows.map((c) => (
              <View key={c.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  {!!c.city && <Text style={styles.sub}>{c.city}</Text>}
                  {(c.contactName || c.contactPhone) && (
                    <Text style={styles.sub}>
                      {[c.contactName, c.contactPhone].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {(c.address || c.meetingDow || c.meetingTime) && (
                    <Text style={styles.subHall}>
                      {[
                        [c.meetingDow ? dayLabel(c.meetingDow) : null, c.meetingTime]
                          .filter(Boolean)
                          .join(' '),
                        c.address,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  )}
                </View>
                <Pressable hitSlop={8} onPress={() => openEdit(c)} style={styles.iconBtn} disabled={pending}>
                  <Ionicons name="create-outline" size={20} color="#0369a1" />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => confirmDelete(c)} style={styles.iconBtn} disabled={pending}>
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
          <Text style={styles.addBtnText}>{t('talkCoordinator.congregations.add')}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>
              {editing ? t('talkCoordinator.congregations.editTitle') : t('talkCoordinator.congregations.add')}
            </Text>

            <Text style={styles.fieldLabel}>{t('talkCoordinator.congregations.name')}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor="#94a3b8" />

            <Text style={styles.sectionLabel}>{t('talkCoordinator.congregations.weekendMeeting')}</Text>
            <View style={styles.weekendBox}>
              <Text style={styles.fieldLabel}>{t('talkCoordinator.congregations.meetingDay')}</Text>
              <View style={styles.dayRow}>
                <Pressable
                  style={[styles.dayChip, meetingDow === null && styles.dayChipActive]}
                  onPress={() => setMeetingDow(null)}
                >
                  <Text style={[styles.dayChipText, meetingDow === null && styles.dayChipTextActive]}>—</Text>
                </Pressable>
                {[6, 7].map((d) => (
                  <Pressable
                    key={d}
                    style={[styles.dayChip, meetingDow === d && styles.dayChipActive]}
                    onPress={() => setMeetingDow(d)}
                  >
                    <Text style={[styles.dayChipText, meetingDow === d && styles.dayChipTextActive]}>
                      {dayLabel(d)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 8 }]}>{t('talkCoordinator.congregations.meetingTime')}</Text>
              <TextInput
                style={styles.input}
                value={meetingTime}
                onChangeText={setMeetingTime}
                placeholder="13:00"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <Pressable style={styles.moreToggle} onPress={() => setShowMore((v) => !v)}>
              <Ionicons name={showMore ? 'chevron-down' : 'chevron-forward'} size={16} color="#0369a1" />
              <Text style={styles.moreToggleText}>{t('talkCoordinator.congregations.moreFields')}</Text>
            </Pressable>

            {showMore && (
              <View>
                <Text style={styles.fieldLabel}>{t('talkCoordinator.congregations.city')}</Text>
                <TextInput style={styles.input} value={city} onChangeText={setCity} placeholderTextColor="#94a3b8" />

                <Text style={styles.fieldLabel}>{t('talkCoordinator.congregations.address')}</Text>
                <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholderTextColor="#94a3b8" />

                <Text style={styles.fieldLabel}>{t('talkCoordinator.congregations.mapUrl')}</Text>
                <TextInput
                  style={styles.input}
                  value={mapUrl}
                  onChangeText={setMapUrl}
                  placeholder="https://maps.google.com/…"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  keyboardType="url"
                />

                <Text style={styles.fieldLabel}>{t('talkCoordinator.congregations.contactName')}</Text>
                <TextInput style={styles.input} value={contactName} onChangeText={setContactName} placeholderTextColor="#94a3b8" />

                <Text style={styles.fieldLabel}>{t('talkCoordinator.congregations.contactPhone')}</Text>
                <TextInput
                  style={styles.input}
                  value={contactPhone}
                  onChangeText={setContactPhone}
                  keyboardType="phone-pad"
                  placeholderTextColor="#94a3b8"
                />

                <Text style={styles.fieldLabel}>{t('talkCoordinator.congregations.note')}</Text>
                <TextInput style={styles.input} value={note} onChangeText={setNote} multiline placeholderTextColor="#94a3b8" />
              </View>
            )}

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
  subHall: { fontSize: 12, color: '#0369a1', marginTop: 2 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  dayChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  dayChipActive: { backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' },
  dayChipText: { fontSize: 13, color: '#475569', textTransform: 'capitalize' },
  dayChipTextActive: { color: '#0369a1', fontWeight: '600' },
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
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', paddingHorizontal: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, gap: 8, maxHeight: '88%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  modalConfirm: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#0ea5e9' },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginTop: 12, marginBottom: 2 },
  weekendBox: { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, gap: 2 },
  moreToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, marginTop: 6 },
  moreToggleText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },
});
