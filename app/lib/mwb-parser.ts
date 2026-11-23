/**
 * Parses a Meeting Workbook (MWB) EPUB into structured weekly programmes
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
  /**
   * The first paragraph uncut (23 November 2026): `notes` keep 120 characters,
   * the title the beginning of this cut at a word (shortNote).
   */
  text?: string;
  /** A student part's lesson and setting, from its whole text (studentPartOf). */
  lesson?: string | null;
  setting?: StudentSetting | null;
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
  /**
   * Headings of documents that hold a week's programme and whose dates could
   * not be read — so the week is NOT in `weeks`.
   *
   * Until 5 October 2026 such a week vanished without a word: the preview
   * simply listed one week fewer. The server's copy of this parser was taught
   * to say so in August, and by then nobody was calling it.
   */
  unreadWeeks: string[];
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
  // A file downloaded twice is «mwb_U_202701 (1).epub» (or «…-1.epub»): the
  // year used to fall back to this year, and a January workbook loaded into
  // the January just gone, in silence (found on the stand, 20 November 2026).
  const m = baseName(file).match(/(\d{4})\d{2}(?:\s*\(\d+\)|-\d+)?\.epub$/i);
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

  /**
   * The week that crosses into the new year, written out in full:
   * «28 ДЕКАБРЯ 2026 ГОДА — 3 ЯНВАРЯ 2027 ГОДА».
   *
   * Every other week is short — «21—27 ДЕКАБРЯ» — so this one matched nothing
   * and was dropped in silence: once a year the last week of December failed
   * to import and the schedule showed an empty week with no explanation.
   *
   * Years come from the TEXT, not from the file name: the publication says
   * where the week ends, and that beats arithmetic on a name.
   *
   * Kept 1:1 with server/src/mwb-import/mwb-parser.ts, where the same fault
   * lived. This copy is the one that actually runs; since 5 October 2026 it
   * is also the one that is checked — scripts/check-import-parsers.mjs.
   */
  let m = normalized.match(
    /^(\d+)\s+([А-Яа-яё]+)\s+(\d{4})\s*(?:года?|г\.?)?\s*-\s*(\d+)\s+([А-Яа-яё]+)\s+(\d{4})\s*(?:года?|г\.?)?$/iu,
  );
  if (m) {
    const [, sd, sm, sy, ed, em, ey] = m;
    const startMonth = MONTHS_RU[sm];
    const endMonth = MONTHS_RU[em];
    if (!startMonth || !endMonth) return null;
    return {
      start: formatISO(parseInt(sy, 10), startMonth, parseInt(sd, 10)),
      end: formatISO(parseInt(ey, 10), endMonth, parseInt(ed, 10)),
    };
  }

  m = normalized.match(
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

  /**
   * THE SONGS ARE PARAGRAPHS NOW (found 5 October 2026, on the January 2027
   * issue). In May 2026 each stood in a heading — «<h3>Песня N» — and only
   * headings were read here. Since the layout changed, a midweek meeting came
   * in with no opening song and prayer, no song in the middle and no song at
   * the end, for every week of the issue, and nothing said so.
   *
   * Both layouts are read: the heading branch below is as it was, and a
   * paragraph that BEGINS with «Песня N» is taken in exactly three places —
   *   - before the first section, with «молитва»: the opening song and prayer;
   *   - in «Христианская жизнь», standing alone: the song in the middle;
   *   - after the concluding comments, with «молитва»: the closing song.
   * Anywhere else a paragraph is the text of a part, and is left to it.
   */
  const SONG_AT_START = /^Песн[яи]\s*\d+/iu;
  const songParagraph = (text: string) => {
    if (!SONG_AT_START.test(text)) return;
    const lower = text.toLowerCase();
    const has = (key: string) => parts.some((p) => p.partKey === key);

    if (currentSection === 'intro') {
      if (!lower.includes('молитва') || has('midweek_opening_prayer')) return;
      const { min, raw } = extractDuration(text);
      parts.push({
        rawTitle: text,
        rawNumber: null,
        rawSection: currentSection,
        durationMin: min,
        durationRawText: raw,
        notes: [],
        partKey: 'midweek_opening_prayer',
        partOrder: 2,
        classifierConfidence: 'high',
      });
      return;
    }
    if (currentSection !== 'living_christians') return;

    const closing = parts.find((p) => p.partKey === 'midweek_closing_prayer');
    if (closing) {
      // «Заключительные слова (3 мин.)» + «Песня 164 и молитва»: one row, as
      // the opening is — the minutes are already held apart from the title.
      if (
        lower.includes('молитва') &&
        !/Песн[яи]\s*\d+/iu.test(closing.rawTitle ?? '')
      ) {
        const words = (closing.rawTitle ?? '')
          .replace(/\s*\(\s*\d+\s*мин\.?\s*\)\s*$/u, '')
          .trim();
        closing.rawTitle = words ? `${words} | ${text}` : text;
      }
      return;
    }
    if (/^Песн[яи]\s*\d+\s*$/iu.test(text) && !has('mid_song')) {
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
  };

  doc.querySelectorAll('h2, h3, p').forEach((el) => {
    const tag = tagOf(el);
    const text = textOf(el);

    if (tag === 'h2') {
      if (isSectionH2(text)) currentSection = detectSection(text);
      return;
    }

    if (tag === 'p') {
      songParagraph(text);
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
      // The same paragraphs uncut: a student part's lesson closes its text,
      // past the 120 characters a note keeps (23 November 2026).
      const whole: string[] = [];
      outer: for (const sib of siblings) {
        const ps = sib.querySelectorAll('p');
        for (let i = 0; i < ps.length; i++) {
          if (notes.length >= 3) break outer;
          let nt = textOf(ps[i]);
          if (!nt) continue;
          nt = nt.replace(/^\(\s*\d+\s*мин\.?\s*\)\s*/u, '').trim();
          if (nt) {
            notes.push(nt.slice(0, 120));
            whole.push(nt);
          }
        }
      }

      /**
       * A HEADING INSIDE A PART IS NOT A PART (5 October 2026). The week of
       * 18–24 January 2027 has a box inside part 7 with its own heading —
       * «Как успешно делать повторные посещения» — and it came in as a second
       * part of «Христианская жизнь», with no minutes, waiting for somebody
       * to be assigned to it.
       *
       * Every part of the three sections carries a number, and the concluding
       * comments carry their minutes. A heading with neither is the inside of
       * the part before it. One that has minutes is kept, numbered or not:
       * that is the cautious side to err on.
       */
      if (
        number === null &&
        durationMin === null &&
        (currentSection === 'treasures' ||
          currentSection === 'apply_yourself' ||
          currentSection === 'living_christians')
      ) {
        return;
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
        ...(whole[0] ? { text: whole[0] } : {}),
        partKey: cls.partKey,
        partOrder: cls.partOrder,
        ...studentPartOf(cls.partKey, whole),
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

// ---------- A student part's lesson and setting ----------

/**
 * WHAT A STUDENT PART IS GIVEN TO WORK ON (23 November 2026): the setting at
 * the start of its text, in capitals («ПРОПОВЕДЬ ПО ДОМАМ.»), the lesson for
 * the counsel at its end, in brackets («(lmd урок 2, пункт 3)»,
 * «(th урок 10)»). The title keeps only the first 120 characters, and on the
 * live programme 30 of 175 student parts had lost their lesson with the rest.
 * Kept the same as server/src/mwb-import/student-part.ts, which fills stored
 * titles by the same rules.
 */
export type StudentSetting = 'house' | 'informal' | 'public';

export function isStudentPart(partKey: string): boolean {
  return partKey === 'bible_reading' || /^apply_yourself_\d+$/.test(partKey);
}

/** The last bracketed reference to a lesson: «lmd урок 2, пункт 3». */
export function lessonOf(text: string | null | undefined): string | null {
  if (!text) return null;
  const all = [...text.matchAll(/\(((?:lmd|th)\s[^()]{1,60}?)\)/gu)];
  const last = all[all.length - 1]?.[1]?.replace(/\s+/g, ' ').trim();
  return last || null;
}

/** The setting, from the capitals the text begins with (after «Part: » in a title). */
export function settingOf(text: string | null | undefined): StudentSetting | null {
  if (!text) return null;
  // The text's own capitals first: an assignment may hold a colon of its own.
  const capsAt = (t: string) => /^\s*([A-ZА-ЯЁÄÖÜ][A-ZА-ЯЁÄÖÜ ,-]{2,60})\./u.exec(t)?.[1] ?? null;
  const caps = capsAt(text) ?? (text.includes(': ') ? capsAt(text.slice(text.indexOf(': ') + 2)) : null);
  if (!caps) return null;
  if (/ДОМАМ/u.test(caps)) return 'house';
  if (/НЕФОРМАЛЬН/u.test(caps)) return 'informal';
  if (/ОБЩЕСТВЕНН/u.test(caps)) return 'public';
  return null;
}

/** Both, for a student part; nothing for any other. */
function studentPartOf(partKey: string, whole: string[]): Pick<ParsedPart, 'lesson' | 'setting'> {
  if (!isStudentPart(partKey)) return {};
  return { lesson: lessonOf(whole.join(' ')), setting: settingOf(whole[0]) };
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

  const note = part.text ? shortNote(part.text) : part.notes?.[0];
  if (note) {
    title = `${title}: ${note}`;
  }

  return title || null;
}

/** How much of a part's text its title keeps — as the import always did. */
export const TITLE_NOTE_MAX = 120;

/**
 * A part's text as its title shows it (23 November 2026): whole when it is
 * short, else cut at a word, never inside a bracket, with «…». Before, it was
 * cut at 120 characters wherever they ended — «…(lmd ур». All of it is sent
 * beside the title (partText) and shown where the part is read.
 */
export function shortNote(text: string, max = TITLE_NOTE_MAX): string {
  const t = text.trim();
  // A few characters over: nothing gained by cutting them off.
  if (t.length <= max + SHORT_NOTE_SLACK) return t;
  const openBracket = (c: string) => {
    const open = c.lastIndexOf('(');
    return open > c.lastIndexOf(')') ? c.slice(0, open) : c;
  };
  let cut = openBracket(t.slice(0, max));
  // A word or a number that runs on past the cut goes whole.
  if (!/[\s.,;:!?)»]/u.test(t[cut.length] ?? ' ')) {
    const space = cut.lastIndexOf(' ');
    if (space > max / 2) cut = cut.slice(0, space);
  }
  return `${cut.replace(/[\s,;:—–-]+$/u, '')}…`;
}

/** How far past the limit a text may run and still be kept whole. */
export const SHORT_NOTE_SLACK = 15;

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
    unreadWeeks: [],
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
      if (week) {
        result.weeks.push(week);
      } else {
        // A document with the meeting's sections in it IS a week; the cover
        // and the contents page have none and are passed over in silence.
        let isWeek = false;
        doc.querySelectorAll('h2').forEach((el) => {
          if (isSectionH2(textOf(el))) isWeek = true;
        });
        if (isWeek) {
          result.unreadWeeks.push(
            textOf(doc.querySelector('h1')) || baseName(entryName),
          );
        }
      }
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
  /** The part's whole first paragraph (server partText, 23 November 2026). */
  partText?: string;
  /** Student parts only (the server refuses nothing else: it ignores them there). */
  lesson?: string | null;
  setting?: StudentSetting | null;
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
            // The part's whole text; its title keeps the beginning (shortNote).
            ...(p.text && !p.synthetic ? { partText: p.text } : {}),
            // A student part's, from its whole text; none for the others.
            ...(isStudentPart(p.partKey) ? { lesson: p.lesson ?? null, setting: p.setting ?? null } : {}),
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
