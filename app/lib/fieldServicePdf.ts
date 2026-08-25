/**
 * Printable field-service meeting schedule (per the approved mockup):
 * congregation header, then per month — the month theme in italics and a
 * table of meetings: date (with a "general" badge), time, exact address
 * (meeting topic in small print under it), conductor. Web-only, same
 * open-window + print flow as the CO-schedule export.
 */

export interface FsPdfMeetingRow {
  dateISO: string;
  dayLabel: string; // localized short weekday, e.g. "сб"
  time: string;
  address: string;
  topic: string | null;
  conductorName: string | null;
  isGeneral: boolean;
  /** The group this meeting belongs to; null when it belongs to no one group. */
  groupName: string | null;
  /** The service overseer is visiting this group's meeting. */
  isOverseerVisit: boolean;
  /** Who is visiting, and who comes with him. */
  overseerName: string | null;
  assistantName: string | null;
}

export interface FsPdfMonth {
  title: string; // "Июль 2026"
  theme: string | null;
  rows: FsPdfMeetingRow[];
}

export interface FsPdfLabels {
  title: string;
  date: string;
  time: string;
  address: string;
  conductor: string;
  general: string;
  overseerVisit: string;
  groupVisit: string;
  assistant: string;
  monthTheme: string;
  generated: string;
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildFieldServicePdfHtml(opts: {
  congregationName: string | null;
  rangeLabel: string;
  generatedDate: string;
  months: FsPdfMonth[];
  labels: FsPdfLabels;
}): string {
  const { congregationName, rangeLabel, generatedDate, months, labels: L } = opts;

  const monthBlocks = months
    .map((mo) => {
      const rows = mo.rows
        .map((r) => {
          const badges = [
            r.isGeneral
              ? `<span class="badge general">${esc(L.general)}</span>`
              : '',
            r.isOverseerVisit
              ? `<span class="badge visit">${esc(L.overseerVisit)}</span>`
              : '',
          ]
            .filter(Boolean)
            .join(' ');
          // A group visit carries no lesson, so the topic column stood empty
          // and the row read as an ordinary meeting nobody had filled in. It
          // says what is actually happening instead: the overseer is visiting
          // this group.
          const what = r.isOverseerVisit
            ? `<div class="visitline">${esc(
                r.groupName
                  ? `${L.groupVisit} ${r.groupName}`
                  : L.overseerVisit,
              )}</div>`
            : r.topic
              ? `<div class="topic">${esc(r.topic)}</div>`
              : '';
          // The group belongs on every row that has one, not only on a visit:
          // the screen shows it and the printed sheet did not.
          const group =
            r.groupName && !r.isOverseerVisit
              ? `<div class="group">${esc(r.groupName)}</div>`
              : '';
          const assistant = r.assistantName
            ? `<div class="assist">${esc(L.assistant)}: ${esc(r.assistantName)}</div>`
            : '';
          // On a visit the overseer is the person the group is waiting for;
          // he is named here even when someone else conducts.
          const who = r.isOverseerVisit
            ? (r.overseerName ?? r.conductorName ?? '—')
            : (r.conductorName ?? '—');
          return `<tr${r.isOverseerVisit ? ' class="visitrow"' : ''}>
<td class="date">${esc(r.dayLabel)} ${r.dateISO.slice(8, 10)}.${r.dateISO.slice(5, 7)}${badges ? `<div class="badges">${badges}</div>` : ''}</td>
<td class="time">${esc(r.time)}</td>
<td>${esc(r.address)}${group}${what}</td>
<td class="cond">${esc(who)}${assistant}</td>
</tr>`;
        })
        .join('\n');
      const theme = mo.theme
        ? `<p class="mtheme">${esc(L.monthTheme)}: ${esc(mo.theme)}</p>`
        : '';
      return `<div class="month">
<p class="mtitle">${esc(mo.title)}</p>
${theme}
<table>
<thead><tr><th style="width:74px">${esc(L.date)}</th><th style="width:46px">${esc(L.time)}</th><th>${esc(L.address)}</th><th style="width:150px">${esc(L.conductor)}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(L.title)}</title>
<style>
  /* Print, not screen: sizes in pt, hairline rules, and colour used only
     where it carries meaning — the month, the two badges, the visit row. */
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #0f172a;
    padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header { border-bottom: 2px solid #0e7490; padding-bottom: 10px; margin-bottom: 18px; }
  .congr { font-size: 8.5pt; letter-spacing: 1.6px; text-transform: uppercase; color: #64748b; }
  h1 { font-size: 17pt; margin: 3px 0 1px; font-weight: 700; letter-spacing: -0.2px; }
  .range { font-size: 10pt; color: #475569; }

  .month { margin-bottom: 20px; page-break-inside: avoid; }
  .mtitle { font-size: 12pt; font-weight: 700; color: #0e7490; margin: 0 0 1px; }
  .mtheme { font-size: 9.5pt; color: #475569; font-style: italic; margin: 0 0 7px; }

  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }  /* repeat the head on every page */
  th {
    text-align: left; font-size: 7.5pt; text-transform: uppercase;
    letter-spacing: 0.7px; color: #94a3b8; font-weight: 700;
    padding: 3px 8px; border-bottom: 1.5px solid #cbd5e1;
  }
  td { font-size: 9.5pt; padding: 7px 8px; border-bottom: 1px solid #eef2f6; vertical-align: top; }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #fbfcfd; }

  .date { white-space: nowrap; font-weight: 700; }
  .time { white-space: nowrap; font-variant-numeric: tabular-nums; color: #334155; }
  .cond { font-weight: 600; }
  .group { color: #0f172a; font-size: 9pt; font-weight: 600; margin-top: 2px; }
  .topic { color: #475569; font-size: 8.5pt; margin-top: 2px; line-height: 1.35; }
  .assist { color: #64748b; font-size: 8.5pt; font-weight: 400; margin-top: 2px; }

  .badges { margin-top: 3px; }
  .badge {
    display: inline-block; font-size: 7pt; font-weight: 700;
    border-radius: 99px; padding: 1px 7px; letter-spacing: 0.3px;
  }
  .badge.general { color: #6d28d9; background: #f3e8ff; }
  .badge.visit { color: #0e7490; background: #cffafe; }

  /* The visit is the row a reader is looking for; a left edge finds it
     without hunting through the dates. */
  .visitrow td { background: #f6fdff !important; }
  /* A LEFT BORDER, not an inset box-shadow: shadows are dropped by some
     print engines, and this mark is the one thing that finds the visit at a
     glance. Verified rendered, not assumed. */
  .visitrow td:first-child { border-left: 3px solid #0e7490; padding-left: 5px; }
  .visitline { color: #0e7490; font-size: 9pt; font-weight: 600; margin-top: 2px; }

  .foot {
    margin-top: 22px; padding-top: 8px; border-top: 1px solid #e2e8f0;
    font-size: 7.5pt; color: #94a3b8; display: flex; justify-content: space-between;
  }
  @page { size: A4 portrait; margin: 15mm; }
</style></head>
<body>
<header>
${congregationName ? `<div class="congr">${esc(congregationName)}</div>` : ''}
<h1>${esc(L.title)}</h1>
<div class="range">${esc(rangeLabel)}</div>
</header>
${monthBlocks}
<div class="foot"><span>mycongregation.org</span><span>${esc(L.generated)} ${esc(generatedDate)}</span></div>
</body></html>`;
}
