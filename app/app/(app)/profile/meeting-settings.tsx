import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  MeetingSettingsVersion,
  UpsertMeetingSettingsInput,
  extractErrorMessage,
  meetingSettingsApi,
} from '../../../lib/api';

const QK = ['meeting-settings'] as const;
const DOW = [1, 2, 3, 4, 5, 6, 7];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Draft {
  effectiveFrom: string;
  midweekDow: number;
  midweekTime: string;
  weekendDow: number;
  weekendTime: string;
  address: string;
  microphoneSlots: number;
}

const EMPTY_DRAFT: Draft = {
  effectiveFrom: todayISO(),
  midweekDow: 3,
  midweekTime: '19:00',
  weekendDow: 7,
  weekendTime: '13:00',
  address: '',
  microphoneSlots: 2,
};

export default function MeetingSettingsScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const query = useQuery({ queryKey: QK, queryFn: () => meetingSettingsApi.getOverview() });

  const [name, setName] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);

  // Initialise name + draft from the loaded data once.
  useEffect(() => {
    if (!query.data || hydrated) return;
    setName(query.data.congregation.name);
    const e = query.data.effective;
    if (e) {
      setDraft({
        effectiveFrom: todayISO(),
        midweekDow: e.midweekDow,
        midweekTime: e.midweekTime,
        weekendDow: e.weekendDow,
        weekendTime: e.weekendTime,
        address: e.address,
        microphoneSlots: e.microphoneSlots,
      });
    }
    setHydrated(true);
  }, [query.data, hydrated]);

  const onError = (e: unknown) =>
    Alert.alert(t('meetingSettings.errorTitle'), extractErrorMessage(e));

  const nameMutation = useMutation({
    mutationFn: (n: string) => meetingSettingsApi.updateCongregation({ name: n }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError,
  });

  const versionMutation = useMutation({
    mutationFn: (input: UpsertMeetingSettingsInput) =>
      meetingSettingsApi.upsertVersion(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => meetingSettingsApi.removeVersion(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError,
  });

  const effectiveId = query.data?.effective?.id;
  const nameChanged = !!query.data && name.trim() !== query.data.congregation.name;

  const saveVersion = () => {
    versionMutation.mutate({
      effectiveFrom: draft.effectiveFrom.trim(),
      midweekDow: draft.midweekDow,
      midweekTime: draft.midweekTime.trim(),
      weekendDow: draft.weekendDow,
      weekendTime: draft.weekendTime.trim(),
      address: draft.address.trim(),
      microphoneSlots: draft.microphoneSlots,
    });
  };

  const confirmDelete = (v: MeetingSettingsVersion) => {
    const body = t('meetingSettings.deleteConfirm.body', {
      date: v.effectiveFrom,
    });
    if (Platform.OS === 'web') {
      if (window.confirm(body)) deleteMutation.mutate(v.id);
      return;
    }
    Alert.alert(t('meetingSettings.deleteConfirm.title'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('meetingSettings.deleteConfirm.action'),
        style: 'destructive',
        onPress: () => deleteMutation.mutate(v.id),
      },
    ]);
  };

  if (query.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  const versions = query.data?.versions ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Congregation name */}
        <Text style={styles.sectionLabel}>{t('meetingSettings.congregationName')}</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('meetingSettings.congregationName')}
            placeholderTextColor="#94a3b8"
          />
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (!nameChanged || nameMutation.isPending) && styles.btnDisabled,
              pressed && nameChanged && styles.primaryBtnPressed,
            ]}
            onPress={() => nameChanged && nameMutation.mutate(name.trim())}
            disabled={!nameChanged || nameMutation.isPending}
          >
            <Text style={styles.primaryBtnText}>{t('meetingSettings.saveName')}</Text>
          </Pressable>
        </View>

        {/* Schedule editor */}
        <Text style={styles.sectionLabel}>{t('meetingSettings.editTitle')}</Text>
        <View style={styles.card}>
          {/* Midweek */}
          <Text style={styles.fieldLabel}>{t('meetingSettings.midweek')}</Text>
          <DayPicker
            value={draft.midweekDow}
            onChange={(d) => setDraft((p) => ({ ...p, midweekDow: d }))}
            t={t}
          />
          <TextInput
            style={[styles.input, styles.timeInput]}
            value={draft.midweekTime}
            onChangeText={(v) => setDraft((p) => ({ ...p, midweekTime: v }))}
            placeholder="19:00"
            placeholderTextColor="#94a3b8"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />

          {/* Weekend */}
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            {t('meetingSettings.weekend')}
          </Text>
          <DayPicker
            value={draft.weekendDow}
            onChange={(d) => setDraft((p) => ({ ...p, weekendDow: d }))}
            t={t}
          />
          <TextInput
            style={[styles.input, styles.timeInput]}
            value={draft.weekendTime}
            onChangeText={(v) => setDraft((p) => ({ ...p, weekendTime: v }))}
            placeholder="13:00"
            placeholderTextColor="#94a3b8"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />

          {/* Address */}
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            {t('meetingSettings.address')}
          </Text>
          <TextInput
            style={[styles.input, { minHeight: 56 }]}
            value={draft.address}
            onChangeText={(v) => setDraft((p) => ({ ...p, address: v }))}
            placeholder={t('meetingSettings.addressPlaceholder')}
            placeholderTextColor="#94a3b8"
            multiline
          />

          {/* Microphone slots */}
          <View style={styles.stepperRow}>
            <Text style={styles.fieldLabel}>{t('meetingSettings.microphoneSlots')}</Text>
            <View style={styles.stepper}>
              <Pressable
                style={styles.stepperBtn}
                onPress={() =>
                  setDraft((p) => ({
                    ...p,
                    microphoneSlots: Math.max(1, p.microphoneSlots - 1),
                  }))
                }
              >
                <Ionicons name="remove" size={18} color="#0369a1" />
              </Pressable>
              <Text style={styles.stepperValue}>{draft.microphoneSlots}</Text>
              <Pressable
                style={styles.stepperBtn}
                onPress={() =>
                  setDraft((p) => ({
                    ...p,
                    microphoneSlots: Math.min(8, p.microphoneSlots + 1),
                  }))
                }
              >
                <Ionicons name="add" size={18} color="#0369a1" />
              </Pressable>
            </View>
          </View>

          {/* Effective from */}
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            {t('meetingSettings.effectiveFrom')}
          </Text>
          <TextInput
            style={[styles.input, styles.timeInput]}
            value={draft.effectiveFrom}
            onChangeText={(v) => setDraft((p) => ({ ...p, effectiveFrom: v }))}
            placeholder="2026-05-20"
            placeholderTextColor="#94a3b8"
            maxLength={10}
          />
          <Text style={styles.hint}>{t('meetingSettings.effectiveFromHint')}</Text>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              versionMutation.isPending && styles.btnDisabled,
              pressed && styles.primaryBtnPressed,
            ]}
            onPress={saveVersion}
            disabled={versionMutation.isPending}
          >
            <Text style={styles.primaryBtnText}>{t('meetingSettings.saveVersion')}</Text>
          </Pressable>
        </View>

        {/* History */}
        <Text style={styles.sectionLabel}>{t('meetingSettings.history')}</Text>
        <View style={styles.card}>
          {versions.length === 0 ? (
            <Text style={styles.empty}>{t('meetingSettings.noVersions')}</Text>
          ) : (
            versions.map((v, i) => (
              <View key={v.id} style={[styles.histRow, i > 0 && styles.histBorder]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.histHead}>
                    <Text style={styles.histDate}>{v.effectiveFrom}</Text>
                    {v.id === effectiveId && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {t('meetingSettings.effectiveNow')}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.histDetail}>
                    {t(`meetingSettings.dow.${v.midweekDow}`)} {v.midweekTime} ·{' '}
                    {t(`meetingSettings.dow.${v.weekendDow}`)} {v.weekendTime}
                  </Text>
                  <Text style={styles.histAddr}>{v.address}</Text>
                </View>
                <Pressable
                  onPress={() => confirmDelete(v)}
                  hitSlop={8}
                  style={styles.delBtn}
                  disabled={deleteMutation.isPending}
                >
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DayPicker({
  value,
  onChange,
  t,
}: {
  value: number;
  onChange: (dow: number) => void;
  t: (k: string) => string;
}) {
  return (
    <View style={styles.dayRow}>
      {DOW.map((d) => {
        const on = d === value;
        return (
          <Pressable
            key={d}
            onPress={() => onChange(d)}
            style={[styles.dayChip, on && styles.dayChipOn]}
          >
            <Text style={[styles.dayChipText, on && styles.dayChipTextOn]}>
              {t(`meetingSettings.dow.${d}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldLabel: { fontSize: 13, color: '#334155', fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  timeInput: { width: 120 },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dayChipOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  dayChipText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  dayChipTextOn: { color: '#fff' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperValue: { fontSize: 16, fontWeight: '700', color: '#0f172a', minWidth: 20, textAlign: 'center' },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnPressed: { backgroundColor: '#0284c7' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', paddingVertical: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  histBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histDate: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  badge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, color: '#166534', fontWeight: '700' },
  histDetail: { fontSize: 13, color: '#475569', marginTop: 2 },
  histAddr: { fontSize: 12, color: '#94a3b8', marginTop: 1 },
  delBtn: { padding: 6 },
});
