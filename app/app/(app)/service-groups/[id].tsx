import { goBack } from '../../../components/NavHistory';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  auxiliaryPioneersApi,
  extractErrorMessage,
  fieldServiceApi,
  isFieldServiceCancelled,
  meApi,
  serviceOverseerApi,
  serviceReportsApi,
  Publisher,
  serviceGroupsApi,
  UpdateServiceGroupInput,
} from '../../../lib/api';
import { ServiceGroupForm } from '../../../components/ServiceGroupForm';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../lib/auth';
import { publisherTags } from '../../../lib/publisher-tags';
import { notify } from '../../../lib/error-bus';
import { confirm } from '../../../components/ConfirmHost';
import { useAllPublishers } from '../../../lib/useAllPublishers';
import { LoadFailure } from '../../../components/LoadFailure';
import { failsScreen } from '../../../lib/screen-failure';
import { Toast } from '../../../components/ErrorToast';
import { addWeeks, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { formatDay } from '../../../lib/date-range';
import { formatMonthLabel } from '../../../lib/i18n';
import { FONT } from '../../../lib/typography';

export default function ServiceGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupDetail id={id} />;
}

/**
 * A SERVICE GROUP (28 October 2026, mockup «Группы служения»), on its own
 * screen and beside the list of groups on a wide one.
 *
 * Who comes here and for what: a publisher — where his group meets and who
 * leads it; the group's overseer and assistant — the group to look after; the
 * elders — every group. So the group says, at the top: who leads it, its next
 * field-service meeting, the service overseer's visit, and — for the elders
 * and the group's own two — how many have reported. Then the people.
 */
