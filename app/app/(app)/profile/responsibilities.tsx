import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  
  
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
import { Sheet } from '../../../components/Sheet';
import {
  PublicUser,
  Responsibility,
  ResponsibilityType,
  extractErrorMessage,
  responsibilitiesApi,
  usersApi,
} from '../../../lib/api';
import { notify } from '../../../lib/error-bus';
import { confirm } from '../../../components/ConfirmHost';

/**
 * The order they are shown in, and it is not the order they were written in.
 *
 * Grouped the way the body itself is: who leads, then the meeting, then the
 * ministry, then what is kept and counted. A brother looking for one of them
 * scans a group of three rather than a list of twelve.
 *
 * KEPT BY HAND, and that is the trap it fell into: two responsibilities were
 * added to the server and this list was not, so they existed everywhere except
 * where somebody could assign them. Anything added to ResponsibilityType
 * belongs here too.
 */
const RESPONSIBILITY_GROUPS: {
  key: string;
  types: ResponsibilityType[];
}[] = [
  {
    key: 'body',
    types: ['body_coordinator', 'body_coordinator_assistant', 'secretary'],
  },
  {
    key: 'meeting',
    types: [
      'life_ministry_overseer',
      'public_talk_coordinator',
      'attendance_recorder',
    ],
  },
  {
    key: 'service',
    types: [
      'service_overseer',
      'service_overseer_assistant',
      'public_witnessing',
    ],
  },
  {
    key: 'house',
    types: ['accounts_servant', 'cleaning_coordinator', 'duties_coordinator'],
  },
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
      notify(t('responsibilities.errorTitle'), extractErrorMessage(e)),
  });

  const revokeMutation = useMutation({
    mutationFn: (vars: { type: ResponsibilityType; userId: string }) =>
      responsibilitiesApi.revoke(vars.type, vars.userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_RESPONSIBILITIES }),
    onError: (e: unknown) =>
      notify(t('responsibilities.errorTitle'), extractErrorMessage(e)),
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

  const confirmRevoke = async (type: ResponsibilityType, userId: string) => {
    const role = t(`responsibilities.types.${type}`);
    if (
      await confirm({
        title: t('responsibilities.revokeConfirm.title'),
        body: t('responsibilities.revokeConfirm.body', { role }),
        confirmLabel: t('responsibilities.revokeConfirm.action'),
        danger: true,
      })
    ) {
      revokeMutation.mutate({ type, userId });
    }
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

        {/* Grouped, and each row on ONE line with its holders under it.
            Before, the name sat on the left, its remove cross beside it, and
            the assign button away at the right edge — three things on three
            different lines of sight, with nothing to tie them together. */}
        {RESPONSIBILITY_GROUPS.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={styles.groupLabel}>
              {t(`responsibilities.groups.${group.key}`)}
            </Text>
            <View style={styles.card}>
              {group.types.map((type, i) => {
                const holders = byType.get(type) ?? [];
                return (
                  <View
                    key={type}
                    style={[styles.row, i > 0 && styles.rowBorder]}
                  >
                    <View style={styles.rowTop}>
                      <Text style={styles.roleTitle}>
                        {t(`responsibilities.types.${type}`)}
                      </Text>
                      <Pressable
                        onPress={() => setPickerFor(type)}
                        style={({ pressed }) => [
                          styles.assignBtn,
                          pressed && styles.assignBtnPressed,
                        ]}
                      >
                        <Ionicons name="add" size={15} color="#0369a1" />
                        <Text style={styles.assignBtnText}>
                          {t('responsibilities.assign')}
                        </Text>
                      </Pressable>
                    </View>

                    {holders.length === 0 ? (
                      <Text style={styles.holderUnassigned}>
                        {t('responsibilities.unassigned')}
                      </Text>
                    ) : (
                      <View style={styles.holderWrap}>
                        {holders.map((h) => {
                          const u = userById.get(h.userId);
                          return (
                            <View key={h.userId} style={styles.holderChip}>
                              <Text style={styles.holder} numberOfLines={1}>
                                {u ? u.email : t('responsibilities.unknownUser')}
                              </Text>
                              <Pressable
                                onPress={() => confirmRevoke(type, h.userId)}
                                hitSlop={8}
                                disabled={revokeMutation.isPending}
                              >
                                <Ionicons
                                  name="close"
                                  size={15}
                                  color="#94a3b8"
                                />
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

      </ScrollView>

      <Sheet
        visible={pickerFor !== null}
        variant="bottom"
        title={pickerFor ? t(`responsibilities.types.${pickerFor}`) : ''}
        subtitle={
          <Text style={styles.sheetSubtitle}>
            {t('responsibilities.pickUser')}
          </Text>
        }
        closeLabel={t('common.cancel')}
        onClose={() => setPickerFor(null)}
      >
            <View>
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
            </View>
      </Sheet>
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
  group: { marginTop: 4 },
  groupLabel: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 16,
    marginTop: 14,
    marginBottom: 6,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  holderWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  holderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingLeft: 11,
    paddingRight: 8,
    paddingVertical: 5,
    maxWidth: '100%',
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
  roleTitle: {
    flex: 1,
    fontSize: 14.5,
    color: '#0f172a',
    fontFamily: 'Manrope_600SemiBold',
  },
  holder: { fontSize: 12.5, color: '#334155', flexShrink: 1 },
  holderUnassigned: {
    fontSize: 12.5,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 8,
  },
  holderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  revokeBtn: { padding: 4 },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 8,
    paddingRight: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e0f2fe',
  },
  assignBtnPressed: { backgroundColor: '#bae6fd' },
  assignBtnText: { fontSize: 13, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
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
});
