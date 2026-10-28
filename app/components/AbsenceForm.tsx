import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MonthCalendar } from './MonthCalendar';
import { formatDay, formatDayRange } from '../lib/date-range';
import { clashLines, useAbsenceClashes } from '../lib/useAbsenceClashes';
import { PublisherSelector } from './PublisherSelector';
import { useAllPublishers } from '../lib/useAllPublishers';
import { Ionicons } from '@expo/vector-icons';
import {
  Absence,
  absencesApi,
  CreateAbsenceInput,
  extractErrorMessage,
} from '../lib/api';

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtRange(a: Absence, loc: string): string {
  const start = new Date(`${a.startDate}T00:00:00`);
  const opts = { day: 'numeric', month: 'long' } as const;
  if (!a.endDate) return start.toLocaleDateString(loc, opts);
  const end = new Date(`${a.endDate}T00:00:00`);
  return `${start.toLocaleDateString(loc, opts)} – ${end.toLocaleDateString(loc, opts)}`;
}

interface Props {
  initial?: Absence;
  submitting?: boolean;
  error?: unknown;
  /** `others` — more people away on the same days (a family), new absences only. */
  onSubmit: (input: CreateAbsenceInput, others?: string[]) => void;
  onCancel?: () => void;
  /** When set, the publisher is fixed (self-service) and the picker is hidden. */
  lockedPublisher?: { id: string; label: string };
  /** Pre-selected publisher for a NEW absence; still changeable (managers). */
  defaultPublisher?: { id: string; label: string };
  /** Offer «add another person» — those who keep others' absences, new ones only. */
  allowOthers?: boolean;
}

