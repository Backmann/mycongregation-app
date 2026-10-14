import { splitTopic } from './field-topic';

/**
 * The printed sheet of field-service meetings (variant A, 14 October 2026).
 *
 * What the sheet of before got wrong, seen on a printed copy:
 *  - the columns moved from month to month (a badge widened the date column
 *    of one month only), so the tables did not stand under each other;
 *  - WHAT the meeting is sat nowhere — the column was «Адрес», and the
 *    address, the group, the notice and the theme all went into it; a meeting
 *    by groups had no name at all, the combined one a violet badge;
 *  - the same hall's address on every line;
 *  - three meetings of one Saturday repeated the date three times;
 *  - on a visit the «Ведущий» column named the service overseer;
 *  - the video length ran into the theme and broke mid-line;
 *  - a month could not continue on the next page, so half a page stood empty;
 *  - the notice and the cancellation differed by colour alone — the same grey
 *    on a black-and-white printer;
 *  - the system font of whichever computer printed it.
 *
 * Now: one set of columns for every month — Date | Time | Meeting | Leads;
 * the usual place said once at the top, a row names its place only when it
 * differs; the meeting's name first, then «!» the notice, then the theme with
 * its length quietly at the end; a date once per day; a visit marked by a
 * rule at the left and in words; «✕» and the reason for a cancelled one; a
 * month runs on across pages, a row never splits; the app's own faces when
 * the browser has them.
 */

export interface FsPdfMeetingRow {
  dateISO: string;
  dayLabel: string; // localized short weekday, e.g. "сб"
  time: string;
  /** What the meeting is: «Общая встреча», «Группа Верне», «Встреча по группам»… */
  kind: string;
  address: string;
  topic: string | null;
  /** What is different this time. */
  notice?: string | null;
  /** Called off: «Отменена: …». */
  cancelledLine?: string | null;
  conductorName: string | null;
  /** The service overseer is visiting this group's meeting. */
  isOverseerVisit: boolean;
  overseerName: string | null;
  assistantName: string | null;
  /** An outing planned inside a circuit-overseer visit; it names no conductor. */
  fromCoVisit?: boolean;
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
  meeting: string;
  conductor: string;
  overseer: string;
  assistant: string;
  /** «Где не указано иначе —». */
  usualPlace: string;
  /** «Место». */
  place: string;
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

const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);

/**
 * The place most rows share — said once at the top. Only when it is really
 * the usual one: at least two meetings and two in five.
 */
export function usualPlace(months: FsPdfMonth[]): string | null {
  const counts = new Map<string, number>();
  let total = 0;
  for (const mo of months)
    for (const r of mo.rows) {
      if (r.fromCoVisit || !r.address.trim()) continue;
      total += 1;
      counts.set(r.address.trim(), (counts.get(r.address.trim()) ?? 0) + 1);
    }
  let best: string | null = null;
  let n = 0;
  for (const [a, c] of counts) if (c > n) [best, n] = [a, c];
  return best && n >= 2 && n * 5 >= total * 2 ? best : null;
}

