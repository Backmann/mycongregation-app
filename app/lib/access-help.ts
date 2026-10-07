/**
 * Who cannot get in — said by the list, before anybody rings up.
 *
 * Everything needed was already known somewhere: an account that has never
 * been entered, a code that died three weeks ago, a password refused this
 * morning. But it was known one card at a time, in a list of sixty accounts
 * in the order they were created, named by what is typed to sign in. So the
 * administrator learned about trouble when the person telephoned.
 *
 * This is the one rule for «нужна помощь», kept apart from the screen so that
 * scripts/check-access-help.mjs can hold every case of it. It answers with
 * the reason that decides what the helper does next, and nothing else.
 *
 * NOT here on purpose:
 *  - an account switched off — that was somebody's decision, not a problem;
 *  - somebody who simply has not opened the app for a while — not being
 *    interested is not being stuck;
 *  - notifications that do not arrive — «Кого достигают уведомления» answers
 *    that, with its own reasons.
 */
export type HelpReason =
  /** The last try was refused, and they have not got in since. */
  | 'failed'
  /** Never been in; the code they were given has run out. */
  | 'codeExpired'
  /** Never been in; no password and nobody ever gave them a code. */
  | 'neverInvited'
  /** Never been in, though a password was set for them. */
  | 'neverSignedIn'
  /** Signs in and finds every personal screen closed — no card behind it. */
  | 'noCard'
  /** A code is out there, alive and unused. Waiting, not stuck. */
  | 'codeWaiting';

export interface HelpSubject {
  isActive: boolean;
  publisherId: string | null;
  hasPassword: boolean;
  lastLoginAt: string | null;
  /**
   * Last activity. An account can be in daily use and carry no stamped entry:
   * found on a copy of the live data on 7 October 2026 — it came in by an
   * invitation link at a time when that door did not stamp one. Activity is
   * evidence of having been in, and «входа ещё не было» said of somebody who
   * opened the app on Saturday would send the helper to the wrong person.
   */
  lastSeenAt?: string | null;
  inviteExpiresAt: string | null;
  /** Absent on answers from an older server. */
  lastFailedLoginAt?: string | null;
}

/** Most urgent first — the order the list is read in. */
export const HELP_ORDER: HelpReason[] = [
  'failed',
  'codeExpired',
  'neverInvited',
  'neverSignedIn',
  'noCard',
  'codeWaiting',
];

export function helpReason(
  user: HelpSubject,
  now: number = Date.now(),
): HelpReason | null {
  if (!user.isActive) return null;

  // A refusal after the last entry comes first: this person is trying, today,
  // and failing. The server sends it only when it is newer than the last time
  // they got in.
  if (user.lastFailedLoginAt) return 'failed';

  const codeUntil = user.inviteExpiresAt
    ? new Date(user.inviteExpiresAt).getTime()
    : null;
  const codeAlive = codeUntil !== null && codeUntil > now;

  if (!user.lastLoginAt && !user.lastSeenAt) {
    if (codeAlive) return 'codeWaiting';
    if (codeUntil !== null) return 'codeExpired';
    return user.hasPassword ? 'neverSignedIn' : 'neverInvited';
  }

  if (!user.publisherId) return 'noCard';
  // Has been in before, and an elder has since issued a code nobody used.
  if (codeAlive) return 'codeWaiting';
  return null;
}

/** For sorting «нужна помощь»: by urgency, then the freshest refusal first. */
export function helpRank(reason: HelpReason): number {
  return HELP_ORDER.indexOf(reason);
}
