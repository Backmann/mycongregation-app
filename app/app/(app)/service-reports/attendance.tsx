import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
// Locales are opt-in per file in dayjs: without these the dates come out in
// English however the app is set, which is exactly what happened here.
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  AttendanceMonth,
  AttendanceRow,
  AttendanceYear,
  attendanceApi,
  meetingSettingsApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { LoadFailure } from '../../../components/LoadFailure';
import { buildAttendancePdfHtml } from '../../../lib/attendancePdf';
import { exportHtmlAsPdf, openPrintWindow } from '../../../lib/pdf';
import { failsScreen } from '../../../lib/screen-failure';
import { capitalizeFirst } from '../../../lib/relative-time';
import {
  AttendanceEditor,
  KIND_COLOR,
} from '../../../components/attendance/AttendanceEditor';

const INK = '#0f172a';
const MUTED = '#64748b';
const FAINT = '#94a3b8';
const LINE = '#e2e8f0';
const BRAND = '#0e7490';
const AMBER = '#b45309';

/** From this width the year is the S-3 sheet itself — a table. */
const TABLE_FROM = 720;
/** …and from this one the gaps and the run of months stand beside it. */
const SIDE_FROM = 1040;

type Kind = 'midweek' | 'weekend';

/**
 * Meeting attendance for a service year — form S-3 (rebuilt 31 October 2026).
 *
 * One page, two uses: it is where a figure is entered or corrected AND it is
 * the sheet handed to the circuit overseer. On a wide screen it IS the sheet
 * — months down, the weeks across, midweek and weekend side by side, as on
 * paper; a tap on a cell opens that meeting. On a phone a month is a card of
 * tiles, the month being lived in first.
 *
 * Everything counted here comes counted from the server — the year's line,
 * how many meetings have a figure, the holes, last year — so the page, the
 * printed sheet and the S-10 can no longer disagree (the printed sheet once
 * divided by twelve in October and said 16 where the page said 96).
 *
 * Three states are told apart everywhere: a figure; a meeting not held, said
 * in words and grey; a meeting nobody entered, amber, in its place in the run.
 */
