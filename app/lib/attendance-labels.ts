import type { TFunction } from 'i18next';
import type { AttendancePrintLabels } from './attendancePdf';

/**
 * The words of the S-88 and S-3 sheets — one place for the attendance
 * screen and the folder for the circuit overseer (17 November 2026).
 */
export function attendancePrintLabels(t: TFunction): AttendancePrintLabels {
  return {
    s88Title: t('attendance.forms.s88Title'),
    midweek: t('attendance.forms.midweek'),
    weekend: t('attendance.forms.weekend'),
    meetings: t('attendance.forms.meetings'),
    attended: t('attendance.forms.attended'),
    perWeek: t('attendance.forms.perWeek'),
    perMonth: t('attendance.forms.perMonth'),
    notesTitle: t('attendance.forms.notesTitle'),
    incomplete: (n) => t('attendance.print.incomplete', { count: n }),
    incompleteMonth: (month, n) => t('attendance.forms.incompleteMonth', { month, count: n }),
    notHeld: (day, reason) =>
      reason
        ? t('attendance.forms.notHeldWhy', { day, reason })
        : t('attendance.forms.notHeld', { day }),
    memorial: (day, count) => t('attendance.forms.memorial', { day, count }),
    s3Title: t('attendance.forms.s3Title'),
    s3Hint: t('attendance.forms.s3Hint'),
    congregation: t('attendance.forms.congregation'),
    month: t('attendance.forms.month'),
    week: (n) => t('attendance.forms.week', { n }),
    total: t('attendance.totalShort'),
    average: t('attendance.averageShort'),
    midweekShort: t('attendance.forms.midweekShort'),
    weekendShort: t('attendance.forms.weekendShort'),
    legend: t('attendance.printLegend'),
    printed: t('attendance.printedOn'),
  };
}
