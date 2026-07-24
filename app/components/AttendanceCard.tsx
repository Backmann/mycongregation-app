import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
// Locales are opt-in per file in dayjs: without these the dates come out in
// English however the app is set, which is exactly what happened here.
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import { attendanceApi, extractErrorMessage } from '../lib/api';
import { usePermissions } from '../lib/permissions';
import { reportError, reportSuccess } from '../lib/error-bus';
import { confirm } from './ConfirmHost';
import { router } from 'expo-router';

/**
 * Recording attendance for a meeting that has just been held — form S-3.
 *
 * It sits on the home screen rather than inside the reports section because
 * the number is counted AT the meeting and wants entering while it is still in
 * someone's hand. A weekly trip through Служение → Отчёты → Посещаемость is
 * the kind of errand people stop running, and the sheet then stays empty.
 *
 * The card shows itself only when there is something to record, and only to
 * those who may: the secretary, an administrator, or whoever holds the
 * attendance responsibility. For everyone else it is not there at all.
 */
export function AttendanceCard() {
  const { t, i18n } = useTranslation();
  // On a phone the field and the button crowded each other and the button lost
  // its label to ellipsis. Below this width they stack instead.
  const { width } = useWindowDimensions();
  const narrow = width < 420;
  const perms = usePermissions();
  const qc = useQueryClient();
  const [value, setValue] = useState('');

  const pending = useQuery({
    queryKey: ['attendance', 'pending'],
    queryFn: () => attendanceApi.pending(),
    enabled: perms.canRecordAttendance,
    staleTime: 5 * 60 * 1000,
  });

  const meeting = pending.data?.meetings?.[0];

  const save = useMutation({
    mutationFn: (input: { count?: number; notHeld?: boolean }) =>
      attendanceApi.record({
        date: meeting!.date,
        eventType: meeting!.eventType,
        ...input,
      }),
    onSuccess: () => {
      setValue('');
      reportSuccess(t('attendance.saved'));
      void qc.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (e) => reportError(extractErrorMessage(e)),
  });

  if (!perms.canRecordAttendance || !meeting) return null;

  const parsed = Number(value.trim());
  const valid = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="people-outline" size={18} color="#0e7490" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('attendance.cardTitle')}</Text>
          {/* Which meeting, said in full: the kind by its own name and the
              weekday spelled out. "Выходные · 19 July" left a reader guessing
              at both. */}
          <Text style={styles.subtitle}>
            {t(`eventTypes.${meeting.eventType}`)}
          </Text>
          <Text style={styles.subtitleDate}>
            {dayjs(meeting.date)
              .locale(i18n.language)
              .format('dddd, D MMMM')}
          </Text>
        </View>

      </View>

      <View style={[styles.row, narrow && styles.rowStacked]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          keyboardType="number-pad"
          placeholder={t('attendance.placeholder')}
          placeholderTextColor="#94a3b8"
          editable={!save.isPending}
          returnKeyType="done"
          onSubmitEditing={() => valid && save.mutate({ count: parsed })}
        />
        <Pressable
          style={({ pressed }) => [
            styles.save,
            narrow && styles.saveWide,
            (!valid || save.isPending) && styles.saveOff,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => save.mutate({ count: parsed })}
          disabled={!valid || save.isPending}
        >
          {save.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveText}>{t('common.save')}</Text>
          )}
        </Pressable>
      </View>

      {/* A meeting that did not happen is not a zero, and recording it as one
          would drag every monthly average down. Asked for confirmation because
          it is easy to hit by accident and the card then moves on to the next
          meeting, leaving no way back from here. */}
      <Pressable
        onPress={async () => {
          const ok = await confirm({
            title: t('attendance.notHeldConfirmTitle'),
            body: t('attendance.notHeldConfirmBody', {
              date: dayjs(meeting.date)
                .locale(i18n.language)
                .format('D MMMM'),
            }),
            confirmLabel: t('attendance.notHeld'),
          });
          if (ok) save.mutate({ notHeld: true });
        }}
        disabled={save.isPending}
        hitSlop={6}
      >
        <Text style={styles.notHeld}>{t('attendance.notHeld')}</Text>
      </Pressable>

      {/* A bare number in the corner said nothing. On first use there IS a
          backlog, and the honest answer is to name it and offer the page
          where a whole year can be filled in at once. */}
      {pending.data && pending.data.outstandingThisYear > 1 ? (
        <Pressable
          onPress={() => router.push('/service-reports/attendance' as any)}
          style={styles.backlog}
          hitSlop={6}
        >
          <Text style={styles.backlogText}>
            {t('attendance.backlog', {
              count: pending.data.outstandingThisYear - 1,
            })}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#0e7490" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
  },
  subtitle: {
    fontSize: 13.5,
    color: '#0f172a',
    marginTop: 1,
    fontFamily: 'Manrope_600SemiBold',
  },
  subtitleDate: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 1,
    textTransform: 'capitalize',
  },
  backlog: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  backlogText: {
    flex: 1,
    fontSize: 13,
    color: '#0e7490',
    fontFamily: 'Manrope_600SemiBold',
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  rowStacked: { flexDirection: 'column' },
  saveWide: { paddingVertical: 12, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  save: {
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#0e7490',
  },
  saveOff: { backgroundColor: '#cbd5e1' },
  saveText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 14 },
  notHeld: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
    textDecorationLine: 'underline',
  },
});
