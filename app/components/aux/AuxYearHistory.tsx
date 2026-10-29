import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import {
  auxYearApi,
  extractErrorMessage,
  meetingSettingsApi,
  type AuxCell,
  type AuxYearRow,
  type AuxYearView,
} from '../../lib/api';
import { Dialog } from '../Dialog';
import { exportHtmlAsPdf, openPrintWindow } from '../../lib/pdf';
import { appFontFaces } from '../../lib/print-fonts';
import { buildAuxHistoryPdfHtml } from '../../lib/auxHistoryPdf';
import { addMonths, capitalize, monthName } from '../../lib/aux-application';
import { INK, MUTED, BRAND } from '../reports/ReportBits';

/**
 * THE HISTORY BY SERVICE YEARS (29 October 2026, mockup «Подсобное
 * пионерское служение», screen 9). A year at a time: a strip of its twelve
 * months with how many serve in each — framed amber where 15 hours are open —
 * and below it every person of the year, month by month, with the goal and
 * the hours that came in. On a computer a table; on a phone each person with
 * the months he served.
 */

const TONE = {
  reported: { bg: '#dcfce7', fg: '#166534' },
  ahead: { bg: '#e0f2fe', fg: '#0369a1' },
  awaiting: { bg: '#f1f5f9', fg: '#475569' },
  running: { bg: '#ecfeff', fg: '#0e7490' },
  pending: { bg: '#fef3c7', fg: '#92400e' },
};

function shortMonth(m: string, lang: string): string {
  const d = new Date(`${m}-15T12:00:00Z`);
  return d
    .toLocaleDateString(lang, { month: 'short', timeZone: 'UTC' })
    .replace('.', '')
    .toUpperCase();
}

function toneOf(c: AuxCell, current: string) {
  if (c.state === 'reported') return TONE.reported;
  if (c.state === 'pending') return TONE.pending;
  if (c.state === 'ahead') return TONE.ahead;
  return c.month === current ? TONE.running : TONE.awaiting;
}

/** The word under the goal: hours in, «идёт», «ждём», «ждёт»; nothing ahead. */
function subOf(c: AuxCell, current: string, t: (k: string) => string): string | null {
  if (c.state === 'reported') return String(c.hours);
  if (c.state === 'pending') return t('auxYear.cell.pending');
  if (c.state === 'awaiting') return c.month === current ? t('auxYear.cell.running') : t('auxYear.cell.awaiting');
  return null;
}

/** Months «until cancelled» still ahead, one after another, from `i`. */
function openRunFrom(cells: AuxCell[], i: number): number {
  let n = 0;
  while (
    i + n < cells.length &&
    cells[i + n].state === 'ahead' &&
    cells[i + n].untilCancelled
  )
    n++;
  return n;
}

