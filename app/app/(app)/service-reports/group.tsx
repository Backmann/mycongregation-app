import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getRecentMonths(count: number): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push({
      value: `${yyyy}-${mm}`,
      label: `${MONTH_NAMES[d.getMonth()]} ${yyyy}`,
    });
  }
  return months;
}

export default function GroupReportsScreen() {
  const recentMonths = useMemo(() => getRecentMonths(6), []);
  // Default to the previous completed month (most useful for follow-up).
  const [reportMonth, setReportMonth] = useState(
    recentMonths[Math.min(1, recentMonths.length - 1)].value,
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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Group reports' }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    const message = extractErrorMessage(error);
    const isForbidden = /403|forbid|authoriz/i.test(message);
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Group reports' }} />
        <Ionicons
          name={isForbidden ? 'lock-closed-outline' : 'alert-circle-outline'}
          size={64}
          color="#cbd5e1"
        />
        <Text style={styles.errorTitle}>
          {isForbidden ? 'Not authorized' : 'Could not load'}
        </Text>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Group reports' }} />
      <View style={styles.header}>
        {data?.scopeLabel && (
          <Text style={styles.scopeLabel}>{data.scopeLabel}</Text>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthRow}
        >
          {recentMonths.map((m) => {
            const isActive = reportMonth === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => setReportMonth(m.value)}
                style={[styles.monthChip, isActive && styles.monthChipActive]}
              >
                <Text
                  style={[
                    styles.monthChipText,
                    isActive && styles.monthChipTextActive,
                  ]}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.statsBar}>
          <View style={styles.statBox}>
            <Text style={styles.statBig}>{aggregate.submitted}</Text>
            <Text style={styles.statLabel}>
              of {aggregate.total} reported
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statBig, styles.statActive]}>
              {aggregate.served}
            </Text>
            <Text style={styles.statLabel}>active</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statBig, styles.statPending]}>
              {aggregate.total - aggregate.submitted}
            </Text>
            <Text style={styles.statLabel}>pending</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={data?.publishers ?? []}
        keyExtractor={(item) => item.publisherId}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>No publishers in scope</Text>
          </View>
        }
        renderItem={({ item }) => (
          <PublisherRow
            row={item}
            statusInfo={statusMap.get(item.publisherId) ?? null}
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
              data?.scopeLabel === 'Congregation'
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
}: {
  row: GroupReportRow;
  statusInfo: { status: PublisherStatus; manuallyOverridden: boolean } | null;
  canOverride: boolean;
  onOverride?: () => void;
  onTapHistory?: () => void;
  onAddOnBehalf?: (row: GroupReportRow) => void;
}) {
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
    ? 'No report yet'
    : isPioneer && report.hoursReported !== null
      ? `${report.hoursReported} hour${report.hoursReported === 1 ? '' : 's'}`
      : report.servedThisMonth === true
        ? 'Served'
        : 'Did not serve';

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
              <Text style={styles.pioneerTag}> · pioneer</Text>
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
              <Text style={styles.statusBadgeText}>{statusInfo.status}</Text>
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
        </View>
        <Text style={styles.activity}>
          {summary}
          {report && report.bibleStudies > 0 && (
            <Text style={styles.studies}>
              {' · '}
              {report.bibleStudies}{' '}
              {report.bibleStudies === 1 ? 'study' : 'studies'}
            </Text>
          )}
        </Text>
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
            Override status for {target?.displayName ?? ''}
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
                  {s[0].toUpperCase() + s.slice(1)}
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
              <Text style={modalStyles.btnTextSecondary}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(selected)}
              style={[modalStyles.btn, modalStyles.btnPrimary]}
              disabled={isSaving}
            >
              <Text style={modalStyles.btnTextPrimary}>
                {isSaving ? '…' : 'Save override'}
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
                Clear override · resume auto-recompute
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
    fontWeight: '600',
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
  btnTextSecondary: { color: '#475569', fontWeight: '600' },
  btnTextPrimary: { color: '#fff', fontWeight: '600' },
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
  clearBtnText: { color: '#dc2626', fontSize: 13, fontWeight: '600' },
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
    fontWeight: '500',
    paddingHorizontal: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  monthRow: { paddingHorizontal: 16, gap: 8 },
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
  monthChipTextActive: { color: '#fff', fontWeight: '600' },
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
  statBig: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
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
    fontWeight: '600',
    color: '#0f172a',
    flexShrink: 1,
  },
  pioneerTag: { fontSize: 12, color: '#0ea5e9', fontWeight: '500' },
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
    fontWeight: '700',
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
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#475569',
    marginTop: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
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