export default function AttendanceScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const qc = useQueryClient();
  const [width, setWidth] = useState(0);

  const now = dayjs();
  // Before September the current service year began last calendar year.
  const currentStart = now.month() >= 8 ? now.year() : now.year() - 1;
  const [year, setYear] = useState(currentStart);
  const [open, setOpen] = useState<AttendanceRow | null>(null);

  const query = useQuery({
    throwOnError: failsScreen,
    queryKey: ['attendance', 'year', year],
    queryFn: () => attendanceApi.serviceYear(year),
  });
  const overview = useQuery({
    queryKey: ['meeting-settings', 'overview'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 10 * 60 * 1000,
  });
  const data = query.data;

  const rowsByKey = useMemo(() => {
    const m = new Map<string, AttendanceRow>();
    for (const mo of data?.months ?? []) {
      for (const r of [...mo.midweek, ...mo.weekend, ...(mo.memorial ?? [])]) {
        m.set(`${r.date}|${r.eventType}`, r);
      }
    }
    return m;
  }, [data]);

  const lastEntry = useMemo(() => {
    let best: AttendanceRow | null = null;
    for (const r of rowsByKey.values()) {
      if (r.recordedAt && (!best || r.recordedAt > (best.recordedAt ?? ''))) best = r;
    }
    return best;
  }, [rowsByKey]);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['attendance'] });

  const print = () => {
    if (!data) return;
    // Opened inside the click so the browser does not treat it as a popup.
    const preopened = openPrintWindow();
    const html = buildAttendancePdfHtml({
      year: data,
      congregationName: overview.data?.congregation?.name ?? '',
      monthName: (m) => dayjs(m).locale(i18n.language).format('MMMM YYYY'),
      dayName: (d) => dayjs(d).locale(i18n.language).format('D MMMM'),
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
        memorial: t('eventTypes.memorial'),
        printed: t('attendance.printedOn'),
        yearAverage: t('attendance.yearAverageRow'),
        months: (n: number) => t('attendance.print.basis', { count: n }),
        incomplete: (n: number) => t('attendance.print.incomplete', { count: n }),
      },
    });
    void exportHtmlAsPdf(html, { fileName: 'S-3', preopenedWindow: preopened });
  };

  if (query.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }
  // Opened by address without the right to it, the server says no (the sheet
  // is for the elders and those who record it); said as a «no», not as an
  // empty year.
  if (query.error || !data) {
    return (
      <View style={styles.screen}>
        <LoadFailure error={query.error} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const table = width >= TABLE_FROM;
  const side = width >= SIDE_FROM;
  const gaps = (data.gaps ?? [])
    .map((g) => rowsByKey.get(`${g.date}|${g.eventType}`))
    .filter((r): r is AttendanceRow => !!r);
  const thisMonth = now.format('YYYY-MM-01');

  const gapsCard = gaps.length ? (
    <GapsCard
      rows={gaps}
      onOpen={setOpen}
      language={i18n.language}
      editable={perms.canRecordAttendance}
    />
  ) : null;
  const runCard = <RunCard data={data} language={i18n.language} />;
  const lastCard = lastEntry ? (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('attendance.page.lastEntry')}</Text>
      <Text style={styles.lastLine}>
        {[
          lastEntry.recordedByName,
          dayjs(lastEntry.recordedAt).locale(i18n.language).format('D MMMM, HH:mm'),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </View>
  ) : null;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, table && styles.contentWide]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <View style={styles.bar}>
          <View style={styles.year}>
            <Pressable
              onPress={() => setYear(year - 1)}
              hitSlop={10}
              style={styles.chev}
              accessibilityLabel={t('attendance.page.prevYear')}
            >
              <Ionicons name="chevron-back" size={18} color={BRAND} />
            </Pressable>
            <Text style={styles.yearLabel}>
              {t('attendance.serviceYear', { from: year, to: year + 1 })}
            </Text>
            <Pressable
              onPress={() => setYear(year + 1)}
              hitSlop={10}
              style={styles.chev}
              disabled={year >= currentStart}
              accessibilityLabel={t('attendance.page.nextYear')}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={year >= currentStart ? '#cbd5e1' : BRAND}
              />
            </Pressable>
          </View>
          <Pressable onPress={print} style={styles.printBtn} accessibilityRole="button">
            <Ionicons name="print-outline" size={16} color={BRAND} />
            {table ? <Text style={styles.printText}>{t('attendance.page.print')}</Text> : null}
          </Pressable>
        </View>

        <Kpis data={data} wide={table} />

        {data.sent?.annual ? (
          <View style={styles.sentNote}>
            <Ionicons name="paper-plane-outline" size={14} color={MUTED} />
            <Text style={styles.sentText}>
              {t('attendance.page.sentAnnual', {
                midweek: data.sent.annual.midweekAverage ?? '—',
                weekend: data.sent.annual.weekendAverage ?? '—',
              })}
            </Text>
          </View>
        ) : null}

        {side ? (
          <View style={styles.split}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Sheet3
                data={data}
                language={i18n.language}
                thisMonth={thisMonth}
                onOpen={setOpen}
              />
            </View>
            <View style={styles.sideCol}>
              {gapsCard}
              {runCard}
              {lastCard}
            </View>
          </View>
        ) : table ? (
          <>
            {gapsCard}
            <Sheet3 data={data} language={i18n.language} thisMonth={thisMonth} onOpen={setOpen} />
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>{runCard}</View>
              {lastCard ? <View style={{ flex: 1 }}>{lastCard}</View> : null}
            </View>
          </>
        ) : (
          <>
            {gapsCard}
            <PhoneMonths data={data} language={i18n.language} thisMonth={thisMonth} onOpen={setOpen} />
            {lastCard}
          </>
        )}
      </ScrollView>

      <AttendanceEditor
        visible={!!open}
        row={open}
        year={data}
        editable={perms.canRecordAttendance}
        onClose={() => setOpen(null)}
        onSaved={refresh}
      />
    </View>
  );
}

// ---- the four figures at the top -------------------------------------------

