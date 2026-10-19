import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { partDisplay } from '../lib/part-display';
import { resolveSubsection, SUBSECTIONS } from '../lib/parts';
import {
  buildReport,
  ConductReport as Report,
  ON_TIME_SEC,
  PAUSE_MIN_SEC,
  ReportPoint,
  ReportRow,
  ReportSection,
  rowsByDeviation,
} from '../lib/conduct-report';
import { clock, ConductSummaryData, mmss } from './ConductSummary';

/**
 * THE DETAILED RESULT OF A MIDWEEK MEETING (item 4, mockup approved by Lionel
 * on 16 October 2026): four numbers, how the time went, the sections, and the
 * parts — in the programme's order or by how far each went from it.
 *
 * The numbers come from lib/conduct-report.ts. The curve is drawn with plain
 * views (thin rotated bars), not an SVG library: none is in the installed
 * app, and adding one would mean a new APK.
 *
 * No ratings of brothers. The opening, the closing and the song are nobody's
 * assignment: their difference is shown in grey, never red or green.
 */

/** The opening and the closing carry several things on the prayer's row (lib/run-order.ts). */
const BLOCK: Record<string, { label: string; section: ReportSection }> = {
  midweek_opening_prayer: { label: 'conduct.result.opening', section: 'opening' },
  midweek_closing_prayer: { label: 'conduct.result.closing', section: 'closing' },
};

const SECTION_META: Record<ReportSection, { color: string; muted: string; label: string; short: string }> = {
  opening: { color: SUBSECTIONS.opening.color, muted: '#eef2f6', label: '', short: '' },
  closing: { color: SUBSECTIONS.opening.color, muted: '#eef2f6', label: '', short: '' },
  treasures: {
    color: SUBSECTIONS.treasures.color,
    muted: '#e0f7fb',
    label: SUBSECTIONS.treasures.i18nKey,
    short: 'conduct.report.short.treasures',
  },
  apply_yourself: {
    color: SUBSECTIONS.apply_yourself.color,
    muted: '#fdf3dc',
    label: SUBSECTIONS.apply_yourself.i18nKey,
    short: 'conduct.report.short.applyYourself',
  },
  christian_life: {
    color: SUBSECTIONS.christian_life.color,
    muted: '#fcebeb',
    label: SUBSECTIONS.christian_life.i18nKey,
    short: 'conduct.report.short.christianLife',
  },
};

const OVER = '#b91c1c';
const UNDER = '#15803d';
const NEUTRAL = '#64748b';
const LINE = '#0369a1';
const PAUSE_LINE = '#93c5fd';

function sectionOf(key: string): ReportSection {
  if (BLOCK[key]) return BLOCK[key].section;
  const s = resolveSubsection(key);
  return s === 'treasures' || s === 'apply_yourself' || s === 'christian_life' ? s : 'opening';
}

/** +1:05, −0:30, or ±0 within a few seconds. */
function signed(sec: number): string {
  const s = Math.round(sec);
  if (Math.abs(s) < ON_TIME_SEC) return '±0';
  return `${s > 0 ? '+' : '−'}${clock(Math.abs(s))}`;
}

function toneOf(sec: number, neutral: boolean) {
  if (neutral || Math.abs(sec) < ON_TIME_SEC) return { color: NEUTRAL };
  return { color: sec > 0 ? OVER : UNDER };
}

