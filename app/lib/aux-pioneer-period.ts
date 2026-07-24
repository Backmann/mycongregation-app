import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import type { MyAuxPioneerPeriod } from './api';

/**
 * Одни и те же слова о периоде подсобного пионерского служения — на главной,
 * в списке служащих и в журнале. Раньше формулировка жила внутри экрана
 * списка, и главная неизбежно заговорила бы иначе.
 *
 * `hideCurrentYear` убирает год, когда он и так очевиден (период внутри
 * текущего года): значок на главной говорит про «сейчас», а журнал тянется
 * через годы и год сохраняет. Одна функция, один флаг — не две реализации,
 * которые разойдутся.
 */

/** Минимум, который нужно назвать. */
export type PeriodLike = {
  startMonth: string;
  endMonth: string | null;
  untilCancelled: boolean;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

// Русскому после «с» нужен родительный падеж: «с июля», а не «с июль».
const RU_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

type Options = { hideCurrentYear?: boolean };

function showsYear(iso: string, opts: Options): boolean {
  if (!opts.hideCurrentYear) return true;
  return dayjs(iso).year() !== dayjs().year();
}

/** «июль 2026» или «июль» — обычная форма месяца. */
export function auxMonthLabel(
  lang: string,
  iso: string,
  opts: Options = {},
): string {
  return dayjs(iso)
    .locale(lang)
    .format(showsYear(iso, opts) ? 'MMMM YYYY' : 'MMMM');
}

/** «июля 2026» или «июля» — форма после «с» (родительный падеж). */
export function auxMonthSinceLabel(
  lang: string,
  iso: string,
  opts: Options = {},
): string {
  const d = dayjs(iso);
  if (lang === 'ru') {
    const month = RU_GENITIVE[d.month()];
    return showsYear(iso, opts) ? `${month} ${d.year()}` : month;
  }
  return auxMonthLabel(lang, iso, opts);
}

/**
 * «до отмены · с июля» / «только июль» / «июль – сентябрь».
 */
export function auxPeriodLabel(
  t: Translate,
  lang: string,
  period: PeriodLike | MyAuxPioneerPeriod,
  opts: Options = {},
): string {
  if (period.untilCancelled) {
    return t('auxPioneer.untilCancelledSince', {
      month: auxMonthSinceLabel(lang, period.startMonth, opts),
    });
  }
  if (
    period.endMonth &&
    period.endMonth.slice(0, 7) === period.startMonth.slice(0, 7)
  ) {
    return t('auxPioneer.onlyMonth', {
      month: auxMonthLabel(lang, period.startMonth, opts),
    });
  }
  return t('auxPioneer.rangeMonths', {
    from: auxMonthLabel(lang, period.startMonth, opts),
    to: period.endMonth ? auxMonthLabel(lang, period.endMonth, opts) : '…',
  });
}
