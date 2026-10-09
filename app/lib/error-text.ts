/**
 * What a failed request is CALLED on screen (9 October 2026).
 *
 * Until now a request that never reached the server was reported in the
 * library's own English: «Network Error» under «Не удалось загрузить», and
 * «Request failed with status code 502» in the message after a save. Nobody
 * in a hall can act on that, and it reads as a fault of the app.
 *
 * The server's OWN words are left alone — a refusal, a clash, a rule it
 * names: those are written for the person, in his language. Only what the
 * server did not say is put into words here:
 *
 *   • no answer at all (no signal, the server down) — «Нет связи с сервером»;
 *   • no answer in time — «Сервер долго не отвечает»;
 *   • the server failing (5xx) — said as the server's trouble, with the code
 *     in brackets for whoever is asked for help;
 *   • «too many tries» (429) — wait a minute;
 *   • any other code that came without a word of explanation.
 *
 * Pure: no imports, so scripts/check-error-text.mjs runs it as it is.
 */

export type Say = (key: string, options?: Record<string, unknown>) => string;

interface RequestErrorLike {
  isAxiosError?: boolean;
  code?: string;
  response?: { status?: number; data?: unknown };
}

/** The server's own message, if it gave one. */
function serverWords(data: unknown): boolean {
  const m = (data as { message?: unknown } | null | undefined)?.message;
  return typeof m === 'string' || (Array.isArray(m) && m.length > 0);
}

/**
 * The words for a failed request — or null when it is not a request error,
 * when it was called off on purpose, or when the server said its own words
 * (the caller shows those).
 */
export function requestErrorText(error: unknown, say: Say): string | null {
  const e = (error ?? null) as RequestErrorLike | null;
  if (!e || typeof e !== 'object' || e.isAxiosError !== true) return null;
  // Called off by the app itself (a screen closed, a newer request): not a
  // failure anybody should be told about.
  if (e.code === 'ERR_CANCELED') return null;
  const status = e.response?.status;
  if (typeof status !== 'number') {
    return e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT'
      ? say('connection.request.timeout')
      : say('connection.request.offline');
  }
  // Before the server's words: a 5xx «Internal server error», a gateway's
  // page or the throttle's «ThrottlerException: Too Many Requests» are not
  // words for a person.
  if (status >= 500) return say('connection.request.server', { status });
  if (status === 429) return say('connection.request.tooMany');
  if (status === 408) return say('connection.request.timeout');
  if (serverWords(e.response?.data)) return null;
  return say('connection.request.other', { status });
}
