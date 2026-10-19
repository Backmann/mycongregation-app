#!/usr/bin/env node
/**
 * «Назад» ведёт туда, откуда пришли (lib/nav-history.ts), pinned
 * (19 October 2026): the history of where the person stood, what back does
 * from each kind of screen, and which section opens at its start when its tab
 * is pressed. Called directly from the gate, never through a new npm script
 * (that block is an input to the Expo fingerprint).
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'nav-history-'));
const src = readFileSync(join(ROOT, 'lib', 'nav-history.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'nav-history.mjs'), js);
const N = await import(pathToFileURL(join(out, 'nav-history.mjs')));

let n = 0;
const check = (name, fn) => {
  fn();
  n += 1;
};
const e = (path, query = '') => ({ path, query });
const walk = (...entries) => entries.reduce((h, x) => N.stepped(h, x), []);

check('sections and their first screens', () => {
  assert.equal(N.tabOf('/schedule/conduct'), 'schedule');
  assert.equal(N.tabOf('/home'), 'home');
  assert.ok(N.isTabRoot('/schedule'));
  assert.ok(!N.isTabRoot('/schedule/edit'));
  assert.equal(N.hrefOf(e('/schedule/conduct', 'week=2026-10-19')), '/schedule/conduct?week=2026-10-19');
});

check('the history: a step forward is added, a step back taken off', () => {
  const h = walk(e('/home'), e('/home/inbox'), e('/home'));
  assert.deepEqual(h.map((x) => x.path), ['/home'], 'back from the inbox is no new step');
  const q = walk(e('/schedule'), e('/schedule/conduct', 'week=a'), e('/schedule/conduct', 'week=b'));
  assert.deepEqual(q.map((x) => x.query), ['', 'week=b'], 'another week on the same screen replaces the step');
  const long = walk(...Array.from({ length: 80 }, (_, i) => e(`/p/${i}`)));
  assert.equal(long.length, 60, 'kept short');
});

check('within a section back closes the screen (no copy of the parent pushed — the home screen arrow)', () => {
  const h = walk(e('/home'), e('/home/inbox'));
  assert.deepEqual(N.planBack({ history: h, stackDepth: 2, fallback: '/home' }), { kind: 'pop' });
});

check('a screen opened from another section goes back there, not to its own parent', () => {
  // Home → an event: back to Home, not to the Programme.
  const h = walk(e('/home'), e('/special-events/12'));
  assert.deepEqual(N.planBack({ history: h, stackDepth: 1, fallback: '/special-events' }), {
    kind: 'leave',
    pop: false,
    href: '/home',
  });
  // A group → a publisher's card, pushed on the roster's stack: closed there, back to the group.
  const g = walk(e('/service-groups/5'), e('/publishers/9'));
  assert.deepEqual(N.planBack({ history: g, stackDepth: 3, fallback: '/publishers' }), {
    kind: 'leave',
    pop: true,
    href: '/service-groups/5',
  });
  // …with the query it had.
  const c = walk(e('/schedule/conduct', 'kind=weekend&week=2026-10-19'), e('/publishers/duties'));
  assert.equal(N.planBack({ history: c, stackDepth: 2, fallback: '/publishers' }).href, '/schedule/conduct?kind=weekend&week=2026-10-19');
});

check('a section\'s first screen, reached by its tab: back returns to the section before (Android)', () => {
  const h = walk(e('/home'), e('/schedule'));
  assert.deepEqual(N.planBack({ history: h, stackDepth: 1, fallback: '' }), { kind: 'leave', pop: false, href: '/home' });
  const only = walk(e('/home'));
  assert.deepEqual(N.planBack({ history: only, stackDepth: 1, fallback: '' }), { kind: 'none' }, 'the first screen: the app is left');
});

check('no history (opened from a notification): the screen\'s parent', () => {
  const h = walk(e('/special-events/12'));
  assert.deepEqual(N.planBack({ history: h, stackDepth: 1, fallback: '/special-events' }), {
    kind: 'popTo',
    href: '/special-events',
  });
  const t = walk(e('/tasks'));
  assert.deepEqual(N.planBack({ history: t, stackDepth: 1, fallback: '/home' }), { kind: 'leave', pop: false, href: '/home' });
});

check('a tab whose top screen came from another section opens at its start', () => {
  let f = new Set();
  let h = walk(e('/home'), e('/profile/my-tasks'));
  f = N.foreignAfter(f, h);
  assert.ok(f.has('profile'), 'my tasks, opened from Home, is foreign to Profile');
  h = N.stepped(h, e('/profile'));
  f = N.foreignAfter(f, h);
  assert.ok(!f.has('profile'), 'back at its start: nothing foreign left');
  let g = walk(e('/profile'), e('/profile/contacts'));
  assert.ok(!N.foreignAfter(new Set(), g).has('profile'), 'opened inside Profile: kept');
});

console.log(`nav-history: ${n} groups ok`);
