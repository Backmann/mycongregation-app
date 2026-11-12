import type { TFunction } from 'i18next';
import { qrMatrix } from './qr';
import { LAYOUT, type SheetFormat } from './territory-sheet';

/**
 * The printed territory map (12 November 2026), a modern S-12: the number
 * large, the place, the map at full width with the territory outlined, the
 * streets inside it, and a QR code to the same map on a phone — live, with
 * the route, working while the territory is out and never after. No names.
 * The «не беспокоить» addresses go on the back only when the keeper asks
 * (a holder without a phone has no other way to know them).
 */
export interface SheetPage {
  number: string;
  locality: string | null;
  png: string;
  streets: string[];
  landscape: boolean;
  /** The scale bar, from scaleBar(); none when the map has no measure. */
  scale: { mm: number; label: string } | null;
  /** The link the QR code carries; null for a territory not given out. */
  url: string | null;
  dueOn: string | null;
  /** Printed on the back when given. */
  noCalls: string[] | null;
}

export function buildTerritorySheetHtml(
  pages: SheetPage[],
  format: SheetFormat,
  t: TFunction,
  formatDay: (iso: string) => string,
): string {
  const l = LAYOUT[format];
  const size = format === 's12' ? '146mm 94mm' : format.toUpperCase();
  const css = STYLES(l.margin, l.head, l.foot, format);
  const body = pages
    .map((p) => {
      const front = sheet(p, t, formatDay);
      const back = p.noCalls && p.noCalls.length ? backOf(p, t) : '';
      return front + back;
    })
    .join('');
  const pageRules =
    format === 's12'
      ? `@page land { size: 146mm 94mm; margin: 0; } @page port { size: 94mm 146mm; margin: 0; }`
      : `@page land { size: ${size} landscape; margin: 0; } @page port { size: ${size} portrait; margin: 0; }`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    t('territories.sheet.fileTitle', { list: pages.map((p) => p.number).join(', ') }),
  )}</title><style>${pageRules}${css}</style></head><body class="f-${format}">${body}</body></html>`;
}

function qrSvg(text: string): string {
  const m = qrMatrix(text);
  if (!m) return '';
  const n = m.length;
  const q = 2; // quiet zone, in modules
  let rects = '';
  m.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) rects += `<rect x="${x + q}" y="${y + q}" width="1" height="1"/>`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

function sheet(p: SheetPage, t: TFunction, formatDay: (iso: string) => string): string {
  const streets = p.streets.length
    ? `<div class="streets"><b>${esc(t('territories.sheet.streets'))}</b> ${esc(p.streets.join(', '))}</div>`
    : '';
  const due = p.url
    ? p.dueOn
      ? `<div class="due">${esc(t('territories.sheet.due', { date: formatDay(p.dueOn) }))}</div>`
      : ''
    : `<div class="due">${esc(t('territories.sheet.notOut'))}</div>`;
  const qr = p.url
    ? `<div class="qr">${qrSvg(p.url)}<div class="qr-cap">${esc(t('territories.sheet.qr'))}</div></div>`
    : '';
  return `<section class="sheet ${p.landscape ? 'land' : 'port'}">
  <header>
    <div class="kicker">${esc(t('territories.sheet.title'))}</div>
    <div class="num">${esc(p.number)}</div>
    <div class="place">${esc(p.locality ?? '')}</div>
  </header>
  <div class="map"><img src="${p.png}" alt="">
    <div class="north" aria-hidden="true"><svg viewBox="0 0 10 14"><path d="M5 0 L9.5 12 L5 9.5 L0.5 12 Z" fill="#000"/></svg><span>N</span></div>
    ${p.scale ? `<div class="scale"><div class="bar" style="width:${p.scale.mm}mm"></div><span>${esc(p.scale.label)}</span></div>` : ''}
  </div>
  <footer>
    <div class="words">
      ${due}
      ${streets}
      <div class="note">${esc(t('territories.sheet.note'))}</div>
    </div>
    ${qr}
  </footer>