export function AbsenceForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
  lockedPublisher,
  defaultPublisher,
  allowOthers,
}: Props) {
  const { t, i18n } = useTranslation();

  const [publisherId, setPublisherId] = useState<string | null>(
    lockedPublisher?.id ?? initial?.publisherId ?? defaultPublisher?.id ?? null,
  );
  // The screen learns who «I» am only once my card has loaded — often after
  // the form has mounted. The locked name was shown, but the choice stayed
  // empty, and a publisher could not save his own absence (28 September):
  // «Выберите возвещателя» under a name he could not change.
  const lateId = lockedPublisher?.id ?? defaultPublisher?.id ?? null;
  useEffect(() => {
    if (lockedPublisher) setPublisherId(lockedPublisher.id);
    else if (lateId) setPublisherId((cur) => cur ?? lateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lateId]);

  const [startDate, setStartDate] = useState<string | null>(initial?.startDate ?? null);
  // Null — one day. An old one-day absence may carry its end equal to its start.
  const [endDate, setEndDate] = useState<string | null>(
    initial?.endDate && initial.endDate !== initial.startDate ? initial.endDate : null,
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [others, setOthers] = useState<{ id: string; label: string }[]>([]);
  const peopleQ = useAllPublishers({ enabled: !!allowOthers });
  const nameOf = useMemo(
    () => new Map((peopleQ.data?.data ?? []).map((p) => [p.id, p.displayName])),
    [peopleQ.data],
  );
  // Re-opens the calendars on the chosen month after a quick button.
  const [jump, setJump] = useState(0);
  const [width, setWidth] = useState(0);
  const twoMonths = width >= 620;

  /**
   * ONE GESTURE FOR A SPAN (28 October 2026). There used to be a switch
   * «Несколько дней» to turn on first; with it off, a second tap only moved
   * the date, and nobody could tell why a span would not come. Now: the first
   * tap is a day, the second the end; a tap inside the span makes it the new
   * end; any other tap starts again.
   */
  const pickDay = (iso: string) => {
    if (!startDate) {
      setStartDate(iso);
      setEndDate(null);
    } else if (!endDate) {
      if (iso < startDate) setStartDate(iso);
      else if (iso > startDate) setEndDate(iso);
    } else if (iso > startDate && iso < endDate) {
      setEndDate(iso);
    } else {
      setStartDate(iso);
      setEndDate(null);
    }
  };
  const quick = (days: number | 'month') => {
    const base = startDate ?? toISODate(new Date());
    const b = new Date(`${base}T00:00:00`);
    const end =
      days === 'month'
        ? new Date(b.getFullYear(), b.getMonth() + 1, 0)
        : new Date(b.getFullYear(), b.getMonth(), b.getDate() + days - 1);
    setStartDate(base);
    setEndDate(days === 1 ? null : toISODate(end) === base ? null : toISODate(end));
    setJump((n) => n + 1);
  };
  const span = startDate
    ? Math.round((+new Date(`${endDate ?? startDate}T00:00:00`) - +new Date(`${startDate}T00:00:00`)) / 86400000) + 1
    : 0;
  const multiDay = !!endDate;

  const { data: existingAbsences } = useQuery({
    queryKey: ['absences', 'overlap', publisherId],
    queryFn: () => absencesApi.list({ publisherId: publisherId!, all: true }),
    enabled: !!publisherId,
    staleTime: 60 * 1000,
  });

  const overlaps = useMemo<Absence[]>(() => {
    if (!publisherId || !startDate) return [];
    const selEnd = (multiDay ? endDate : startDate) ?? startDate;
    return (existingAbsences ?? []).filter((a) => {
      if (initial && a.id === initial.id) return false;
      const aEnd = a.endDate ?? a.startDate;
      return a.startDate <= selEnd && aEnd >= startDate;
    });
  }, [existingAbsences, publisherId, startDate, endDate, multiDay, initial]);

  const valid = !!publisherId && !!startDate;

  // What each of them is given on these days — seen before saving, so the
  // one who enters it knows whom to tell.
  const { clashes } = useAbsenceClashes(
    startDate
      ? [publisherId, ...others.map((o) => o.id)]
          .filter((x): x is string => !!x)
          .map((pid) => ({ key: pid, publisherId: pid, startDate, endDate }))
      : [],
  );
  const clashNames = new Map<string, string>([
    ...(lockedPublisher ? [[lockedPublisher.id, lockedPublisher.label] as [string, string]] : []),
    ...(publisherId && nameOf.get(publisherId) ? [[publisherId, nameOf.get(publisherId)!] as [string, string]] : []),
    ...others.map((o) => [o.id, o.label] as [string, string]),
  ]);

  const submit = () => {
    if (!valid || !publisherId || !startDate) return;
    onSubmit(
      {
        publisherId,
        startDate,
        // A change from several days to one must clear the old end: an
        // update leaves out what it is not sent, so one day is sent as an end
        // equal to the start.
        endDate: multiDay ? endDate ?? undefined : initial ? startDate : undefined,
        note: note.trim() || undefined,
      },
      others.map((o) => o.id).filter((id) => id !== publisherId),
    );
  };

  return (
    <View>
      {/* ---- Publisher ----
          The same picker as the other fourteen places that choose a person,
          rather than a list of its own. The list of its own asked the server
          for a thousand rows; the server allows two hundred, refused the whole
          request, and — since nothing reports a failed READ — the refusal
          arrived as an empty list under the words «нет совпадений». */}
      {lockedPublisher ? (
        <>
          <Text style={styles.label}>{t('absences.fields.publisher')}</Text>
          <View style={styles.selectedRow}>
            <Text style={styles.selectedName}>{lockedPublisher.label}</Text>
          </View>
        </>
      ) : (
        <View style={styles.selectorSlot}>
          <PublisherSelector
            boxed
            label={t('absences.fields.publisher')}
            value={publisherId}
            onChange={setPublisherId}
          />
        </View>
      )}

      {allowOthers && !initial ? (
        <View style={styles.others}>
          {others.map((o) => (
            <View key={o.id} style={styles.otherChip}>
              <Text style={styles.otherText}>{o.label}</Text>
              <Pressable
                onPress={() => setOthers((list) => list.filter((x) => x.id !== o.id))}
                hitSlop={8}
                accessibilityLabel={t('common.remove')}
              >
                <Ionicons name="close" size={15} color="#0369a1" />
              </Pressable>
            </View>
          ))}
          <PublisherSelector
            boxed
            label={t('absences.form.addPerson')}
            value={null}
            onChange={(id) => {
              if (!id || id === publisherId || others.some((o) => o.id === id)) return;
              setOthers((list) => [...list, { id, label: nameOf.get(id) ?? '' }]);
            }}
          />
        </View>
      ) : null}

      {/* ---- Date(s) ---- */}
      <Text style={styles.label}>{t('absences.fields.dates')}</Text>
      <View style={styles.quickRow}>
        {(
          [
            [1, 'absences.quick.day'],
            [7, 'absences.quick.week'],
            [14, 'absences.quick.twoWeeks'],
            ['month', 'absences.quick.month'],
          ] as const
        ).map(([d, key]) => (
          <Pressable key={key} onPress={() => quick(d)} style={styles.quickChip} testID={`absence-quick-${d}`}>
            <Text style={styles.quickText}>{t(key)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.calendarBox} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={twoMonths ? styles.twoMonths : undefined}>
          {(twoMonths ? [0, 1] : [0]).map((off) => (
            <View key={`${jump}-${off}`} style={twoMonths ? styles.month : undefined}>
              <MonthCalendar
                compact={!twoMonths}
                hidePresets
                mode="range"
                start={startDate}
                end={endDate}
                onChange={() => {}}
                onPickDay={pickDay}
                monthOffset={off}
                ownMonthOnly={twoMonths}
                locale={i18n.language}
              />
            </View>
          ))}
        </View>
        <Text style={[styles.summary, !startDate && styles.summaryEmpty]} testID="absence-summary">
          {startDate
            ? endDate
              ? `${formatDayRange(startDate, endDate, i18n.language, { month: 'short' })}  ·  ${t('absences.form.days', { count: span })}`
              : `${formatDay(startDate, i18n.language, { weekday: 'short', month: 'short' })}  ·  ${t('absences.form.oneDay')}`
            : t('absences.form.tapHint')}
        </Text>
      </View>

      {clashes.size > 0 ? (
        <View style={styles.clashBox} testID="absence-form-clash">
          <Ionicons name="warning-outline" size={16} color="#9a3412" />
          <View style={styles.flex}>
            {[...clashes.entries()].map(([pid, list]) => (
              <Text key={pid} style={styles.clashText}>
                {clashes.size > 1 || others.length > 0 ? `${clashNames.get(pid) ?? ''}: ` : ''}
                {t('absences.clash.form', { list: clashLines(list, i18n.language).join('; ') })}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {/* ---- Note ---- */}
      <Text style={styles.label}>{t('absences.fields.note')}</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t('absences.placeholders.note')}
        placeholderTextColor="#94a3b8"
        style={styles.noteInput}
        multiline
      />

      {overlaps.length > 0 ? (
        <View style={styles.overlapBox}>
          <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
          <Text style={styles.overlapText}>
            {t('absences.overlapWarning')}{' '}
            {overlaps.map((a) => fmtRange(a, i18n.language)).join(', ')}
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text style={styles.errorText}>{extractErrorMessage(error)}</Text>
      ) : null}

      {!valid && !error ? (
        <Text style={styles.hintText}>
          {!publisherId
            ? t('absences.form.needPublisher')
            : t('absences.form.needDate')}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {onCancel ? (
          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={onCancel}
            disabled={submitting}
          >
            <Text style={styles.btnGhostText}>{t('absences.actions.cancel')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.btn, styles.btnPrimary, !valid && styles.btnDisabled]}
          onPress={submit}
          disabled={!valid || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>
              {initial
                ? t('absences.actions.save')
                : t('absences.actions.create')}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 6,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    padding: 12,
  },
  selectedName: { fontSize: 16, fontFamily: 'Manrope_600SemiBold', color: '#0369a1' },
  /** The selector brings its own label and spacing; this only sets it apart
   *  from the switch below it, the way `label` does for the other fields. */
  selectorSlot: { marginTop: 16 },
  flex: { flex: 1 },
  others: { marginTop: 10, gap: 8 },
  otherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  otherText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#0369a1' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  quickChip: { backgroundColor: '#e0f2fe', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
  quickText: { fontSize: 12.5, fontFamily: 'Manrope_700Bold', color: '#0369a1' },
  twoMonths: { flexDirection: 'row', gap: 20 },
  month: { flex: 1 },
  summary: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 15,
    color: '#0f172a',
    textAlign: 'center',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  summaryEmpty: { fontFamily: 'Manrope_500Medium', color: '#94a3b8', fontSize: 13.5 },
  clashBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#fff7ed',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  clashText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#9a3412', lineHeight: 19 },
  calendarBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    marginTop: 4,
  },
  noteInput: {
    fontFamily: 'Manrope_400Regular',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    minHeight: 64,
    textAlignVertical: 'top',
  },
  overlapBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 10,
    marginTop: 14,
  },
  overlapText: { fontFamily: 'Manrope_400Regular', flex: 1, fontSize: 13, color: '#92400e' },
  errorText: { fontFamily: 'Manrope_400Regular', color: '#b91c1c', marginTop: 12 },
  hintText: { fontFamily: 'Manrope_400Regular', color: '#64748b', marginTop: 12, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#0ea5e9' },
  btnPrimaryText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 16 },
  btnGhost: { backgroundColor: '#f1f5f9' },
  btnGhostText: { color: '#475569', fontFamily: 'Manrope_600SemiBold', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
});
