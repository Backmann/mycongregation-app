/**
 * Monthly duties PDF for the congregation notice board. One A4 page with two
 * sections — midweek on top, weekend below — each a grid of duty types (rows)
 * against the month's weeks (columns), with the assigned publisher in each cell.
 * A colored accent dot marks each duty type. Convention weeks show "Конгресс"
 * in the column. No phone numbers or private data.
 */

export interface DutiesPdfWeek {
  weekStartDate: string; // Monday, YYYY-MM-DD
  label: string; // e.g. "5 авг"
  /** If set, this week has no duties (e.g. a convention) — show this instead. */
  note?: string | null;
}

/** One duty row: a colored type with the assignee per week. */
export interface DutiesPdfRow {
  label: string; // e.g. "Распорядитель у входа", "Микрофон 1"
  color: string; // accent color for the dot
  /** weekStartDate -> assignee display name (or null). */
  nameByWeek: Record<string, string | null>;
}

export interface DutiesPdfSection {
  title: string; // "Встреча в будний день"
  accent: string; // section badge color
  weeks: DutiesPdfWeek[];
  rows: DutiesPdfRow[];
}

export interface DutiesPdfLabels {
  title: string; // "Обязанности"
  dutyColumn: string; // "Обязанность"
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

function sectionHtml(section: DutiesPdfSection, L: DutiesPdfLabels): string {
  const cols = section.weeks
    .map((w) => `<th>${esc(w.label)}</th>`)
    .join('');
  const body = section.rows
    .map((row) => {
      const cells = section.weeks
        .map((w) => {
          if (w.note) {
            return `<td class="note">${esc(w.note)}</td>`;
          }
          const name = row.nameByWeek[w.weekStartDate];
          return name
            ? `<td>${esc(name)}</td>`
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
  return `<div class="sect">
  <div class="slabel" style="background:${section.accent}">${esc(
    section.title,
  )}</div>
  <table>
    <thead><tr><th class="dt">${esc(L.dutyColumn)}</th>${cols}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</div>`;
}

export function buildDutiesSchedulePdfHtml(opts: {
  sections: DutiesPdfSection[];
  congregationName?: string | null;
  hallAddress?: string | null;
  monthLabel: string;
  locale: string;
  labels: DutiesPdfLabels;
}): string {
  const {
    sections,
    congregationName,
    hallAddress,
    monthLabel,
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
  .pagehead { border-bottom: 3px solid #dc2626; padding-bottom: 7px; margin-bottom: 11px; }
  .pagehead h1 { font-size: 16px; margin: 0; color: #dc2626; letter-spacing: -0.2px; }
  .pagehead .sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .sect { margin-bottom: 14px; }
  .slabel {
    display: inline-block; font-size: 12px; font-weight: 700; color: #fff;
    border-radius: 999px; padding: 4px 13px; margin-bottom: 6px;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.dt { width: 24%; }
  th {
    font-size: 9px; color: #64748b; font-weight: 700; text-align: center;
    padding: 5px 3px; border-bottom: 2px solid #e2e8f0; background: #f8fafc;
  }
  th.dt { text-align: left; width: 24%; padding-left: 8px; }
  td {
    font-size: 10px; padding: 5px 4px; text-align: center;
    border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 600;
    word-wrap: break-word; overflow-wrap: break-word;
  }
  td.dt { text-align: left; }
  tbody tr:nth-child(even) td { background: #fcfdfe; }
  .dot {
    display: inline-block; width: 9px; height: 9px; border-radius: 999px;
    margin-right: 7px; vertical-align: middle;
  }
  .dlabel { font-size: 10px; font-weight: 600; color: #334155; vertical-align: middle; }
  .empty { color: #cbd5e1; font-weight: 400; }
  .note { color: #5b21b6; font-weight: 700; font-size: 9px; }
  .foot {
    margin-top: 10px; padding-top: 7px; border-top: 1px solid #eef2f6;
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
    ${sections.map((s) => sectionHtml(s, L)).join('\n')}
    <div class="foot"><span>mycongregation.org</span><span>${esc(
      new Date().toLocaleDateString(locale),
    )}</span></div>
  </section>
</body></html>`;
}
