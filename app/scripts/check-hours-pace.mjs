#!/usr/bin/env node
/**
 * The pace line under a pioneer's hours on Home (9 November 2026):
 * lib/hours-pace.ts, run against the days it must get right.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'hours-pace-'));
const src = readFileSync(join(ROOT, 'lib', 'hours-pace.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'hours-pace.mjs'), js);
const { paceHours } = await import(pathToFileURL(join(out, 'hours-pace.mjs')).href);

const cases = [
  // [goal, today, expected, why]
  [50, '2026-11-01', 0, 'the first day: nothing expected yet'],
  [50, '2026-11-09', 13, '8 of 30 days gone: 50 × 8 / 30 = 13.3'],
  [50, '2026-11-30', 48, 'the last day: 29 of 30 gone'],
  [50, '2027-02-15', 25, 'February has 28 days: 50 × 14 / 28'],
  [30, '2028-02-29', 29, 'a leap year: 29 days, 28 gone'],
  [15, '2026-12-16', 7, 'an auxiliary goal of 15: 15 × 15 / 31 = 7.3'],
];
let bad = 0;
for (const [goal, today, want, why] of cases) {
  const got = paceHours(goal, today);
  if (got !== want) {
    bad += 1;
    console.error(`✗ paceHours(${goal}, ${today}) = ${got}, ожидалось ${want} — ${why}`);
  }
}
if (bad) {
  console.error(`✗ Темп учёта часов: ${bad} из ${cases.length} неверно`);
  process.exit(1);
}
console.log(`✓ Темп учёта часов: ${cases.length} случаев`);
