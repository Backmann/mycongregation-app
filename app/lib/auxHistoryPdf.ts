import type { AuxCell, AuxYearView } from './api';

/**
 * THE PRINTED HISTORY OF AUXILIARY SERVICE (29 October 2026, mockup screen
 * 12). A service year, or any run of up to twelve months; by people — a row
 * each, a column a month, «норма / сдано» in the cell — or by months — each
 * month with who served in it. What is still only asked for (an application
 * before the committee) is not history and is left out.
 *
 * Kept to the app's other printed sheets: Manrope where the browser has it,
 * the teal masthead line, figures in tabular digits.
 */
export function buildAuxHistoryPdfHtml(opts: {
  view: AuxYearView;
  mode: 'people' | 'months';
  congregationName: string;
  title: string;
  /** «сентябрь 2025 — август 2026». */
  rangeLabel: string;
  printedOn: string;
  monthShort: (m: string) => string;
  monthLong: (m: string) => string;
  /** The month alone, for the busiest one: «Ноябрь». */
  monthOnly: (m: string) => string;
  /** Why a month allows 15 hours, already in words. */
  reasonsOf: (m: string) => string;
  fontFaces?: string;
  labels: {
    kicker: string;
    printed: string;
    people: string;
    months: string;
    busiest: string;
    busiestNone: string;
    hours: string;
    name: string;
    monthsCol: string;
    hoursCol: string;
    inMonth: string;
    nobody: string;
    personCount: (n: number) => string;
    may15: string;
    note: string;
    noteMonths: string;
  };
}): string {
  const { view, mode, labels: L, monthShort, monthLong } = opts;
  const served = (c: AuxCell) => c.state !== 'pending';
  const rows = view.rows
    .map((r) => ({ ...r, cells: r.cells.filter(served) }))
    .filter((r) => r.cells.length > 0);
  const counts = view.months.map((m) => ({
    month: m,
    n: rows.filter((r) => r.cells.some((c) => c.month === m)).length,
  }));
  const totalMonths = rows.reduce((s, r) => s + r.cells.length, 0);
  const totalHours = rows.reduce(
    (s, r) => s + r.cells.reduce((a, c) => a + (c.hours ?? 0), 0),
    0,
  );
  const peak = counts.reduce((a, b) => (b.n > a.n ? b : a), { month: '', n: 0 });
  const reducible = new Set(view.reducible.map((x) => x.month));

  const cellHtml = (c: AuxCell | undefined) => {
    if (!c) return '<td class="c"></td>';
    const cls = c.hours !== null ? 'done' : c.month > view.current ? 'ahead' : 'due';
    return `<td class="c ${cls}"><span class="g">${c.goal}</span>${
      c.hours !== null ? `<span class="sl">/</span><b>${c.hours}</b>` : ''
    }</td>`;
  };

  const people = `
    <table class="grid">
      <thead><tr>
        <th class="nm">${esc(L.name)}</th>
        ${view.months
          .map((m) => `<th class="${reducible.has(m) ? 'r15' : ''}">${esc(monthShort(m))}</th>`)
          .join('')}
        <th class="t">${esc(L.monthsCol)}</th>
        <th class="t">${esc(L.hoursCol)}</th>
      </tr></thead>
      <tbody>
        ${
          rows.length === 0
            ? `<tr><td class="empty" colspan="${view.months.length + 3}">${esc(L.nobody)}</td></tr>`
            : rows
                .map((r) => {
                  const by = new Map(r.cells.map((c) => [c.month, c]));
                  const h = r.cells.reduce((a, c) => a + (c.hours ?? 0), 0);
                  return `<tr>
                    <td class="nm">${esc(r.name)}</td>
                    ${view.months.map((m) => cellHtml(by.get(m))).join('')}
                    <td class="t">${r.cells.length}</td>
                    <td class="t">${h || ''}</td>
                  </tr>`;
                })
                .join('')
        }
      </tbody>
      <tfoot><tr>
        <td class="nm">${esc(L.inMonth)}</td>
        ${counts.map((c) => `<td class="c">${c.n || ''}</td>`).join('')}
        <td class="t">${totalMonths}</td>
        <td class="t">${totalHours}</td>
      </tr></tfoot>
    </table>`;

  const months = `
    <div class="mgrid">
      ${view.months
        .map((m) => {
          const here = rows
            .map((r) => ({ name: r.name, c: r.cells.find((c) => c.month === m) }))
            .filter((x): x is { name: string; c: AuxCell } => !!x.c);
          const why = reducible.has(m) ? opts.reasonsOf(m) : '';
          return `<div class="mb">
            <div class="mh">
              <span class="mt">${esc(cap(monthLong(m)))}</span>
              <span class="mn">${esc(L.personCount(here.length))}</span>
            </div>
            ${why ? `<div class="m15">${esc(L.may15)} · ${esc(why)}</div>` : ''}
            ${
              here.length === 0
                ? `<div class="none">—</div>`
                : `<table class="ml">${here
                    .map(
                      (x) => `<tr><td>${esc(x.name)}</td><td class="mg">${x.c.goal}</td><td class="mhrs">${
                        x.c.hours !== null ? x.c.hours : ''
                      }</td></tr>`,
                    )
                    .join('')}</table>`
            }
          </div>`;
        })
        .join('')}
    </div>`;

  const F = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
${opts.fontFaces ?? ''}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Manrope_400Regular', ${F}; color: #0f172a; width: 100%;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .kick { font-family: 'Manrope_800ExtraBold', ${F}; font-size: 7.5pt; letter-spacing: 1.4px;
    text-transform: uppercase; color: #0e7490; }
  h1 { font-family: 'Manrope_800ExtraBold', ${F}; font-weight: normal; font-size: 19pt;
    margin: 3px 0 2px; letter-spacing: -0.3px; }
  .sub { font-size: 8.5pt; color: #64748b; }
  .stats { display: flex; gap: 8px; margin: 12px 0 14px; }
  .st { flex: 1; min-width: 0; border: 1px solid #e2e8f0; border-radius: 9px; padding: 9px 11px; }
  .st b { display: block; font-family: 'Manrope_800ExtraBold', ${F}; font-weight: normal;
    font-size: 15pt; font-variant-numeric: tabular-nums; }
  .st span { font-size: 7.5pt; color: #64748b; }
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .grid th { font-family: 'Manrope_700Bold', ${F}; font-weight: normal; font-size: 6.8pt;
    color: #64748b; text-transform: uppercase; letter-spacing: .4px; padding: 5px 2px;
    border-bottom: 2px solid #e2e8f0; text-align: center; }
  .grid th.r15 { color: #b45309; }
  .grid th.nm, .grid td.nm { text-align: left; width: 22%; padding-left: 4px; }
  .grid th.t, .grid td.t { width: 6%; }
  .grid td { font-size: 8pt; padding: 5px 2px; text-align: center;
    border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums; }
  .grid td.nm { font-family: 'Manrope_700Bold', ${F}; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; }
  .grid td.t { font-family: 'Manrope_700Bold', ${F}; }
  .c.done { background: #f0fdf4; color: #166534; }
  .c.due { background: #f8fafc; color: #64748b; }
  .c.ahead { color: #0369a1; }
  .c .sl { color: #94a3b8; margin: 0 1px; }
  .c b { font-family: 'Manrope_800ExtraBold', ${F}; font-weight: normal; }
  .grid tfoot td { border-top: 2px solid #e2e8f0; border-bottom: none;
    font-family: 'Manrope_700Bold', ${F}; color: #0e7490; }
  .empty { color: #94a3b8; padding: 14px !important; }
  .mgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .mb { border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px 10px; break-inside: avoid; }
  .mh { display: flex; justify-content: space-between; align-items: baseline; }
  .mt { font-family: 'Manrope_800ExtraBold', ${F}; font-size: 10.5pt; }
  .mn { font-size: 7.5pt; color: #64748b; }
  .m15 { font-size: 7pt; color: #b45309; margin-top: 1px; }
  table.ml { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .ml td { font-size: 8pt; padding: 3px 0; border-top: 1px solid #f1f5f9; }
  .ml td.mg { width: 26px; text-align: right; color: #64748b; }
  .ml td.mhrs { width: 30px; text-align: right; font-family: 'Manrope_800ExtraBold', ${F}; color: #166534; }
  .none { font-size: 8pt; color: #cbd5e1; margin-top: 4px; }
  .foot { margin-top: 12px; padding-top: 7px; border-top: 1px solid #eef2f6;
    font-size: 7.5pt; color: #94a3b8; display: flex; justify-content: space-between; }
  @page { size: A4 portrait; margin: 12mm; }
</style></head><body>
  <div class="kick">${esc(L.kicker)}</div>
  <h1>${esc(opts.title)}</h1>
  <div class="sub">${esc(opts.rangeLabel)} · ${esc(opts.congregationName)} · ${esc(L.printed)} ${esc(opts.printedOn)}</div>
  <div class="stats">
    <div class="st"><b>${rows.length}</b><span>${esc(L.people)}</span></div>
    <div class="st"><b>${totalMonths}</b><span>${esc(L.months)}</span></div>
    <div class="st"><b>${peak.n > 0 ? esc(cap(opts.monthOnly(peak.month))) : '—'}</b><span>${
      peak.n > 0 ? esc(L.busiest.replace('{{n}}', String(peak.n))) : esc(L.busiestNone)
    }</span></div>
    <div class="st"><b>${totalHours}</b><span>${esc(L.hours)}</span></div>
  </div>
  ${mode === 'people' ? people : months}
  <div class="foot"><span>${esc(mode === 'people' ? L.note : L.noteMonths)}</span><span>${esc(opts.congregationName)}</span></div>
</body></html>`;
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
