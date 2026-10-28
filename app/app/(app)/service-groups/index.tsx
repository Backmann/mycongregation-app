import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ServiceGroup, serviceGroupsApi } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { LoadFailure } from '../../../components/LoadFailure';
import { failsScreen } from '../../../lib/screen-failure';
import { SIDE_NAV_FROM } from '../../../lib/screen-width';
import { FONT } from '../../../lib/typography';
import { GroupDetail } from './[id]';

/**
 * SERVICE GROUPS (28 October 2026, mockup «Группы служения»).
 *
 *  - A publisher opens his OWN group straight away: that is what nine in ten
 *    come here for. The other groups follow below it — their names and who
 *    leads them, so he knows whom to ask; their members stay closed to him
 *    (decided 15 September).
 *  - The elders get the groups as cards — size, pioneers, who leads — and on
 *    a wide screen the chosen group beside them, one tap from the next.
 *  - Removed groups are one quiet line, not a switch over the list. The
 *    switch was also broken: the server read «false» as «true» and showed
 *    them anyway (fixed on the server the same day).
 */
export default function ServiceGroupsListScreen() {
  const { t } = useTranslation();
  // Кто видит личные данные, тот открывает любую группу: правило то же, что
  // на сервере, и второго правила заводить незачем.
  const { isAdmin, isElder } = usePermissions();
  const canSeeEveryGroup = isAdmin || isElder;
  const { width } = useWindowDimensions();
  const split = canSeeEveryGroup && width >= SIDE_NAV_FROM;
  const [search, setSearch] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    throwOnError: failsScreen,
    // Removed groups are the admin's and the elders' business (audit, 22
    // October 2026); they come with the list and are counted, then shown on
    // request.
    queryKey: ['service-groups', 'cards', canSeeEveryGroup],
    queryFn: () => serviceGroupsApi.list({ includeRemoved: canSeeEveryGroup }),
  });
  const all = useMemo(() => data?.data ?? [], [data]);
  const live = all.filter((g) => !g.deletedAt);
  const removed = all.filter((g) => !!g.deletedAt);
  const needle = search.trim().toLowerCase();
  const shown = [...live, ...(showRemoved ? removed : [])].filter(
    (g) => !needle || g.name.toLowerCase().includes(needle),
  );
  const mine = live.find((g) => g.mine) ?? null;

  if (isLoading) return <ActivityIndicator size="large" style={{ marginTop: 32 }} />;
  if (error) return <LoadFailure error={error} onRetry={() => void refetch()} />;

  const others = (
    <View>
      <Text style={styles.sectionTitle}>{t('groupCard.otherGroups')}</Text>
      {live
        .filter((g) => g.id !== mine?.id)
        .map((g) => (
          <GroupCard key={g.id} group={g} openable={false} counts={canSeeEveryGroup} />
        ))}
    </View>
  );

  // A publisher with a group of his own: that group, and the others under it.
  if (!canSeeEveryGroup && mine) {
    return <GroupDetail id={mine.id} footer={live.length > 1 ? others : null} />;
  }

  const list = (
    <ScrollView
      style={split ? styles.listPane : styles.container}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {/* Search earns its place only when there are groups to search. */}
      {live.length > 8 ? (
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t('common.searchByName')}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}
      {shown.length === 0 ? (
        <Text style={styles.empty}>{search ? t('common.noMatches') : t('serviceGroups.noGroupsYet')}</Text>
      ) : null}
      {shown.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          openable={canSeeEveryGroup || g.mine === true}
          counts={canSeeEveryGroup}
          selected={split && g.id === (chosen ?? mine?.id ?? live[0]?.id)}
          onPress={split ? () => setChosen(g.id) : undefined}
        />
      ))}
      {canSeeEveryGroup && removed.length > 0 ? (
        <Pressable onPress={() => setShowRemoved((v) => !v)} hitSlop={6} style={styles.removedLine} testID="groups-removed">
          <Text style={styles.removedText}>
            {t('groupCard.removedCount', { count: removed.length })}
            <Text style={styles.link}>{`  ·  ${showRemoved ? t('groupCard.hide') : t('groupCard.show')}`}</Text>
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );

  if (!split) return list;
  const selectedId = chosen ?? mine?.id ?? live[0]?.id ?? null;
  return (
    <View style={styles.split}>
      {list}
      <View style={styles.detailPane}>
        {selectedId ? (
          <GroupDetail key={selectedId} id={selectedId} onRemoved={() => setChosen(null)} />
        ) : null}
      </View>
    </View>
  );
}

