import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Publisher, PublisherActivity, publishersApi } from '../lib/api';
import { ActivitySummary, summarizeActivity } from '../lib/activity';
import { useTranslation } from 'react-i18next';

interface Props {
  label: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  excludeIds?: string[];
  /**
   * If set, the picker only shows publishers with this capability=true by default.
   * The user can toggle "Show all" inside the modal to override.
   */
  requiredCapability?: string;
  /** Optional per-publisher recent activity, keyed by publisher id. */
  activityById?: Map<string, PublisherActivity>;
  /** Current week (Monday ISO) — flags "this meeting" activity. */
  currentWeekStart?: string;
  /** Current meeting type — flags "this meeting" activity. */
  currentEventType?: string;
}

export function PublisherSelector({
  label,
  value,
  onChange,
  excludeIds = [],
  requiredCapability,
  activityById,
  currentWeekStart,
  currentEventType,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({ limit: 200 }),
  });

  const allPublishers = data?.data ?? [];
  const selectedPublisher = allPublishers.find((p) => p.id === value);

  const filterByCapability = !!requiredCapability && !showAll;

  const filtered = allPublishers.filter((p) => {
    if (excludeIds.includes(p.id)) return false;
    if (
      search !== '' &&
      !p.displayName.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (filterByCapability && !p.capabilities?.[requiredCapability!])
      return false;
    return true;
  });

  // Hidden count = those filtered out only because of capability mismatch
  const hiddenByCapability = filterByCapability
    ? allPublishers.filter(
        (p) =>
          !excludeIds.includes(p.id) &&
          (search === '' ||
            p.displayName.toLowerCase().includes(search.toLowerCase())) &&
          !p.capabilities?.[requiredCapability!],
      ).length
    : 0;

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.label}>{label}</Text>
        <View style={styles.row}>
          <Text
            style={[
              styles.value,
              !selectedPublisher && styles.valuePlaceholder,
            ]}
          >
            {selectedPublisher ? selectedPublisher.displayName : t('common.none')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </View>
        {selectedPublisher &&
          requiredCapability &&
          !selectedPublisher.capabilities?.[requiredCapability] && (
            <View style={styles.warningRow}>
              <Ionicons name="warning" size={12} color="#dc2626" />
              <Text style={styles.warningText}>
                {t('pickers.missingCapability', { capability: requiredCapability })}
              </Text>
            </View>
          )}
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{label}</Text>
              {requiredCapability && (
                <Text style={styles.modalSubtitle}>
                  {t('pickers.filteredByCapability')}{' '}
                  <Text style={styles.modalCapName}>{requiredCapability}</Text>
                </Text>
              )}
            </View>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={styles.doneText}>{t('common.done')}</Text>
            </Pressable>
          </View>

          {requiredCapability && (
            <Pressable
              style={styles.toggleRow}
              onPress={() => setShowAll((v) => !v)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>
                  {t('pickers.showAllOverride')}
                </Text>
                <Text style={styles.toggleHint}>
                  {showAll
                    ? t('pickers.showingAllNoFilter')
                    : t('pickers.hiddenByCapability', { count: hiddenByCapability })}
                </Text>
              </View>
              <Switch
                value={showAll}
                onValueChange={setShowAll}
                trackColor={{ false: '#e2e8f0', true: '#fde68a' }}
                thumbColor={showAll ? '#d97706' : '#f8fafc'}
              />
            </Pressable>
          )}

          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder={t('pickers.search')}
            placeholderTextColor="#cbd5e1"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {isLoading ? (
            <ActivityIndicator size="large" style={{ marginTop: 32 }} />
          ) : (
            <ScrollView
              style={styles.list}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={({ pressed }) => [
                  styles.option,
                  pressed && styles.optionPressed,
                ]}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Text style={styles.optionText}>{t('common.none')}</Text>
                {value == null && (
                  <Ionicons name="checkmark" size={20} color="#0ea5e9" />
                )}
              </Pressable>

              {filtered.length === 0 && (
                <Text style={styles.empty}>
                  {search !== ''
                    ? t('pickers.noMatches')
                    : filterByCapability
                    ? t('pickers.noPublishersWithCapability', { capability: requiredCapability ?? '' })
                    : t('pickers.noPublishers')}
                </Text>
              )}

              {filtered.map((p) => (
                <PublisherOption
                  key={p.id}
                  publisher={p}
                  isSelected={value === p.id}
                  hasCapability={
                    !requiredCapability ||
                    !!p.capabilities?.[requiredCapability]
                  }
                  showCapabilityWarning={
                    !!requiredCapability && showAll
                  }
                  onPress={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  activity={summarizeActivity(
                    activityById?.get(p.id),
                    currentWeekStart,
                    currentEventType,
                  )}
                />
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

function PublisherOption({
  publisher,
  isSelected,
  hasCapability,
  showCapabilityWarning,
  activity,
  onPress,
}: {
  publisher: Publisher;
  isSelected: boolean;
  hasCapability: boolean;
  showCapabilityWarning: boolean;
  activity?: ActivitySummary;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const busyThisMeeting = !!activity && activity.thisMeeting.length > 0;
  const recentItems = activity?.recentItems ?? [];
  return (
    <Pressable
      style={({ pressed }) => [
        styles.option,
        busyThisMeeting && styles.optionBusy,
        pressed && styles.optionPressed,
      ]}
      onPress={onPress}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.optionMain}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor:
                  publisher.gender === 'brother' ? '#0ea5e9' : '#ec4899',
              },
            ]}
          />
          <Text style={styles.optionText}>{publisher.displayName}</Text>
          {showCapabilityWarning && !hasCapability && (
            <View style={styles.optionWarn}>
              <Ionicons name="warning" size={11} color="#dc2626" />
            </View>
          )}
        </View>
        {busyThisMeeting && (
          <Text style={styles.optionBusyText} numberOfLines={1}>
            {t('publisherActivity.thisMeeting')}{' '}
            {activity!.thisMeeting.join(', ')}
          </Text>
        )}
        {recentItems.length > 0 && (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              setExpanded((v) => !v);
            }}
            hitSlop={6}
            style={styles.recentToggle}
          >
            <Text style={styles.optionRecentText}>
              {t('publisherActivity.recent', { count: recentItems.length })}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={12}
              color="#94a3b8"
            />
          </Pressable>
        )}
        {expanded &&
          recentItems.map((it, i) => (
            <Text key={i} style={styles.historyRow} numberOfLines={1}>
              {it.weekStartDate.slice(8, 10)}.{it.weekStartDate.slice(5, 7)} ·{' '}
              {it.label}
            </Text>
          ))}
      </View>
      {isSelected && <Ionicons name="checkmark" size={20} color="#0ea5e9" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  fieldPressed: { backgroundColor: '#f8fafc' },
  label: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontSize: 16, color: '#0f172a' },
  valuePlaceholder: { color: '#cbd5e1' },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  warningText: { fontSize: 11, color: '#dc2626' },
  optionBusy: { backgroundColor: '#f0f9ff' },
  optionBusyText: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '600',
    marginLeft: 16,
    marginTop: 2,
  },
  optionRecentText: { fontSize: 12, color: '#94a3b8' },
  recentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 16,
    marginTop: 2,
  },
  historyRow: { fontSize: 11, color: '#64748b', marginLeft: 16, marginTop: 2 },

  modal: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    ...(Platform.OS === 'web' && { paddingTop: 0 }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  modalSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  modalCapName: { color: '#0369a1', fontWeight: '500' },
  doneText: { color: '#0ea5e9', fontSize: 16, fontWeight: '600' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  toggleLabel: { fontSize: 13, color: '#78350f', fontWeight: '500' },
  toggleHint: { fontSize: 11, color: '#92400e', marginTop: 2 },

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

  list: { flex: 1, backgroundColor: '#fff' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  optionPressed: { backgroundColor: '#f8fafc' },
  optionMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  optionText: { fontSize: 15, color: '#0f172a' },
  optionWarn: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: 32,
    fontSize: 14,
  },
});
