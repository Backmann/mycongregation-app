import { useMemo, useState } from 'react';
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
import {
  Absence,
  absencesApi,
  PartSuggestion,
  Publisher,
  PublisherActivity,
  publisherActivityApi,
  publishersApi,
} from '../lib/api';
import { ActivitySummary, summarizeActivity } from '../lib/activity';
import { useTranslation } from 'react-i18next';

interface Props {
  label: string;
  value: string | null | undefined;
  /** Optional role icon shown in a tinted circle left of the label. */
  roleIcon?: keyof typeof Ionicons.glyphMap;
  /** Accent colour for the role icon circle. */
  roleColor?: string;
  onChange: (id: string | null) => void;
  excludeIds?: string[];
  /**
   * If set, the picker only shows publishers with this capability=true by default.
   * The user can toggle "Show all" inside the modal to override.
   */
  requiredCapability?: string;
  /** If set, only publishers of this gender are shown. */
  genderFilter?: 'sister' | 'brother';
  /** Optional per-publisher recent activity, keyed by publisher id. */
  activityById?: Map<string, PublisherActivity>;
  /** Current week (Monday ISO) — flags "this meeting" activity. */
  currentWeekStart?: string;
  /** Current meeting type — flags "this meeting" activity. */
  currentEventType?: string;
  /** Part keys (incl. equivalents) to fetch "last done" history for. */
  suggestionPartKeys?: string[];
  /** Which side this picker selects — affects the shown date and sorting. */
  suggestionRole?: 'primary' | 'assistant';
  /** For assistant pickers: the primary publisher whose recent partners to mark. */
  partnerOfPublisherId?: string | null;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Monday ISO + 6 days, as YYYY-MM-DD (string-comparable). */
function weekEndISO(weekStartISO: string): string {
  const d = new Date(`${weekStartISO}T00:00:00`);
  d.setDate(d.getDate() + 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Compact human range for an absence, e.g. "1–5 июля" or "30 июля – 2 августа". */
function absenceRangeLabel(a: Absence, loc: string): string {
  const start = new Date(`${a.startDate}T00:00:00`);
  if (!a.endDate) {
    return start.toLocaleDateString(loc, { day: 'numeric', month: 'long' });
  }
  const end = new Date(`${a.endDate}T00:00:00`);
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}\u2013${end.toLocaleDateString(loc, {
      day: 'numeric',
      month: 'long',
    })}`;
  }
  const s = start.toLocaleDateString(loc, { day: 'numeric', month: 'long' });
  const e = end.toLocaleDateString(loc, { day: 'numeric', month: 'long' });
  return `${s} \u2013 ${e}`;
}

/** Splits an ISO date into a short localized date + whole weeks ago. */
function lastDoneParts(
  iso: string,
  loc: string,
): { date: string; weeks: number } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    date: d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }),
    weeks: Math.max(
      0,
      Math.round((Date.now() - d.getTime()) / (7 * 24 * 3600 * 1000)),
    ),
  };
}

export function PublisherSelector({
  label,
  value,
  roleIcon,
  roleColor,
  onChange,
  excludeIds = [],
  requiredCapability,
  genderFilter,
  activityById,
  currentWeekStart,
  currentEventType,
  suggestionPartKeys,
  suggestionRole = 'primary',
  partnerOfPublisherId,
}: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({ limit: 200 }),
  });

  const allPublishers = data?.data ?? [];
  const selectedPublisher = allPublishers.find((p) => p.id === value);

  // --- Absence awareness (advisory) -------------------------------------
  const weekValid = !!currentWeekStart && ISO_RE.test(currentWeekStart);
  const { data: weekAbsData } = useQuery({
    queryKey: ['absences', 'week-warn'],
    queryFn: () => absencesApi.list(),
    enabled: weekValid,
    staleTime: 5 * 60 * 1000,
  });
  const absentThisWeek = useMemo(() => {
    const m = new Map<string, Absence>();
    if (!weekValid || !currentWeekStart || !weekAbsData) return m;
    const ws = currentWeekStart;
    const we = weekEndISO(ws);
    for (const a of weekAbsData) {
      const end = a.endDate ?? a.startDate;
      if (a.startDate <= we && end >= ws && !m.has(a.publisherId)) {
        m.set(a.publisherId, a);
      }
    }
    return m;
  }, [weekAbsData, currentWeekStart, weekValid]);
  const selectedAbsence = value ? absentThisWeek.get(value) : undefined;
  // ----------------------------------------------------------------------

  // --- Suggestions: when did each candidate last do this part ------------
  const suggKeys = suggestionPartKeys ?? [];
  const suggEnabled = weekValid && suggKeys.length > 0;
  const { data: suggData } = useQuery({
    queryKey: ['part-suggestions', currentWeekStart, suggKeys.join(',')],
    queryFn: () =>
      publisherActivityApi.getSuggestions({
        weekStart: currentWeekStart!,
        partKeys: suggKeys,
      }),
    enabled: suggEnabled,
    staleTime: 5 * 60 * 1000,
  });
  const suggestionById = useMemo(() => {
    const m = new Map<string, PartSuggestion>();
    for (const s of suggData ?? []) m.set(s.publisherId, s);
    return m;
  }, [suggData]);
  const lastDoneAt = (publisherId: string): string | null => {
    const s = suggestionById.get(publisherId);
    if (!s) return null;
    return suggestionRole === 'assistant'
      ? s.lastAssistantAt
      : s.lastPrimaryAt;
  };
  const partnerHistory = partnerOfPublisherId
    ? (suggestionById.get(partnerOfPublisherId)?.recentAssistants ?? [])
    : [];
  const recentPartnerWeekById = new Map<string, string>();
  for (const r of partnerHistory) {
    if (!recentPartnerWeekById.has(r.publisherId)) {
      recentPartnerWeekById.set(r.publisherId, r.weekStartDate);
    }
  }
  // ----------------------------------------------------------------------

  const filterByCapability = !!requiredCapability && !showAll;
  const capabilityLabel = requiredCapability
    ? t(`capabilities.items.${requiredCapability}`)
    : '';

  const filtered = allPublishers.filter((p) => {
    if (excludeIds.includes(p.id)) return false;
    if (genderFilter && p.gender !== genderFilter) return false;
    if (
      search !== '' &&
      !p.displayName.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (filterByCapability && !p.capabilities?.[requiredCapability!])
      return false;
    return true;
  });

  const sorted = suggEnabled
    ? [...filtered].sort((a, b) => {
        const da = lastDoneAt(a.id);
        const db = lastDoneAt(b.id);
        if (da === db) return a.displayName.localeCompare(b.displayName);
        if (da === null) return -1;
        if (db === null) return 1;
        return da.localeCompare(db);
      })
    : filtered;

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
        style={({ pressed }) => [
          styles.field,
          roleIcon && styles.fieldWithIcon,
          pressed && styles.fieldPressed,
        ]}
        onPress={() => setOpen(true)}
      >
        {roleIcon ? (
          <View
            style={[
              styles.roleIconWrap,
              { backgroundColor: `${roleColor ?? '#0d9488'}22` },
            ]}
          >
            <Ionicons name={roleIcon} size={18} color={roleColor ?? '#0d9488'} />
          </View>
        ) : null}
        <View style={styles.fieldMain}>
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
                {t('pickers.missingCapability', { capability: capabilityLabel })}
              </Text>
            </View>
          )}
        {selectedAbsence && (
          <View style={styles.absenceRow}>
            <Ionicons name="airplane" size={12} color="#b45309" />
            <Text style={styles.absenceText}>
              {t('absences.warnAway', {
                range: absenceRangeLabel(selectedAbsence, i18n.language),
              })}
            </Text>
          </View>
        )}
        </View>
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
                  <Text style={styles.modalCapName}>{capabilityLabel}</Text>
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
                    ? t('pickers.noPublishersWithCapability', { capability: capabilityLabel })
                    : t('pickers.noPublishers')}
                </Text>
              )}

              {sorted.map((p) => (
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
                  absence={absentThisWeek.get(p.id)}
                  lastDoneAt={suggEnabled ? lastDoneAt(p.id) : undefined}
                  partnerWeek={recentPartnerWeekById.get(p.id)}
                  eventTypeFilter={currentEventType}
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
  absence,
  lastDoneAt,
  partnerWeek,
  eventTypeFilter,
  onPress,
}: {
  publisher: Publisher;
  isSelected: boolean;
  hasCapability: boolean;
  showCapabilityWarning: boolean;
  activity?: ActivitySummary;
  absence?: Absence;
  /** ISO date they last did this part; null = never; undefined = hints off. */
  lastDoneAt?: string | null;
  /** ISO week when they were recently this primary’s partner. */
  partnerWeek?: string;
  /** When set, the expandable history shows only this meeting type. */
  eventTypeFilter?: string;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const busyThisMeeting = !!activity && activity.thisMeeting.length > 0;
  const recentItems = (activity?.recentItems ?? []).filter(
    (it) => !eventTypeFilter || it.eventType === eventTypeFilter,
  );
  const last = lastDoneAt ? lastDoneParts(lastDoneAt, i18n.language) : null;
  const partner = partnerWeek
    ? lastDoneParts(partnerWeek, i18n.language)
    : null;
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
        {absence && (
          <Text style={styles.optionAbsentText} numberOfLines={1}>
            {'\u2708 '}
            {t('absences.warnAway', {
              range: absenceRangeLabel(absence, i18n.language),
            })}
          </Text>
        )}
        {lastDoneAt !== undefined && (
          <Text style={styles.optionLastDone} numberOfLines={1}>
            {last
              ? t('pickers.lastDidPart', {
                  date: last.date,
                  ago: t('pickers.weeksAgoShort', { count: last.weeks }),
                })
              : t('pickers.neverDidPart')}
          </Text>
        )}
        {partner && (
          <Text style={styles.optionPartner} numberOfLines={1}>
            {t('pickers.recentPartner', { date: partner.date })}
          </Text>
        )}
        {busyThisMeeting && (
          <View style={styles.busyChipRow}>
            <Ionicons name="time" size={11} color="#b45309" />
            <Text style={styles.busyChipText} numberOfLines={1}>
              {t('publisherActivity.thisMeeting')}{' '}
              {activity!.thisMeeting.join(', ')}
            </Text>
          </View>
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
  fieldWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldMain: { flex: 1 },
  roleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
  absenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  absenceText: { fontSize: 11, color: '#b45309', flex: 1 },
  optionLastDone: { fontSize: 11, color: '#0369a1', marginTop: 2 },
  optionPartner: { fontSize: 11, color: '#7c3aed', marginTop: 2 },
  busyChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  busyChipText: { fontSize: 11, color: '#92400e', flexShrink: 1 },
  optionBusy: { backgroundColor: '#f0f9ff' },
  optionBusyText: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '600',
    marginLeft: 16,
    marginTop: 2,
  },
  optionAbsentText: {
    fontSize: 12,
    color: '#b45309',
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
