import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import {
  extractErrorMessage,
  PioneerType,
  serviceReportsApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useTranslation } from 'react-i18next';
import { formatMonthLabel } from '../../../lib/i18n';

const SCREEN_TITLE = 'Сводка за месяц';

const CATEGORY_LABELS: Record<PioneerType, string> = {
  none: 'Возвещатели',
  auxiliary_until_cancelled: 'Подсобные пионеры',
  regular: 'Общие пионеры',
  special: 'Специальные пионеры',
  missionary: 'Миссионеры',
};

function getRecentMonths(count: number): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push({
      value: `${yyyy}-${mm}`,
      label: formatMonthLabel(`${yyyy}-${mm}`),
    });
  }
  return months;
}

export default function ServiceSummaryScreen() {
  const { i18n: i18nInstance } = useTranslation();
  const { canViewServiceSummary } = usePermissions();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recentMonths = useMemo(() => getRecentMonths(6), [i18nInstance.language]);
  // Default to the previous completed month — the one the secretary compiles.
  const [reportMonth, setReportMonth] = useState(
    recentMonths[Math.min(1, recentMonths.length - 1)].value,
  );

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['service-reports', 'summary', reportMonth],
    queryFn: () => serviceReportsApi.getSummary(reportMonth),
    enabled: canViewServiceSummary,
  });

  const queryClient = useQueryClient();
  const closureMutation = useMutation({
    mutationFn: (action: 'close' | 'reopen') =>
      action === 'close'
        ? serviceReportsApi.closeMonth(reportMonth)
        : serviceReportsApi.reopenMonth(reportMonth),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['service-reports', 'summary', reportMonth],
      });
      queryClient.invalidateQueries({
        queryKey: ['service-reports', 'group', reportMonth],
      });
    },
  });

  if (!canViewServiceSummary) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: SCREEN_TITLE }} />
        <Ionicons name="lock-closed-outline" size={64} color="#cbd5e1" />
        <Text style={styles.errorTitle}>Доступ ограничен</Text>
        <Text style={styles.errorText}>
          Сводка доступна только секретарю и администратору.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: SCREEN_TITLE }} />
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    const message = extractErrorMessage(error);
    const isForbidden = /403|forbid|authoriz/i.test(message);
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: SCREEN_TITLE }} />
        <Ionicons
          name={isForbidden ? 'lock-closed-outline' : 'alert-circle-outline'}
          size={64}
          color="#cbd5e1"
        />
        <Text style={styles.errorTitle}>
          {isForbidden ? 'Доступ ограничен' : 'Не удалось загрузить сводку'}
        </Text>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: SCREEN_TITLE }} />
      <View style={styles.header}>
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
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        <View
          style={[
            styles.card,
            data?.closed ? styles.closedCard : styles.openCard,
          ]}
        >
          <View style={styles.closureRow}>
            <Ionicons
              name={data?.closed ? 'lock-closed' : 'lock-open-outline'}
              size={20}
              color={data?.closed ? '#b45309' : '#0ea5e9'}
            />
            <Text style={styles.closureTitle}>
              {data?.closed ? 'Месяц закрыт' : 'Месяц открыт'}
            </Text>
          </View>
          <Text style={styles.closureHint}>
            {data?.closed
              ? 'Правки заморожены для всех, кроме секретаря и администратора.'
              : 'Возвещатели и надзиратели групп могут вносить отчёты в своём окне.'}
          </Text>
          <Pressable
            onPress={() =>
              closureMutation.mutate(data?.closed ? 'reopen' : 'close')
            }
            disabled={closureMutation.isPending}
            style={[
              styles.closureBtn,
              data?.closed ? styles.reopenBtn : styles.closeBtn,
              closureMutation.isPending && styles.btnDisabled,
            ]}
          >
            <Text style={styles.closureBtnText}>
              {closureMutation.isPending
                ? 'Сохранение…'
                : data?.closed
                  ? 'Открыть месяц'
                  : 'Закрыть месяц'}
            </Text>
          </Pressable>
          {closureMutation.isError && (
            <Text style={styles.closureError}>
              {extractErrorMessage(closureMutation.error)}
            </Text>
          )}
        </View>

        {data?.categories.map((cat) => (
          <View key={cat.pioneerType} style={styles.card}>
            <Text style={styles.cardTitle}>
              {CATEGORY_LABELS[cat.pioneerType] ?? cat.pioneerType}
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statBig}>{cat.count}</Text>
                <Text style={styles.statLabel}>Количество</Text>
              </View>
              {cat.hours !== null && (
                <View style={styles.statBox}>
                  <Text style={styles.statBig}>{cat.hours}</Text>
                  <Text style={styles.statLabel}>Часы</Text>
                </View>
              )}
              <View style={styles.statBox}>
                <Text style={styles.statBig}>{cat.bibleStudies}</Text>
                <Text style={styles.statLabel}>Изучения</Text>
              </View>
            </View>
          </View>
        ))}

        <View style={[styles.card, styles.totalsCard]}>
          <Text style={styles.cardTitle}>Численность собрания</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statBig, styles.statActive]}>
                {data?.totalActivePublishers ?? 0}
              </Text>
              <Text style={styles.statLabel}>Все активные</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statBig, styles.statInactive]}>
                {data?.totalInactivePublishers ?? 0}
              </Text>
              <Text style={styles.statLabel}>Неактивные</Text>
            </View>
          </View>
          <Text style={styles.totalsHint}>
            «Все активные» — активные и нерегулярные возвещатели. Неактивные
            считаются отдельно и в это число не входят.
          </Text>
        </View>
      </ScrollView>
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
  header: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
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
  scrollBody: { padding: 16, paddingBottom: 32, gap: 12 },
  closedCard: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  openCard: { borderColor: '#bae6fd', backgroundColor: '#f0f9ff' },
  closureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closureTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  closureHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    lineHeight: 17,
  },
  closureBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeBtn: { backgroundColor: '#b45309' },
  reopenBtn: { backgroundColor: '#0ea5e9' },
  btnDisabled: { opacity: 0.6 },
  closureBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  closureError: { color: '#dc2626', fontSize: 13, marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  totalsCard: { marginTop: 4 },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  statBig: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  statActive: { color: '#10b981' },
  statInactive: { color: '#94a3b8' },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  totalsHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 12,
    lineHeight: 17,
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
