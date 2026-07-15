import type { CoVisitItem, SpecialEvent } from './api';

/**
 * A congregation meeting during the visit (midweek or weekend), with the
 * talk title(s) delivered by the circuit overseer, for the printed program.
 */
export interface CoMeetingInfo {
  kind: 'midweek' | 'weekend';
  date: string; // YYYY-MM-DD
  time: string; // "HH:MM"
  place: string | null;
  /** Talk titles to show (midweek: CO service talk; weekend: public talk + CO concluding talk). */
  talks: string[];
}


export interface CoPdfLabels {
  coShort: string;
  wifeShort: string;
  item: string;
  who: string;
  together: string;
  visitTitle: string;
  coScheduleTitle: string;
  wifeScheduleTitle: string;
  fieldService: string;
  lunches: string;
  lunchBox: string;
  lunchBoxPublisher: string;
  pastoral: string;
  pioneers: string;
  elders: string;
  docReview: string;
  day: string;
  time: string;
  place: string;
  accompanier: string;
  host: string;
  address: string;
  phone: string;
  note: string;
  target: string;
  theme: string;
  kingdomHall: string;
  cartLocation: string;
  wife: string;
  period: string;
  accommodation: string;
  congregation: string;
  pageForCongregationTitle: string;
  pageForOverseerTitle: string;
  midweekMeeting: string;
  weekendMeeting: string;
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function placeStr(it: CoVisitItem, L: CoPdfLabels): string {
  if (it.placeKind === 'kingdom_hall')
    return it.placeText ? `${L.kingdomHall} · ${it.placeText}` : L.kingdomHall;
  if (it.placeKind === 'cart_location')
    return it.cartLocationName ?? L.cartLocation;
  if (it.placeKind === 'custom') return it.placeText ?? '';
  return '';
}


function dayLabel(iso: string, locale: string): string {
  const s = fmtDate(iso, locale);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A congregation-meeting row (midweek/weekend) for page 1: time · meeting name
 * · place, plus the talk title(s). No names.
 */
function meetingRowHtml(m: CoMeetingInfo, L: CoPdfLabels): string {
  const title = m.kind === 'midweek' ? L.midweekMeeting : L.weekendMeeting;
  const talks = m.talks
    .filter(Boolean)
    .map((t) => `<div class="ctalk">${esc(t)}</div>`)
    .join('');
  return `<div class="crow crow-meeting">
  <div class="ctime">${esc(m.time)}</div>
  <div class="cbody">
    <div class="ctitle">${esc(title)}</div>
    ${m.place ? `<div class="cplace">${esc(m.place)}</div>` : ''}
    ${talks}
  </div>
</div>`;
}

/**
 * Human, readable name for an item kind — used as the row/section title.
 */
function kindTitle(kind: string, L: CoPdfLabels): string {
  switch (kind) {
    case 'field_service':
      return L.fieldService;
    case 'lunch':
      return L.lunches;
    case 'lunch_box':
      return L.lunchBox;
    case 'pastoral':
      return L.pastoral;
    case 'pioneers':
      return L.pioneers;
    case 'elders':
      return L.elders;
    default:
      return L.item;
  }
}

/**
 * PAGE 1 — for the congregation. Only what everyone needs to know: the meetings
 * that concern them, with time and place, and NO personal/host names. Grouped
 * by day into clean cards.
 */
function congregationPage(
  items: CoVisitItem[],
  meetings: CoMeetingInfo[],
  locale: string,
  L: CoPdfLabels,
): string {
  // Kinds that are announced to the congregation. Field service (where to
  // gather), the pioneer meeting, and the elders/MS meeting.
  const publicKinds = new Set(['field_service', 'pioneers', 'elders']);
  const visible = items.filter((i) => !i.forWife && publicKinds.has(i.kind));

  // All dates that have either a public item or a congregation meeting.
  const meetingByDate = new Map<string, CoMeetingInfo[]>();
  for (const m of meetings) {
    const arr = meetingByDate.get(m.date) ?? [];
    arr.push(m);
    meetingByDate.set(m.date, arr);
  }
  const allDates = Array.from(
    new Set([
      ...visible.map((i) => i.itemDate),
      ...meetings.map((m) => m.date),
    ]),
  ).sort();
  if (allDates.length === 0) return '<p class="empty">—</p>';

  return allDates
    .map((day) => {
      // Meetings and items for this day, interleaved by time.
      const all = [
        ...(meetingByDate.get(day) ?? []).map((m) => ({
          time: m.time,
          html: meetingRowHtml(m, L),
        })),
        ...visible
          .filter((i) => i.itemDate === day)
          .map((i) => {
            const place = placeStr(i, L);
            return {
              time: i.startTime ?? '99:99',
              html: `<div class="crow">
  <div class="ctime">${esc(i.startTime ?? '')}</div>
  <div class="cbody">
    <div class="ctitle">${esc(kindTitle(i.kind, L))}</div>
    ${place ? `<div class="cplace">${esc(place)}</div>` : ''}
  </div>
</div>`,
            };
          }),
      ]
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((x) => x.html)
        .join('\n');
      return `<div class="daycard">
  <div class="dayhead">${esc(dayLabel(day, locale))}</div>
  <div class="daybody">${all}</div>
</div>`;
    })
    .join('\n');
}

/**
 * PAGE 2 — for the circuit overseer. Full detail: every item of every day with
 * names, phones, notes, in time order. This is the private working copy.
 */
function overseerPage(
  items: CoVisitItem[],
  locale: string,
  L: CoPdfLabels,
): string {
  const visible = items.filter(
    (i) => !i.forWife && i.kind !== 'document_review',
  );
  if (visible.length === 0) return '<p class="empty">—</p>';

  const pairOf = (co: CoVisitItem): CoVisitItem | null =>
    items.find(
      (i) =>
        i.forWife &&
        i.kind === 'field_service' &&
        i.itemDate === co.itemDate &&
        (i.startTime ?? '') === (co.startTime ?? ''),
    ) ?? null;
  const withPhone = (name: string | null, phone: string | null) =>
    name ? (phone ? `${name} · ${phone}` : name) : '';
  const personLine = (
    label: string,
    partner: string,
    note: string | null,
  ): string | null => {
    if (!partner && !note) return null;
    return `${label}: ${partner || '—'}${note ? ` — ${note}` : ''}`;
  };

  /** [place lines, participant lines] for one row. */
  const cells = (i: CoVisitItem): [string[], string[]] => {
    switch (i.kind) {
      case 'field_service': {
        const place = [placeStr(i, L)].filter(Boolean);
        const partner = withPhone(
          i.assigneeName ?? i.assigneeText,
          i.assigneePhone,
        );
        if (i.withWife) {
          return [place, [personLine(L.together, partner, i.note) ?? L.together]];
        }
        const pair = pairOf(i);
        if (pair) {
          const wifePartner = withPhone(
            pair.assigneeName ?? pair.assigneeText,
            pair.assigneePhone,
          );
          const lines = [
            personLine(L.coShort, partner, i.note),
            personLine(L.wifeShort, wifePartner, pair.note),
          ].filter((x): x is string => !!x);
          return [place, lines.length > 0 ? lines : ['—']];
        }
        const single = personLine(L.coShort, partner, i.note);
        return [place, single ? [single] : ['—']];
      }
      case 'lunch': {
        const place = [i.assigneeAddress ?? ''].filter(Boolean);
        const host = withPhone(i.assigneeName ?? i.assigneeText, i.assigneePhone);
        return [place, host ? [host] : ['—']];
      }
      case 'lunch_box': {
        const who = i.assigneeName ?? i.assigneeText ?? '';
        return [[], who ? [who] : ['—']];
      }
      case 'pastoral': {
        const who = withPhone(i.assigneeName, i.assigneePhone);
        return [i.note ? [i.note] : [], who ? [who] : ['—']];
      }
      default: {
        const place = [placeStr(i, L), i.note ?? ''].filter(Boolean);
        return [place, []];
      }
    }
  };
  const cell = (lines: string[]): string =>
    lines.length === 0 ? '' : lines.map((l) => esc(l)).join('<br/>');

  const dates = Array.from(new Set(visible.map((i) => i.itemDate))).sort();
  return dates
    .map((day) => {
      const rows = visible
        .filter((i) => i.itemDate === day)
        .sort(
          (a, b) =>
            (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99') ||
            a.sortOrder - b.sortOrder,
        )
        .map((i) => {
          const [place, who] = cells(i);
          return `<tr>
<td class="t">${esc(i.startTime ?? '—')}</td>
<td class="k">${esc(kindTitle(i.kind, L))}</td>
<td>${cell(place)}</td>
<td>${cell(who)}</td>
</tr>`;
        })
        .join('\n');
      return `<div class="daycard">
  <div class="dayhead">${esc(dayLabel(day, locale))}</div>
  <table class="dt">
    <colgroup><col class="c1"/><col class="c2"/><col class="c3"/><col class="c4"/></colgroup>
    <thead><tr><th>${esc(L.time)}</th><th>${esc(L.item)}</th><th>${esc(
      L.place,
    )}</th><th>${esc(L.who)}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
    })
    .join('\n');
}

export function buildCoScheduleHtml(opts: {
  visit: SpecialEvent;
  items: CoVisitItem[];
  locale: string;
  congregationName?: string | null;
  hallAddress?: string | null;
  /** Precomposed accommodation line (host name/address/phone or address). */
  accommodationText?: string | null;
  /** Congregation meetings during the visit (midweek/weekend) with CO talks. */
  meetings?: CoMeetingInfo[];
  labels: CoPdfLabels;
}): string {
  const { visit, items, locale, congregationName, hallAddress } = opts;
  const meetings = opts.meetings ?? [];
  const accommodation = opts.accommodationText ?? visit.coAccommodationAddress;
  const L = opts.labels;
  const coName = [visit.coFirstName, visit.coLastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const period =
    visit.endDate && visit.endDate !== visit.date
      ? `${fmtDate(visit.date, locale)} — ${fmtDate(visit.endDate, locale)}`
      : fmtDate(visit.date, locale);

  // Compact meta line shown under each page title.
  const metaChips = (opts2: { withAccommodation: boolean }) =>
    [
      coName ? `<span class="chip chip-name">${esc(coName)}</span>` : '',
      visit.coWifeName
        ? `<span class="chip">${esc(L.wife)}: ${esc(visit.coWifeName)}</span>`
        : '',
      `<span class="chip">${esc(period)}</span>`,
      congregationName
        ? `<span class="chip">${esc(congregationName)}</span>`
        : '',
      hallAddress
        ? `<span class="chip">${esc(L.kingdomHall)}: ${esc(hallAddress)}</span>`
        : '',
      opts2.withAccommodation && accommodation
        ? `<span class="chip">${esc(L.accommodation)}: ${esc(
            accommodation,
          )}</span>`
        : '',
    ]
      .filter(Boolean)
      .join('');

  const pageHead = (
    title: string,
    subtitle: string,
    withAccommodation: boolean,
  ) => `<header class="pagehead">
  <div class="titlewrap">
    <h1>${esc(title)}</h1>
    <div class="subtitle">${esc(subtitle)}</div>
  </div>
  <div class="chips">${metaChips({ withAccommodation })}</div>
</header>`;

  const page1 = `<section class="page">
  ${pageHead(L.pageForCongregationTitle, L.visitTitle, false)}
  ${congregationPage(items, meetings, locale, L)}
  <div class="foot"><span>mycongregation.org</span><span>${esc(
    new Date().toLocaleDateString(locale),
  )}</span></div>
</section>`;

  const page2 = `<section class="page page-break">
  ${pageHead(L.pageForOverseerTitle, L.coScheduleTitle, true)}
  ${overseerPage(items, locale, L)}
  <div class="foot"><span>mycongregation.org</span><span>${esc(
    new Date().toLocaleDateString(locale),
  )}</span></div>
</section>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    L.coScheduleTitle,
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
  .page { padding: 22px 26px 40px; }

  /* Header */
  .pagehead {
    border-bottom: 3px solid #0e7490;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .titlewrap { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .pagehead h1 { font-size: 20px; margin: 0; color: #0e7490; letter-spacing: -0.2px; }
  .subtitle { font-size: 12px; color: #64748b; font-weight: 500; }
  .chips { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-block;
    font-size: 10.5px;
    color: #334155;
    background: #f1f5f9;
    border-radius: 999px;
    padding: 3px 10px;
  }
  .chip-name { background: #cffafe; color: #0e7490; font-weight: 700; }

  /* Day cards — clearly separated blocks */
  .daycard {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 14px;
    page-break-inside: avoid;
  }
  .dayhead {
    background: #ecfeff;
    color: #0e7490;
    font-weight: 700;
    font-size: 13.5px;
    padding: 8px 14px;
    border-bottom: 1px solid #cffafe;
  }
  .daybody { padding: 4px 0; }

  /* Page-1 congregation rows: time · title · place, no names */
  .crow { display: flex; gap: 14px; padding: 9px 14px; align-items: baseline; }
  .crow + .crow { border-top: 1px dashed #eef2f6; }
  .ctime { font-weight: 700; font-size: 13px; color: #0f172a; min-width: 48px; white-space: nowrap; }
  .cbody { flex: 1; }
  .ctitle { font-weight: 600; font-size: 13px; color: #0f172a; }
  .cplace { font-size: 12px; color: #475569; margin-top: 1px; }
  .crow-meeting { background: #fbfeff; }
  .ctalk {
    font-size: 12px; color: #0e7490; margin-top: 3px; padding-left: 10px;
    border-left: 2px solid #cffafe; font-style: italic;
  }

  /* Page-2 overseer tables */
  .dt { table-layout: fixed; width: 100%; border-collapse: collapse; }
  .dt col.c1 { width: 46px; }
  .dt col.c2 { width: 128px; }
  .dt col.c3 { width: 32%; }
  .dt th {
    text-align: left; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.4px; color: #94a3b8; font-weight: 700;
    padding: 6px 12px 5px; background: #fbfdfe;
  }
  .dt td {
    text-align: left; vertical-align: top; padding: 7px 12px;
    border-top: 1px solid #f1f5f9; font-size: 11.5px;
    word-wrap: break-word; overflow-wrap: break-word;
  }
  .dt .t { font-weight: 700; white-space: nowrap; }
  .dt .k { font-weight: 600; color: #0e7490; }

  .empty { color: #94a3b8; padding: 8px 2px; }
  .foot {
    margin-top: 20px; padding-top: 8px; border-top: 1px solid #eef2f6;
    font-size: 9.5px; color: #94a3b8; display: flex; justify-content: space-between;
  }
  .page-break { page-break-before: always; }
  @page { size: A4 portrait; margin: 14mm; }
</style></head>
<body onload="setTimeout(function(){window.print();},250);">
  ${page1}
  ${page2}
</body></html>`;
}
