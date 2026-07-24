import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
// Locales are opt-in per file in dayjs: without these the dates come out in
// English however the app is set, which is exactly what happened here.
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  AttendanceMonth,
  AttendanceRow,
  attendanceApi,
  extractErrorMessage,
  meetingSettingsApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { buildAttendancePdfHtml } from '../../../lib/attendancePdf';
import { exportHtmlAsPdf, openPrintWindow } from '../../../lib/pdf';
import { reportError, reportSuccess } from '../../../lib/error-bus';

/**
 * Meeting attendance for a service year — form S-3.
 *
 * One table, two uses: it is where a figure is corrected AND it is the sheet
 * handed to the circuit overseer. Keeping "the editable list" and "the report"
 * as separate screens would mean two things to keep in step, and the moment
 * they disagreed nobody would know which one was true.
 *
 * The service year runs September to August, so a month here is a row of
 * meetings, not a calendar box: some months hold four, some five, and one with
 * an assembly holds fewer. The average follows suit — it divides by the
 * meetings actually held, never by the calendar.
 */
export default function AttendanceScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const qc = useQueryClient();

  const now = dayjs();
  // Before September the current service year began last calendar year.
  const currentStart = now.month() >= 8 ? now.year() : now.year() - 1;
  const [year, setYear] = useState(currentStart);

  const query = useQuery({
    queryKey: ['attendance', 'year', year],
    queryFn: () => attendanceApi.serviceYear(year),
  });

  const overview = useQuery({
    queryKey: ['meeting-settings', 'overview'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 10 * 60 * 1000,
  });

  const print = () => {
    const data = query.data;
    if (!data) return;
    // Opened inside the click so the browser does not treat it as a popup.
    const preopened = openPrintWindow();
    const html = buildAttendancePdfHtml({
      year: data,
      congregationName: overview.data?.congregation?.name ?? '',
      monthName: (m) => dayjs(m).locale(i18n.language).format('MMMM YYYY'),
      printedOn: dayjs().locale(i18n.language).format('D MMMM YYYY'),
      labels: {
        title: t('attendance.pageTitle'),
        serviceYear: t('attendance.serviceYear', { from: year, to: year + 1 }),
        month: t('attendance.monthColumn'),
        total: t('attendance.totalShort'),
        average: t('attendance.averageShort'),
        midweek: t('eventTypes.midweek'),
        weekend: t('eventTypes.weekend'),
        notHeld: t('attendance.printLegend'),
        printed: t('attendance.printedOn'),
        yearAverage: t('attendance.yearAverageRow'),
      },
    });
    void exportHtmlAsPdf(html, { fileName: 'S-3', preopenedWindow: preopened });
  };

  const yearTotals = useMemo(() => {
    const months = query.data?.months ?? [];
    // The annual average the congregation report asks for: the monthly
    // averages added up and divided by twelve. Months with no meetings
    // recorded contribute nothing and are not counted, or a year begun in
    // March would read as though half the meetings were empty.
    const withMidweek = months.filter((m) => m.midweekAverage !== null);
    const withWeekend = months.filter((m) => m.weekendAverage !== null);
    const avg = (xs: number[]) =>
      xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
    return {
      midweek: avg(withMidweek.map((m) => m.midweekAverage as number)),
      weekend: avg(withWeekend.map((m) => m.weekendAverage as number)),
      monthsCounted: Math.max(withMidweek.length, withWeekend.length),
    };
  }, [query.data]);

  if (query.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.yearRow}>
        <Pressable
          onPress={() => setYear(year - 1)}
          hitSlop={10}
          style={styles.yearBtn}
        >
          <Ionicons name="chevron-back" size={20} color="#0e7490" />
        </Pressable>
        <Text style={styles.yearLabel}>
          {t('attendance.serviceYear', { from: year, to: year + 1 })}
        </Text>
        <Pressable onPress={print} hitSlop={10} style={styles.printBtn}>
          <Ionicons name="print-outline" size={20} color="#0e7490" />
        </Pressable>
        <Pressable
          onPress={() => setYear(year + 1)}
          hitSlop={10}
          style={[styles.yearBtn, year >= currentStart && styles.yearBtnOff]}
          disabled={year >= currentStart}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={year >= currentStart ? '#cbd5e1' : '#0e7490'}
          />
        </Pressable>
      </View>

      {/* What the annual report actually asks for, stated once at the top so
          nobody has to add up twelve numbers by hand. */}
      <View style={styles.summary}>
        <SummaryCell
          label={t('assignments.eventTypeShort.midweek')}
          value={yearTotals.midweek}
          t={t}
        />
        <SummaryCell
          label={t('assignments.eventTypeShort.weekend')}
          value={yearTotals.weekend}
          t={t}
        />
      </View>
      <Text style={styles.summaryNote}>
        {t('attendance.yearAverageNote', { count: yearTotals.monthsCounted })}
      </Text>

      {(query.data?.months ?? []).map((month) => (
        <MonthBlock
          key={month.month}
          month={month}
          language={i18n.language}
          editable={perms.canRecordAttendance}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['attendance'] })}
        />
      ))}
    </ScrollView>
  );
}

