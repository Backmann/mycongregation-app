import type { CoVisitItem, SpecialEvent } from './api';


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

function byDate(items: CoVisitItem[]): CoVisitItem[] {
  return [...items].sort((a, b) => {
    if (a.itemDate !== b.itemDate) return a.itemDate.localeCompare(b.itemDate);
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });
}

function tableHtml(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '';
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}


function dayLabel(iso: string, locale: string): string {
  const s = fmtDate(iso, locale);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Day-by-day schedule (mirrors the on-screen chronological view): one block
 * per day with every item of that day in time order, whatever its kind.
 */
/**
 * One table per day with FIXED column widths (identical on every day), one
 * line per person in the participants cell, and phones next to names. Empty
 * halves are dropped instead of printing "Name: —" noise.
 */
function daySchedule(
  items: CoVisitItem[],
  locale: string,
  L: CoPdfLabels,
): string {
  const visible = items.filter(
    (i) => !i.forWife && i.kind !== 'document_review',
  );
  const pairOf = (co: CoVisitItem): CoVisitItem | null =>
    items.find(
      (i) =>
        i.forWife &&
        i.kind === 'field_service' &&
        i.itemDate === co.itemDate &&
        (i.startTime ?? '') === (co.startTime ?? ''),
    ) ?? null;
  const kindName = (k: string) =>
    k === 'field_service'
      ? L.fieldService
      : k === 'lunch'
        ? L.lunches
        : k === 'lunch_box'
          ? L.lunchBox
          : k === 'pastoral'
            ? L.pastoral
            : k === 'pioneers'
              ? L.pioneers
              : L.elders;
  const withPhone = (name: string | null, phone: string | null) =>
    name ? (phone ? `${name} (${phone})` : name) : '';
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
          const who = [
            personLine(L.together, partner, i.note) ?? L.together,
          ];
          return [place, who];
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
        const host = withPhone(
          i.assigneeName ?? i.assigneeText,
          i.assigneePhone,
        );
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
<td class="k">${esc(kindName(i.kind))}</td>
<td>${cell(place)}</td>
<td>${cell(who)}</td>
</tr>`;
        })
        .join('\n');
      return `<div class="day">
<p class="dtitle">${esc(dayLabel(day, locale))}</p>
<table class="dt">
<colgroup><col class="c1"/><col class="c2"/><col class="c3"/><col class="c4"/></colgroup>
<thead><tr><th>${esc(L.time)}</th><th>${esc(L.item)}</th><th>${esc(L.place)}</th><th>${esc(L.who)}</th></tr></thead>
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
  labels: CoPdfLabels;
}): string {
  const { visit, items, locale, congregationName, hallAddress } = opts;
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

  const header = [
    coName ? `<div class="meta"><b>${esc(coName)}</b></div>` : '',
    visit.coWifeName
      ? `<div class="meta">${esc(L.wife)}: ${esc(visit.coWifeName)}</div>`
      : '',
    `<div class="meta">${esc(period)}</div>`,
    congregationName
      ? `<div class="meta">${esc(L.congregation)}: ${esc(congregationName)}</div>`
      : '',
    hallAddress
      ? `<div class="meta">${esc(L.kingdomHall)}: ${esc(hallAddress)}</div>`
      : '',
    accommodation
      ? `<div class="meta">${esc(L.accommodation)}: ${esc(accommodation)}</div>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const pageHead = (title: string) =>
    `<div class="pagehead"><h1>${esc(title)}</h1>${header}</div>`;

  const publicRows = byDate(
    items.filter((i) => i.kind === 'field_service' && !i.forWife),
  ).map((i) => [fmtDate(i.itemDate, locale), i.startTime ?? '', placeStr(i, L)]);

  const page1 = `<section>
    ${pageHead(L.visitTitle)}
    <h2>${esc(L.fieldService)}</h2>
    ${tableHtml([L.day, L.time, L.place], publicRows) || '<p>—</p>'}
  </section>`;

  const page2 = `<section class="page-break">
    ${pageHead(L.coScheduleTitle)}
    ${daySchedule(items, locale, L) || '<p>—</p>'}
    <div class="foot"><span>mycongregation.org</span><span>${esc(
      new Date().toLocaleDateString(locale),
    )}</span></div>
  </section>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    L.coScheduleTitle,
  )}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  h2 { font-size: 15px; margin: 16px 0 6px; border-bottom: 2px solid #0e7490; padding-bottom: 3px; color: #0e7490; }
  .day { page-break-inside: avoid; margin-bottom: 12px; }
  .dtitle { font-size: 13.5px; font-weight: 700; color: #0e7490; margin: 12px 0 3px; border-left: 3px solid #0e7490; padding-left: 8px; }
  .dt { table-layout: fixed; width: 100%; }
  .dt .c1 { width: 42px; }
  .dt .c2 { width: 132px; }
  .dt .c3 { width: 30%; }
  .dt td { word-wrap: break-word; overflow-wrap: break-word; }
  .dt .t { font-weight: 700; white-space: nowrap; }
  .dt .k { font-weight: 600; }
  .meta { color: #374151; font-size: 12px; margin-bottom: 2px; }
  .pagehead { border-bottom: 3px solid #0e7490; padding-bottom: 8px; margin-bottom: 10px; }
  .pagehead h1 { margin-bottom: 4px; }
  .foot { margin-top: 18px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
  th, td { text-align: left; vertical-align: top; padding: 3px 7px; border-bottom: 1px solid #e5e7eb; font-size: 11.5px; }
  th { color: #6b7280; font-weight: 600; background: #f8fafc; }
  .page-break { page-break-before: always; }
  @page { size: A4 portrait; margin: 16mm; }
</style></head>
<body onload="setTimeout(function(){window.print();},250);">
  ${page1}
  ${page2}
</body></html>`;
}
