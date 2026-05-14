import { useMemo, useState } from 'react';
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
import { router } from 'expo-router';
import { useAuth } from '../../../lib/auth';
import {
  extractErrorMessage,
  publishersApi,
  serviceReportsApi,
} from '../../../lib/api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getRecentMonths(): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 3; i++) {
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

export default function NewServiceReportScreen() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch current user's publisher to determine pioneer status.
  // Backend doesn't yet have GET /publishers/me, so we filter client-side.
  const { data: myPublisher, isLoading: isLoadingPublisher } = useQuery({
    queryKey: ['my-publisher', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const all = await publishersApi.list({ limit: 200 });
      return all.data.find((p) => p.userId === user.id) ?? null;
    },
    enabled: !!user,
  });

  const recentMonths = useMemo(() => getRecentMonths(), []);
  const [reportMonth, setReportMonth] = useState(recentMonths[0].value);
  const [servedThisMonth, setServedThisMonth] = useState<boolean | null>(null);
  const [hours, setHours] = useState('');
  const [bibleStudies, setBibleStudies] = useState('0');
  const [notes, setNotes] = useState('');

  const isPioneer =
    myPublisher?.pioneerType !== undefined &&
    myPublisher.pioneerType !== 'none';

  const mutation = useMutation({
    mutationFn: () =>
      serviceReportsApi.submit({
        reportMonth,
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

  function canSubmit(): boolean {
    if (mutation.isPending) return false;
    if (isPioneer) {
      const h = parseInt(hours, 10);
      return !isNaN(h) && h >= 0 && h <= 744;
    }
    return servedThisMonth !== null;
  }

  function handleSubmit() {
    if (!canSubmit()) {
      Alert.alert(
        'Validation',
        isPioneer
          ? 'Please enter valid hours (0–744).'
          : 'Please indicate whether you served this month.',
      );
      return;
    }
    mutation.mutate();
  }

  if (isLoadingPublisher) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!myPublisher) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Your account is not linked to a publisher record. Please contact an
          elder or admin.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#f1f5f9' }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.welcome}>
          Submitting as {myPublisher.displayName}
          {isPioneer ? ' (pioneer)' : ''}
        </Text>

        <Text style={styles.label}>Report month</Text>
        <View style={styles.monthRow}>
          {recentMonths.map((m) => (
            <Pressable
              key={m.value}
              onPress={() => setReportMonth(m.value)}
              style={[
                styles.monthChip,
                reportMonth === m.value && styles.monthChipActive,
              ]}
            >
              <Text
                style={[
                  styles.monthChipText,
                  reportMonth === m.value && styles.monthChipTextActive,
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {isPioneer ? (
          <>
            <Text style={styles.label}>Hours in ministry</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={hours}
              onChangeText={setHours}
              placeholder="e.g. 70"
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>
              Did you share in the ministry this month?
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
                  Yes
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
                  No
                </Text>
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.label}>Bible studies</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={bibleStudies}
          onChangeText={setBibleStudies}
          placeholder="0"
        />

        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          multiline
          value={notes}
          onChangeText={setNotes}
          placeholder="Any additional information…"
          textAlignVertical="top"
        />

        {mutation.isError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractErrorMessage(mutation.error)}
            </Text>
          </View>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit()}
          style={[styles.submitBtn, !canSubmit() && styles.submitBtnDisabled]}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Report</Text>
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 8,
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
  monthChipText: { fontSize: 14, color: '#0f172a' },
  monthChipTextActive: { color: '#fff', fontWeight: '600' },
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
