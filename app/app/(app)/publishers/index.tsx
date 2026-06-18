import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import i18n from '../../../lib/i18n';
import {
  extractErrorMessage,
  Publisher,
  publishersApi,
  ServiceGroup,
  serviceGroupsApi,
} from '../../../lib/api';
import { Ionicons } from '@expo/vector-icons';

type Filters = {
  groupId: string | 'none' | null;
  appointment: string | null;
  pioneerType: string | null;
  gender: 'brother' | 'sister' | null;
  isActive: boolean | null;
  departed: 'active' | 'departed' | null;
};

const EMPTY_FILTERS: Filters = {
  groupId: null,
  appointment: null,
  pioneerType: null,
  gender: null,
  isActive: null,
  departed: null,
};

function countActive(f: Filters): number {
  return (
    (f.groupId !== null ? 1 : 0) +
    (f.appointment !== null ? 1 : 0) +
    (f.pioneerType !== null ? 1 : 0) +
    (f.gender !== null ? 1 : 0) +
    (f.isActive !== null ? 1 : 0) +
    (f.departed !== null ? 1 : 0)
  );
}

export default function PublishersListScreen() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['publishers', search, 'with-removed'],
    queryFn: () =>
      publishersApi.list({
        limit: 200,
        search: search || undefined,
        includeRemoved: true,
      }),
  });

  const groupsQuery = useQuery({
    queryKey: ['service-groups', 'names'],
    queryFn: () => serviceGroupsApi.list({}),
  });
  const groups = useMemo(() => groupsQuery.data?.data ?? [], [groupsQuery.data]);
  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);
  const groupNameFor = (p: Publisher): string | null =>
    p.serviceGroupId ? groupNameById.get(p.serviceGroupId) ?? null : null;

  const activeCount = countActive(filters);

  const filtered = useMemo(() => {
    const all = data?.data ?? [];
    const matched =
      activeCount === 0
        ? all
        : all.filter((p) => {
            if (filters.groupId === 'none' && p.serviceGroupId != null)
              return false;
            if (
              filters.groupId &&
              filters.groupId !== 'none' &&
              p.serviceGroupId !== filters.groupId
            )
              return false;
            if (filters.appointment && p.appointment !== filters.appointment)
              return false;
            if (filters.pioneerType && p.pioneerType !== filters.pioneerType)
              return false;
            if (filters.gender && p.gender !== filters.gender) return false;
            if (filters.isActive !== null && p.isActive !== filters.isActive)
              return false;
            if (filters.departed === 'active' && p.deletedAt != null)
              return false;
            if (filters.departed === 'departed' && p.deletedAt == null)
              return false;
            return true;
          });
    return [...matched].sort(
      (a, b) => Number(!!a.deletedAt) - Number(!!b.deletedAt),
    );
  }, [data, filters, activeCount]);

  const allLoaded = data?.data ?? [];
  const currentCount = allLoaded.filter((p) => !p.deletedAt).length;
  const departedCount = allLoaded.length - currentCount;
  const countHeader = data ? (
    <Text style={styles.count}>
      {t('publishers.totalCount', { count: currentCount })}
      {departedCount > 0
        ? ' · ' + t('publishers.departedCount', { count: departedCount })
        : ''}
      {search || activeCount > 0
        ? ' ' + t('publishers.filteredCount', { count: filtered.length })
        : ''}
    </Text>
  ) : null;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t('publishers.search')}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.filterBtn, activeCount > 0 && styles.filterBtnActive]}
          onPress={() => setFilterOpen(true)}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={activeCount > 0 ? '#fff' : '#0369a1'}
          />
          {activeCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountText}>{activeCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{extractErrorMessage(error)}</Text>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator size="large" style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {search || activeCount > 0
                ? t('publishers.noMatches')
                : t('publishers.noPublishers')}
            </Text>
          }
          ListHeaderComponent={countHeader}
          renderItem={({ item }) => (
            <PublisherRow publisher={item} groupName={groupNameFor(item)} />
          )}
        />
      )}

      <FilterSheet
        visible={filterOpen}
        filters={filters}
        groups={groups}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
        onClose={() => setFilterOpen(false)}
      />
    </View>
  );
}

