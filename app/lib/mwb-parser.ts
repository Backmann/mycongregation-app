/**
 * Parses a JW Meeting Workbook (MWB) EPUB into structured weekly programmes
 * **entirely on the client** (browser). The publication file never leaves
 * the admin's device — only derived schedule metadata (part keys, titles,
 * durations) is sent to the API via POST /schedule-import/apply.
 *
 * Port of server/src/mwb-import/mwb-parser.ts (cheerio → DOMParser,
 * adm-zip → jszip). Selector logic is kept 1:1 with the battle-tested
 * server implementation.
 *
 * Requires a DOM environment (web build / PWA). Native platforms should
 * gate on `isClientParsingSupported()`.
 */

import JSZip from 'jszip';

// ---------- Types (mirror of server mwb-parser) ----------

export interface ParsedPart {
  rawTitle: string | null;
  rawNumber: number | null;
  rawSection: string;
  durationMin: number | null;
  durationRawText: string | null;
  notes: string[];
  partKey: string;
  partOrder: number;
  classifierConfidence: 'high' | 'medium' | 'low' | 'synthetic' | 'unknown';
  synthetic?: boolean;
}

export interface ParsedWeek {
  fileName: string;
  weekStartDate: string;
  weekEndDate: string;
  weekRangeText: string;
  biblePassage: string;
  parts: ParsedPart[];
}

export interface ParsedWorkbook {
  epubFile: string;
  year: number;
  weeks: ParsedWeek[];
  errors: string[];
}

// ---------- Russian month names ----------

const MONTHS_RU: Record<string, number> = {};
const monthList = [
  ['январь', 'января'],
  ['февраль', 'февраля'],
  ['март', 'марта'],
  ['апрель', 'апреля'],
  ['май', 'мая'],
  ['июнь', 'июня'],
  ['июль', 'июля'],
  ['август', 'августа'],
  ['сентябрь', 'сентября'],
  ['октябрь', 'октября'],
  ['ноябрь', 'ноября'],
  ['декабрь', 'декабря'],
];
monthList.forEach((forms, i) => {
  forms.forEach((f) => {
    [f, f.toLowerCase(), f.toUpperCase()].forEach((variant) => {
      MONTHS_RU[variant] = i + 1;
    });
  });
});

// ---------- Helpers ----------

