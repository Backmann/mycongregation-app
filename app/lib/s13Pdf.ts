import type { TFunction } from 'i18next';
import {
  CELLS_PER_LINE,
  LINES_PER_SHEET,
  s13Lines,
  s13Sheets,
  type S13Data,
  type S13Line,
} from './s13';

/**
 * The S-13 «Данные о назначении участков» printed as the form itself
 * (11 November 2026): A4 upright, the same columns at the same widths,
 * twenty lines a sheet, each line a surname over two days for four
 * assignments. Laid out by lib/s13.ts; this file only draws.
 */
export function buildS13Html(data: S13Data, t: TFunction): string {
  const lines = s13Lines(data, {
    group: t('territories.s13.groupShort'),
    campaign: t('territories.s13.campaign'),
  });
  const year = `${data.serviceYear - 1}/${String(data.serviceYear).slice(2)}`;
  const sheets = s13Sheets(lines)
    .map((sheet, i, all) => page(sheet, t, year, i + 1, all.length))
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    `S-13 ${year}`,
  )}</title><style>${STYLES}</style></head><body>${sheets}</body></html>`;
}

function page(lines: S13Line[], t: TFunction, year: string, n: number, of: number): string {
  const rows: string[] = [];
  for (let i = 0; i < LINES_PER_SHEET; i++) {
    const l = lines[i];
    const cells = Array.from({ length: CELLS_PER_LINE }, (_, k) => l?.cells[k]);
    rows.push(`<tr class="top">
      <td class="num" rowspan="2">${esc(l?.number ?? '')}</td>
      <td class="last" rowspan="2">${esc(l?.last ?? '')}</td>
      ${cells
        .map(
          (c) =>
            // A long name in smaller type rather than cut short.
            `<td class="name${(c?.name.length ?? 0) > 22 ? ' long' : ''}" colspan="2">${esc(
              c?.name ?? '',
            )}</td>`,
        )
        .join('')}
    </tr><tr class="bottom">
      ${cells
        .map(
          (c) =>
            `<td class="day">${esc(c?.received ?? '')}</td><td class="day">${esc(c?.worked ?? '')}</td>`,
        )
        .join('')}
    </tr>`);
  }
  const head = Array.from(
    { length: CELLS_PER_LINE },
    () => `<th colspan="2" class="who">${esc(t('territories.s13.name'))}</th>`,
  ).join('');
  const sub = Array.from(
    { length: CELLS_PER_LINE },
    () =>
      `<th class="sub">${esc(t('territories.s13.received'))}</th><th class="sub">${esc(
        t('territories.s13.worked'),
      )}</th>`,
  ).join('');
  return `<section class="sheet">
  <h1>${esc(t('territories.s13.title'))}</h1>
  <div class="year">${esc(t('territories.s13.serviceYear'))} <span>${esc(year)}</span></div>
  <table>
    <colgroup><col class="c-num"><col class="c-last">${'<col class="c-day"><col class="c-day">'.repeat(
      CELLS_PER_LINE,
    )}</colgroup>
    <thead>
      <tr><th rowspan="2" class="num">${esc(t('territories.s13.number'))}</th><th rowspan="2" class="last">${esc(
        t('territories.s13.last'),
      )}</th>${head}</tr>
      <tr>${sub}</tr>
    </thead>
    <tbody>${rows.join('')}</tbody>
  </table>
  <div class="note">${esc(t('territories.s13.note'))}</div>
  <div class="foot"><span>S-13</span><span>${of > 1 ? `${n} / ${of}` : ''}</span></div>
</section>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

// Measured off the printed blank: 12.7 mm sides, number 15 mm, last worked
// 19.7 mm, each assignment 37.5 mm split in two days; a line 11 mm.
const STYLES = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.sheet { width: 210mm; height: 297mm; padding: 17mm 12.7mm 10mm; page-break-after: always; position: relative; }
.sheet:last-child { page-break-after: auto; }
h1 { font-size: 13pt; font-weight: 700; text-align: center; margin: 0 0 6mm; letter-spacing: 0.2pt; }
.year { font-size: 10.5pt; font-weight: 700; margin-bottom: 3mm; }
.year span { display: inline-block; min-width: 22mm; border-bottom: 0.6pt solid #000; font-weight: 400; padding: 0 1mm; }
table { width: 184.6mm; border-collapse: collapse; table-layout: fixed; border: 1.4pt solid #000; }
col.c-num { width: 15mm; } col.c-last { width: 19.7mm; } col.c-day { width: 18.75mm; }
th { background: #d9d9d9; font-weight: 400; font-size: 7.5pt; line-height: 1.15; padding: 1mm 0.5mm; border: 0.6pt solid #000; text-align: center; vertical-align: middle; }
th.sub { font-size: 6.3pt; color: #333; border-top: none; }
th.who { border-bottom: none; font-size: 7.3pt; }
td { border: 0.6pt solid #000; font-size: 7.8pt; text-align: center; vertical-align: middle; padding: 0 0.6mm; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
td.num { font-weight: 700; border-right: 1.2pt solid #000; height: 11mm; }
td.last { border-right: 1.2pt solid #000; }
tr.top td.name { height: 5.5mm; font-size: 7.6pt; }
tr.bottom td.day { height: 5.5mm; font-size: 7.4pt; }
tr.top td.name.long { font-size: 6.2pt; letter-spacing: -0.1pt; }
tr.top { border-top: 1.2pt solid #000; }
/* A heavy line between the four assignments, as on the blank. */
th.who, td.name, tr.bottom td.day:nth-child(odd) { border-left: 1.2pt solid #000; }
thead tr:nth-child(2) th.sub:nth-child(odd) { border-left: 1.2pt solid #000; }
.note { font-size: 7.5pt; margin-top: 2.5mm; }
.foot { position: absolute; left: 12.7mm; right: 12.7mm; bottom: 8mm; display: flex; justify-content: space-between; font-size: 7.5pt; }
`;
