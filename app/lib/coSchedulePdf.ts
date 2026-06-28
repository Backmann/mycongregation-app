import type { CoVisitItem, SpecialEvent } from './api';

export interface CoPdfLabels {
  visitTitle: string;
  coScheduleTitle: string;
  wifeScheduleTitle: string;
  fieldService: string;
  lunches: string;
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
  if (it.placeKind === 'kingdom_hall') return L.kingdomHall;
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

function sectionHtml(
  title: string,
  headers: string[],
  rows: string[][],
): string {
  if (rows.length === 0) return '';
  return `<h3>${esc(title)}</h3>${tableHtml(headers, rows)}`;
}

function detailSections(
  items: CoVisitItem[],
  forWife: boolean,
  locale: string,
  L: CoPdfLabels,
  full: boolean,
): string {
  const of = (kind: string) =>
    byDate(items.filter((i) => i.kind === kind && i.forWife === forWife));
  const d = (iso: string) => fmtDate(iso, locale);
  let html = '';
  html += sectionHtml(
    L.fieldService,
    [L.day, L.time, L.place, L.accompanier, L.phone],
    of('field_service').map((i) => [
      d(i.itemDate),
      i.startTime ?? '',
      placeStr(i, L),
      i.assigneeName ?? i.assigneeText ?? '',
      i.assigneePhone ?? '',
    ]),
  );
  html += sectionHtml(
    L.lunches,
    [L.day, L.time, L.host, L.address, L.phone, L.note],
    of('lunch').map((i) => [
      d(i.itemDate),
      i.startTime ?? '',
      i.assigneeName ?? i.assigneeText ?? '',
      i.assigneeAddress ?? '',
      i.assigneePhone ?? '',
      i.note ?? '',
    ]),
  );
  if (full) {
    html += sectionHtml(
      L.pastoral,
      [L.day, L.time, L.accompanier, L.target],
      of('pastoral').map((i) => [
        d(i.itemDate),
        i.startTime ?? '',
        i.assigneeName ?? '',
        i.note ?? '',
      ]),
    );
    html += sectionHtml(
      L.pioneers,
      [L.day, L.time, L.theme],
      of('pioneers').map((i) => [
        d(i.itemDate),
        i.startTime ?? '',
        i.note ?? '',
      ]),
    );
    html += sectionHtml(
      L.elders,
      [L.day, L.time, L.note],
      of('elders').map((i) => [d(i.itemDate), i.startTime ?? '', i.note ?? '']),
    );
    html += sectionHtml(
      L.docReview,
      [L.day, L.time, L.note],
      of('document_review').map((i) => [
        d(i.itemDate),
        i.startTime ?? '',
        i.note ?? '',
      ]),
    );
  }
  return html;
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

  const publicRows = byDate(
    items.filter((i) => i.kind === 'field_service' && !i.forWife),
  ).map((i) => [fmtDate(i.itemDate, locale), i.startTime ?? '', placeStr(i, L)]);

  const page1 = `<section>
    <h1>${esc(L.visitTitle)}</h1>
    ${header}
    <h2>${esc(L.fieldService)}</h2>
    ${tableHtml([L.day, L.time, L.place], publicRows) || '<p>—</p>'}
  </section>`;

  const page2 = `<section class="page-break">
    <h1>${esc(L.coScheduleTitle)}</h1>
    ${header}
    ${detailSections(items, false, locale, L, true) || '<p>—</p>'}
  </section>`;

  const page3 = visit.coWifeName
    ? `<section class="page-break">
    <h1>${esc(L.wifeScheduleTitle)}</h1>
    ${header}
    ${detailSections(items, true, locale, L, false) || '<p>—</p>'}
  </section>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    L.coScheduleTitle,
  )}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 6px; }
  h2 { font-size: 15px; margin: 16px 0 6px; border-bottom: 2px solid #0ea5e9; padding-bottom: 3px; }
  h3 { font-size: 13px; margin: 12px 0 4px; color: #0f172a; }
  .meta { color: #374151; font-size: 12px; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
  th, td { text-align: left; vertical-align: top; padding: 4px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
  th { color: #6b7280; font-weight: 600; background: #f8fafc; }
  .page-break { page-break-before: always; }
  @page { margin: 16mm; }
</style></head>
<body onload="setTimeout(function(){window.print();},250);">
  ${page1}
  ${page2}
  ${page3}
</body></html>`;
}