/** «19:01» — the device's local time. */
function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ConductReport({
  data,
  titleOf,
  keyLabelOf,
  keyPersonOf,
  noteKey = 'conduct.report.note',
  nameOf,
  chairmanName,
  counselPlannedOf,
  wide,
}: {
  data: ConductSummaryData;
  titleOf: (assignmentId: string | null) => string | null;
  /** The conduct screen's own name for a part (the weekend's, 19 October 2026). */
  keyLabelOf?: (key: string) => string;
  /** Who was on the stage, as the conduct screen names it (the weekend). */
  keyPersonOf?: (key: string) => string | null;
  /** The note under the table: the weekend has no counsel. */
  noteKey?: string;
  nameOf: (publisherId: string) => string | null;
  chairmanName: string | null;
  /** The programme's counsel after a part, seconds; null for a part it no longer has. */
  counselPlannedOf: (key: string) => number | null;
  /** iPad and wider: two columns. */
  wide: boolean;
}) {
  const { t } = useTranslation();
  const report = useMemo(
    () =>
      buildReport({
        segments: data.segments,
        totalSec: data.totalSec,
        plannedSec: data.plannedSec,
        sectionOf,
        counselPlannedOf,
      }),
    [data, counselPlannedOf],
  );
  const startMs = data.startedAt ? Date.parse(data.startedAt) : NaN;
  // Held here, not in the table: turning the iPad moves the table to another
  // column, which would remount it and forget the choice.
  const [byDeviation, setByDeviation] = useState(false);

  const labelOf = (row: ReportRow) => {
    const block = BLOCK[row.key];
    if (block) return t(block.label);
    if (keyLabelOf) return keyLabelOf(row.key);
    const seg = data.segments[row.index];
    return partDisplay(row.key, titleOf(seg.assignmentId)).label;
  };
  const peopleOf = (row: ReportRow) => {
    if (BLOCK[row.key]) return [];
    // The weekend says who was on the stage as its run sheet does — the
    // chairman with the opening prayer, the visiting speaker, the conductor
    // with his song (19 October 2026); the midweek reads the cards.
    const other = keyPersonOf ? keyPersonOf(row.key) : null;
    if (other) return [other];
    return data.segments[row.index].publisherIds.map(nameOf).filter((n): n is string => !!n);
  };

  const tiles = (
    <View style={[styles.tiles, !wide && styles.tilesNarrow]}>
      <Tile
        label={t('conduct.report.took')}
        value={clock(report.totalSec)}
        sub={
          <Text style={styles.tileSub}>
            {t('conduct.report.planned', { time: clock(report.plannedSec) })}
            {'  '}
            <Text style={[styles.bold, toneOf(report.overSec, false)]}>{signed(report.overSec)}</Text>
          </Text>
        }
        wide={wide}
      />
      <Tile
        label={t('conduct.report.peak')}
        value={report.peak ? signed(report.peak.y) : '—'}
        sub={
          <Text style={styles.tileSub}>
            {report.peak && report.peak.index >= 0
              ? t('conduct.report.peakAfter', { part: labelOf(report.rows[report.peak.index]) })
              : t('conduct.report.peakNone')}
          </Text>
        }
        wide={wide}
      />
      <Tile
        label={t('conduct.report.counsel', { n: report.counsel.count })}
        value={report.counsel.averageSec !== null ? mmss(report.counsel.averageSec) : '—'}
        sub={
          <Text style={styles.tileSub}>
            {report.counsel.count ? t('conduct.report.counselSub') : t('conduct.report.counselNone')}
          </Text>
        }
        wide={wide}
      />
      <Tile
        label={t('conduct.report.between')}
        value={mmss(report.betweenSec)}
        sub={<Text style={styles.tileSub}>{t('conduct.report.betweenSub')}</Text>}
        wide={wide}
      />
    </View>
  );

  const curve = (
    <View style={styles.card}>
      <Text style={styles.h3}>{t('conduct.report.curve')}</Text>
      <Text style={styles.cardSub}>{t('conduct.report.curveSub')}</Text>
      <Curve report={report} startMs={startMs} />
      <Text style={styles.note}>
        {report.timed
          ? t('conduct.report.curvePauses')
          : t('conduct.report.curveNoPauses', { time: mmss(report.betweenSec) })}
      </Text>
    </View>
  );

  const sections = report.sections.length ? (
    <View style={styles.card}>
      <Text style={styles.h3}>{t('conduct.report.sections')}</Text>
      <Text style={styles.cardSub}>{t('conduct.report.sectionsSub')}</Text>
      {(() => {
        const max = Math.max(1, ...report.sections.map((x) => Math.max(x.plannedSec, x.actualSec)));
        return report.sections.map((x) => {
          const meta = SECTION_META[x.section];
          const dv = x.actualSec - x.plannedSec;
          return (
            <View key={x.section} style={[styles.secRow, !wide && styles.secRowNarrow]}>
              <View style={[styles.secName, wide && styles.secNameWide]}>
                <View style={[styles.swatch, { backgroundColor: meta.color }]} />
                <Text style={styles.secLabel}>{t(meta.label)}</Text>
              </View>
              <View style={[styles.secBar, wide && { flex: 1 }]}>
                <View style={[styles.secPlan, { width: `${(x.plannedSec / max) * 100}%` }]} />
                <View
                  style={[styles.secAct, { width: `${(x.actualSec / max) * 100}%`, backgroundColor: meta.color }]}
                />
              </View>
              <Text style={[styles.secVal, wide && styles.secValWide]}>
                {clock(x.actualSec)}{' '}
                <Text style={styles.muted}>{t('conduct.report.of', { time: clock(x.plannedSec) })}</Text>{' '}
                <Text style={[styles.bold, toneOf(dv, false)]}>{signed(dv)}</Text>
              </Text>
            </View>
          );
        });
      })()}
    </View>
  ) : null;

  const table = (
    <PartsTable
      report={report}
      labelOf={labelOf}
      peopleOf={peopleOf}
      wide={wide}
      byDeviation={byDeviation}
      setByDeviation={setByDeviation}
      noteKey={noteKey}
    />
  );

  return (
    <View>
      {chairmanName ? (
        <Text style={styles.chairman}>{t('conduct.result.chairmanNamed', { name: chairmanName })}</Text>
      ) : null}
      {tiles}
      {wide ? (
        <View style={styles.twoCol}>
          <View style={styles.colLeft}>
            {curve}
            {sections}
          </View>
          <View style={styles.colRight}>{table}</View>
        </View>
      ) : (
        <View>
          {curve}
          {sections}
          {table}
        </View>
      )}
    </View>
  );
}

