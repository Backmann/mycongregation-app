/**
 * Monthly cleaning PDF for the congregation notice board. One A4 page: a grid of
 * cleaning slots (rows) against the month's weeks (columns), with the assigned
 * service group in each cell. A colored accent dot marks each slot. Convention
 * weeks show the event name. No private data.
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

export function buildCleaningSchedulePdfHtml(opts: {
  weeks: CleaningPdfWeek[];
  rows: CleaningPdfRow[];
  congregationName?: string | null;
  hallAddress?: string | null;
  monthLabel: string;
  locale: string;
  labels: CleaningPdfLabels;
}): string {
  const {
    weeks,
    rows,
    congregationName,
    hallAddress,
    monthLabel,
    locale,
    labels: L,
  } = opts;

  const meta = [congregationName, hallAddress].filter(Boolean).join(' · ');
  const cols = weeks.map((w) => `<th>${esc(w.label)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = weeks
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
  .page { padding: 16px 18px; }
  .pagehead { border-bottom: 3px solid #7c3aed; padding-bottom: 7px; margin-bottom: 12px; }
  .pagehead h1 { font-size: 17px; margin: 0; color: #7c3aed; letter-spacing: -0.2px; }
  .pagehead .sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th {
    font-size: 10px; color: #64748b; font-weight: 700; text-align: center;
    padding: 9px 4px; border-bottom: 2px solid #e2e8f0; background: #faf8ff;
  }
  th.dt { text-align: left; width: 28%; padding-left: 10px; }
  td {
    font-size: 12px; padding: 12px 6px; text-align: center;
    border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 600;
    word-wrap: break-word; overflow-wrap: break-word;
  }
  td.dt { text-align: left; }
  tbody tr:nth-child(even) td { background: #fdfcff; }
  .dot {
    display: inline-block; width: 10px; height: 10px; border-radius: 999px;
    margin-right: 8px; vertical-align: middle;
  }
  .dlabel { font-size: 12px; font-weight: 600; color: #334155; vertical-align: middle; }
  .empty { color: #cbd5e1; font-weight: 400; }
  .note { color: #5b21b6; font-weight: 700; font-size: 10px; }
  .foot {
    margin-top: 14px; padding-top: 8px; border-top: 1px solid #eef2f6;
    font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between;
  }
  @page { size: A4 portrait; margin: 10mm; }
</style></head>
<body>
  <section class="page">
    <header class="pagehead">
      <h1>${esc(L.title)} · ${esc(monthLabel)}</h1>
      ${meta ? `<div class="sub">${esc(meta)}</div>` : ''}
    </header>
    <table>
      <thead><tr><th class="dt">${esc(L.slotColumn)}</th>${cols}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="foot"><span>mycongregation.org</span><span>${esc(
      new Date().toLocaleDateString(locale),
    )}</span></div>
  </section>
</body></html>`;
}
