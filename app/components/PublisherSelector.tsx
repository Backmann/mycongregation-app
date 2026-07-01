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
import { PersonChip } from './PersonChip';
import {
  Absence,
  absencesApi,
  ActivityItem,
  Publisher,
  PublisherActivity,
  publishersApi,
  meetingSettingsApi,
} from '../lib/api';
import { ActivitySummary, summarizeActivity } from '../lib/activity';
import { effectiveVersionFor, meetingDate } from '../lib/meeting-schedule';
import { useTranslation } from 'react-i18next';

interface Props {
  label: string;
  value: string | null | undefined;
  /** Render as a bordered input box (for plain backgrounds like dialogs). */
  boxed?: boolean;
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
  /** If set, only publishers with this appointment are shown (hard filter). */
  appointmentFilter?: 'elder' | 'ministerial_servant';
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
  /** For assistant pickers: soft-filter to the same gender as this publisher; "Show all" reveals others (e.g. family). */
  matchGenderOfPublisherId?: string | null;
  /** When set, scoped history shows this duty type (instead of part keys). */
  scopeDutyType?: string;
  /** Soft-filter to this appointment (e.g. 'elder'); "Show all" reveals others. */
  preferAppointment?: 'elder' | 'ministerial_servant';
  /** Resting trigger style: 'field' (bordered, default) or 'chip' (program-style). */
  variant?: 'field' | 'chip';
  /** Label for the empty chip in chip variant. Defaults to common.none. */
  emptyLabel?: string;
  /** Optional extra info line under each candidate (e.g. rotation stats). */
  rowMeta?: (publisherId: string) => string | null;
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

/** ISO YYYY-MM-DD -> dd.MM.yyyy (locale-independent full date). */
function fmtFullDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

export function PublisherSelector({
  label,
  value,
  boxed = false,
  roleIcon,
  roleColor,
  onChange,
  excludeIds = [],
  requiredCapability,
  genderFilter,
  appointmentFilter,
  activityById,
  currentWeekStart,
  currentEventType,
  suggestionPartKeys,
  suggestionRole = 'primary',
  partnerOfPublisherId,
  matchGenderOfPublisherId,
  scopeDutyType,
  preferAppointment,
  variant = 'field',
  emptyLabel,
  rowMeta,
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
  const { data: msOverview } = useQuery({
    queryKey: ['meeting-settings', 'overview'],
    queryFn: () => meetingSettingsApi.getOverview(),
    enabled: weekValid,
    staleTime: 10 * 60 * 1000,
  });
  // Exact calendar date of the meeting being assigned (midweek vs weekend),
  // so an absence only warns on the day it actually covers.
  const meetingDayISO = useMemo(() => {
    if (!weekValid || !currentWeekStart) return null;
    const v = effectiveVersionFor(msOverview?.versions, currentWeekStart);
    if (!v) return null;
    const dow = currentEventType === 'weekend' ? v.weekendDow : v.midweekDow;
    if (!dow) return null;
    const d = meetingDate(new Date(`${currentWeekStart}T00:00:00`), dow);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }, [msOverview, currentWeekStart, currentEventType, weekValid]);
  const absentThisWeek = useMemo(() => {
    const m = new Map<string, Absence>();
    if (!weekValid || !currentWeekStart || !weekAbsData) return m;
    const ws = currentWeekStart;
    const we = weekEndISO(ws);
    for (const a of weekAbsData) {
      const end = a.endDate ?? a.startDate;
      // Prefer the specific meeting day; if it can't be resolved (no settings),
      // fall back to overlapping the whole week.
      const hit = meetingDayISO
        ? a.startDate <= meetingDayISO && end >= meetingDayISO
        : a.startDate <= we && end >= ws;
      if (hit && !m.has(a.publisherId)) {
        m.set(a.publisherId, a);
      }
    }
    return m;
  }, [weekAbsData, currentWeekStart, weekValid, meetingDayISO]);
  const selectedAbsence = value ? absentThisWeek.get(value) : undefined;
  // ----------------------------------------------------------------------

  // --- Scope keys for part-scoped history -------------------------------
  const suggKeys = suggestionPartKeys ?? [];

  // --- Scoped history + pairing (always-visible, ~3 months) --------------
  const scopeKeySet = new Set(suggKeys);
  const historyEnabled = scopeKeySet.size > 0 || !!scopeDutyType;
  const partnerName = partnerOfPublisherId
    ? allPublishers.find((p) => p.id === partnerOfPublisherId)?.displayName
    : undefined;
  const primaryItems: ActivityItem[] = partnerOfPublisherId
    ? (activityById?.get(partnerOfPublisherId)?.items ?? [])
    : [];
  const inScopePart = (it: ActivityItem) =>
    it.kind === 'part' && !!it.partKey && scopeKeySet.has(it.partKey);

  // Distinct ISO weeks (newest first) the candidate did this exact part/duty.
  const thisItemDatesFor = (pubId: string): string[] => {
    const items = activityById?.get(pubId)?.items ?? [];
    const weeks = items
      .filter((it) =>
        scopeDutyType
          ? it.kind === 'duty' && it.dutyType === scopeDutyType
          : inScopePart(it) && it.role === suggestionRole,
      )
      .map((it) => it.weekStartDate);
    return Array.from(new Set(weeks)).sort((a, b) => b.localeCompare(a));
  };

  // Distinct ISO weeks (newest first) the candidate was paired with the
  // primary on the same part instance (one led, the other assisted).
  const pairDatesFor = (pubId: string): string[] => {
    if (!partnerOfPublisherId || scopeDutyType) return [];
    const candByKey = new Map<string, string>();
    for (const it of activityById?.get(pubId)?.items ?? []) {
      if (inScopePart(it) && it.role) {
        candByKey.set(`${it.partKey}|${it.weekStartDate}`, it.role);
      }
    }
    const weeks: string[] = [];
    for (const it of primaryItems) {
      if (inScopePart(it) && it.role) {
        const cr = candByKey.get(`${it.partKey}|${it.weekStartDate}`);
        if (cr && cr !== it.role) weeks.push(it.weekStartDate);
      }
    }
    return Array.from(new Set(weeks)).sort((a, b) => b.localeCompare(a));
  };
  // ----------------------------------------------------------------------

  const matchGender =
    matchGenderOfPublisherId != null
      ? (allPublishers.find((p) => p.id === matchGenderOfPublisherId)?.gender ??
        null)
      : null;
  const softGenderActive = matchGender != null && !showAll;
  const softApptActive = !!preferAppointment && !showAll;

  const filterByCapability = !!requiredCapability && !showAll;
  const capabilityLabel = requiredCapability
    ? t(`capabilities.items.${requiredCapability}`)
    : '';

  const filtered = allPublishers.filter((p) => {
    if (excludeIds.includes(p.id)) return false;
    if (genderFilter && p.gender !== genderFilter) return false;
    if (appointmentFilter && p.appointment !== appointmentFilter) return false;
    if (softGenderActive && p.gender !== matchGender) return false;
    if (softApptActive && p.appointment !== preferAppointment) return false;
    if (
      search !== '' &&
      !p.displayName.toLowerCase().includes(search.toLowerCase())
    )
      return false;
    if (filterByCapability && !p.capabilities?.[requiredCapability!])
      return false;
    return true;
  });

  // Precompute each candidate's 3-month history once (drives sort + chips,
  // so the order always matches what's shown).
  const itemDatesById = new Map<string, string[]>();
  const pairDatesById = new Map<string, string[]>();
  const busyThisMeeting = new Set<string>();
  for (const p of filtered) {
    itemDatesById.set(p.id, thisItemDatesFor(p.id));
    if (partnerOfPublisherId) pairDatesById.set(p.id, pairDatesFor(p.id));
    const items = activityById?.get(p.id)?.items ?? [];
    if (
      currentWeekStart != null &&
      items.some(
        (it) =>
          it.weekStartDate === currentWeekStart &&
          (currentEventType == null || it.eventType === currentEventType),
      )
    ) {
      busyThisMeeting.add(p.id);
    }
  }

  // Order: available candidates first (those absent this week or already
  // assigned elsewhere in this meeting sink to the bottom), and within each
  // group float up whoever least-recently (or never) did this exact
  // part/duty — or, for assistant pickers, was least-recently paired with the
  // primary. Empty/undefined (never, in 3 months) ranks first.
  const sorted = historyEnabled
    ? [...filtered].sort((a, b) => {
        const aAbsent = absentThisWeek.has(a.id) ? 1 : 0;
        const bAbsent = absentThisWeek.has(b.id) ? 1 : 0;
        if (aAbsent !== bAbsent) return aAbsent - bAbsent;
        const aBusy = busyThisMeeting.has(a.id) ? 1 : 0;
        const bBusy = busyThisMeeting.has(b.id) ? 1 : 0;
        if (aBusy !== bBusy) return aBusy - bBusy;
        if (partnerOfPublisherId) {
          const pa = pairDatesById.get(a.id)?.[0];
          const pb = pairDatesById.get(b.id)?.[0];
          if (pa !== pb) {
            if (!pa) return -1;
            if (!pb) return 1;
            return pa.localeCompare(pb);
          }
        }
        const da = itemDatesById.get(a.id)?.[0] ?? null;
        const db = itemDatesById.get(b.id)?.[0] ?? null;
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

  const warnings = (
    <>
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
    </>
  );

  return (
    <>
      {variant === 'chip' ? (
        <Pressable
          style={({ pressed }) => [
            styles.chipTrigger,
            pressed && styles.chipPressed,
          ]}
          onPress={() => setOpen(true)}
        >
          {selectedPublisher ? (
            <PersonChip label={selectedPublisher.displayName} variant="main" />
          ) : (
            <PersonChip label={emptyLabel ?? t('common.none')} variant="empty" />
          )}
          {warnings}
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.field,
            roleIcon && styles.fieldWithIcon,
            boxed && styles.fieldBoxed,
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
            {warnings}
          </View>
        </Pressable>
      )}

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

          {(requiredCapability || matchGender || preferAppointment) && (
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
                    : preferAppointment && !requiredCapability && !matchGender
                      ? t('pickers.showingElders')
                      : t('pickers.hiddenByCapability', {
                          count: hiddenByCapability,
                        })}
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

          {historyEnabled && (
            <View style={styles.histScopeNote}>
              <Ionicons name="calendar-outline" size={13} color="#64748b" />
              <Text style={styles.histScopeText}>
                {t('pickers.historyScope')}
              </Text>
            </View>
          )}

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
                  meta={rowMeta?.(p.id) ?? undefined}
                  showHistory={historyEnabled}
                  historyKind={scopeDutyType ? 'duty' : 'part'}
                  thisItemDates={itemDatesById.get(p.id) ?? []}
                  pairDates={pairDatesById.get(p.id) ?? []}
                  pairWithName={partnerName}
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
  meta,
  showHistory,
  historyKind,
  thisItemDates,
  pairDates,
  pairWithName,
  onPress,
}: {
  publisher: Publisher;
  isSelected: boolean;
  hasCapability: boolean;
  showCapabilityWarning: boolean;
  activity?: ActivitySummary;
  absence?: Absence;
  /** Optional gray info line under the name (e.g. rotation stats). */
  meta?: string;
  /** Whether to show the always-visible scoped-history block. */
  showHistory?: boolean;
  /** Whether the scoped item is a program part or a duty. */
  historyKind?: 'part' | 'duty';
  /** ISO weeks the candidate did this exact part/duty (~3 months, newest first). */
  thisItemDates?: string[];
  /** ISO weeks the candidate was paired with the primary (~3 months). */
  pairDates?: string[];
  /** Primary's name; presence enables the pairing line (assistant picker). */
  pairWithName?: string;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const busyThisMeeting = !!activity && activity.thisMeeting.length > 0;
  const itemDates = thisItemDates ?? [];
  const pdates = pairDates ?? [];
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
        {meta ? (
          <Text style={styles.optionMetaText} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {absence && (
          <Text style={styles.optionAbsentText} numberOfLines={1}>
            {'\u2708 '}
            {t('absences.warnAway', {
              range: absenceRangeLabel(absence, i18n.language),
            })}
          </Text>
        )}
        {showHistory && (
          <View style={styles.histRow}>
            <Ionicons
              name="time-outline"
              size={12}
              color="#475569"
              style={styles.histIcon}
            />
            <View style={styles.chipsWrap}>
              <Text style={styles.histLabel}>
                {t(
                  historyKind === 'duty'
                    ? 'pickers.histThisDuty'
                    : 'pickers.histThisPart',
                )}
              </Text>
              {itemDates.length > 0 ? (
                itemDates.map((d) => (
                  <View key={d} style={[styles.chip, styles.chipBusy]}>
                    <Text style={styles.chipBusyText}>{fmtFullDate(d)}</Text>
                  </View>
                ))
              ) : (
                <View style={[styles.chip, styles.chipFresh]}>
                  <Ionicons name="checkmark" size={10} color="#0F6E56" />
                  <Text style={styles.chipFreshText}>
                    {t('pickers.histNever')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
        {pairWithName !== undefined && (
          <View style={styles.histRow}>
            <Ionicons
              name="people-outline"
              size={12}
              color="#7c3aed"
              style={styles.histIcon}
            />
            <View style={styles.chipsWrap}>
              <Text style={styles.histLabel}>
                {t('pickers.histPairWith', { name: pairWithName })}
              </Text>
              {pdates.length > 0 ? (
                pdates.map((d) => (
                  <View key={d} style={[styles.chip, styles.chipPair]}>
                    <Text style={styles.chipPairText}>{fmtFullDate(d)}</Text>
                  </View>
                ))
              ) : (
                <View style={[styles.chip, styles.chipFresh]}>
                  <Ionicons name="checkmark" size={10} color="#0F6E56" />
                  <Text style={styles.chipFreshText}>
                    {t('pickers.histNever')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
        {busyThisMeeting && (
          <View style={styles.busyChipRow}>
            <Ionicons name="time" size={11} color="#b45309" />
            <Text style={styles.busyChipText}>
              {t('publisherActivity.thisMeeting')}{' '}
              {activity!.thisMeeting.join(', ')}
            </Text>
          </View>
        )}
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
  fieldBoxed: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderBottomColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 2,
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
  chipTrigger: { alignSelf: 'flex-start', gap: 4 },
  chipPressed: { opacity: 0.6 },
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
    alignItems: 'flex-start',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  busyChipText: { fontSize: 11, color: '#92400e', flexShrink: 1, lineHeight: 15 },
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
  optionMetaText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    marginLeft: 18,
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
  histRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 3,
    marginLeft: 16,
  },
  histIcon: { marginTop: 1 },
  chipsWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  histLabel: { fontSize: 11, color: '#94a3b8' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  chipBusy: { backgroundColor: '#faeeda' },
  chipBusyText: { fontSize: 11, color: '#854f0b' },
  chipPair: { backgroundColor: '#eeedfe' },
  chipPairText: { fontSize: 11, color: '#3c3489' },
  chipFresh: { backgroundColor: '#e1f5ee' },
  chipFreshText: { fontSize: 11, color: '#0f6e56' },
  histScopeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 8,
    marginTop: -4,
  },
  histScopeText: { fontSize: 11, color: '#64748b' },

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
