import type { TFunction } from 'i18next';
import type { S21Totals } from './api';
import { formatMonthLabel } from './i18n';
import {
  hasFigures,
  rowsOf,
  totalHours,
  TOTALS_CARDS,
  type TotalsCard,
} from './s21-totals';

/**
 * The three totals cards (S-21) as a printed sheet — one card a page, laid out
 * as the record card itself: the months of the service year down the side,
 * how many reported, their hours and Bible studies, and the year's hours
 * at the foot. What the paper card would carry in «Примечания» goes there:
 * late reports counted in the month, the special pioneers and missionaries
 * among the first card's count, and a month not yet sent.
 */
export function buildS21TotalsHtml(data: S21Totals, t: TFunction): string {
  const years = t('s21Totals.yearLong', {
    from: data.serviceYear - 1,
    to: data.serviceYear,
  });
  const pages = TOTALS_CARDS.map((card) => page(card, data, t, years)).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    `${t('s21Totals.title')} · ${years}`,
  )}</title><style>${STYLES}</style></head><body>${pages}</body></html>`;
}

function page(
  card: TotalsCard,
  data: S21Totals,
  t: TFunction,
  years: string,
): string {
  const rows = rowsOf(data, card);
  const hours = totalHours(rows);
  const body = rows
    .map((r) => {
      const shown = hasFigures(r.state);
      const notes = [
        r.late > 0 ? t('s21Totals.print.late', { count: r.late }) : '',
        r.direct > 0 ? t('s21Totals.print.direct', { count: r.direct }) : '',
        r.state === 'collecting' ? t('s21Totals.print.collecting') : '',
        r.state === 'open' ? t('s21Totals.print.open') : '',
        r.state === 'frozen' ? t('s21Totals.print.frozen') : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const cell = (v: number | null) => (shown && v !== null ? String(v) : '');
      return `<tr class="${shown ? '' : 'blank'}">
        <td class="mon">${esc(formatMonthLabel(r.month))}</td>
        <td class="n">${cell(r.count)}</td>
        <td class="n">${cell(r.studies)}</td>
        <td class="n">${card.hasHours ? cell(r.hours) : '<span class="na">—</span>'}</td>
        <td class="notes">${esc(notes)}</td>
      </tr>`;
    })
    .join('');
  return `<section class="page">
  <div class="masthead" style="--tone:${card.tone}">
    <div>
      <div class="form">${esc(t('s21Totals.print.formTitle'))}</div>
      <h1>${esc(t(`s21Totals.cards.${card.key}.title`))}</h1>
      <div class="sub">${esc(t(`s21Totals.cards.${card.key}.kicker`))}</div>
    </div>
    <div class="year">${esc(years)}</div>
  </div>
  <table>
    <thead><tr>
      <th class="mon">${esc(t('s21Totals.col.month'))}</th>
      <th>${esc(t('s21Totals.print.count'))}</th>
      <th>${esc(t('s21Totals.print.studies'))}</th>
      <th>${esc(t('s21Totals.print.hours'))}</th>
      <th class="notes">${esc(t('s21Totals.print.remarks'))}</th>
    </tr></thead>
    <tbody>${body}
      <tr class="total">
        <td class="mon">${esc(t('s21Totals.print.total'))}</td>
        <td></td><td></td>
        <td class="n">${card.hasHours && hours > 0 ? hours : ''}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <div class="foot">${esc(t('s21Totals.print.foot'))}</div>
</section>`;
}

const STYLES = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Manrope', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .masthead {
    border-radius: 10px; padding: 13px 16px 12px; color: #fff;
    background: linear-gradient(105deg, var(--tone) 0%, #0f172a 160%);
    display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
    margin-bottom: 12px;
  }
  .masthead .form { font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; }
  .masthead h1 { font-size: 16px; font-weight: 800; margin: 3px 0 0; }
  .masthead .sub { font-size: 10.5px; opacity: 0.85; margin-top: 2px; }
  .masthead .year { font-size: 12px; font-weight: 700; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  th {
    font-size: 9px; font-weight: 700; color: #475569; text-transform: uppercase;
    letter-spacing: 0.04em; text-align: right; padding: 6px 8px;
    border-bottom: 1.5px solid #cbd5e1;
  }
  th.mon, th.notes { text-align: left; }
  td { font-size: 11.5px; padding: 6px 8px; border-bottom: 1px solid #eef2f7; }
  td.mon { white-space: nowrap; }
  td.n { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; width: 74px; }
  td.notes { font-size: 9.5px; color: #475569; }
  tr.blank td { color: #94a3b8; }
  .na { color: #cbd5e1; font-weight: 400; }
  tr.total td { border-top: 1.5px solid #cbd5e1; border-bottom: none; font-weight: 800; padding-top: 8px; }
  .foot { margin-top: 10px; font-size: 8.5px; color: #94a3b8; }
  @page { size: A4 portrait; margin: 12mm; }
`;

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
