#!/usr/bin/env node
/**
 * Which day and hour a meeting has is asked of the week rules — never worked
 * out from the settings (4 November 2026).
 *
 * The settings say what the congregation INTENDS: Wednesday 19:00, Sunday
 * 10:00. A circuit visit moves the midweek meeting, a convention cancels the
 * week, the Memorial takes one meeting, an event may keep a meeting «with
 * changes» at another hour — and next, a meeting may be moved for one week.
 * `lib/week-rules.ts` knows all of that (`meetingOf`, `dateOf`, `timeOf`,
 * `placeOf`); a screen that reads `midweekDow` itself knows none of it. The
 * week/day audit of 4 November found about twenty such places in the app.
 *
 * So the fields are counted, file by file. The rules, the API types, the
 * settings editor and the journal (which names the settings fields) may read
 * them freely. Every other file is listed with the number it has today: that
 * number may only go DOWN, and a file not listed may not start. When a copy is
 * removed, lower its number here so it cannot come back — the check says so.
 *
 * The server keeps the same ratchet in src/common/meeting-day.guard.spec.ts.
 *
 * Called directly from the gate, never through package.json `scripts` (that
 * block is an input to the Expo fingerprint).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SEARCH = ['app', 'components', 'lib'];

/** A meeting's day or hour read off a settings version, or the visit's day written out again. */
const PATTERN =
  /\b(?:midweekDow|weekendDow|midweekTime|weekendTime)\b|coMidweekDow\s*\?\?\s*2\b/g;

/** Where the fields simply belong. */
const FREE = new Set([
  'lib/week-rules.ts',
  'lib/api.ts',
  'app/(app)/publishers/meeting-settings.tsx',
  // Names the settings fields in the change log.
  'app/(app)/publishers/journal.tsx',
]);

/**
 * Files that read the USUAL ORDER on purpose (5 November 2026) — not a week's
 * meeting but what the congregation normally does: «Ср 19:00 · Вс 10:00»,
 * «встречи по средам» on a printed sheet, the usual day in an event form,
 * the meetings a convention week would have had. Each with its reason and
 * today's count; the count may only go down, and nothing else may join
 * without a reason written here.
 */
const READS_THE_USUAL_ORDER = {
  // «Начало в 18:30» is said when a week's hour differs from the usual one,
  // and the sheet's subtitle names the usual weekday.
  'app/(app)/schedule/edit.tsx': 4,
  // The visit page says «обычно по средам»; the convention page names the
  // meetings its weeks would have had.
  'components/EventDetailSections.tsx': 4,
  // The event form: the usual weekday chip and the visit week's start; its
  // summary for a visit takes the usual midweek hour.
  'components/SpecialEventForm.tsx': 9,
  // «Ср 19:00 · Вс 10:00» — and «На этой неделе: …» when the week differs.
  'lib/congregation-lines.ts': 12,
  // Which meeting an event «with changes» belongs to: by the kind of day.
  'lib/event-view.ts': 1,
};

/**
 * Still to be moved onto the rules, with today's count. Lower, never raise.
 * Empty since 5 November 2026: every place that shows a week's meeting asks
 * the rules.
 */
const STILL_TO_MOVE = {};

const ALLOWED = { ...READS_THE_USUAL_ORDER, ...STILL_TO_MOVE };

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...files(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const count = (text) => (text.match(PATTERN) ?? []).length;

const over = [];
const stale = [];
const seen = new Set();
for (const dir of SEARCH) {
  for (const file of files(join(ROOT, dir))) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (FREE.has(rel)) continue;
    seen.add(rel);
    const n = count(readFileSync(file, 'utf8'));
    const allowed = ALLOWED[rel] ?? 0;
    if (n > allowed) over.push(`${rel}: ${n} (можно ${allowed})`);
    else if (n < allowed) stale.push(`${rel}: теперь ${n}, в списке ${allowed}`);
  }
}
for (const rel of Object.keys(ALLOWED)) {
  if (!seen.has(rel)) stale.push(`${rel}: файла больше нет`);
}

if (over.length > 0) {
  console.error(
    'День или час встречи взяты прямо из настроек. Спросите правила недели — ' +
      'weekRules(...).meetingOf / dateOf / timeOf / placeOf (lib/week-rules.ts):\n  ' +
      over.join('\n  '),
  );
}
if (stale.length > 0) {
  console.error(
    'Копий стало меньше — уменьшите число в списке (scripts/check-meeting-day.mjs), ' +
      'чтобы они не вернулись:\n  ' +
      stale.join('\n  '),
  );
}
if (over.length > 0 || stale.length > 0) process.exit(1);
console.log(
  `OK: meeting day and hour come from the week rules (${Object.keys(STILL_TO_MOVE).length} files still to move, ${Object.keys(READS_THE_USUAL_ORDER).length} read the usual order on purpose).`,
);
