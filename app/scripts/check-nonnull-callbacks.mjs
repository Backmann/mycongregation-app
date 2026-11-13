/**
 * `x!.id` inside a callback, where `x` may be null while the screen renders
 * (13 November 2026, found on the stand: the division screen crashed with
 * «Cannot read properties of null (reading 'id')» before anything was
 * divided). The React compiler memoizes callbacks by what they read and may
 * read `x.id` itself WHILE RENDERING to compare it — the `!` promises it is
 * there. Take a plain value instead: `const xId = x?.id ?? ''`.
 *
 * Flagged: in one file, `const x = …?? null` or `const x = …?.…`, and a
 * callback (`=> … x!.y`). The places below were looked at in the built
 * bundle: the compiler keeps the whole object there, so they do not crash;
 * new ones are not allowed.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KNOWN = new Set([
  'app/stage.tsx next!.week',
  'app/(app)/local-needs/index.tsx nextMeeting!.id',
  'app/(app)/cart/witnessing-day.tsx week!.id',
  'components/local-needs/PlaceSheet.tsx chosenTopic!.id',
]);

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

export function findings(text) {
  const nullable = new Set();
  for (const m of text.matchAll(/const (\w+)(?:\s*:[^=\n]+)?\s*=\s*[^;\n]*(?:\?\?\s*null|\?\.)[^;\n]*;/g)) nullable.add(m[1]);
  const out = [];
  for (const m of text.matchAll(/=>[^\n]*?\b(\w+)!\.(\w+)/g)) {
    if (nullable.has(m[1])) out.push({ line: text.slice(0, m.index).split('\n').length, what: `${m[1]}!.${m[2]}` });
  }
  return out;
}

// The check checks itself: the shape that crashed is found, a plain value is not.
const crashed = "const split = d?.split ?? null;\nconst f = (k) => api.mark(split!.id, k);";
const fixed = "const split = d?.split ?? null;\nconst splitId = split?.id ?? '';\nconst f = (k) => api.mark(splitId, k);";
if (findings(crashed).length !== 1 || findings(fixed).length !== 0) {
  console.error('✗ check-nonnull-callbacks: the self-test failed');
  process.exit(1);
}

const bad = [];
for (const dir of ['app', 'components']) {
  for (const f of files(join(ROOT, dir))) {
    const rel = relative(ROOT, f).split('\\').join('/');
    for (const x of findings(readFileSync(f, 'utf8'))) {
      if (!KNOWN.has(`${rel} ${x.what}`)) bad.push(`${rel}:${x.line} ${x.what}`);
    }
  }
}
if (bad.length) {
  console.error('✗ `x!.y` in a callback where x may be null while rendering — take `const xId = x?.id ?? \'\'`:');
  for (const b of bad) console.error('   ' + b);
  process.exit(1);
}
console.log('✓ no `x!.y` of a value that may be null in a callback');
