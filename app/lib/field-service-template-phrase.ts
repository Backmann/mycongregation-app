/**
 * A template rule in one phrase (October 2026): «Каждую субботу, 10:30»,
 * «1-ю и 3-ю субботу, 10:00», «Последнюю субботу, 09:00».
 *
 * Russian declines the weekday and its ordinals by gender (субботу — 1-ю,
 * понедельник — 1-й, воскресенье — 1-е); German and English do not. The
 * forms live in the locale files under fieldService.template.phrase; this
 * only puts them together. Pure: no React.
 */

export type Say = (key: string, options?: Record<string, unknown>) => string;

export interface PhraseSlot {
  ordinals?: number[];
  ordinal?: number;
  lastOnly?: boolean;
  dayOfWeek: number;
  startTime: string;
}

const EVERY = [1, 2, 3, 4, 5];

export function slotWhenPhrase(slot: PhraseSlot, say: Say): string {
  const ordinals = [
    ...new Set(
      slot.ordinals && slot.ordinals.length
        ? slot.ordinals
        : slot.ordinal
          ? [slot.ordinal]
          : [],
    ),
  ].sort();
  const d = slot.dayOfWeek;
  const every = EVERY.every((n) => ordinals.includes(n));
  let when: string;
  if (every) {
    when = say(`fieldService.template.phrase.every.${d}`);
  } else if (ordinals.length === 0 && slot.lastOnly) {
    when = say(`fieldService.template.phrase.last.${d}`);
  } else {
    const gender = say(`fieldService.template.phrase.gender.${d}`);
    const parts = ordinals.map((n) =>
      say(`fieldService.template.phrase.ordinal.${gender}.${n}`),
    );
    if (slot.lastOnly) parts.push(say('fieldService.template.phrase.lastWord'));
    const list =
      parts.length <= 1
        ? (parts[0] ?? '')
        : `${parts.slice(0, -1).join(', ')} ${say('fieldService.template.phrase.and')} ${parts[parts.length - 1]}`;
    when = say(`fieldService.template.phrase.nth.${d}`, { list });
  }
  return `${when}, ${slot.startTime}`;
}
