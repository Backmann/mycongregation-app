/**
 * «Мои уведомления» — what is new, and under which day a message is read.
 *
 * Kept apart from the screen so that scripts/check-inbox.mjs can hold it: a
 * dot that will not go out, or one that never lights, are both silent.
 */
export interface InboxMoment {
  /** ISO time the message was said. */
  at: string;
}

/**
 * Whether anything in the list was said after the person last opened it.
 * The list arrives newest first; never opened means everything is new.
 */
export function hasUnread(
  items: InboxMoment[],
  seenAt: string | null | undefined,
): boolean {
  if (items.length === 0) return false;
  if (!seenAt) return true;
  const seen = new Date(seenAt).getTime();
  return items.some((i) => new Date(i.at).getTime() > seen);
}

export function isUnread(
  item: InboxMoment,
  seenAt: string | null | undefined,
): boolean {
  return !seenAt || new Date(item.at).getTime() > new Date(seenAt).getTime();
}

/**
 * Which day a message belongs under, by the reader's own calendar: 0 today,
 * 1 yesterday, and so on. Midnight is theirs, not UTC's — a reminder sent at
 * 23:30 yesterday is «вчера» at 00:10.
 */
export function daysAgo(at: string, now: Date = new Date()): number {
  const d = new Date(at);
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.max(0, Math.round((startOf(now) - startOf(d)) / 86400000));
}
