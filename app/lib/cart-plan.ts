import type { CartArchive, CartDayView, CartSpan, CartWeekView } from './api';
import { liveSpans, toHHMM, toMin } from './cart-time';

/**
 * The plan of a week at the stand, as the brother who arranges it used to
 * draw it for the WhatsApp group (2 November 2026): for each day and place,
 * the stretches of time in which the crew does not change, and who stands
 * in each. Names and times only — never a telephone number.
 */

export interface Stretch extends CartSpan {
  names: string[];
}

/** «Ланг Т.» — the surname and the first letter of the first name. */
export function shortName(full: string): string {
  const [last, ...rest] = full.trim().split(/\s+/);
  const first = rest.join(' ');
  return first ? `${last} ${first.charAt(0)}.` : last;
}

/** The day cut where somebody comes or goes; each piece with its crew. */
export function stretches(day: CartDayView): Stretch[] {
  const people = (day.plan ?? []).flatMap((p) =>
    liveSpans(day, [p]).map((s) => ({ ...s, name: shortName(p.name) })),
  );
  const cuts = new Set<number>([toMin(day.startTime), toMin(day.endTime)]);
  for (const p of people) {
    cuts.add(toMin(p.startTime));
    cuts.add(toMin(p.endTime));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Stretch[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const names = people
      .filter((p) => toMin(p.startTime) <= a && b <= toMin(p.endTime))
      .map((p) => p.name);
    const last = out[out.length - 1];
    // Neighbouring pieces with the same crew are one.
    if (last && last.names.join('|') === names.join('|') && toMin(last.endTime) === a) {
      last.endTime = toHHMM(b);
    } else {
      out.push({ startTime: toHHMM(a), endTime: toHHMM(b), names });
    }
  }
  return out;
}

/** The days of the week that have anything to say, in order. */
export function planDays(week: CartWeekView): CartDayView[] {
  return [...week.days].sort((a, b) =>
    `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
  );
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface PlanWords {
  title: string;
  nobody: string;
  calledOff: string;
  dayLabel: (iso: string) => string;
}

/** The plan as a message for the group. */
export function planText(week: CartWeekView, w: PlanWords): string {
  const lines = [w.title];
  for (const d of planDays(week)) {
    lines.push('', `*${w.dayLabel(d.date)} · ${d.locationName}*`);
    for (const s of stretches(d)) {
      const off = d.cancellations.some(
        (c) => toMin(c.startTime) <= toMin(s.startTime) && toMin(s.endTime) <= toMin(c.endTime),
      );
      lines.push(
        `${s.startTime}–${s.endTime} ${off ? w.calledOff : s.names.length ? s.names.join(', ') : w.nobody}`,
      );
    }
  }
  return lines.join('\n');
}

/** The plan as a printable sheet: days with their place across, time down. */
export function planHtml(week: CartWeekView, w: PlanWords, fontFaces: string): string {
  const cols = planDays(week)
    .map((d) => {
      const rows = stretches(d)
        .map((s) => {
          const off = d.cancellations.some(
            (c) => toMin(c.startTime) <= toMin(s.startTime) && toMin(s.endTime) <= toMin(c.endTime),
          );
          return `<div class="row${off ? ' off' : ''}"><b>${s.startTime}–${s.endTime}</b><span>${
            off ? esc(w.calledOff) : s.names.length ? esc(s.names.join(', ')) : '—'
          }</span></div>`;
        })
        .join('');
      return `<div class="col"><div class="head">${esc(w.dayLabel(d.date))}<br><small>${esc(
        d.locationName,
      )}</small></div>${rows}</div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(w.title)}</title>
<style>${fontFaces}
@page { size: A4 landscape; margin: 12mm; }
body { font-family: 'Manrope_400Regular', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; margin: 0; }
h1 { font-family: 'Manrope_700Bold', sans-serif; font-weight: normal; font-size: 15pt; margin: 0 0 8pt; color: #15803d; }
.grid { display: grid; grid-template-columns: repeat(${Math.max(1, Math.min(week.days.length, 7))}, minmax(0, 1fr)); border: 1px solid #cbd5e1; }
.col { border-right: 1px solid #cbd5e1; }
.col:last-child { border-right: 0; }
.head { background: #f0fdf4; padding: 6pt; font-family: 'Manrope_700Bold', sans-serif; font-size: 10pt; border-bottom: 1px solid #cbd5e1; }
.head small { font-family: 'Manrope_400Regular', sans-serif; color: #15803d; }
.row { padding: 5pt 6pt; border-bottom: 1px solid #e2e8f0; display: flex; flex-direction: column; font-size: 9.5pt; }
.row b { font-family: 'Manrope_700Bold', sans-serif; font-weight: normal; }
.off span { text-decoration: line-through; color: #64748b; }
</style></head><body><h1>${esc(w.title)}</h1><div class="grid">${cols}</div></body></html>`;
}

export interface ArchiveWords {
  title: string;
  period: string;
  totals: string;
  byPlace: string;
  calledOff: string;
  days: string;
  dayLabel: (iso: string) => string;
  hours: (minutes: number) => string;
}

/** The archive for the circuit overseer: the totals, then day by day. */
export function archiveHtml(a: CartArchive, w: ArchiveWords, fontFaces: string): string {
  const days = a.days
    .map(
      (d) =>
        `<tr><td>${esc(w.dayLabel(d.date))}</td><td>${esc(d.place)}</td><td>${d.people
          .map((p) => `${esc(p.name)} ${p.startTime}–${p.endTime}`)
          .join('<br>')}</td><td class="n">${esc(w.hours(d.minutes))}</td></tr>`,
    )
    .join('');
  const places = a.totals.byPlace
    .map((p) => `<tr><td>${esc(p.place)}</td><td class="n">${p.days}</td><td class="n">${esc(w.hours(p.minutes))}</td></tr>`)
    .join('');
  const off = a.totals.calledOff
    .map((c) => `<li>${esc(w.dayLabel(c.date))} · ${esc(c.place)} · ${c.startTime}–${c.endTime}${c.reason ? ` · ${esc(c.reason)}` : ''}</li>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(w.title)}</title>
<style>${fontFaces}
@page { size: A4; margin: 14mm; }
body { font-family: 'Manrope_400Regular', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; font-size: 10pt; }
h1 { font-family: 'Manrope_700Bold', sans-serif; font-weight: normal; font-size: 15pt; color: #15803d; margin: 0 0 2pt; }
h2 { font-family: 'Manrope_700Bold', sans-serif; font-weight: normal; font-size: 11.5pt; margin: 14pt 0 6pt; }
table { border-collapse: collapse; width: 100%; }
td, th { border-bottom: 1px solid #e2e8f0; padding: 4pt 6pt; vertical-align: top; text-align: left; }
th { font-family: 'Manrope_700Bold', sans-serif; font-weight: normal; background: #f0fdf4; }
.n { text-align: right; white-space: nowrap; }
.muted { color: #475569; }
</style></head><body>
<h1>${esc(w.title)}</h1><div class="muted">${esc(w.period)}</div>
<h2>${esc(w.totals)}</h2>
<table><tbody><tr><th>${esc(w.byPlace)}</th><th class="n">${esc(w.days)}</th><th class="n"></th></tr>${places}</tbody></table>
${off ? `<h2>${esc(w.calledOff)}</h2><ul>${off}</ul>` : ''}
<h2>${esc(w.days)}</h2>
<table><tbody>${days}</tbody></table>
</body></html>`;
}

