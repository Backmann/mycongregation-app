/**
 * The names of months and weekdays, for every language the app speaks.
 *
 * dayjs knows English only. `dayjs(x).locale('ru')` does not load Russian — it
 * switches to it IF somebody has loaded it, and silently stays English if not.
 * Each screen used to load the names for itself, and the ones that forgot
 * («Мои задачи», «Архив повесток», a congregation's card) still looked right
 * most of the time, because some screen opened earlier had loaded them. Opened
 * first — a reload in the browser, a link — they said «28 February 2027» and
 * «Saturday» in the middle of a Russian page (found on a copy of the live
 * data, 6 October).
 *
 * So the names are loaded once, here, and this file is loaded by lib/i18n.ts,
 * which the root layout loads before any screen exists. A new language is
 * added here, and scripts/check-dayjs-locales.mjs fails until it is.
 */
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
