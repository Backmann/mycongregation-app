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
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Hall, extractErrorMessage, hallsApi } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

const QK = ['halls'] as const;

export default function HallsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Hall | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [asDefault, setAsDefault] = useState(false);

  const hallsQuery = useQuery({
    queryKey: QK,
    queryFn: () => hallsApi.list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  const showError = (e: unknown) => {
    const msg = extractErrorMessage(e);
    if (Platform.OS === 'web') {
      window.alert(msg);
    } else {
      Alert.alert(t('halls.errorTitle'), msg);
    }
  };

  const createMutation = useMutation({
    mutationFn: (input: { name: string; address: string; isDefault?: boolean }) =>
      hallsApi.create(input),
    onSuccess: invalidate,
    onError: showError,
  });
  const updateMutation = useMutation({
    mutationFn: (v: {
      id: string;
      input: { name?: string; address?: string; isDefault?: boolean };
    }) => hallsApi.update(v.id, v.input),
    onSuccess: invalidate,
    onError: showError,
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => hallsApi.remove(id),
    onSuccess: invalidate,
    onError: showError,
  });

  const pending =
    createMutation.isPending ||
    updateMutation.isPending ||
    removeMutation.isPending;

  const openAdd = () => {
    setEditing(null);
    setName('');
    setAddress('');
    setAsDefault((hallsQuery.data ?? []).length === 0);
    setModalOpen(true);
  };

  const openEdit = (hall: Hall) => {
    setEditing(hall);
    setName(hall.name);
    setAddress(hall.address);
    setAsDefault(hall.isDefault);
    setModalOpen(true);
  };

  const canSave = name.trim().length > 0 && address.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    const input = {
      name: name.trim(),
      address: address.trim(),
      isDefault: asDefault,
    };
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, input });
    } else {
      await createMutation.mutateAsync(input);
    }
    setModalOpen(false);
  };

  const confirmDelete = (hall: Hall) => {
    const doDelete = () => removeMutation.mutate(hall.id);
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('halls.deleteTitle')}\n\n${t('halls.deleteBody')}`)) {
        doDelete();
      }
      return;
    }
    Alert.alert(t('halls.deleteTitle'), t('halls.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('halls.deleteConfirm'), style: 'destructive', onPress: doDelete },
    ]);
  };

  if (!isAdmin) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('halls.adminOnly')}</Text>
      </View>
    );
  }

  if (hallsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const halls = hallsQuery.data ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.hint}>{t('halls.hint')}</Text>

        <View style={styles.card}>
          {halls.length === 0 ? (
            <Text style={styles.empty}>{t('halls.empty')}</Text>
          ) : (
            halls.map((hall) => (
              <View key={hall.id} style={styles.row}>
                <Pressable
                  hitSlop={8}
                  disabled={pending || hall.isDefault}
                  onPress={() =>
                    updateMutation.mutate({
                      id: hall.id,
                      input: { isDefault: true },
                    })
                  }
                  style={styles.starBtn}
                >
                  <Ionicons
                    name={hall.isDefault ? 'star' : 'star-outline'}
                    size={20}
                    color={hall.isDefault ? '#d97706' : '#94a3b8'}
                  />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{hall.name}</Text>
                    {hall.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>
                          {t('halls.default')}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.address} numberOfLines={2}>
                    {hall.address}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => openEdit(hall)}
                  style={styles.iconBtn}
                  disabled={pending}
                >
                  <Ionicons name="create-outline" size={20} color="#0369a1" />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  onPress={() => confirmDelete(hall)}
                  style={styles.iconBtn}
                  disabled={pending}
                >
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            pressed && styles.addBtnPressed,
            pending && styles.disabled,
          ]}
          onPress={openAdd}
          disabled={pending}
        >
          <Ionicons name="add-circle-outline" size={18} color="#0369a1" />
          <Text style={styles.addBtnText}>{t('halls.add')}</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editing ? t('halls.editTitle') : t('halls.add')}
            </Text>

            <Text style={styles.fieldLabel}>{t('halls.name')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('halls.namePlaceholder')}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.fieldLabel}>{t('halls.address')}</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder={t('halls.addressPlaceholder')}
              placeholderTextColor="#94a3b8"
              multiline
            />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('halls.makeDefault')}</Text>
              <Switch value={asDefault} onValueChange={setAsDefault} />
            </View>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={() => setModalOpen(false)}
                disabled={pending}
              >
                <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalConfirm,
                  (!canSave || pending) && styles.disabled,
                ]}
                onPress={() => void save()}
                disabled={!canSave || pending}
              >
                <Text style={styles.modalConfirmText}>{t('halls.save')}</Text>
              </Pressable>
            </View>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
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
  starBtn: { padding: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  defaultBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  defaultBadgeText: { fontSize: 10, fontWeight: '700', color: '#92400e' },
  address: { fontSize: 13, color: '#475569', marginTop: 1 },
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

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  switchLabel: { fontSize: 14, color: '#0f172a' },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  modalConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
  },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
