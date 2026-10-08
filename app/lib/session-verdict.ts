/**
 * Did the server REFUSE this session — or could it simply not be asked?
 *
 * FOUND ON 7 OCTOBER 2026, reading the code for «надёжность на сцене». Every
 * failure to renew a session was treated as «the session is dead»: the keys
 * were wiped from the phone and the person was put in front of «Войти». But
 * a renewal fails for two entirely different reasons:
 *
 *   - the server ANSWERED «no» — the session was ended, the password was
 *     changed, the account was switched off. Then signing out is right;
 *   - the server could not be REACHED — no signal in the hall, a ten-second
 *     timeout on mobile data, the half-minute in which the server restarts
 *     after an update. Nothing is wrong with the session at all.
 *
 * The short key lives fifteen minutes, so nearly every opening of the app
 * renews. Whoever opened it in a bad moment was signed out — on a phone for
 * good, the long key being deleted — and needed a password most people here
 * do not remember. On the day this was found the server had been restarted
 * eight times.
 *
 * So the question is asked here, in one place, and
 * scripts/check-session-verdict.mjs holds every case of it.
 */
export type SessionVerdict = 'refused' | 'unreachable';

interface ErrorLike {
  response?: { status?: number } | null;
  message?: string;
  /** Set by lib/api.ts when a renewal failed and the keys were KEPT. */
  sessionKept?: boolean;
}

export function sessionVerdict(error: unknown): SessionVerdict {
  const e = (error ?? {}) as ErrorLike;
  // The renewal was not even attempted: there is no long key on this device.
  if (e.message === 'No refresh token available') return 'refused';
  // Already decided once, where the renewal failed.
  if (e.sessionKept) return 'unreachable';
  const status = e.response?.status;
  // No answer at all: offline, DNS, timeout, the request was cut.
  if (typeof status !== 'number') return 'unreachable';
  // «Slow down», «try later», «too early» — the server is there and has said
  // nothing about the session.
  if (status === 408 || status === 425 || status === 429) return 'unreachable';
  // The server's own answer about this request. A 5xx is the server (or what
  // stands in front of it while it restarts) failing — not a verdict.
  return status >= 400 && status < 500 ? 'refused' : 'unreachable';
}

/** How long to wait before asking again; null when asking again is pointless. */
export function renewalRetryDelayMs(attempt: number): number | null {
  // Three tries inside half a minute. The server honours a spent key as an
  // honest retry for sixty seconds (REFRESH_REPLAY_GRACE_MS) — a reply lost on
  // the way must be asked for again INSIDE that minute, or the retry itself
  // reads as a stolen key.
  const DELAYS = [1500, 4000];
  return attempt < DELAYS.length ? DELAYS[attempt] : null;
}
