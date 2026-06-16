/**
 * Parses a Watchtower study EPUB into structured weekly programmes
 * **entirely on the client** (browser). The publication file never leaves
 * the admin's device — only derived schedule metadata (part keys, titles,
 * durations) is sent to the API via POST /schedule-import/apply.
 *
 * Port of server/src/wt-import/wt-parser.ts (cheerio → DOMParser,
 * adm-zip → jszip). Selector logic is kept 1:1 with the battle-tested
 * server implementation.
 *
 * Requires a DOM environment (web build / PWA). Native platforms should
 * gate on `isClientParsingSupported()`.
 *
 * Watchtower study editions contain ~5 study articles per issue, one per
 * week. Each article maps to one weekend meeting with 8 parts.
 */

import JSZip from 'jszip';
import type { ParsedWorkbook } from './mwb-parser';

// ---------- Types (mirror of server wt-parser) ----------

export interface ParsedWtPart {
  partKey: string;
  partOrder: number;
  partTitle: string | null;
  durationMin: number | null;
  synthetic?: boolean;
}

export interface ParsedWtWeek {
  fileName: string;
  weekStartDate: string;
  weekEndDate: string;
  articleTitle: string;
  openingSong: number | null;
  closingSong: number | null;
  parts: ParsedWtPart[];
}

export interface ParsedWtIssue {
  epubFile: string;
  year: number;
  weeks: ParsedWtWeek[];
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

/** Days between two YYYY-MM-DD dates (end - start). */
export function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO + 'T00:00:00Z').getTime();
  const end = new Date(endISO + 'T00:00:00Z').getTime();
  return Math.round((end - start) / 86_400_000);
}

