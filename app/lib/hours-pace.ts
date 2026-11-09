/**
 * How many hours the plan expects by the start of today (9 November 2026):
 * the month's goal spread evenly over its days, today not yet counted.
 * Home shows it beside what is written, so a pioneer sees whether he keeps
 * pace without working it out. Pure: scripts/check-hours-pace.mjs runs it.
 */
export function paceHours(goal: number, today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.round((goal * (d - 1)) / last);
}
