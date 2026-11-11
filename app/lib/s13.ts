/**
 * The S-13 «Данные о назначении участков» laid out as the form is
 * (11 November 2026): twenty lines a sheet, four assignments a line — the
 * holder's surname over the day it was received and the day it was worked.
 *
 * The rules of filling it in (decided 11 November 2026):
 *  - a line per territory in use, in the order of their numbers; the column
 *    «дата последней обработки» holds the day it was last worked before the
 *    service year began;
 *  - an assignment carried over from the year before keeps its old day of
 *    receiving; handed back unworked, its «worked» cell stays empty;
 *  - more than four in a year: the territory goes on in the next line;
 *  - a group's territory is written «Гр. 2 · фамилия», a campaign
 *    «фамилия (кампания)»; two people with one surname get an initial.
 *
 * No imports: the gate runs this file on its own (scripts/check-s13.mjs).
 */

export interface S13Assignment {
  holderName: string;
  forGroupName: string | null;
  assignedOn: string;
  completedOn: string | null;
  method: string | null;
}

export interface S13Data {
  serviceYear: number;
  territories: {
    number: string;
    lastCompletedBefore: string | null;
    assignments: S13Assignment[];
  }[];
}

export interface S13Cell {
  name: string;
  received: string;
  worked: string;
}

export interface S13Line {
  number: string;
  /** Empty on a line that continues the one above. */
  last: string;
  cells: S13Cell[];
}

export const LINES_PER_SHEET = 20;
export const CELLS_PER_LINE = 4;

/** '2026-09-03' → '03.09.26': the form's cells are narrow. */
export function shortDay(iso: string | null): string {
  if (!iso) return '';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
}

/** «Группа 2» → «Гр. 2»; any other name as it is. */
export function shortGroup(name: string, short: string): string {
  const m = /^(группа|group|gruppe)\s+(.+)$/i.exec(name.trim());
  return m ? `${short} ${m[2]}` : name.trim();
}

const surnameOf = (full: string) => full.trim().split(/\s+/)[0] ?? '';

/**
 * Surnames for the sheet: where two different people share one, each gets
 * the initial of the next word («Белова А.», «Белова В.»).
 */
export function surnames(names: string[]): Map<string, string> {
  const people = new Map<string, Set<string>>();
  for (const n of names) {
    const s = surnameOf(n);
    const set = people.get(s) ?? new Set<string>();
    set.add(n.trim());
    people.set(s, set);
  }
  const out = new Map<string, string>();
  for (const n of names) {
    const s = surnameOf(n);
    const second = n.trim().split(/\s+/)[1];
    out.set(
      n,
      (people.get(s)?.size ?? 0) > 1 && second ? `${s} ${second[0]}.` : s,
    );
  }
  return out;
}

/** The sheet's lines in order, before cutting into sheets. */
export function s13Lines(
  data: S13Data,
  words: { group: string; campaign: string },
): S13Line[] {
  const all = data.territories.flatMap((t) => t.assignments.map((a) => a.holderName));
  const label = surnames(all);
  const sorted = [...data.territories].sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' }),
  );
  const lines: S13Line[] = [];
  for (const t of sorted) {
    const cells: S13Cell[] = t.assignments.map((a) => {
      let name = label.get(a.holderName) ?? surnameOf(a.holderName);
      if (a.method === 'campaign') name = `${name} (${words.campaign})`;
      if (a.forGroupName) name = `${shortGroup(a.forGroupName, words.group)} · ${name}`;
      return {
        name,
        received: shortDay(a.assignedOn),
        worked: shortDay(a.completedOn),
      };
    });
    const chunks: S13Cell[][] = [];
    for (let i = 0; i < cells.length; i += CELLS_PER_LINE) {
      chunks.push(cells.slice(i, i + CELLS_PER_LINE));
    }
    if (chunks.length === 0) chunks.push([]);
    chunks.forEach((c, i) =>
      lines.push({
        number: t.number,
        last: i === 0 ? shortDay(t.lastCompletedBefore) : '',
        cells: c,
      }),
    );
  }
  return lines;
}

/** Lines cut into sheets of twenty. */
export function s13Sheets(lines: S13Line[]): S13Line[][] {
  const sheets: S13Line[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_SHEET) {
    sheets.push(lines.slice(i, i + LINES_PER_SHEET));
  }
  return sheets.length ? sheets : [[]];
}
