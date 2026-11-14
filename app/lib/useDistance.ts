import { useTranslation } from 'react-i18next';
import { roundDistance } from './way';

/** «90 м», «1,2 км» in the reader's language (14 November 2026). */
export function useDistance() {
  const { t, i18n } = useTranslation();
  return (m: number) => {
    const r = roundDistance(m);
    const n = i18n.language.startsWith('en') ? String(r.n) : String(r.n).replace('.', ',');
    return t(r.unit === 'km' ? 'territories.part.way.km' : 'territories.part.way.metres', { n });
  };
}
