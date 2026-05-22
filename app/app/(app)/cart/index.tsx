import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CartShift,
  CreateCartShiftInput,
  UpdateCartShiftInput,
  Publisher,
  cartShiftsApi,
  publishersApi,
  extractErrorMessage,
} from '../../../lib/api';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { usePermissions } from '../../../lib/permissions';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX = 4;
const MIN = 2;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function formatDateHeader(dateStr: string, lng: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const s = d.toLocaleDateString(lng, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return dateStr;
  }
}

export default function CartScreen() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { canEditCartWitnessing } = usePermissions();
  const [formFor, setFormFor] = useState<CartShift | 'new' | null>(null);

  const shiftsQuery = useQuery({
    queryKey: ['cart-shifts'],
    queryFn: () => cartShiftsApi.list({ from: todayISO() }),
  });

  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({ limit: 200 }),
  });
  const publishersById = useMemo(() => {
    const m = new Map<string, Publisher>();
    for (const p of publishersQuery.data?.data ?? []) m.set(p.id, p);
    return m;
  }, [publishersQuery.data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['cart-shifts'] });

  const createMutation = useMutation({
    mutationFn: (input: CreateCartShiftInput) => cartShiftsApi.create(input),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCartShiftInput }) =>
      cartShiftsApi.update(id, input),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => cartShiftsApi.remove(id),
    onSuccess: invalidate,
  });
  const addMutation = useMutation({
    mutationFn: ({ id, publisherId }: { id: string; publisherId: string }) =>
      cartShiftsApi.addParticipant(id, publisherId),
    onSuccess: invalidate,
    onError: (e) => Alert.alert('', extractErrorMessage(e)),
  });
  const removeParticipantMutation = useMutation({
    mutationFn: ({ id, publisherId }: { id: string; publisherId: string }) =>
      cartShiftsApi.removeParticipant(id, publisherId),
    onSuccess: invalidate,
  });

  const pending =
    createMutation.isPending ||
    updateMutation.isPending ||
    removeMutation.isPending ||
    addMutation.isPending ||
    removeParticipantMutation.isPending;

  const groups = useMemo(() => {
    const out: { date: string; shifts: CartShift[] }[] = [];
    for (const s of shiftsQuery.data ?? []) {
      let g = out.find((x) => x.date === s.date);
      if (!g) {
        g = { date: s.date, shifts: [] };
        out.push(g);
      }
      g.shifts.push(s);
    }
    return out;
  }, [shiftsQuery.data]);

  const confirmRemove = (shift: CartShift) => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('cart.removeWeb'))) removeMutation.mutate(shift.id);
      return;
    }
    Alert.alert(t('cart.removeTitle'), t('cart.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => removeMutation.mutate(shift.id),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {canEditCartWitnessing && (
        <Pressable
          style={({ pressed }) => [
            styles.createBtn,
            pressed && styles.createBtnPressed,
          ]}
          onPress={() => setFormFor('new')}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.createBtnText}>{t('cart.createShift')}</Text>
        </Pressable>
      )}

      {shiftsQuery.isLoading ? (
        <ActivityIndicator size="large" style={{ marginTop: 32 }} />
      ) : shiftsQuery.error ? (
        <Text style={styles.errorText}>
          {extractErrorMessage(shiftsQuery.error)}
        </Text>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.date}
          contentContainerStyle={{ paddingBottom: 32 }}
          ListEmptyComponent={
            <Text style={styles.empty}>{t('cart.empty')}</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.dateGroup}>
              <Text style={styles.dateHeader}>
                {formatDateHeader(item.date, i18n.language)}
              </Text>
              {item.shifts.map((shift) => (
                <CartShiftCard
                  key={shift.id}
                  shift={shift}
                  publishersById={publishersById}
                  canEdit={canEditCartWitnessing}
                  pending={pending}
                  onEdit={() => setFormFor(shift)}
                  onRemove={() => confirmRemove(shift)}
                  onAddParticipant={(publisherId) =>
                    addMutation.mutate({ id: shift.id, publisherId })
                  }
                  onRemoveParticipant={(publisherId) =>
                    removeParticipantMutation.mutate({
                      id: shift.id,
                      publisherId,
                    })
                  }
                />
              ))}
            </View>
          )}
        />
      )}

      <CartShiftForm
        target={formFor}
        onClose={() => setFormFor(null)}
        onCreate={(input) => {
          createMutation.mutate(input);
          setFormFor(null);
        }}
        onUpdate={(id, input) => {
          updateMutation.mutate({ id, input });
          setFormFor(null);
        }}
      />
    </View>
  );
}

