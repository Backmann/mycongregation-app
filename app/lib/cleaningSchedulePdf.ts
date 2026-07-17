/**
 * Quarterly cleaning PDF for the congregation notice board. One A4 page with a
 * block per month (up to a quarter); each block is a grid of cleaning slots
 * (rows) against that month's weeks (columns), with the assigned service group
 * in each cell. A colored accent dot marks each slot. Convention weeks show the
 * event name. No private data.
 */

export interface CleaningPdfWeek {
  weekStartDate: string; // Monday, YYYY-MM-DD
  label: string; // e.g. "4–10 авг"
  note?: string | null; // e.g. "Региональный конгресс"
}

export interface CleaningPdfRow {
  label: string; // "После встреч", "Еженедельная уборка", "Генеральная уборка"
  color: string; // accent color for the dot
  /** weekStartDate -> assignee text (group name / "Всё собрание" / null). */
  valueByWeek: Record<string, string | null>;
}

/** One month block: its label plus its own weeks and rows. */
export interface CleaningPdfMonth {
  monthLabel: string; // e.g. "Август 2026"
  weeks: CleaningPdfWeek[];
  rows: CleaningPdfRow[];
}

export interface CleaningPdfLabels {
  title: string; // "Уборка"
  slotColumn: string; // "Вид уборки"
  emptyCell: string; // "—"
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function monthHtml(month: CleaningPdfMonth, L: CleaningPdfLabels): string {
  const cols = month.weeks.map((w) => `<th>${esc(w.label)}</th>`).join('');
  const body = month.rows
    .map((row) => {
      const cells = month.weeks
        .map((w) => {
          if (w.note) return `<td class="note">${esc(w.note)}</td>`;
          const v = row.valueByWeek[w.weekStartDate];
          return v
            ? `<td>${esc(v)}</td>`
            : `<td class="empty">${esc(L.emptyCell)}</td>`;
        })
        .join('');
      return `<tr>
  <td class="dt"><span class="dot" style="background:${row.color}"></span><span class="dlabel">${esc(
        row.label,
      )}</span></td>
  ${cells}
</tr>`;
    })
    .join('');
  return `<div class="mblock">
  <div class="mlabel">${esc(month.monthLabel)}</div>
  <table>
    <thead><tr><th class="dt">${esc(L.slotColumn)}</th>${cols}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</div>`;
}

export function buildCleaningSchedulePdfHtml(opts: {
  months: CleaningPdfMonth[];
  congregationName?: string | null;
  hallAddress?: string | null;
  periodLabel: string; // e.g. "Август — Октябрь 2026"
  locale: string;
  labels: CleaningPdfLabels;
}): string {
  const {
    months,
    congregationName,
    hallAddress,
    periodLabel,
    locale,
    labels: L,
  } = opts;

  const meta = [congregationName, hallAddress].filter(Boolean).join(' · ');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    L.title,
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
  .pagehead { border-bottom: 3px solid #7c3aed; padding-bottom: 7px; margin-bottom: 11px; }
  .pagehead h1 { font-size: 16px; margin: 0; color: #7c3aed; letter-spacing: -0.2px; }
  .pagehead .sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .mblock { margin-bottom: 11px; page-break-inside: avoid; }
  .mlabel {
    display: inline-block; font-size: 12px; font-weight: 700; color: #fff;
    background: #7c3aed; border-radius: 999px; padding: 3px 13px; margin-bottom: 5px;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th {
    font-size: 9px; color: #64748b; font-weight: 700; text-align: center;
    padding: 5px 3px; border-bottom: 2px solid #e2e8f0; background: #faf8ff;
  }
  th.dt { text-align: left; width: 26%; padding-left: 8px; }
  td {
    font-size: 10px; padding: 6px 4px; text-align: center;
    border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 600;
    word-wrap: break-word; overflow-wrap: break-word;
  }
  td.dt { text-align: left; }
  tbody tr:nth-child(even) td { background: #fdfcff; }
  .dot {
    display: inline-block; width: 9px; height: 9px; border-radius: 999px;
    margin-right: 7px; vertical-align: middle;
  }
  .dlabel { font-size: 10px; font-weight: 600; color: #334155; vertical-align: middle; }
  .empty { color: #cbd5e1; font-weight: 400; }
  .note { color: #5b21b6; font-weight: 700; font-size: 8px; }
  .foot {
    margin-top: 10px; padding-top: 7px; border-top: 1px solid #eef2f6;
    font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between;
  }
  @page { size: A4 portrait; margin: 10mm; }
</style></head>
<body>
  <section class="page">
    <header class="pagehead">
      <h1>${esc(L.title)} · ${esc(periodLabel)}</h1>
      ${meta ? `<div class="sub">${esc(meta)}</div>` : ''}
    </header>
    ${months.map((mo) => monthHtml(mo, L)).join('\n')}
    <div class="foot"><span>mycongregation.org</span><span>${esc(
      new Date().toLocaleDateString(locale),
    )}</span></div>
  </section>
</body></html>`;
}
