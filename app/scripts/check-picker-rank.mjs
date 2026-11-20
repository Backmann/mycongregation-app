#!/usr/bin/env node
/**
 * The order of the programme's people pickers (lib/picker-rank.ts), held to
 * examples (20 November 2026): who is among «Подходят лучше всего», what
 * keeps one off them, and what each row tells — a pair seen in both
 * directions, another part this meeting, a part next to this week, an own
 * part soon, the turn of a part given in turn, and who is away.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'picker-rank-'));
const emit = (name) =>
  writeFileSync(
    join(out, `${name}.mjs`),
    ts
      .transpileModule(readFileSync(join(ROOT, 'lib', `${name}.ts`), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      })
      .outputText.replace(/from '\.\/([a-z-]+)'/g, "from './$1.mjs'"),
  );
emit('meeting-guidelines');
emit('picker-rank');
const R = await import(pathToFileURL(join(out, 'picker-rank.mjs')));

let failures = 0;
let passed = 0;
const check = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
};

const W = '2026-11-23';
const wk = (n) => {
  const d = new Date(`${W}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
};
const part = (n, partKey, role, extra = {}) => ({
  weekStartDate: wk(n),
  eventType: 'midweek',
  kind: 'part',
  partKey,
  partTitle: partKey === 'apply_yourself_1' ? 'Начинайте разговор' : partKey === 'apply_yourself_2' ? 'Развивайте интерес' : null,
  role,
  assignmentId: `${partKey}-${n}-${role}`,
  ...extra,
});
const run = (mode, hist, extra = {}) =>
  R.rankCandidates({
    mode,
    week: W,
    eventType: 'midweek',
    candidates: Object.keys(hist).map((id) => ({ id })),
    itemsOf: (id) => hist[id] ?? [],
    isAway: (id) => (extra.away ?? []).includes(id),
    ...extra,
  });
const ids = (xs) => xs.map((r) => r.id);

// 1. Longest without first; never at the very top; at most three best.
{
  const r = run('student-assistant', {
    a: [part(-9, 'apply_yourself_2', 'assistant')],
    b: [part(-11, 'apply_yourself_1', 'primary')],
    c: [],
    d: [part(-6, 'bible_reading', 'primary')],
    e: [part(-5, 'apply_yourself_1', 'assistant')],
  });
  check('лучшие — дольше всех без части, «ещё не было» выше всех, не больше трёх', ids(r.best), ['c', 'b', 'a']);
  check('остальные — тоже по давности', ids(r.others), ['d', 'e']);
}
// 2. The lead counts his own parts only; the assistant any.
{
  const h = { x: [part(-2, 'apply_yourself_2', 'assistant'), part(-10, 'apply_yourself_1', 'primary')] };
  check('ведущему считается своя часть', run('student-lead', h).best[0]?.weeksAgo, 10);
  check('помощнику — любая учебная', run('student-assistant', h).others[0]?.weeksAgo, 2);
}
// 3. Fewer than MIN_GAP weeks: not among the best.
check('меньше 4 недель — не в лучших', ids(run('student-lead', { x: [part(-3, 'apply_yourself_1', 'primary')] }).others), ['x']);
check('4 недели — уже в лучших', ids(run('student-lead', { x: [part(-4, 'apply_yourself_1', 'primary')] }).best), ['x']);
// 4. The pair, seen from either side, back and ahead; kept off the best.
{
  const r = run('student-assistant', { n: [part(-10, 'apply_yourself_1', 'assistant', { partnerId: 'm' })] }, { otherId: 'm' });
  check('пара с ведущим — метка с датой и ролью', r.others[0]?.flags, [{ kind: 'pair', week: wk(-10), candidateRole: 'assistant' }]);
  check('повтор пары — не в лучших', ids(r.best), []);
  const lead = run('student-lead', { m: [part(-10, 'apply_yourself_1', 'primary', { partnerId: 'n' })] }, { otherId: 'n' });
  check('та же пара со стороны ведущего', lead.others[0]?.flags, [{ kind: 'pair', week: wk(-10), candidateRole: 'primary' }]);
  const ahead = run('student-assistant', { n: [part(8, 'apply_yourself_2', 'assistant', { partnerId: 'm' })] }, { otherId: 'm' });
  check('пара впереди тоже видна', ahead.others[0]?.flags?.[0]?.kind, 'pair');
  const old = run('student-assistant', { n: [part(-30, 'apply_yourself_1', 'assistant', { partnerId: 'm' })] }, { otherId: 'm' });
  check('пара старше 26 недель — не метка', old.best[0]?.reason, 'neverPaired');
}
// 5. Another part this meeting; next to this week; an own part soon.
{
  const r = run('student-assistant', {
    same: [part(0, 'apply_yourself_2', 'assistant')],
    prev: [part(-1, 'apply_yourself_2', 'assistant')],
    soon: [part(2, 'apply_yourself_1', 'primary')],
    ok: [],
  });
  check('часть на этой встрече — метка', r.others.find((x) => x.id === 'same')?.flags, [{ kind: 'sameMeeting', partKey: 'apply_yourself_2', title: 'Развивайте интерес' }]);
  check('часть на прошлой неделе — метка', r.others.find((x) => x.id === 'prev')?.flags, [{ kind: 'prevWeek' }]);
  check('своя часть через 2 недели — метка', r.others.find((x) => x.id === 'soon')?.flags, [{ kind: 'ownSoon', week: wk(2), weeks: 2 }]);
  check('без меток — в лучших', ids(r.best), ['ok']);
}
// 6. The part itself is not «another part this meeting».
{
  const r = run('student-assistant', { self: [part(0, 'apply_yourself_2', 'assistant')] }, { partId: 'apply_yourself_2-0-assistant' });
  check('сама часть — не «уже на этой встрече»', ids(r.best), ['self']);
}
// 7. A discussion is no student part; away people go to their own group.
{
  const disc = { weekStartDate: wk(-1), eventType: 'midweek', kind: 'part', partKey: 'apply_yourself_3', partTitle: 'Что бы вы сказали?: Обсуждение.', role: 'primary', assignmentId: 'd' };
  const r = run('student-lead', { p: [disc], q: [] }, { away: ['q'] });
  check('обсуждение — не учебная часть, но часть на прошлой неделе видна', r.others[0]?.flags, [{ kind: 'prevWeek' }]);
  check('уехавшие — отдельно', ids(r.away), ['q']);
}
// 8. Parts given in turn: the same part last week keeps one off the best.
{
  const r = run('rotation', {
    last: [part(-1, 'midweek_chairman', 'primary')],
    long: [part(-8, 'midweek_chairman', 'primary')],
    mid: [part(-4, 'midweek_chairman', 'primary'), part(0, 'cbs_conductor', 'primary')],
  }, { partKeys: ['midweek_chairman'] });
  check('по очереди: был на прошлой неделе — не в лучших', ids(r.others), ['last']);
  check('по очереди: дольше всех — выше; другая часть этой встречи не мешает', ids(r.best), ['long', 'mid']);
  check('метка очереди', r.others[0]?.flags, [{ kind: 'rotation' }]);
}

// The sheet hands the part's own id to the form: without it the picker
// took the part for «another part this meeting» (found on the stand,
// 20 November 2026), and a local-needs topic never knew its part.
const sheet = readFileSync(join(ROOT, 'components/AssignmentSheet.tsx'), 'utf8');
check('окно части передаёт форме номер самой части', /<AssignmentForm[\s\S]{0,600}assignmentId=\{active\.id\}/.test(sheet), true);
const form = readFileSync(join(ROOT, 'components/AssignmentForm.tsx'), 'utf8');
check('оба выбора получают порядок', (form.match(/rank=\{pickerRank\("(lead|assistant)"\)\}/g) ?? []).length, 2);

console.log(`${failures ? '✗' : '✓'} порядок выбора людей: ${passed} проверок${failures ? `, ошибок ${failures}` : ''}`);
process.exit(failures ? 1 : 0);
