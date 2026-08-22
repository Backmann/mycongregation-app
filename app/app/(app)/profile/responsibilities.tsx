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
import i18n from '../../../lib/i18n';
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
    // The service committee first, because it is the body's working core and
    // the first thing anybody comes here to check. Their assistants stand with
    // them: formally the committee is three, but a man looking for «кто вместо
    // секретаря» looks here, not two screens down.
    key: 'committee',
    types: [
      'body_coordinator',
      'body_coordinator_assistant',
      'secretary',
      'service_overseer',
      'service_overseer_assistant',
    ],
  },
  {
    key: 'meeting',
    types: [
      'life_ministry_overseer',
      'wt_study_conductor',
      'wt_study_conductor_backup',
      'public_talk_coordinator',
      'adviser',
      'attendance_recorder',
    ],
  },
  { key: 'service', types: ['public_witnessing'] },
  {
    key: 'house',
    types: ['accounts_servant', 'cleaning_coordinator', 'duties_coordinator'],
  },
];

/**
 * Every responsibility appears somewhere — checked by the compiler.
 *
 * The list above is kept by hand, and it fell into exactly the trap that
 * invites: two responsibilities were added to the server and not here, so they
 * existed everywhere except where somebody could assign them. This map has one
 * entry per ResponsibilityType, so leaving one out no longer builds.
 */
const GROUP_OF: Record<ResponsibilityType, string> = {
  body_coordinator: 'committee',
  body_coordinator_assistant: 'committee',
  secretary: 'committee',
  service_overseer: 'committee',
  service_overseer_assistant: 'committee',
  life_ministry_overseer: 'meeting',
  wt_study_conductor: 'meeting',
  wt_study_conductor_backup: 'meeting',
  public_talk_coordinator: 'meeting',
  adviser: 'meeting',
  attendance_recorder: 'meeting',
  public_witnessing: 'service',
  accounts_servant: 'house',
  cleaning_coordinator: 'house',
  duties_coordinator: 'house',
};
void GROUP_OF;

/**
 * The one duty several brothers may hold at once — mirrored from the server's
 * MULTI_HOLDER, and the reason this screen cannot simply say «Заменить»
 * everywhere: a congregation keeps a couple of men able to stand in for the
 * study conductor, and both are genuinely appointed.
 */
const MULTI_HOLDER: ResponsibilityType[] = ['wt_study_conductor_backup'];

const QK_RESPONSIBILITIES = ['responsibilities'] as const;
const QK_USERS = ['users'] as const;

