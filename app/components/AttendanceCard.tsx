import { useEffect, useState } from 'react';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { capitalizeFirst } from '../lib/relative-time';
import dayjs from 'dayjs';
// Locales are opt-in per file in dayjs: without these the dates come out in
// English however the app is set, which is exactly what happened here.
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import { attendanceApi, type AttendanceRow } from '../lib/api';
import { usePermissions } from '../lib/permissions';
import { router } from 'expo-router';
import { useMayOpen } from '../lib/useMayOpen';
import { useAuth } from '../lib/auth';
import { saveAttendance, sendWaiting, waitingFigures } from '../lib/attendance-save';
import { AttendanceEditor, typicalOf } from './attendance/AttendanceEditor';

/**
 * Recording attendance for a meeting that has just been held — form S-3.
 *
 * It sits on the home screen rather than inside the reports section because
 * the number is counted AT the meeting and wants entering while it is still in
 * someone's hand. A weekly trip through Служение → Отчёты → Посещаемость is
 * the kind of errand people stop running, and the sheet then stays empty.
 *
 * Rebuilt 31 October 2026:
 *  - in the hall and by video, typed apart, saved as their sum;
 *  - after saving, the card stays until midnight as «Записано: 96 · изменить»
 *    — a slip is put right on the spot, not looked for in the sheet;
 *  - on a day without a meeting the holes of the year still show, as one
 *    line, instead of vanishing from Home until the next meeting;
 *  - no connection: the figure waits on the phone and goes by itself.
 */

/**
 * What Home shows about attendance, for those who enter it — or null when
 * there is nothing to show. The card and Home's «Нужно сделать» heading ask
 * the same question here.
 */
export function useAttendanceDue() {
  const perms = usePermissions();
  const pending = useQuery({
    queryKey: ['attendance', 'pending'],
    queryFn: () => attendanceApi.pending(),
    enabled: perms.canRecordAttendance,
    staleTime: 5 * 60 * 1000,
  });
  if (!perms.canRecordAttendance || !pending.data) return null;
  const meeting = pending.data.meetings?.[0] ?? null;
  const recorded = pending.data.recordedToday?.[0] ?? null;
  const outstanding = pending.data.outstandingThisYear ?? 0;
  if (!meeting && !recorded && outstanding === 0) return null;
  return {
    meeting,
    recorded,
    outstanding,
    previousYear: pending.data.outstandingPreviousYear ?? 0,
  };
}

