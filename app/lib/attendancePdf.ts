import { AttendanceYear } from './api';

/**
 * The attendance record (S-3) for one service year, laid out as the paper form
 * is: a row per month, five week columns, and the month's total and average —
 * separately for the midweek and the weekend meeting.
 *
 * The five columns are ordinal, not calendar. A month holds four meetings of
 * each kind or five, and one where an assembly fell holds fewer; the columns
 * fill from the left with whatever that month actually had, and the rest stay
 * blank. That is how the paper form is filled in by hand, and matching it is
 * the point — the circuit overseer reads a shape he already knows.
 *
 * Three states are told apart, because a reader of the finished sheet cannot
 * ask what a blank meant: a figure, a dash for a meeting that was not held,
 * and an empty cell for one nobody entered. The empty cell is deliberately
 * left visible rather than tidied away — a gap that vanishes is a gap nobody
 * fixes.
 */
export function buildAttendancePdfHtml(opts: {
  year: AttendanceYear;
  congregationName: string;
  labels: {
    title: string;
    serviceYear: string;
    month: string;
    total: string;
    average: string;
    midweek: string;
    weekend: string;
    notHeld: string;
    printed: string;
    yearAverage: string;
  };
  monthName: (isoMonth: string) => string;
  printedOn: string;
}): string {
  const { year, congregationName, labels, monthName, printedOn } = opts;

  const cells = (rows: { count: number | null; notHeld: boolean; recorded: boolean }[]) => {
    const out: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = rows[i];
      if (!r) out.push('<td></td>');
      else if (r.notHeld) out.push('<td class="nh">—</td>');
      else if (!r.recorded) out.push('<td class="miss"></td>');
      else out.push(`<td>${r.count}</td>`);
    }
    return out.join('');
  };

  const block = (kind: 'midweek' | 'weekend') => {
    const label = kind === 'midweek' ? labels.midweek : labels.weekend;
    const body = year.months
      .map((m) => {
        const rows = kind === 'midweek' ? m.midweek : m.weekend;
        const total = kind === 'midweek' ? m.midweekTotal : m.weekendTotal;
        const avg = kind === 'midweek' ? m.midweekAverage : m.weekendAverage;
        return `<tr>
          <td class="mn">${esc(monthName(m.month))}</td>
          ${cells(rows)}
          <td class="tot">${total || ''}</td>
          <td class="avg">${avg ?? ''}</td>
        </tr>`;
      })
      .join('');

    // The yearly average the annual report asks for: the twelve monthly
    // averages divided by twelve, exactly as the instruction says.
    const monthly = year.months.map((m) =>
      kind === 'midweek' ? m.midweekAverage : m.weekendAverage,
    );
    const yearly = monthly.some((v) => v !== null)
      ? Math.round(monthly.reduce<number>((a, b) => a + (b ?? 0), 0) / 12)
      : '';

    return `<div class="sect">
      <div class="slabel">${esc(label)}</div>
      <table>
        <thead><tr>
          <th class="mn">${esc(labels.month)}</th>
          <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th>
          <th class="tot">${esc(labels.total)}</th>
          <th class="avg">${esc(labels.average)}</th>
        </tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr>
          <td class="mn yl" colspan="6">${esc(labels.yearAverage)}</td>
          <td class="tot"></td>
          <td class="avg yv">${yearly}</td>
        </tr></tfoot>
      </table>
    </div>`;
  };

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    labels.title,
  )}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { padding: 14px 16px 16px; }
  .pagehead { border-bottom: 3px solid #0e7490; padding-bottom: 7px; margin-bottom: 11px; }
  .pagehead h1 { font-size: 16px; margin: 0; color: #0e7490; letter-spacing: -0.2px; }
  .pagehead .sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .sect { margin-bottom: 16px; }
  .slabel {
    display: inline-block; font-size: 12px; font-weight: 700; color: #fff;
    background: #0e7490; border-radius: 999px; padding: 4px 13px; margin-bottom: 6px;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th {
    font-size: 9px; color: #64748b; font-weight: 700; text-align: center;
    padding: 5px 3px; border-bottom: 2px solid #e2e8f0; background: #f8fafc;
  }
  th.mn, td.mn { text-align: left; width: 26%; padding-left: 8px; }
  th.tot, td.tot, th.avg, td.avg { width: 11%; }
  td {
    font-size: 10px; padding: 5px 4px; text-align: center;
    border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 600;
  }
  tbody tr:nth-child(even) td { background: #fcfdfe; }
  td.mn { font-weight: 600; text-transform: capitalize; }
  td.tot { font-weight: 700; }
  td.avg { font-weight: 700; color: #0e7490; }
  /* A meeting that was not held: a dash, never a zero. */
  td.nh { color: #94a3b8; font-weight: 400; }
  /* Nobody entered a figure. Left visibly empty on the paper too, because a
     gap that is tidied away is a gap nobody goes back to fill. */
  td.miss { background: #fffbeb; }
  tfoot td { border-top: 2px solid #e2e8f0; border-bottom: none; padding-top: 7px; }
  td.yl { text-align: right; font-size: 9px; color: #64748b; font-weight: 700; text-transform: none; }
  td.yv { font-size: 12px; }
  .foot {
    margin-top: 10px; padding-top: 7px; border-top: 1px solid #eef2f6;
    font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between;
  }
  @page { size: A4 portrait; margin: 10mm; }
</style></head>
<body>
  <section class="page">
    <div class="pagehead">
      <h1>${esc(labels.title)}</h1>
      <div class="sub">${esc(congregationName)} · ${esc(labels.serviceYear)}</div>
    </div>
    ${block('midweek')}
    ${block('weekend')}
    <div class="foot">
      <span>${esc(labels.notHeld)}</span>
      <span>${esc(labels.printed)} ${esc(printedOn)}</span>
    </div>
  </section>
</body></html>`;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