function Kpis({ data, wide }: { data: AttendanceYear; wide: boolean }) {
  const { t } = useTranslation();
  const y = data.yearly;
  const memorial = data.months.flatMap((m) => m.memorial ?? []).find((r) => r.recorded);
  const recorded = y?.recorded ?? 0;
  const expected = y?.expected ?? 0;
  const complete = expected === 0 || recorded === expected;
  const cell = (
    label: string,
    value: number | null | undefined,
    sub: string,
    extra?: string | null,
    color?: string,
  ) => (
    <View style={[styles.kpi, wide && styles.kpiWide]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <View style={styles.kpiValueRow}>
        <Text style={[styles.kpiValue, color ? { color } : null]}>{value ?? '—'}</Text>
        {extra ? <Text style={styles.kpiExtra}>{extra}</Text> : null}
      </View>
      <Text style={styles.kpiSub}>{sub}</Text>
    </View>
  );
  const prev = (v: number | null | undefined) =>
    v === null || v === undefined ? null : t('attendance.page.lastYear', { value: v });
  const online = (v: number | null | undefined) =>
    v === null || v === undefined ? null : t('attendance.page.onlineShare', { value: v });
  return (
    <View style={styles.kpis}>
      {cell(
        t('attendance.page.midweekYear'),
        y?.midweekAverage,
        [t('attendance.page.basis', { count: y?.midweekMonths ?? 0 }), online(y?.midweekOnlineAverage)]
          .filter(Boolean)
          .join(' · '),
        prev(data.previous?.midweekAverage),
      )}
      {cell(
        t('attendance.page.weekendYear'),
        y?.weekendAverage,
        [t('attendance.page.basis', { count: y?.weekendMonths ?? 0 }), online(y?.weekendOnlineAverage)]
          .filter(Boolean)
          .join(' · '),
        prev(data.previous?.weekendAverage),
      )}
      <View style={[styles.kpi, wide && styles.kpiWide]}>
        <Text style={styles.kpiLabel}>{t('attendance.page.recorded')}</Text>
        <View style={styles.kpiValueRow}>
          <Text style={[styles.kpiValue, { color: complete ? BRAND : AMBER }]}>{recorded}</Text>
          <Text style={styles.kpiExtra}>{t('attendance.page.ofMeetings', { count: expected })}</Text>
        </View>
        <View style={styles.progress}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${expected ? Math.round((recorded / expected) * 100) : 0}%`,
                backgroundColor: complete ? BRAND : '#f59e0b',
              },
            ]}
          />
        </View>
      </View>
      {cell(
        t('eventTypes.memorial'),
        memorial && !memorial.notHeld ? memorial.count : null,
        memorial
          ? dayjs(memorial.date).format('D.MM.YYYY')
          : t('attendance.page.memorialAhead'),
      )}
    </View>
  );
}

// ---- «Нужно внести» ------------------------------------------------------------

function GapsCard({
  rows,
  onOpen,
  language,
  editable,
}: {
  rows: AttendanceRow[];
  onOpen: (r: AttendanceRow) => void;
  language: string;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const shown = [...rows].reverse().slice(0, 8);
  return (
    <View style={[styles.card, styles.gapsCard]}>
      <Text style={[styles.cardTitle, { color: '#92400e' }]}>
        {t('attendance.page.toEnter', { count: rows.length })}
      </Text>
      {shown.map((r) => (
        <Pressable
          key={`${r.date}|${r.eventType}`}
          style={styles.gapItem}
          onPress={() => onOpen(r)}
          accessibilityRole="button"
        >
          <View style={[styles.dot, { backgroundColor: KIND_COLOR[r.eventType] }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.gapKind}>{t(`assignments.eventTypeShort.${r.eventType}`)}</Text>
            <Text style={styles.gapDay}>
              {capitalizeFirst(dayjs(r.date).locale(language).format('dddd, D MMMM'))}
            </Text>
          </View>
          <Text style={styles.gapAction}>
            {editable ? t('attendance.page.enter') : t('attendance.page.look')}
          </Text>
        </Pressable>
      ))}
      {rows.length > shown.length ? (
        <Text style={styles.more}>
          {t('attendance.page.moreGaps', { count: rows.length - shown.length })}
        </Text>
      ) : null}
      <Text style={styles.gapNote}>{t('attendance.page.gapsNote')}</Text>
    </View>
  );
}

// ---- the run of months (a small chart, no library) -----------------------------

function RunCard({ data, language }: { data: AttendanceYear; language: string }) {
  const { t } = useTranslation();
  const values = data.months.flatMap((m) => [m.midweekAverage ?? 0, m.weekendAverage ?? 0]);
  const prevValues = (data.previous?.months ?? []).flatMap((m) => [
    m.midweekAverage ?? 0,
    m.weekendAverage ?? 0,
  ]);
  const max = Math.max(1, ...values, ...prevValues);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('attendance.page.byMonth')}</Text>
      <View style={styles.chart}>
        {data.months.map((m, i) => {
          const p = data.previous?.months[i];
          return (
            <View key={m.month} style={styles.chartCol}>
              <View style={styles.chartBars}>
                {(['midweek', 'weekend'] as Kind[]).map((k) => {
                  const v = k === 'midweek' ? m.midweekAverage : m.weekendAverage;
                  const pv = p ? (k === 'midweek' ? p.midweekAverage : p.weekendAverage) : null;
                  return (
                    <View key={k} style={styles.chartSlot}>
                      {pv ? (
                        <View
                          style={[styles.chartPrev, { bottom: `${(pv / max) * 100}%` }]}
                        />
                      ) : null}
                      <View
                        style={[
                          styles.chartBar,
                          {
                            height: v ? `${(v / max) * 100}%` : 2,
                            backgroundColor: v ? KIND_COLOR[k] : LINE,
                          },
                        ]}
                      />
                    </View>
                  );
                })}
              </View>
              <Text style={styles.chartLabel}>
                {dayjs(m.month).locale(language).format('MMM').slice(0, 3)}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <Legend color={KIND_COLOR.midweek} label={t('assignments.eventTypeShort.midweek')} />
        <Legend color={KIND_COLOR.weekend} label={t('assignments.eventTypeShort.weekend')} />
        {data.previous ? <Legend color="#94a3b8" label={t('attendance.page.prevYearMark')} line /> : null}
      </View>
    </View>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          line ? styles.legendLine : styles.legendSwatch,
          { backgroundColor: color },
        ]}
      />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

// ---- the sheet itself (wide) ---------------------------------------------------

function Sheet3({
  data,
  language,
  thisMonth,
  onOpen,
}: {
  data: AttendanceYear;
  language: string;
  thisMonth: string;
  onOpen: (r: AttendanceRow) => void;
}) {
  const { t } = useTranslation();
  const memorial = data.months.flatMap((m) => m.memorial ?? []);
  const y = data.yearly;
  return (
    <View style={styles.sheet}>
      <View style={styles.tr}>
        <View style={styles.mnCell} />
        <GroupHead kind="midweek" />
        <View style={styles.gapCol} />
        <GroupHead kind="weekend" />
      </View>
      <View style={[styles.tr, styles.thRow]}>
        <Text style={[styles.th, styles.mnCell, { textAlign: 'left' }]}>
          {t('attendance.monthColumn')}
        </Text>
        <HeadCells />
        <View style={styles.gapCol} />
        <HeadCells />
      </View>
      {data.months.map((m) => {
        const future = m.month > thisMonth;
        return (
          <View
            key={m.month}
            style={[styles.tr, styles.monthRow, m.month === thisMonth && styles.curRow]}
          >
            <View style={styles.mnCell}>
              <Text style={[styles.mn, future && { color: '#cbd5e1' }]}>
                {capitalizeFirst(dayjs(m.month).locale(language).format('MMMM YYYY'))}
              </Text>
              {m.month === thisMonth ? (
                <Text style={styles.nowPill}>{t('attendance.page.now')}</Text>
              ) : null}
            </View>
            {future ? (
              <Text style={styles.ahead}>{t('attendance.page.ahead')}</Text>
            ) : (
              <>
                <KindCells month={m} kind="midweek" onOpen={onOpen} language={language} prev={data.previous} />
                <View style={styles.gapCol} />
                <KindCells month={m} kind="weekend" onOpen={onOpen} language={language} prev={data.previous} />
              </>
            )}
          </View>
        );
      })}
      <View style={[styles.tr, styles.footRow]}>
        <Text style={[styles.footLabel, styles.mnCell]}>
          {t('attendance.yearAverageRow')}
        </Text>
        <YearFoot value={y?.midweekAverage} months={y?.midweekMonths ?? 0} />
        <View style={styles.gapCol} />
        <YearFoot value={y?.weekendAverage} months={y?.weekendMonths ?? 0} />
      </View>
      {memorial.length ? (
        <View style={styles.memorialRow}>
          <View style={[styles.dot, { backgroundColor: KIND_COLOR.memorial }]} />
          <Text style={styles.memorialLabel}>{t('eventTypes.memorial')}</Text>
          {memorial.map((r) => (
            <Pressable key={r.date} onPress={() => onOpen(r)} style={styles.memorialCell}>
              <Text style={styles.memorialDay}>
                {dayjs(r.date).locale(language).format('D MMMM')}
              </Text>
              <Text style={[styles.memorialValue, !r.recorded && { color: AMBER }]}>
                {r.notHeld
                  ? '—'
                  : r.recorded
                    ? String(r.count)
                    : t('attendance.page.enterShort')}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function GroupHead({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  return (
    <View style={styles.groupHead}>
      <Text style={[styles.groupPill, { backgroundColor: KIND_COLOR[kind] }]}>
        {t(`attendance.page.group.${kind}`)}
      </Text>
    </View>
  );
}

function HeadCells() {
  const { t } = useTranslation();
  return (
    <View style={styles.kindCells}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Text key={n} style={[styles.th, styles.cellW]}>
          {n}
        </Text>
      ))}
      <Text style={[styles.th, styles.thWord, styles.totW]}>{t('attendance.totalShort')}</Text>
      <Text style={[styles.th, styles.thWord, styles.avgW]}>{t('attendance.averageShort')}</Text>
    </View>
  );
}

function KindCells({
  month,
  kind,
  onOpen,
  language,
  prev,
}: {
  month: AttendanceMonth;
  kind: Kind;
  onOpen: (r: AttendanceRow) => void;
  language: string;
  prev: AttendanceYear['previous'];
}) {
  const { t } = useTranslation();
  const rows = kind === 'midweek' ? month.midweek : month.weekend;
  const total = kind === 'midweek' ? month.midweekTotal : month.weekendTotal;
  const avg = kind === 'midweek' ? month.midweekAverage : month.weekendAverage;
  const missing = (kind === 'midweek' ? month.midweekMissing : month.weekendMissing) ?? 0;
  const held = rows.filter((r) => r.recorded && !r.notHeld).length;
  const p = prev?.months.find((pm) => pm.month.slice(5) === month.month.slice(5));
  const pv = p ? (kind === 'midweek' ? p.midweekAverage : p.weekendAverage) : null;
  // A month with a sixth meeting of a kind (a visit week, a figure off the
  // usual days) keeps it: the run grows rather than losing one.
  const slots = Math.max(5, rows.length);
  return (
    <View style={styles.kindCells}>
      {Array.from({ length: slots }, (_, i) => rows[i]).map((r, i) =>
        r ? (
          <Cell key={`${r.date}|${i}`} row={r} onOpen={onOpen} language={language} />
        ) : (
          <View key={`e${i}`} style={[styles.cellW, styles.cellEmpty]} />
        ),
      )}
      <Text style={[styles.tot, styles.totW]}>{total || ''}</Text>
      <View style={styles.avgW}>
        <Text style={styles.avg}>{avg ?? ''}</Text>
        {missing > 0 && avg !== null ? (
          <Text style={styles.partial}>{t('attendance.page.ofHeld', { count: held, total: held + missing })}</Text>
        ) : pv ? (
          <Text style={styles.prevAvg}>{t('attendance.page.prevShort', { value: pv })}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Cell({
  row,
  onOpen,
  language,
}: {
  row: AttendanceRow;
  onOpen: (r: AttendanceRow) => void;
  language: string;
}) {
  const { t } = useTranslation();
  const day = dayjs(row.date).locale(language).format('D MMM');
  return (
    <Pressable
      onPress={() => onOpen(row)}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        styles.cellW,
        styles.cell,
        row.notHeld && styles.cellNotHeld,
        !row.recorded && styles.cellGap,
        (hovered || pressed) && row.recorded && !row.notHeld && styles.cellHover,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${t(`eventTypes.${row.eventType}`)}, ${day}`}
    >
      <Text
        style={[
          styles.cellValue,
          row.notHeld && styles.cellValueNotHeld,
          !row.recorded && styles.cellValueGap,
        ]}
      >
        {row.notHeld ? '—' : row.recorded ? row.count : t('attendance.page.enterShort')}
      </Text>
      <Text style={styles.cellDay}>
        {day}
        {row.offSchedule || row.note ? ' •' : ''}
      </Text>
    </Pressable>
  );
}

