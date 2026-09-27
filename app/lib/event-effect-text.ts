import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import type { Effect } from './event-view';

/**
 * The one line that says what an event means for the meetings, in the
 * reader's words — the events list and the event form say the same thing
 * (27 September).
 */
export function useEffectText(effect: Effect | null): string | null {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  if (!effect) return null;
  const day = (iso: string, f: string) => dayjs(iso).locale(loc).format(f);
  switch (effect.key) {
    case 'noMeetingsWeeks': {
      const sameMonth = effect.from.slice(0, 7) === effect.to.slice(0, 7);
      const range = sameMonth
        ? `${day(effect.from, 'D')}–${day(effect.to, 'D MMMM')}`
        : `${day(effect.from, 'D MMMM')} – ${day(effect.to, 'D MMMM')}`;
      return t('specialEvents.effect.noMeetingsWeeks', { range });
    }
    case 'visitMidweek':
      return t('specialEvents.effect.visitMidweek', {
        day: day(effect.day, 'dddd, D MMMM'),
      });
    case 'changed': {
      const at = [effect.time, effect.place].filter(Boolean).join(', ');
      return at
        ? t('specialEvents.effect.changedAt', { at })
        : t('specialEvents.effect.changed');
    }
    default:
      return t(`specialEvents.effect.${effect.key}`);
  }
}
