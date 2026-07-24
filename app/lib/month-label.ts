import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';

/**
 * Один формат названия месяца на всё приложение. `hideCurrentYear` убирает
 * год, когда он и так очевиден (месяц в текущем году) — так значок «сейчас»
 * не тащит лишний «2026», а журнал, тянущийся через годы, год сохраняет.
 */
export type MonthLabelOptions = { hideCurrentYear?: boolean };

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

function showsYear(iso: string, opts: MonthLabelOptions): boolean {
  if (!opts.hideCurrentYear) return true;
  return dayjs(iso).year() !== dayjs().year();
}

/** «июль 2026» или «июль» — обычная форма месяца. */
export function monthLabel(
  lang: string,
  iso: string,
  opts: MonthLabelOptions = {},
): string {
  return dayjs(iso)
    .locale(lang)
    .format(showsYear(iso, opts) ? 'MMMM YYYY' : 'MMMM');
}

/** «июля 2026» или «июля» — форма после «с» (родительный падеж). */
export function monthSinceLabel(
  lang: string,
  iso: string,
  opts: MonthLabelOptions = {},
): string {
  const d = dayjs(iso);
  if (lang === 'ru') {
    const month = RU_GENITIVE[d.month()];
    return showsYear(iso, opts) ? `${month} ${d.year()}` : month;
  }
  return monthLabel(lang, iso, opts);
}
