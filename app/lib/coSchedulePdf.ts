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
  const wd = new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
    weekday: 'short',
  });
  return `${wd}, ${fmtDate(iso, locale)}`;
}

/**
 * Day-by-day schedule (mirrors the on-screen chronological view): one block
 * per day with every item of that day in time order, whatever its kind.
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
  const details = (i: CoVisitItem): [string, string] => {
    switch (i.kind) {
      case 'field_service': {
        if (i.withWife)
          return [
            placeStr(i, L),
            [
              withPhone(i.assigneeName ?? i.assigneeText, i.assigneePhone),
              L.together,
            ]
              .filter(Boolean)
              .join(' · '),
          ];
        const pair = pairOf(i);
        if (pair) {
          const co = withPhone(
            i.assigneeName ?? i.assigneeText,
            i.assigneePhone,
          );
          const wife = withPhone(
            pair.assigneeName ?? pair.assigneeText,
            pair.assigneePhone,
          );
          return [
            placeStr(i, L),
            `${L.coShort}: ${co || '—'} · ${L.wifeShort}: ${wife || '—'}`,
          ];
        }
        return [
          placeStr(i, L),
          withPhone(i.assigneeName ?? i.assigneeText, i.assigneePhone),
        ];
      }
      case 'lunch':
        return [
          i.assigneeAddress ?? '',
          withPhone(i.assigneeName ?? i.assigneeText, i.assigneePhone),
        ];
      case 'lunch_box':
        return ['', i.assigneeName ?? i.assigneeText ?? ''];
      case 'pastoral':
        return [i.note ?? '', i.assigneeName ?? ''];
      default:
        return [[placeStr(i, L), i.note ?? ''].filter(Boolean).join(' — '), ''];
    }
  };
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
          const [detail, who] = details(i);
          return [i.startTime ?? '—', kindName(i.kind), detail, who];
        });
      return `<div class="day">
<p class="dtitle">${esc(dayLabel(day, locale))}</p>
${tableHtml([L.time, L.item, L.place, L.who], rows)}
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
  labels: CoPdfLabels;
}): string {
  const { visit, items, locale, congregationName, hallAddress } = opts;
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
    visit.coAccommodationAddress
      ? `<div class="meta">${esc(L.accommodation)}: ${esc(
          visit.coAccommodationAddress,
        )}</div>`
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
  .day { page-break-inside: avoid; margin-bottom: 10px; }
  .dtitle { font-size: 13.5px; font-weight: 700; color: #0e7490; margin: 10px 0 2px; }
  .dtitle-w { color: #7c3aed; }
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
