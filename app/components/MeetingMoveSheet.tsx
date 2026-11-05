import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet } from './Sheet';
import { TimeField } from './TimeField';
import { extractErrorMessage, MyAssignmentItem, meetingMovesApi } from '../lib/api';
import { notify } from '../lib/error-bus';
import { taskTitle } from '../lib/my-tasks';
import { MEETING_MOVES_KEY } from '../lib/useMeetingMoves';
import { invalidateAfterEventChange } from '../lib/special-event-effects';
import type { MeetingKind, WeekRules } from '../lib/week-rules';

/**
 * Moving a meeting for one week (4 November 2026) — the approved mockup:
 * screen 2 (which meeting, the new day of THAT week, the hour, the hall or
 * another place, «было → станет») and screen 3 (who is told, who of those
 * with a part is away that day). The server holds every rule and has the
 * last word; this sheet only keeps a person from asking for what will be
 * refused anyway, and says why in place.
 */
export function MeetingMoveSheet({
  visible,
  onClose,
  rules,
  initialKind,
  canMove,
  todayISO,
  hallAddress: hallRaw,
}: {
  visible: boolean;
  onClose: () => void;
  /** The week's rules, moves included. */
  rules: WeekRules;
  initialKind: MeetingKind;
  canMove: Record<MeetingKind, boolean>;
  todayISO: string;
  /** The hall's address from the settings in force that week. */
  hallAddress: string | null;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const week = rules.weekStartISO;
  const hallAddress = hallRaw?.trim() ?? '';

  const [kind, setKind] = useState<MeetingKind>(initialKind);
  const [step, setStep] = useState<'form' | 'check'>('form');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [other, setOther] = useState(false);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  const meeting = rules.meetingOf(kind);
  const usual = meeting.moved?.from ?? { date: meeting.date, time: meeting.time };
  const otherKind: MeetingKind = kind === 'midweek' ? 'weekend' : 'midweek';
  const otherMeeting = rules.meetingOf(otherKind);
  const visitHoldsDay = kind === 'midweek' && !!rules.coVisit;

  // Start from what it is now — the move in place, or the usual day and hour.
  useEffect(() => {
    if (!visible) return;
    const m = rules.meetingOf(kind);
    setStep('form');
    setDate(m.date ?? '');
    setTime(m.time ?? '');
    const moved = m.moved?.move.address?.trim() ?? '';
    setOther(!!moved);
    setAddress(moved);
  }, [visible, kind, rules]);

  useEffect(() => {
    if (visible) setKind(initialKind);
  }, [visible, initialKind]);

  const days = useMemo(() => {
    const start = new Date(`${week}T00:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        iso,
        dow: new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(d),
        num: d.getDate(),
        blocked: otherMeeting.held && otherMeeting.date === iso,
        usual: usual.date === iso,
      };
    });
  }, [week, i18n.language, otherMeeting.held, otherMeeting.date, usual.date]);

  const fmtDay = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'long' }).format(
          new Date(`${iso}T00:00:00`),
        )
      : '—';
  const when = (d: string | null, h: string | null) => [fmtDay(d), h].filter(Boolean).join(' · ');
  const placeText = other ? address.trim() : t('schedule.move.hall');

  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const sameAsUsual =
    date === usual.date && time === usual.time && (!other || !address.trim() || address.trim() === hallAddress);
  // Pressing «Дальше» on the move already in place would announce it again
  // to everyone; nothing new — nothing to send.
  const current = meeting.moved?.move;
  const sameAsNow =
    !!current &&
    date === current.date &&
    time === current.time.slice(0, 5) &&
    (other ? address.trim() : '') === (current.address?.trim() ?? '');
  const canNext =
    canMove[kind] &&
    meeting.held &&
    !visitHoldsDay &&
    !!date &&
    timeOk &&
    (!other || !!address.trim()) &&
    !sameAsUsual &&
    !sameAsNow;
  const past = (usual.date ?? date) < todayISO || date < todayISO || (meeting.date ?? date) < todayISO;

  const preview = useQuery({
    queryKey: ['meeting-move-preview', week, kind, date],
    queryFn: () => meetingMovesApi.preview(week, kind, date),
    enabled: visible && step === 'check' && !!date,
    staleTime: 0,
  });

  const submit = async () => {
    setBusy(true);
    try {
      await meetingMovesApi.move(week, kind, {
        date,
        time,
        address: other ? address.trim() : null,
      });
      await refreshAfterMove(qc);
      notify(t('schedule.move.done'), undefined, 'success');
      onClose();
    } catch (err) {
      notify(t('common.error'), extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const title = t('schedule.move.title');
  const range = `${fmtDay(week)} – ${fmtDay(days[6]?.iso ?? week)}`;

  if (step === 'check') {
    const p = preview.data;
    return (
      <Sheet
        visible={visible}
        variant="bottom"
        onClose={onClose}
        closeLabel={t('common.cancel')}
        title={t('schedule.move.checkTitle')}
        subtitle={`${t(`schedule.move.${kind}`)}: ${when(usual.date, usual.time)} → ${when(date, time)}`}
        footer={
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              style={[styles.primary, (busy || preview.isLoading) && styles.disabled]}
              disabled={busy || preview.isLoading}
              onPress={submit}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>
                  {past ? t('schedule.move.confirmPast') : t('schedule.move.confirm')}
                </Text>
              )}
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => setStep('form')}>
              <Text style={styles.secondaryText}>{t('schedule.move.back')}</Text>
            </Pressable>
          </View>
        }
      >
        {preview.isLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : preview.isError ? (
          <Text style={styles.error}>{extractErrorMessage(preview.error)}</Text>
        ) : p ? (
          <View style={{ gap: 14 }}>
            {past ? (
              <Text style={styles.note}>{t('schedule.move.pastNote')}</Text>
            ) : (
              <>
                <View style={styles.box}>
                  <Text style={styles.boxTitle}>{t('schedule.move.toAll', { count: p.members })}</Text>
                  <Text style={styles.body}>{t('schedule.move.toAllBody')}</Text>
                </View>
                <View style={styles.box}>
                  <Text style={styles.boxTitle}>{t('schedule.move.toAssigned', { count: p.ownNotice })}</Text>
                  <Text style={styles.body}>{t('schedule.move.toAssignedBody')}</Text>
                </View>
              </>
            )}
            {p.away.length > 0 ? (
              <View style={styles.warn}>
                <Text style={styles.warnTitle}>{t('schedule.move.away', { count: p.away.length })}</Text>
                <Text style={styles.warnBody}>
                  {p.away
                    .map(
                      (a) =>
                        `${a.name} (${a.items
                          .map((it) => taskTitle({ ...it, sortDate: date } as MyAssignmentItem, t))
                          .join(', ')})`,
                    )
                    .join('; ')}
                </Text>
                <Text style={styles.warnBody}>{t('schedule.move.awayNote')}</Text>
              </View>
            ) : null}
            <Text style={styles.body}>{t('schedule.move.travels')}</Text>
          </View>
        ) : null}
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      variant="bottom"
      onClose={onClose}
      closeLabel={t('common.cancel')}
      title={title}
      subtitle={t('schedule.move.subtitle', { range })}
      footer={
        <View style={styles.footer}>
          <View style={styles.summary}>
            <Text style={styles.body}>
              {t('schedule.move.was')}: <Text style={styles.bold}>{when(usual.date, usual.time)}</Text>
            </Text>
            <Text style={styles.body}>
              {t('schedule.move.becomes')}:{' '}
              <Text style={styles.bold}>{date ? `${when(date, timeOk ? time : null)}, ${placeText || '—'}` : '—'}</Text>
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={[styles.primary, !canNext && styles.disabled]}
            disabled={!canNext}
            onPress={() => setStep('check')}
          >
            <Text style={styles.primaryText}>{t('schedule.move.next')}</Text>
          </Pressable>
        </View>
      }
    >
      <Text style={styles.label}>{t('schedule.move.which')}</Text>
      <View style={styles.segment}>
        {(['midweek', 'weekend'] as const).map((k) => {
          const m = rules.meetingOf(k);
          const on = kind === k;
          const enabled = canMove[k] && m.held;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: !enabled }}
              disabled={!enabled}
              onPress={() => setKind(k)}
              style={[styles.segmentItem, on && styles.segmentOn, !enabled && styles.disabled]}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                {t(`schedule.move.${k}`)}
                {m.date ? ` · ${new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(new Date(`${m.date}T00:00:00`))} ${m.time ?? ''}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {visitHoldsDay ? (
        <Text style={styles.note}>{t('schedule.move.visitNote')}</Text>
      ) : (
        <>
          <Text style={styles.label}>{t('schedule.move.day')}</Text>
          <View style={styles.days}>
            {days.map((d) => {
              const on = d.iso === date;
              return (
                <Pressable
                  key={d.iso}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: d.blocked }}
                  disabled={d.blocked}
                  onPress={() => setDate(d.iso)}
                  style={[styles.day, d.usual && styles.dayUsual, on && styles.dayOn, d.blocked && styles.dayBlocked]}
                >
                  <Text style={[styles.dayDow, on && styles.dayTextOn]}>{d.dow}</Text>
                  <Text style={[styles.dayNum, on && styles.dayTextOn, d.blocked && styles.struck]}>{d.num}</Text>
                  {d.usual ? <Text style={styles.dayUsualText}>{t('schedule.move.usual')}</Text> : null}
                </Pressable>
              );
            })}
          </View>
          {otherMeeting.held ? <Text style={styles.hint}>{t('schedule.move.otherDayNote')}</Text> : null}

          <Text style={styles.label}>{t('schedule.move.time')}</Text>
          <View style={styles.row}>
            <TimeField value={time} onChange={setTime} />
            {usual.time ? <Text style={styles.hint}>{t('schedule.move.usualTime', { time: usual.time })}</Text> : null}
          </View>

          <Text style={styles.label}>{t('schedule.move.place')}</Text>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: !other }}
            onPress={() => setOther(false)}
            style={[styles.option, !other && styles.optionOn]}
          >
            <Text style={styles.optionTitle}>{t('schedule.move.hall')}</Text>
            {hallAddress ? <Text style={styles.hint}>{hallAddress}</Text> : null}
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: other }}
            onPress={() => setOther(true)}
            style={[styles.option, other && styles.optionOn]}
          >
            <Text style={styles.optionTitle}>{t('schedule.move.other')}</Text>
          </Pressable>
          {other ? (
            <TextInput
              value={address}
              onChangeText={setAddress}
              placeholder={t('schedule.move.addressPlaceholder')}
              maxLength={300}
              style={styles.input}
              accessibilityLabel={t('schedule.move.addressPlaceholder')}
            />
          ) : null}
        </>
      )}
    </Sheet>
  );
}

