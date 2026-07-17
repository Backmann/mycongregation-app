import type { Assignment, EventType } from './api';

/**
 * Monthly meeting-schedule PDF as a grid: parts down the left, weeks across the
 * top, assignee names (+ themes) in the cells. Designed for the congregation
 * notice board — a public month-at-a-glance sheet that fits one A4 page even
 * with five weeks. No phone numbers or private data, just names, parts, themes.
 */

export interface MeetingPdfWeek {
  weekStartDate: string; // YYYY-MM-DD (Monday)
  meetingDateLabel: string; // e.g. "7 июля"
}

export interface MeetingPdfPart {
  partKey: string;
  label: string; // localized part label
  subsection: string; // grouping key
  durationLabel?: string | null; // e.g. "10 мин"
}

export interface MeetingPdfSection {
  key: string;
  label: string | null; // null = no heading (opening/closing)
  color: string;
  colorMuted: string;
  parts: MeetingPdfPart[];
}

export interface MeetingPdfLabels {
  title: string; // "Встреча в будний день"
  subtitleDow: string; // "Среда" / "Воскресенье"
  partColumn: string; // "Часть"
  emptyCell: string; // "—"
  conductorShort: string; // "рук."
  readerShort: string; // "чтец"
}

interface CellData {
  name: string | null;
  assistant: string | null;
  theme: string | null;
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the monthly meeting-schedule grid HTML for one event type.
 */
export function buildMeetingSchedulePdfHtml(opts: {
  eventType: EventType;
  weeks: MeetingPdfWeek[];
  sections: MeetingPdfSection[];
  /** assignments[weekStartDate][partKey] -> cell data (name/assistant/theme). */
  cellFor: (weekStartDate: string, partKey: string) => CellData | null;
  congregationName?: string | null;
  hallAddress?: string | null;
  monthLabel: string; // e.g. "Июль 2026"
  timeLabel?: string | null; // e.g. "19:00"
  locale: string;
  labels: MeetingPdfLabels;
}): string {
  const {
    weeks,
    sections,
    cellFor,
    congregationName,
    hallAddress,
    monthLabel,
    timeLabel,
    locale,
    labels: L,
  } = opts;

  // Always render 5 week columns for a stable layout; empty ones show a dash.
  const weekCols = weeks.slice(0, 5);

  const cellHtml = (weekStart: string, part: MeetingPdfPart): string => {
    const data = cellFor(weekStart, part.partKey);
    if (!data || (!data.name && !data.assistant)) {
      return `<span class="empty">${esc(L.emptyCell)}</span>`;
    }
    const parts: string[] = [];
    if (data.name && data.assistant) {
      // Conductor / reader style pair (e.g. CBS): name (рук.) / assistant (чтец).
      parts.push(
        `<span class="nm">${esc(data.name)}</span> <span class="role">${esc(
          L.conductorShort,
        )}</span>`,
      );
      parts.push(
        `<span class="nm">${esc(data.assistant)}</span> <span class="role">${esc(
          L.readerShort,
        )}</span>`,
      );
    } else if (data.name) {
      parts.push(`<span class="nm">${esc(data.name)}</span>`);
    }
    let html = parts.join(' / ');
    if (data.theme) {
      html += `<span class="theme">${esc(data.theme)}</span>`;
    }
    return html;
  };

  const bodyRows = sections
    .map((section) => {
      const sectionHeading =
        section.label != null
          ? `<tr><td colspan="${weekCols.length + 1}" class="sect" style="color:${
              section.color
            };background:${section.colorMuted}">${esc(section.label)}</td></tr>`
          : '';
      const partRows = section.parts
        .map((part) => {
          const cells = weekCols
            .map(
              (w) => `<td>${cellHtml(w.weekStartDate, part)}</td>`,
            )
            .join('');
          const dur = part.durationLabel
            ? `<span class="dur">${esc(part.durationLabel)}</span>`
            : '';
          return `<tr>
<td class="part">${esc(part.label)}${dur}</td>
${cells}
</tr>`;
        })
        .join('\n');
      return sectionHeading + '\n' + partRows;
    })
    .join('\n');

  const weekHeaders = weekCols
    .map((w) => `<th class="wk">${esc(w.meetingDateLabel)}</th>`)
    .join('');
  // Pad to 5 columns for a stable grid width.
  const padCols = Array.from({ length: 5 - weekCols.length })
    .map(() => `<th class="wk">${esc(L.emptyCell)}</th>`)
    .join('');

  const metaChips = [
    `<span class="chip">${esc(L.subtitleDow)}</span>`,
    timeLabel ? `<span class="chip">${esc(timeLabel)}</span>` : '',
    `<span class="chip">${esc(monthLabel)}</span>`,
    congregationName ? `<span class="chip">${esc(congregationName)}</span>` : '',
    hallAddress ? `<span class="chip">${esc(hallAddress)}</span>` : '',
  ]
    .filter(Boolean)
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
  .page { padding: 18px 24px 20px; }
  .pagehead { border-bottom: 3px solid #0e7490; padding-bottom: 10px; margin-bottom: 14px; }
  .pagehead h1 { font-size: 20px; margin: 0; color: #0e7490; letter-spacing: -0.2px; }
  .chips { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-block; font-size: 11px; color: #334155;
    background: #f1f5f9; border-radius: 999px; padding: 3px 11px;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.partcol { width: 150px; }
  th {
    background: #ecfeff; color: #0e7490; font-weight: 700; font-size: 11.5px;
    padding: 7px 9px; text-align: left; border: 1px solid #cffafe;
  }
  th.wk { text-align: center; }
  td {
    padding: 6px 9px; border: 1px solid #eef2f6; vertical-align: top;
    font-size: 11px; word-wrap: break-word; overflow-wrap: break-word;
  }
  td.part { font-weight: 600; color: #0f172a; background: #fbfdfe; }
  .dur { color: #94a3b8; font-weight: 500; font-size: 9.5px; display: block; margin-top: 1px; }
  .sect {
    font-weight: 700; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.4px; padding: 5px 9px; border: 1px solid #e0f2fe;
  }
  .nm { color: #0f172a; }
  .role { color: #94a3b8; font-size: 9.5px; }
  .theme { color: #64748b; font-size: 9.5px; display: block; margin-top: 1px; }
  .empty { color: #cbd5e1; }
  .foot {
    margin-top: 16px; padding-top: 8px; border-top: 1px solid #eef2f6;
    font-size: 9.5px; color: #94a3b8; display: flex; justify-content: space-between;
  }
  @page { size: A4 portrait; margin: 12mm; }
</style></head>
<body>
  <section class="page">
    <header class="pagehead">
      <h1>${esc(L.title)}</h1>
      <div class="chips">${metaChips}</div>
    </header>
    <table>
      <colgroup><col class="partcol"/>${weekCols
        .map(() => '<col/>')
        .join('')}${Array.from({ length: 5 - weekCols.length })
    .map(() => '<col/>')
    .join('')}</colgroup>
      <thead><tr><th>${esc(
        L.partColumn,
      )}</th>${weekHeaders}${padCols}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="foot"><span>mycongregation.org</span><span>${esc(
      new Date().toLocaleDateString(locale),
    )}</span></div>
  </section>
</body></html>`;
}
