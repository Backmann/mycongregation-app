import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
  extractErrorMessage,
  Publisher,
  publishersApi,
  serviceGroupsApi,
  UpdateServiceGroupInput,
} from '../../../lib/api';
import { ServiceGroupForm } from '../../../components/ServiceGroupForm';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../lib/auth';

export default function ServiceGroupDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const groupQuery = useQuery({
    queryKey: ['service-group', id],
    queryFn: () => serviceGroupsApi.getById(id!),
    enabled: !!id,
  });

  const membersQuery = useQuery({
    queryKey: ['service-group', id, 'publishers'],
    queryFn: () => serviceGroupsApi.getPublishers(id!),
    enabled: !!id && !editing,
  });

  const invalidateMembership = () => {
    queryClient.invalidateQueries({ queryKey: ['service-group', id, 'publishers'] });
    queryClient.invalidateQueries({ queryKey: ['service-group', id] });
    queryClient.invalidateQueries({ queryKey: ['service-groups'] });
    queryClient.invalidateQueries({ queryKey: ['publishers'] });
  };

  const updateMutation = useMutation({
    mutationFn: (input: UpdateServiceGroupInput) =>
      serviceGroupsApi.update(id!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-groups'] });
      queryClient.invalidateQueries({ queryKey: ['service-group', id] });
      queryClient.invalidateQueries({ queryKey: ['service-group', id, 'publishers'] });
      setEditing(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => serviceGroupsApi.remove(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-groups'] });
      router.back();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => serviceGroupsApi.restore(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-groups'] });
      queryClient.invalidateQueries({ queryKey: ['service-group', id] });
    },
  });

  const addMembersMutation = useMutation({
    mutationFn: (ids: string[]) => serviceGroupsApi.addPublishers(id!, ids),
    onSuccess: () => {
      invalidateMembership();
      setAddOpen(false);
    },
    onError: (e) => Alert.alert('', extractErrorMessage(e)),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (publisherId: string) =>
      serviceGroupsApi.removePublisher(id!, publisherId),
    onSuccess: invalidateMembership,
    onError: (e) => Alert.alert('', extractErrorMessage(e)),
  });

  const confirmRemove = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('serviceGroups.removeConfirm.webMessage'))) {
        removeMutation.mutate();
      }
      return;
    }
    Alert.alert(t('serviceGroups.removeConfirm.title'), t('serviceGroups.removeConfirm.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        onPress: () => removeMutation.mutate(),
        style: 'destructive',
      },
    ]);
  };

  const confirmRemoveMember = (p: Publisher) => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('serviceGroups.removeMember.web', { name: p.displayName }))) {
        removeMemberMutation.mutate(p.id);
      }
      return;
    }
    Alert.alert(
      t('serviceGroups.removeMember.title'),
      t('serviceGroups.removeMember.body', { name: p.displayName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('serviceGroups.removeMember.action'),
          style: 'destructive',
          onPress: () => removeMemberMutation.mutate(p.id),
        },
      ],
    );
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
          members.map((p) => {
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
        )}
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

function MemberRow({
  publisher,
  role,
  canRemove,
  pending,
  onRemove,
}: {
  publisher: Publisher;
  role: 'overseer' | 'assistant' | null;
  canRemove: boolean;
  pending?: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const initials =
    (publisher.firstName[0] ?? '') + (publisher.lastName[0] ?? '');
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
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
      <Text style={styles.name} numberOfLines={1}>
        {publisher.displayName}
      </Text>
      {role && (
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {t(`serviceGroups.memberRole.${role}`)}
          </Text>
        </View>
      )}
      {canRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          disabled={pending}
          style={styles.removeBtn}
        >
          <Ionicons name="close-circle" size={22} color="#cbd5e1" />
        </Pressable>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
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
    fontWeight: '700',
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
    fontWeight: '600',
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
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  leaderName: {
    fontSize: 15,
    color: '#0f172a',
    marginTop: 4,
    fontWeight: '500',
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
    fontWeight: '600',
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
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  name: { fontSize: 15, fontWeight: '500', color: '#0f172a', flex: 1 },
  roleBadge: {
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  roleBadgeText: { color: '#7c3aed', fontSize: 11, fontWeight: '700' },
  removeBtn: { marginLeft: 8, padding: 2 },
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
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },

  actions: { padding: 20, gap: 8 },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  buttonEdit: { backgroundColor: '#0ea5e9' },
  buttonEditText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonRemove: { backgroundColor: '#dc2626' },
  buttonRestore: { backgroundColor: '#059669' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

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
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  cancelText: { color: '#64748b', fontSize: 16, fontWeight: '600' },
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
  checkName: { fontSize: 15, color: '#0f172a', fontWeight: '500' },
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
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