export default function ResponsibilitiesScreen() {
  const { t } = useTranslation();
  /** Day, month and time — enough to place it, short enough to read at a glance. */
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }) +
    ', ' +
    new Date(iso).toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });
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

  /**
   * A name for an account, from the responsibilities the server already
   * resolved — the users list itself carries only the login name and address.
   */
  const publisherNameOf = (u: PublicUser): string | null =>
    (respQuery.data ?? []).find((r) => r.userId === u.id)?.holderName ?? null;

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

  /**
   * Whom a congregational responsibility can be given to.
   *
   * The picker offered every account there is — sisters with a login among
   * them, and administrators with no publisher card at all. These duties are
   * carried by brothers: elders, ministerial servants, and baptised brothers.
   *
   * The filter is on the CARD, not on the account: an account without one is
   * not a member of this congregation as far as privileges go, whatever it can
   * do in the app. A student or an unbaptised publisher is left out for the
   * same reason — the list should not offer what cannot be appointed.
   */
  const users = (usersQuery.data ?? []).filter(
    (u) =>
      u.gender === 'brother' &&
      (u.appointment === 'elder' ||
        u.appointment === 'ministerial_servant' ||
        u.appointment === 'publisher'),
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={styles.intro}>{t('responsibilities.subtitle')}</Text>

        {RESPONSIBILITY_GROUPS.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={styles.groupLabel}>
              {t(`responsibilities.groups.${group.key}`)}
            </Text>
            <View style={styles.card}>
              {group.types.map((type, i) => {
                const holders = byType.get(type) ?? [];
                const many = MULTI_HOLDER.includes(type);
                /* One holder: the button REPLACES him, and says so. Several
                   allowed: it adds another. The old screen offered «Назначить»
                   either way and quietly ended up with two secretaries. */
                const action =
                  holders.length === 0
                    ? t('responsibilities.assign')
                    : many
                      ? t('responsibilities.assignAnother')
                      : t('responsibilities.replace');

                return (
                  <View
                    key={type}
                    style={[styles.row, i > 0 && styles.rowBorder]}
                  >
                    {/* The title has a whole line to itself. It used to share
                        one with the button, and «Помощник координатора совета
                        старейшин» pushed everything past the right edge of the
                        phone — the name was there, just off the screen. */}
                    <Text style={styles.roleTitle}>
                      {t(`responsibilities.types.${type}`)}
                    </Text>

                    {holders.length === 0 ? (
                      <Text style={styles.holderUnassigned}>
                        {t('responsibilities.unassigned')}
                      </Text>
                    ) : (
                      holders.map((h) => (
                        <View key={h.userId} style={styles.holder}>
                          <View style={styles.holderMain}>
                            <Text style={styles.holderName}>
                              {h.holderName ??
                                userById.get(h.userId)?.loginName ??
                                t('responsibilities.unknownUser')}
                            </Text>
                            {/* Recorded since the table was created and never
                                shown: «кто и когда» was written down and
                                unreadable, which is the same as not written. */}
                            <Text style={styles.holderMeta}>
                              {h.assignedByName
                                ? t('responsibilities.assignedByOn', {
                                    name: h.assignedByName,
                                    date: fmtDate(h.assignedAt),
                                  })
                                : t('responsibilities.assignedOn', {
                                    date: fmtDate(h.assignedAt),
                                  })}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => confirmRevoke(type, h.userId)}
                            hitSlop={8}
                            disabled={revokeMutation.isPending}
                            style={styles.removeBtn}
                          >
                            <Ionicons
                              name="close"
                              size={16}
                              color="#94a3b8"
                            />
                          </Pressable>
                        </View>
                      ))
                    )}

                    <Pressable
                      onPress={() => setPickerFor(type)}
                      style={({ pressed }) => [
                        styles.assignBtn,
                        pressed && styles.assignBtnPressed,
                      ]}
                    >
                      <Ionicons
                        name={holders.length === 0 || many ? 'add' : 'swap-horizontal'}
                        size={15}
                        color="#0369a1"
                      />
                      <Text style={styles.assignBtnText}>{action}</Text>
                    </Pressable>
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
              {users.map((u) => {
                /* What he already carries, said in the moment it matters. The
                   body distributes work by looking at exactly this, and the
                   picker used to offer a column of e-mail addresses. */
                const already = (respQuery.data ?? [])
                  .filter((r) => r.userId === u.id)
                  .map((r) => t(`responsibilities.types.${r.type}`));

                return (
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
                      size={24}
                      color="#0ea5e9"
                    />
                    <View style={styles.userMain}>
                      <Text style={styles.userName}>
                        {publisherNameOf(u) ??
                          u.loginName ??
                          t('responsibilities.unknownUser')}
                      </Text>
                      {already.length > 0 ? (
                        <Text style={styles.userHolds} numberOfLines={2}>
                          {t('responsibilities.alreadyHolds', {
                            list: already.join(', '),
                          })}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
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
    color: '#475569',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 2,
    lineHeight: 19,
  },
  group: { marginTop: 18, paddingHorizontal: 14 },
  groupLabel: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#94a3b8',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    marginLeft: 4,
    marginBottom: 8,
  },
  /* A card with its own edge and a soft shadow, rather than a strip pinned to
     the window edges — the page is read as a set of groups, not one long list. */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8edf3',
    overflow: 'hidden',
  },
  /* Column, not row: every long title has a line of its own, and nothing can
     be pushed past the right edge of a phone. */
  row: { paddingVertical: 14, paddingHorizontal: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  roleTitle: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    lineHeight: 21,
  },
  holder: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#eef2f6',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  holderMain: { flex: 1 },
  holderName: {
    fontSize: 14.5,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  holderMeta: { fontSize: 12, color: '#94a3b8', lineHeight: 17, marginTop: 3 },
  removeBtn: { padding: 2 },
  holderUnassigned: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 8,
  },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingLeft: 10,
    paddingRight: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#e0f2fe',
    marginTop: 10,
  },
  assignBtnPressed: { backgroundColor: '#bae6fd' },
  assignBtnText: {
    fontSize: 13,
    color: '#0369a1',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
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
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  userRowPressed: { backgroundColor: '#f1f5f9' },
  userMain: { flex: 1 },
  userName: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  /* What he already carries. The body distributes work by looking at this, and
     the picker used to show twelve e-mail addresses and nothing else. */
  userHolds: { fontSize: 12, color: '#94a3b8', lineHeight: 17, marginTop: 2 },
});
