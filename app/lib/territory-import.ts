import JSZip from 'jszip';

/**
 * Bringing the territories over from the congregation's earlier records
 * (11 November 2026): the map export of the old territory tool (GeoJSON), the
 * congregation's own S-13 spreadsheet (.xlsx) and the boundary (KML).
 *
 * Everything here runs on the territory servant's own computer. The files
 * name people and addresses; what leaves the computer is only what he
 * confirms on the reconciliation screen, in the shape the server keeps.
 *
 * The XML is read with plain patterns rather than a DOM, so the same code is
 * checked by the gate in Node (scripts/check-territory-import.mjs).
 */

export interface Geometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown;
}

/** One assignment line as a source gives it. */
export interface SourceLine {
  number: string;
  assignedOn: string;
  endedOn: string | null;
  /** A name (S-13) or an anonymous key (the map export). */
  holder: string;
}

export interface MapExport {
  territories: {
    number: string;
    locality: string | null;
    geometry: Geometry;
    lastCompletedOn: string | null;
    comment: string | null;
  }[];
  lines: SourceLine[];
}

export interface Boundary {
  geometry: Geometry;
  description: { north?: string; east?: string; south?: string; west?: string };
  validFrom: string | null;
}

const day = (s: unknown): string | null =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;

/** The territory number as it is compared: no spaces, any case. */
export const numberKey = (n: string): string => n.replace(/\s+/g, '').toLowerCase();

// ------------------------------------------------------------- map export --

/**
 * The old tool's GeoJSON export: one feature per territory, its assignment
 * history inside (`processes`), holders by an anonymous key only.
 */
export function readMapExport(text: string): MapExport {
  const json = JSON.parse(text) as { features?: unknown[] };
  if (!Array.isArray(json.features)) throw new Error('not a GeoJSON FeatureCollection');
  const territories: MapExport['territories'] = [];
  const lines: SourceLine[] = [];
  for (const f of json.features as {
    geometry?: Geometry;
    properties?: Record<string, unknown>;
  }[]) {
    const p = f.properties ?? {};
    const number = String(p.name ?? '').trim();
    if (!number || !f.geometry) continue;
    const comment = typeof p.comment === 'string' && p.comment.trim() ? p.comment.trim() : null;
    territories.push({
      number,
      locality: typeof p.location === 'string' && p.location.trim() ? p.location.trim() : null,
      geometry: f.geometry,
      lastCompletedOn: day(p.last_process_end),
      comment,
    });
    const processes = Array.isArray(p.processes) ? p.processes : [];
    for (const x of processes as Record<string, unknown>[]) {
      const start = day(x.start);
      if (!start) continue;
      const who = x.publisher_id as { id?: unknown } | null | undefined;
      lines.push({
        number,
        assignedOn: start,
        endedOn: day(x.end),
        holder: who && who.id != null ? `#${String(who.id)}` : '#?',
      });
    }
  }
  return { territories, lines };
}

// ------------------------------------------------------------------- KML --

const cdata = (s: string): string => s.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();

/** The congregation's boundary: the first polygon, and the words beside it. */
export function readBoundaryKml(text: string): Boundary {
  const coords = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(text);
  if (!coords) throw new Error('no coordinates in the KML');
  const ring = coords[1]
    .trim()
    .split(/\s+/)
    .map((c) => c.split(',').slice(0, 2).map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  const data: Record<string, string> = {};
  for (const m of text.matchAll(/<Data name="([^"]+)">\s*<value>([\s\S]*?)<\/value>\s*<\/Data>/g)) {
    data[m[1]] = cdata(m[2]);
  }
  const description: Boundary['description'] = {};
  if (data.BorderNorth) description.north = data.BorderNorth;
  if (data.BorderEast) description.east = data.BorderEast;
  if (data.BorderSouth) description.south = data.BorderSouth;
  if (data.BorderWest) description.west = data.BorderWest;
  return {
    geometry: { type: 'Polygon', coordinates: [ring] },
    description,
    validFrom: day(data.LastUpdatedIso),
  };
}

