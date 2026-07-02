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
          const badge = r.isGeneral
            ? ` <span class="badge">${esc(L.general)}</span>`
            : '';
          const topic = r.topic
            ? `<div class="topic">${esc(r.topic)}</div>`
            : '';
          return `<tr>
<td class="date">${esc(r.dayLabel)} ${r.dateISO.slice(8, 10)}.${r.dateISO.slice(5, 7)}${badge}</td>
<td>${esc(r.time)}</td>
<td>${esc(r.address)}${topic}</td>
<td class="cond">${esc(r.conductorName ?? '—')}</td>
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
<tr><th style="width:96px">${esc(L.date)}</th><th style="width:52px">${esc(L.time)}</th><th>${esc(L.address)}</th><th style="width:140px">${esc(L.conductor)}</th></tr>
${rows}
</table>
</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(L.title)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; padding: 24px; }
  .congr { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: #64748b; }
  h1 { font-size: 20px; margin: 4px 0 2px; }
  .range { font-size: 13px; color: #475569; margin-bottom: 12px; }
  .rule { height: 3px; background: #0e7490; border-radius: 2px; margin-bottom: 18px; }
  .month { margin-bottom: 22px; page-break-inside: avoid; }
  .mtitle { font-size: 15px; font-weight: 700; color: #0e7490; margin: 0 0 2px; }
  .mtheme { font-size: 12px; color: #475569; font-style: italic; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #94a3b8; padding: 4px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600; }
  td { font-size: 12.5px; padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .date { white-space: nowrap; font-weight: 600; }
  .badge { display: inline-block; font-size: 9px; font-weight: 700; color: #0e7490; border: 1px solid #0e7490; border-radius: 99px; padding: 0 7px; margin-left: 5px; vertical-align: 1px; }
  .cond { font-weight: 600; }
  .topic { color: #475569; font-size: 11px; margin-top: 1px; }
  .foot { margin-top: 24px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
  @page { margin: 16mm; }
</style></head>
<body onload="setTimeout(function(){window.print();},250);">
${congregationName ? `<div class="congr">${esc(congregationName)}</div>` : ''}
<h1>${esc(L.title)}</h1>
<div class="range">${esc(rangeLabel)}</div>
<div class="rule"></div>
${monthBlocks}
<div class="foot"><span>mycongregation.org</span><span>${esc(L.generated)} ${esc(generatedDate)}</span></div>
</body></html>`;
}
