/**
 * The theme of a field-service meeting, and its running time (14 October
 * 2026).
 *
 * The theme is pasted from jw.org with the video's length at its end:
 * «Помогайте изучающим развить близкую дружбу с Иеговой. Обсуждение.
 * Длительность: 2:35». On every screen that tail read as a fact of its own,
 * unlabelled, and wrapped mid-sentence in the printed sheet. It is split off
 * here and shown quietly beside the place, with a clock — the text itself
 * stays as typed in the meeting window.
 *
 * Only a length at the very END is taken, written as minutes:seconds (or
 * hours:minutes:seconds), after one of the words jw.org uses. The Russian
 * word was seen in the live data; the German and English ones are the
 * words the site uses in those languages and are taken on trust.
 */
// One length, or two or more joined by «и» / «und» / «and» / a comma —
// «Обсуждение. Длительность: 1:10 и 3:39» (two videos, live data 14 October
// 2026); they are kept as written.
const T = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
const LENGTH = new RegExp(
  String.raw`(?:^|[\s.;,])(?:Длительность|Продолжительность|Dauer|Länge|Duration|Length)\s*:\s*(${T}(?:\s*(?:,|и|und|and|&|\+)\s*${T})*)\s*$`,
  'iu',
);

export function splitTopic(topic: string | null | undefined): { text: string | null; length: string | null } {
  const t = topic?.trim() ?? '';
  if (!t) return { text: null, length: null };
  const m = LENGTH.exec(t);
  if (!m) return { text: t, length: null };
  // Keep the sentence's own full stop; drop the separator before the word.
  const text = (t.slice(0, m.index) + (m[0][0] === '.' ? '.' : '')).trim().replace(/[;,]$/, '');
  return { text: text || null, length: m[1] };
}
