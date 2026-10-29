import type { AuxApplicationView, CommitteeSeat } from './api';

/**
 * THE S-205b, AS APPROVED (29 October 2026, mockup screen 8: «Бланк S-205b с
 * инициалами — для документов собрания»). The form's own words, the months
 * and the goal chosen for each, who applied and when — and, where the paper
 * has three dotted lines, the initials of the brothers who approved, each
 * with his place and day. For the congregation's files; it is not sent to
 * the branch.
 *
 * Initials are read from the name as the app writes it, «Фамилия Имя»:
 * Келлер Давид → Д. К.
 */
export function initialsOf(displayName: string | null): string {
  if (!displayName) return '';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0][0]}.`;
  const [last, first] = parts;
  return `${first[0]}. ${last[0]}.`;
}

export function buildS205bHtml(opts: {
  app: AuxApplicationView;
  congregationName: string;
  printedOn: string;
  monthsLabel: string;
  goals: { month: string; hours: number }[];
  fontFaces?: string;
  day: (iso: string) => string;
  labels: {
    kicker: string;
    title: string;
    words1: string;
    words2: string;
    months: string;
    untilCancelled: string;
    goals: string;
    hoursUnit: string;
    date: string;
    applicant: string;
    confirmedInApp: string;
    signedOnPaper: string;
    approvedBy: string;
    seat: (s: CommitteeSeat) => string;
    instead: string;
    unfillable: string;
    note: string;
    printed: string;
  };
}): string {
  const { app, labels: L } = opts;
  const F = "-apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const sent = app.source === 'paper' && app.paperDate ? app.paperDate : app.createdAt;
  const seats = app.seats
    .map((s) => {
      if (!s.approved) {
        return `<div class="seat">
          <div class="sl">${esc(L.seat(s.seat))}</div>
          <div class="ini none">—</div>
          <div class="who">${s.unfillable ? esc(L.unfillable) : ''}</div>
        </div>`;
      }
      return `<div class="seat">
        <div class="sl">${esc(L.seat(s.seat))}${s.open ? ` · ${esc(L.instead)}` : ''}</div>
        <div class="ini">${esc(initialsOf(s.approverName))}</div>
        <div class="who">${esc(s.approverName ?? '')}${
          s.approvedAt ? ` · ${esc(opts.day(s.approvedAt))}` : ''
        }</div>
      </div>`;
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>S-205b · ${esc(app.publisherName)}</title>
<style>
${opts.fontFaces ?? ''}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Manrope_400Regular', ${F}; color: #0f172a;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { border: 1px solid #e2e8f0; border-radius: 14px; padding: 22px 24px; }
  .kick { font-family: 'Manrope_800ExtraBold', ${F}; font-size: 7.5pt; letter-spacing: 1.4px;
    text-transform: uppercase; color: #0e7490; }
  h1 { font-family: 'Manrope_800ExtraBold', ${F}; font-weight: normal; font-size: 17pt;
    margin: 4px 0 14px; letter-spacing: -0.2px; }
  p { font-size: 10pt; line-height: 1.55; margin: 0 0 10px; }
  .row { display: flex; gap: 10px; align-items: baseline; margin: 10px 0; }
  .lbl { font-family: 'Manrope_700Bold', ${F}; font-size: 8pt; color: #64748b;
    text-transform: uppercase; letter-spacing: .6px; min-width: 92px; }
  .val { font-family: 'Manrope_800ExtraBold', ${F}; font-size: 12pt; }
  .box { display: inline-flex; align-items: center; gap: 7px; font-size: 9.5pt; }
  .cb { width: 13px; height: 13px; border: 1.5px solid #0f172a; border-radius: 3px;
    display: inline-flex; align-items: center; justify-content: center; font-size: 9pt; line-height: 1; }
  .goals { display: flex; flex-wrap: wrap; gap: 6px; }
  .goal { font-size: 9pt; border-radius: 999px; padding: 3px 10px; background: #f1f5f9; }
  .goal.r { background: #fef3c7; color: #92400e; }
  .split { display: flex; gap: 22px; margin-top: 16px; padding-top: 14px; border-top: 1px solid #eef2f6; }
  .left { flex: 1.1; }
  .right { flex: 1; }
  .name { font-family: 'Manrope_800ExtraBold', ${F}; font-size: 13pt; }
  .conf { font-size: 8.5pt; color: #15803d; margin-top: 3px; }
  .rt { font-family: 'Manrope_700Bold', ${F}; font-size: 8pt; color: #64748b;
    text-transform: uppercase; letter-spacing: .6px; margin-bottom: 6px; }
  .seat { border-bottom: 1px dotted #94a3b8; padding: 6px 0 5px; }
  .sl { font-size: 7.5pt; color: #64748b; }
  .ini { font-family: 'Manrope_800ExtraBold', ${F}; font-size: 15pt; color: #0e7490; letter-spacing: 1px; }
  .ini.none { color: #cbd5e1; }
  .who { font-size: 7.5pt; color: #475569; min-height: 10px; }
  .note { margin-top: 16px; font-size: 7.5pt; color: #64748b; line-height: 1.5; }
  .foot { margin-top: 10px; font-size: 7pt; color: #94a3b8; display: flex; justify-content: space-between; }
  @page { size: A4 portrait; margin: 14mm; }
</style></head><body>
  <div class="sheet">
    <div class="kick">${esc(L.kicker)}</div>
    <h1>${esc(L.title)}</h1>
    <p>${esc(L.words1)}</p>
    <div class="row"><span class="lbl">${esc(L.months)}</span><span class="val">${esc(opts.monthsLabel)}</span></div>
    <div class="row"><span class="lbl"></span><span class="box"><span class="cb">${
      app.untilCancelled ? '✓' : ''
    }</span>${esc(L.untilCancelled)}</span></div>
    <div class="row"><span class="lbl">${esc(L.goals)}</span><span class="goals">${opts.goals
      .map(
        (g) =>
          `<span class="goal${g.hours === 15 ? ' r' : ''}">${esc(g.month)} · ${g.hours} ${esc(L.hoursUnit)}</span>`,
      )
      .join('')}</span></div>
    <p style="margin-top:12px">${esc(L.words2)}</p>
    <div class="split">
      <div class="left">
        <div class="row"><span class="lbl">${esc(L.date)}</span><span class="val">${esc(opts.day(sent))}</span></div>
        <div class="row"><span class="lbl">${esc(L.applicant)}</span>
          <span><div class="name">${esc(app.publisherName)}</div>
          <div class="conf">${esc(
            app.source === 'paper' ? L.signedOnPaper : L.confirmedInApp,
          )}</div></span></div>
      </div>
      <div class="right">
        <div class="rt">${esc(L.approvedBy)}</div>
        ${seats}
      </div>
    </div>
    <div class="note">${esc(L.note)}</div>
  </div>
  <div class="foot"><span>S-205b · ${esc(opts.congregationName)}</span><span>${esc(L.printed)} ${esc(opts.printedOn)}</span></div>
</body></html>`;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
