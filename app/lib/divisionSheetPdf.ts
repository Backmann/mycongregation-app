/**
 * Today's division of a territory on paper (17 November 2026): for a pair
 * without a phone, or one whose phone gives out. One A4 sheet — the map
 * with each pair's streets in its own colour and its number in round marks,
 * then each pair's streets in walking order with their house numbers.
 *
 * What the sheet never holds (decision of 13 November 2026, as for the link
 * without login): a «не посещать» address. Paper is lost on the street; it
 * says how many there are on a part's streets and where to look them up.
 *
 * Pure: words and the map come in ready, so scripts/check-division-sheet.mjs
 * can hold the sheet to this.
 */

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface DivisionSheetPart {
  n: number;
  color: string;
  /** «Пара 1 · 46 домов · 58 подъездов» */
  head: string;
  /** In walking order: «Heessener Straße 2–84 · чётная сторона». */
  streets: { text: string; sub: string | null; walked: boolean }[];
  /** «На улицах этой пары 2 адреса «не посещать» — спросите держателя». */
  noCalls: string | null;
}

export interface DivisionSheet {
  /** The file's name and the page title. */
  title: string;
  kicker: string;
  number: string;
  /** «Hamm · 4 пары · 212 домов · общий старт ★» */
  subtitle: string;
  /** The map, a PNG data URL; null when it could not be drawn. */
  png: string | null;
  /** The scale bar under the map: its length on paper and its words. */
  scale: { mm: number; label: string } | null;
  parts: DivisionSheetPart[];
  /** «пройдено» — for a street already ticked when the sheet is printed. */
  walkedWord: string;
  /** Under the sheet: today only, destroy after. */
  foot: string;
}

const STYLE = `
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 10pt; }
.kick { font-size: 8pt; letter-spacing: .08em; text-transform: uppercase; color: #333; }
.top { display: flex; align-items: baseline; gap: 4mm; }
h1 { font-size: 22pt; margin: 0; }
.sub { font-size: 10pt; color: #222; }
.map { margin-top: 3mm; border: 0.6pt solid #888; width: 100%; height: 118mm; object-fit: contain; display: block; }
.scale { font-size: 8pt; color: #333; margin-top: 1mm; display: flex; gap: 1.5mm; align-items: center; }
.scale .bar { height: 1.2mm; border: 0.6pt solid #000; border-top: none; }
.parts { margin-top: 3mm; columns: 2; column-gap: 6mm; }
.part { break-inside: avoid; margin-bottom: 4mm; border-left: 3mm solid; padding-left: 3mm; }
.ph { font-weight: bold; font-size: 11pt; display: flex; gap: 2mm; align-items: center; }
.dot { display: inline-block; width: 6mm; height: 6mm; border-radius: 50%; color: #fff; font-weight: bold;
  font-size: 9pt; text-align: center; line-height: 6mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
ol { margin: 1.5mm 0 0 0; padding-left: 5mm; }
li { margin: 0.8mm 0; }
li .s { color: #333; font-size: 8.5pt; }
li.walked { color: #777; text-decoration: line-through; }
.nc { margin-top: 1.5mm; font-size: 8.5pt; font-weight: bold; }
.foot { margin-top: 3mm; font-size: 8pt; color: #333; border-top: 0.6pt solid #aaa; padding-top: 1.5mm; }
`;

export function buildDivisionSheetHtml(sheet: DivisionSheet): string {
  const parts = sheet.parts
    .map(
      (p) => `<div class="part" style="border-left-color:${esc(p.color)}">
  <div class="ph"><span class="dot" style="background:${esc(p.color)}">${p.n}</span>${esc(p.head)}</div>
  <ol>${p.streets
    .map(
      (x) =>
        `<li${x.walked ? ' class="walked"' : ''}>${esc(x.text)}${x.sub ? ` <span class="s">· ${esc(x.sub)}</span>` : ''}${
          x.walked ? ` <span class="s">(${esc(sheet.walkedWord)})</span>` : ''
        }</li>`,
    )
    .join('')}</ol>
  ${p.noCalls ? `<div class="nc">${esc(p.noCalls)}</div>` : ''}
</div>`,
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(sheet.title)}</title><style>${STYLE}</style></head><body>
<div class="kick">${esc(sheet.kicker)}</div>
<div class="top"><h1>${esc(sheet.number)}</h1><div class="sub">${esc(sheet.subtitle)}</div></div>
${sheet.png ? `<img class="map" src="${sheet.png}" alt="">` : ''}
${sheet.scale ? `<div class="scale"><div class="bar" style="width:${sheet.scale.mm}mm"></div><span>${esc(sheet.scale.label)}</span></div>` : ''}
<div class="parts">${parts}</div>
<div class="foot">${esc(sheet.foot)}</div>
</body></html>`;
}
