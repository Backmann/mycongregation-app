/**
 * Group names are free text. Congregations often name a group «Группа 2»,
 * and the sentences around it already say «группа», which gave
 * «Ваша группа Группа 2» on Home (review, 18 November 2026). Inside such a
 * sentence the leading word is dropped; a name that is only the word stays.
 */
const GROUP_WORD = /^\s*(группа|group|gruppe)\s+(?=\S)/i;

export function groupInSentence(name: string): string {
  return name.replace(GROUP_WORD, '');
}
