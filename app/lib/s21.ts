import type { S21DataResponse } from './api';

const MONTHS_ORDER = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7]; // Sep..Aug (0-based)

/**
 * THE CARD IN THE READER'S LANGUAGE (23 October 2026, Lionel: «да» — translate
 * the S-21). It used to be Russian whatever language the app spoke. The
 * Russian text is the one the congregation has used; the German and English
 * labels follow the printed form's fields, worded plainly — they are not
 * copied from an official German or English form, which was not at hand.
 */
type S21Lang = 'ru' | 'de' | 'en';
const S21_TEXT: Record<
  S21Lang,
  {
    title: string;
    name: string;
    born: string;
    baptized: string;
    male: string;
    female: string;
    otherSheep: string;
    anointed: string;
    elder: string;
    ms: string;
    regular: string;
    special: string;
    missionary: string;
    year: string;
    shared: string;
    studies: string;
    aux: string;
    hours: string;
    hoursHint: string;
    remarks: string;
    total: string;
    code: string;
  }
> = {
  ru: {
    title: 'ЗАПИСИ СОБРАНИЯ О СЛУЖЕНИИ ВОЗВЕЩАТЕЛЯ',
    name: 'ФИО',
    born: 'Дата рождения',
    baptized: 'Дата крещения',
    male: 'Мужчина',
    female: 'Женщина',
    otherSheep: 'Другая овца',
    anointed: 'Помазанник',
    elder: 'Старейшина',
    ms: 'Помощник собрания',
    regular: 'Общий пионер',
    special: 'Специальный пионер',
    missionary: 'Миссионер',
    year: 'Служебный год',
    shared: 'Участвовал в служении',
    studies: 'Изучения Библии',
    aux: 'Подсобный пионер',
    hours: 'Часы',
    hoursHint: '(если пионер или миссионер)',
    remarks: 'Примечания',
    total: 'Итого',
    code: 'S-21-U',
  },
  de: {
    title: 'VERKÜNDIGERKARTE DER VERSAMMLUNG',
    name: 'Name',
    born: 'Geburtsdatum',
    baptized: 'Taufdatum',
    male: 'Männlich',
    female: 'Weiblich',
    otherSheep: 'Andere Schafe',
    anointed: 'Gesalbter',
    elder: 'Ältester',
    ms: 'Dienstamtgehilfe',
    regular: 'Allgemeiner Pionier',
    special: 'Sonderpionier',
    missionary: 'Missionar',
    year: 'Dienstjahr',
    shared: 'Am Dienst beteiligt',
    studies: 'Bibelstudien',
    aux: 'Hilfspionier',
    hours: 'Stunden',
    hoursHint: '(bei Pionieren oder Missionaren)',
    remarks: 'Bemerkungen',
    total: 'Summe',
    code: 'S-21-X',
  },
  en: {
    title: 'CONGREGATION’S PUBLISHER RECORD',
    name: 'Name',
    born: 'Date of birth',
    baptized: 'Date of baptism',
    male: 'Male',
    female: 'Female',
    otherSheep: 'Other sheep',
    anointed: 'Anointed',
    elder: 'Elder',
    ms: 'Ministerial servant',
    regular: 'Regular pioneer',
    special: 'Special pioneer',
    missionary: 'Field missionary',
    year: 'Service year',
    shared: 'Shared in ministry',
    studies: 'Bible studies',
    aux: 'Auxiliary pioneer',
    hours: 'Hours',
    hoursHint: '(if pioneer or field missionary)',
    remarks: 'Remarks',
    total: 'Total',
    code: 'S-21-E',
  },
};

function s21Lang(lang: string): S21Lang {
  const l = (lang || 'ru').slice(0, 2).toLowerCase();
  return l === 'de' || l === 'en' ? l : 'ru';
}

/** «Сентябрь», «September» — the month on its own, capitalised. */
function monthLabel(monthIdx: number, lang: S21Lang): string {
  const m = new Date(2026, monthIdx, 1).toLocaleDateString(
    lang === 'en' ? 'en-US' : lang,
    { month: 'long' },
  );
  return m.charAt(0).toUpperCase() + m.slice(1);
}


function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}

/** The service year a given calendar date belongs to (Sep starts a new one). */
export function serviceYearOf(date: Date): number {
  return date.getUTCMonth() >= 8
    ? date.getUTCFullYear() + 1
    : date.getUTCFullYear();
}

/** Available service years: current + the previous three. */
export function availableServiceYears(now = new Date()): number[] {
  const cur = serviceYearOf(now);
  return [cur, cur - 1, cur - 2, cur - 3];
}

const CB = (on: boolean) => (on ? '☑' : '☐');

