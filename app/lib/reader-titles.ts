import i18n from './i18n';

/**
 * THE PROGRAMME'S OWN WORDS, IN THE READER'S LANGUAGE (23 October 2026).
 *
 * A part's title is stored as the workbook printed it — in the congregation's
 * language. Most of it is the week's own text (the talk's theme, the Bible
 * passage) and stays as it is. But part of it is the workbook's fixed
 * furniture: «Песня 43 и молитва», «Чтение Библии», «Председатель». A brother
 * who reads the app in German saw «Песня 43 and prayer» in conduct mode and
 * «Председатель» in the journal (walk in German and English, 23 October).
 *
 * Here the fixed furniture is recognised — exactly, by the workbook's own
 * words — and said in the reader's language. Anything not recognised is the
 * week's own text and is returned untouched. Russian readers get the title
 * back as it is. Names were checked against the German and English workbooks
 * on wol.jw.org (November 2026 issue).
 */

/** The workbook's fixed names, as the Russian edition prints them. */
const FIXED: Record<string, string> = {
  'Чтение Библии': 'readerTitles.bibleReading',
  'Духовные жемчужины': 'readerTitles.spiritualGems',
  'Начинайте разговор': 'readerTitles.startingConversation',
  'Развивайте интерес': 'readerTitles.followingUp',
  'Подготавливайте учеников': 'readerTitles.makingDisciples',
  'Речь': 'readerTitles.talk',
  'Изучение Библии в собрании': 'readerTitles.cbs',
  'Чтец': 'readerTitles.reader',
  'Председатель': 'readerTitles.chairman',
  'Вступительная молитва': 'readerTitles.openingPrayer',
  'Заключительная молитва': 'readerTitles.closingPrayer',
  'Молитва': 'readerTitles.prayer',
  'Сокровища из Слова Бога': 'readerTitles.treasures',
};

const SONG = /^Песн[яи]\s*№?\s*(\d+)$/u;
const SONG_AND_PRAYER = /^Песн[яи]\s*№?\s*(\d+)\s+и\s+молитва$/u;
const OPENING_COMMENTS = /^Вступительные слова\s*\((\d+)\s*мин\.?\)$/u;
const CONCLUDING_COMMENTS = /^Заключительные слова\s*\((\d+)\s*мин\.?\)$/u;

function oneSegment(seg: string, lang: string): string {
  const s = seg.trim();
  let m = s.match(SONG_AND_PRAYER);
  if (m) return i18n.t('readerTitles.songAndPrayer', { lng: lang, n: m[1] });
  m = s.match(SONG);
  if (m) return i18n.t('readerTitles.song', { lng: lang, n: m[1] });
  m = s.match(OPENING_COMMENTS);
  if (m) return i18n.t('readerTitles.openingComments', { lng: lang, min: m[1] });
  m = s.match(CONCLUDING_COMMENTS);
  if (m) return i18n.t('readerTitles.concludingComments', { lng: lang, min: m[1] });
  const fixed = FIXED[s];
  if (fixed) return i18n.t(fixed, { lng: lang });
  return seg;
}

/**
 * The title as the reader should read it. «Речь: …» keeps its «…»; only the
 * workbook's fixed head is said in the reader's language.
 */
export function readerTitle(
  title: string | null | undefined,
  lang: string = i18n.language,
): string {
  if (!title) return title ?? '';
  const l = (lang || 'ru').slice(0, 2);
  if (l === 'ru') return title;
  const colon = title.indexOf(': ');
  if (colon > 0) {
    return oneSegment(title.slice(0, colon), l) + title.slice(colon);
  }
  return title
    .split(' | ')
    .map((seg) => oneSegment(seg, l))
    .join(' | ');
}

/** Same, for a value that may be absent: null stays null. */
export function readerTitleOrNull(
  title: string | null | undefined,
  lang?: string,
): string | null {
  return title ? readerTitle(title, lang) : null;
}
