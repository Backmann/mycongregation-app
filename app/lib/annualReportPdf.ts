import { AnnualFigures } from './api';

/**
 * The annual congregation report (S-10) as a sheet to copy from.
 *
 * A draft, not a substitute for the form: the figures the app can work out are
 * printed with the people behind each one listed underneath, and the parts it
 * cannot know are printed as empty ruled lines to be filled in by hand. Naming
 * the people matters on paper for the same reason it matters on screen — the
 * secretary checks a figure by recognising who is in it, and once the sheet is
 * away from the app that is the only way left to check.
 */
export function buildAnnualReportPdfHtml(opts: {
  figures: AnnualFigures;
  attendance: { midweek: number | null; weekend: number | null };
  congregationName: string;
  labels: {
    title: string;
    serviceYear: string;
    attendanceSection: string;
    midweek: string;
    weekend: string;
    publishersSection: string;
    active: string;
    becameInactive: string;
    reactivated: string;
    circumstancesSection: string;
    deaf: string;
    blind: string;
    imprisoned: string;
    byHandSection: string;
    byHandItems: string[];
    reportsPerMonth: string;
    printed: string;
    draftNote: string;
  };
  monthName: (isoMonth: string) => string;
  printedOn: string;
}): string {
  const {
    figures: f,
    attendance,
    congregationName,
    labels,
    monthName,
    printedOn,
  } = opts;

  const figure = (
    label: string,
    people: { id: string; name: string; month?: string }[],
  ) => `<tr>
      <td class="lbl">${esc(label)}</td>
      <td class="val">${people.length}</td>
    </tr>
    ${
      people.length
        ? `<tr class="names"><td colspan="2">${people
            .map(
              (p) =>
                esc(p.name) +
                (p.month ? ` <span class="mo">(${esc(monthName(p.month))})</span>` : ''),
            )
            .join(' · ')}</td></tr>`
        : ''
    }`;

  const monthsRow = f.monthlyReporters
    .map(
      (m) =>
        `<td><div class="mc">${m.count}</div><div class="mn">${esc(
          monthName(m.month),
        )}</div></td>`,
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    labels.title,
  )}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { padding: 14px 16px 16px; }
  .pagehead { border-bottom: 3px solid #0e7490; padding-bottom: 7px; margin-bottom: 8px; }
  .pagehead h1 { font-size: 16px; margin: 0; color: #0e7490; letter-spacing: -0.2px; }
  .pagehead .sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .draft {
    font-size: 9px; color: #92400e; background: #fffbeb;
    border: 1px solid #fde68a; border-radius: 6px; padding: 5px 8px; margin-bottom: 12px;
  }
  .sect { margin-bottom: 14px; }
  .slabel {
    display: inline-block; font-size: 12px; font-weight: 700; color: #fff;
    background: #0e7490; border-radius: 999px; padding: 4px 13px; margin-bottom: 6px;
  }
  table { width: 100%; border-collapse: collapse; }
  td.lbl { font-size: 10.5px; padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
  td.val {
    font-size: 13px; font-weight: 700; color: #0e7490; text-align: right;
    width: 60px; padding: 6px 8px; border-bottom: 1px solid #f1f5f9;
  }
  tr.names td {
    font-size: 8.5px; color: #64748b; padding: 0 8px 6px;
    border-bottom: 1px solid #f1f5f9; line-height: 1.5;
  }
  .mo { color: #94a3b8; }
  table.months { table-layout: fixed; }
  table.months td { text-align: center; padding: 3px 1px; }
  .mc { font-size: 11px; font-weight: 700; color: #0e7490; }
  .mn { font-size: 7.5px; color: #94a3b8; text-transform: capitalize; }
  .byhand div {
    border-bottom: 1px solid #cbd5e1; font-size: 10px; color: #334155;
    padding: 10px 4px 3px; margin-bottom: 4px;
  }
  .foot {
    margin-top: 10px; padding-top: 7px; border-top: 1px solid #eef2f6;
    font-size: 9px; color: #94a3b8; text-align: right;
  }
  @page { size: A4 portrait; margin: 10mm; }
</style></head>
<body>
  <section class="page">
    <div class="pagehead">
      <h1>${esc(labels.title)}</h1>
      <div class="sub">${esc(congregationName)} · ${esc(labels.serviceYear)}</div>
    </div>
    <div class="draft">${esc(labels.draftNote)}</div>

    <div class="sect">
      <div class="slabel">${esc(labels.attendanceSection)}</div>
      <table>
        <tr><td class="lbl">${esc(labels.midweek)}</td><td class="val">${
          attendance.midweek ?? ''
        }</td></tr>
        <tr><td class="lbl">${esc(labels.weekend)}</td><td class="val">${
          attendance.weekend ?? ''
        }</td></tr>
      </table>
    </div>

    <div class="sect">
      <div class="slabel">${esc(labels.publishersSection)}</div>
      <table>
        ${figure(labels.active, f.active)}
        ${figure(labels.becameInactive, f.becameInactive)}
        ${figure(labels.reactivated, f.reactivated)}
      </table>
      <div style="margin-top:8px">
        <div class="mn" style="font-size:8.5px;color:#64748b;margin-bottom:2px">${esc(
          labels.reportsPerMonth,
        )}</div>
        <table class="months"><tr>${monthsRow}</tr></table>
      </div>
    </div>

    <div class="sect">
      <div class="slabel">${esc(labels.circumstancesSection)}</div>
      <table>
        ${figure(labels.deaf, f.deaf)}
        ${figure(labels.blind, f.blind)}
        ${figure(labels.imprisoned, f.imprisoned)}
      </table>
    </div>

    <div class="sect byhand">
      <div class="slabel">${esc(labels.byHandSection)}</div>
      ${labels.byHandItems.map((i) => `<div>${esc(i)}</div>`).join('')}
    </div>

    <div class="foot">${esc(labels.printed)} ${esc(printedOn)}</div>
  </section>
</body></html>`;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
