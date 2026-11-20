import i18n from './i18n';

/**
 * The name to show for an event (programme audit, 20 November 2026).
 *
 * The form fills an event's title with its kind's name, in the language of
 * whoever made it. Shown as typed, a German reader saw a Russian name, and a
 * banner said the same words twice — title, then kind. A title that is,
 * letter case aside, its kind's name in any of the app's languages is the
 * form's: the reader gets the kind in their own language. Any other title is
 * the person's words and is shown as written.
 */
export function eventDisplayTitle(e: { title: string; type?: string | null }): {
  title: string;
  isKindName: boolean;
} {
  const typed = (e.title ?? '').trim();
  if (!e.type) return { title: typed, isKindName: false };
  const key = `specialEvents.types.${e.type}`;
  const names = ['ru', 'en', 'de']
    .map((lng) => i18n.getResource(lng, 'translation', key))
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().toLowerCase());
  if (typed && !names.includes(typed.toLowerCase()))
    return { title: typed, isKindName: false };
  return { title: i18n.t(key, { defaultValue: typed }), isKindName: true };
}
