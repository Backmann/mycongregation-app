#!/usr/bin/env node
/**
 * A calendar day must never be cut out of a UTC timestamp.
 *
 * `new Date().toISOString().slice(0, 10)` reads as "today" and is not: it is
 * today in UTC. In a German summer, between midnight and 02:00, that is
 * yesterday. Four of these had settled into the app — the worst being the
 * default `effectiveFrom` of a new meeting-settings version, where a date one
 * day early changes retroactively which day the last meeting was held on.
 *
 * `lib/dates.ts` already does this correctly: `formatDateISO(new Date())`
 * builds the string from the device's own year, month and day, and the same
 * file explains why every date in this app is compared as a 'YYYY-MM-DD'
 * string. The failure was never a missing helper — it was that nothing looked.
 *
 * The rule is about the DATE, not about `new Date()`. Taking the current
 * moment stays ordinary; turning it into a calendar day is the step that goes
 * wrong.
 *
 * Called DIRECTLY from CI and from the local gate, never through a new entry
 * in package.json `scripts` — that block is an input to the Expo fingerprint,
 * and a change there sends every later over-the-air update to a runtime no
 * installed app has. That already cost four releases in a row on 3 August.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SEARCH = ['app', 'components', 'lib', 'scripts'];

/** Cutting a calendar day (or month) out of a UTC timestamp, however spelled. */
const PATTERNS = [
  /new Date\((?:\s*Date\.now\(\)\s*)?\)\s*\.toISOString\(\)\s*\.(?:slice|substring|substr)\(\s*0\s*,\s*(?:7|10)\s*\)/,
  /new Date\((?:\s*Date\.now\(\)\s*)?\)\s*\.toISOString\(\)\s*\.split\(\s*['"]T['"]\s*\)/,
];

/** This file quotes the pattern in order to forbid it. */
const EXEMPT = new Set(['scripts/check-dates.mjs']);

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const base of SEARCH) {
  for (const file of sourceFiles(join(ROOT, base))) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (EXEMPT.has(rel)) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (PATTERNS.some((p) => p.test(line))) offenders.push(`${rel}:${i + 1}`);
      });
  }
}

if (offenders.length > 0) {
  console.error(
    'A calendar day is being cut out of a UTC timestamp. Use ' +
      'formatDateISO(new Date()) from lib/dates.ts instead:',
  );
  for (const o of offenders) console.error('  ' + o);
  process.exit(1);
}

console.log(`OK: no UTC calendar dates (${SEARCH.join(', ')} scanned).`);
