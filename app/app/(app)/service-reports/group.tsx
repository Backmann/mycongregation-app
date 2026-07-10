import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import {
  extractErrorMessage,
  GroupReportRow,
  publishersApi,
  PublisherStatus,
  serviceReportsApi,
} from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useTranslation } from 'react-i18next';
import { formatMonthLabel } from '../../../lib/i18n';

/** Compact date like "8 июл." for the who/when byline. */
function formatByline(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return '';
  }
}

// Reportable months: from last month back to January 2025 (reports are kept
// forever, so history stays reachable). The current month is excluded — it
// hasn't finished, so its report can't be submitted yet.
function getReportableMonths(): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  let y = now.getFullYear();
  let m = now.getMonth(); // 0-based; start at last month (current - 1)
  m -= 1;
  if (m < 0) {
    m = 11;
    y -= 1;
  }
  while (y > 2025 || (y === 2025 && m >= 0)) {
    const yyyy = y;
    const mm = String(m + 1).padStart(2, '0');
    months.push({
      value: `${yyyy}-${mm}`,
      label: formatMonthLabel(`${yyyy}-${mm}`),
    });
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return months;
}

export default function GroupReportsScreen() {
  const { t, i18n: i18nInstance } = useTranslation();
  // formatMonthLabel reads global i18next state — re-memoize when language changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recentMonths = useMemo(() => getReportableMonths(), [i18nInstance.language]);
  // Default to the previous completed month (first in the list now).
  const [reportMonth, setReportMonth] = useState(
    recentMonths[0].value,
  );

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['service-reports', 'group', reportMonth],
    queryFn: () => serviceReportsApi.findGroup(reportMonth),
  });

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canOverride = user?.role === 'admin' || user?.role === 'elder';
  const [overrideTarget, setOverrideTarget] = useState<{
    publisherId: string;
    displayName: string;
  } | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  // Groups collapsed by default; the caller's own group starts expanded.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [collapseInitialized, setCollapseInitialized] = useState(false);
  // Threshold (months in a row without a report) for the "missed" flag.
  const [missedThreshold, setMissedThreshold] = useState(3);

  // Fetch all publishers separately to get status + statusManuallyOverridden.
  // The group endpoint doesn't include these fields, so we merge client-side.
  const publishersQuery = useQuery({
    queryKey: ['publishers', 'list', 'for-status'],
    queryFn: () => publishersApi.list({ limit: 500 }),
  });

  const statusMap = useMemo(() => {
    const m = new Map<
      string,
      { status: PublisherStatus; manuallyOverridden: boolean }
    >();
    for (const p of publishersQuery.data?.data ?? []) {
      m.set(p.id, {
        status: ((p as any).status ?? 'inactive') as PublisherStatus,
        manuallyOverridden: !!(p as any).statusManuallyOverridden,
      });
    }
    return m;
  }, [publishersQuery.data]);

  const overrideMutation = useMutation({
    mutationFn: ({
      publisherId,
      status,
    }: {
      publisherId: string;
      status: PublisherStatus;
    }) => publishersApi.overrideStatus(publisherId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      setOverrideTarget(null);
    },
  });

  const clearOverrideMutation = useMutation({
    mutationFn: (publisherId: string) =>
      publishersApi.clearOverride(publisherId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      setOverrideTarget(null);
    },
  });

  const aggregate = useMemo(() => {
    if (!data) return { total: 0, submitted: 0, served: 0 };
    let submitted = 0;
    let served = 0;
    for (const row of data.publishers) {
      if (row.report) {
        submitted++;
        const reported =
          row.report.servedThisMonth === true ||
          (row.report.hoursReported !== null && row.report.hoursReported > 0);
        if (reported) served++;
      }
    }
    return { total: data.publishers.length, submitted, served };
  }, [data]);

  // Group publishers into sections by service group, each with a submitted
  // count for the header. Preserves the server order; ungrouped go last.
  const sections = useMemo(() => {
    const rows = data?.publishers ?? [];
    const out: {
      title: string;
      groupId: string | null;
      groupKey: string;
      submitted: number;
      total: number;
      collapsed: boolean;
      data: typeof rows;
    }[] = [];
    for (const row of rows) {
      const key = row.groupId ?? '__none__';
      let sec = out.find((s) => s.groupKey === key);
      if (!sec) {
        sec = {
          title: row.groupName ?? t('reports.group.noGroup'),
          groupId: row.groupId,
          groupKey: key,
          submitted: 0,
          total: 0,
          collapsed: false,
          data: [],
        };
        out.push(sec);
      }
      sec.total++;
      if (row.report) sec.submitted++;
    }
    // Fill rows only for expanded groups; collapsed groups keep just the header.
    for (const sec of out) {
      sec.collapsed = collapsedGroups.has(sec.groupKey);
      sec.data = sec.collapsed
        ? []
        : rows.filter((r) => (r.groupId ?? '__none__') === sec.groupKey);
    }
    // Ungrouped section (if any) goes last.
    return out.sort((a, b) => {
      if (a.groupId === null) return 1;
      if (b.groupId === null) return -1;
      return 0;
    });
  }, [data, t, collapsedGroups]);

  // Initialize collapse state once data arrives: collapse everything except
  // the caller's own group.
  useEffect(() => {
    if (!data || collapseInitialized) return;
    const allKeys = new Set<string>();
    for (const p of data.publishers) allKeys.add(p.groupId ?? '__none__');
    if (data.myGroupId) allKeys.delete(data.myGroupId);
    setCollapsedGroups(allKeys);
    setCollapseInitialized(true);
  }, [data, collapseInitialized]);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.title.group') }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    const message = extractErrorMessage(error);
    const isForbidden = /403|forbid|authoriz/i.test(message);
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.title.group') }} />
        <Ionicons
          name={isForbidden ? 'lock-closed-outline' : 'alert-circle-outline'}
          size={64}
          color="#cbd5e1"
        />
        <Text style={styles.errorTitle}>
          {isForbidden ? t('audit.notAuthorized') : t('reports.group.couldNotLoad')}
        </Text>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('reports.title.group') }} />
      <View style={styles.header}>
        {data?.scopeLabel && (
          <Text style={styles.scopeLabel}>{data.scopeLabel === 'Congregation' ? t('reports.group.scopeCongregation') : data.scopeLabel}</Text>
        )}
        <Pressable
          style={styles.monthPickerBtn}
          onPress={() => setMonthPickerOpen(true)}
        >
          <Ionicons name="calendar-outline" size={16} color="#0ea5e9" />
          <Text style={styles.monthPickerBtnText}>
            {recentMonths.find((m) => m.value === reportMonth)?.label ??
              reportMonth}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#64748b" />
        </Pressable>

        <Modal
          visible={monthPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMonthPickerOpen(false)}
        >
          <Pressable
            style={styles.monthModalOverlay}
            onPress={() => setMonthPickerOpen(false)}
          >
            <View style={styles.monthModalCard}>
              <Text style={styles.monthModalTitle}>
                {t('reports.group.pickMonth')}
              </Text>
              <ScrollView style={{ maxHeight: 360 }}>
                {recentMonths.map((m) => {
                  const isActive = reportMonth === m.value;
                  return (
                    <Pressable
                      key={m.value}
                      onPress={() => {
                        setReportMonth(m.value);
                        setMonthPickerOpen(false);
                      }}
                      style={[
                        styles.monthModalRow,
                        isActive && styles.monthModalRowActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.monthModalRowText,
                          isActive && styles.monthModalRowTextActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                      {isActive ? (
                        <Ionicons
                          name="checkmark"
                          size={18}
                          color="#0ea5e9"
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>

        <View style={styles.statsBar}>
          <View style={styles.statBox}>
            <Text style={styles.statBig}>{aggregate.submitted}</Text>
            <Text style={styles.statLabel}>
              {t('reports.group.ofReported', { total: aggregate.total })}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statBig, styles.statActive]}>
              {aggregate.served}
            </Text>
            <Text style={styles.statLabel}>{t('reports.group.active')}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statBig, styles.statPending]}>
              {aggregate.total - aggregate.submitted}
            </Text>
            <Text style={styles.statLabel}>{t('reports.group.pending')}</Text>
          </View>
        </View>

        <View style={styles.thresholdRow}>
          <Ionicons name="alert-circle-outline" size={15} color="#94a3b8" />
          <Text style={styles.thresholdLabel}>
            {t('reports.group.flagMissed')}
          </Text>
          {[2, 3, 4, 0].map((v) => {
            const isActive = missedThreshold === v;
            return (
              <Pressable
                key={v}
                onPress={() => setMissedThreshold(v)}
                style={[
                  styles.thresholdChip,
                  isActive && styles.thresholdChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.thresholdChipText,
                    isActive && styles.thresholdChipTextActive,
                  ]}
                >
                  {v === 0 ? t('reports.group.flagOff') : `${v}+`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.publisherId}
        contentContainerStyle={{ paddingBottom: 32 }}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>{t('reports.group.noPublishersInScope')}</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Pressable
            style={styles.groupHeader}
            onPress={() => toggleGroup(section.groupKey)}
          >
            <Ionicons
              name={section.collapsed ? 'chevron-forward' : 'chevron-down'}
              size={18}
              color="#64748b"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.groupHeaderName}>{section.title}</Text>
            <View style={{ flex: 1 }} />
            <Text
              style={[
                styles.groupHeaderCount,
                section.submitted === section.total &&
                  section.total > 0 &&
                  styles.groupHeaderCountDone,
              ]}
            >
              {t('reports.group.submittedOfTotal', {
                submitted: section.submitted,
                total: section.total,
              })}
            </Text>
          </Pressable>
        )}
        renderItem={({ item }) => (
          <PublisherRow
            row={item}
            statusInfo={statusMap.get(item.publisherId) ?? null}
            missedThreshold={missedThreshold}
            canOverride={canOverride}
            onOverride={
              canOverride
                ? () =>
                    setOverrideTarget({
                      publisherId: item.publisherId,
                      displayName: item.displayName,
                    })
                : undefined
            }
            onTapHistory={() =>
              router.push(
                `/service-reports/publisher-history?publisherId=${item.publisherId}&displayName=${encodeURIComponent(item.displayName)}` as any,
              )
            }
            onAddOnBehalf={
              item.canManage
                ? (row) =>
                    router.push({
                      pathname: '/service-reports/new',
                      params: {
                        publisherId: row.publisherId,
                        onBehalfName: row.displayName,
                        onBehalfIsPioneer: row.isPioneer ? '1' : '0',
                        reportMonth,
                      },
                    } as any)
                : undefined
            }
            onEdit={
              item.canManage && item.report
                ? () =>
                    router.push(
                      `/service-reports/new?id=${item.report!.id}` as any,
                    )
                : undefined
            }
          />
        )}
      />
      <OverrideStatusModal
        target={overrideTarget}
        currentStatus={
          overrideTarget
            ? statusMap.get(overrideTarget.publisherId)?.status ?? 'inactive'
            : 'inactive'
        }
        isOverridden={
          overrideTarget
            ? statusMap.get(overrideTarget.publisherId)?.manuallyOverridden ??
              false
            : false
        }
        onCancel={() => setOverrideTarget(null)}
        onSave={(status) =>
          overrideTarget &&
          overrideMutation.mutate({
            publisherId: overrideTarget.publisherId,
            status,
          })
        }
        onClear={() =>
          overrideTarget &&
          clearOverrideMutation.mutate(overrideTarget.publisherId)
        }
        isSaving={
          overrideMutation.isPending || clearOverrideMutation.isPending
        }
      />
    </View>
  );
}

function PublisherRow({
  row,
  statusInfo,
  canOverride,
  onOverride,
  onTapHistory,
  onAddOnBehalf,
  onEdit,
  missedThreshold,
}: {
  row: GroupReportRow;
  statusInfo: { status: PublisherStatus; manuallyOverridden: boolean } | null;
  canOverride: boolean;
  onOverride?: () => void;
  onTapHistory?: () => void;
  onAddOnBehalf?: (row: GroupReportRow) => void;
  onEdit?: () => void;
  missedThreshold: number;
}) {
  const { t } = useTranslation();
  const { report, displayName, isPioneer } = row;

  const hasActivity =
    !!report &&
    (report.servedThisMonth === true ||
      (report.hoursReported !== null && report.hoursReported > 0));

  const status: 'reported-active' | 'reported-none' | 'pending' = !report
    ? 'pending'
    : hasActivity
      ? 'reported-active'
      : 'reported-none';

  const summary = !report
    ? t('reports.group.noReportYet')
    : isPioneer && report.hoursReported !== null
      ? t('reports.hoursLong', { count: report.hoursReported })
      : report.servedThisMonth === true
        ? t('reports.served')
        : t('reports.didNotServe');

  const showAddBtn = status === 'pending' && !!onAddOnBehalf;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onTapHistory}
        disabled={!onTapHistory}
        style={styles.rowMain}
      >
      <View
        style={[
          styles.indicator,
          status === 'reported-active' && styles.indicatorActive,
          status === 'reported-none' && styles.indicatorNone,
          status === 'pending' && styles.indicatorPending,
        ]}
      />
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
            {isPioneer && (
              <Text style={styles.pioneerTag}>{t('reports.pioneerInline')}</Text>
            )}
          </Text>
          {statusInfo && (
            <View
              style={[
                styles.statusBadge,
                statusInfo.status === 'active' && styles.badgeActive,
                statusInfo.status === 'irregular' && styles.badgeIrregular,
                statusInfo.status === 'inactive' && styles.badgeInactive,
              ]}
            >
              <Text style={styles.statusBadgeText}>{t(`publishers.status.${statusInfo.status}`)}</Text>
              {statusInfo.manuallyOverridden && (
                <Ionicons
                  name="lock-closed"
                  size={9}
                  color="#fff"
                  style={{ marginLeft: 3 }}
                />
              )}
            </View>
          )}
          {row.consecutiveMissing >= missedThreshold &&
          missedThreshold > 0 ? (
            <View style={styles.missedBadge}>
              <Ionicons name="alert-circle" size={11} color="#fff" />
              <Text style={styles.missedBadgeText}>
                {t('reports.group.missedMonths', {
                  count: row.consecutiveMissing,
                })}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.activity}>
          {summary}
          {report && report.bibleStudies > 0 && (
            <Text style={styles.studies}>
              {' · '}
              {t('reports.studies', { count: report.bibleStudies })}
            </Text>
          )}
        </Text>
        {report && (report.submittedByName || report.lastEditedByName) ? (
          <Text style={styles.byline} numberOfLines={1}>
            {report.lastEditedByName && report.lastEditedAt
              ? t('reports.group.editedByWhen', {
                  name: report.lastEditedByName,
                  when: formatByline(report.lastEditedAt),
                })
              : t('reports.group.submittedByWhen', {
                  name: report.submittedByName ?? '',
                  when: formatByline(report.submittedAt),
                })}
          </Text>
        ) : null}
      </View>
      </Pressable>
      {showAddBtn && (
        <Pressable
          onPress={() => onAddOnBehalf!(row)}
          style={styles.addBtn}
          hitSlop={8}
        >
          <Ionicons name="add-circle" size={28} color="#0ea5e9" />
        </Pressable>
      )}
      {report && onEdit && (
        <Pressable onPress={onEdit} style={styles.overrideBtn} hitSlop={8}>
          <Ionicons name="create-outline" size={22} color="#0ea5e9" />
        </Pressable>
      )}
      {canOverride && onOverride && (
        <Pressable
          onPress={onOverride}
          style={styles.overrideBtn}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color="#64748b" />
        </Pressable>
      )}
    </View>
  );
}

function OverrideStatusModal({
  target,
  currentStatus,
  isOverridden,
  onCancel,
  onSave,
  onClear,
  isSaving,
}: {
  target: { publisherId: string; displayName: string } | null;
  currentStatus: PublisherStatus;
  isOverridden: boolean;
  onCancel: () => void;
  onSave: (status: PublisherStatus) => void;
  onClear: () => void;
  isSaving: boolean;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<PublisherStatus>(currentStatus);

  // Reset selection when target changes (different publisher) or status updates.
  useEffect(() => {
    setSelected(currentStatus);
  }, [currentStatus, target?.publisherId]);

  return (
    <Modal
      visible={!!target}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={modalStyles.backdrop} onPress={onCancel}>
        <Pressable style={modalStyles.sheet} onPress={() => {}}>
          <Text style={modalStyles.title}>
            {t('reports.override.title', { name: target?.displayName ?? '' })}
          </Text>
          {(['active', 'irregular', 'inactive'] as PublisherStatus[]).map(
            (s) => (
              <Pressable
                key={s}
                onPress={() => setSelected(s)}
                style={[
                  modalStyles.option,
                  selected === s && modalStyles.optionSelected,
                ]}
              >
                <Ionicons
                  name={
                    selected === s ? 'radio-button-on' : 'radio-button-off'
                  }
                  size={20}
                  color={selected === s ? '#0ea5e9' : '#94a3b8'}
                />
                <Text style={modalStyles.optionText}>
                  {t(`publishers.status.${s}`)}
                </Text>
              </Pressable>
            ),
          )}
          <View style={modalStyles.btnRow}>
            <Pressable
              onPress={onCancel}
              style={[modalStyles.btn, modalStyles.btnSecondary]}
              disabled={isSaving}
            >
              <Text style={modalStyles.btnTextSecondary}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(selected)}
              style={[modalStyles.btn, modalStyles.btnPrimary]}
              disabled={isSaving}
            >
              <Text style={modalStyles.btnTextPrimary}>
                {isSaving ? t('reports.override.saving') : t('reports.override.save')}
              </Text>
            </Pressable>
          </View>
          {isOverridden && (
            <Pressable
              onPress={onClear}
              style={modalStyles.clearBtn}
              disabled={isSaving}
            >
              <Ionicons name="refresh" size={16} color="#dc2626" />
              <Text style={modalStyles.clearBtnText}>
                {t('reports.override.clear')}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#0f172a',
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    gap: 10,
  },
  optionSelected: {
    borderColor: '#0ea5e9',
    backgroundColor: '#f0f9ff',
  },
  optionText: { fontSize: 15, color: '#0f172a' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnSecondary: { backgroundColor: '#f1f5f9' },
  btnPrimary: { backgroundColor: '#0ea5e9' },
  btnTextSecondary: { color: '#475569', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  btnTextPrimary: { color: '#fff', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#fee2e2',
    marginTop: 14,
    paddingTop: 14,
  },
  clearBtnText: { color: '#dc2626', fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f1f5f9',
  },
  header: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  scopeLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500', fontFamily: 'Manrope_500Medium',
    paddingHorizontal: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  monthRow: { paddingHorizontal: 16, gap: 8 },
  monthPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
  },
  monthPickerBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    fontFamily: 'Manrope_600SemiBold',
  },
  monthModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'center',
    padding: 32,
  },
  monthModalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  monthModalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  monthModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  monthModalRowActive: { backgroundColor: '#E6F1FB' },
  monthModalRowText: { fontSize: 15, color: '#0f172a' },
  monthModalRowTextActive: { color: '#0C447C', fontWeight: '600' },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  monthChipText: { fontSize: 13, color: '#0f172a' },
  monthChipTextActive: { color: '#fff', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  missedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ef4444',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  missedBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  thresholdLabel: { fontSize: 12, color: '#64748b', marginRight: 2 },
  thresholdChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  thresholdChipActive: { backgroundColor: '#fee2e2' },
  thresholdChipText: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  thresholdChipTextActive: { color: '#b91c1c' },
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  statBig: { fontSize: 20, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  statActive: { color: '#10b981' },
  statPending: { color: '#dc2626' },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  indicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 14,
    borderWidth: 2,
  },
  indicatorActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  indicatorNone: { backgroundColor: '#94a3b8', borderColor: '#94a3b8' },
  indicatorPending: {
    backgroundColor: 'transparent',
    borderColor: '#cbd5e1',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 15,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#0f172a',
    flexShrink: 1,
  },
  pioneerTag: { fontSize: 12, color: '#0ea5e9', fontWeight: '500', fontFamily: 'Manrope_500Medium',},
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeActive: { backgroundColor: '#10b981' },
  badgeIrregular: { backgroundColor: '#f59e0b' },
  badgeInactive: { backgroundColor: '#94a3b8' },
  statusBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activity: { fontSize: 13, color: '#64748b', marginTop: 2 },
  studies: { fontSize: 13, color: '#64748b' },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addBtn: { marginLeft: 8, padding: 4 },
  overrideBtn: { marginLeft: 4, padding: 6 },
  byline: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    fontStyle: 'italic',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    backgroundColor: '#f8fafc',
  },
  groupHeaderCountDone: { color: '#16a34a' },
  groupHeaderName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
  },
  groupHeaderCount: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748b',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#475569',
    marginTop: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#475569',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
});