function GroupCard({
  group,
  openable,
  counts,
  selected,
  onPress,
}: {
  group: ServiceGroup;
  openable: boolean;
  /** Pioneers too — the elders place people between groups. */
  counts: boolean;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const isRemoved = !!group.deletedAt;
  const short = (name: string | undefined) => {
    if (!name) return '';
    const [last, first] = name.trim().split(/\s+/);
    return first ? `${last} ${first[0]}.` : last;
  };
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        isRemoved && styles.cardRemoved,
        !openable && styles.cardClosed,
        pressed && openable && styles.pressed,
      ]}
      disabled={!openable}
      onPress={onPress ?? (() => router.push(`/service-groups/${group.id}` as never))}
      testID={`group-card-${group.id}`}
    >
      <View style={styles.cardHead}>
        <Text style={[styles.name, isRemoved && styles.nameRemoved]}>{group.name}</Text>
        {/* «Твоя» — ответ на первый вопрос к списку групп: а я где. */}
        {group.mine ? <Text style={styles.mineTag}>{t('serviceGroups.mine')}</Text> : null}
        {isRemoved ? <Text style={styles.removedTag}>{t('common.removed')}</Text> : null}
        <View style={styles.flex} />
        {openable ? <Ionicons name="chevron-forward" size={16} color="#cbd5e1" /> : null}
      </View>
      {group.meetingLocation ? (
        <Text style={styles.meta} numberOfLines={1}>
          <Ionicons name="location-outline" size={13} color="#94a3b8" /> {group.meetingLocation}
        </Text>
      ) : null}
      {/* The servant of a group and his assistant are its point of contact;
          having to open every group to learn who they are was the complaint. */}
      {group.overseer || group.assistant ? (
        <Text style={styles.leaders} numberOfLines={2}>
          {group.overseer ? (
            <Text>
              <Text style={styles.leaderName}>{short(group.overseer.displayName)}</Text>
              {` · ${t('groupCard.overseerShort')}`}
            </Text>
          ) : null}
          {group.overseer && group.assistant ? '\n' : null}
          {group.assistant ? (
            <Text>
              <Text style={styles.leaderName}>{short(group.assistant.displayName)}</Text>
              {` · ${t('groupCard.assistantShort')}`}
            </Text>
          ) : null}
        </Text>
      ) : null}
      {group.memberCount != null && !isRemoved ? (
        <View style={styles.chips}>
          <Text style={styles.chip}>{t('groupCard.members', { count: group.memberCount })}</Text>
          {counts && group.pioneerCount ? (
            <Text style={[styles.chip, styles.chipPioneer]}>{t('groupCard.pioneers', { count: group.pioneerCount })}</Text>
          ) : null}
        </View>
      ) : null}
      {!openable ? <Text style={styles.closedHint}>{t('serviceGroups.otherGroupClosed')}</Text> : null}
    </Pressable>
  );
}

const INK = '#0f172a';
const SOFT = '#64748b';
const LINE = '#e2e8f0';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  flex: { flex: 1 },
  split: { flex: 1, flexDirection: 'row', gap: 4, backgroundColor: '#f1f5f9' },
  listPane: { width: 340, flexGrow: 0 },
  detailPane: { flex: 1 },
  listContent: { padding: 12, paddingBottom: 32, gap: 10 },
  search: {
    fontFamily: FONT.regular,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: LINE,
  },
  empty: { fontFamily: FONT.regular, textAlign: 'center', color: '#94a3b8', marginTop: 48, fontSize: 15 },
  sectionTitle: {
    fontFamily: FONT.extrabold,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: SOFT,
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 14, gap: 4, marginBottom: 10 },
  cardSelected: { borderWidth: 2, borderColor: '#7c3aed' },
  cardRemoved: { opacity: 0.6 },
  cardClosed: { backgroundColor: '#fbfcfe' },
  pressed: { opacity: 0.8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: FONT.extrabold, fontSize: 16.5, color: INK },
  nameRemoved: { textDecorationLine: 'line-through', color: SOFT },
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
    fontSize: 10.5,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  meta: { fontFamily: FONT.medium, fontSize: 13, color: SOFT },
  leaders: { fontFamily: FONT.medium, fontSize: 13, color: '#334155', lineHeight: 20, marginTop: 2 },
  leaderName: { fontFamily: FONT.bold, color: INK },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    fontFamily: FONT.bold,
    fontSize: 11.5,
    color: '#334155',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  chipPioneer: { color: '#166534', backgroundColor: '#dcfce7' },
  closedHint: { fontFamily: FONT.regular, fontSize: 12.5, color: '#94a3b8', marginTop: 4 },
  removedLine: { paddingHorizontal: 6, paddingVertical: 4 },
  removedText: { fontFamily: FONT.medium, fontSize: 12.5, color: '#94a3b8' },
  link: { fontFamily: FONT.bold, color: '#0369a1' },
});
