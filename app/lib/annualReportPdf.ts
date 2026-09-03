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
 * TWO THINGS CARRY THE DESIGN.
 *
 * The first is the separation. What goes ON the form comes first, in the
 * form's own order; everything the app offers BESIDE it — who is inactive as
 * things stand, and whom it cannot judge — sits in a marked-off block at the
 * end. That is the whole point of the page, and it was learned the hard way:
 * the secretary read the app's «стали неактивными» as «сколько неактивных»,
 * answered the form with it, and the two questions are different.
 *
 * The second is the app's own colour language, the one described in the
 * branding notes: colour says WHAT a thing is. Attendance belongs to the
 * meetings and takes their orange; the publisher figures take the violet that
 * publishers carry everywhere else; the brand teal is the masthead and nothing
 * else. A secretary who has been reading violet publisher rows all year should
 * not have to learn a second scheme on paper.
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
    /** The block at the end: what the app knows but the form does not ask. */
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

  // The twelve months as a strip of bars. The count alone hides the one thing
  // the secretary must notice — that the last month is still being collected —
  // and a column visibly half the height of its neighbours says it at a glance.
  const counts = f.monthlyReporters.map((m) => m.count);
  const peak = Math.max(1, ...counts);
  const monthsRow = f.monthlyReporters
    .map((m) => {
      const h = Math.max(3, Math.round((m.count / peak) * 26));
      return `<td>
        <div class="mc">${m.count}</div>
        <div class="bar"><i style="height:${h}px"></i></div>
        <div class="mn">${esc(monthName(m.month))}</div>
      </td>`;
    })
    .join('');

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
    font-family: 'Manrope', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { padding: 0; }

  /* The brand mark of the app, and the only place the teal appears. */
  .masthead {
    background: linear-gradient(105deg, #0fa8c4 0%, #0e7490 55%, #0b5a70 100%);
    color: #fff; border-radius: 10px; padding: 13px 16px 12px;
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 16px;
  }
  .masthead h1 { font-size: 17px; font-weight: 800; margin: 0; letter-spacing: -0.2px; }
  .masthead .yr { font-size: 10.5px; opacity: 0.82; margin-top: 3px; }
  .masthead .who { font-size: 12px; font-weight: 700; text-align: right; }

  .draft {
    font-size: 9px; color: #92400e; background: #fffbeb;
    border: 1px solid #fde68a; border-left: 3px solid #f59e0b;
    border-radius: 6px; padding: 6px 9px; margin: 9px 0 13px;
  }

  section { margin-bottom: 15px; break-inside: avoid; }
  h2 {
    font-size: 9.5px; font-weight: 800; margin: 0 0 5px;
    letter-spacing: 0.06em; text-transform: uppercase;
    display: flex; align-items: center; gap: 7px;
  }
  h2::before {
    content: ''; width: 13px; height: 3px; border-radius: 2px;
    background: currentColor; flex: none;
  }
  /* Colour says WHAT a thing is: meetings orange, publishers violet. */
  .s-att { color: #c2410c; }
  .s-pub { color: #6d28d9; }
  .s-cir { color: #0e7490; }
  .s-hand { color: #475569; }

  table { width: 100%; border-collapse: collapse; }
  td.lbl {
    font-size: 11px; padding: 7px 10px 6px; vertical-align: baseline;
    border-bottom: 1px solid #eef2f7;
  }
  td.val {
    font-size: 16px; font-weight: 800; text-align: right; width: 62px;
    padding: 6px 10px; border-bottom: 1px solid #eef2f7;
    font-variant-numeric: tabular-nums;
  }
  .s-att td.val { color: #c2410c; }
  .s-pub td.val { color: #6d28d9; }
  .s-cir td.val { color: #0e7490; }
  .card {
    background: #fbfcfe; border: 1px solid #eef2f7; border-radius: 8px;
    overflow: hidden;
  }
  .card tr:last-child td { border-bottom: none; }
  .hint {
    font-size: 8.5px; color: #64748b; line-height: 1.45;
    margin-top: 2px; max-width: 120mm;
  }
  tr.names td {
    font-size: 8.5px; color: #475569; padding: 0 10px 7px;
    border-bottom: 1px solid #eef2f7; line-height: 1.65;
  }
  .mo { color: #94a3b8; }
  .sep { color: #cbd5e1; padding: 0 4px; }

  table.months { table-layout: fixed; margin-top: 4px; }
  table.months td { text-align: center; padding: 0 2px; vertical-align: bottom; }
  .mc { font-size: 10px; font-weight: 800; color: #6d28d9; }
  .bar {
    height: 28px; display: flex; align-items: flex-end; justify-content: center;
    margin: 2px 0 3px;
  }
  .bar i {
    display: block; width: 100%; border-radius: 3px 3px 0 0;
    background: linear-gradient(180deg, #a78bfa 0%, #7c3aed 100%);
  }
  .mn { font-size: 7px; color: #94a3b8; }

  .byhand .line {
    border-bottom: 1px dashed #cbd5e1; font-size: 10.5px; color: #334155;
    padding: 13px 2px 3px; margin-bottom: 3px;
  }

  /* Everything the app knows that the form does not ask for. Set apart by a
     tinted panel rather than a rule: on a printed page a block of colour is
     read as «a different kind of thing» before a single word is. */
  .aside {
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-left: 4px solid #94a3b8; border-radius: 8px;
    padding: 11px 13px 4px; margin-top: 18px;
  }
  .aside h2 { color: #475569; }
  .aside td.val { color: #334155; }
  .aside td.lbl, .aside td.val, .aside tr.names td { border-bottom-color: #e7ecf3; }
  .aside tr:last-child td { border-bottom: none; }

  .foot {
    margin-top: 13px; padding-top: 7px; border-top: 1px solid #eef2f7;
    font-size: 8.5px; color: #94a3b8; display: flex;
    justify-content: space-between;
  }
  @page { size: A4 portrait; margin: 11mm; }
</style></head>
<body>
  <div class="page">
    <div class="masthead">
      <div>
        <h1>${esc(labels.title)}</h1>
        <div class="yr">${esc(labels.serviceYear)}</div>
      </div>
      <div class="who">${esc(congregationName)}</div>
    </div>
    <div class="draft">${esc(labels.draftNote)}</div>

    <section class="s-att">
      <h2>${esc(labels.attendanceSection)}</h2>
      <table class="card">
        <tr><td class="lbl">${esc(labels.midweek)}</td><td class="val">${
          attendance.midweek ?? ''
        }</td></tr>
        <tr><td class="lbl">${esc(labels.weekend)}</td><td class="val">${
          attendance.weekend ?? ''
        }</td></tr>
      </table>
    </section>

    <section class="s-pub">
      <h2>${esc(labels.publishersSection)}</h2>
      <table class="card">
        ${figure(labels.active, f.active)}
        ${figure(labels.becameInactive, f.becameInactive)}
        ${figure(labels.reactivated, f.reactivated)}
      </table>
      <div style="margin-top:10px">
        <h2 style="margin-bottom:0">${esc(labels.reportsPerMonth)}</h2>
        <table class="months"><tr>${monthsRow}</tr></table>
      </div>
    </section>

    <section class="s-cir">
      <h2>${esc(labels.circumstancesSection)}</h2>
      <table class="card">
        ${figure(labels.deaf, f.deaf)}
        ${figure(labels.blind, f.blind)}
        ${figure(labels.imprisoned, f.imprisoned)}
      </table>
    </section>

    <section class="byhand s-hand">
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
