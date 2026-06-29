import type { CoVisitItem, SpecialEvent } from './api';

const BRAND_ICON =
  'data:image/png;base64,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';

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

  const brand =
    `<div class="brand"><img src="${BRAND_ICON}" alt="" />` +
    `<span class="wm"><span class="my">My</span>` +
    `<span class="co">Congregation</span>` +
    `<span class="org">.org</span></span></div>`;
  const pageHead = (title: string) =>
    `<div class="pagehead"><div><h1>${esc(title)}</h1>${header}</div>${brand}</div>`;

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
    ${detailSections(items, false, locale, L, true) || '<p>—</p>'}
  </section>`;

  const page3 = visit.coWifeName
    ? `<section class="page-break">
    ${pageHead(L.wifeScheduleTitle)}
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
  .pagehead { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 2px solid #0ea5e9; padding-bottom: 8px; margin-bottom: 8px; }
  .pagehead h1 { margin-bottom: 4px; }
  .brand { display: flex; align-items: center; gap: 7px; white-space: nowrap; }
  .brand img { width: 28px; height: 28px; border-radius: 8px; }
  .brand .wm { font-weight: 700; font-size: 13px; letter-spacing: -0.3px; }
  .brand .my { color: #0e7490; }
  .brand .co { color: #0f172a; }
  .brand .org { color: #0e7490; }
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
