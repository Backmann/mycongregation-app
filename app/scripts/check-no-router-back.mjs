/**
 * No `router.back()` in screens (16 November 2026). Opened by a link — a
 * bookmark, a notification, a page reloaded — a screen has nothing behind it
 * in its stack, and `router.back()` then went to Home (the editor of a cut's
 * lines: «Отменить правку» left for Home instead of the proposal). A screen
 * steps back with `goBack(fallback)` from components/NavHistory: the same
 * step as the header's arrow, and the named screen when there is none.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bad = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name)) {
      readFileSync(p, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\brouter\.back\(\)/.test(line) && !/^\s*(\/\/|\*)/.test(line)) bad.push(`${relative(ROOT, p)}:${i + 1}`);
        });
    }
  }
}
for (const d of ['app', 'components']) walk(join(ROOT, d));
// NavHistory itself is where the step back is made.
const found = bad.filter((x) => !x.startsWith(join('components', 'NavHistory')));
if (found.length) {
  console.error('router.back() in a screen — use goBack(fallback) from components/NavHistory:');
  for (const x of found) console.error('  ' + x);
  process.exit(1);
}
console.log('✓ no router.back() in screens: each steps back with a fallback');