/**
 * After a move, everything that hangs on the meeting's day is asked again:
 * the moves themselves (the rules), and what the server works out from the
 * day — attendance, readiness, duties, the summary, the visit schedule.
 */
export async function refreshAfterMove(qc: QueryClient): Promise<void> {
  // The same as after an event, plus the moves themselves, attendance (its
  // figure may have moved with the meeting) and the visit schedule.
  invalidateAfterEventChange(qc);
  await Promise.all(
    [MEETING_MOVES_KEY, ['attendance'], ['co-visit-meetings']].map((queryKey) =>
      qc.invalidateQueries({ queryKey: queryKey as readonly unknown[] }),
    ),
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: '#475569', marginTop: 16, marginBottom: 8 },
  body: { fontSize: 13.5, fontFamily: 'Manrope_500Medium', color: '#334155' },
  bold: { fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  hint: { fontSize: 12.5, fontFamily: 'Manrope_500Medium', color: '#475569', marginTop: 6 },
  note: {
    fontSize: 13.5,
    fontFamily: 'Manrope_500Medium',
    color: '#334155',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  error: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: '#b91c1c', marginTop: 16 },
  segment: { flexDirection: 'row', backgroundColor: '#eef2f7', borderRadius: 12, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentOn: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  segmentText: { fontSize: 13.5, fontFamily: 'Manrope_600SemiBold', color: '#475569', textAlign: 'center' },
  segmentTextOn: { color: '#0f172a', fontFamily: 'Manrope_700Bold' },
  days: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  dayUsual: { borderStyle: 'dashed', borderColor: '#94a3b8', backgroundColor: '#f8fafc' },
  dayOn: { borderWidth: 2, borderStyle: 'solid', borderColor: '#0e7490', backgroundColor: '#ecfeff' },
  dayBlocked: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  dayDow: { fontSize: 11, fontFamily: 'Manrope_500Medium', color: '#475569' },
  dayNum: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  dayTextOn: { color: '#0e7490' },
  dayUsualText: { fontSize: 9, fontFamily: 'Manrope_500Medium', color: '#475569' },
  struck: { textDecorationLine: 'line-through', color: '#94a3b8' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  option: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 12, marginBottom: 8, minHeight: 48 },
  optionOn: { borderWidth: 2, borderColor: '#0e7490', backgroundColor: '#ecfeff' },
  optionTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
    color: '#0f172a',
  },
  footer: { gap: 10 },
  summary: { backgroundColor: '#f1f5f9', borderRadius: 10, padding: 10, gap: 2 },
  primary: { minHeight: 50, borderRadius: 12, backgroundColor: '#0e7490', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontFamily: 'Manrope_700Bold' },
  secondary: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#0e7490', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  disabled: { opacity: 0.45 },
  box: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, backgroundColor: '#f8fafc', gap: 4 },
  boxTitle: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: '#475569' },
  warn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', borderRadius: 12, padding: 12, gap: 4 },
  warnTitle: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: '#9a3412' },
  warnBody: { fontSize: 13, fontFamily: 'Manrope_500Medium', color: '#7c2d12' },
});