export function parseDateRange(
  text: string,
): { start: string; end: string; year: number } | null {
  const normalized = text
    .replace(/[—–\u2014\u2013\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // Cross-month: "29 ИЮНЯ - 5 ИЮЛЯ 2026"
  let m = normalized.match(
    /(\d+)\s+([А-Яа-яё]+)\s*-\s*(\d+)\s+([А-Яа-яё]+)\s+(\d{4})/u,
  );
  if (m) {
    const [, sd, sm, ed, em, yr] = m;
    const startMonth = MONTHS_RU[sm];
    const endMonth = MONTHS_RU[em];
    if (!startMonth || !endMonth) return null;
    const year = parseInt(yr, 10);
    const endYear = startMonth === 12 && endMonth === 1 ? year + 1 : year;
    return {
      start: formatISO(year, startMonth, parseInt(sd, 10)),
      end: formatISO(endYear, endMonth, parseInt(ed, 10)),
      year,
    };
  }

  // Same-month: "4-10 МАЯ 2026"
  m = normalized.match(/(\d+)\s*-\s*(\d+)\s+([А-Яа-яё]+)\s+(\d{4})/u);
  if (m) {
    const [, sd, ed, mn, yr] = m;
    const month = MONTHS_RU[mn];
    if (!month) return null;
    const year = parseInt(yr, 10);
    return {
      start: formatISO(year, month, parseInt(sd, 10)),
      end: formatISO(year, month, parseInt(ed, 10)),
      year,
    };
  }

  return null;
}

export function extractSongs(text: string): number[] {
  const matches = text.match(/ПЕСН[ЯИ]?\s+(\d+)/giu) ?? [];
  return matches
    .map((s) => parseInt(s.match(/\d+/)?.[0] ?? '0', 10))
    .filter((n) => n > 0);
}

// ---------- DOM helpers (cheerio replacements) ----------

function textOf(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

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

// ---------- Per-article parser ----------

function parseStudyArticle(
  fileName: string,
  doc: Document,
): ParsedWtWeek | null {
  const headerText = textOf(doc.querySelector('header'));
  if (!headerText) return null;

  // Guard 1: the <header> must mention a song. Cover/TOC pages never do.
  if (!/ПЕСН[ЯИ]?\s+\d+/iu.test(headerText)) return null;

  const range = parseDateRange(headerText);
  if (!range) return null;

  // Guard 2: range must be at most a week (7 days). Cover page advertises the
  // whole issue ("4 МАЯ — 7 ИЮНЯ 2026") which is ~35 days.
  const span = daysBetween(range.start, range.end);
  if (span < 0 || span > 7) return null;

  const articleTitle = textOf(doc.querySelector('h1'));
  if (!articleTitle) return null;

  const bodyText = doc.querySelector('body')?.textContent ?? '';
  const songNumbers = extractSongs(bodyText);
  const openingSong = songNumbers[0] ?? null;
  const closingSong =
    songNumbers.length > 1 ? songNumbers[songNumbers.length - 1] : null;

  const parts: ParsedWtPart[] = [
    {
      partKey: 'weekend_chairman',
      partOrder: 1,
      partTitle: null,
      durationMin: null,
      synthetic: true,
    },
    {
      // Opening song (chosen by the congregation; not in the article). Sung
      // after the chairman's opening comments, before the opening prayer.
      partKey: 'weekend_opening_song',
      partOrder: 2,
      partTitle: null,
      durationMin: null,
    },
    {
      partKey: 'weekend_opening_prayer',
      partOrder: 3,
      partTitle: null,
      durationMin: 1,
    },
    {
      partKey: 'public_talk_speaker',
      partOrder: 4,
      partTitle: null,
      durationMin: 30,
      synthetic: true,
    },
    {
      // Song sung right before the Watchtower study (the article's song).
      partKey: 'weekend_song',
      partOrder: 5,
      partTitle: openingSong !== null ? `Песня ${openingSong}` : null,
      durationMin: null,
    },
    {
      partKey: 'watchtower_conductor',
      partOrder: 6,
      partTitle: articleTitle,
      durationMin: 60,
    },
    {
      partKey: 'watchtower_reader',
      partOrder: 7,
      partTitle: null,
      durationMin: 60,
    },
    {
      partKey: 'weekend_closing_prayer',
      partOrder: 8,
      partTitle: closingSong !== null ? `Песня ${closingSong} и молитва` : null,
      durationMin: 1,
    },
  ];

  return {
    fileName,
    weekStartDate: range.start,
    weekEndDate: range.end,
    articleTitle,
    openingSong,
    closingSong,
    parts,
  };
}

// ---------- Public API ----------

/**
 * Parse a Watchtower EPUB entirely in the browser.
 * @param data     EPUB contents (Blob from the file picker or ArrayBuffer)
 * @param year     year hint; extracted from fileName when omitted
 * @param fileName used for the year hint and diagnostics
 */
export async function parseWtFile(
  data: Blob | ArrayBuffer | Uint8Array,
  year?: number,
  fileName?: string,
): Promise<ParsedWtIssue> {
  const name = fileName ? baseName(fileName) : 'wt.epub';
  const resolvedYear =
    year ??
    (fileName ? extractYearFromFilename(fileName) : new Date().getFullYear());

  const zip = await JSZip.loadAsync(data);

  const result: ParsedWtIssue = {
    epubFile: name,
    year: resolvedYear,
    weeks: [],
    errors: [],
  };

  const articleNames = Object.keys(zip.files)
    .filter((entryName) => {
      const f = zip.files[entryName];
      if (f.dir) return false;
      return /^\d+\.xhtml$/i.test(baseName(entryName));
    })
    .sort();

  for (const entryName of articleNames) {
    try {
      const content = await zip.files[entryName].async('string');
      const doc = parseXhtml(content);
      const week = parseStudyArticle(entryName, doc);
      if (week) result.weeks.push(week);
    } catch (err: any) {
      result.errors.push(`${entryName}: ${err?.message ?? String(err)}`);
    }
  }

  result.weeks.sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));

  return result;
}

// ---------- Apply-payload mapping ----------

/**
 * Adapt a parsed Watchtower issue into the MWB ParsedWorkbook shape so the
 * import screen can reuse the same preview and the same apply flow. For
 * Watchtower, the "bible passage" slot shows the study article title, and
 * the week range text is derived from the parsed dates.
 */
export function wtToWorkbook(issue: ParsedWtIssue): ParsedWorkbook {
  return {
    epubFile: issue.epubFile,
    year: issue.year,
    errors: issue.errors,
    weeks: issue.weeks.map((w) => ({
      fileName: w.fileName,
      weekStartDate: w.weekStartDate,
      weekEndDate: w.weekEndDate,
      weekRangeText: `${w.weekStartDate} — ${w.weekEndDate}`,
      biblePassage: w.articleTitle,
      parts: w.parts.map((p) => ({
        rawTitle: p.partTitle,
        rawNumber: null,
        rawSection: '',
        durationMin: p.durationMin,
        durationRawText: null,
        notes: [],
        partKey: p.partKey,
        partOrder: p.partOrder,
        classifierConfidence: p.synthetic
          ? ('synthetic' as const)
          : ('high' as const),
        synthetic: p.synthetic,
      })),
    })),
  };
}