export function buildFieldServicePdfHtml(opts: {
  congregationName: string | null;
  rangeLabel: string;
  generatedDate: string;
  months: FsPdfMonth[];
  labels: FsPdfLabels;
  /** @font-face rules of the app's faces (lib/print-fonts); empty → system font. */
  fontFaces?: string;
}): string {
  const { congregationName, rangeLabel, generatedDate, months, labels: L, fontFaces = '' } = opts;
  const usual = usualPlace(months);

  const monthBlocks = months
    .map((mo) => {
      let prevDate = '';
      const rows = mo.rows
        .map((r) => {
          const sameDay = r.dateISO === prevDate;
          prevDate = r.dateISO;
          const off = !!r.cancelledLine;
          const { text: theme, length } = splitTopic(r.topic);
          const place = r.address.trim() && r.address.trim() !== usual ? r.address.trim() : '';
          const bits = [
            `<div class="kind">${esc(r.kind)}</div>`,
            off ? `<div class="off">✕ ${esc(r.cancelledLine)}</div>` : '',
            !off && r.notice?.trim() ? `<div class="notice">! ${esc(r.notice.trim())}</div>` : '',
            place ? `<div class="place">${esc(L.place)}: ${esc(place)}</div>` : '',
            !off && theme
              ? `<div class="topic">${esc(theme)}${length ? ` <span class="len">· ${esc(length)}</span>` : ''}</div>`
              : '',
          ].join('');
          // Leads: the conductor; on a visit the overseer and his assistant
          // under him, when they are not the conductor himself.
          const helpers = r.isOverseerVisit
            ? [
                r.overseerName && r.overseerName !== r.conductorName ? `${L.overseer} ${r.overseerName}` : '',
                r.assistantName && r.assistantName !== r.conductorName ? `${L.assistant} ${r.assistantName}` : '',
              ].filter(Boolean)
            : [];
          const who = r.fromCoVisit
            ? ''
            : `${esc(r.conductorName ?? '—')}${helpers.map((h) => `<div class="with">${esc(h)}</div>`).join('')}`;
          const cls = [
            sameDay ? 'same' : '',
            r.isOverseerVisit || r.fromCoVisit ? 'visit' : '',
            off ? 'offrow' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<tr${cls ? ` class="${cls}"` : ''}>
<td class="date">${sameDay ? '' : `${esc(r.dayLabel)} ${r.dateISO.slice(8, 10)}.${r.dateISO.slice(5, 7)}`}</td>
<td class="time">${esc(r.time)}</td>
<td>${bits}</td>
<td class="who">${who}</td>
</tr>`;
        })
        .join('\n');
      const theme = mo.theme ? `<p class="mtheme">${esc(L.monthTheme)}: ${esc(mo.theme)}</p>` : '';
      return `<section class="month">
<h2>${esc(cap(mo.title))}</h2>
${theme}
<table>
<colgroup><col class="c-date"><col class="c-time"><col><col class="c-who"></colgroup>
<thead><tr><th>${esc(L.date)}</th><th>${esc(L.time)}</th><th>${esc(L.meeting)}</th><th>${esc(L.conductor)}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(L.title)}</title>
<style>
${fontFaces}
  /* Print, not screen: sizes in pt, hairline rules; colour only where it
     carries meaning, and never ALONE — «!» and «✕» say it in black and white
     too. The weight is the face (Manrope_700Bold), never font-weight beside
     it: a browser would fake a bolder bold over the bold file. */
  * { box-sizing: border-box; }
  body {
    font-family: 'Manrope_400Regular', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #0f172a;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;
    border-bottom: 2px solid #0e7490; padding-bottom: 8px; margin-bottom: 14px; }
  .congr { font-size: 8pt; letter-spacing: 1.4px; text-transform: uppercase; color: #64748b; }
  h1 { font-family: 'Manrope_800ExtraBold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal;
    font-size: 17pt; margin: 2px 0 0; }
  .range { font-size: 10pt; color: #475569; }
  .usual { font-size: 8.5pt; color: #475569; text-align: right; line-height: 1.4; }
  .usual b { font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; color: #0f172a; }

  .month { margin-bottom: 14px; }
  h2 { font-family: 'Manrope_800ExtraBold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal;
    font-size: 12pt; color: #0e7490; margin: 0 0 2px; break-after: avoid; page-break-after: avoid; }
  .mtheme { font-size: 9pt; color: #475569; margin: 0 0 4px; }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.c-date { width: 15%; }
  col.c-time { width: 8%; }
  col.c-who { width: 24%; }
  thead { display: table-header-group; }  /* the head again on every page */
  th { text-align: left; font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal;
    font-size: 7pt; letter-spacing: 0.8px; text-transform: uppercase; color: #64748b;
    padding: 3px 6px; border-bottom: 1.2px solid #94a3b8; }
  td { font-size: 9.5pt; padding: 6px 6px; border-top: 1px solid #e2e8f0; vertical-align: top; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  tr.same td { border-top-color: #f1f5f9; }
  .date, .kind, .who { font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; }
  .date { white-space: nowrap; }
  .time { white-space: nowrap; font-variant-numeric: tabular-nums; color: #334155; }
  .kind { font-size: 10pt; }
  .notice { display: inline-block; margin-top: 2px; padding: 1px 6px; border: 1px solid #d97706; border-radius: 4px;
    background: #fffbeb; color: #78350f; font-size: 9pt;
    font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; }
  .off { margin-top: 2px; color: #991b1b; font-size: 9pt;
    font-family: 'Manrope_800ExtraBold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; }
  .offrow .kind, .offrow .time, .offrow .who { text-decoration: line-through; color: #94a3b8; }
  .place { margin-top: 2px; font-size: 8.5pt; color: #0f172a; }
  .topic { margin-top: 2px; font-size: 8.5pt; line-height: 1.35; color: #334155; }
  .len { color: #94a3b8; white-space: nowrap; }
  .with { font-family: 'Manrope_400Regular', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 8.5pt; color: #475569; margin-top: 1px; }
  /* The visit is what a reader looks for: a rule at the left, kept in print
     (a border, not a shadow — some print engines drop shadows). */
  .visit td { background: #f6fdff; }
  .visit td:first-child { border-left: 3px solid #0e7490; padding-left: 4px; }

  .foot { margin-top: 16px; padding-top: 6px; border-top: 1px solid #e2e8f0;
    font-size: 7.5pt; color: #64748b; display: flex; justify-content: space-between; }
  @page { size: A4 portrait; margin: 14mm; }
</style></head>
<body>
<header>
<div>
${congregationName ? `<div class="congr">${esc(congregationName)}</div>` : ''}
<h1>${esc(L.title)}</h1>
<div class="range">${esc(cap(rangeLabel))}</div>
</div>
${usual ? `<div class="usual">${esc(L.usualPlace)}<br><b>${esc(usual)}</b></div>` : ''}
</header>
${monthBlocks}
<div class="foot"><span>mycongregation.org</span><span>${esc(L.generated)} ${esc(generatedDate)}</span></div>
</body></html>`;
}