// --------------------------------------------------------------- S-13 xlsx --

const unescapeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Excel's day count (from 30 December 1899) as 'YYYY-MM-DD'. */
export function excelDay(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return d.toISOString().slice(0, 10);
}

/** 'A1' → [row 1, column 0]. */
function cellAt(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return [Number(m[2]), col - 1];
}

/** A sheet as rows of cell values: text, a number, or null. */
export function readSheetXml(xml: string, shared: string[]): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  for (const c of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [r, col] = cellAt(c[1]);
    const attrs = c[2];
    const inner = c[3] ?? '';
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    let value: string | number | null = null;
    if (/t="s"/.test(attrs) && v != null) value = shared[Number(v)] ?? null;
    else if (/t="inlineStr"/.test(attrs)) {
      value = unescapeXml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
    } else if (/t="str"/.test(attrs) && v != null) value = unescapeXml(v);
    else if (v != null && v !== '') value = Number(v);
    (rows[r - 1] ??= [])[col] = value;
  }
  return rows.map((r) => r ?? []);
}

export function readSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
    unescapeXml([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  );
}

const asDay = (v: string | number | null | undefined): string | null => {
  if (typeof v === 'number' && v > 20000 && v < 80000) return excelDay(v);
  if (typeof v === 'string') {
    const iso = day(v);
    if (iso) return iso;
    const de = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(v.trim());
    if (de) {
      const y = de[3].length === 2 ? `20${de[3]}` : de[3];
      return `${y}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}`;
    }
  }
  return null;
};

/**
 * The S-13 laid out as the form is: a territory takes two rows — its number,
 * its last-worked date and the holders' names in pairs of columns, then the
 * dates given and worked under each name. Every sheet is read; a sheet whose
 * rows are not in that shape gives nothing.
 */
export function readS13Rows(rows: (string | number | null)[][]): SourceLine[] {
  const out: SourceLine[] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const top = rows[i];
    const under = rows[i + 1];
    const number = typeof top[0] === 'string' ? top[0].trim() : null;
    if (!number || under[0] != null) continue;
    // A header row has no dates under its names.
    for (let c = 2; c < Math.max(top.length, under.length); c += 2) {
      const name = typeof top[c] === 'string' ? (top[c] as string).trim() : '';
      const given = asDay(under[c]);
      if (!name || !given) continue;
      out.push({ number, assignedOn: given, endedOn: asDay(under[c + 1]), holder: name });
    }
    i++;
  }
  return out;
}

