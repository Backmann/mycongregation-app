import dayjs from 'dayjs';

/**
 * A day as a person says it — and WITH ITS YEAR when the year is not this one.
 *
 * A task due on 31 August 2027 read «31 августа» in October 2026, which is a
 * date that has just passed: it looked overdue, stood under «Позже», and the
 * two did not agree (3 October 2026, on the live congregation's own task).
 * Inside the current year the year is noise; outside it, it is the fact.
 */
export function dayLabel(
  iso: string,
  language: string,
  todayISO: string = dayjs().format('YYYY-MM-DD'),
): string {
  const sameYear = iso.slice(0, 4) === todayISO.slice(0, 4);
  return dayjs(iso)
    .locale(language)
    .format(sameYear ? 'D MMMM' : 'D MMMM YYYY');
}
