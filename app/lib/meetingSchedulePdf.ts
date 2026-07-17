import type { EventType } from './api';

/**
 * Monthly meeting-schedule PDF for the congregation notice board. Each week is a
 * horizontal block (its meeting date as the header) whose parts are laid out in
 * two columns; four or five such blocks stack down one A4 page. Every part shows
 * its name, the assigned publisher and — inline, to save height — the theme with
 * any publication reference stripped. No phone numbers or private data.
 */

export interface MeetingPdfWeek {
  weekStartDate: string; // YYYY-MM-DD (Monday)
  meetingDateLabel: string; // e.g. "1 июля"
}

/** One programme part, in canonical order. */
export interface MeetingPdfPart {
  partKey: string;
  label: string; // localized part label
}

export interface MeetingPdfLabels {
  title: string; // "Встреча в будний день"
  subtitleDow: string; // "Среда"
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
 * Build the monthly meeting-schedule HTML: week blocks, two columns each.
 */
export function buildMeetingSchedulePdfHtml(opts: {
  eventType: EventType;
  weeks: MeetingPdfWeek[];
  /** Programme parts in display order (already localized). */
  parts: MeetingPdfPart[];
  /** assignments[weekStartDate][partKey] -> cell data. */
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
    parts,
    cellFor,
    congregationName,
    hallAddress,
    monthLabel,
    timeLabel,
    locale,
    labels: L,
  } = opts;

  const personHtml = (weekStart: string, part: MeetingPdfPart): string => {
    const data = cellFor(weekStart, part.partKey);
    if (!data || (!data.name && !data.assistant)) {
      return `<span class="empty">${esc(L.emptyCell)}</span>`;
    }
    if (data.name && data.assistant) {
      return `${esc(data.name)} <span class="role">${esc(
        L.conductorShort,
      )}</span> / ${esc(data.assistant)} <span class="role">${esc(
        L.readerShort,
      )}</span>`;
    }
    return esc(data.name ?? data.assistant);
  };

  // A week block: two columns of parts.
  const weekBlock = (w: MeetingPdfWeek): string => {
    const mid = Math.ceil(parts.length / 2);
    const left = parts.slice(0, mid);
    const right = parts.slice(mid);
    const rowCount = Math.max(left.length, right.length);
    const rows: string[] = [];
    for (let r = 0; r < rowCount; r++) {
      const cellFor2 = (p: MeetingPdfPart | undefined): string => {
        if (!p) return '<td></td><td></td>';
        return `<td class="p">${esc(p.label)}</td><td class="v">${personHtml(
          w.weekStartDate,
          p,
        )}</td>`;
      };
      rows.push(`<tr>${cellFor2(left[r])}${cellFor2(right[r])}</tr>`);
    }
    return `<div class="wk">
  <div class="wkh">${esc(w.meetingDateLabel)}</div>
  <table><colgroup><col class="pc"/><col class="vc"/><col class="pc"/><col class="vc"/></colgroup>${rows.join(
    '',
  )}</table>
</div>`;
  };

  const metaChips = [
    `<span class="chip">${esc(L.subtitleDow)}</span>`,
    timeLabel ? `<span class="chip">${esc(timeLabel)}</span>` : '',
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
  .page { padding: 14px 18px 16px; }
  .pagehead { border-bottom: 3px solid #0e7490; padding-bottom: 7px; margin-bottom: 9px; }
  .pagehead h1 { font-size: 17px; margin: 0; color: #0e7490; letter-spacing: -0.2px; }
  .chips { margin-top: 7px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-block; font-size: 10.5px; color: #334155;
    background: #f1f5f9; border-radius: 999px; padding: 3px 10px;
  }
  .wk {
    margin-bottom: 7px; border: 1px solid #e2e8f0; border-radius: 8px;
    overflow: hidden; page-break-inside: avoid;
  }
  .wkh {
    background: #ecfeff; color: #0e7490; font-weight: 700; font-size: 12.5px;
    padding: 5px 12px; border-bottom: 1px solid #cffafe;
  }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.pc { width: 20%; }
  col.vc { width: 30%; }
  td {
    padding: 3px 11px; font-size: 10px; vertical-align: top;
    border-bottom: 1px solid #f6f8fa; word-wrap: break-word; overflow-wrap: break-word;
  }
  td.p { font-weight: 600; color: #475569; }
  td.v { color: #0f172a; }
  .role { color: #94a3b8; font-size: 9px; }
  .empty { color: #cbd5e1; }
  .foot {
    margin-top: 8px; padding-top: 6px; border-top: 1px solid #eef2f6;
    font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between;
  }
  @page { size: A4 portrait; margin: 10mm; }
</style></head>
<body>
  <section class="page">
    <header class="pagehead">
      <h1>${esc(L.title)} · ${esc(monthLabel)}</h1>
      <div class="chips">${metaChips}</div>
    </header>
    ${weeks.map(weekBlock).join('\n')}
    <div class="foot"><span>mycongregation.org</span><span>${esc(
      new Date().toLocaleDateString(locale),
    )}</span></div>
  </section>
</body></html>`;
}
