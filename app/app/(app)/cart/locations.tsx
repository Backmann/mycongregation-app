import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CartLocation,
  CartLocationKind,
  cartLocationsApi,
  extractErrorMessage,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';

export default function CartLocationsScreen() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const canManage =
    perms.canEditCartWitnessing || perms.canEditFieldServiceMeetings;

  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CartLocation | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [kind, setKind] = useState<CartLocationKind>('cart');
  const [active, setActive] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['cart-locations', showInactive],
    queryFn: () => cartLocationsApi.list(showInactive),
  });

  const locations = useMemo(() => data ?? [], [data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['cart-locations'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        address: address.trim() || null,
        kind,
        isActive: active,
      };
      if (editing) return cartLocationsApi.update(editing.id, payload);
      return cartLocationsApi.create(payload);
    },
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
    },
    onError: (e) => Alert.alert(t('cartLocations.saveError'), extractErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => cartLocationsApi.remove(id),
    onSuccess: invalidate,
    onError: (e) => Alert.alert(t('cartLocations.saveError'), extractErrorMessage(e)),
  });

  function openAdd() {
    setEditing(null);
    setName('');
    setAddress('');
    setKind('cart');
    setActive(true);
    setModalOpen(true);
  }

  function openEdit(loc: CartLocation) {
    setEditing(loc);
    setName(loc.name);
    setAddress(loc.address ?? '');
    setKind(loc.kind);
    setActive(loc.isActive);
    setModalOpen(true);
  }

  function confirmRemove() {
    if (!editing) return;
    const id = editing.id;
    const doRemove = () => {
      removeMutation.mutate(id);
      setModalOpen(false);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('cartLocations.removeWeb'))) doRemove();
      return;
    }
    Alert.alert(t('cartLocations.removeTitle'), t('cartLocations.removeBody'), [
      { text: t('cartLocations.cancel'), style: 'cancel' },
      { text: t('cartLocations.delete'), style: 'destructive', onPress: doRemove },
    ]);
  }

  const canSave = name.trim().length > 0 && !saveMutation.isPending;

  return (
    <View style={styles.container}>
      {canManage && (
        <Pressable style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={20} color="#ffffff" />
          <Text style={styles.addBtnText}>{t('cartLocations.add')}</Text>
        </Pressable>
      )}

      {canManage && (
        <Pressable
          style={styles.toggleRow}
          onPress={() => setShowInactive((v) => !v)}
        >
          <Ionicons
            name={showInactive ? 'checkbox' : 'square-outline'}
            size={20}
            color="#0ea5e9"
          />
          <Text style={styles.toggleText}>{t('cartLocations.showInactive')}</Text>
        </Pressable>
      )}

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#0ea5e9" />
      ) : locations.length === 0 ? (
        <Text style={styles.empty}>{t('cartLocations.empty')}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {locations.map((loc) => (
            <Pressable
              key={loc.id}
              style={[styles.card, !loc.isActive && styles.cardInactive]}
              onPress={() => (canManage ? openEdit(loc) : undefined)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{loc.name}</Text>
                {!!loc.address && (
                  <Text style={styles.cardAddress}>{loc.address}</Text>
                )}
              </View>
              <View style={styles.badges}>
                <View style={styles.kindBadge}>
                  <Text style={styles.kindBadgeText}>
                    {loc.kind === 'stand'
                      ? t('cartLocations.kindStand')
                      : t('cartLocations.kindCart')}
                  </Text>
                </View>
                {!loc.isActive && (
                  <Text style={styles.inactiveTag}>
                    {t('cartLocations.inactive')}
                  </Text>
                )}
              </View>
              {canManage && (
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setModalOpen(false)}
            accessibilityRole="button"
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editing
                ? t('cartLocations.editTitle')
                : t('cartLocations.addTitle')}
            </Text>

            <Text style={styles.fieldLabel}>{t('cartLocations.name')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('cartLocations.namePlaceholder')}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.fieldLabel}>{t('cartLocations.address')}</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder={t('cartLocations.addressPlaceholder')}
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.fieldLabel}>{t('cartLocations.kind')}</Text>
            <View style={styles.kindSelect}>
              {(['cart', 'stand'] as CartLocationKind[]).map((k) => (
                <Pressable
                  key={k}
                  style={[styles.kindOption, kind === k && styles.kindOptionActive]}
                  onPress={() => setKind(k)}
                >
                  <Text
                    style={[
                      styles.kindOptionText,
                      kind === k && styles.kindOptionTextActive,
                    ]}
                  >
                    {k === 'stand'
                      ? t('cartLocations.kindStand')
                      : t('cartLocations.kindCart')}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>{t('cartLocations.active')}</Text>
              <Switch value={active} onValueChange={setActive} />
            </View>

            <View style={styles.modalActions}>
              {editing && (
                <Pressable style={styles.deleteBtn} onPress={confirmRemove}>
                  <Text style={styles.deleteBtnText}>
                    {t('cartLocations.delete')}
                  </Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setModalOpen(false)}
              >
                <Text style={styles.cancelBtnText}>
                  {t('cartLocations.cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                disabled={!canSave}
                onPress={() => saveMutation.mutate()}
              >
                <Text style={styles.saveBtnText}>{t('cartLocations.save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', padding: 16 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
  },
  addBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  toggleText: { fontSize: 14, color: '#475569' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 32 },
  list: { gap: 10, paddingVertical: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
  },
  cardInactive: { opacity: 0.55 },
  cardName: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  cardAddress: { fontSize: 13, color: '#64748b', marginTop: 2 },
  badges: { alignItems: 'flex-end', gap: 4 },
  kindBadge: {
    backgroundColor: '#e0f2fe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  kindBadgeText: { fontSize: 12, color: '#0369a1', fontWeight: '600' },
  inactiveTag: { fontSize: 11, color: '#ef4444' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  kindSelect: { flexDirection: 'row', gap: 8 },
  kindOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  kindOptionActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  kindOptionText: { fontSize: 14, color: '#475569', fontWeight: '600' },
  kindOptionTextActive: { color: '#ffffff' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  deleteBtn: { paddingVertical: 10, paddingHorizontal: 8 },
  deleteBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 12 },
  cancelBtnText: { color: '#475569', fontSize: 15, fontWeight: '600' },
  saveBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
