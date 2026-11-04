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

/** Still to be moved onto the rules, with today's count. Lower, never raise. */
const STILL_TO_MOVE = {
  'app/(app)/cart/co-schedule.tsx': 2,
  'app/(app)/publishers/duties.tsx': 2,
  'app/(app)/schedule/edit.tsx': 9,
  'app/(app)/schedule/index.tsx': 2,
  'app/(app)/special-events/index.tsx': 17,
  'components/DutiesMeetingEditor.tsx': 2,
  'components/EventDetailSections.tsx': 9,
  'components/SpecialEventDetail.tsx': 1,
  'components/SpecialEventForm.tsx': 9,
  'lib/congregation-lines.ts': 4,
  'lib/event-view.ts': 2,
  'lib/home-timeline.ts': 2,
};

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
    const allowed = STILL_TO_MOVE[rel] ?? 0;
    if (n > allowed) over.push(`${rel}: ${n} (можно ${allowed})`);
    else if (n < allowed) stale.push(`${rel}: теперь ${n}, в списке ${allowed}`);
  }
}
for (const rel of Object.keys(STILL_TO_MOVE)) {
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
    'Копий стало меньше — уменьшите число в STILL_TO_MOVE (scripts/check-meeting-day.mjs), ' +
      'чтобы они не вернулись:\n  ' +
      stale.join('\n  '),
  );
}
if (over.length > 0 || stale.length > 0) process.exit(1);
console.log(
  `OK: meeting day and hour come from the week rules (${Object.keys(STILL_TO_MOVE).length} files still to move).`,
);