/** Build one S-21 card block from the server's S-21 data package. */
function cardHtml(data: S21DataResponse, lang: S21Lang): string {
  const L = S21_TEXT[lang];
  const p = data.publisher;
  const serviceYear = data.serviceYear;
  const fullName = esc(
    [p.lastName, p.firstName].filter(Boolean).join(' ') || p.displayName || '',
  );

  const byMonth = new Map<string, S21DataResponse['months'][number]>();
  for (const m of data.months) {
    byMonth.set(m.reportMonth.slice(0, 7), m);
  }

  let totalHours = 0;
  const rows = MONTHS_ORDER.map((monthIdx, i) => {
    const calYear = monthIdx >= 8 ? serviceYear - 1 : serviceYear;
    const ym = `${calYear}-${String(monthIdx + 1).padStart(2, '0')}`;
    const r = byMonth.get(ym) ?? null;

    const shared =
      r != null &&
      (r.servedThisMonth === true ||
        (r.hoursReported != null && r.hoursReported > 0));
    const studies = r?.bibleStudies ?? '';
    // Auxiliary-pioneer months come from real service periods (server flag),
    // not guessed from pioneerType.
    const isAux = r?.wasAuxiliaryPioneer === true;
    // Hours are shown for any pioneer month — regular/special/missionary
    // (permanent pioneerType) OR an auxiliary-pioneer month.
    const isPioneerMonth = p.pioneerType !== 'none' || isAux;
    const hours =
      r?.hoursReported != null && isPioneerMonth ? r.hoursReported : '';
    if (typeof hours === 'number') totalHours += hours;
    const notes = esc(r?.notes ?? '');

    return `<tr>
      <td class="mon">${monthLabel(monthIdx, lang)}</td>
      <td class="ctr">${shared ? '✓' : ''}</td>
      <td class="ctr">${studies === '' ? '' : studies}</td>
      <td class="ctr">${isAux ? '✓' : ''}</td>
      <td class="ctr">${hours === '' ? '' : hours}</td>
      <td class="notes">${notes}</td>
    </tr>`;
  }).join('');

  const isElder = p.appointment === 'elder';
  const isMS = p.appointment === 'ministerial_servant';
  const isRegular = p.pioneerType === 'regular';
  const isSpecial = p.pioneerType === 'special';
  const isMissionary = p.pioneerType === 'missionary';
  const male = p.gender === 'brother';
  const anointed = p.spiritualStatus === 'anointed';
  const otherSheep = p.spiritualStatus === 'other_sheep';

  return `
  <div class="s21">
    <div class="title">${L.title}</div>
    <div class="idrow"><b>${L.name}:</b> ${fullName}</div>
    <div class="idrow">
      <span><b>${L.born}:</b> ${esc(p.birthDate ?? '')}</span>
      <span class="sp">${CB(male)} ${L.male}</span>
      <span class="sp">${CB(!male)} ${L.female}</span>
    </div>
    <div class="idrow">
      <span><b>${L.baptized}:</b> ${esc(p.baptismDate ?? '')}</span>
      <span class="sp">${CB(otherSheep)} ${L.otherSheep}</span>
      <span class="sp">${CB(anointed)} ${L.anointed}</span>
    </div>
    <div class="idrow chips">
      <span>${CB(isElder)} ${L.elder}</span>
      <span>${CB(isMS)} ${L.ms}</span>
      <span>${CB(isRegular)} ${L.regular}</span>
      <span>${CB(isSpecial)} ${L.special}</span>
      <span>${CB(isMissionary)} ${L.missionary}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>${L.year}</th>
          <th>${L.shared}</th>
          <th>${L.studies}</th>
          <th>${L.aux}</th>
          <th>${L.hours}<br/><span class="hint">${L.hoursHint}</span></th>
          <th>${L.remarks}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total">
          <td colspan="4" class="tlabel">${L.total}</td>
          <td class="ctr">${totalHours > 0 ? totalHours : ''}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="foot">${L.code} · ${esc(String(serviceYear - 1))}/${esc(
      String(serviceYear),
    )}</div>
  </div>`;
}

const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; padding: 14mm; }
  .s21 { page-break-inside: avoid; }
  .title { text-align: center; font-weight: 700; font-size: 14px; margin-bottom: 10px; }
  .idrow { font-size: 12px; margin-bottom: 4px; }
  .idrow .sp { margin-left: 18px; }
  .idrow.chips { display: flex; gap: 14px; flex-wrap: wrap; margin: 6px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #333; padding: 3px 5px; }
  th { background: #f2f2f2; font-size: 10px; text-align: center; vertical-align: middle; }
  th .hint { font-weight: 400; font-size: 8px; }
  td.mon { white-space: nowrap; }
  td.ctr { text-align: center; }
  td.notes { min-width: 120px; }
  tr.total .tlabel { text-align: right; font-weight: 700; }
  .foot { margin-top: 6px; font-size: 9px; color: #666; }
  @media print { body { padding: 8mm; } }
`;

/** Full printable HTML for a single S-21 card from the server data package. */
export function buildS21Html(data: S21DataResponse, lang = 'ru'): string {
  const body = cardHtml(data, s21Lang(lang));
  const name =
    [data.publisher.lastName, data.publisher.firstName]
      .filter(Boolean)
      .join(' ') ||
    data.publisher.displayName ||
    'S-21';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(
    name,
  )} — S-21</title><style>${STYLES}</style></head><body>${body}</body></html>`;
}
