import type { AttendanceMonth, AttendanceRow, AttendanceYear } from './api';

/**
 * THE TWO PAPER FORMS OF ATTENDANCE (31 October 2026, from the blank forms
 * Lionel sent).
 *
 *  S-3  «Отчёт о посещаемости встреч» — one MONTH: the weeks 1–5 of the
 *       midweek and the weekend meeting, the total and the average. The
 *       count is taken once, in the middle of each meeting, and those the
 *       programme is streamed to are counted too.
 *  S-88 «Отчёт о посещаемости встреч собрания» — the YEAR, two service years
 *       side by side: for each month the number of meetings, all who
 *       attended and the average per week; under it the average per month.
 *
 * The app printed a hybrid of the two — a year in week columns — labelled
 * S-3. The circuit overseer reads S-88 for the year and S-3 for a month, in
 * the shape he knows; so each is now printed as itself.
 *
 * Kept from before, because a finished sheet cannot be asked what a blank
 * meant: a meeting not held is a dash, never a zero; one nobody entered is
 * a visibly empty yellow cell; and a line of notes under the S-88 says what
 * the bare figures cannot — which months are incomplete, which meetings were
 * not held and why, the Memorial.
 */

export interface AttendancePrintLabels {
  // S-88
  s88Title: string;
  midweek: string;
  weekend: string;
  meetings: string;
  attended: string;
  perWeek: string;
  perMonth: string;
  notesTitle: string;
  incomplete: (missing: number) => string;
  incompleteMonth: (month: string, missing: number) => string;
  notHeld: (day: string, reason: string | null) => string;
  memorial: (day: string, count: number) => string;
  // S-3
  s3Title: string;
  s3Hint: string;
  congregation: string;
  month: string;
  week: (n: number) => string;
  total: string;
  average: string;
  midweekShort: string;
  weekendShort: string;
  legend: string;
  printed: string;
}

const MONTH_ORDER = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7];

