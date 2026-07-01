import React, { useMemo, useState } from 'react';
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
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  PublicUser,
  Responsibility,
  ResponsibilityType,
  extractErrorMessage,
  responsibilitiesApi,
  usersApi,
} from '../../../lib/api';

// Display order: meeting roles, then service, then administrative.
const RESPONSIBILITY_ORDER: ResponsibilityType[] = [
  'body_coordinator',
  'life_ministry_overseer',
  'public_talk_coordinator',
  'service_overseer',
  'service_overseer_assistant',
  'public_witnessing',
  'cleaning_coordinator',
  'duties_coordinator',
  'secretary',
];

const QK_RESPONSIBILITIES = ['responsibilities'] as const;
const QK_USERS = ['users'] as const;

export default function ResponsibilitiesScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [pickerFor, setPickerFor] = useState<ResponsibilityType | null>(null);

  const respQuery = useQuery({
    queryKey: QK_RESPONSIBILITIES,
    queryFn: () => responsibilitiesApi.list(),
  });
  const usersQuery = useQuery({
    queryKey: QK_USERS,
    queryFn: () => usersApi.list(),
  });

  const assignMutation = useMutation({
    mutationFn: (input: { type: ResponsibilityType; userId: string }) =>
      responsibilitiesApi.assign(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_RESPONSIBILITIES });
      setPickerFor(null);
    },
    onError: (e: unknown) =>
      Alert.alert(t('responsibilities.errorTitle'), extractErrorMessage(e)),
  });

  const revokeMutation = useMutation({
    mutationFn: (vars: { type: ResponsibilityType; userId: string }) =>
      responsibilitiesApi.revoke(vars.type, vars.userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_RESPONSIBILITIES }),
    onError: (e: unknown) =>
      Alert.alert(t('responsibilities.errorTitle'), extractErrorMessage(e)),
  });

  const byType = useMemo(() => {
    const map = new Map<ResponsibilityType, Responsibility[]>();
    for (const r of respQuery.data ?? []) {
      const list = map.get(r.type) ?? [];
      list.push(r);
      map.set(r.type, list);
    }
    return map;
  }, [respQuery.data]);

  const userById = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const u of usersQuery.data ?? []) map.set(u.id, u);
    return map;
  }, [usersQuery.data]);

  const confirmRevoke = (type: ResponsibilityType, userId: string) => {
    const role = t(`responsibilities.types.${type}`);
    const title = t('responsibilities.revokeConfirm.title');
    const body = t('responsibilities.revokeConfirm.body', { role });
    if (Platform.OS === 'web') {
      if (window.confirm(body)) revokeMutation.mutate({ type, userId });
      return;
    }
    Alert.alert(title, body, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('responsibilities.revokeConfirm.action'),
        style: 'destructive',
        onPress: () => revokeMutation.mutate({ type, userId }),
      },
    ]);
  };

  if (respQuery.isLoading || usersQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  const users = usersQuery.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.intro}>{t('responsibilities.subtitle')}</Text>

        <View style={styles.card}>
          {RESPONSIBILITY_ORDER.map((type, i) => {
            const holders = byType.get(type) ?? [];
            return (
              <View key={type} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={styles.rowMain}>
                  <Text style={styles.roleTitle}>
                    {t(`responsibilities.types.${type}`)}
                  </Text>
                  {holders.length === 0 ? (
                    <Text style={[styles.holder, styles.holderUnassigned]}>
                      {t('responsibilities.unassigned')}
                    </Text>
                  ) : (
                    holders.map((h) => {
                      const u = userById.get(h.userId);
                      return (
                        <View key={h.userId} style={styles.holderRow}>
                          <Text style={styles.holder}>
                            {u ? u.email : t('responsibilities.unknownUser')}
                          </Text>
                          <Pressable
                            onPress={() => confirmRevoke(type, h.userId)}
                            style={styles.revokeBtn}
                            hitSlop={8}
                            disabled={revokeMutation.isPending}
                          >
                            <Ionicons
                              name="close-circle"
                              size={20}
                              color="#dc2626"
                            />
                          </Pressable>
                        </View>
                      );
                    })
                  )}
                </View>

                <Pressable
                  onPress={() => setPickerFor(type)}
                  style={({ pressed }) => [
                    styles.assignBtn,
                    pressed && styles.assignBtnPressed,
                  ]}
                >
                  <Text style={styles.assignBtnText}>
                    {t('responsibilities.assign')}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={pickerFor !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerFor(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPickerFor(null)}>
          {/* Inner press is a no-op so taps inside the sheet do not close it */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>
              {pickerFor ? t(`responsibilities.types.${pickerFor}`) : ''}
            </Text>
            <Text style={styles.sheetSubtitle}>
              {t('responsibilities.pickUser')}
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {users.map((u) => (
                <Pressable
                  key={u.id}
                  style={({ pressed }) => [
                    styles.userRow,
                    pressed && styles.userRowPressed,
                  ]}
                  onPress={() =>
                    pickerFor &&
                    assignMutation.mutate({ type: pickerFor, userId: u.id })
                  }
                  disabled={assignMutation.isPending}
                >
                  <Ionicons
                    name="person-circle-outline"
                    size={22}
                    color="#0ea5e9"
                  />
                  <Text style={styles.userEmail}>{u.email}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => setPickerFor(null)}
            >
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  rowMain: { flex: 1 },
  roleTitle: { fontSize: 15, color: '#0f172a', fontWeight: '500' },
  holder: { fontSize: 12, color: '#0369a1', marginTop: 2 },
  holderUnassigned: { color: '#94a3b8', fontStyle: 'italic' },
  holderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  revokeBtn: { padding: 4 },
  assignBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
  },
  assignBtnPressed: { backgroundColor: '#bae6fd' },
  assignBtnText: { fontSize: 13, color: '#0369a1', fontWeight: '600' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  sheetSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 12,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  userRowPressed: { backgroundColor: '#f1f5f9' },
  userEmail: { fontSize: 15, color: '#0f172a' },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  cancelText: { fontSize: 15, color: '#475569', fontWeight: '600' },
});
