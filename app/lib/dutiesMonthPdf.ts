import { formatDateISO } from './dates';
import { formatDay } from './date-range';

/**
 * THE DUTIES OF A MONTH, FOR THE NOTICE BOARD (27 October 2026).
 *
 * Built from the same answer as the month table (GET /duties/month), so the
 * sheet on the board says what the screen says: the meetings by their own
 * days (a meeting moved by the circuit overseer's visit on its moved day, a
 * Sunday the 1st in its own month), the congregation's places in its order,
 * its own places by their names, a meeting nobody has filled yet with its
 * places and dashes, and a convention or the Memorial as one shaded column —
 * not its name in every cell.
 *
 * One A4 page, landscape: the board is read from a step away, and eight or
 * nine meetings want the width. No phone numbers, nothing private.
 */

export interface MonthPdfColumn {
  /** «Ср 4 нояб.» */
  label: string;
  /** «19:00», or null. */
  sub: string | null;
  /** Set when the meeting is not held: the shaded column says why. */
  note: string | null;
}

export interface MonthPdfRow {
  label: string;
  color: string;
  /** One per column: a short name, or null for an empty place. */
  cells: (string | null)[];
}

export interface MonthPdfSection {
  title: string;
  columns: MonthPdfColumn[];
  rows: MonthPdfRow[];
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sectionHtml(s: MonthPdfSection, placeColumn: string, empty: string): string {
  const head = s.columns
    .map(
      (c) =>
        `<th class="${c.note ? 'off' : ''}"><span class="d">${esc(c.label)}</span>${
          c.sub ? `<span class="t">${esc(c.sub)}</span>` : ''
        }</th>`,
    )
    .join('');
  const body = s.rows
    .map((r, ri) => {
      const cells = s.columns
        .map((c, ci) => {
          if (c.note) {
            // One shaded cell for the whole column, its reason written once.
            return ri === 0
              ? `<td class="off" rowspan="${s.rows.length}"><span class="why">${esc(c.note)}</span></td>`
              : '';
          }
          const name = r.cells[ci];
          return name ? `<td>${esc(name)}</td>` : `<td class="empty">${esc(empty)}</td>`;
        })
        .join('');
      return `<tr><td class="place"><i style="background:${r.color}"></i>${esc(r.label)}</td>${cells}</tr>`;
    })
    .join('');
  return `<section class="block">
  <h2>${esc(s.title)}</h2>
  <table>
    <colgroup><col class="cplace">${s.columns.map(() => '<col>').join('')}</colgroup>
    <thead><tr><th class="place">${esc(placeColumn)}</th>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</section>`;
}

export function buildDutiesMonthPdfHtml(opts: {
  sections: MonthPdfSection[];
  title: string;
  monthLabel: string;
  congregationName?: string | null;
  hallAddress?: string | null;
  locale: string;
  labels: { place: string; empty: string; printed: string };
}): string {
  const { sections, title, monthLabel, congregationName, hallAddress, locale, labels } = opts;
  const meta = [congregationName, hallAddress].filter(Boolean).join(' · ');
  const printed = formatDay(formatDateISO(new Date()), locale, { year: 'always' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)} · ${esc(monthLabel)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { padding: 4px 2px 0; }
  header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
    padding-bottom: 10px; border-bottom: 2px solid #0e7490; margin-bottom: 14px; }
  .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #0e7490; }
  h1 { margin: 2px 0 0; font-size: 26px; line-height: 1.1; font-weight: 800; letter-spacing: -0.4px; }
  .meta { font-size: 10.5px; color: #64748b; text-align: right; line-height: 1.5; max-width: 50%; }
  .meta b { color: #0f172a; font-size: 12px; display: block; }
  .block { margin-bottom: 14px; page-break-inside: avoid; }
  h2 { margin: 0 0 6px; font-size: 12px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; color: #334155; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed;
    border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  col.cplace { width: 19%; }
  th { background: #f1f5f9; padding: 6px 4px 5px; text-align: center; vertical-align: bottom;
    border-bottom: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0; }
  th .d { display: block; font-size: 10.5px; font-weight: 800; color: #0f172a; white-space: nowrap; }
  th .t { display: block; font-size: 9px; font-weight: 600; color: #64748b; margin-top: 1px; }
  th.place { text-align: left; padding-left: 9px; font-size: 9px; font-weight: 700; letter-spacing: 0.6px;
    text-transform: uppercase; color: #94a3b8; border-left: 0; }
  td { padding: 6px 4px; font-size: 10.5px; font-weight: 600; text-align: center; color: #0f172a;
    border-bottom: 1px solid #f1f5f9; border-left: 1px solid #f1f5f9;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  tbody tr:last-child td { border-bottom: 0; }
  td.place { text-align: left; padding-left: 9px; font-weight: 600; color: #334155; border-left: 0; white-space: normal; }
  td.place i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 7px; vertical-align: 1px; }
  td.empty { color: #cbd5e1; font-weight: 400; }
  th.off { background: #e9eef4; }
  td.off { background: repeating-linear-gradient(135deg, #f8fafc 0 6px, #eef2f6 6px 12px); vertical-align: middle; }
  td.off .why { display: inline-block; font-size: 9.5px; font-weight: 700; color: #475569; white-space: normal; line-height: 1.3; }
  footer { margin-top: 6px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
  @page { size: A4 landscape; margin: 9mm 10mm; }
</style></head>
<body><div class="page">
  <header>
    <div><div class="eyebrow">${esc(title)}</div><h1>${esc(monthLabel)}</h1></div>
    ${meta ? `<div class="meta">${congregationName ? `<b>${esc(congregationName)}</b>` : ''}${esc(hallAddress ?? '')}</div>` : ''}
  </header>
  ${sections.map((s) => sectionHtml(s, labels.place, labels.empty)).join('\n')}
  <footer><span>mycongregation.org</span><span>${esc(labels.printed)} ${esc(printed)}</span></footer>
</div></body></html>`;
}
