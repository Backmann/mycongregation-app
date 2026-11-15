/**
 * The draft of re-cutting as the screens show it (lib/recut.ts, 15 November
 * 2026): the count before and after, the filters, the committee's decision.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-recut-'));
let failures = 0;
let passed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
}
try {
  const src = readFileSync(join(ROOT, 'lib', 'recut.ts'), 'utf8');
  writeFileSync(
    join(out, 'recut.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const r = await import(pathToFileURL(join(out, 'recut.mjs')).href);
  const p = (o) => ({
    kind: 'cut',
    state: 'open',
    territories: [{ held: false, meetingOn: null }],
    parts: [{}, {}, {}],
    lines: [[], []],
    approvedAt: null,
    reopenedAt: null,
    blocks: ['notApproved'],
    remarks: [],
    ...o,
  });
  const cut3 = p({});
  const join3 = p({
    kind: 'merge',
    territories: [
      { held: true, meetingOn: null },
      { held: false, meetingOn: null },
      { held: false, meetingOn: null },
    ],
    parts: [{}],
    lines: null,
    approvedAt: '2026-11-22T10:00:00Z',
    blocks: ['held'],
    remarks: [{ ok: false }, { ok: true }],
  });
  const broken = p({ parts: [], blocks: ['notApproved', 'shape'], reopenedAt: '2026-11-23T10:00:00Z' });
  const applied = p({ state: 'applied' });

  check('111 → 111 + 2 (a cut in three) − 2 (a join of three) + 2 (lines that no longer cut still count)', r.summaryOf(111, [cut3, join3, broken, applied]), {
    before: 111,
    after: 113,
    cuts: 2,
    parts: 6,
    joins: 1,
    joined: 3,
  });
  check('filters: all open; cuts; joins', [
    r.filterProposals([cut3, join3, broken, applied], 'all').length,
    r.filterProposals([cut3, join3, broken, applied], 'cut').length,
    r.filterProposals([cut3, join3, broken, applied], 'merge').length,
  ], [3, 2, 1]);
  check('needs hands: the lines no longer cut', r.filterProposals([cut3, join3, broken], 'hands').length, 1);
  check('free today: no holder, no meeting', r.filterProposals([cut3, join3, broken], 'free').length, 2);
  check(
    'a meeting going to it is not free',
    r.isFree(p({ territories: [{ held: false, meetingOn: '2026-11-21' }] })),
    false,
  );
  check('the decision: decided, waiting, reopened, remarks with words', r.decisionOf([cut3, join3, broken, applied]), {
    open: 3,
    decided: 1,
    waiting: 2,
    reopened: 1,
    remarks: 1,
  });
  check('kilometres and minutes: a comma in Russian and German, a point in English', [r.km(12.04, 'ru'), r.km(8.55, 'de'), r.km(8.5, 'en'), r.km(13, 'ru')], ['12', '8,6', '8.5', '13']);
  const tr = (k, o) => `${k}${o ? ':' + JSON.stringify(o) : ''}`;
  check(
    'where: far with its minutes; city without minutes',
    [r.whereOf({ cls: 'far', driveMinutes: 14.4 }, tr, 'ru'), r.whereOf({ cls: 'city', driveMinutes: null }, tr, 'ru')],
    ['territories.recut.where.far:{"min":"14,4"}', 'territories.recut.where.cityNoMin'],
  );
  check(
    'decided again after a change: no longer «back under discussion»',
    r.decisionOf([p({ approvedAt: '2026-11-29T10:00:00Z', reopenedAt: '2026-11-23T10:00:00Z' })]).reopened,
    0,
  );
  const T = (id, walkKm) => ({ id, walkKm });
  const byId = new Map([T('a', 41), T('b', 3), T('c', 2.5), T('d', null), T('e', 20)].map((t) => [t.id, t]));
  const cutA = { kind: 'cut', state: 'open', queue: 2, territories: [{ id: 'a' }], parts: [{ walkKm: 13.9 }, { walkKm: 14.2 }, { walkKm: 13.6 }] };
  const joinBC = { kind: 'merge', state: 'open', queue: 1, territories: [{ id: 'b' }, { id: 'c' }], parts: [{ walkKm: 5.6 }] };
  check('a cut: 41 → its longest part', r.walkNowAfter(cutA, byId), { now: 41, after: 14.2 });
  check('a join: the two together → the one', r.walkNowAfter(joinBC, byId), { now: 5.5, after: 5.6 });
  check(
    'not in yet: no number made up',
    [
      r.walkNowAfter({ ...cutA, parts: [{ walkKm: 13.9 }, { walkKm: null }] }, byId).after,
      r.walkNowAfter({ ...joinBC, territories: [{ id: 'b' }, { id: 'd' }] }, byId).now,
      r.walkNowAfter({ ...cutA, parts: [] }, byId).after === null,
    ],
    [null, null, true],
  );
  check('rounds: joins first, then the cuts; applied ones left out', r.queuesOf([cutA, joinBC, { ...cutA, queue: 3 }, { ...joinBC, state: 'applied' }]), [
    { queue: 1, cuts: 0, joins: 1 },
    { queue: 2, cuts: 1, joins: 0 },
    { queue: 3, cuts: 1, joins: 0 },
  ]);
  const all = [...byId.values()];
  check('the longest walk: 41 now; after — the longest of the rest (20) and the parts', r.longestWalk(all, [cutA, joinBC]), { now: 41, after: 20 });
  check('the longest after waits for the parts', r.longestWalk(all, [{ ...cutA, parts: [{ walkKm: null }] }]).after, null);
  check(
    'the longest after: a part longer than the rest',
    r.longestWalk([T('a', 41), T('e', 10)], [{ ...cutA, parts: [{ walkKm: 19 }, { walkKm: 22 }] }]),
    { now: 41, after: 22 },
  );
  check('months at the pace: whole, at least one, none without a pace', [
    r.monthsAt(14, { kmPerMonth: 3.5 }),
    r.monthsAt(1, { kmPerMonth: 3.5 }),
    r.monthsAt(14, null),
    r.monthsAt(null, { kmPerMonth: 3 }),
  ], [4, 1, null, null]);
  check('search: by the number, any case, spaces ignored', r.searchTerritories([{ number: 'Hamm52' }, { number: 'Ahlen 01' }, { number: 'Hamm5' }], 'hamm 5').map((t) => t.number), ['Hamm52', 'Hamm5']);
  check('search: nothing asked — all', r.searchTerritories([{ number: 'A' }, { number: 'B' }], '  ').length, 2);
  check('eight colours for eight parts, all different', new Set(r.PART_COLORS).size, 8);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`check-recut: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ the draft of re-cutting: ${passed} checks`);