function Tile({ label, value, sub, wide }: { label: string; value: string; sub: ReactNode; wide: boolean }) {
  return (
    <View style={[styles.tile, wide ? styles.tileWide : styles.tileNarrow]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      {sub}
    </View>
  );
}

const CURVE_H = 200;
const PAD = { l: 46, r: 10, t: 22, b: 40 };

/** How far behind the programme the meeting was, part by part — plain views. */
function Curve({ report, startMs }: { report: Report; startMs: number }) {
  const { t } = useTranslation();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const pts = report.points;
  const xMax = Math.max(1, report.totalSec, ...pts.map((p) => p.x));
  const ys = pts.map((p) => p.y);
  const yMax = Math.max(300, Math.max(...ys) + 90);
  const yMin = Math.min(-120, Math.min(...ys) - 60);
  const W = Math.max(0, w - PAD.l - PAD.r);
  const H = CURVE_H - PAD.t - PAD.b;
  const X = (x: number) => PAD.l + (x / xMax) * W;
  const Y = (y: number) => PAD.t + ((yMax - y) / (yMax - yMin)) * H;

  // Bands: consecutive parts of one section, from the first's start to the last's end.
  const bands: { section: ReportSection; from: number; to: number }[] = [];
  for (const r of report.rows) {
    const last = bands[bands.length - 1];
    if (last && last.section === r.section) last.to = r.toX + (r.pauseAfterSec ?? 0);
    else bands.push({ section: r.section, from: r.fromX, to: r.toX + (r.pauseAfterSec ?? 0) });
  }
  const grid: number[] = [];
  for (let m = Math.ceil(yMin / 60); m <= Math.floor(yMax / 60); m++) grid.push(m);
  const step = grid.length > 8 ? 2 : 1;

  const segment = (a: ReportPoint, b: ReportPoint, k: number) => {
    const x1 = X(a.x);
    const y1 = Y(a.y);
    const x2 = X(b.x);
    const y2 = Y(b.y);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    return (
      <View
        key={`s${k}`}
        style={{
          position: 'absolute',
          left: (x1 + x2) / 2 - len / 2,
          top: (y1 + y2) / 2 - 1,
          width: len,
          height: 2,
          borderRadius: 1,
          backgroundColor: b.pause ? PAUSE_LINE : LINE,
          transform: [{ rotate: `${angle}rad` }],
        }}
      />
    );
  };

  return (
    <View style={{ height: CURVE_H, marginTop: 6 }} onLayout={onLayout}>
      {w > 0 ? (
        <>
          {bands.map((b, i) => {
            const meta = SECTION_META[b.section];
            const left = X(b.from);
            const width = Math.max(0, X(b.to) - left - 2);
            return (
              <View key={`b${i}`} style={{ position: 'absolute', left, top: PAD.t, width, height: H }}>
                <View style={{ flex: 1, backgroundColor: meta.muted, borderRadius: 3 }} />
                {meta.short ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.bandLabel, { color: meta.color, top: H + 4, width: Math.max(width, 10) }]}
                  >
                    {t(meta.short)}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {grid.map((m) =>
            m % step === 0 || m === 0 ? (
              <View key={`g${m}`} style={{ position: 'absolute', left: 0, right: PAD.r, top: Y(m * 60) - 7 }}>
                <Text style={styles.axisLabel}>
                  {m === 0 ? '0' : t('conduct.report.minutes', { sign: m > 0 ? '+' : '−', n: Math.abs(m) })}
                </Text>
                <View
                  style={{
                    position: 'absolute',
                    left: PAD.l,
                    right: 0,
                    top: 7,
                    height: m === 0 ? 1.5 : 1,
                    backgroundColor: m === 0 ? '#64748b' : '#e2e8f0',
                  }}
                />
              </View>
            ) : null,
          )}
          {pts.slice(1).map((p, i) => segment(pts[i], p, i))}
          {pts.slice(1).map((p, i) =>
            p.pause ? null : (
              <View
                key={`p${i}`}
                style={[
                  styles.dot,
                  report.peak === p && styles.dotPeak,
                  { left: X(p.x) - (report.peak === p ? 5 : 3.5), top: Y(p.y) - (report.peak === p ? 5 : 3.5) },
                ]}
              />
            ),
          )}
          {report.peak ? (
            <Text
              style={[
                styles.peakLabel,
                { left: Math.min(Math.max(X(report.peak.x) - 30, PAD.l), w - 70), top: Y(report.peak.y) - 22 },
              ]}
            >
              {signed(report.peak.y)}
            </Text>
          ) : null}
          <Text style={[styles.axisFoot, { left: PAD.l }]}>
            {Number.isFinite(startMs) ? t('conduct.report.start', { time: hhmm(startMs) }) : ''}
          </Text>
          <Text style={[styles.axisFoot, { right: PAD.r, textAlign: 'right' }]}>
            {Number.isFinite(startMs) ? t('conduct.report.end', { time: hhmm(startMs + report.totalSec * 1000) }) : ''}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function PartsTable({
  report,
  labelOf,
  peopleOf,
  wide,
  byDeviation,
  setByDeviation,
  noteKey,
}: {
  noteKey: string;
  report: Report;
  labelOf: (r: ReportRow) => string;
  peopleOf: (r: ReportRow) => string[];
  wide: boolean;
  byDeviation: boolean;
  setByDeviation: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const rows = byDeviation ? rowsByDeviation(report.rows) : report.rows;

  return (
    <View style={styles.card}>
      <View style={styles.tableHead}>
        <Text style={styles.h3}>{t('conduct.report.parts')}</Text>
        <View style={styles.segc}>
          {[false, true].map((dev) => (
            <Pressable
              key={String(dev)}
              onPress={() => setByDeviation(dev)}
              style={[styles.segcItem, byDeviation === dev && styles.segcOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: byDeviation === dev }}
            >
              <Text style={[styles.segcText, byDeviation === dev && styles.segcTextOn]}>
                {dev ? t('conduct.report.byDeviation') : t('conduct.report.byOrder')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={[styles.tr, styles.th]}>
        <Text style={[styles.thText, styles.cPart]}>{t('conduct.result.part')}</Text>
        <Text style={[styles.thText, styles.cNum]}>{t('conduct.result.plan')}</Text>
        <Text style={[styles.thText, styles.cNum]}>{t('conduct.result.fact')}</Text>
        <Text style={[styles.thText, wide ? styles.cDevWide : styles.cDev]}>±</Text>
      </View>
      {rows.map((r) => {
        const people = peopleOf(r);
        // Nobody's assignment: the opening, the closing, the song.
        const neutral = people.length === 0;
        const color = SECTION_META[r.section].color;
        return (
          <View key={`${r.key}-${r.index}`}>
            <View style={styles.tr}>
              <View style={styles.cPart}>
                <View style={styles.partLine}>
                  <View style={[styles.swatch, { backgroundColor: color }]} />
                  <Text style={styles.partLabel}>{labelOf(r)}</Text>
                </View>
                {people.length ? <Text style={styles.people}>{people.join(' · ')}</Text> : null}
              </View>
              <Text style={[styles.num, styles.cNum]}>{mmss(r.plannedSec)}</Text>
              <Text style={[styles.num, styles.cNum]}>{mmss(r.actualSec)}</Text>
              <View style={[wide ? styles.cDevWide : styles.cDev, styles.devCell]}>
                {wide ? <DevBar sec={r.devSec} neutral={neutral} /> : null}
                <Text style={[styles.dev, toneOf(r.devSec, neutral)]}>{signed(r.devSec)}</Text>
              </View>
            </View>
            {r.counselSec !== null ? (
              <View style={[styles.tr, styles.sub]}>
                <Text style={[styles.subText, styles.cPart, styles.subIndent]}>{`↳ ${t('conduct.report.counselRow')}`}</Text>
                <Text style={[styles.subText, styles.cNum]}>{mmss(r.counselPlannedSec)}</Text>
                <Text style={[styles.subText, styles.cNum]}>{mmss(r.counselSec)}</Text>
                <View style={[wide ? styles.cDevWide : styles.cDev, styles.devCell]}>
                  <Text style={[styles.dev, toneOf(r.counselDevSec ?? 0, false)]}>{signed(r.counselDevSec ?? 0)}</Text>
                </View>
              </View>
            ) : null}
            {!byDeviation && r.pauseAfterSec !== null && r.pauseAfterSec >= PAUSE_MIN_SEC ? (
              <View style={[styles.tr, styles.sub]}>
                <Text style={[styles.subText, styles.cPart, styles.subIndent]}>{`⏸ ${t('conduct.report.pauseRow')}`}</Text>
                <Text style={[styles.subText, styles.cNum]}>—</Text>
                <Text style={[styles.subText, styles.cNum]}>{mmss(r.pauseAfterSec)}</Text>
                <View style={[wide ? styles.cDevWide : styles.cDev, styles.devCell]}>
                  <Text style={[styles.dev, { color: NEUTRAL }]}>{signed(r.pauseAfterSec)}</Text>
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      {report.betweenSec >= ON_TIME_SEC ? (
        <View style={[styles.tr, styles.sub, styles.trLast]}>
          <Text style={[styles.subText, styles.cPart]}>{t('conduct.report.betweenRow')}</Text>
          <Text style={[styles.subText, styles.cNum]}>—</Text>
          <Text style={[styles.subText, styles.cNum]}>{mmss(report.betweenSec)}</Text>
          <View style={[wide ? styles.cDevWide : styles.cDev, styles.devCell]}>
            <Text style={[styles.dev, { color: NEUTRAL }]}>{signed(report.betweenSec)}</Text>
          </View>
        </View>
      ) : null}
      <Text style={styles.note}>{t(noteKey)}</Text>
    </View>
  );
}

/** A small bar either side of a centre line: right and red over, left and green under. */
function DevBar({ sec, neutral }: { sec: number; neutral: boolean }) {
  const frac = Math.min(Math.abs(sec) / 120, 1) * 50;
  const color = neutral || Math.abs(sec) < ON_TIME_SEC ? '#cbd5e1' : sec > 0 ? '#dc2626' : '#16a34a';
  return (
    <View style={styles.devBar}>
      <View style={styles.devMid} />
      {Math.abs(sec) >= ON_TIME_SEC ? (
        <View
          style={[
            styles.devFill,
            { width: `${frac}%`, backgroundColor: color },
            sec > 0 ? { left: '50%' } : { right: '50%' },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chairman: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#475569', marginBottom: 10 },
  bold: { fontFamily: 'Manrope_700Bold' },
  muted: { color: '#94a3b8' },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  tilesNarrow: {},
  tile: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  tileWide: { flexBasis: 0, flexGrow: 1, minWidth: 180 },
  tileNarrow: { width: '48%', flexGrow: 1 },
  tileLabel: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b' },
  tileValue: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 26,
    color: '#0f172a',
    marginVertical: 2,
    fontVariant: ['tabular-nums'],
  },
  tileSub: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b', lineHeight: 16 },

  twoCol: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  colLeft: { flex: 5 },
  colRight: { flex: 4 },

  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  h3: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0f172a' },
  cardSub: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b', marginTop: 2 },
  note: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b', marginTop: 8, lineHeight: 17 },

  bandLabel: {
    position: 'absolute',
    left: 0,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10.5,
    textAlign: 'center',
  },
  axisLabel: {
    position: 'absolute',
    left: 0,
    width: PAD.l - 6,
    textAlign: 'right',
    fontFamily: 'Manrope_400Regular',
    fontSize: 10.5,
    color: '#94a3b8',
  },
  axisFoot: { position: 'absolute', bottom: 0, fontFamily: 'Manrope_400Regular', fontSize: 11, color: '#94a3b8' },
  dot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 2,
    borderColor: LINE,
    backgroundColor: '#ffffff',
  },
  dotPeak: { width: 10, height: 10, borderRadius: 5, backgroundColor: LINE },
  peakLabel: {
    position: 'absolute',
    width: 60,
    textAlign: 'center',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: OVER,
  },

  secRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  secRowNarrow: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  secName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secNameWide: { width: 170 },
  secLabel: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#0f172a', flexShrink: 1 },
  secBar: { height: 12, justifyContent: 'center' },
  secPlan: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#94a3b8',
    borderRadius: 4,
  },
  secAct: { position: 'absolute', left: 0, top: 3, height: 6, borderTopRightRadius: 4, borderBottomRightRadius: 4, opacity: 0.85 },
  secVal: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#0f172a', fontVariant: ['tabular-nums'] },
  secValWide: { width: 180, textAlign: 'right' },
  swatch: { width: 8, height: 8, borderRadius: 2 },

  tableHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 },
  segc: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 999, padding: 3 },
  segcItem: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  segcOn: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segcText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: '#475569' },
  segcTextOn: { fontFamily: 'Manrope_700Bold', color: '#0f172a' },

  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  trLast: { borderBottomWidth: 0 },
  th: { paddingVertical: 4, borderBottomColor: '#cbd5e1', borderBottomWidth: 1 },
  thText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#64748b',
  },
  cPart: { flex: 1, minWidth: 0 },
  cNum: { width: 46, textAlign: 'right' },
  cDev: { width: 58, textAlign: 'right' },
  cDevWide: { width: 118, textAlign: 'right' },
  devCell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  partLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partLabel: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 19, color: '#0f172a', flexShrink: 1 },
  people: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b', marginLeft: 16, marginTop: 1 },
  num: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: '#334155', fontVariant: ['tabular-nums'] },
  dev: { fontFamily: 'Manrope_700Bold', fontSize: 13, fontVariant: ['tabular-nums'], textAlign: 'right', minWidth: 46 },
  sub: { paddingVertical: 4 },
  subText: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#64748b', fontVariant: ['tabular-nums'] },
  subIndent: { paddingLeft: 16 },

  devBar: { width: 56, height: 10, justifyContent: 'center' },
  devMid: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: '#cbd5e1' },
  devFill: { position: 'absolute', top: 2, height: 6, borderRadius: 3 },
});
