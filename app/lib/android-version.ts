/**
 * «36» is not Android 36 — it is Android 16.
 *
 * Platform.Version on Android reports the API LEVEL, which is the number the
 * system was built against, and the two have drifted apart for years: API 30 is
 * Android 11, API 36 is Android 16. Showing the raw number in a list read by
 * elders would be quietly wrong in the worst way — plausible, specific, and
 * false.
 *
 * iOS states its version directly, so this concerns Android alone.
 *
 * Unknown levels come back as null rather than as a guess: a future API level
 * this table has never heard of should read as «Android» with no number, not as
 * a wrong one.
 */
const ANDROID_BY_API: Record<number, string> = {
  21: '5.0',
  22: '5.1',
  23: '6',
  24: '7',
  25: '7.1',
  26: '8',
  27: '8.1',
  28: '9',
  29: '10',
  30: '11',
  31: '12',
  32: '12L',
  33: '13',
  34: '14',
  35: '15',
  36: '16',
};

export function androidVersionName(apiLevel: string | null): string | null {
  if (!apiLevel) return null;
  const level = parseInt(apiLevel, 10);
  if (!Number.isFinite(level)) return null;
  return ANDROID_BY_API[level] ?? null;
}
