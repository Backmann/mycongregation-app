import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  AuditLogEntry,
  extractErrorMessage,
  serviceReportsApi,
} from '../../../lib/api';
import { useTranslation } from 'react-i18next';
import i18n from '../../../lib/i18n';

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 5) return i18n.t('common.time.justNow');
  if (diffSec < 60) return i18n.t('common.time.secondsAgo', { count: diffSec });
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return i18n.t('common.time.minutesAgo', { count: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return i18n.t('common.time.hoursAgo', { count: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return i18n.t('common.time.daysAgo', { count: diffDay });
  return new Date(iso).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatExact(iso: string): string {
  return new Date(iso).toLocaleString(i18n.language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Render a single field's before/after pair. Strings get quoted; numbers,
 * booleans and null are printed plainly. Long strings wrap.
 */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return i18n.t('audit.value.none');
  if (typeof v === 'string') return v.length === 0 ? i18n.t('audit.value.empty') : `"${v}"`;
  if (typeof v === 'boolean') return v ? i18n.t('common.yes') : i18n.t('common.no');
  return String(v);
}

function fieldLabel(key: string): string {
  return i18n.t(`audit.fields.${key}`, { defaultValue: key });
}

function FieldDiff({
  fieldKey,
  before,
  after,
}: {
  fieldKey: string;
  before: unknown;
  after: unknown;
}) {
  return (
    <View style={styles.fieldDiff}>
      <Text style={styles.fieldLabel}>{fieldLabel(fieldKey)}</Text>
      <View style={styles.diffRow}>
        <View style={styles.beforeBox}>
          <Text style={styles.diffLabel}>{i18n.t('audit.before')}</Text>
          <Text style={styles.diffValue}>{formatValue(before)}</Text>
        </View>
        <Ionicons
          name="arrow-forward"
          size={18}
          color="#94a3b8"
          style={styles.diffArrow}
        />
        <View style={styles.afterBox}>
          <Text style={styles.diffLabel}>{i18n.t('audit.after')}</Text>
          <Text style={styles.diffValue}>{formatValue(after)}</Text>
        </View>
      </View>
    </View>
  );
}

function EntryCard({ entry }: { entry: AuditLogEntry }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="person-circle-outline" size={28} color="#0ea5e9" />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.actorName}>
            {entry.actorName ?? i18n.t('audit.unknownEditor')}
          </Text>
          <Text style={styles.timestamp}>
            {formatRelative(entry.createdAt)} · {formatExact(entry.createdAt)}
          </Text>
        </View>
        <View style={styles.actionBadge}>
          <Text style={styles.actionBadgeText}>{i18n.t(`audit.actions.${entry.action}`, { defaultValue: entry.action })}</Text>
        </View>
      </View>

      {entry.changedFields.length === 0 ? (
        <Text style={styles.noChanges}>{i18n.t('audit.noFieldsChanged')}</Text>
      ) : (
        <View style={styles.fieldList}>
          {entry.changedFields.map((f) => (
            <FieldDiff
              key={f}
              fieldKey={f}
              before={entry.before?.[f] ?? null}
              after={entry.after?.[f] ?? null}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export default function AuditLogScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const reportId = typeof params.id === 'string' ? params.id : undefined;

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['service-report', reportId, 'audit-log'],
    queryFn: () => serviceReportsApi.getAuditLog(reportId!),
    enabled: !!reportId,
  });

  const entries = useMemo(() => data ?? [], [data]);

  if (!reportId) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.title.editHistory') }} />
        <Text style={styles.errorText}>{t('audit.noReportId')}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.title.editHistory') }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    const message = extractErrorMessage(error);
    const isForbidden = /403|forbid|authoriz/i.test(message);
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('reports.title.editHistory') }} />
        <Ionicons
          name={isForbidden ? 'lock-closed-outline' : 'alert-circle-outline'}
          size={64}
          color="#cbd5e1"
        />
        <Text style={styles.errorTitle}>
          {isForbidden ? t('audit.notAuthorized') : t('audit.couldNotLoadHistory')}
        </Text>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('reports.title.editHistory') }} />
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>{t('audit.noEdits')}</Text>
            <Text style={styles.emptySub}>
              {t('audit.noEditsHint')}
            </Text>
          </View>
        }
        renderItem={({ item }) => <EntryCard entry={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f1f5f9',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  actorName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  timestamp: { fontSize: 12, color: '#64748b', marginTop: 2 },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#dbeafe',
  },
  actionBadgeText: {
    fontSize: 10,
    color: '#1e40af',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  fieldList: { gap: 12 },
  fieldDiff: {},
  fieldLabel: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  beforeBox: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  afterBox: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  diffLabel: {
    fontSize: 9,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  diffValue: { fontSize: 13, color: '#0f172a' },
  diffArrow: {},
  noChanges: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 10,
  },
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
  emptySub: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
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