function baseName(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

export function extractYearFromFilename(file: string): number {
  const m = baseName(file).match(/(\d{4})\d{2}\.epub$/i);
  return m ? parseInt(m[1], 10) : new Date().getFullYear();
}

function formatISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseWeekRange(
  text: string,
  year: number,
): { start: string; end: string } | null {
  const normalized = text
    .replace(/[—–\u2014\u2013\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  let m = normalized.match(
    /^(\d+)\s+([А-Яа-яё]+)\s*-\s*(\d+)\s+([А-Яа-яё]+)$/u,
  );
  if (m) {
    const [, sd, sm, ed, em] = m;
    const startMonth = MONTHS_RU[sm];
    const endMonth = MONTHS_RU[em];
    if (!startMonth || !endMonth) return null;
    const endYear = startMonth === 12 && endMonth === 1 ? year + 1 : year;
    return {
      start: formatISO(year, startMonth, parseInt(sd, 10)),
      end: formatISO(endYear, endMonth, parseInt(ed, 10)),
    };
  }

  m = normalized.match(/^(\d+)\s*-\s*(\d+)\s+([А-Яа-яё]+)$/u);
  if (m) {
    const [, sd, ed, mn] = m;
    const month = MONTHS_RU[mn];
    if (!month) return null;
    return {
      start: formatISO(year, month, parseInt(sd, 10)),
      end: formatISO(year, month, parseInt(ed, 10)),
    };
  }

  return null;
}

export function extractDuration(text: string): {
  min: number | null;
  raw: string | null;
} {
  const m = text.match(/\(\s*(\d+)\s*мин/u);
  if (m) return { min: parseInt(m[1], 10), raw: m[0] };
  const m2 = text.match(/(\d+)\s*мин/u);
  if (m2) return { min: parseInt(m2[1], 10), raw: m2[0] };
  return { min: null, raw: null };
}

export function extractNumber(text: string): number | null {
  const m = text.match(/^\s*(\d+)\.\s+/);
  return m ? parseInt(m[1], 10) : null;
}

function isSectionH2(text: string): boolean {
  const u = text.toUpperCase();
  return (
    u.includes('СОКРОВИЩА') ||
    u.includes('ОТТАЧИВАЕМ') ||
    u.includes('НАВЫКИ') ||
    u.includes('ХРИСТИАНСКАЯ')
  );
}

function detectSection(h2Text: string): string {
  const u = h2Text.toUpperCase();
  if (u.includes('СОКРОВИЩА')) return 'treasures';
  if (u.includes('ОТТАЧИВАЕМ') || u.includes('НАВЫКИ')) return 'apply_yourself';
  if (u.includes('ХРИСТИАНСКАЯ')) return 'living_christians';
  return 'intro';
}

// ---------- Classifier (identical to server) ----------

interface SectionCounters {
  treasures: number;
  apply_yourself: number;
  living_christians: number;
}

interface ClassifyResult {
  partKey: string;
  partOrder: number;
  confidence: ParsedPart['classifierConfidence'];
}

function classify(
  rawTitle: string,
  _rawNumber: number | null,
  section: string,
  durationMin: number | null,
  counters: SectionCounters,
): ClassifyResult {
  const lower = rawTitle.toLowerCase();

  if (section === 'intro') {
    if (lower.includes('молитва') || lower.includes('вступит')) {
      return {
        partKey: 'midweek_opening_prayer',
        partOrder: 2,
        confidence: 'high',
      };
    }
    return { partKey: 'unknown', partOrder: 0, confidence: 'unknown' };
  }

  if (section === 'treasures') {
    const pos = counters.treasures++;
    if (lower.includes('духовные жемчужины')) {
      return { partKey: 'spiritual_gems', partOrder: 4, confidence: 'high' };
    }
    if (lower.includes('чтение библии')) {
      return { partKey: 'bible_reading', partOrder: 5, confidence: 'high' };
    }
    if (pos === 0) {
      return { partKey: 'treasures_talk', partOrder: 3, confidence: 'high' };
    }
    if (pos === 1) {
      return { partKey: 'spiritual_gems', partOrder: 4, confidence: 'medium' };
    }
    if (pos === 2) {
      return { partKey: 'bible_reading', partOrder: 5, confidence: 'medium' };
    }
    return { partKey: 'unknown', partOrder: 0, confidence: 'unknown' };
  }

  if (section === 'apply_yourself') {
    const pos = counters.apply_yourself++;
    if (pos >= 0 && pos < 4) {
      return {
        partKey: `apply_yourself_${pos + 1}`,
        partOrder: 6 + pos,
        confidence: 'high',
      };
    }
    return { partKey: 'unknown', partOrder: 0, confidence: 'unknown' };
  }

  if (section === 'living_christians') {
    if (
      (lower.includes('изучение библии') &&
        (lower.includes('собрании') || lower.includes('собрание'))) ||
      (durationMin === 30 && !lower.includes('молитва'))
    ) {
      return { partKey: 'cbs_conductor', partOrder: 13, confidence: 'high' };
    }
    if (lower.includes('заключит') || lower.includes('молитва')) {
      return {
        partKey: 'midweek_closing_prayer',
        partOrder: 15,
        confidence: 'high',
      };
    }
    const pos = counters.living_christians++;
    if (pos >= 0 && pos < 3) {
      return {
        partKey: `living_christians_${pos + 1}`,
        partOrder: 10 + pos,
        confidence: 'high',
      };
    }
    return { partKey: 'unknown', partOrder: 0, confidence: 'unknown' };
  }

  return { partKey: 'unknown', partOrder: 0, confidence: 'unknown' };
}

// ---------- DOM helpers (cheerio replacements) ----------

function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function tagOf(el: Element): string {
  return (el.localName || el.tagName || '').toLowerCase();
}

/** Siblings after `el` until the next h2/h3 (exclusive) — cheerio .nextUntil('h3, h2'). */
function siblingsUntilHeading(el: Element): Element[] {
  const out: Element[] = [];
  let n = el.nextElementSibling;
  while (n) {
    const t = tagOf(n);
    if (t === 'h2' || t === 'h3') break;
    out.push(n);
    n = n.nextElementSibling;
  }
  return out;
}

// ---------- Per-file parser ----------

function parseWeeklyDocument(
  fileName: string,
  doc: Document,
  year: number,
): ParsedWeek | null {
  const h1Text = textOf(doc.querySelector('h1'));
  const range = parseWeekRange(h1Text, year);

  if (!range) return null;

  let biblePassage = '';
  doc.querySelectorAll('h2').forEach((el) => {
    const t = textOf(el);
    if (!isSectionH2(t) && !biblePassage) biblePassage = t;
  });

  const parts: ParsedPart[] = [];
  let currentSection = 'intro';
  const counters: SectionCounters = {
    treasures: 0,
    apply_yourself: 0,
    living_christians: 0,
  };

  doc.querySelectorAll('h2, h3').forEach((el) => {
    const tag = tagOf(el);
    const text = textOf(el);

    if (tag === 'h2') {
      if (isSectionH2(text)) currentSection = detectSection(text);
      return;
    }

    if (tag === 'h3') {
      if (/^Песн[яи]?\s*\d+\s*$/iu.test(text)) {
        if (
          currentSection === 'living_christians' &&
          !parts.some((p) => p.partKey === 'mid_song')
        ) {
          parts.push({
            rawTitle: text,
            rawNumber: null,
            rawSection: currentSection,
            durationMin: null,
            durationRawText: null,
            notes: [],
            partKey: 'mid_song',
            partOrder: 9,
            classifierConfidence: 'high',
          });
        }
        return;
      }

      const number = extractNumber(text);
      let { min: durationMin, raw: durationRawText } = extractDuration(text);

      const siblings = siblingsUntilHeading(el);

      if (durationMin === null) {
        for (const n of siblings) {
          const d = extractDuration(textOf(n));
          if (d.min !== null) {
            durationMin = d.min;
            durationRawText = d.raw;
            break;
          }
        }
      }

      // Collect <p> descendants of sibling containers after this h3,
      // until the next h2/h3 (first 3, identical to server). Strip the
      // leading "(N мин.)" marker — duration is captured separately.
      const notes: string[] = [];
      outer: for (const sib of siblings) {
        const ps = sib.querySelectorAll('p');
        for (let i = 0; i < ps.length; i++) {
          if (notes.length >= 3) break outer;
          let nt = textOf(ps[i]);
          if (!nt) continue;
          nt = nt.replace(/^\(\s*\d+\s*мин\.?\s*\)\s*/u, '').trim();
          if (nt) {
            notes.push(nt.slice(0, 120));
          }
        }
      }

      const cls = classify(
        text,
        number,
        currentSection,
        durationMin,
        counters,
      );

      parts.push({
        rawTitle: text,
        rawNumber: number,
        rawSection: currentSection,
        durationMin,
        durationRawText,
        notes,
        partKey: cls.partKey,
        partOrder: cls.partOrder,
        classifierConfidence: cls.confidence,
      });
    }
  });

  // Synthetic chairman (always)
  parts.unshift({
    rawTitle: null,
    rawNumber: null,
    rawSection: 'synthetic',
    durationMin: null,
    durationRawText: null,
    notes: [],
    partKey: 'midweek_chairman',
    partOrder: 1,
    classifierConfidence: 'synthetic',
    synthetic: true,
  });

  // Synthetic CBS reader (only if conductor was detected)
  const hasCbs = parts.some((p) => p.partKey === 'cbs_conductor');
  if (hasCbs) {
    parts.push({
      rawTitle: null,
      rawNumber: null,
      rawSection: 'synthetic',
      durationMin: null,
      durationRawText: null,
      notes: [],
      partKey: 'cbs_reader',
      partOrder: 14,
      classifierConfidence: 'synthetic',
      synthetic: true,
    });
  }

  parts.sort((a, b) => a.partOrder - b.partOrder);

  return {
    fileName,
    weekStartDate: range.start,
    weekEndDate: range.end,
    weekRangeText: h1Text,
    biblePassage,
    parts,
  };
}

// ---------- Public API ----------

/**
 * Strips numeric prefix and trailing duration to get a clean title for
 * storage, then enriches with the first content note. Identical to server.
 */
export function extractPartTitle(part: ParsedPart): string | null {
  if (part.synthetic) return null;
  if (!part.rawTitle) return null;
  let title = part.rawTitle.trim();
  title = title.replace(/^\d+\.\s*/, '');
  title = title.replace(/\s*\(\s*\d+\s*мин\.?\s*\)\s*$/u, '').trim();

  if (part.notes && part.notes.length > 0 && part.notes[0]) {
    title = `${title}: ${part.notes[0]}`;
  }

  return title || null;
}

/** True when the runtime can parse EPUBs locally (web build). */
export function isClientParsingSupported(): boolean {
  return typeof DOMParser !== 'undefined';
}

function parseXhtml(content: string): Document {
  const parser = new DOMParser();
  let doc = parser.parseFromString(content, 'application/xhtml+xml');
  // Some environments surface XML errors as a <parsererror> document.
  if (doc.getElementsByTagName('parsererror').length > 0) {
    doc = parser.parseFromString(content, 'text/html');
  }
  return doc;
}

/**
 * Parse an MWB EPUB entirely in the browser.
 * @param data     EPUB contents (Blob from the file picker or ArrayBuffer)
 * @param year     year hint; extracted from fileName when omitted
 * @param fileName used for the year hint and diagnostics
 */
export async function parseMwbFile(
  data: Blob | ArrayBuffer | Uint8Array,
  year?: number,
  fileName?: string,
): Promise<ParsedWorkbook> {
  const name = fileName ? baseName(fileName) : 'mwb.epub';
  const resolvedYear =
    year ?? (fileName ? extractYearFromFilename(fileName) : new Date().getFullYear());

  const zip = await JSZip.loadAsync(data);

  const result: ParsedWorkbook = {
    epubFile: name,
    year: resolvedYear,
    weeks: [],
    errors: [],
  };

  const weeklyNames = Object.keys(zip.files)
    .filter((entryName) => {
      const f = zip.files[entryName];
      if (f.dir) return false;
      return /^\d+\.xhtml$/i.test(baseName(entryName));
    })
    .sort();

  for (const entryName of weeklyNames) {
    try {
      const content = await zip.files[entryName].async('string');
      const doc = parseXhtml(content);
      const week = parseWeeklyDocument(entryName, doc, resolvedYear);
      if (week) result.weeks.push(week);
    } catch (err: any) {
      result.errors.push(`${entryName}: ${err?.message ?? String(err)}`);
    }
  }

  result.weeks.sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));

  return result;
}

// ---------- Apply-payload mapping ----------

export interface ApplyParsedPartPayload {
  partKey: string;
  partOrder: number;
  partTitle: string | null;
  partDurationMin: number | null;
}

export interface ApplyParsedWeekPayload {
  weekStartDate: string;
  weekEndDate: string;
  biblePassage: string;
  parts: ApplyParsedPartPayload[];
}

export interface ApplyParsedPayload {
  epubFile: string;
  year: number;
  weeks: ApplyParsedWeekPayload[];
}

/**
 * Maps a parsed workbook to the POST /schedule-import/apply payload.
 * Unclassified parts are dropped here (the server skips them too) — they
 * are surfaced to the admin in the preview instead.
 */
export function toApplyPayload(wb: ParsedWorkbook): ApplyParsedPayload {
  return {
    epubFile: wb.epubFile,
    year: wb.year,
    weeks: wb.weeks.map((w) => ({
      weekStartDate: w.weekStartDate,
      weekEndDate: w.weekEndDate,
      biblePassage: w.biblePassage,
      parts: w.parts
        .filter((p) => p.partKey !== 'unknown')
        .map((p) => {
          const title = extractPartTitle(p);
          return {
            partKey: p.partKey,
            partOrder: p.partOrder,
            // trim: notes[0].slice(0,120) может оставить хвостовой пробел
            partTitle: title ? title.trim() : null,
            partDurationMin: p.durationMin ?? null,
          };
        }),
    })),
  };
}

/** Unclassified parts for the preview warning list. */
export function collectUnclassified(
  wb: ParsedWorkbook,
): { weekStartDate: string; rawTitle: string }[] {
  const out: { weekStartDate: string; rawTitle: string }[] = [];
  for (const w of wb.weeks) {
    for (const p of w.parts) {
      if (p.partKey === 'unknown' && p.rawTitle) {
        out.push({ weekStartDate: w.weekStartDate, rawTitle: p.rawTitle });
      }
    }
  }
  return out;
}
