/**
 * The same bar the server applies, said before the button is pressed.
 *
 * A copy, and knowingly so: the server's word is final and this cannot be
 * trusted, but a rule enforced only on the far side of a request means the
 * reader types a password, waits, and is told no. The two lists agree by
 * construction — the server's file carries the same shapes and the same
 * minimum, and the tests on both sides name the same examples.
 *
 * There is no capital-digit-symbol demand here for the same reason there is
 * none there: such rules produce `Password1!` and a note under the keyboard.
 */

export const PASSWORD_MIN_LENGTH = 10;

const COMMON = new Set([
  '123456789',
  '1234567890',
  '12345678910',
  'password',
  'password1',
  'password123',
  'qwertyuiop',
  'qwerty123',
  'iloveyou',
  'princess',
  'admin123',
  'welcome1',
  'welcome123',
  'letmein123',
  'monkey123',
  'sunshine',
  'football',
  'baseball',
  'superman',
  'trustno1',
  'starwars',
  'whatever',
  'computer',
  'jesus123',
  'jehovah1',
  'jehovah123',
  'watchtower',
  'congregation',
  'пароль123',
  'йцукенгш',
  'ячсмитьбю',
]);

export type PasswordProblem =
  | 'tooShort'
  | 'tooCommon'
  | 'looksLikeEmail'
  | 'tooRepetitive';

export function passwordProblem(
  password: string,
  email?: string,
): PasswordProblem | null {
  const value = password.trim();
  if (value.length < PASSWORD_MIN_LENGTH) return 'tooShort';

  const lower = value.toLowerCase();
  if (COMMON.has(lower)) return 'tooCommon';
  if (/^(.)\1+$/.test(value)) return 'tooRepetitive';
  if (/^(0123456789|1234567890|9876543210)/.test(value)) return 'tooRepetitive';

  if (email) {
    const address = email.toLowerCase().trim();
    const localPart = address.split('@')[0];
    if (lower === address || (localPart.length >= 4 && lower === localPart)) {
      return 'looksLikeEmail';
    }
  }
  return null;
}
