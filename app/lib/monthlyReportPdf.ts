import { ServiceReportSummary } from './api';

/**
 * The monthly report (S-1) as a sheet to copy from.
 *
 * The secretary types this into JW Hub by the 20th. The form asks, in this
 * order: all active publishers, the average weekend attendance, then a block
 * per category — ordinary publishers with reports and studies, then auxiliary,
 * regular, special pioneers and missionaries with hours as well. The sheet is
 * laid out in the SAME order, so it is read top to bottom against the form
 * without hunting; a figure copied from the wrong line is the whole risk here.
 *
 * Two things sit below the form's own lines, marked as not part of it: the
 * midweek average, which the form does not ask for but S-10 will want a year
 * later, and the names of whoever has not handed a report in yet. The second
 * is the reason the sheet exists on the 15th rather than the 20th — the point
 * is to see who is still missing while there is time to ask them.
 */
export function buildMonthlyReportPdfHtml(opts: {
  summary: ServiceReportSummary;
  attendance: { weekend: number | null; midweek: number | null };
  missing: string[];
  congregationName: string;
  monthLabel: string;
  labels: {
    title: string;
    allActive: string;
    weekendAverage: string;
    midweekAverage: string;
    notForForm: string;
    categories: Record<string, string>;
    count: string;
    hours: string;
    studies: string;
    missingTitle: string;
    printed: string;
    draftNote: string;
  };
  printedOn: string;
}): string {
  const {
    summary,
    attendance,
    missing,
    congregationName,
    monthLabel,
    labels,
    printedOn,
  } = opts;

  const row = (label: string, value: string | number) =>
    `<tr><td class="lbl">${esc(label)}</td><td class="val">${esc(
      String(value),
    )}</td></tr>`;

  const categories = summary.categories
    .map(
      (c) => `<section class="cat">
      <h2>${esc(labels.categories[c.pioneerType] ?? c.pioneerType)}</h2>
      <table class="card">
        ${row(labels.count, c.count)}
        ${c.hours !== null ? row(labels.hours, c.hours) : ''}
        ${row(labels.studies, c.bibleStudies)}
      </table>
    </section>`,
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    labels.title,
  )}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Manrope', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .masthead {
    background: linear-gradient(105deg, #0fa8c4 0%, #0e7490 55%, #0b5a70 100%);
    color: #fff; border-radius: 10px; padding: 13px 16px 12px;
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 16px;
  }
  .masthead h1 { font-size: 17px; font-weight: 800; margin: 0; }
  .masthead .mo { font-size: 10.5px; opacity: 0.85; margin-top: 3px; }
  .masthead .who { font-size: 12px; font-weight: 700; text-align: right; }
  .draft {
    font-size: 9px; color: #92400e; background: #fffbeb;
    border: 1px solid #fde68a; border-left: 3px solid #f59e0b;
    border-radius: 6px; padding: 6px 9px; margin: 9px 0 13px;
  }
  section { margin-bottom: 13px; break-inside: avoid; }
  h2 {
    font-size: 9.5px; font-weight: 800; margin: 0 0 5px;
    letter-spacing: 0.06em; text-transform: uppercase; color: #6d28d9;
    display: flex; align-items: center; gap: 7px;
  }
  h2::before {
    content: ''; width: 13px; height: 3px; border-radius: 2px;
    background: currentColor; flex: none;
  }
  .head h2 { color: #c2410c; }
  table { width: 100%; border-collapse: collapse; }
  .card {
    background: #fbfcfe; border: 1px solid #eef2f7; border-radius: 8px;
    overflow: hidden;
  }
  .card tr:last-child td { border-bottom: none; }
  td.lbl {
    font-size: 11px; padding: 7px 10px 6px; border-bottom: 1px solid #eef2f7;
  }
  td.val {
    font-size: 16px; font-weight: 800; text-align: right; width: 76px;
    padding: 6px 10px; border-bottom: 1px solid #eef2f7;
    font-variant-numeric: tabular-nums; color: #6d28d9;
  }
  .head td.val { color: #c2410c; }
  .aside {
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-left: 4px solid #94a3b8; border-radius: 8px;
    padding: 11px 13px; margin-top: 16px;
  }
  .aside h2 { color: #475569; }
  .aside .names { font-size: 9.5px; color: #334155; line-height: 1.7; }
  .sep { color: #cbd5e1; padding: 0 4px; }
  .foot {
    margin-top: 13px; padding-top: 7px; border-top: 1px solid #eef2f7;
    font-size: 8.5px; color: #94a3b8; display: flex;
    justify-content: space-between;
  }
  @page { size: A4 portrait; margin: 11mm; }
</style></head>
<body>
  <div class="masthead">
    <div>
      <h1>${esc(labels.title)}</h1>
      <div class="mo">${esc(monthLabel)}</div>
    </div>
    <div class="who">${esc(congregationName)}</div>
  </div>
  <div class="draft">${esc(labels.draftNote)}</div>

  <section class="head">
    <table class="card">
      ${row(labels.allActive, summary.totalActivePublishers)}
      ${row(labels.weekendAverage, attendance.weekend ?? '—')}
    </table>
  </section>

  ${categories}

  <div class="aside">
    <h2>${esc(labels.notForForm)}</h2>
    <table>
      ${row(labels.midweekAverage, attendance.midweek ?? '—')}
    </table>
    ${
      missing.length > 0
        ? `<div style="margin-top:9px">
      <h2>${esc(labels.missingTitle)} (${missing.length})</h2>
      <div class="names">${missing
        .map((n) => esc(n))
        .join('<span class="sep">·</span>')}</div>
    </div>`
        : ''
    }
  </div>

  <div class="foot">
    <span>${esc(congregationName)}</span>
    <span>${esc(labels.printed)} ${esc(printedOn)}</span>
  </div>
</body></html>`;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
