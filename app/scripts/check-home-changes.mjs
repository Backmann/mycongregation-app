#!/usr/bin/env node
/**
 * «Изменено» on Home (9 November 2026): lib/home-changes.ts, run against the
 * cases it must get right — which row owns which change, what «было» says,
 * and that a first visit marks nothing.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'home-changes-'));
const src = readFileSync(join(ROOT, 'lib', 'home-changes.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'home-changes.mjs'), js);
const { owns, changesFor, beforeBits, removedAhead, unshownCount, entryAgendaIds } = await import(
  pathToFileURL(join(out, 'home-changes.mjs')).href
);

let bad = 0;
let n = 0;
const eq = (got, want, why) => {
  n += 1;
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    bad += 1;
    console.error(`✗ ${why}\n    получено: ${a}\n    ожидалось: ${b}`);
  }
};

const before = { date: '2026-11-11', start: '19:00', title: 'Чтение Библии', with: ['Тимо Ланг'], place: 'Зал' };
const all = {
  first: false,
  changes: [
    { id: 'part:p1', kind: 'new', fields: [], before: null },
    { id: 'part:p2:assistant', kind: 'changed', fields: ['with'], before },
    { id: 'cart:d1:10:00', kind: 'changed', fields: ['start'], before: { ...before, start: '09:00' } },
    { id: 'part:p10', kind: 'new', fields: [], before: null },
    { id: 'duty:x', kind: 'changed', fields: ['date', 'place'], before: { ...before, place: null } },
  ],
  removed: [
    { id: 'part:old', date: '2026-11-08', start: '19:00', title: 'Старое' },
    { id: 'part:b', date: '2026-11-20', start: '19:00', title: 'Позже' },
    { id: 'part:a', date: '2026-11-20', start: '10:00', title: 'Раньше' },
  ],
};

// Which row owns which change.
eq(owns('part:p2', 'part:p2:assistant'), true, 'the assistant row belongs to its part');
eq(owns('cart:d1', 'cart:d1:10:00'), true, 'a cart day owns its shifts');
eq(owns('part:p1', 'part:p10'), false, 'part:p1 is not part:p10 — the prefix needs «:»');
eq(owns('part:p1', 'part:p1'), true, 'the same id');
eq(changesFor(['part:p1'], all).map((c) => c.id), ['part:p1'], 'only its own, not part:p10');
eq(
  changesFor(['part:p1', 'part:p2', null, undefined], all).map((c) => c.id),
  ['part:p2:assistant', 'part:p1'],
  'a meeting with two parts: the changed one first, then the new one',
);
eq(changesFor([], all), [], 'a row without assignments owns nothing');
eq(changesFor(['part:p1'], { ...all, first: true }), [], 'first visit: no marks');
eq(changesFor(['part:p1'], null), [], 'not loaded: no marks');

// What «было» says.
eq(beforeBits(all.changes[0]), null, 'a new one has no «было»');
eq(
  beforeBits(all.changes[1]),
  { date: null, start: null, title: null, with: ['Тимо Ланг'], place: null },
  'only the partner changed: only the partner',
);
eq(
  beforeBits(all.changes[2]),
  { date: null, start: '09:00', title: null, with: null, place: null },
  'only the hour changed: only the hour, not the same day again',
);
eq(
  beforeBits(all.changes[4]),
  { date: '2026-11-11', start: '19:00', title: null, with: null, place: '' },
  'the day moved and there was no place: an empty place, not «unchanged»',
);

// Removed, and what the rows on screen do not show.
eq(
  removedAhead(all, '2026-11-09').map((r) => r.id),
  ['part:a', 'part:b'],
  'past removals dropped; nearest first, by hour on one day',
);
eq(removedAhead({ ...all, first: true }, '2026-11-09'), [], 'first visit: nothing removed');
eq(unshownCount(all, ['part:p1', 'part:p2']), 3, 'cart, part:p10 and the duty are not on screen');
eq(unshownCount(all, ['part:p1', 'part:p2', 'cart:d1', 'part:p10', 'duty:x']), 0, 'all shown');

// A row's own ids, by its kind.
eq(entryAgendaIds({ type: 'meeting', agendaIds: ['part:p1', 'duty:x'] }), ['part:p1', 'duty:x'], 'a meeting: its parts and duties');
eq(entryAgendaIds({ type: 'meeting' }), [], 'a meeting with nothing of his');
eq(entryAgendaIds({ type: 'task', task: { item: { agendaId: 'cart:d1' } } }), ['cart:d1'], 'a task: its item');
eq(entryAgendaIds({ type: 'task', task: { item: {} } }), [], 'an older server: no id, no mark');
eq(
  entryAgendaIds({ type: 'outgoing_talk', talks: [{ item: { agendaId: 'outgoing_talk:a' } }, { item: { agendaId: 'outgoing_talk:b' } }] }),
  ['outgoing_talk:a', 'outgoing_talk:b'],
  'two talks elsewhere on one day: both',
);
eq(entryAgendaIds({ type: 'event' }), [], 'a congregation event is nobody\'s own');

if (bad) {
  console.error(`✗ «Изменено» на Главной: ${bad} из ${n} неверно`);
  process.exit(1);
}
console.log(`✓ «Изменено» на Главной: ${n} случаев`);
