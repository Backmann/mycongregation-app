import type { TFunction } from 'i18next';
import type { Absence } from './api';

/**
 * WHY SOMEBODY IS AWAY, in the reader's language (23 October 2026).
 *
 * An absence the pioneer school writes is linked to the school's duty; the
 * server used to put a Russian note on it («Школа пионерского служения»), and
 * that note stood on German and English screens. Now the link says why, and
 * the words come from here — for old rows too, which still carry the Russian
 * note. A note a person typed is theirs and is shown as typed.
 */
export function absenceNote(
  a: Pick<Absence, 'note'> & { pioneerSchoolDutyId?: string | null },
  t: TFunction,
): string | null {
  if (a.pioneerSchoolDutyId) return t('absences.reason.pioneerSchool');
  return a.note?.trim() || null;
}