function PublisherRow({
  publisher,
  groupName,
}: {
  publisher: Publisher;
  groupName: string | null;
}) {
  const isRemoved = !!publisher.deletedAt;
  const removedLabel = publisher.removalReason
    ? i18n.t(`publishers.removal.${publisher.removalReason}`)
    : i18n.t('publishers.removedBadge');

  const tags: string[] = [];
  if (publisher.appointment === 'elder') tags.push(i18n.t('publishers.tags.elder'));
  if (publisher.appointment === 'ministerial_servant') tags.push(i18n.t('publishers.tags.ms'));
  if (publisher.pioneerType === 'regular') tags.push(i18n.t('publishers.tags.regularPioneer'));
  if (publisher.pioneerType === 'special') tags.push(i18n.t('publishers.tags.specialPioneer'));
  if (publisher.pioneerType === 'missionary') tags.push(i18n.t('publishers.tags.missionary'));
  if (publisher.isAnointed) tags.push(i18n.t('publishers.tags.anointed'));
  if (!publisher.isActive) tags.push(i18n.t('publishers.tags.inactive'));

  const initials =
    (publisher.firstName[0] ?? '') + (publisher.lastName[0] ?? '');

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        isRemoved && styles.rowRemoved,
      ]}
      onPress={() => router.push(`/publishers/${publisher.id}` as any)}
    >
      <View style={[styles.avatar, gendered(publisher.gender)]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, isRemoved && styles.nameRemoved]}>
            {publisher.displayName}
          </Text>
          {isRemoved && (
            <View style={styles.removedBadge}>
              <Text style={styles.removedBadgeText}>{removedLabel}</Text>
            </View>
          )}
        </View>
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
        {publisher.mobilePhone && (
          <Text style={styles.phone}>{publisher.mobilePhone}</Text>
        )}
        <View style={styles.groupLine}>
          <Ionicons
            name="people-outline"
            size={12}
            color={groupName ? '#64748b' : '#b45309'}
          />
          <Text style={[styles.groupText, !groupName && styles.groupTextNone]}>
            {groupName ?? i18n.t('serviceGroups.noGroup')}
          </Text>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterSheet({
  visible,
  filters,
  groups,
  onChange,
  onReset,
  onClose,
}: {
  visible: boolean;
  filters: Filters;
  groups: ServiceGroup[];
  onChange: (f: Filters) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    onChange({ ...filters, [key]: filters[key] === value ? null : value });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('publishers.filter.title')}</Text>
            <Pressable onPress={onReset} hitSlop={8}>
              <Text style={styles.resetText}>{t('publishers.filter.reset')}</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 460 }}>
            <Text style={styles.filterSection}>{t('publishers.filter.groupSection')}</Text>
            <View style={styles.chipWrap}>
              {groups.map((g) => (
                <Chip
                  key={g.id}
                  label={g.name}
                  active={filters.groupId === g.id}
                  onPress={() => set('groupId', g.id)}
                />
              ))}
              <Chip
                label={t('serviceGroups.noGroup')}
                active={filters.groupId === 'none'}
                onPress={() => set('groupId', 'none')}
              />
            </View>

            <Text style={styles.filterSection}>{t('publishers.filter.roleSection')}</Text>
            <View style={styles.chipWrap}>
              <Chip
                label={t('publishers.tags.elder')}
                active={filters.appointment === 'elder'}
                onPress={() => set('appointment', 'elder')}
              />
              <Chip
                label={t('publishers.tags.ms')}
                active={filters.appointment === 'ministerial_servant'}
                onPress={() => set('appointment', 'ministerial_servant')}
              />
            </View>

            <Text style={styles.filterSection}>{t('publishers.filter.pioneerSection')}</Text>
            <View style={styles.chipWrap}>
              <Chip
                label={t('publishers.tags.regularPioneer')}
                active={filters.pioneerType === 'regular'}
                onPress={() => set('pioneerType', 'regular')}
              />
              <Chip
                label={t('publishers.tags.specialPioneer')}
                active={filters.pioneerType === 'special'}
                onPress={() => set('pioneerType', 'special')}
              />
              <Chip
                label={t('publishers.tags.missionary')}
                active={filters.pioneerType === 'missionary'}
                onPress={() => set('pioneerType', 'missionary')}
              />
            </View>

            <Text style={styles.filterSection}>{t('publishers.filter.genderSection')}</Text>
            <View style={styles.chipWrap}>
              <Chip
                label={t('publishers.filter.brother')}
                active={filters.gender === 'brother'}
                onPress={() => set('gender', 'brother')}
              />
              <Chip
                label={t('publishers.filter.sister')}
                active={filters.gender === 'sister'}
                onPress={() => set('gender', 'sister')}
              />
            </View>

            <Text style={styles.filterSection}>{t('publishers.filter.statusSection')}</Text>
            <View style={styles.chipWrap}>
              <Chip
                label={t('publishers.filter.active')}
                active={filters.isActive === true}
                onPress={() => set('isActive', true)}
              />
              <Chip
                label={t('publishers.filter.inactive')}
                active={filters.isActive === false}
                onPress={() => set('isActive', false)}
              />
            </View>

            <Text style={styles.filterSection}>{t('publishers.filter.standingSection')}</Text>
            <View style={styles.chipWrap}>
              <Chip
                label={t('publishers.filter.current')}
                active={filters.departed === 'active'}
                onPress={() => set('departed', 'active')}
              />
              <Chip
                label={t('publishers.filter.departed')}
                active={filters.departed === 'departed'}
                onPress={() => set('departed', 'departed')}
              />
            </View>
          </ScrollView>

          <Pressable style={styles.applyBtn} onPress={onClose}>
            <Text style={styles.applyBtnText}>{t('publishers.filter.apply')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const gendered = (g: 'brother' | 'sister') => ({
  backgroundColor: g === 'brother' ? '#0ea5e9' : '#ec4899',
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  search: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  filterCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  count: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    color: '#64748b',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignItems: 'center',
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  rowRemoved: { opacity: 0.55 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  nameRemoved: { textDecorationLine: 'line-through', color: '#64748b' },
  removedBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  removedBadgeText: { color: '#92400e', fontSize: 10, fontWeight: '600' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, gap: 4 },
  tag: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: { color: '#0369a1', fontSize: 11, fontWeight: '500' },
  phone: { color: '#64748b', fontSize: 13, marginTop: 4 },
  groupLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  groupText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  groupTextNone: { color: '#b45309' },
  chevron: { color: '#cbd5e1', fontSize: 24, marginLeft: 8 },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: 48,
    fontSize: 15,
  },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14 },

  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: 28,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  resetText: { color: '#0ea5e9', fontSize: 15, fontWeight: '600' },
  filterSection: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  chipActive: { backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' },
  chipText: { fontSize: 14, color: '#475569', fontWeight: '500' },
  chipTextActive: { color: '#0369a1', fontWeight: '700' },
  applyBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
