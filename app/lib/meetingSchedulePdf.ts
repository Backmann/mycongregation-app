import type { EventType } from './api';

/**
 * Monthly meeting-schedule PDF for the congregation notice board. Each week is a
 * card (its meeting date as the header). Inside, parts are grouped by section
 * (Treasures / Apply Yourself / Christian Life) with the section's accent color;
 * each row shows the real part name (from the workbook title) and the assigned
 * publisher in bold. No phone numbers, no reference codes.
 */

export interface MeetingPdfWeek {
  weekStartDate: string; // YYYY-MM-DD (Monday)
  meetingDateLabel: string; // e.g. "8 июля"
  /** Optional centered note in the header (e.g. circuit-overseer visit). */
  headerNote?: string | null;
  /** If set, this week is replaced by a special event (e.g. a convention). */
  event?: {
    typeLabel: string; // "Региональный конгресс"
    title: string | null; // theme
    place: string | null; // address
    dateLabel: string | null; // date range
  } | null;
}

/** A section (colored group of parts), e.g. Treasures / Apply Yourself. */
export interface MeetingPdfSection {
  key: string;
  color: string; // accent (text)
  colorMuted: string; // soft background
  /** Part keys belonging to this section, in display order. */
  partKeys: string[];
}

export interface MeetingPdfLabels {
  title: string;
  subtitleDow: string;
  emptyCell: string;
}

/** Resolved cell for one (week, part): real part name + assignee(s). */
export interface MeetingCell {
  /** Real part name from the workbook (falls back to a generic label). */
  partName: string;
  name: string | null;
  assistant: string | null;
  /** Start time of the part ("19:05"), shown before the name. Midweek only. */
  time?: string | null;
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildMeetingSchedulePdfHtml(opts: {
  eventType: EventType;
  weeks: MeetingPdfWeek[];
  /** Sections in display order, each listing its part keys. */
  sections: MeetingPdfSection[];
  /** Resolve a cell (real name + assignees) for a week + part. */
  cellFor: (weekStartDate: string, partKey: string) => MeetingCell | null;
  congregationName?: string | null;
  hallAddress?: string | null;
  monthLabel: string;
  timeLabel?: string | null;
  locale: string;
  /**
   * Tighten rows and spacing so a heavy month (five weeks of long workbook
   * titles, with part times) still fits on a single A4 sheet.
   */
  compact?: boolean;
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
    compact = false,
    labels: L,
  } = opts;

  // One row: part name (left) + assignees in bold (right). Colored per section.
  const partRow = (
    weekStart: string,
    partKey: string,
    color: string,
    muted: string,
  ): string | null => {
    const cell = cellFor(weekStart, partKey);
    if (!cell) return null;
    const who =
      cell.name && cell.assistant
        ? `<b>${esc(cell.name)}</b> / <b>${esc(cell.assistant)}</b>`
        : cell.name
          ? `<b>${esc(cell.name)}</b>`
          : `<span class="empty">${esc(L.emptyCell)}</span>`;
    return `<tr>
<td class="pn" style="border-left:3px solid ${color};background:${muted}">${
      cell.time ? `<span class="pt">${esc(cell.time)}</span>` : ''
    }${esc(cell.partName)}</td>
<td class="who">${who}</td>
</tr>`;
  };

  // A week card: either a special-event banner or two columns of parts.
  const weekBlock = (w: MeetingPdfWeek): string => {
    if (w.event) {
      const ev = w.event;
      const lines = [
        ev.title ? `<div class="ev-title">${esc(ev.title)}</div>` : '',
        ev.place ? `<div class="ev-line">${esc(ev.place)}</div>` : '',
        ev.dateLabel ? `<div class="ev-line">${esc(ev.dateLabel)}</div>` : '',
      ]
        .filter(Boolean)
        .join('');
      return `<div class="wk">
  <div class="wkh wkh-ev">${esc(ev.typeLabel)}</div>
  <div class="ev">
    ${lines}
  </div>
</div>`;
    }
    const allRows: string[] = [];
    for (const section of sections) {
      for (const pk of section.partKeys) {
        const row = partRow(
          w.weekStartDate,
          pk,
          section.color,
          section.colorMuted,
        );
        if (row) allRows.push(row);
      }
    }
    // Split rows across two columns for compactness.
    const mid = Math.ceil(allRows.length / 2);
    const left = allRows.slice(0, mid).join('');
    const right = allRows.slice(mid).join('');
    const header = w.headerNote
      ? `<div class="wkh wkh-note"><span class="wkh-date">${esc(
          w.meetingDateLabel,
        )}</span><span class="wkh-mid">${esc(
          w.headerNote,
        )}</span><span class="wkh-date"></span></div>`
      : `<div class="wkh">${esc(w.meetingDateLabel)}</div>`;
    return `<div class="wk">
  ${header}
  <div class="cols">
    <table class="col"><colgroup><col class="pc"/><col class="vc"/></colgroup>${left}</table>
    <table class="col"><colgroup><col class="pc"/><col class="vc"/></colgroup>${right}</table>
  </div>
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
  .page { padding: 14px 16px 14px; }
  .pagehead { border-bottom: 3px solid #0e7490; padding-bottom: 7px; margin-bottom: 9px; }
  .pagehead h1 { font-size: 17px; margin: 0; color: #0e7490; letter-spacing: -0.2px; }
  .chips { margin-top: 7px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-block; font-size: 10.5px; color: #334155;
    background: #f1f5f9; border-radius: 999px; padding: 3px 10px;
  }
  .wk {
    margin-bottom: ${compact ? '5px' : '7px'};
    border: 1px solid #e2e8f0; border-radius: 8px;
    overflow: hidden; page-break-inside: avoid;
  }
  .wkh {
    background: #ecfeff; color: #0e7490; font-weight: 700;
    font-size: ${compact ? '11.5px' : '12.5px'};
    padding: ${compact ? '4px 10px' : '5px 12px'};
    border-bottom: 1px solid #cffafe;
  }
  .wkh-note { display: flex; align-items: baseline; }
  .wkh-date { flex: 1; }
  .wkh-mid {
    flex: 0 0 auto; text-align: center; color: #5b21b6;
    font-weight: 700; font-size: 11px;
  }
  .wkh-note .wkh-date:last-child { text-align: right; }
  .cols { display: flex; gap: 0; }
  /* Special-event banner (e.g. regional convention) replacing a week. */
  .wkh-ev { background: #ede9fe; color: #5b21b6; border-bottom-color: #ddd6fe; }
  .ev { padding: 12px 14px; background: #f5f3ff; text-align: center; }
  .ev-title { font-size: 12.5px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  .ev-line { font-size: 11px; color: #334155; margin-top: 2px; }
  table.col { width: 50%; border-collapse: collapse; table-layout: fixed; }
  col.pc { width: 56%; }
  col.vc { width: 44%; }
  td {
    padding: ${compact ? '2px 7px' : '3px 9px'};
    font-size: ${compact ? '9px' : '9.5px'}; vertical-align: top;
    border-bottom: 1px solid #f1f5f9; word-wrap: break-word; overflow-wrap: break-word;
  }
  td.pn { color: #475569; font-weight: 500; }
  .pt {
    color: #0e7490; font-weight: 700; font-size: 9px;
    margin-right: 5px; white-space: nowrap;
  }
  td.who { color: #0f172a; }
  td.who b { font-weight: 700; }
  .empty { color: #cbd5e1; font-weight: 400; }
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
