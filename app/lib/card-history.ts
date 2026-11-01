/**
 * Which of two cards of one person is the one to keep (1 November 2026): the
 * one with a history. A card still in use before one that has left; then the
 * one with more reports; then the older. The same rule offers the card to
 * keep in the elders' «possibly the same card» task and orders the merge
 * window, so the two never disagree.
 *
 * The very first merge on the live site went the other way round: the window
 * kept the card it was opened from — the new, empty one with the sign-in —
 * and the person merging had to work out that it should be swapped.
 */
export interface CardHistory {
  departed: boolean;
  reports: number;
  createdAt: string;
}

/** True when `a` has more history than `b` and should be the one kept. */
export function hasMoreHistory(a: CardHistory, b: CardHistory): boolean {
  if (a.departed !== b.departed) return !a.departed;
  if (a.reports !== b.reports) return a.reports > b.reports;
  return a.createdAt < b.createdAt;
}