export function AuxYearHistory() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [year, setYear] = useState<number | undefined>(undefined);
  const [query, setQuery] = useState('');
  // The page's width decides table or list; the card's inner width decides
  // the columns, so the last month never runs past the card's edge.
  const [width, setWidth] = useState(0);
  const [inner, setInner] = useState(0);
  const q = useQuery({
    queryKey: ['aux-pioneers', 'year', year ?? 'now'],
    queryFn: () => auxYearApi.year(year),
  });
  const data = q.data;
  const rows = useMemo(() => {
    const s = query.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => !s || r.name.toLowerCase().includes(s));
  }, [data, query]);
  const reducible = new Set((data?.reducible ?? []).map((x) => x.month));
  const [printOpen, setPrintOpen] = useState(false);
  const table = width >= 600;
  const NAME_W = table ? Math.min(180, Math.max(130, width * 0.22)) : 0;
  const colW = table && inner > 0 ? Math.floor((inner - NAME_W) / 12) : 0;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.head}>
        <View style={styles.tabs}>
          {(data?.years ?? []).map((y) => {
            const on = y === data?.year;
            return (
              <Pressable
                key={y}
                onPress={() => setYear(y)}
                style={[styles.tab, on && styles.tabOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>
                  {`${y}/${String(y + 1).slice(2)}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {data ? (
          <Pressable
            onPress={() => setPrintOpen(true)}
            style={styles.pdfBtn}
            accessibilityRole="button"
            accessibilityLabel={t('auxPrint.title')}
          >
            <Ionicons name="document-text-outline" size={15} color={BRAND} />
            <Text style={styles.pdfText}>{t('auxPrint.button')}</Text>
          </Pressable>
        ) : null}
        <View style={[styles.search, !table && { flexBasis: '100%' }]}>
          <Ionicons name="search" size={15} color="#94a3b8" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('auxYear.search')}
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
        </View>
      </View>

      {!data ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={BRAND} />
      ) : (
        <>
          <View style={styles.strip}>
            {data.counts.map((c) => {
              const now = c.month === data.current;
              const r15 = reducible.has(c.month);
              return (
                <View
                  key={c.month}
                  style={[
                    styles.stripCell,
                    table && styles.stripCellWide,
                    r15 && styles.stripCell15,
                    now && styles.stripCellNow,
                  ]}
                >
                  <Text style={[styles.stripN, c.serving === 0 && { color: '#cbd5e1' }]}>{c.serving}</Text>
                  <Text style={styles.stripM}>
                    {shortMonth(c.month, lang)}
                    {c.pending > 0 ? ` · +${c.pending}` : ''}
                  </Text>
                  {c.pending > 0 ? <Text style={styles.stripWait}>{t('auxYear.cell.pending')}</Text> : null}
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            <View onLayout={(e) => setInner(e.nativeEvent.layout.width)} />
            {table ? (
              <View style={[styles.tRow, styles.tHead]}>
                <Text style={[styles.th, { width: NAME_W, textAlign: 'left' }]}>{t('auxYear.name')}</Text>
                {data.months.map((m) => (
                  <Text key={m} style={[styles.th, { width: colW }]}>
                    {shortMonth(m, lang)}
                  </Text>
                ))}
              </View>
            ) : null}
            {rows.length === 0 ? (
              <Text style={styles.empty}>{query ? t('auxYear.nobodyFound') : t('auxYear.empty')}</Text>
            ) : (
              rows.map((r, i) =>
                table ? (
                  <TableRow
                    key={r.publisherId}
                    row={r}
                    months={data.months}
                    current={data.current}
                    nameW={NAME_W}
                    colW={colW}
                    first={i === 0}
                  />
                ) : (
                  <PersonRow key={r.publisherId} row={r} current={data.current} first={i === 0} />
                ),
              )
            )}
            <View style={styles.legend}>
              <Legend tone={TONE.reported} top="30" bottom="32" label={t('auxYear.legend.reported')} />
              <Legend tone={TONE.ahead} top="30" label={t('auxYear.legend.ahead')} />
              <Legend tone={TONE.awaiting} top={t('auxYear.cell.awaiting')} label={t('auxYear.legend.awaiting')} />
              <Legend tone={TONE.pending} top={t('auxYear.cell.pending')} label={t('auxYear.legend.pending')} />
              <Text style={styles.totals}>
                {t('auxYear.totals', {
                  people: data.totals.people,
                  months: data.totals.months,
                  hours: data.totals.hours,
                })}
              </Text>
            </View>
          </View>
        </>
      )}
      {data ? (
        <PrintDialog visible={printOpen} view={data} onClose={() => setPrintOpen(false)} />
      ) : null}
    </View>
  );
}

/**
 * What to print (29 October 2026, mockup screen 12): the service year on
 * the screen, or any run of up to twelve months; by people or by months.
 */
function PrintDialog({ visible, view, onClose }: { visible: boolean; view: AuxYearView; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [kind, setKind] = useState<'year' | 'range'>('year');
  const [mode, setMode] = useState<'people' | 'months'>('people');
  const [from, setFrom] = useState(view.months[0]);
  const [to, setTo] = useState(view.months[view.months.length - 1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: ['meeting-settings', 'overview'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 10 * 60 * 1000,
    enabled: visible,
  });
  const span = (a: string, b: string) => {
    const [ya, ma] = a.split('-').map(Number);
    const [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
  };
  const rangeOk = span(from, to) >= 0 && span(from, to) <= 11;
  const yearLabel = `${view.year}/${String(view.year + 1).slice(2)}`;

  const print = async () => {
    setError(null);
    const win = openPrintWindow();
    setBusy(true);
    try {
      const v = kind === 'year' ? view : await auxYearApi.range(from, to);
      const first = v.months[0];
      const last = v.months[v.months.length - 1];
      // «сентябрь 2026», without the «г.» the Russian calendar adds.
      const long = (m: string) => monthName(m, lang).replace(/\s?г\.$/, '');
      const html = buildAuxHistoryPdfHtml({
        view: v,
        mode,
        congregationName: overview.data?.congregation?.name ?? '',
        title:
          kind === 'year'
            ? t('auxPrint.yearTitle', { year: yearLabel })
            : `${capitalize(long(first))} — ${long(last)}`,
        rangeLabel: `${long(first)} — ${long(last)}`,
        printedOn: new Date().toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }),
        monthShort: (m) => shortMonth(m, lang),
        monthLong: long,
        monthOnly: (m) => monthName(m, lang, false),
        reasonsOf: (m) =>
          (v.reducible.find((x) => x.month === m)?.reasons ?? [])
            .map((r) => t(`auxPioneer.reason.${r}`))
            .join(', '),
        fontFaces: appFontFaces(),
        labels: {
          kicker: t('auxPrint.kicker'),
          printed: t('auxPrint.printed'),
          people: t('auxPrint.people'),
          months: t('auxPrint.months'),
          busiest: t('auxPrint.busiest'),
          busiestNone: t('auxPrint.busiestNone'),
          hours: t('auxPrint.hours'),
          name: t('auxPrint.name'),
          monthsCol: t('auxPrint.monthsCol'),
          hoursCol: t('auxPrint.hoursCol'),
          inMonth: t('auxPrint.inMonth'),
          nobody: t('auxPrint.nobody'),
          personCount: (n) => t('auxPrint.personCount', { count: n }),
          may15: t('auxPrint.may15'),
          note: t('auxPrint.note'),
          noteMonths: t('auxPrint.noteMonths'),
        },
      });
      await exportHtmlAsPdf(html, { fileName: t('auxPrint.kicker'), preopenedWindow: win });
      onClose();
    } catch (e) {
      win?.close();
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const Seg = <T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) => (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            style={[styles.segItem, on && styles.segOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const Stepper = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      <Pressable onPress={() => onChange(addMonths(value, -1))} hitSlop={8} accessibilityRole="button">
        <Ionicons name="chevron-back" size={18} color={MUTED} />
      </Pressable>
      <Text style={styles.stepValue}>{capitalize(monthName(value, lang))}</Text>
      <Pressable onPress={() => onChange(addMonths(value, 1))} hitSlop={8} accessibilityRole="button">
        <Ionicons name="chevron-forward" size={18} color={MUTED} />
      </Pressable>
    </View>
  );

  return (
    <Dialog
      visible={visible}
      title={t('auxPrint.title')}
      icon="document-text-outline"
      cancelLabel={t('common.cancel')}
      confirmLabel={t('auxPrint.print')}
      confirmDisabled={kind === 'range' && !rangeOk}
      pending={busy}
      onConfirm={() => void print()}
      onCancel={onClose}
    >
      <Text style={styles.dLabel}>{t('auxPrint.period')}</Text>
      <Seg
        value={kind}
        onChange={setKind}
        options={[
          { v: 'year', label: t('auxPrint.serviceYear', { year: yearLabel }) },
          { v: 'range', label: t('auxPrint.range') },
        ]}
      />
      {kind === 'range' ? (
        <View style={{ marginTop: 8 }}>
          <Stepper label={t('auxPrint.from')} value={from} onChange={setFrom} />
          <Stepper label={t('auxPrint.to')} value={to} onChange={setTo} />
          {!rangeOk ? <Text style={styles.dError}>{t('auxPrint.tooLong')}</Text> : null}
        </View>
      ) : null}
      <Text style={[styles.dLabel, { marginTop: 14 }]}>{t('auxPrint.layout')}</Text>
      <Seg
        value={mode}
        onChange={setMode}
        options={[
          { v: 'people', label: t('auxPrint.byPeople') },
          { v: 'months', label: t('auxPrint.byMonths') },
        ]}
      />
      {error ? <Text style={styles.dError}>{error}</Text> : null}
    </Dialog>
  );
}

function Legend({
  tone,
  top,
  bottom,
  label,
}: {
  tone: { bg: string; fg: string };
  top: string;
  bottom?: string;
  label: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendChip, { backgroundColor: tone.bg }]}>
        <Text style={[styles.legendChipText, { color: tone.fg }]}>
          {bottom ? `${top} · ${bottom}` : top}
        </Text>
      </View>
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function openCard(r: AuxYearRow) {
  router.push(`/publishers/${r.publisherId}` as never);
}

function TableRow({
  row,
  months,
  current,
  nameW,
  colW,
  first,
}: {
  row: AuxYearRow;
  months: string[];
  current: string;
  nameW: number;
  colW: number;
  first: boolean;
}) {
  const { t } = useTranslation();
  const byMonth = new Map(row.cells.map((c) => [c.month, c]));
  const out: React.ReactNode[] = [];
  for (let i = 0; i < months.length; i++) {
    const c = byMonth.get(months[i]);
    if (!c) {
      out.push(<View key={months[i]} style={{ width: colW }} />);
      continue;
    }
    // An open period ahead: one bar to the end of the year, not twelve 30s.
    const cellsFromHere = months.slice(i).map((m) => byMonth.get(m)).filter((x): x is AuxCell => !!x);
    const run = cellsFromHere.length === months.length - i ? openRunFrom(cellsFromHere, 0) : 0;
    if (run >= 2) {
      out.push(
        <View key={months[i]} style={{ width: colW * run, paddingHorizontal: 3 }}>
          <View style={[styles.bar, { backgroundColor: TONE.ahead.bg }]}>
            <Text style={[styles.barText, { color: TONE.ahead.fg }]} numberOfLines={1}>
              {t('auxYear.untilCancelledBar', { goal: c.goal })}
            </Text>
          </View>
        </View>,
      );
      i += run - 1;
      continue;
    }
    const tone = toneOf(c, current);
    const sub = subOf(c, current, t);
    out.push(
      <View key={months[i]} style={{ width: colW, alignItems: 'center' }}>
        <View style={[styles.chip, { backgroundColor: tone.bg }]}>
          <Text style={[styles.chipTop, { color: tone.fg }]}>{c.goal}</Text>
          {sub ? <Text style={[styles.chipSub, { color: tone.fg }]}>{sub}</Text> : null}
        </View>
      </View>,
    );
  }
  return (
    <View style={[styles.tRow, !first && styles.tBorder]}>
      <Pressable style={{ width: nameW, paddingRight: 6 }} onPress={() => openCard(row)} accessibilityRole="link">
        <Text style={styles.name} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.nameSub} numberOfLines={1}>
          {row.untilCancelled
            ? t('auxYear.untilCancelled')
            : t('auxYear.rowTotals', { months: row.months, hours: row.hours })}
        </Text>
      </Pressable>
      {out}
    </View>
  );
}

function PersonRow({ row, current, first }: { row: AuxYearRow; current: string; first: boolean }) {
  const { t, i18n } = useTranslation();
  const chips: React.ReactNode[] = [];
  for (let i = 0; i < row.cells.length; i++) {
    const c = row.cells[i];
    const run = i === row.cells.length - 1 ? 0 : openRunFrom(row.cells, i);
    if (run >= 2 && i + run === row.cells.length) {
      chips.push(
        <View key={c.month} style={[styles.pChip, { backgroundColor: TONE.ahead.bg }]}>
          <Text style={[styles.pChipText, { color: TONE.ahead.fg }]}>
            {t('auxYear.fromUntilCancelled', { month: shortMonth(c.month, i18n.language) })}
          </Text>
        </View>,
      );
      break;
    }
    const tone = toneOf(c, current);
    const sub = subOf(c, current, t);
    chips.push(
      <View key={c.month} style={[styles.pChip, { backgroundColor: tone.bg }]}>
        <Text style={[styles.pChipText, { color: tone.fg }]}>
          {`${shortMonth(c.month, i18n.language)} ${c.goal}${sub ? ` · ${sub}` : ''}`}
        </Text>
      </View>,
    );
  }
  return (
    <Pressable style={[styles.pRow, !first && styles.tBorder]} onPress={() => openCard(row)} accessibilityRole="link">
      <View style={styles.pHead}>
        <Text style={[styles.name, { flex: 1 }]}>{row.name}</Text>
        <Text style={styles.nameSub}>{t('auxYear.rowTotals', { months: row.months, hours: row.hours })}</Text>
      </View>
      <View style={styles.pChips}>{chips}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabOn: { backgroundColor: BRAND, borderColor: BRAND },
  tabText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK },
  tabTextOn: { color: '#fff' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 10,
    minWidth: 200,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    color: INK,
    outlineStyle: 'none',
  } as object,
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  stripCell: {
    flexGrow: 1,
    flexBasis: '14%',
    minWidth: 44,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#eef2f7',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 7,
  },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
  },
  pdfText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: BRAND },
  dLabel: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: MUTED, marginBottom: 6 },
  dError: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#b91c1c', marginTop: 6 },
  seg: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 9, alignItems: 'center' },
  segOn: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: MUTED, textAlign: 'center' },
  segTextOn: { color: INK },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  stepLabel: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: MUTED, width: 34 },
  stepValue: { flex: 1, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5, color: INK },
  stripCellWide: { flexBasis: 0, minWidth: 0 },
  stripCell15: { borderColor: '#fcd34d' },
  stripCellNow: { borderColor: BRAND, backgroundColor: '#ecfeff' },
  stripN: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: INK },
  stripM: { fontFamily: 'Manrope_700Bold', fontSize: 10.5, color: MUTED, marginTop: 1 },
  stripWait: { fontFamily: 'Manrope_700Bold', fontSize: 9.5, color: '#b45309' },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  tHead: { paddingVertical: 6 },
  tBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  th: { fontFamily: 'Manrope_800ExtraBold', fontSize: 10.5, color: '#94a3b8', textAlign: 'center' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  nameSub: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: MUTED, marginTop: 1 },
  chip: { minWidth: 36, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 4, alignItems: 'center' },
  chipTop: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12.5 },
  chipSub: { fontFamily: 'Manrope_600SemiBold', fontSize: 10 },
  bar: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  barText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  pRow: { paddingVertical: 10 },
  pHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  pChip: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 7 },
  pChipText: { fontFamily: 'Manrope_700Bold', fontSize: 11.5 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
    paddingBottom: 6,
    marginTop: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendChip: { borderRadius: 7, paddingVertical: 2, paddingHorizontal: 6 },
  legendChipText: { fontFamily: 'Manrope_700Bold', fontSize: 11 },
  legendText: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: MUTED },
  totals: { marginLeft: 'auto', fontFamily: 'Manrope_700Bold', fontSize: 12, color: INK },
  empty: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, paddingVertical: 14, textAlign: 'center' },
});
