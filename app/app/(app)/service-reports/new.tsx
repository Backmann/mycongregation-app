import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../lib/auth';
import {
  extractErrorMessage,
  publishersApi,
  serviceReportsApi,
} from '../../../lib/api';
import { useTranslation } from 'react-i18next';
import { formatMonthLabel } from '../../../lib/i18n';

// formatMonth replaced by formatMonthLabel from lib/i18n.ts

function getRecentMonths(): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 3; i++) {
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

/** YYYY-MM-DD or YYYY-MM-01 → YYYY-MM */
function toYearMonth(s: string): string {
  return s.slice(0, 7);
}

export default function NewOrEditServiceReportScreen() {
  const { t, i18n: i18nInstance } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    id?: string;
    publisherId?: string;
    onBehalfName?: string;
    onBehalfIsPioneer?: string;
    reportMonth?: string;
  }>();
  const editId = typeof params.id === 'string' ? params.id : undefined;
  const onBehalfPublisherId =
    typeof params.publisherId === 'string' ? params.publisherId : undefined;
  const onBehalfName =
    typeof params.onBehalfName === 'string' ? params.onBehalfName : undefined;
  const onBehalfIsPioneer = params.onBehalfIsPioneer === '1';
  const preFilledMonth =
    typeof params.reportMonth === 'string' ? params.reportMonth : undefined;
  const isEditMode = !!editId;
  const isOnBehalf = !!onBehalfPublisherId && !isEditMode;

  // Resolve current user's publisher (used for SELF submissions only).
  const { data: myPublisher, isLoading: isLoadingPublisher } = useQuery({
    queryKey: ['my-publisher', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const all = await publishersApi.list({ limit: 200 });
      return all.data.find((p) => p.userId === user.id) ?? null;
    },
    enabled: !!user,
  });

  // Edit mode: fetch the report being edited.
  const { data: editingReport, isLoading: isLoadingReport } = useQuery({
    queryKey: ['service-report', editId],
    queryFn: () => serviceReportsApi.getById(editId!),
    enabled: isEditMode,
  });

  // Self-create: list user's reports to detect duplicate months.
  // Not used for edit mode or on-behalf submissions (target's history is
  // not available client-side; server catches duplicates via 23505).
  const { data: myReports } = useQuery({
    queryKey: ['service-reports', 'my'],
    queryFn: () => serviceReportsApi.listMy(),
    enabled: !isEditMode && !isOnBehalf,
  });

  // formatMonthLabel reads global i18next state — re-memoize when language changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recentMonths = useMemo(() => getRecentMonths(), [i18nInstance.language]);
  const submittedMonths = useMemo(() => {
    if (!myReports) return new Set<string>();
    return new Set(myReports.map((r) => toYearMonth(r.reportMonth)));
  }, [myReports]);

  const [reportMonth, setReportMonth] = useState(
    preFilledMonth ? toYearMonth(preFilledMonth) : recentMonths[0].value,
  );
  const [servedThisMonth, setServedThisMonth] = useState<boolean | null>(null);
  const [hours, setHours] = useState('');
  const [bibleStudies, setBibleStudies] = useState('0');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (editingReport) {
      setReportMonth(toYearMonth(editingReport.reportMonth));
      setServedThisMonth(editingReport.servedThisMonth);
      setHours(
        editingReport.hoursReported !== null
          ? String(editingReport.hoursReported)
          : '',
      );
      setBibleStudies(String(editingReport.bibleStudies));
      setNotes(editingReport.notes ?? '');
    }
  }, [editingReport]);

  // Pioneer status comes from the TARGET publisher in on-behalf mode,
  // not the caller (a publisher submitting for a pioneer must use the
  // pioneer form variant).
  const isPioneer = isOnBehalf
    ? onBehalfIsPioneer
    : myPublisher?.pioneerType !== undefined &&
      myPublisher.pioneerType !== 'none';

  const submitMutation = useMutation({
    mutationFn: () =>
      serviceReportsApi.submit({
        reportMonth,
        publisherId: isOnBehalf ? onBehalfPublisherId : undefined,
        servedThisMonth:
          !isPioneer && servedThisMonth !== null ? servedThisMonth : undefined,
        hoursReported: isPioneer ? parseInt(hours, 10) : undefined,
        bibleStudies: parseInt(bibleStudies || '0', 10),
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-reports'] });
      router.back();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      serviceReportsApi.update(editId!, {
        servedThisMonth:
          !isPioneer && servedThisMonth !== null ? servedThisMonth : undefined,
        hoursReported: isPioneer ? parseInt(hours, 10) : undefined,
        bibleStudies: parseInt(bibleStudies || '0', 10),
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-reports'] });
      queryClient.invalidateQueries({ queryKey: ['service-report', editId] });
      router.back();
    },
  });

  const mutation = isEditMode ? updateMutation : submitMutation;
  const isMonthLocked = isEditMode || isOnBehalf;

  function isDuplicateMonth(): boolean {
    return !isEditMode && !isOnBehalf && submittedMonths.has(reportMonth);
  }

  function canSubmit(): boolean {
    if (mutation.isPending) return false;
    if (isEditMode && !editingReport) return false;
    if (isDuplicateMonth()) return false;
    if (isPioneer) {
      const h = parseInt(hours, 10);
      return !isNaN(h) && h >= 0 && h <= 744;
    }
    return servedThisMonth !== null;
  }

  function handleSubmit() {
    if (!canSubmit()) {
      if (isDuplicateMonth()) {
        Alert.alert(
          t('reports.alerts.alreadySubmittedTitle'),
          t('reports.alerts.alreadySubmittedBody', { month: formatMonthLabel(reportMonth) }),
        );
        return;
      }
      Alert.alert(
        t('reports.alerts.validationTitle'),
        isPioneer
          ? t('reports.alerts.validationHours')
          : isOnBehalf
            ? t('reports.alerts.validationServedOnBehalf')
            : t('reports.alerts.validationServedSelf'),
      );
      return;
    }
    mutation.mutate();
  }

  if (isLoadingPublisher || (isEditMode && isLoadingReport)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // For self submissions, caller must have a publisher record.
  // On-behalf submissions work even for admin users with no publisher.
  if (!isOnBehalf && !myPublisher) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {t('reports.errors.notLinkedToPublisher')}
        </Text>
      </View>
    );
  }

  if (isEditMode && editingReport && !editingReport.canEdit) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {t('reports.errors.selfEditWindowClosed')}
        </Text>
      </View>
    );
  }

  const screenTitle = isEditMode
    ? t('reports.title.edit')
    : isOnBehalf
      ? t('reports.title.onBehalf')
      : t('reports.title.new');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#f1f5f9' }}
    >
      <Stack.Screen options={{ title: screenTitle }} />
      <ScrollView contentContainerStyle={styles.container}>
        {isOnBehalf ? (
          <View style={styles.onBehalfBanner}>
            <Text style={styles.onBehalfBannerTitle}>
              {t('reports.submittingOnBehalfOf')}
            </Text>
            <Text style={styles.onBehalfBannerName}>
              {onBehalfName ?? t('reports.publisher')}
              {isPioneer ? t('reports.pioneerSuffix') : ''}
            </Text>
          </View>
        ) : (
          <Text style={styles.welcome}>
            {isEditMode ? t('reports.editingReportFor') : t('reports.submittingAs')}
            {myPublisher?.displayName ?? ''}
            {isPioneer ? t('reports.pioneerSuffix') : ''}
          </Text>
        )}

        <Text style={styles.label}>{t('reports.reportMonth')}</Text>
        {isMonthLocked ? (
          <View style={[styles.monthChip, styles.monthChipLocked]}>
            <Text style={styles.monthChipText}>{formatMonthLabel(reportMonth)}</Text>
          </View>
        ) : (
          <View style={styles.monthRow}>
            {recentMonths.map((m) => {
              const isSelected = reportMonth === m.value;
              const isTaken = submittedMonths.has(m.value);
              return (
                <Pressable
                  key={m.value}
                  onPress={() => !isTaken && setReportMonth(m.value)}
                  disabled={isTaken}
                  style={[
                    styles.monthChip,
                    isSelected && styles.monthChipActive,
                    isTaken && styles.monthChipTaken,
                  ]}
                >
                  <Text
                    style={[
                      styles.monthChipText,
                      isSelected && styles.monthChipTextActive,
                      isTaken && styles.monthChipTextTaken,
                    ]}
                  >
                    {m.label}
                    {isTaken ? ' ✓' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {isDuplicateMonth() && (
          <Text style={styles.hint}>
            {t('reports.alreadySubmitted')}
          </Text>
        )}

        {isPioneer ? (
          <>
            <Text style={styles.label}>{t('reports.hoursLabel')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={hours}
              onChangeText={setHours}
              placeholder={t('reports.hoursPlaceholder')}
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>
              {isOnBehalf
                ? t('reports.didTheyShare')
                : t('reports.didYouShare')}
            </Text>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setServedThisMonth(true)}
                style={[
                  styles.toggleBtn,
                  servedThisMonth === true && styles.toggleBtnYes,
                ]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    servedThisMonth === true && styles.toggleTextActive,
                  ]}
                >
                  {t('common.yes')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setServedThisMonth(false)}
                style={[
                  styles.toggleBtn,
                  servedThisMonth === false && styles.toggleBtnNo,
                ]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    servedThisMonth === false && styles.toggleTextActive,
                  ]}
                >
                  {t('common.no')}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.label}>{t('reports.bibleStudies')}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={bibleStudies}
          onChangeText={setBibleStudies}
          placeholder="0"
        />

        <Text style={styles.label}>{t('reports.notesOptional')}</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          multiline
          value={notes}
          onChangeText={setNotes}
          placeholder={t('reports.notesPlaceholder')}
          textAlignVertical="top"
        />

        {mutation.isError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractErrorMessage(mutation.error)}
            </Text>
          </View>
        )}

        {isEditMode &&
          editId &&
          (user?.role === 'admin' || user?.role === 'elder') && (
            <Pressable
              onPress={() =>
                router.push(
                  `/service-reports/audit-log?id=${editId}` as any,
                )
              }
              style={styles.historyBtn}
              hitSlop={8}
            >
              <Ionicons name="time-outline" size={18} color="#0ea5e9" />
              <Text style={styles.historyBtnText}>{t('reports.viewEditHistory')}</Text>
            </Pressable>
          )}

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit()}
          style={[styles.submitBtn, !canSubmit() && styles.submitBtnDisabled]}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              {isEditMode ? t('reports.updateReport') : t('reports.submitReport')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f1f5f9',
  },
  welcome: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
    textAlign: 'center',
  },
  onBehalfBanner: {
    backgroundColor: '#e0f2fe',
    borderColor: '#7dd3fc',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 4,
    alignItems: 'center',
  },
  onBehalfBannerTitle: {
    fontSize: 11,
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
    marginBottom: 2,
  },
  onBehalfBannerName: {
    fontSize: 16,
    color: '#0c4a6e',
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 8,
    lineHeight: 16,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  notesInput: { minHeight: 100 },
  monthRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  monthChipTaken: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    opacity: 0.6,
  },
  monthChipLocked: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    borderColor: '#7dd3fc',
  },
  monthChipText: { fontSize: 14, color: '#0f172a' },
  monthChipTextActive: { color: '#fff', fontWeight: '600' },
  monthChipTextTaken: { color: '#94a3b8' },
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  toggleBtnYes: { backgroundColor: '#10b981', borderColor: '#10b981' },
  toggleBtnNo: { backgroundColor: '#64748b', borderColor: '#64748b' },
  toggleText: { fontSize: 16, fontWeight: '500', color: '#0f172a' },
  toggleTextActive: { color: '#fff', fontWeight: '700' },
  submitBtn: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    marginTop: 16,
  },
  historyBtnText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600' },
  submitBtnDisabled: { backgroundColor: '#cbd5e1' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  errorBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
});
