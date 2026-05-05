/** Returns Monday 00:00 of the ISO week containing the given date (local time). */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a Date as 'YYYY-MM-DD' in local time (no timezone shift). */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse 'YYYY-MM-DD' as local midnight (no timezone shift). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addWeeks(date: Date, n: number): Date {
  return addDays(date, n * 7);
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "May 4 – 10" if same month, "Apr 27 – May 3" if cross-month. Year suffix only if not current. */
export function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6);
  const m1 = MONTHS[monday.getMonth()];
  const m2 = MONTHS[sunday.getMonth()];
  const currentYear = new Date().getFullYear();
  const yearSuffix =
    monday.getFullYear() === currentYear &&
    sunday.getFullYear() === currentYear
      ? ''
      : `, ${monday.getFullYear()}`;

  if (m1 === m2) {
    return `${m1} ${monday.getDate()} – ${sunday.getDate()}${yearSuffix}`;
  }
  return `${m1} ${monday.getDate()} – ${m2} ${sunday.getDate()}${yearSuffix}`;
}

export function isSameWeek(a: Date, b: Date): boolean {
  return formatDateISO(startOfWeekMonday(a)) === formatDateISO(startOfWeekMonday(b));
}
