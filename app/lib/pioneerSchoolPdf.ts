import { richNoteToHtml } from '../components/RichNote';

/**
 * The school's schedule as one sheet, made to be forwarded.
 *
 * This is not a page inside the app — it goes out to twenty brothers, half of
 * them from other congregations, who will open it as a picture in a messenger
 * and never see the app at all. So everything needed to act on it is on the
 * sheet: what it is, which days, at what time, WHICH HALL AND ITS ADDRESS, who
 * holds which role, and the notes. Nothing refers to a screen.
 */

export interface SchoolPdfDuty {
  label: string;
  name: string | null;
  congregation: string | null;
}

export interface SchoolPdfDay {
  date: string; // «понедельник, 23 ноября»
  time: string | null; // «09:00–16:00»
  duties: SchoolPdfDuty[];
}

export interface SchoolPdfLabels {
  dates: string;
  hall: string;
  notes: string;
  unassigned: string;
  role: string;
  person: string;
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPioneerSchoolPdfHtml(input: {
  title: string;
  datesLine: string;
  hallName: string | null;
  hallAddress: string | null;
  notes: string | null;
  days: SchoolPdfDay[];
  labels: SchoolPdfLabels;
}): string {
  const { labels } = input;

  const dayBlocks = input.days
    .map(
      (d) => `
      <section class="day">
        <div class="dayhead">
          <div class="daydate">${esc(d.date)}</div>
          ${d.time ? `<div class="daytime">${esc(d.time)}</div>` : ''}
        </div>
        <table>
          <thead>
            <tr><th class="role">${esc(labels.role)}</th><th>${esc(
              labels.person,
            )}</th></tr>
          </thead>
          <tbody>
            ${d.duties
              .map(
                (r) => `
              <tr>
                <td class="role">${esc(r.label)}</td>
                <td class="${r.name ? '' : 'empty'}">${
                  r.name
                    ? esc(r.name) +
                      (r.congregation
                        ? ` <span class="cong">(${esc(r.congregation)})</span>`
                        : '')
                    : esc(labels.unassigned)
                }</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>${esc(input.title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #0f172a;
    margin: 0;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { font-size: 12.5px; color: #475569; line-height: 1.55; margin-bottom: 4px; }
  .meta .label { color: #94a3b8; }
  .hall { font-size: 13.5px; color: #0f172a; font-weight: 600; }
  .addr { font-size: 12.5px; color: #475569; }
  .rule { height: 2px; background: #0ea5e9; margin: 10px 0 14px; }
  .day { break-inside: avoid; margin-bottom: 12px; }
  .dayhead {
    display: flex; align-items: baseline; justify-content: space-between;
    border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 4px;
  }
  .daydate { font-size: 14px; font-weight: 700; text-transform: capitalize; }
  .daytime { font-size: 12.5px; color: #475569; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th {
    text-align: left; font-size: 10.5px; color: #94a3b8; font-weight: 600;
    text-transform: uppercase; letter-spacing: .4px; padding: 2px 0;
  }
  td { padding: 3px 0; border-bottom: 1px solid #f1f5f9; }
  td.role, th.role { width: 42%; color: #475569; }
  td.empty { color: #b45309; }
  .cong { color: #64748b; }
  .notes { margin-top: 14px; padding-top: 10px; border-top: 1px solid #e2e8f0; }
  .notes h2 { font-size: 12px; color: #94a3b8; text-transform: uppercase;
    letter-spacing: .4px; margin: 0 0 6px; }
  .notes div { font-size: 12.5px; line-height: 1.55; }
  .notes .bul { display: flex; gap: 6px; }
  .notes .gap { height: 6px; }
</style>
</head>
<body>
  <h1>${esc(input.title)}</h1>
  <div class="meta">
    <span class="label">${esc(labels.dates)}:</span> ${esc(input.datesLine)}
  </div>
  ${
    input.hallName || input.hallAddress
      ? `<div class="meta">
           <span class="label">${esc(labels.hall)}:</span>
           <span class="hall">${esc(input.hallName)}</span>
           ${input.hallAddress ? `<div class="addr">${esc(input.hallAddress)}</div>` : ''}
         </div>`
      : ''
  }
  <div class="rule"></div>
  ${dayBlocks}
  ${
    input.notes && input.notes.trim()
      ? `<div class="notes"><h2>${esc(labels.notes)}</h2>${richNoteToHtml(
          input.notes,
        )}</div>`
      : ''
  }
</body>
</html>`;
}
