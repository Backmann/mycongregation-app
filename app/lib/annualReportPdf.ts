import { AnnualFigures } from './api';

/**
 * The annual congregation report (S-10) as a sheet to copy from.
 *
 * A draft, not a substitute for the form: the figures the app can work out are
 * printed with the people behind each one listed underneath, and the parts it
 * cannot know are printed as ruled lines to be filled in by hand. Naming the
 * people matters on paper for the same reason it matters on screen — the
 * secretary checks a figure by recognising who is in it, and once the sheet is
 * away from the app that is the only way left to check.
 *
 * The sheet is laid out the way the form is read rather than the way the data
 * happens to be shaped: what goes ON the form comes first, in the form's own
 * order, and everything the app offers BESIDE it — who is inactive as things
 * stand, and whom it cannot judge — sits below a rule, marked as not for the
 * form. That separation is the whole point of the page. It was learned the
 * hard way: the secretary read the app's «became inactive» as «how many are
 * inactive», answered the form with it, and the two questions are different.
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
    /** The block below the rule: what the app knows but the form does not ask. */
    asideSection: string;
    inactiveNow: string;
    inactiveNowHint: string;
    lapseUnknown: string;
    lapseUnknownHint: string;
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

  const names = (people: { id: string; name: string; month?: string }[]) =>
    people.length
      ? `<tr class="names"><td colspan="2">${people
          .map(
            (p) =>
              esc(p.name) +
              (p.month
                ? ` <span class="mo">${esc(monthName(p.month))}</span>`
                : ''),
          )
          .join('<span class="sep">·</span>')}</td></tr>`
      : '';

  const figure = (
    label: string,
    people: { id: string; name: string; month?: string }[],
    hint?: string,
  ) => `<tr>
      <td class="lbl">${esc(label)}${
        hint ? `<div class="hint">${esc(hint)}</div>` : ''
      }</td>
      <td class="val">${people.length}</td>
    </tr>
    ${names(people)}`;

  const monthsRow = f.monthlyReporters
    .map(
      (m) =>
        `<td><div class="mc">${m.count}</div><div class="mn">${esc(
          monthName(m.month),
        )}</div></td>`,
    )
    .join('');

  // Only when there is something to say. An empty aside on a form draft is a
  // question mark where none is needed.
  const aside =
    f.inactiveNow.length > 0 || f.lapseUnknown.length > 0
      ? `<section class="aside">
      <h2>${esc(labels.asideSection)}</h2>
      <table>
        ${figure(labels.inactiveNow, f.inactiveNow, labels.inactiveNowHint)}
        ${
          f.lapseUnknown.length > 0
            ? figure(
                labels.lapseUnknown,
                f.lapseUnknown,
                labels.lapseUnknownHint,
              )
            : ''
        }
      </table>
    </section>`
      : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(
    labels.title,
  )}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    /* Georgia sets the figures on a printed sheet the way a ledger does:
       numerals with a baseline of their own, which reads as a record rather
       than as a screen printed out. */
    font-family: Georgia, 'Times New Roman', serif;
    color: #1c1917;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { padding: 0 4mm; }

  .masthead {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 16px; padding-bottom: 6px; border-bottom: 2px solid #1c1917;
  }
  .masthead h1 {
    font-size: 17px; font-weight: 400; margin: 0; letter-spacing: 0.01em;
  }
  .masthead .who { font-size: 10.5px; color: #57534e; text-align: right; }
  .masthead .who b { font-weight: 400; color: #1c1917; }

  .draft {
    font-size: 9.5px; color: #57534e; font-style: italic;
    padding: 7px 0 0; margin-bottom: 14px;
  }

  section { margin-bottom: 16px; break-inside: avoid; }
  h2 {
    font-size: 10px; font-weight: 700; margin: 0 0 4px;
    letter-spacing: 0.04em; color: #78716c;
  }

  table { width: 100%; border-collapse: collapse; }
  td.lbl {
    font-size: 11px; padding: 7px 0 6px; vertical-align: baseline;
    border-bottom: 1px solid #e7e5e4;
  }
  td.val {
    font-size: 15px; text-align: right; width: 56px;
    padding: 7px 0 6px; border-bottom: 1px solid #e7e5e4;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    font-size: 8.5px; color: #78716c; font-style: italic;
    line-height: 1.45; margin-top: 2px; max-width: 128mm;
  }
  tr.names td {
    font-size: 9px; color: #44403c; padding: 0 0 7px;
    border-bottom: 1px solid #e7e5e4; line-height: 1.6;
  }
  .mo { color: #a8a29e; }
  .sep { color: #d6d3d1; padding: 0 5px; }

  table.months { table-layout: fixed; margin-top: 3px; }
  table.months td { text-align: center; padding: 2px 1px; }
  .mc { font-size: 12px; font-variant-numeric: tabular-nums; }
  .mn { font-size: 7.5px; color: #a8a29e; text-transform: lowercase; }

  .byhand .line {
    border-bottom: 1px solid #a8a29e; font-size: 10.5px;
    padding: 12px 0 3px; margin-bottom: 3px;
  }

  /* Below the rule: everything the app knows that the form does not ask for.
     A double rule, not a colour — this has to survive a black-and-white
     printer, which is what a Kingdom Hall office has. */
  .aside {
    border-top: 3px double #1c1917; padding-top: 9px; margin-top: 20px;
  }

  .foot {
    margin-top: 14px; padding-top: 6px; border-top: 1px solid #e7e5e4;
    font-size: 8.5px; color: #a8a29e; display: flex;
    justify-content: space-between;
  }
  @page { size: A4 portrait; margin: 12mm; }
</style></head>
<body>
  <div class="page">
    <div class="masthead">
      <h1>${esc(labels.title)}</h1>
      <div class="who"><b>${esc(congregationName)}</b><br>${esc(
        labels.serviceYear,
      )}</div>
    </div>
    <div class="draft">${esc(labels.draftNote)}</div>

    <section>
      <h2>${esc(labels.attendanceSection)}</h2>
      <table>
        <tr><td class="lbl">${esc(labels.midweek)}</td><td class="val">${
          attendance.midweek ?? ''
        }</td></tr>
        <tr><td class="lbl">${esc(labels.weekend)}</td><td class="val">${
          attendance.weekend ?? ''
        }</td></tr>
      </table>
    </section>

    <section>
      <h2>${esc(labels.publishersSection)}</h2>
      <table>
        ${figure(labels.active, f.active)}
        ${figure(labels.becameInactive, f.becameInactive)}
        ${figure(labels.reactivated, f.reactivated)}
      </table>
      <div style="margin-top:9px">
        <h2 style="margin-bottom:1px">${esc(labels.reportsPerMonth)}</h2>
        <table class="months"><tr>${monthsRow}</tr></table>
      </div>
    </section>

    <section>
      <h2>${esc(labels.circumstancesSection)}</h2>
      <table>
        ${figure(labels.deaf, f.deaf)}
        ${figure(labels.blind, f.blind)}
        ${figure(labels.imprisoned, f.imprisoned)}
      </table>
    </section>

    <section class="byhand">
      <h2>${esc(labels.byHandSection)}</h2>
      ${labels.byHandItems.map((i) => `<div class="line">${esc(i)}</div>`).join('')}
    </section>

    ${aside}

    <div class="foot">
      <span>${esc(congregationName)}</span>
      <span>${esc(labels.printed)} ${esc(printedOn)}</span>
    </div>
  </div>
</body></html>`;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
