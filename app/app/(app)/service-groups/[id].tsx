import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  
  Modal,
  
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  auxiliaryPioneersApi,
  extractErrorMessage,
  Publisher,
  publishersApi,
  ServiceGroup,
  serviceGroupsApi,
  UpdateServiceGroupInput,
} from '../../../lib/api';
import { ServiceGroupForm } from '../../../components/ServiceGroupForm';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../lib/auth';
import { publisherTags } from '../../../lib/publisher-tags';
import { notify } from '../../../lib/error-bus';
import { confirm } from '../../../components/ConfirmHost';

export default function ServiceGroupDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const groupQuery = useQuery({
    queryKey: ['service-groups', id],
    queryFn: () => serviceGroupsApi.getById(id!),
    enabled: !!id,
  });

  const auxQuery = useQuery({
    queryKey: ['aux-pioneers', 'journal'],
    queryFn: () => auxiliaryPioneersApi.journal(),
    staleTime: 5 * 60 * 1000,
  });
  // Auxiliary pioneering comes from the real service periods, the same source
  // the roster uses. Computed here, above any early return, so the hook order
  // never changes.
  const activeAuxIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of auxQuery.data ?? []) {
      if (row.state === 'serving') ids.add(row.publisherId);
    }
    return ids;
  }, [auxQuery.data]);
  const membersQuery = useQuery({
    queryKey: ['service-groups', id, 'publishers'],
    queryFn: () => serviceGroupsApi.getPublishers(id!),
    enabled: !!id && !editing,
  });

  // Everything about groups now hangs off ONE key prefix — the lists, the
  // names the roster reads, a single group and its members. Before this the
  // card lived under a key of its own, so a change made anywhere else left it
  // showing yesterday, and the screens disagreed until something happened to
  // refetch. One invalidation now reaches all of them.
  const invalidateGroups = () => {
    queryClient.invalidateQueries({ queryKey: ['service-groups'] });
    queryClient.invalidateQueries({ queryKey: ['publishers'] });
  };
  const invalidateMembership = invalidateGroups;

  const updateMutation = useMutation({
    mutationFn: (input: UpdateServiceGroupInput) =>
      serviceGroupsApi.update(id!, input),
    onSuccess: () => {
      invalidateGroups();
      setEditing(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => serviceGroupsApi.remove(id!),
    onSuccess: () => {
      invalidateGroups();
      router.back();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => serviceGroupsApi.restore(id!),
    onSuccess: () => {
      invalidateGroups();
    },
  });

  const addMembersMutation = useMutation({
    mutationFn: (ids: string[]) => serviceGroupsApi.addPublishers(id!, ids),
    onSuccess: () => {
      invalidateMembership();
      setAddOpen(false);
    },
    onError: (e) => notify('', extractErrorMessage(e)),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (publisherId: string) =>
      serviceGroupsApi.removePublisher(id!, publisherId),
    onSuccess: invalidateMembership,
    onError: (e) => notify('', extractErrorMessage(e)),
  });

  const confirmRemove = async () => {
    if (
      await confirm({
        title: t('serviceGroups.removeConfirm.title'),
        body: t('serviceGroups.removeConfirm.body'),
        confirmLabel: t('common.remove'),
        danger: true,
      })
    ) {
      removeMutation.mutate();
    }
  };

  const confirmRemoveMember = async (p: Publisher) => {
    if (
      await confirm({
        title: t('serviceGroups.removeMember.title'),
        body: t('serviceGroups.removeMember.body', { name: p.displayName }),
        confirmLabel: t('serviceGroups.removeMember.action'),
        danger: true,
      })
    ) {
      removeMemberMutation.mutate(p.id);
    }
  };

  if (groupQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (groupQuery.error || !groupQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {groupQuery.error
            ? extractErrorMessage(groupQuery.error)
            : t('common.notFound')}
        </Text>
      </View>
    );
  }

  const group = groupQuery.data;
  const members = membersQuery.data?.data ?? [];
  const overseer =
    group.overseer ?? members.find((p) => p.id === group.overseerPublisherId);
  const assistant =
    group.assistant ?? members.find((p) => p.id === group.assistantPublisherId);
  const isAdmin = user?.role === 'admin';
  const canManage = isAdmin && !group.deletedAt;
  // Mirrors the server's private-access rule, as the roster does.
  const privileged =
    user?.role === 'admin' ||
    user?.role === 'elder' ||
    user?.canViewPrivateData === true;
  const memberIds = members.map((p) => p.id);

  if (editing) {
    return (
      <ServiceGroupForm
        initial={{
          name: group.name,
          overseerPublisherId: group.overseerPublisherId,
          assistantPublisherId: group.assistantPublisherId,
          meetingLocation: group.meetingLocation ?? undefined,
          notes: group.notes ?? undefined,
        }}
        onSubmit={updateMutation.mutateAsync}
        isSubmitting={updateMutation.isPending}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View style={styles.headerSection}>
        <Text style={styles.headerName}>{group.name}</Text>
        {group.meetingLocation && (
          <Text style={styles.headerSub}>📍 {group.meetingLocation}</Text>
        )}
        {group.deletedAt && <Text style={styles.removedBadge}>{t('common.removed')}</Text>}
      </View>

      {(overseer || assistant) && (
        <View style={styles.leadership}>
          {overseer && (
            <Pressable
              style={({ pressed }) => [
                styles.leaderCard,
                pressed && styles.rowPressed,
              ]}
              onPress={() => router.push(`/publishers/${overseer.id}` as any)}
            >
              <Text style={styles.leaderRole}>{t('serviceGroups.overseer')}</Text>
              <Text style={styles.leaderName}>{overseer.displayName}</Text>
            </Pressable>
          )}
          {assistant && (
            <Pressable
              style={({ pressed }) => [
                styles.leaderCard,
                pressed && styles.rowPressed,
              ]}
              onPress={() => router.push(`/publishers/${assistant.id}` as any)}
            >
              <Text style={styles.leaderRole}>{t('serviceGroups.assistant')}</Text>
              <Text style={styles.leaderName}>{assistant.displayName}</Text>
            </Pressable>
          )}
        </View>
      )}

      {group.notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>{group.notes}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        {t('serviceGroups.membersCount', { count: membersQuery.data?.total ?? 0 })}
      </Text>

      <View style={styles.list}>
        {membersQuery.isLoading ? (
          <ActivityIndicator style={{ padding: 16 }} />
        ) : members.length === 0 ? (
          <Text style={styles.empty}>{t('serviceGroups.noMembersYet')}</Text>
        ) : (
          // Whoever serves the group and his assistant come first: someone
          // opening a group is usually looking for exactly those two, and
          // finding them meant hunting through the list for a small badge.
          [...members]
            .sort((a, b) => roleRank(a, group) - roleRank(b, group))
            .map((p) => {
            const role =
              p.id === group.overseerPublisherId
                ? 'overseer'
                : p.id === group.assistantPublisherId
                ? 'assistant'
                : null;
            return (
              <MemberRow
                key={p.id}
                publisher={p}
                role={role}
                privileged={privileged}
                isAuxiliaryPioneer={activeAuxIds.has(p.id)}
                canRemove={canManage && role === null}
                pending={removeMemberMutation.isPending}
                onRemove={() => confirmRemoveMember(p)}
              />
            );
          })
        )}
      </View>

      {canManage && (
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={() => setAddOpen(true)}
        >
          <Ionicons name="person-add-outline" size={16} color="#0369a1" />
          <Text style={styles.addBtnText}>{t('serviceGroups.addMembers')}</Text>
        </Pressable>
      )}

      <View style={styles.actions}>
        {canManage && (
          <Pressable
            style={[styles.button, styles.buttonEdit]}
            onPress={() => setEditing(true)}
          >
            <Text style={styles.buttonEditText}>{t('common.edit')}</Text>
          </Pressable>
        )}
        {isAdmin && (group.deletedAt ? (
          <Pressable
            style={[styles.button, styles.buttonRestore]}
            onPress={() => restoreMutation.mutate()}
            disabled={restoreMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {restoreMutation.isPending ? t('common.restoring') : t('common.restore')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.button, styles.buttonRemove]}
            onPress={confirmRemove}
            disabled={removeMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {removeMutation.isPending ? t('common.removing') : t('common.remove')}
            </Text>
          </Pressable>
        ))}
      </View>

      <AddMembersModal
        visible={addOpen}
        currentMemberIds={memberIds}
        onClose={() => setAddOpen(false)}
        onAdd={(ids) => addMembersMutation.mutate(ids)}
        pending={addMembersMutation.isPending}
      />
    </ScrollView>
  );
}

/** Overseer first, then his assistant, then everyone else as they came. */
function roleRank(p: Publisher, group: ServiceGroup): number {
  if (p.id === group.overseerPublisherId) return 0;
  if (p.id === group.assistantPublisherId) return 1;
  return 2;
}

function MemberRow({
  publisher,
  role,
  canRemove,
  pending,
  privileged,
  isAuxiliaryPioneer,
  onRemove,
}: {
  publisher: Publisher;
  role: 'overseer' | 'assistant' | null;
  canRemove: boolean;
  pending?: boolean;
  privileged: boolean;
  isAuxiliaryPioneer: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const tags = publisherTags(publisher, { privileged, isAuxiliaryPioneer });
  const initials =
    (publisher.firstName[0] ?? '') + (publisher.lastName[0] ?? '');
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      disabled={!privileged}
      onPress={() => router.push(`/publishers/${publisher.id}` as any)}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor:
              publisher.gender === 'brother' ? '#0ea5e9' : '#ec4899',
          },
        ]}
      >
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {publisher.displayName}
        </Text>
        {role ? (
          // Said in full — «Ответственный за группу», not a three-letter chip
          // that has to be decoded.
          <Text style={styles.memberRole}>
            {t(`serviceGroups.${role}`)}
          </Text>
        ) : null}
        {tags.length > 0 ? (
          <Text style={styles.memberTags} numberOfLines={2}>
            {tags.join(' \u00b7 ')}
          </Text>
        ) : null}
      </View>

      {canRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          disabled={pending}
          style={styles.removeBtn}
        >
          <Ionicons name="close-circle" size={22} color="#cbd5e1" />
        </Pressable>
      ) : privileged ? (
        <Text style={styles.chevron}>›</Text>
      ) : null}
    </Pressable>
  );
}

function AddMembersModal({
  visible,
  currentMemberIds,
  onClose,
  onAdd,
  pending,
}: {
  visible: boolean;
  currentMemberIds: string[];
  onClose: () => void;
  onAdd: (ids: string[]) => void;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setSelected([]);
    }
  }, [visible]);

  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({ limit: 200 }),
    enabled: visible,
  });
  const groupsQuery = useQuery({
    queryKey: ['service-groups', 'names'],
    queryFn: () => serviceGroupsApi.list({}),
    enabled: visible,
  });
  const groupName = (gid: string | null | undefined) =>
    gid ? groupsQuery.data?.data.find((g) => g.id === gid)?.name : undefined;

  const candidates = (publishersQuery.data?.data ?? [])
    .filter((p) => !currentMemberIds.includes(p.id))
    .filter(
      (p) =>
        search === '' ||
        p.displayName.toLowerCase().includes(search.toLowerCase()),
    );

  const toggle = (pid: string) =>
    setSelected((prev) =>
      prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid],
    );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t('serviceGroups.addMembers')}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t('common.searchByName')}
          placeholderTextColor="#cbd5e1"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {publishersQuery.isLoading ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : (
          <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
            {candidates.length === 0 && (
              <Text style={styles.empty}>{t('serviceGroups.noPublishersToAdd')}</Text>
            )}
            {candidates.map((p) => {
              const isSel = selected.includes(p.id);
              const gName = groupName(p.serviceGroupId);
              return (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [
                    styles.checkRow,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => toggle(p.id)}
                >
                  <View
                    style={[styles.checkbox, isSel && styles.checkboxOn]}
                  >
                    {isSel && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkName} numberOfLines={1}>
                      {p.displayName}
                    </Text>
                    <Text style={styles.checkSub} numberOfLines={1}>
                      {gName
                        ? t('serviceGroups.inGroup', { name: gName })
                        : t('serviceGroups.noGroup')}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.modalFooter}>
          <Pressable
            style={[
              styles.confirmBtn,
              (selected.length === 0 || pending) && styles.disabled,
            ]}
            onPress={() => selected.length > 0 && onAdd(selected)}
            disabled={selected.length === 0 || pending}
          >
            <Text style={styles.confirmBtnText}>
              {t('serviceGroups.addSelected', { count: selected.length })}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { color: '#dc2626', fontSize: 16, textAlign: 'center' },

  headerSection: {
    backgroundColor: '#fff',
    paddingTop: 24,
    paddingBottom: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerName: {
    fontSize: 22,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
    paddingHorizontal: 24,
    textAlign: 'center',
  },
  headerSub: { color: '#64748b', marginTop: 6, fontSize: 14 },
  removedBadge: {
    marginTop: 8,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
  },

  leadership: { flexDirection: 'row', padding: 16, gap: 12 },
  leaderCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  leaderRole: {
    fontSize: 11,
    color: '#7c3aed',
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  leaderName: {
    fontSize: 15,
    color: '#0f172a',
    marginTop: 4,
    fontWeight: '500', fontFamily: 'Manrope_500Medium',
  },

  notesBox: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  notesText: { color: '#475569', fontSize: 14 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  list: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: 32,
    fontSize: 14,
  },

  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontFamily: 'Manrope_700Bold', fontSize: 13 },
  name: { fontSize: 15, fontWeight: '500', fontFamily: 'Manrope_500Medium', color: '#0f172a', flex: 1 },
  removeBtn: { marginLeft: 8, padding: 2 },
  memberRole: {
    fontSize: 12,
    color: '#7c3aed',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    marginTop: 1,
  },
  memberTags: { fontSize: 12, color: '#64748b', marginTop: 1 },
  chevron: { color: '#cbd5e1', fontSize: 24, marginLeft: 8 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#bae6fd',
    backgroundColor: '#fff',
  },
  addBtnPressed: { backgroundColor: '#e0f2fe' },
  addBtnText: { fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0369a1' },

  actions: { padding: 20, gap: 8 },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  buttonEdit: { backgroundColor: '#0ea5e9' },
  buttonEditText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  buttonRemove: { backgroundColor: '#dc2626' },
  buttonRestore: { backgroundColor: '#059669' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},

  modal: { flex: 1, backgroundColor: '#f1f5f9' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  cancelText: { color: '#64748b', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  search: {
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalList: { flex: 1, backgroundColor: '#fff' },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  checkName: { fontSize: 15, color: '#0f172a', fontWeight: '500', fontFamily: 'Manrope_500Medium',},
  checkSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  modalFooter: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  confirmBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#0ea5e9',
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  disabled: { opacity: 0.5 },
});