export function AttendanceCard() {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const narrow = width < 420;
  const qc = useQueryClient();
  const { user } = useAuth();
  const [hall, setHall] = useState('');
  const [online, setOnline] = useState('');
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AttendanceRow | null>(null);
  const [waiting, setWaiting] = useState(0);
  const due = useAttendanceDue();
  const mayOpen = useMayOpen();
  const meeting = due?.meeting ?? null;
  const recorded = due?.recorded ?? null;

  // The current service year — for the «extra digit» check only.
  const startYear = dayjs().month() >= 8 ? dayjs().year() : dayjs().year() - 1;
  const year = useQuery({
    queryKey: ['attendance', 'year', startYear],
    queryFn: () => attendanceApi.serviceYear(startYear),
    enabled: !!meeting,
    staleTime: 10 * 60 * 1000,
  });

  // Figures that waited for a connection go as soon as Home is seen again.
  const uid = user?.id ?? null;
  useEffect(() => {
    let alive = true;
    void (async () => {
      const sent = await sendWaiting(uid);
      if (sent) void qc.invalidateQueries({ queryKey: ['attendance'] });
      const left = await waitingFigures(uid);
      if (alive) setWaiting(left.length);
    })();
    return () => {
      alive = false;
    };
  }, [uid, meeting?.date, recorded?.recordedAt]);

  if (!due) return null;

  const backlog = due.outstanding - (meeting ? 1 : 0);
  const backlogLine =
    backlog > 0 && mayOpen('/service-reports/attendance') ? (
      <Pressable
        onPress={() =>
          router.push(
            `/service-reports/attendance?from=${encodeURIComponent('/home')}` as never,
          )
        }
        style={[styles.backlog, !meeting && !recorded && styles.backlogAlone]}
        hitSlop={6}
        accessibilityRole="button"
      >
        {!meeting && !recorded ? (
          <View style={styles.iconSmall}>
            <Ionicons name="people-outline" size={15} color="#b45309" />
          </View>
        ) : null}
        <Text style={styles.backlogText}>
          {due.previousYear > 0
            ? t('attendance.backlogWithPrevious', {
                count: backlog,
                previous: due.previousYear,
              })
            : t('attendance.backlog', { count: backlog })}
        </Text>
        <Ionicons name="chevron-forward" size={14} color="#0e7490" />
      </Pressable>
    ) : null;

  // Nothing today — the holes of the year, as one line.
  if (!meeting && !recorded) {
    return backlogLine ? <View style={styles.stripWrap}>{backlogLine}</View> : null;
  }

  const target = meeting ?? (recorded as AttendanceRow);
  const h = hall.trim() === '' ? null : Number(hall.trim());
  const o = online.trim() === '' ? null : Number(online.trim());
  const valid =
    (h !== null || o !== null) &&
    (h === null || (Number.isInteger(h) && h >= 0)) &&
    (o === null || (Number.isInteger(o) && o >= 0));
  const total = (h ?? 0) + (o ?? 0);

  const save = async () => {
    if (!meeting || !valid || busy) return;
    setBusy(true);
    const out = await saveAttendance(
      uid,
      {
        date: meeting.date,
        eventType: meeting.eventType,
        count: total,
        onlineCount: o,
        expectNew: true,
      },
      { typical: typicalOf(year.data, meeting.eventType) },
    );
    setBusy(false);
    if (out === 'saved' || out === 'queued') {
      setHall('');
      setOnline('');
      setOnlineOpen(false);
      void qc.invalidateQueries({ queryKey: ['attendance'] });
      if (out === 'queued') setWaiting((n) => n + 1);
    }
  };

  const unrecordedRow: AttendanceRow | null = meeting
    ? { date: meeting.date, eventType: meeting.eventType, count: null, notHeld: false, recorded: false }
    : null;

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
          <Text style={styles.subtitle}>{t(`eventTypes.${target.eventType}`)}</Text>
          <Text style={styles.subtitleDate}>
            {capitalizeFirst(
              dayjs(target.date).locale(i18n.language).format('dddd, D MMMM'),
            )}
          </Text>
        </View>
      </View>

      {meeting ? (
        <>
          <View style={[styles.row, narrow && styles.rowStacked]}>
            <View style={styles.inputs}>
              <TextInput
                style={styles.input}
                value={hall}
                onChangeText={setHall}
                keyboardType="number-pad"
                placeholder={onlineOpen ? t('attendance.editor.inHall') : t('attendance.placeholder')}
                placeholderTextColor="#94a3b8"
                editable={!busy}
                returnKeyType="done"
                onSubmitEditing={() => void save()}
                maxLength={5}
                testID="attendance-card-hall"
              />
              {onlineOpen ? (
                <TextInput
                  style={[styles.input, styles.inputOnline]}
                  value={online}
                  onChangeText={setOnline}
                  keyboardType="number-pad"
                  placeholder={t('attendance.editor.online')}
                  placeholderTextColor="#94a3b8"
                  editable={!busy}
                  maxLength={5}
                  testID="attendance-card-online"
                />
              ) : null}
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.save,
                narrow && styles.saveWide,
                (!valid || busy) && styles.saveOff,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => void save()}
              disabled={!valid || busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveText}>
                  {onlineOpen && valid
                    ? t('attendance.editor.saveCount', { count: total })
                    : t('common.save')}
                </Text>
              )}
            </Pressable>
          </View>
          <View style={styles.links}>
            {!onlineOpen ? (
              <Pressable onPress={() => setOnlineOpen(true)} hitSlop={6}>
                <Text style={styles.link}>{t('attendance.card.addOnline')}</Text>
              </Pressable>
            ) : (
              <Text style={styles.sumHint}>{t('attendance.card.sumHint')}</Text>
            )}
            {/* A meeting that did not happen is not a zero, and recording it as
                one would drag every monthly average down. It opens the sheet,
                which asks why. */}
            <Pressable onPress={() => setEditing(unrecordedRow)} disabled={busy} hitSlop={6}>
              <Text style={styles.notHeld}>{t('attendance.notHeld')}…</Text>
            </Pressable>
          </View>
        </>
      ) : recorded ? (
        <View style={styles.done}>
          <Ionicons name="checkmark-circle" size={18} color="#15803d" />
          <View style={{ flex: 1 }}>
            <Text style={styles.doneText}>
              {recorded.notHeld
                ? t('attendance.card.doneNotHeld')
                : recorded.onlineCount !== null && recorded.onlineCount !== undefined
                  ? t('attendance.card.doneSplit', {
                      count: recorded.count,
                      online: recorded.onlineCount,
                    })
                  : t('attendance.card.done', { count: recorded.count })}
            </Text>
            <Text style={styles.doneBy}>
              {[
                recorded.recordedByName,
                recorded.recordedAt
                  ? dayjs(recorded.recordedAt).locale(i18n.language).format('HH:mm')
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pressable onPress={() => setEditing(recorded)} hitSlop={6} accessibilityRole="button">
            <Text style={styles.link}>{t('attendance.card.change')}</Text>
          </Pressable>
        </View>
      ) : null}

      {waiting > 0 ? (
        <Text style={styles.waiting}>{t('attendance.card.waiting', { count: waiting })}</Text>
      ) : null}

      {backlogLine}

      <AttendanceEditor
        visible={!!editing}
        row={editing}
        year={year.data}
        startNotHeld={!!editing && !editing.recorded}
        editable
        onClose={() => setEditing(null)}
        onSaved={() => void qc.invalidateQueries({ queryKey: ['attendance'] })}
      />
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
  stripWrap: {
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
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
  iconSmall: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, color: '#0f172a', fontFamily: 'Manrope_700Bold' },
  subtitle: { fontSize: 13.5, color: '#0f172a', marginTop: 1, fontFamily: 'Manrope_600SemiBold' },
  subtitleDate: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#64748b', marginTop: 1 },
  backlog: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  backlogAlone: { marginTop: 0, paddingVertical: 8, borderTopWidth: 0 },
  backlogText: { flex: 1, fontSize: 13, color: '#0e7490', fontFamily: 'Manrope_600SemiBold' },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  rowStacked: { flexDirection: 'column' },
  inputs: { flex: 1, flexDirection: 'row', gap: 8 },
  saveWide: { paddingVertical: 12, alignItems: 'center' },
  input: {
    fontFamily: 'Manrope_400Regular',
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  inputOnline: { backgroundColor: '#f5f3ff' },
  save: { paddingHorizontal: 18, justifyContent: 'center', borderRadius: 10, backgroundColor: '#0e7490' },
  saveOff: { backgroundColor: '#cbd5e1' },
  saveText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 14 },
  links: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 10 },
  link: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#0e7490' },
  sumHint: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 12, color: '#64748b' },
  notHeld: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    color: '#64748b',
    textDecorationLine: 'underline',
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 10,
  },
  doneText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#14532d' },
  doneBy: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: '#4d7c0f', marginTop: 1 },
  waiting: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#b45309', marginTop: 10 },
});
