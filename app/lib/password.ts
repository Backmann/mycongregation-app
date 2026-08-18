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

export type PasswordCheck = {
  id: 'length' | 'notCommon' | 'notRepetitive';
  ok: boolean;
};

/**
 * The rule as a list that fills in while you type, rather than one complaint
 * that appears once you have dealt with the previous one.
 *
 * Every entry is shown from the first keystroke — seeing that two of three are
 * done tells you how far you have got; being told «too short» and then, on the
 * next attempt, «too common» tells you only that you failed again.
 */
export function passwordChecks(password: string): PasswordCheck[] {
  const value = password.trim();
  const lower = value.toLowerCase();
  const repetitive =
    /^(.)\1+$/.test(value) || /^(0123456789|1234567890|9876543210)/.test(value);
  return [
    { id: 'length', ok: value.length >= PASSWORD_MIN_LENGTH },
    { id: 'notCommon', ok: value.length > 0 && !COMMON.has(lower) },
    { id: 'notRepetitive', ok: value.length > 0 && !repetitive },
  ];
}

/**
 * Three ordinary words, for people who stall at inventing one.
 *
 * Words beat a short mixture on both counts that matter: «окно чайник
 * сентябрь» is longer than anything typed by hand under pressure, and it can
 * actually be remembered. The list is deliberately plain, concrete and
 * unrelated to this app — nothing about the congregation, nothing guessable
 * from knowing the person.
 */
const WORDS = [
  'окно', 'чайник', 'сентябрь', 'парус', 'ветер', 'ложка', 'корабль',
  'дорога', 'яблоко', 'снег', 'камень', 'фонарь', 'зерно', 'облако',
  'мостик', 'вишня', 'песок', 'колесо', 'тетрадь', 'кофе', 'мельница',
  'ручей', 'сахар', 'ковёр', 'листва', 'малина', 'озеро', 'ступень',
];

export function suggestPassword(): string {
  const pick = () => {
    const buf = new Uint32Array(1);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(buf);
      return WORDS[buf[0] % WORDS.length];
    }
    return WORDS[Math.floor(Math.random() * WORDS.length)];
  };
  // Distinct words: a repeat both reads as a mistake and buys no strength.
  const chosen: string[] = [];
  let guard = 0;
  while (
    (chosen.length < 3 || chosen.join(' ').length < PASSWORD_MIN_LENGTH) &&
    chosen.length < 5 &&
    guard++ < 100
  ) {
    const word = pick();
    if (!chosen.includes(word)) chosen.push(word);
  }
  return chosen.join(' ');
}

/**
 * Turns the server's refusal into something to read.
 *
 * The server answers { code: 'WEAK_PASSWORD', problem: 'tooShort' }. Until now
 * the word WEAK_PASSWORD appeared NOWHERE in this app, so that object reached
 * the reader as a technical string. Same rule as the 409 on a duplicate
 * report: the code is ours to read, the words are ours to write.
 */
export function weakPasswordProblem(error: unknown): PasswordProblem | null {
  const body = (error as { response?: { data?: unknown } })?.response?.data;
  const data = (body ?? error) as { code?: string; problem?: string };
  if (data?.code !== 'WEAK_PASSWORD') return null;
  const known: PasswordProblem[] = [
    'tooShort',
    'tooCommon',
    'looksLikeEmail',
    'tooRepetitive',
  ];
  return known.includes(data.problem as PasswordProblem)
    ? (data.problem as PasswordProblem)
    : 'tooShort';
}

export type InviteRefusal = { kind: 'invalid' } | null;

/**
 * Reads the server's refusal of an invitation code.
 *
 * Same rule as WEAK_PASSWORD and the duplicate-report 409 before it: the code
 * is ours to read, the words are ours to write. A body reaching the reader
 * untranslated is how "Invalid credentials" and "A report for 2026-07-01 has
 * already been submitted" both ended up on screen in the past.
 */
export function inviteRefusal(error: unknown): InviteRefusal {
  const body = (error as { response?: { data?: unknown } })?.response?.data;
  const data = (body ?? error) as { code?: string };
  // INVITE_WRONG_CODE is gone, and so is the countdown it carried. A wrong
  // code now belongs to no account — the code alone says who is signing in —
  // so there is nothing to count attempts against. Guessing is limited by
  // source instead, on the server.
  if (data?.code === 'INVITE_INVALID') return { kind: 'invalid' };
  return null;
}