function SummaryCell({
  label,
  value,
  t,
}: {
  label: string;
  value: number | null;
  t: (k: string) => string;
}) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>
        {value === null ? '—' : value}
      </Text>
      <Text style={styles.summaryCaption}>{t('attendance.average')}</Text>
    </View>
  );
}

function MonthBlock({
  month,
  language,
  editable,
  onSaved,
}: {
  month: AttendanceMonth;
  language: string;
  editable: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const empty = month.midweek.length === 0 && month.weekend.length === 0;

  return (
    <View style={[styles.month, empty && styles.monthEmpty]}>
      <View style={styles.monthHead}>
        <Text style={styles.monthName}>
          {dayjs(month.month).locale(language).format('MMMM YYYY')}
        </Text>
        {!empty ? (
          <Text style={styles.monthTotals}>
            {t('attendance.average')}:{' '}
            {month.midweekAverage ?? '—'} / {month.weekendAverage ?? '—'}
          </Text>
        ) : null}
      </View>

      {empty ? (
        <Text style={styles.monthNothing}>{t('attendance.nothingYet')}</Text>
      ) : (
        <>
          <MeetingList
            rows={month.midweek}
            kind="midweek"
            language={language}
            editable={editable}
            onSaved={onSaved}
          />
          <MeetingList
            rows={month.weekend}
            kind="weekend"
            language={language}
            editable={editable}
            onSaved={onSaved}
          />
        </>
      )}
    </View>
  );
}

function MeetingList({
  rows,
  kind,
  language,
  editable,
  onSaved,
}: {
  rows: AttendanceRow[];
  kind: 'midweek' | 'weekend';
  language: string;
  editable: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <View style={styles.kindBlock}>
      <Text style={styles.kindLabel}>
        {t(`assignments.eventTypeShort.${kind}`)}
      </Text>
      {rows.map((r, i) => (
        <MeetingRow
          key={`${r.date}-${r.eventType}`}
          row={r}
          index={i}
          language={language}
          editable={editable}
          onSaved={onSaved}
        />
      ))}
    </View>
  );
}

function MeetingRow({
  row,
  index,
  language,
  editable,
  onSaved,
}: {
  row: AttendanceRow;
  index: number;
  language: string;
  editable: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(row.count ?? ''));

  const save = useMutation({
    mutationFn: (count: number) =>
      attendanceApi.record({ date: row.date, eventType: row.eventType, count }),
    onSuccess: () => {
      setEditing(false);
      reportSuccess(t('attendance.saved'));
      onSaved();
    },
    onError: (e) => reportError(extractErrorMessage(e)),
  });

  const parsed = Number(value.trim());
  const valid = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0;

  return (
    <View style={styles.rowWrap}>
    <View style={styles.row}>
      {/* Week by week, said plainly: the ordinal within the month is what the
          form's five columns mean, and seeing 1-2-3-4 run without a break is
          how a reader knows nothing was missed. */}
      <Text style={styles.rowWeek}>{index + 1}</Text>
      <Text style={styles.rowDate}>
        {dayjs(row.date).locale(language).format('D MMM')}
      </Text>

      {editing ? (
        <>
          <TextInput
            style={styles.rowInput}
            value={value}
            onChangeText={setValue}
            keyboardType="number-pad"
            autoFocus
            onSubmitEditing={() => valid && save.mutate(parsed)}
          />
          <Pressable
            onPress={() => valid && save.mutate(parsed)}
            disabled={!valid || save.isPending}
            hitSlop={8}
            style={styles.rowAction}
          >
            {save.isPending ? (
              <ActivityIndicator size="small" />
            ) : (
              <Ionicons
                name="checkmark"
                size={20}
                color={valid ? '#0e7490' : '#cbd5e1'}
              />
            )}
          </Pressable>
        </>
      ) : (
        <>
          {/* Three states, told apart on purpose. A meeting not held is said
              in words, never as a zero — a zero would say nobody came. A
              meeting nobody entered is shown as a gap, so the eye catches the
              break in the run instead of sliding past a shorter list. */}
          {row.notHeld ? (
            <Text style={[styles.rowValue, styles.rowNotHeld]}>
              {t('attendance.notHeldShort')}
            </Text>
          ) : !row.recorded ? (
            <Text style={[styles.rowValue, styles.rowMissing]}>
              {t('attendance.missing')}
            </Text>
          ) : (
            <Text style={styles.rowValue}>{row.count}</Text>
          )}
          {editable ? (
            <Pressable
              onPress={() => {
                setValue(String(row.count ?? ''));
                setEditing(true);
              }}
              hitSlop={8}
              style={styles.rowAction}
            >
              <Ionicons name="pencil-outline" size={16} color="#94a3b8" />
            </Pressable>
          ) : (
            <View style={styles.rowAction} />
          )}
        </>
      )}
    </View>

    {/* Who put the figure there and when. A sheet that goes to the circuit
        overseer should carry its own account of itself; a correction is
        proper, but it should be visible rather than buried in the journal. */}
    {row.recorded && !editing ? (
      <Text style={styles.signature}>
        {[
          row.recordedByName,
          row.recordedAt
            ? dayjs(row.recordedAt).locale(language).format('D MMM, HH:mm')
            : null,
          row.corrected ? t('attendance.corrected') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 12, paddingBottom: 40 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 12,
  },
  yearBtn: { padding: 6 },
  printBtn: { padding: 6 },
  yearBtnOff: { opacity: 0.4 },
  yearLabel: {
    fontSize: 16,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
  },

  summary: { flexDirection: 'row', gap: 10 },
  summaryCell: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryLabel: { fontSize: 12.5, color: '#64748b' },
  summaryValue: {
    fontSize: 28,
    color: '#0e7490',
    fontFamily: 'Manrope_700Bold',
    marginVertical: 2,
  },
  summaryCaption: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryNote: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },

  month: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthEmpty: { opacity: 0.55 },
  monthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthName: {
    fontSize: 15,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    textTransform: 'capitalize',
  },
  monthTotals: { fontSize: 12.5, color: '#64748b' },
  monthNothing: { fontSize: 13, color: '#94a3b8', marginTop: 6 },

  kindBlock: { marginTop: 10 },
  kindLabel: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 2,
  },
  rowWrap: { paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  signature: {
    fontSize: 11.5,
    color: '#94a3b8',
    marginLeft: 76,
    marginTop: -4,
    marginBottom: 4,
  },
  rowWeek: {
    width: 18,
    fontSize: 11.5,
    color: '#cbd5e1',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  rowDate: { width: 58, fontSize: 13.5, color: '#475569' },
  rowValue: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    fontFamily: 'Manrope_600SemiBold',
  },
  rowMissing: {
    color: '#b45309',
    fontStyle: 'italic',
    fontFamily: undefined,
    fontSize: 13,
  },
  rowNotHeld: {
    color: '#94a3b8',
    fontStyle: 'italic',
    fontFamily: undefined,
    fontSize: 13,
  },
  rowInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#0e7490',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    color: '#0f172a',
  },
  rowAction: { width: 28, alignItems: 'center' },
});
