import type { MyAuxPioneerPeriod } from './api';
import {
  monthLabel,
  monthSinceLabel,
  type MonthLabelOptions,
} from './month-label';

/**
 * Слова о периоде подсобного пионерского служения — на главной, в списке
 * служащих и в журнале. Форматирование месяца живёт в общем lib/month-label,
 * чтобы карточка отчёта и этот значок говорили одинаково.
 */

/** Минимум, который нужно назвать. */
export type PeriodLike = {
  startMonth: string;
  endMonth: string | null;
  untilCancelled: boolean;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

// Прежние имена — чтобы главная и список пионеров не меняли свои импорты.
export const auxMonthLabel = monthLabel;
export const auxMonthSinceLabel = monthSinceLabel;

/**
 * «до отмены · с июля» / «только июль» / «июль – сентябрь».
 */
export function auxPeriodLabel(
  t: Translate,
  lang: string,
  period: PeriodLike | MyAuxPioneerPeriod,
  opts: MonthLabelOptions = {},
): string {
  if (period.untilCancelled) {
    return t('auxPioneer.untilCancelledSince', {
      month: monthSinceLabel(lang, period.startMonth, opts),
    });
  }
  if (
    period.endMonth &&
    period.endMonth.slice(0, 7) === period.startMonth.slice(0, 7)
  ) {
    return t('auxPioneer.onlyMonth', {
      month: monthLabel(lang, period.startMonth, opts),
    });
  }
  return t('auxPioneer.rangeMonths', {
    from: monthLabel(lang, period.startMonth, opts),
    to: period.endMonth ? monthLabel(lang, period.endMonth, opts) : '…',
  });
}