</section>`;
}

function backOf(p: SheetPage, t: TFunction): string {
  return `<section class="sheet back ${p.landscape ? 'land' : 'port'}">
  <div class="kicker">${esc(t('territories.sheet.backTitle', { number: p.number }))}</div>
  <ul>${(p.noCalls ?? []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
  <div class="note">${esc(t('territories.sheet.backNote'))}</div>
</section>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

const STYLES = (margin: number, head: number, foot: number, format: SheetFormat) => {
  const small = format === 's12';
  return `
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.sheet { position: relative; padding: ${margin}mm; page-break-after: always; display: flex; flex-direction: column; overflow: hidden; }
.sheet:last-child { page-break-after: auto; }
.sheet.land { page: land; }
.sheet.port { page: port; }
.f-s12 .sheet.land { width: 146mm; height: 94mm; }
.f-s12 .sheet.port { width: 94mm; height: 146mm; }
.f-a5 .sheet.land { width: 210mm; height: 148mm; }
.f-a5 .sheet.port { width: 148mm; height: 210mm; }
.f-a4 .sheet.land { width: 297mm; height: 210mm; }
.f-a4 .sheet.port { width: 210mm; height: 297mm; }
header { height: ${head}mm; display: flex; align-items: baseline; gap: ${small ? 2 : 4}mm; border-bottom: 0.8pt solid #000; }
.kicker { font-size: ${small ? 6.5 : 8.5}pt; letter-spacing: 0.6pt; text-transform: uppercase; color: #333; }
.num { font-size: ${small ? 16 : 24}pt; font-weight: 700; }
.place { font-size: ${small ? 8 : 11}pt; color: #333; margin-left: auto; }
.map { flex: 1; margin: ${small ? 1.5 : 3}mm 0; border: 0.6pt solid #000; overflow: hidden; display: flex; position: relative; }
.north { position: absolute; top: ${small ? 1.5 : 3}mm; right: ${small ? 1.5 : 3}mm; display: flex; flex-direction: column; align-items: center; background: rgba(255,255,255,0.85); border-radius: 1mm; padding: 0.8mm 1.2mm; }
.north svg { width: ${small ? 2.5 : 3.5}mm; height: ${small ? 3.5 : 4.9}mm; }
.north span { font-size: ${small ? 5.5 : 7}pt; font-weight: 700; line-height: 1; }
.scale { position: absolute; left: ${small ? 1.5 : 3}mm; bottom: ${small ? 1.5 : 3}mm; display: flex; align-items: center; gap: 1.2mm; background: rgba(255,255,255,0.85); border-radius: 1mm; padding: 0.8mm 1.2mm; }
.scale .bar { height: 1.2mm; border: 0.6pt solid #000; border-top: none; }
.scale span { font-size: ${small ? 5.5 : 7}pt; font-weight: 700; }
.map img { width: 100%; height: 100%; object-fit: cover; display: block; }
footer { height: ${foot}mm; display: flex; gap: ${small ? 2 : 4}mm; align-items: stretch; }
.words { flex: 1; display: flex; flex-direction: column; gap: ${small ? 0.6 : 1.2}mm; overflow: hidden; }
.due { font-size: ${small ? 7.5 : 10}pt; font-weight: 700; }
.streets { font-size: ${small ? 6.2 : 8.5}pt; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: ${small ? 3 : 4}; -webkit-box-orient: vertical; }
.note { font-size: ${small ? 5.6 : 7.5}pt; color: #333; margin-top: auto; }
.qr { width: ${foot}mm; display: flex; flex-direction: column; align-items: center; }
.qr svg { width: ${foot - (small ? 5 : 7)}mm; height: ${foot - (small ? 5 : 7)}mm; }
.qr-cap { font-size: ${small ? 5 : 6.5}pt; text-align: center; color: #333; }
.back ul { margin: 3mm 0; padding-left: 5mm; font-size: ${small ? 8 : 11}pt; line-height: 1.5; }
`;
};
