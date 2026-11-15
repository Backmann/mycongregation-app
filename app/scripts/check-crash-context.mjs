/**
 * A failure must be traceable even without a stack (15 November 2026: «NetworkError:
 * A network error occurred.» on the sign-in screen came with no stack and
 * nothing else, and could not be traced). lib/crash-report.ts must send,
 * with every report, which event caught it, whether the device was online,
 * the file the browser names and the seconds since the start — and each of
 * its handlers must say which event it is.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** What is missing from the source; empty when all is there. */
export function missing(src) {
  const out = [];
  const body = src.match(/body: JSON\.stringify\(\{([\s\S]*?)\}\),/);
  if (!body) return ['the report body (body: JSON.stringify({...}))'];
  for (const field of ['event', 'online', 'place', 'sinceStartS'])
    if (!new RegExp(`\\b${field}\\s*:`).test(body[1])) out.push(`the field «${field}» in the report`);
  const handlers = [
    ["window 'error'", /addEventListener\(\s*'error'[\s\S]*?event: 'error'[\s\S]*?place: placeOf\(/],
    ["window 'unhandledrejection'", /addEventListener\(\s*'unhandledrejection'[\s\S]*?event: 'rejection'/],
    ['the phone handler', /setGlobalHandler\([\s\S]*?reportCrash\('uncaught', e, \{ event: 'handler' \}\)/],
  ];
  for (const [name, re] of handlers) if (!re.test(src)) out.push(`the event of ${name}`);
  return out;
}

const src = readFileSync(join(ROOT, 'lib', 'crash-report.ts'), 'utf8');

// The check checks itself: the report as it was before is caught.
const before = src
  .replace(/\n\s*event: ctx\.event[^\n]*/, '')
  .replace("{ event: 'rejection' }", '{}');
const caught = missing(before);
if (!caught.includes('the field «event» in the report') || !caught.includes("the event of window 'unhandledrejection'")) {
  console.error(`✗ the check does not catch a report without its context: ${JSON.stringify(caught)}`);
  process.exit(1);
}

const found = missing(src);
if (found.length) {
  for (const f of found) console.error(`✗ lib/crash-report.ts: missing ${f}`);
  process.exit(1);
}
console.log('✓ crash reports carry how they were caught (4 fields, 3 handlers)');
