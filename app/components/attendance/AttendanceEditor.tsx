import { useEffect, useMemo, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import { Sheet } from '../Sheet';
import { confirm } from '../ConfirmHost';
import { WIDE_FROM } from '../../lib/screen-width';
import { capitalizeFirst } from '../../lib/relative-time';
import {
  attendanceApi,
  extractErrorMessage,
  type AttendanceInput,
  type AttendanceRow,
  type AttendanceYear,
  type NotHeldReason,
} from '../../lib/api';
import { saveAttendance } from '../../lib/attendance-save';
import { reportError, reportSuccess } from '../../lib/error-bus';
import { useAuth } from '../../lib/auth';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BRAND = '#0e7490';
const AMBER = '#b45309';

export const KIND_COLOR: Record<string, string> = {
  midweek: '#0e7490',
  weekend: '#7c3aed',
  memorial: '#be123c',
};

/** Whole numbers only, empty allowed. */
function parseCount(v: string): number | null | 'bad' {
  const s = v.trim();
  if (s === '') return null;
  if (!/^\d+$/.test(s)) return 'bad';
  return Number(s);
}

/** The usual figure for this kind of meeting — for the «extra digit» check. */
export function typicalOf(
  year: AttendanceYear | null | undefined,
  kind: string,
): number | null {
  if (!year) return null;
  if (kind === 'midweek')
    return year.yearly?.midweekAverage ?? year.previous?.midweekAverage ?? null;
  if (kind === 'weekend')
    return year.yearly?.weekendAverage ?? year.previous?.weekendAverage ?? null;
  return null;
}

/** «S-1 за октябрь уже отправлен…», when a form went out with this figure. */
export function sentWarningOf(
  year: AttendanceYear | null | undefined,
  date: string,
  t: (k: string, o?: Record<string, unknown>) => string,
  language: string,
): string | null {
  if (!year?.sent) return null;
  const parts: string[] = [];
  if (year.sent.annual) {
    parts.push(
      t('attendance.check.sentAnnual', {
        midweek: year.sent.annual.midweekAverage ?? '—',
        weekend: year.sent.annual.weekendAverage ?? '—',
      }),
    );
  }
  if (year.sent.months.includes(date.slice(0, 7))) {
    parts.push(
      t('attendance.check.sentMonthly', {
        month: dayjs(date).locale(language).format('MMMM'),
      }),
    );
  }
  return parts.length ? parts.join(' ') : null;
}

/**
 * One meeting's figure — entered, corrected, marked «not held» with its
 * reason, moved to the right day or taken away (31 October 2026).
 *
 * In the hall and by video are typed apart «для понимания»; what is saved
 * and what every form reads is their sum.
 */
export function AttendanceEditor({
  visible,
  row,
  year,
  editable,
  onClose,
  onSaved,
  startNotHeld,
}: {
  visible: boolean;
  /** Open on «Встречи не было» — the card's link leads straight there. */
  startNotHeld?: boolean;
  row: AttendanceRow | null;
  year: AttendanceYear | null | undefined;
  editable: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const [hall, setHall] = useState('');
  const [online, setOnline] = useState('');
  const [notHeld, setNotHeld] = useState(false);
  const [reason, setReason] = useState<NotHeldReason | null>(null);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !row) return;
    const on = row.onlineCount ?? null;
    setOnline(on === null ? '' : String(on));
    setHall(
      row.count === null || row.count === undefined
        ? ''
        : String(row.count - (on ?? 0)),
    );
    setNotHeld(row.notHeld || !!startNotHeld);
    setReason(row.notHeldReason ?? null);
    setNote(row.note ?? '');
    setNoteOpen(!!row.note);
    setBusy(false);
  }, [visible, row?.date, row?.eventType, row?.recordedAt]);

  const h = parseCount(hall);
  const o = parseCount(online);
  const total =
    h === 'bad' || o === 'bad' || (h === null && o === null)
      ? null
      : (h ?? 0) + (o ?? 0);
  const figureReady =
    h !== 'bad' && o !== 'bad' && (h !== null || o !== null);
  const ready = notHeld ? reason !== null : figureReady;

  // A figure that stands on a day which lost its meeting can go to a meeting
  // of the same kind near it that has none.
  const moveTargets = useMemo(() => {
    if (!row?.offSchedule || !year?.gaps) return [];
    const at = dayjs(row.date);
    return year.gaps.filter(
      (g) =>
        g.eventType === row.eventType &&
        Math.abs(dayjs(g.date).diff(at, 'day')) <= 10,
    );
  }, [row, year?.gaps]);

  if (!row) return null;

  const kindLabel = t(`eventTypes.${row.eventType}`);
  const dayLabel = capitalizeFirst(
    dayjs(row.date).locale(i18n.language).format('dddd, D MMMM YYYY'),
  );
  const ctx = {
    typical: typicalOf(year, row.eventType),
    sentWarning: row.recorded
      ? sentWarningOf(year, row.date, t, i18n.language)
      : null,
  };

  const save = async () => {
    if (!ready || busy || total === null) return;
    setBusy(true);
    const base = {
      date: row.date,
      eventType: row.eventType,
      note: note.trim() || null,
      ...(row.recorded && row.recordedAt
        ? { expectedRecordedAt: row.recordedAt }
        : { expectNew: true }),
    };
    const input: AttendanceInput = notHeld
      ? { ...base, notHeld: true, notHeldReason: reason }
      : {
          ...base,
          count: total,
          onlineCount: o === null || o === 'bad' ? null : o,
        };
    const out = await saveAttendance(user?.id ?? null, input, ctx);
    setBusy(false);
    if (out === 'saved' || out === 'queued') {
      onSaved();
      onClose();
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('attendance.editor.removeTitle'),
      body: t('attendance.editor.removeBody', {
        kind: kindLabel.toLowerCase(),
        date: dayjs(row.date).locale(i18n.language).format('D MMMM'),
      }),
      confirmLabel: t('attendance.editor.remove'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await attendanceApi.remove({ date: row.date, eventType: row.eventType });
      reportSuccess(t('attendance.editor.removed'));
      onSaved();
      onClose();
    } catch (e) {
      reportError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const move = async (toDate: string) => {
    setBusy(true);
    try {
      await attendanceApi.move({
        date: row.date,
        eventType: row.eventType,
        toDate,
      });
      reportSuccess(t('attendance.editor.moved'));
      onSaved();
      onClose();
    } catch (e) {
      reportError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const signature = row.recorded
    ? [
        row.recordedByName,
        row.recordedAt
          ? dayjs(row.recordedAt).locale(i18n.language).format('D MMM, HH:mm')
          : null,
        row.corrected ? t('attendance.corrected') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <Sheet
      visible={visible}
      title={kindLabel}
      subtitle={dayLabel}
      onClose={onClose}
      closeLabel={editable ? t('common.cancel') : undefined}
      variant={width >= WIDE_FROM ? 'centered' : 'bottom'}
      footer={
        editable ? (
          <Pressable
            style={[styles.btn, (!ready || busy) && { opacity: 0.45 }]}
            disabled={!ready || busy}
            onPress={() => void save()}
            accessibilityRole="button"
            testID="attendance-save"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>
                {notHeld
                  ? t('attendance.editor.saveNotHeld')
                  : total
                    ? t('attendance.editor.saveCount', { count: total })
                    : t('common.save')}
              </Text>
            )}
          </Pressable>
        ) : undefined
      }
    >
      <View style={{ gap: 14 }}>
        {row.offSchedule ? (
          <View style={styles.notice}>
            <Ionicons name="calendar-outline" size={16} color={AMBER} />
            <Text style={styles.noticeText}>{t('attendance.editor.offSchedule')}</Text>
          </View>
        ) : null}

        {!editable ? (
          <ReadOnly row={row} />
        ) : (
          <>
            <View style={styles.seg}>
              {[false, true].map((nh) => (
                <Pressable
                  key={String(nh)}
                  onPress={() => setNotHeld(nh)}
                  style={[styles.segBtn, notHeld === nh && styles.segOn]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.segText, notHeld === nh && styles.segTextOn]}>
                    {nh ? t('attendance.notHeld') : t('attendance.editor.held')}
                  </Text>
                </Pressable>
              ))}
            </View>

            {!notHeld ? (
              <>
                <View style={styles.row}>
                  <View style={styles.field}>
                    <Text style={styles.label}>{t('attendance.editor.inHall')}</Text>
                    <TextInput
                      value={hall}
                      onChangeText={setHall}
                      keyboardType="number-pad"
                      style={styles.input}
                      autoFocus={!row.recorded}
                      placeholder="0"
                      placeholderTextColor="#cbd5e1"
                      maxLength={5}
                      testID="attendance-hall"
                    />
                  </View>
                  <Text style={styles.plus}>+</Text>
                  <View style={styles.field}>
                    <Text style={styles.label}>{t('attendance.editor.online')}</Text>
                    <TextInput
                      value={online}
                      onChangeText={setOnline}
                      keyboardType="number-pad"
                      style={styles.input}
                      placeholder="0"
                      placeholderTextColor="#cbd5e1"
                      maxLength={5}
                      testID="attendance-online"
                    />
                  </View>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t('attendance.editor.total')}</Text>
                  <Text style={styles.totalValue}>{total ?? '—'}</Text>
                </View>
                <Text style={styles.hint}>{t('attendance.editor.sumHint')}</Text>
              </>
            ) : (
              <View style={{ gap: 8 }}>
                <Text style={styles.label}>{t('attendance.editor.why')}</Text>
                <View style={styles.chips}>
                  {(['weather', 'hall', 'other'] as const).map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => setReason(r)}
                      style={[styles.chip, reason === r && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, reason === r && styles.chipTextOn]}>
                        {t(`attendance.reason.${r}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>{t('attendance.editor.notHeldHint')}</Text>
              </View>
            )}

            {noteOpen || notHeld ? (
              <View style={{ gap: 6 }}>
                <Text style={styles.label}>{t('attendance.editor.note')}</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  style={[styles.noteInput]}
                  multiline
                  maxLength={500}
                  placeholder={t('attendance.editor.notePlaceholder')}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            ) : (
              <Pressable onPress={() => setNoteOpen(true)} hitSlop={6}>
                <Text style={styles.link}>{t('attendance.editor.addNote')}</Text>
              </Pressable>
            )}

            {moveTargets.length ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.label}>{t('attendance.editor.moveTo')}</Text>
                <View style={styles.chips}>
                  {moveTargets.map((g) => (
                    <Pressable
                      key={g.date}
                      onPress={() => void move(g.date)}
                      disabled={busy}
                      style={styles.chip}
                    >
                      <Text style={styles.chipText}>
                        {capitalizeFirst(
                          dayjs(g.date).locale(i18n.language).format('dd, D MMM'),
                        )}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}

        {signature ? <Text style={styles.signature}>{signature}</Text> : null}

        {editable && row.recorded ? (
          <Pressable onPress={() => void remove()} disabled={busy} hitSlop={6}>
            <Text style={styles.remove}>{t('attendance.editor.remove')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}

function ReadOnly({ row }: { row: AttendanceRow }) {
  const { t } = useTranslation();
  if (!row.recorded) {
    return <Text style={[styles.hint, { color: AMBER }]}>{t('attendance.missing')}</Text>;
  }
  if (row.notHeld) {
    return (
      <Text style={styles.readValue}>
        {t('attendance.notHeld')}
        {row.notHeldReason ? ` · ${t(`attendance.reason.${row.notHeldReason}`)}` : ''}
      </Text>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.readValue}>{row.count}</Text>
      {row.onlineCount !== null && row.onlineCount !== undefined ? (
        <Text style={styles.hint}>
          {t('attendance.split', {
            hall: (row.count ?? 0) - row.onlineCount,
            online: row.onlineCount,
          })}
        </Text>
      ) : null}
      {row.note ? <Text style={styles.hint}>«{row.note}»</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 3,
  },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segOn: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: MUTED },
  segTextOn: { fontFamily: 'Manrope_700Bold', color: INK },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  field: { flex: 1, gap: 6 },
  plus: { fontFamily: 'Manrope_700Bold', fontSize: 20, color: '#94a3b8', paddingBottom: 12 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: MUTED },
  input: {
    borderWidth: 1.5,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
    color: INK,
    textAlign: 'center',
    backgroundColor: '#fff',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  totalLabel: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK },
  totalValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 26, color: BRAND },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, lineHeight: 18, color: MUTED },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: LINE, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#334155' },
  chipTextOn: { color: '#fff' },
  noteInput: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 56,
    backgroundColor: '#fff',
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    color: INK,
    textAlignVertical: 'top',
  },
  link: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: BRAND },
  notice: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 10,
  },
  noticeText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 12.5, lineHeight: 18, color: '#92400e' },
  signature: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: '#94a3b8' },
  remove: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  readValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 26, color: INK },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5, color: '#fff' },
});
