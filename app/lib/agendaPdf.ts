import type { ElderTask, EldersMeeting } from './api';

/**
 * The agenda of an elders' meeting, laid out to be read aloud from paper.
 *
 * Three sections, and their order is the order a body actually works in: what
 * was put down on purpose, then what has quietly gone past its date, then what
 * will fall due before they next sit down. Nothing here asks anyone to
 * remember anything — that is the whole reason the page exists.
 *
 * An empty section is PRINTED AS EMPTY rather than dropped. A heading with
 * nothing under it says «nothing is overdue», which is worth reading; a
 * heading that vanished says only that something is missing, and the reader
 * cannot tell which.
 */
/** One question, flattened for the sheet — names resolved, nothing to look up. */
export interface AgendaPrintItem {
  title: string;
  presenterName: string | null;
  sourceText: string | null;
  minutes: number;
  outcome: string | null;
  outcomeNote: string | null;
}

export function buildAgendaHtml(opts: {
  meeting: EldersMeeting | null;
  /**
   * The questions brought to the meeting.
   *
   * They print in one of TWO shapes, and the sheet chooses by itself: while
   * nothing has an outcome it is a sheet for the table, with a line to write
   * on under each question; once outcomes exist it is a record of what was
   * decided, and the lines give way to the decisions. Nobody has to pick a
   * mode — the state of the meeting already says which it is.
   */
  items?: AgendaPrintItem[];
  /** Where it is held, in full — the hall's address when the hall is known. */
  place?: string | null;
  minuteTakerName?: string | null;
  openingPrayerName?: string | null;
  closingPrayerName?: string | null;
  onAgenda: ElderTask[];
  overdue: ElderTask[];
  dueSoon: ElderTask[];
  congregationName: string;
  nameOf: (id: string | null) => string | null;
  areaLabel: (area: string) => string;
  formatDate: (iso: string) => string;
  labels: {
    title: string;
    items: string;
    minuteTaker: string;
    openingPrayer: string;
    closingPrayer: string;
    presenter: string;
    outcomes: Record<string, string>;
    onAgenda: string;
    overdue: string;
    dueSoon: string;
    nothing: string;
    due: string;
    printed: string;
  };
  printedOn: string;
}): string {
  const {
    meeting,
    items = [],
    place = null,
    minuteTakerName = null,
    openingPrayerName = null,
    closingPrayerName = null,
    onAgenda,
    overdue,
    dueSoon,
    congregationName,
    nameOf,
    areaLabel,
    formatDate,
    labels,
    printedOn,
  } = opts;

  const esc = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c] as string,
    );

  const item = (task: ElderTask) => {
    const who = nameOf(task.assigneePublisherId);
    const bits = [areaLabel(task.area)];
    if (task.dueDate) bits.push(`${labels.due} ${formatDate(task.dueDate)}`);
    if (who) bits.push(who);
    return `<li>
      <div class="t">${esc(task.title)}</div>
      <div class="m">${esc(bits.join(' · '))}</div>
      ${task.details ? `<div class="d">${esc(task.details)}</div>` : ''}
      <div class="box"></div>
    </li>`;
  };

  /**
   * The questions, numbered, with room to write or with what was decided.
   *
   * `dotted` is the whole difference between a sheet taken TO a meeting and a
   * record kept OF one.
   */
  const itemsSection = (rows: AgendaPrintItem[]): string => {
    if (rows.length === 0) return '';
    const settled = rows.some((r) => r.outcome);
    return `
    <div class="sect">
      <div class="sh">${esc(labels.items)}</div>
      <ol>${rows
        .map((r) => {
          const meta = [
            r.presenterName ? `${esc(labels.presenter)}: ${esc(r.presenterName)}` : '',
            r.sourceText ? esc(r.sourceText) : '',
            r.minutes ? `${r.minutes}′` : '',
          ]
            .filter(Boolean)
            .join(' · ');
          const decided = r.outcome
            ? `<div class="d">${esc(labels.outcomes[r.outcome] ?? r.outcome)}${
                r.outcomeNote ? ` — ${esc(r.outcomeNote)}` : ''
              }</div>`
            : '';
          // Two lines to write on, but only while there is nothing written.
          const room = settled ? '' : '<div class="box"></div><div class="box"></div>';
          return `<li><div class="t">${esc(r.title)}</div>${
            meta ? `<div class="m">${meta}</div>` : ''
          }${decided}${room}</li>`;
        })
        .join('')}</ol>
    </div>`;
  };

  const section = (heading: string, rows: ElderTask[]) => `
    <div class="sect">
      <div class="sh">${esc(heading)}</div>
      ${
        rows.length
          ? `<ol>${rows.map(item).join('')}</ol>`
          : `<div class="none">${esc(labels.nothing)}</div>`
      }
    </div>`;

  const when = meeting
    ? formatDate(meeting.date) + (meeting.startTime ? ` · ${meeting.startTime}` : '')
    : '';

  /**
   * The three facts under the date: where, who keeps the record, who prays.
   *
   * The address is spelled out rather than the hall merely named — a sheet
   * carried by somebody who has not been there should not need a second
   * enquiry.
   */
  const whoWhere = [
    place,
    minuteTakerName ? `${labels.minuteTaker}: ${minuteTakerName}` : '',
    openingPrayerName ? `${labels.openingPrayer}: ${openingPrayerName}` : '',
    closingPrayerName ? `${labels.closingPrayer}: ${closingPrayerName}` : '',
  ]
    .filter(Boolean)
    .map((x) => esc(String(x)))
    .join(' · ');

  // Built here rather than nested inside the page template: a template inside
  // a template inside a placeholder is exactly the sort of line that parses
  // for one tool and not for the next.
  const whoWhereHtml = whoWhere
    ? '<div class="sub">' + whoWhere + '</div>'
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #0f172a;
    font-size: 11pt;
    line-height: 1.45;
  }
  .head { border-bottom: 2px solid #0e7490; padding-bottom: 6px; margin-bottom: 14px; }
  .h1 { font-size: 15pt; font-weight: 700; }
  .sub { color: #475569; font-size: 10pt; }
  .sect { margin-bottom: 16px; }
  .sh {
    font-size: 9.5pt; font-weight: 700; letter-spacing: .4px;
    text-transform: uppercase; color: #0e7490;
    border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; margin-bottom: 7px;
  }
  ol { margin: 0; padding-left: 20px; }
  li { margin-bottom: 9px; page-break-inside: avoid; }
  .t { font-weight: 700; }
  .m { color: #475569; font-size: 9.5pt; }
  .d { color: #334155; font-size: 10pt; margin-top: 2px; }
  /* Room to write what was decided — the sheet is used at the table, not filed. */
  .box { border-bottom: 1px dotted #94a3b8; height: 14px; margin-top: 5px; }
  .none { color: #64748b; font-size: 10pt; font-style: italic; }
  .foot { margin-top: 20px; color: #94a3b8; font-size: 8.5pt; }
  @page { size: A4 portrait; margin: 14mm; }
  </style></head><body>
    <div class="head">
      <div class="h1">${esc(labels.title)}</div>
      <div class="sub">${esc(congregationName)}${when ? ` · ${esc(when)}` : ''}</div>
      ${whoWhereHtml}
    </div>
    ${itemsSection(items)}
    ${section(labels.onAgenda, onAgenda)}
    ${section(labels.overdue, overdue)}
    ${section(labels.dueSoon, dueSoon)}
    <div class="foot">${esc(labels.printed)} ${esc(printedOn)}</div>
  </body></html>`;
}