function esc(s: string | number | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** The month of a service year by its place, September first. */
function monthOf(year: AttendanceYear | null, i: number): AttendanceMonth | null {
  if (!year) return null;
  const m = MONTH_ORDER[i] + 1;
  const y = MONTH_ORDER[i] >= 8 ? year.startYear : year.startYear + 1;
  const key = `${y}-${String(m).padStart(2, '0')}`;
  return year.months.find((x) => x.month.slice(0, 7) === key) ?? null;
}

const held = (rows: AttendanceRow[]) =>
  rows.filter((r) => r.recorded && !r.notHeld && r.count !== null);

const STYLE = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { padding: 6mm 4mm; }
  h1 { text-align: center; font-size: 15pt; letter-spacing: .6px; margin: 0 0 2mm; }
  .sub { text-align: center; font-size: 9pt; color: #475569; margin-bottom: 3mm; }
  h2 { font-size: 11pt; margin: 5mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #0f172a; font-size: 9pt; padding: 1.4mm 1.2mm; text-align: center; }
  th { font-size: 7.5pt; font-weight: 700; line-height: 1.2; }
  td.mn { text-align: left; font-size: 9.5pt; }
  td.gap, th.gap { border-left: 2.5px solid #0f172a; }
  td.foot { text-align: right; font-weight: 700; letter-spacing: .3px; }
  td.avg { font-weight: 700; }
  .part { display: block; font-size: 6.5pt; color: #b45309; font-weight: 700; }
  td.nh { color: #94a3b8; }
  td.miss { background: #fef3c7; }
  .notes { margin-top: 4mm; font-size: 8pt; line-height: 1.5; color: #334155; }
  .notes b { color: #0f172a; }
  .hint { font-size: 9pt; font-weight: 700; line-height: 1.35; margin: 0 0 6mm; }
  .line { display: flex; gap: 8mm; font-size: 9.5pt; margin-bottom: 4mm; }
  .line span { flex: 1; border-bottom: 1px dotted #0f172a; padding-bottom: 1mm; }
  .foot { margin-top: 5mm; display: flex; justify-content: space-between; font-size: 7.5pt; color: #64748b; }
`;

/**
 * S-88 — the year, as the form: the chosen service year on the left and the
 * one before it on the right, midweek above, weekend below.
 */
export function buildS88Html(opts: {
  year: AttendanceYear;
  previous: AttendanceYear | null;
  congregationName: string;
  /** A month's name alone, «Сентябрь». */
  monthName: (iso: string) => string;
  /** «октябрь 2026», for the notes. */
  monthYearName: (iso: string) => string;
  dayName: (iso: string) => string;
  reasonName: (r: string | null | undefined) => string | null;
  printedOn: string;
  serviceYearLabel: (startYear: number) => string;
  labels: AttendancePrintLabels;
}): string {
  const { year, previous, labels: L } = opts;

  const half = (
    y: AttendanceYear | null,
    kind: 'midweek' | 'weekend',
    i: number,
    first: boolean,
  ) => {
    const m = monthOf(y, i);
    const rows = m ? (kind === 'midweek' ? m.midweek : m.weekend) : [];
    const h = held(rows);
    const total = h.reduce((a, r) => a + (r.count ?? 0), 0);
    const avg = m ? (kind === 'midweek' ? m.midweekAverage : m.weekendAverage) : null;
    const missing = m
      ? ((kind === 'midweek' ? m.midweekMissing : m.weekendMissing) ?? 0)
      : 0;
    const name = opts.monthName(`2000-${String(MONTH_ORDER[i] + 1).padStart(2, '0')}-01`);
    return `<td class="mn${first ? '' : ' gap'}">${esc(name)}</td>
      <td>${h.length || ''}</td>
      <td>${h.length ? total : ''}</td>
      <td class="avg${missing ? ' miss' : ''}">${avg ?? ''}${
        missing && avg !== null ? `<span class="part">${esc(L.incomplete(missing))}</span>` : ''
      }</td>`;
  };

  const yearly = (y: AttendanceYear | null, kind: 'midweek' | 'weekend') =>
    (kind === 'midweek' ? y?.yearly?.midweekAverage : y?.yearly?.weekendAverage) ?? '';

  const table = (kind: 'midweek' | 'weekend') => {
    const head = (label: string, first: boolean) => `
      <th class="${first ? '' : 'gap'}" style="width:15%">${esc(label)}</th>
      <th>${esc(L.meetings)}</th><th>${esc(L.attended)}</th><th>${esc(L.perWeek)}</th>`;
    const body = MONTH_ORDER.map(
      (_, i) => `<tr>${half(year, kind, i, true)}${half(previous, kind, i, false)}</tr>`,
    ).join('');
    return `<h2>${esc(kind === 'midweek' ? L.midweek : L.weekend)}</h2>
      <table>
        <thead><tr>${head(opts.serviceYearLabel(year.startYear), true)}${head(
          opts.serviceYearLabel(year.startYear - 1),
          false,
        )}</tr></thead>
        <tbody>${body}
          <tr>
            <td class="foot" colspan="3">${esc(L.perMonth)}</td><td class="avg">${yearly(year, kind)}</td>
            <td class="foot gap" colspan="3">${esc(L.perMonth)}</td><td class="avg">${yearly(previous, kind)}</td>
          </tr>
        </tbody>
      </table>`;
  };

  // What the bare figures cannot say, for the chosen year.
  const notes: string[] = [];
  for (const m of year.months) {
    const missing = (m.midweekMissing ?? 0) + (m.weekendMissing ?? 0);
    if (missing) notes.push(L.incompleteMonth(opts.monthYearName(m.month), missing));
    for (const r of [...m.midweek, ...m.weekend]) {
      if (r.notHeld) notes.push(L.notHeld(opts.dayName(r.date), opts.reasonName(r.notHeldReason)));
    }
    for (const r of m.memorial ?? []) {
      if (r.recorded && !r.notHeld && r.count !== null) {
        notes.push(L.memorial(opts.dayName(r.date), r.count));
      }
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>S-88</title>
<style>${STYLE} @page { size: A4 portrait; margin: 8mm; }</style></head>
<body><section class="page">
  <h1>${esc(L.s88Title)}</h1>
  <div class="sub">${esc(opts.congregationName)}</div>
  ${table('midweek')}
  ${table('weekend')}
  ${notes.length ? `<div class="notes"><b>${esc(L.notesTitle)}</b> ${notes.map(esc).join(' · ')}</div>` : ''}
  <div class="foot"><span>S-88 · ${esc(L.legend)}</span><span>${esc(L.printed)} ${esc(opts.printedOn)}</span></div>
</section></body></html>`;
}

/** S-3 — one month, as the slip: weeks 1–5, the total and the average. */
export function buildS3Html(opts: {
  month: AttendanceMonth;
  congregationName: string;
  monthLabel: string;
  printedOn: string;
  labels: AttendancePrintLabels;
}): string {
  const { month, labels: L } = opts;
  // Five weeks as on paper; a month with a sixth meeting of a kind (a visit
  // week, a figure off the usual days) gets a sixth rather than losing one.
  const columns = Math.max(5, month.midweek.length, month.weekend.length);
  const cells = (rows: AttendanceRow[]) =>
    Array.from({ length: columns }, (_, i) => rows[i])
      .map((r) =>
        !r
          ? '<td></td>'
          : r.notHeld
            ? '<td class="nh">—</td>'
            : !r.recorded
              ? '<td class="miss"></td>'
              : `<td>${r.count}</td>`,
      )
      .join('');
  const row = (label: string, rows: AttendanceRow[], total: number, avg: number | null) =>
    `<tr><td class="mn"><b>${esc(label)}</b></td>${cells(rows)}<td><b>${total || ''}</b></td><td class="avg">${avg ?? ''}</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>S-3</title>
<style>${STYLE} @page { size: A5 landscape; margin: 8mm; }</style></head>
<body><section class="page">
  <h1>${esc(L.s3Title)}</h1>
  <p class="hint">${esc(L.s3Hint)}</p>
  <div class="line"><span>${esc(L.congregation)}: ${esc(opts.congregationName)}</span><span>${esc(L.month)}: ${esc(opts.monthLabel)}</span></div>
  <table>
    <thead><tr><th style="width:18%"></th>${Array.from(
      { length: columns },
      (_, i) => `<th>${esc(L.week(i + 1))}</th>`,
    ).join('')}<th>${esc(L.total)}</th><th>${esc(L.average)}</th></tr></thead>
    <tbody>
      ${row(L.midweekShort, month.midweek, month.midweekTotal, month.midweekAverage)}
      ${row(L.weekendShort, month.weekend, month.weekendTotal, month.weekendAverage)}
    </tbody>
  </table>
  <div class="foot"><span>S-3 · ${esc(L.legend)}</span><span>${esc(L.printed)} ${esc(opts.printedOn)}</span></div>
</section></body></html>`;
}
