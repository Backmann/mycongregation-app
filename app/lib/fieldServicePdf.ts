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
 *  - the same hall's address on every line, yet no line said WHICH hall;
 *  - three meetings of one Saturday repeated the date three times;
 *  - on a visit the «Ведущий» column named the service overseer;
 *  - the video length ran into the theme and broke mid-line;
 *  - a month could not continue on the next page, so half a page stood empty;
 *  - the notice and the cancellation differed by colour alone — the same grey
 *    on a black-and-white printer;
 *  - the system font of whichever computer printed it.
 *
 * Now: one set of columns for every month — Day | Time | Meeting | Place |
 * Leads; the period said once, in the header (a one-month sheet has no
 * month heading under it); the place on every line, the hall by its name
 * over its address (Lionel, 14 October 2026: «где не указано иначе» was not
 * understood, and a line without its address looked unfinished); the day as
 * a large number with its weekday; the meeting's name first, a visit tagged
 * under it, then «!» the notice, then the theme with its length quietly at
 * the end; «✕» and the reason for a cancelled one; a month runs on across
 * pages, a row never splits; the app's own faces when the browser has them.
 */

export interface FsPdfMeetingRow {
  dateISO: string;
  dayLabel: string; // localized short weekday, e.g. "сб"
  time: string;
  /** What the meeting is: «Общая встреча», «Группа Верне», «Встреча по группам»… */
  kind: string;
  address: string;
  /** The hall the address is, when it is one: «Зал Царства Ahlen». */
  placeName?: string | null;
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
  /** «Ноябрь» — the year only where the sheet spans two (the header says it once). */
  title: string;
  theme: string | null;
  rows: FsPdfMeetingRow[];
}

