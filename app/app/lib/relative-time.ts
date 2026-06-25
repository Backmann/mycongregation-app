// Short, locale-aware "relative to today" formatting for calendar dates
// (YYYY-MM-DD). Uses abbreviated units (d / wk / mo / y) so we never have to
// deal with full plural forms — the i18n templates only place the value.

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** Whole-day difference target - today (negative = past, positive = future). */
export function dayDiff(targetISO: string, todayISO: string): number {
  const a = new Date(`${targetISO.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${todayISO.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((a - b) / 86_400_000);
}

/** e.g. "3 нед. назад" / "через 5 мес." / "сегодня". */
export function formatRelativeDay(
  targetISO: string,
  todayISO: string,
  t: TFn,
): string {
  const d = dayDiff(targetISO, todayISO);
  if (d === 0) return t('relative.today');
  if (d === 1) return t('relative.tomorrow');
  if (d === -1) return t('relative.yesterday');
  const abs = Math.abs(d);
  let value: string;
  if (abs < 14) value = t('relative.d', { n: abs });
  else if (abs < 56) value = t('relative.w', { n: Math.round(abs / 7) });
  else if (abs < 730) value = t('relative.mo', { n: Math.round(abs / 30.44) });
  else value = t('relative.y', { n: Math.max(1, Math.round(abs / 365.25)) });
  return d < 0 ? t('relative.ago', { value }) : t('relative.in', { value });
}
