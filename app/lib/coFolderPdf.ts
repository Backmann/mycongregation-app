import type { CoVisitItem, S21DataResponse } from './api';
import type { FolderAnswer, FolderContact } from './co-folder';
import { buildS21CardsBody, S21_STYLES } from './s21';

/**
 * The files of the folder for the circuit overseer (S-61, 17 November 2026)
 * that no other screen makes: the visit's own lists (1.3, 1.4, 1.5, 3.3,
 * 3.4), the S-21 of a group, the contacts (2.5), the answers of page 2 and
 * «00 Оглавление». One plain A4 sheet each, black on white for any printer.
 *
 * Pure: the words come in already said, for scripts/check-co-folder.mjs.
 */

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLE = `
@page { size: A4; margin: 15mm; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 10.5pt; margin: 0; }
.kick { font-size: 8pt; letter-spacing: .08em; color: #444; text-transform: uppercase; }
h1 { font-size: 16pt; margin: 1mm 0 1mm; }
.sub { font-size: 10pt; margin-bottom: 5mm; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 0.6pt solid #888; padding: 1.8mm 2mm; text-align: left; vertical-align: top; }
th { font-size: 8.5pt; background: #f2f2f2; }
td.n { font-weight: bold; white-space: nowrap; width: 12mm; }
td.nowrap { white-space: nowrap; }
.empty { border: 0.6pt dashed #888; padding: 4mm; color: #333; }
.foot { margin-top: 6mm; font-size: 8.5pt; color: #333; }
h2 { font-size: 11pt; margin: 6mm 0 2mm; }
.q { border-bottom: 0.6pt solid #bbb; padding: 2mm 0; display: flex; gap: 4mm; }
.q .num { font-weight: bold; width: 7mm; flex: none; }
.q .text { flex: 1; }
.q .ans { width: 22mm; flex: none; font-weight: bold; text-align: right; }
`;

/** Replace the document's <title> — the browser names the PDF after it. */
export function withTitle(html: string, title: string): string {
  const t = `<title>${esc(title)}</title>`;
  return /<title>[\s\S]*?<\/title>/.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/, t)
    : html.replace('<head>', `<head>${t}`);
}

export interface SheetHead {
  /** «S-61 · Сведения для районного старейшины» */
  kicker: string;
  /** The file's own name, which is also its heading. */
  title: string;
  /** «Визит 23–28 февраля 2027 · Пётр Иванов · собрано 22.02.2027» */
  subtitle: string;
  /** The line under the sheet: delete after reading (sfga §29). */
  foot: string;
}

function page(head: SheetHead, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(head.title)}</title><style>${STYLE}</style></head><body>
<div class="kick">${esc(head.kicker)}</div>
<h1>${esc(head.title)}</h1>
<div class="sub">${esc(head.subtitle)}</div>
${body}
<div class="foot">${esc(head.foot)}</div>
</body></html>`;
}

/** A table, or the words for an empty one. */
export function buildTableHtml(
  head: SheetHead,
  columns: string[],
  rows: (string | null)[][],
  empty: string,
): string {
  const body = rows.length
    ? `<table><thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="nowrap"' : ''}>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : `<div class="empty">${esc(empty)}</div>`;
  return page(head, body);
}

/** The visit's items of some kinds, by day and hour. */
export function itemsOf(items: CoVisitItem[], kinds: string[]): CoVisitItem[] {
  return items
    .filter((i) => kinds.includes(i.kind))
    .sort((a, b) =>
      a.itemDate === b.itemDate
        ? (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.sortOrder - b.sortOrder
        : a.itemDate.localeCompare(b.itemDate),
    );
}

/** Who a line is with: the card's name, else the name written by hand. */
export function personOf(i: CoVisitItem): string {
  return i.assigneeName ?? i.assigneeText ?? '';
}

/** Where a line is: the stand's place, else the place written by hand. */
export function placeOf(i: CoVisitItem, hall: string): string {
  if (i.placeKind === 'kingdom_hall') return hall;
  return i.cartLocationName ?? i.placeText ?? '';
}

/** 2.1 — one group, everyone's two service years, a person to a page. */
export function buildS21GroupHtml(
  title: string,
  cards: S21DataResponse[][],
  lang: string,
  empty: string,
): string {
  const people = cards.length
    ? cards
        .map((years, i) => `<section style="${i < cards.length - 1 ? 'page-break-after: always;' : ''}">${buildS21CardsBody(years, lang)}</section>`)
        .join('')
    : `<p>${esc(empty)}</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${S21_STYLES}
section .s21 + .s21 { margin-top: 8mm; }</style></head><body>${people}</body></html>`;
}

/** 2.5 — the contact details of every publisher, for the file only. */
export function buildContactsHtml(
  head: SheetHead,
  people: FolderContact[],
  cols: { name: string; group: string; phone: string; email: string; address: string },
  noGroup: string,
  empty: string,
): string {
  return buildTableHtml(
    head,
    [cols.name, cols.group, cols.phone, cols.email, cols.address],
    people.map((p) => [
      `${p.lastName} ${p.firstName}`.trim(),
      p.group ?? noGroup,
      p.mobilePhone,
      p.email,
      p.address,
    ]),
    empty,
  );
}

/** Page 2 as answered — kept until the visit ends, then erased. */
export function buildAnswersHtml(
  head: SheetHead,
  questions: { n: number; text: string; answer: FolderAnswer | null }[],
  words: Record<FolderAnswer, string>,
  none: string,
): string {
  const body = questions
    .map(
      (q) =>
        `<div class="q"><div class="num">${q.n}.</div><div class="text">${esc(q.text)}</div><div class="ans">${esc(
          q.answer ? words[q.answer] : none,
        )}</div></div>`,
    )
    .join('');
  return page(head, body);
}

export interface TocLine {
  num: string;
  title: string;
  /** The file's name, or how it goes: «на бумаге», «не относится». */
  how: string;
}

/** «00 Оглавление» — the first file, the folder in the form's order. */
export function buildTocHtml(head: SheetHead, lines: TocLine[], cols: { item: string; how: string }): string {
  const body = `<table><thead><tr><th></th><th>${esc(cols.item)}</th><th>${esc(cols.how)}</th></tr></thead><tbody>${lines
    .map(
      (l) =>
        `<tr><td class="n">${esc(l.num)}</td><td>${esc(l.title)}</td><td>${esc(l.how)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  return page(head, body);
}