export function GroupDetail({
  id,
  onRemoved,
  footer,
}: {
  id: string | undefined;
  onRemoved?: () => void;
  /** Drawn under the group — the other groups, where the group page opens first. */
  footer?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [width, setWidth] = useState(0);
  const wide = width >= 700;
  const isAdminUser = user?.role === 'admin';
  const isElderUser = user?.role === 'elder';

  const meQuery = useQuery({ queryKey: ['me-publisher'], queryFn: () => meApi.publisher(), staleTime: 5 * 60 * 1000 });
  const monday = formatDateISO(startOfWeekMonday(new Date()));
  const meetingsQuery = useQuery({
    queryKey: ['field-service', 'group-next', monday],
    queryFn: () =>
      fieldServiceApi.list({ weekStart: monday, weekEnd: formatDateISO(addWeeks(startOfWeekMonday(new Date()), 5)) }),
    staleTime: 5 * 60 * 1000,
  });
  const visitsQuery = useQuery({
    queryKey: ['service-overseer', 'group-visits'],
    queryFn: () => serviceOverseerApi.groupVisits(),
    staleTime: 5 * 60 * 1000,
  });

  const groupQuery = useQuery({
    throwOnError: failsScreen,
    queryKey: ['service-groups', id],
    queryFn: () => serviceGroupsApi.getById(id!),
    enabled: !!id,
  });

  const auxQuery = useQuery({
    // Who serves now, and no more: this card is open to the whole group, and
    // it used to read the entire journal for the sake of a mark (6 October).
    queryKey: ['aux-pioneers', 'serving-now'],
    queryFn: () => auxiliaryPioneersApi.servingNow(),
    staleTime: 5 * 60 * 1000,
  });
  // Auxiliary pioneering comes from the real service periods, the same source
  // the roster uses. Computed here, above any early return, so the hook order
  // never changes.
  const activeAuxIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of auxQuery.data?.people ?? []) ids.add(p.publisherId);
    return ids;
  }, [auxQuery.data]);
  const membersQuery = useQuery({
    throwOnError: failsScreen,
    queryKey: ['service-groups', id, 'publishers'],
    queryFn: () => serviceGroupsApi.getPublishers(id!),
    enabled: !!id && !editing,
  });

  // The month being collected — the one the group's reports screen opens on.
  const lastMonth = (() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const g0 = groupQuery.data;
  const me0 = meQuery.data?.publisher?.id ?? null;
  const reportsQuery = useQuery({
    queryKey: ['service-reports', 'group', lastMonth],
    queryFn: () => serviceReportsApi.findGroup(lastMonth),
    enabled:
      !!g0 &&
      (isAdminUser || isElderUser || (!!me0 && (g0.overseerPublisherId === me0 || g0.assistantPublisherId === me0))),
    staleTime: 60 * 1000,
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
      if (onRemoved) onRemoved();
      else goBack('/service-groups');
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
    // What the group still has in field service is said first (24 October
    // 2026): its template rows sleep, its drafts go, its announced meetings
    // stay marked for the service overseer.
    let impact: { slots: number; drafts: number; published: number } | null = null;
    try {
      impact = await serviceGroupsApi.removalImpact(id!);
    } catch {
      impact = null;
    }
    const extra: string[] = [];
    if (impact?.slots) extra.push(t('serviceGroups.removeConfirm.slots', { count: impact.slots }));
    if (impact?.drafts) extra.push(t('serviceGroups.removeConfirm.drafts', { count: impact.drafts }));
    if (impact?.published)
      extra.push(t('serviceGroups.removeConfirm.published', { count: impact.published }));
    if (
      await confirm({
        title: t('serviceGroups.removeConfirm.title'),
        body: [t('serviceGroups.removeConfirm.body'), ...extra].join('\n\n'),
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

  if (groupQuery.error) {
    return (
      <View style={styles.center}>
        <LoadFailure
          error={groupQuery.error}
          onRetry={() => void groupQuery.refetch()}
        />
      </View>
    );
  }
  if (!groupQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('common.notFound')}</Text>
      </View>
    );
  }
  // A group's members are shown to the group itself and to the elders. For
  // anybody else the server refuses the list — and that refusal used to be
  // drawn as «Участников (0). В группе пока нет участников», a plain untruth
  // about a group of fifteen (6 October).
  const membersRefused =
    (membersQuery.error as { response?: { status?: number } } | null)?.response
      ?.status === 403;

  const group = groupQuery.data;
  const members = membersQuery.data?.data ?? [];
  const studentsHere = members.filter((m) => m.appointment === 'student').length;
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

  const myPublisherId = meQuery.data?.publisher?.id ?? null;
  // Who leads THIS group reads its reports, as the server lets him.
  const leadsIt =
    !!myPublisherId &&
    (group.overseerPublisherId === myPublisherId || group.assistantPublisherId === myPublisherId);
  const seesReports = isAdmin || user?.role === 'elder' || leadsIt;
  const seesVisitHistory = seesReports;

  // The leaders stand at the top; the composition lists everyone else, by
  // name (28 October 2026: they were shown twice).
  const rest = members
    .filter((p) => p.id !== group.overseerPublisherId && p.id !== group.assistantPublisherId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, i18n.language));

  // The next field-service meeting this group goes to: its own, or one for
  // the whole congregation.
  const nextMeeting = (() => {
    const now = new Date();
    const upcoming = (meetingsQuery.data ?? [])
      .filter((m) => !isFieldServiceCancelled(m) && (m.serviceGroupId === group.id || m.isGeneral))
      .map((m) => {
        const d = new Date(`${m.weekStartDate}T${(m.startTime || '00:00').slice(0, 5)}:00`);
        d.setDate(d.getDate() + (m.dayOfWeek - 1));
        return { m, at: d };
      })
      .filter((x) => x.at >= now)
      .sort((a, b) => +a.at - +b.at);
    return upcoming[0] ?? null;
  })();
  const visit = visitsQuery.data?.groups.find((g) => g.serviceGroupId === group.id) ?? null;
  const reportRows = (reportsQuery.data?.publishers ?? []).filter((r) => r.groupId === group.id);
  const reported = reportRows.filter((r) => !!r.report).length;

  const openMap = () => {
    if (!group.meetingLocation) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(group.meetingLocation)}`;
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else void Linking.openURL(url);
  };
  const openCard = (pid: string) => router.push(`/publishers/${pid}?from=/service-groups/${id}` as never);

  const facts: { key: string; label: string; value: string; tone?: 'warn' | 'ok'; onPress?: () => void }[] = [];
  if (nextMeeting) {
    facts.push({
      key: 'meeting',
      label: t('groupCard.nextMeeting'),
      value:
        nextMeeting.at.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }) +
        ` · ${nextMeeting.m.startTime.slice(0, 5)}` +
        (nextMeeting.m.isGeneral ? ` · ${t('groupCard.general')}` : ''),
      onPress: () => router.push('/cart/field-service' as never),
    });
  }
  if (visit?.nextVisitDate) {
    facts.push({
      key: 'visit',
      label: t('groupCard.serviceOverseer'),
      value: t('groupCard.visitComing', { date: formatDay(visit.nextVisitDate, i18n.language, { weekday: 'short', month: 'short' }) }),
      tone: 'ok',
    });
  } else if (seesVisitHistory && visit) {
    facts.push({
      key: 'visit',
      label: t('groupCard.serviceOverseer'),
      value: visit.lastVisitDate
        ? t('groupCard.visitLast', { date: formatDay(visit.lastVisitDate, i18n.language, { month: 'short', year: 'auto' }) })
        : t('groupCard.visitNone'),
      tone: (visit.madeThisYear ?? visit.visitsThisYear) > 0 ? undefined : 'warn',
    });
  }
  if (seesReports && reportsQuery.data && reportRows.length > 0) {
    facts.push({
      key: 'reports',
      label: t('groupCard.reports', { month: formatMonthLabel(reportsQuery.data.reportMonth.slice(0, 7)) }),
      value: t('groupCard.reportsOf', { done: reported, total: reportRows.length }),
      tone: reported === reportRows.length ? 'ok' : undefined,
      onPress: () => router.push('/service-reports/group' as never),
    });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons name="people" size={24} color="#6d28d9" />
          </View>
          <View style={styles.flex}>
            <View style={styles.nameRow}>
              <Text style={styles.heroName}>{group.name}</Text>
              {group.mine ? <Text style={styles.mineTag}>{t('serviceGroups.mine')}</Text> : null}
              {group.deletedAt ? <Text style={styles.removedTag}>{t('common.removed')}</Text> : null}
            </View>
            {group.meetingLocation ? (
              <Pressable onPress={openMap} hitSlop={4} accessibilityRole="link">
                <Text style={styles.heroPlace}>
                  <Ionicons name="location-outline" size={14} color="#0369a1" /> {group.meetingLocation}
                  <Text style={styles.heroMap}>{`  ·  ${t('groupCard.onMap')} ›`}</Text>
                </Text>
              </Pressable>
            ) : null}
          </View>
          {canManage ? (
            <Pressable
              onPress={() => setEditing(true)}
              style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
              testID="group-edit"
            >
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.editText}>{t('common.edit')}</Text>
            </Pressable>
          ) : null}
        </View>

        {overseer || assistant ? (
          <View style={[styles.leaders, wide && styles.leadersWide]}>
            {[
              { p: overseer, role: 'overseer' as const },
              { p: assistant, role: 'assistant' as const },
            ]
              .filter((x) => !!x.p)
              .map(({ p, role }) => (
                <Pressable
                  key={role}
                  // The card opens to those who may read it; for the others the
                  // name is a name, not a door to «No access» (walk, 23 October).
                  disabled={!privileged}
                  onPress={() => openCard(p!.id)}
                  style={({ pressed }) => [styles.leader, wide && styles.leaderWide, pressed && styles.pressed]}
                >
                  <Avatar p={p!} />
                  <View style={styles.flex}>
                    {/* Not in capitals: «GRUPPENVERANTWORTLICHER» broke in the
                        middle of the word on a phone (20 October 2026). */}
                    <Text style={styles.leaderRole}>{t(`serviceGroups.${role}`)}</Text>
                    <Text style={styles.leaderName}>{p!.displayName}</Text>
                  </View>
                  {privileged ? <Ionicons name="chevron-forward" size={16} color="#c4b5fd" /> : null}
                </Pressable>
              ))}
          </View>
        ) : null}

        {facts.length > 0 ? (
          <View style={styles.facts}>
            {facts.map((f) => (
              <Pressable
                key={f.key}
                disabled={!f.onPress}
                onPress={f.onPress}
                style={({ pressed }) => [styles.fact, wide && styles.factWide, pressed && styles.pressed]}
                testID={`group-fact-${f.key}`}
              >
                <Text style={styles.factLabel}>{f.label}</Text>
                <Text style={[styles.factValue, f.tone === 'warn' && styles.factWarn, f.tone === 'ok' && styles.factOk]}>
                  {f.value}
                  {f.onPress ? <Text style={styles.factGo}>{'  ›'}</Text> : null}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {group.notes ? <Text style={styles.note}>{group.notes}</Text> : null}
      </View>

      {membersRefused ? (
        <Text style={styles.empty}>{t('serviceGroups.otherGroupClosed')}</Text>
      ) : (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {/* Students are not publishers: the congregation's list leaves them
                  out of its total, and so does this one — they are named apart. */}
              {studentsHere > 0
                ? t('serviceGroups.membersWithStudents', {
                    count: (membersQuery.data?.total ?? 0) - studentsHere,
                    students: studentsHere,
                  })
                : t('serviceGroups.membersCount', { count: membersQuery.data?.total ?? 0 })}
            </Text>
            {canManage ? (
              <View style={styles.sectionActions}>
                {rest.length > 0 ? (
                  <Pressable onPress={() => setTrimming((v) => !v)} hitSlop={6} testID="group-trim">
                    <Text style={styles.link}>{trimming ? t('common.done') : t('groupCard.trim')}</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setAddOpen(true)} hitSlop={6} testID="group-add">
                  <Text style={styles.link}>＋ {t('groupCard.add')}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {membersQuery.isLoading ? (
            <ActivityIndicator style={{ padding: 16 }} />
          ) : membersQuery.error ? (
            <LoadFailure error={membersQuery.error} onRetry={() => void membersQuery.refetch()} />
          ) : rest.length === 0 ? (
            <Text style={styles.empty}>
              {members.length === 0 ? t('serviceGroups.noMembersYet') : t('groupCard.onlyLeaders')}
            </Text>
          ) : (
            <View style={[styles.grid, wide && styles.gridWide]}>
              {rest.map((p) => (
                <MemberRow
                  key={p.id}
                  publisher={p}
                  wide={wide}
                  privileged={privileged}
                  isAuxiliaryPioneer={activeAuxIds.has(p.id)}
                  // Taking someone out of a group is offered only after
                  // «Изменить состав»: a cross on every row was one slip away.
                  canRemove={canManage && trimming}
                  pending={removeMemberMutation.isPending}
                  onRemove={() => confirmRemoveMember(p)}
                  onOpen={() => openCard(p.id)}
                />
              ))}
            </View>
          )}
        </>
      )}

      {isAdmin ? (
        <View style={styles.foot}>
          {group.deletedAt ? (
            <Pressable onPress={() => restoreMutation.mutate()} disabled={restoreMutation.isPending} hitSlop={6}>
              <Text style={styles.footRestore}>
                {restoreMutation.isPending ? t('common.restoring') : t('common.restore')}
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={confirmRemove} disabled={removeMutation.isPending} hitSlop={6} testID="group-remove">
              <Text style={styles.footText}>
                {t('groupCard.disband')}{' '}
                <Text style={styles.footDanger}>
                  {removeMutation.isPending ? t('common.removing') : t('common.remove')}
                </Text>
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {footer}

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

function Avatar({ p }: { p: Publisher }) {
  return (
    <View style={[styles.avatar, { backgroundColor: p.gender === 'brother' ? '#0e7490' : '#be185d' }]}>
      <Text style={styles.avatarText}>{(p.firstName[0] ?? '') + (p.lastName[0] ?? '')}</Text>
    </View>
  );
}

function MemberRow({
  publisher,
  wide,
  canRemove,
  pending,
  privileged,
  isAuxiliaryPioneer,
  onRemove,
  onOpen,
}: {
  publisher: Publisher;
  wide: boolean;
  canRemove: boolean;
  pending?: boolean;
  privileged: boolean;
  isAuxiliaryPioneer: boolean;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const tags = publisherTags(publisher, { privileged, isAuxiliaryPioneer });
  const pioneer = publisher.pioneerType !== 'none' || isAuxiliaryPioneer;
  return (
    <Pressable
      style={({ pressed }) => [styles.member, wide && styles.memberWide, pressed && privileged && styles.pressed]}
      disabled={!privileged || canRemove}
      onPress={onOpen}
    >
      <Avatar p={publisher} />
      <View style={styles.flex}>
        <Text style={styles.memberName} numberOfLines={1}>
          {publisher.displayName}
        </Text>
        {tags.length > 0 ? (
          <Text style={[styles.memberTags, pioneer && styles.memberPioneer]} numberOfLines={2}>
            {tags.join(' · ')}
          </Text>
        ) : null}
      </View>
      {canRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} disabled={pending} style={styles.removeBtn} testID={`group-remove-${publisher.id}`}>
          <Ionicons name="remove-circle" size={22} color="#ef4444" />
        </Pressable>
      ) : privileged ? (
        <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
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
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setSelected([]);
    }
  }, [visible]);

  const publishersQuery = useAllPublishers({ enabled: visible });
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
      // As components/Sheet (26 October 2026): under the status bar on
      // Android, with the room for it made here.
      statusBarTranslucent
    >
      <View
        style={[
          styles.modal,
          Platform.OS === 'android' && { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
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
      {/* Its own strip: the root one is drawn under this window. */}
      <Toast layer />
    </Modal>
  );
}

const INK = '#0f172a';
const SOFT = '#64748b';
const LINE = '#e2e8f0';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 12, paddingBottom: 32, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { fontFamily: FONT.regular, color: '#dc2626', fontSize: 16, textAlign: 'center' },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.75 },
  rowPressed: { backgroundColor: '#f8fafc' },

  hero: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: LINE, padding: 18, gap: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' },
  heroIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  heroName: { fontFamily: FONT.extrabold, fontSize: 24, color: INK, letterSpacing: -0.3 },
  mineTag: {
    fontFamily: FONT.extrabold,
    fontSize: 10.5,
    color: '#5b21b6',
    backgroundColor: '#ede9fe',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  removedTag: {
    fontFamily: FONT.bold,
    fontSize: 11,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  heroPlace: { fontFamily: FONT.semibold, fontSize: 14, color: '#0369a1', marginTop: 4 },
  heroMap: { fontFamily: FONT.bold, color: '#0369a1' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: '#0e7490',
  },
  editText: { fontFamily: FONT.bold, fontSize: 13.5, color: '#fff' },

  leaders: { gap: 10 },
  leadersWide: { flexDirection: 'row' },
  leader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#ede9fe',
  },
  leaderWide: { flex: 1 },
  leaderRole: { fontFamily: FONT.bold, fontSize: 12, color: '#6d28d9' },
  leaderName: { fontFamily: FONT.bold, fontSize: 14.5, color: INK, marginTop: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontFamily: FONT.bold, fontSize: 13 },

  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#f8fafc', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  factWide: { flexBasis: '30%' },
  factLabel: { fontFamily: FONT.extrabold, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase', color: SOFT },
  factValue: { fontFamily: FONT.bold, fontSize: 14, color: INK, marginTop: 3 },
  factWarn: { color: '#b45309' },
  factOk: { color: '#15803d' },
  factGo: { color: '#0369a1' },
  note: {
    fontFamily: FONT.medium,
    fontSize: 14,
    lineHeight: 21,
    color: '#334155',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  empty: { fontFamily: FONT.regular, textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8, paddingHorizontal: 4 },
  sectionTitle: { fontFamily: FONT.extrabold, fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', color: SOFT },
  sectionActions: { flexDirection: 'row', gap: 16 },
  link: { fontFamily: FONT.bold, fontSize: 13.5, color: '#0369a1' },
  grid: { gap: 8 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  memberWide: { flexBasis: '48%', flexGrow: 1 },
  memberName: { fontFamily: FONT.bold, fontSize: 14.5, color: INK },
  memberTags: { fontFamily: FONT.medium, fontSize: 12, color: SOFT, marginTop: 1 },
  memberPioneer: { color: '#15803d' },
  removeBtn: { marginLeft: 4, padding: 2 },

  foot: { alignItems: 'center', paddingVertical: 16 },
  footText: { fontFamily: FONT.regular, fontSize: 12.5, color: '#94a3b8' },
  footDanger: { fontFamily: FONT.bold, color: '#b91c1c' },
  footRestore: { fontFamily: FONT.bold, fontSize: 13.5, color: '#047857' },

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
  modalTitle: { fontSize: 18, fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  cancelText: { color: '#64748b', fontSize: 16, fontFamily: 'Manrope_600SemiBold',},
  search: {
    fontFamily: 'Manrope_400Regular',
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
  checkName: { fontSize: 15, color: '#0f172a', fontFamily: 'Manrope_500Medium',},
  checkSub: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#94a3b8', marginTop: 2 },
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
  confirmBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Manrope_600SemiBold',},
  disabled: { opacity: 0.5 },
});