export async function readS13Xlsx(data: ArrayBuffer | Uint8Array): Promise<SourceLine[]> {
  const zip = await JSZip.loadAsync(data);
  const sharedFile = zip.file('xl/sharedStrings.xml');
  const shared = sharedFile ? readSharedStrings(await sharedFile.async('string')) : [];
  const sheets = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const all: SourceLine[] = [];
  for (const name of sheets) {
    all.push(...readS13Rows(readSheetXml(await zip.file(name)!.async('string'), shared)));
  }
  // The same line on several sheets (a summary sheet and a year's sheet).
  const seen = new Set<string>();
  return all.filter((l) => {
    const k = `${numberKey(l.number)}|${l.assignedOn}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ------------------------------------------------------------ reconciling --

/**
 * The spreadsheet may spell a territory differently from the map export
 * («Drensteinfurt1» and «Drenst1», «Walstedde» and «Walstede»). A number with
 * no exact match is paired with the one map number that has the same number
 * at its end and letters alike, if exactly one does.
 */
export function pairNumbers(sheet: string[], map: string[]): Map<string, string> {
  const exact = new Map(map.map((n) => [numberKey(n), n]));
  const out = new Map<string, string>();
  const stem = (k: string) => {
    const m = /^(.*?)(\d*)$/.exec(k)!;
    return { letters: m[1].replace(/[^a-zäöüß]/g, ''), digits: m[2] === '' ? -1 : Number(m[2]) };
  };
  for (const s of new Set(sheet)) {
    const k = numberKey(s);
    const hit = exact.get(k);
    if (hit) {
      out.set(s, hit);
      continue;
    }
    const a = stem(k);
    const candidates = map.filter((m) => {
      const b = stem(numberKey(m));
      return a.digits === b.digits && lettersAlike(a.letters, b.letters);
    });
    if (candidates.length === 1) out.set(s, candidates[0]);
  }
  return out;
}

/**
 * The same place written two ways: one cut short from the other
 * («drenst», «drensteinfurt»), or two letters apart («walstede»,
 * «walstedde»). Four letters at least, so short codes are never guessed.
 */
function lettersAlike(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return editDistance(a, b) <= 2;
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export interface ReconciledLine {
  number: string;
  assignedOn: string;
  completedOn: string | null;
  /** The holder's name, or null when no source names him. */
  name: string | null;
  /** The two sources disagree on the end date; the map export's is kept. */
  disagrees: boolean;
}

/**
 * The map export's lines (the fresher dates) with names from the S-13.
 * A line is matched by territory and the day it was given. An anonymous
 * holder named on any matched line is named on all of his lines.
 */
export function reconcile(
  mapLines: SourceLine[],
  sheetLines: SourceLine[],
  pairs: Map<string, string>,
): ReconciledLine[] {
  const byKey = new Map<string, SourceLine>();
  for (const s of sheetLines) {
    const n = pairs.get(s.number);
    if (n) byKey.set(`${numberKey(n)}|${s.assignedOn}`, s);
  }
  const nameOfKey = new Map<string, string>();
  for (const m of mapLines) {
    const s = byKey.get(`${numberKey(m.number)}|${m.assignedOn}`);
    if (s && !nameOfKey.has(m.holder)) nameOfKey.set(m.holder, s.holder);
  }
  return mapLines.map((m) => {
    const s = byKey.get(`${numberKey(m.number)}|${m.assignedOn}`);
    return {
      number: m.number,
      assignedOn: m.assignedOn,
      completedOn: m.endedOn,
      name: s?.holder ?? nameOfKey.get(m.holder) ?? null,
      disagrees: !!s && s.endedOn !== m.endedOn,
    };
  });
}

// ---------------------------------------------------------- names to cards --

const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'ju', я: 'ja', і: 'i', ї: 'i', є: 'e', ґ: 'g',
};

/** A name as comparable words: Latin letters, no accents, no case. */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[а-яёіїєґ]/g, (ch) => LATIN[ch] ?? ch)
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[^a-z\s-]/g, '')
    // Spellings that differ between transliterations: ks/x, ja/ya, ju/yu…
    .replace(/x/g, 'ks')
    .replace(/y/g, 'j')
    .replace(/w/g, 'v')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1);
}

const wordsMeet = (a: string, b: string): boolean =>
  a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) && b.startsWith(a.slice(0, 4))));

/**
 * The card a written name most likely is: every word of the shorter name met
 * in the other, and no other card does as well. Otherwise null — the
 * territory servant decides.
 */
export function guessCard<T extends { id: string; name: string }>(name: string, cards: T[]): T | null {
  const w = nameWords(name);
  if (w.length === 0) return null;
  const scored = cards
    .map((c) => {
      const cw = nameWords(c.name);
      const [short, long] = w.length <= cw.length ? [w, cw] : [cw, w];
      const met = short.filter((s) => long.some((l) => wordsMeet(s, l))).length;
      return { c, full: short.length > 0 && met === short.length && short.length >= Math.min(2, long.length) };
    })
    .filter((x) => x.full);
  return scored.length === 1 ? scored[0].c : null;
}
