import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  ResponsibilityType,
  extractErrorMessage,
  publishersApi,
  responsibilitiesApi,
} from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { PublisherAccessContent } from '../../../components/PublisherAccessContent';

// Same display order as the responsibilities screen.
const RESPONSIBILITY_ORDER: ResponsibilityType[] = [
  'body_coordinator',
  'life_ministry_overseer',
  'public_talk_coordinator',
  'service_overseer',
  'public_witnessing',
  'cleaning_coordinator',
  'duties_coordinator',
  'secretary',
];

const QK_BROTHERS = ['publishers', 'brothers'] as const;
const QK_RESPONSIBILITIES = ['responsibilities'] as const;

export default function BrothersScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const brothersQuery = useQuery({
    queryKey: QK_BROTHERS,
    queryFn: async () => {
      const res = await publishersApi.list({ limit: 500 });
      return res.data
        .filter((p) => p.gender === 'brother' && !p.removedAt)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
    },
    enabled: user?.role === 'admin',
  });

  const respQuery = useQuery({
    queryKey: QK_RESPONSIBILITIES,
    queryFn: () => responsibilitiesApi.list(),
    enabled: user?.role === 'admin',
  });

  const assignMutation = useMutation({
    mutationFn: (v: { type: ResponsibilityType; userId: string }) =>
      responsibilitiesApi.assign(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_RESPONSIBILITIES }),
    onError: (e: unknown) => Alert.alert('Ошибка', extractErrorMessage(e)),
  });
  const revokeMutation = useMutation({
    mutationFn: (v: { type: ResponsibilityType; userId: string }) =>
      responsibilitiesApi.revoke(v.type, v.userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_RESPONSIBILITIES }),
    onError: (e: unknown) => Alert.alert('Ошибка', extractErrorMessage(e)),
  });

  const brothers = brothersQuery.data ?? [];
  const selected = useMemo(
    () => brothers.find((p) => p.id === selectedId) ?? null,
    [brothers, selectedId],
  );

  const heldByUser = useMemo(() => {
    const map = new Map<string, Set<ResponsibilityType>>();
    for (const r of respQuery.data ?? []) {
      const set = map.get(r.userId) ?? new Set<ResponsibilityType>();
      set.add(r.type);
      map.set(r.userId, set);
    }
    return map;
  }, [respQuery.data]);

  const closeModal = () => {
    setSelectedId(null);
    // A freshly granted login changes publisher.userId server-side; refresh so
    // the list badge and the responsibilities section pick it up on reopen.
    qc.invalidateQueries({ queryKey: QK_BROTHERS });
  };

  if (user?.role !== 'admin') {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Недостаточно прав.</Text>
      </View>
    );
  }

  if (brothersQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  const selectedHeld = selected?.userId
    ? heldByUser.get(selected.userId)
    : undefined;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.intro}>
          Доступ в приложение и обязанности братьев собрания.
        </Text>
        <View style={styles.card}>
          {brothers.length === 0 ? (
            <Text style={styles.empty}>Список братьев пуст.</Text>
          ) : (
            brothers.map((b, i) => {
              const held = b.userId ? heldByUser.get(b.userId) : undefined;
              const respCount = held ? held.size : 0;
              return (
                <Pressable
                  key={b.id}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && styles.rowBorder,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => setSelectedId(b.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{b.displayName}</Text>
                    <Text style={styles.sub}>
                      {b.userId ? 'Есть вход' : 'Нет входа'}
                      {respCount > 0 ? ` · обязанностей: ${respCount}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal
        visible={selected !== null}
        animationType="slide"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {selected?.displayName ?? ''}
            </Text>
            <Pressable onPress={closeModal} hitSlop={10}>
              <Ionicons name="close" size={26} color="#0f172a" />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          >
            {selected && (
              <>
                <Text style={styles.sectionLabel}>Вход в приложение</Text>
                <View style={styles.block}>
                  <PublisherAccessContent publisher={selected} />
                </View>

                <Text style={styles.sectionLabel}>Обязанности</Text>
                <View style={styles.block}>
                  {!selected.userId ? (
                    <Text style={styles.muted}>
                      Сначала дайте вход — обязанности назначаются пользователю.
                      После выдачи входа закройте и откройте брата заново.
                    </Text>
                  ) : (
                    RESPONSIBILITY_ORDER.map((type, idx) => {
                      const on = selectedHeld?.has(type) ?? false;
                      const userId = selected.userId as string;
                      return (
                        <View
                          key={type}
                          style={[
                            styles.respRow,
                            idx > 0 && styles.respBorder,
                          ]}
                        >
                          <Text style={styles.respLabel}>
                            {t(`responsibilities.types.${type}`)}
                          </Text>
                          <Switch
                            value={on}
                            disabled={
                              assignMutation.isPending ||
                              revokeMutation.isPending
                            }
                            onValueChange={(v) =>
                              v
                                ? assignMutation.mutate({ type, userId })
                                : revokeMutation.mutate({ type, userId })
                            }
                          />
                        </View>
                      );
                    })
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  intro: {
    fontSize: 13,
    color: '#64748b',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
  },
  empty: { fontSize: 14, color: '#94a3b8', padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  rowPressed: { backgroundColor: '#f8fafc' },
  name: { fontSize: 15, color: '#0f172a', fontWeight: '500' },
  sub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  muted: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  modalContainer: { flex: 1, backgroundColor: '#f1f5f9' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    paddingRight: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
  },
  block: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 12,
  },
  respRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  respBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  respLabel: { fontSize: 15, color: '#0f172a', flex: 1, paddingRight: 12 },
});