function YearFoot({ value, months }: { value: number | null | undefined; months: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.kindCells}>
      <Text style={[styles.footNote, { flex: 1 }]}>
        {months ? t('attendance.page.basis', { count: months }) : ''}
      </Text>
      <Text style={[styles.footValue, styles.avgW]}>{value ?? '—'}</Text>
    </View>
  );
}

// ---- a phone: a month is a card of tiles --------------------------------------

function PhoneMonths({
  data,
  language,
  thisMonth,
  onOpen,
}: {
  data: AttendanceYear;
  language: string;
  thisMonth: string;
  onOpen: (r: AttendanceRow) => void;
}) {
  const { t } = useTranslation();
  const begun = data.months.filter((m) => m.month <= thisMonth);
  const ahead = data.months.filter((m) => m.month > thisMonth);
  return (
    <>
      {[...begun].reverse().map((m) => {
        const missing = (m.midweekMissing ?? 0) + (m.weekendMissing ?? 0);
        const empty = m.midweek.length + m.weekend.length + (m.memorial?.length ?? 0) === 0;
        return (
          <View key={m.month} style={styles.card}>
            <View style={styles.phoneHead}>
              <Text style={styles.phoneMonth}>
                {capitalizeFirst(dayjs(m.month).locale(language).format('MMMM YYYY'))}
              </Text>
              {!empty ? (
                <Text style={styles.phoneAvg}>
                  {t('attendance.page.monthAvg', {
                    midweek: m.midweekAverage ?? '—',
                    weekend: m.weekendAverage ?? '—',
                  })}
                  {missing ? ` · ${t('attendance.page.incomplete')}` : ''}
                </Text>
              ) : null}
            </View>
            {empty ? (
              <Text style={styles.nothing}>{t('attendance.nothingYet')}</Text>
            ) : (
              <>
                {(['midweek', 'weekend'] as Kind[]).map((k) => {
                  const rows = k === 'midweek' ? m.midweek : m.weekend;
                  if (!rows.length) return null;
                  return (
                    <View key={k}>
                      <Text style={styles.kindLabel}>{t(`assignments.eventTypeShort.${k}`)}</Text>
                      <View style={styles.tiles}>
                        {rows.map((r) => (
                          <Tile key={r.date} row={r} onOpen={onOpen} language={language} />
                        ))}
                      </View>
                    </View>
                  );
                })}
                {m.memorial?.length ? (
                  <View>
                    <Text style={styles.kindLabel}>{t('eventTypes.memorial')}</Text>
                    <View style={styles.tiles}>
                      {m.memorial.map((r) => (
                        <Tile key={r.date} row={r} onOpen={onOpen} language={language} />
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>
        );
      })}
      {ahead.length ? (
        <Text style={styles.aheadLine}>
          {t('attendance.page.aheadMonths', {
            from: dayjs(ahead[0].month).locale(language).format('MMMM'),
            to: dayjs(ahead[ahead.length - 1].month).locale(language).format('MMMM'),
          })}
        </Text>
      ) : null}
    </>
  );
}

function Tile({
  row,
  onOpen,
  language,
}: {
  row: AttendanceRow;
  onOpen: (r: AttendanceRow) => void;
  language: string;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => onOpen(row)}
      style={[styles.tile, row.notHeld && styles.cellNotHeld, !row.recorded && styles.cellGap]}
      accessibilityRole="button"
    >
      <Text
        style={[
          styles.tileValue,
          row.notHeld && styles.cellValueNotHeld,
          !row.recorded && styles.cellValueGap,
        ]}
      >
        {row.notHeld ? '—' : row.recorded ? row.count : t('attendance.page.enterShort')}
      </Text>
      <Text style={styles.cellDay}>
        {dayjs(row.date).locale(language).format('D')}
        {row.offSchedule || row.note ? ' •' : ''}
      </Text>
    </Pressable>
  );
}

const CELL = 46;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 14, paddingBottom: 48, gap: 12 },
  contentWide: { padding: 20, gap: 14 },

  bar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  year: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 6,
    maxWidth: 340,
  },
  chev: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  yearLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  printBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  printText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: BRAND },

  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 16,
    padding: 14,
  },
  kpiWide: { flexBasis: '22%' },
  kpiLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: MUTED },
  kpiValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  kpiValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 28, color: BRAND, letterSpacing: -0.5 },
  kpiExtra: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: FAINT },
  kpiSub: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: FAINT, marginTop: 2 },
  progress: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 9, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 9 },

  sentNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  sentText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED },

  split: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  sideCol: { width: 290, gap: 12 },
  pair: { flexDirection: 'row', gap: 12 },

  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 14 },
  cardTitle: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  gapsCard: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  gapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#fef3c7',
  },
  dot: { width: 8, height: 8, borderRadius: 8 },
  gapKind: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK },
  gapDay: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED },
  gapAction: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND },
  more: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: '#92400e', marginTop: 6 },
  gapNote: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, lineHeight: 16, color: '#92400e', marginTop: 8 },
  lastLine: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },

  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 4, marginTop: 4 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  chartBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2, width: '100%' },
  chartSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  chartPrev: { position: 'absolute', left: -1, right: -1, height: 2, backgroundColor: '#94a3b8', zIndex: 2 },
  chartLabel: { fontFamily: 'Manrope_500Medium', fontSize: 9.5, color: FAINT },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 9, height: 9, borderRadius: 3 },
  legendLine: { width: 12, height: 2 },
  legendText: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: MUTED },

  sheet: { backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 6 },
  tr: { flexDirection: 'row', alignItems: 'center' },
  thRow: { paddingBottom: 4 },
  th: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10.5,
    color: MUTED,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // «Всего» and «Среднее» in capitals ran into each other in their columns.
  thWord: { textTransform: 'none', letterSpacing: 0, fontSize: 11 },
  mnCell: { width: 132, paddingLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  mn: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK },
  nowPill: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    color: BRAND,
    backgroundColor: '#ecfeff',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  gapCol: { width: 10 },
  groupHead: { flex: 1, paddingLeft: 4, paddingVertical: 6 },
  groupPill: {
    alignSelf: 'flex-start',
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    color: '#fff',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  kindCells: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  cellW: { flex: 1, minWidth: CELL - 6, marginHorizontal: 1.5 },
  totW: { width: 50, marginLeft: 4 },
  avgW: { width: 62, marginLeft: 4, alignItems: 'center' },
  monthRow: { paddingVertical: 3, borderRadius: 10 },
  curRow: { backgroundColor: '#f8fdff' },
  cell: {
    height: CELL,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cellEmpty: { height: CELL },
  cellHover: { borderColor: '#a5f3fc', backgroundColor: '#f0fdff' },
  cellNotHeld: { backgroundColor: '#f8fafc' },
  cellGap: { backgroundColor: '#fffbeb', borderColor: '#f59e0b', borderStyle: 'dashed' },
  cellValue: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: INK },
  cellValueNotHeld: { color: FAINT, fontFamily: 'Manrope_500Medium' },
  cellValueGap: { color: AMBER, fontSize: 12, fontFamily: 'Manrope_700Bold' },
  cellDay: { fontFamily: 'Manrope_500Medium', fontSize: 9.5, color: FAINT, marginTop: 1, textAlign: 'center' },
  tot: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#475569', textAlign: 'center' },
  avg: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: BRAND },
  partial: { fontFamily: 'Manrope_700Bold', fontSize: 9.5, color: AMBER },
  prevAvg: { fontFamily: 'Manrope_500Medium', fontSize: 9.5, color: FAINT },
  ahead: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 12, color: '#cbd5e1', paddingLeft: 8, paddingVertical: 6 },
  footRow: { borderTopWidth: 2, borderTopColor: LINE, marginTop: 6, paddingTop: 10 },
  footLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: MUTED },
  footNote: { fontFamily: 'Manrope_500Medium', fontSize: 11, color: FAINT, textAlign: 'right', paddingRight: 8 },
  footValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: BRAND, textAlign: 'center' },
  memorialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  memorialLabel: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK },
  memorialCell: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginLeft: 8 },
  memorialDay: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED },
  memorialValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK },

  phoneHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  phoneMonth: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: INK },
  phoneAvg: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, flexShrink: 1, textAlign: 'right' },
  nothing: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: FAINT, marginTop: 6 },
  kindLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 10.5,
    color: FAINT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: {
    width: '18.5%',
    minWidth: 54,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileValue: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: INK },
  aheadLine: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: FAINT, textAlign: 'center', marginTop: 4 },
});