function CartShiftCard({
  shift,
  publishersById,
  canEdit,
  pending,
  onEdit,
  onRemove,
  onAddParticipant,
  onRemoveParticipant,
}: {
  shift: CartShift;
  publishersById: Map<string, Publisher>;
  canEdit: boolean;
  pending?: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onAddParticipant: (publisherId: string) => void;
  onRemoveParticipant: (publisherId: string) => void;
}) {
  const { t } = useTranslation();
  const participants = shift.participants ?? [];
  const count = participants.length;
  const under = count < MIN;
  const full = count >= MAX;
  const ids = participants.map((p) => p.publisherId);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.time}>
            {shift.startTime}–{shift.endTime}
          </Text>
          <Text style={styles.location} numberOfLines={2}>
            <Ionicons name="location-outline" size={13} color="#64748b" />{' '}
            {shift.location}
          </Text>
        </View>
        <View
          style={[styles.countBadge, under ? styles.countWarn : styles.countOk]}
        >
          <Text
            style={[
              styles.countText,
              under ? styles.countWarnText : styles.countOkText,
            ]}
          >
            {count}/{MAX}
          </Text>
        </View>
        {canEdit && (
          <View style={styles.cardActions}>
            <Pressable
              onPress={onEdit}
              hitSlop={8}
              style={styles.iconBtn}
              disabled={pending}
            >
              <Ionicons name="create-outline" size={20} color="#0369a1" />
            </Pressable>
            <Pressable
              onPress={onRemove}
              hitSlop={8}
              style={styles.iconBtn}
              disabled={pending}
            >
              <Ionicons name="trash-outline" size={20} color="#dc2626" />
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.chips}>
        {participants.map((p) => {
          const name = publishersById.get(p.publisherId)?.displayName ?? '—';
          return (
            <View key={p.publisherId} style={styles.chip}>
              <Text style={styles.chipText}>{name}</Text>
              {canEdit && (
                <Pressable
                  onPress={() => onRemoveParticipant(p.publisherId)}
                  hitSlop={6}
                  disabled={pending}
                >
                  <Ionicons name="close-circle" size={16} color="#94a3b8" />
                </Pressable>
              )}
            </View>
          );
        })}
        {count === 0 && !canEdit && <Text style={styles.noParticipants}>—</Text>}
      </View>

      {under && (
        <View style={styles.warnRow}>
          <Ionicons name="warning-outline" size={12} color="#b45309" />
          <Text style={styles.warnText}>{t('cart.needMin')}</Text>
        </View>
      )}

      {canEdit &&
        (full ? (
          <Text style={styles.fullNote}>{t('cart.full')}</Text>
        ) : (
          <PublisherSelector
            label={t('cart.addParticipant')}
            value={null}
            onChange={(id) => {
              if (id) onAddParticipant(id);
            }}
            excludeIds={ids}
            requiredCapability="public_witnessing"
          />
        ))}
    </View>
  );
}

function CartShiftForm({
  target,
  onClose,
  onCreate,
  onUpdate,
}: {
  target: CartShift | 'new' | null;
  onClose: () => void;
  onCreate: (input: CreateCartShiftInput) => void;
  onUpdate: (id: string, input: UpdateCartShiftInput) => void;
}) {
  const { t } = useTranslation();
  const editing = target && target !== 'new' ? target : null;
  const visible = target !== null;

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    if (target === 'new') {
      setDate(todayISO());
      setStartTime('10:00');
      setEndTime('12:00');
      setLocation('');
    } else if (target) {
      setDate(target.date);
      setStartTime(target.startTime);
      setEndTime(target.endTime);
      setLocation(target.location);
    }
  }, [target]);

  const canSave =
    DATE_RE.test(date) &&
    TIME_RE.test(startTime) &&
    TIME_RE.test(endTime) &&
    location.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    const base = { date, startTime, endTime, location: location.trim() };
    if (editing) onUpdate(editing.id, base);
    else onCreate(base);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {editing ? t('cart.editTitle') : t('cart.addTitle')}
          </Text>

          <ScrollView
            style={styles.formScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.fieldLabel}>{t('cart.dateLabel')}</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder={t('cart.datePlaceholder')}
              placeholderTextColor="#94a3b8"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              autoCapitalize="none"
            />

            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('cart.startLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder={t('cart.timePlaceholder')}
                  placeholderTextColor="#94a3b8"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{t('cart.endLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder={t('cart.timePlaceholder')}
                  placeholderTextColor="#94a3b8"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>{t('cart.locationLabel')}</Text>
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder={t('cart.locationPlaceholder')}
              placeholderTextColor="#94a3b8"
              maxLength={255}
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalConfirm, !canSave && styles.disabled]}
              onPress={submit}
              disabled={!canSave}
            >
              <Text style={styles.modalConfirmText}>{t('cart.save')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    margin: 16,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
  },
  createBtnPressed: { opacity: 0.85 },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: 48,
    fontSize: 15,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
    margin: 16,
  },

  dateGroup: { marginTop: 8 },
  dateHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    paddingHorizontal: 16,
    paddingVertical: 6,
    textTransform: 'capitalize',
  },

  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  time: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  location: { fontSize: 13, color: '#64748b', marginTop: 2 },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  countOk: { backgroundColor: '#dcfce7' },
  countWarn: { backgroundColor: '#fef3c7' },
  countText: { fontSize: 12, fontWeight: '700' },
  countOkText: { color: '#15803d' },
  countWarnText: { color: '#b45309' },
  cardActions: { flexDirection: 'row', gap: 2 },
  iconBtn: { padding: 4 },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipText: { fontSize: 13, color: '#1e3a8a', fontWeight: '500' },
  noParticipants: { fontSize: 13, color: '#cbd5e1' },

  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  warnText: { fontSize: 12, color: '#b45309', fontWeight: '500' },
  fullNote: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 10,
    fontStyle: 'italic',
  },

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
    gap: 12,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  formScroll: { maxHeight: 420 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginTop: 10,
    marginBottom: 4,
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
  timeRow: { flexDirection: 'row', gap: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  modalConfirm: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
  },
  modalConfirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