export interface FsPdfLabels {
  title: string;
  date: string;
  time: string;
  meeting: string;
  /** «Место» — the column. */
  where: string;
  conductor: string;
  /** «посещение служебного старейшины», under the group's name. */
  visit: string;
  overseer: string;
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

/** «Musterstraße 1, 59065 Hamm» as two lines — the street, then the town. */
function addressLines(address: string): string {
  const i = address.indexOf(', ');
  return i > 0 ? `${esc(address.slice(0, i))}<br>${esc(address.slice(i + 2))}` : esc(address);
}

const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);

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
  // One month: the header names it, and the month needs no heading of its
  // own (14 October 2026: «Ноябрь 2026 г.» stood twice, one under the other).
  const oneMonth = months.length === 1;

  const monthBlocks = months
    .map((mo) => {
      let prevDate = '';
      const rows = mo.rows
        .map((r) => {
          const sameDay = r.dateISO === prevDate;
          prevDate = r.dateISO;
          const off = !!r.cancelledLine;
          const { text: theme, length } = splitTopic(r.topic);
          const bits = [
            `<div class="kind">${esc(r.kind)}</div>`,
            r.isOverseerVisit ? `<div class="tag">${esc(L.visit)}</div>` : '',
            off ? `<div class="off">✕ ${esc(r.cancelledLine)}</div>` : '',
            !off && r.notice?.trim() ? `<div class="notice">! ${esc(r.notice.trim())}</div>` : '',
            !off && theme
              ? `<div class="topic">${esc(theme)}${length ? ` <span class="len">· ${esc(length)}</span>` : ''}</div>`
              : '',
          ].join('');
          // Leads: the conductor; on a visit the overseer and his assistant
          // under him, when they are not the conductor himself.
          // The overseer who conducts his own visit is named once, with his role.
          const helpers = r.isOverseerVisit
            ? [
                r.overseerName
                  ? r.overseerName === r.conductorName
                    ? L.overseer
                    : `${L.overseer} ${r.overseerName}`
                  : '',
                r.assistantName && r.assistantName !== r.conductorName ? `${L.assistant} ${r.assistantName}` : '',
              ].filter(Boolean)
            : [];
          // The place on EVERY line (Lionel, 14 October 2026: «он везде должен
          // быть»): the hall's name, when it is a hall, over its address.
          const where = r.address.trim()
            ? `${r.placeName ? `<div class="hall">${esc(r.placeName)}</div>` : ''}<div class="addr">${addressLines(r.address.trim())}</div>`
            : '';
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
<td class="date">${sameDay ? '' : `<span class="dnum">${Number(r.dateISO.slice(8, 10))}</span><span class="dow">${esc(r.dayLabel)}</span>`}</td>
<td class="time">${esc(r.time)}</td>
<td>${bits}</td>
<td class="where">${where}</td>
<td class="who">${who}</td>
</tr>`;
        })
        .join('\n');
      const theme = mo.theme ? `<p class="mtheme">${esc(L.monthTheme)}: ${esc(mo.theme)}</p>` : '';
      return `<section class="month">
${oneMonth ? '' : `<h2>${esc(cap(mo.title))}</h2>`}
${theme}
<table>
<colgroup><col class="c-date"><col class="c-time"><col><col class="c-where"><col class="c-who"></colgroup>
<thead><tr><th>${esc(L.date)}</th><th>${esc(L.time)}</th><th>${esc(L.meeting)}</th><th>${esc(L.where)}</th><th>${esc(L.conductor)}</th></tr></thead>
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
  body { font-family: 'Manrope_400Regular', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* The header: the congregation, the sheet, the period — said once. */
  header { display: flex; align-items: stretch; gap: 14px; margin-bottom: 14px; }
  .bar { width: 5px; border-radius: 3px; background: #15803d; }
  .head { flex: 1; }
  .congr { font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-size: 8pt; letter-spacing: 1.6px; text-transform: uppercase; color: #64748b; }
  h1 { font-family: 'Manrope_800ExtraBold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-size: 19pt; line-height: 1.15; margin: 2px 0 0; }
  .range { font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-size: 12pt; color: #15803d; margin-top: 1px; }

  .month { margin-bottom: 16px; }
  h2 { font-family: 'Manrope_800ExtraBold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-size: 12.5pt; color: #0f172a; margin: 0 0 4px;
    padding-bottom: 3px; border-bottom: 2px solid #15803d; break-after: avoid; page-break-after: avoid; }
  .mtheme { font-size: 9pt; color: #475569; margin: 0 0 4px; }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.c-date { width: 9%; }
  col.c-time { width: 8%; }
  col.c-where { width: 22%; }
  col.c-who { width: 21%; }
  thead { display: table-header-group; }  /* the head again on every page */
  th { text-align: left; font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-size: 6.8pt; letter-spacing: 0.9px;
    text-transform: uppercase; color: #64748b; padding: 4px 6px; border-bottom: 1.2px solid #94a3b8; }
  td { font-size: 9.5pt; padding: 7px 6px; border-top: 1px solid #e2e8f0; vertical-align: top; }
  tbody tr:first-child td { border-top: 0; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  tr.same td { border-top: 1px dotted #e2e8f0; }
  /* The day: its number large, the weekday small under it. */
  .dnum { display: block; font-family: 'Manrope_800ExtraBold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-size: 14pt; line-height: 1; }
  .dow { display: block; font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-size: 7pt; letter-spacing: 0.6px;
    text-transform: uppercase; color: #64748b; margin-top: 2px; }
  .time { white-space: nowrap; font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-variant-numeric: tabular-nums; color: #0f172a; }
  .kind, .who, .hall { font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; }
  .kind { font-size: 10pt; }
  .tag { display: inline-block; margin-top: 2px; padding: 0 6px; border-radius: 3px; border: 1px solid #0e7490;
    color: #0e7490; font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-size: 7.5pt; }
  .notice { display: inline-block; margin-top: 3px; padding: 1px 6px; border: 1px solid #d97706; border-radius: 4px;
    background: #fffbeb; color: #78350f; font-family: 'Manrope_700Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-size: 8.8pt; }
  .off { margin-top: 2px; color: #991b1b; font-size: 9pt; font-family: 'Manrope_800ExtraBold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; }
  .offrow .kind, .offrow .time, .offrow .who, .offrow .where div { text-decoration: line-through; color: #94a3b8; }
  .topic { margin-top: 3px; font-size: 8.6pt; line-height: 1.35; color: #334155; }
  .len { color: #94a3b8; white-space: nowrap; }
  .where { font-size: 8.6pt; line-height: 1.3; }
  .hall { font-size: 9pt; color: #0f172a; }
  .addr { color: #475569; }
  .with { font-family: 'Manrope_500Medium', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: normal; font-size: 8.4pt; color: #475569; margin-top: 1px; }
  /* The visit is what a reader looks for: a rule at the left, kept in print
     (a border, not a shadow — some print engines drop shadows). */
  .visit td { background: #f6fdff; }
  .visit td:first-child { border-left: 3px solid #0e7490; padding-left: 4px; }

  .foot { margin-top: 18px; padding-top: 6px; border-top: 1px solid #e2e8f0;
    font-size: 7.5pt; color: #64748b; display: flex; justify-content: space-between; }
  @page { size: A4 portrait; margin: 14mm; }
</style></head>
<body>
<header>
<div class="bar"></div>
<div class="head">
${congregationName ? `<div class="congr">${esc(congregationName)}</div>` : ''}
<h1>${esc(L.title)}</h1>
<div class="range">${esc(cap(rangeLabel))}</div>
</div>
</header>
${monthBlocks}
<div class="foot"><span>mycongregation.org</span><span>${esc(L.generated)} ${esc(generatedDate)}</span></div>
</body></html>`;
}
