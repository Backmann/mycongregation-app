import type { Publisher, PublisherHistoryEntry } from './api';

export interface S21Data {
  publisher: Publisher;
  /** History entries (any months); the card picks the service year it needs. */
  timeline: PublisherHistoryEntry[];
}

const MONTHS_ORDER = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7]; // Sep..Aug (0-based)

const MONTH_LABELS_RU = [
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
];

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}

/** The label of the service year that a given calendar month/year belongs to. */
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

/**
 * Build one S-21 card (a self-contained block). `serviceYear` selects Sep(year-1)
 * .. Aug(year). Reads the report for each month from `timeline`.
 */
function cardHtml(data: S21Data, serviceYear: number): string {
  const p = data.publisher;
  const fullName = esc(
    [p.lastName, p.firstName].filter(Boolean).join(' ') || p.displayName || '',
  );

  // Map "YYYY-MM" -> report for quick lookup.
  const byMonth = new Map<string, PublisherHistoryEntry['report']>();
  for (const e of data.timeline) {
    byMonth.set(e.reportMonth.slice(0, 7), e.report);
  }

  let totalHours = 0;
  const rows = MONTHS_ORDER.map((monthIdx, i) => {
    const calYear = monthIdx >= 8 ? serviceYear - 1 : serviceYear;
    const ym = `${calYear}-${String(monthIdx + 1).padStart(2, '0')}`;
    const report = byMonth.get(ym) ?? null;

    const shared =
      report != null &&
      (report.servedThisMonth === true ||
        (report.hoursReported != null && report.hoursReported > 0));
    const studies = report?.bibleStudies ?? '';
    const isAux = report?.hoursReported != null && p.pioneerType === 'none';
    const hours =
      report?.hoursReported != null && p.pioneerType !== 'none'
        ? report.hoursReported
        : '';
    if (typeof hours === 'number') totalHours += hours;
    const notes = esc(report?.notes ?? '');

    return `<tr>
      <td class="mon">${MONTH_LABELS_RU[i]}</td>
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
    <div class="title">ЗАПИСИ СОБРАНИЯ О СЛУЖЕНИИ ВОЗВЕЩАТЕЛЯ</div>
    <div class="idrow"><b>ФИО:</b> ${fullName}</div>
    <div class="idrow">
      <span><b>Дата рождения:</b> ${esc(p.birthDate ?? '')}</span>
      <span class="sp">${CB(male)} Мужчина</span>
      <span class="sp">${CB(!male)} Женщина</span>
    </div>
    <div class="idrow">
      <span><b>Дата крещения:</b> ${esc(p.baptismDate ?? '')}</span>
      <span class="sp">${CB(otherSheep)} Другая овца</span>
      <span class="sp">${CB(anointed)} Помазанник</span>
    </div>
    <div class="idrow chips">
      <span>${CB(isElder)} Старейшина</span>
      <span>${CB(isMS)} Помощник собрания</span>
      <span>${CB(isRegular)} Общий пионер</span>
      <span>${CB(isSpecial)} Специальный пионер</span>
      <span>${CB(isMissionary)} Миссионер</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Служебный год</th>
          <th>Участвовал в служении</th>
          <th>Изучения Библии</th>
          <th>Подсобный пионер</th>
          <th>Часы<br/><span class="hint">(если пионер или миссионер)</span></th>
          <th>Примечания</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr class="total">
          <td colspan="4" class="tlabel">Итого</td>
          <td class="ctr">${totalHours > 0 ? totalHours : ''}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="foot">S-21-U · ${esc(String(serviceYear - 1))}/${esc(
      String(serviceYear),
    )}</div>
  </div>`;
}

const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; padding: 14mm; }
  .s21 { page-break-inside: avoid; }
  .s21 + .s21 { margin-top: 10mm; }
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

/**
 * Full printable HTML. `twoPerPage` renders the same card twice on one A4 sheet
 * (the S-21_s-Mlt layout). Returns a complete document string.
 */
export function buildS21Html(
  data: S21Data,
  serviceYear: number,
  twoPerPage: boolean,
): string {
  const one = cardHtml(data, serviceYear);
  const body = twoPerPage ? one + one : one;
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
