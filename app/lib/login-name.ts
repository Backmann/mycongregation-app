/**
 * The same rule the server applies to a login name, said before the button.
 *
 * A copy, and knowingly so — exactly like lib/password.ts. The server decides;
 * this exists so an administrator sees why a name will not do while he is
 * still typing it, rather than after a round trip.
 *
 * Kept in step with src/users/login-name.ts on the server: same alphabet, same
 * bounds, same four refusals by the same names.
 */

export const LOGIN_NAME_MIN = 3;
export const LOGIN_NAME_MAX = 64;

export type LoginNameProblem =
  | 'tooShort'
  | 'tooLong'
  | 'badCharacters'
  | 'edgeDot';

export function loginNameProblem(name: string): LoginNameProblem | null {
  const value = name.trim().toLowerCase();
  if (value.length < LOGIN_NAME_MIN) return 'tooShort';
  if (value.length > LOGIN_NAME_MAX) return 'tooLong';
  if (!/^[a-z0-9.]+$/.test(value)) return 'badCharacters';
  if (value.startsWith('.') || value.endsWith('.') || value.includes('..')) {
    return 'edgeDot';
  }
  return null;
}

/**
 * A refusal the server sent, turned into something a reader can act on.
 *
 * The server answers with a code and a reason — never a sentence. Sentences
 * from a server end up on somebody's screen in a language they do not read,
 * which is how «A report for 2026-07-01 has already been submitted» once
 * reached a publisher.
 */
export function loginNameRefusal(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  const body = (
    error as { response?: { data?: { code?: string; problem?: string } } }
  )?.response?.data;
  if (!body?.code) return null;
  if (body.code === 'LOGIN_NAME_TAKEN') return t('loginName.taken');
  if (body.code === 'BAD_LOGIN_NAME') {
    return t(`loginName.problem.${body.problem ?? 'badCharacters'}`);
  }
  return null;
}
