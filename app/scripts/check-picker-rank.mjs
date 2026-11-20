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
// 8. Parts given in turn: the same part in the next or last week, or
//    another part this meeting, keeps one off the best.
{
  const r = run('rotation', {
    last: [part(-1, 'midweek_chairman', 'primary')],
    next: [part(1, 'midweek_chairman', 'primary')],
    long: [part(-8, 'midweek_chairman', 'primary')],
    mid: [part(-4, 'midweek_chairman', 'primary'), part(0, 'cbs_conductor', 'primary')],
  }, { partKeys: ['midweek_chairman'] });
  check('по очереди: та же часть на прошлой или следующей неделе, другая часть этой встречи — не в лучших', ids(r.others).sort(), ['last', 'mid', 'next']);
  check('по очереди: дольше всех — выше', ids(r.best), ['long']);
  check('метка очереди', r.others.find((x) => x.id === 'next')?.flags, [{ kind: 'rotation' }]);
  const wt = run('rotation', { w: [part(-1, 'watchtower_conductor', 'primary')] }, { partKeys: ['watchtower_conductor'], noTurn: true });
  check('постоянный ведущий СБ — без очереди', ids(wt.best), ['w']);
}
// 9. The window of «own part soon»: 2–3 weeks, own parts only.
{
  const r = run('student-assistant', {
    three: [part(3, 'apply_yourself_1', 'primary')],
    four: [part(4, 'apply_yourself_1', 'primary')],
    helps: [part(2, 'apply_yourself_1', 'assistant')],
  });
  check('своя часть через 3 недели — метка', r.others.find((x) => x.id === 'three')?.flags, [{ kind: 'ownSoon', week: wk(3), weeks: 3 }]);
  check('через 4 недели — не метка', r.best.find((x) => x.id === 'four')?.flags, []);
  check('помогать через 2 недели — не «своя часть»', r.best.find((x) => x.id === 'helps')?.flags, []);
  const next = run('student-assistant', { n: [part(1, 'apply_yourself_2', 'assistant')] });
  check('часть на следующей неделе — метка', next.others[0]?.flags, [{ kind: 'nextWeek' }]);
}
// 10. The pair's window: 26 back, 12 ahead — and no further.
{
  const at = (n) => run('student-assistant', { x: [part(n, 'apply_yourself_1', 'assistant', { partnerId: 'm' })] }, { otherId: 'm' });
  check('пара на −26 — метка', at(-26).others[0]?.flags?.[0]?.kind, 'pair');
  check('пара на −27 — нет', at(-27).best.length, 1);
  check('пара на +12 — метка', at(12).others[0]?.flags?.[0]?.kind, 'pair');
  check('пара на +13 — нет', at(13).best.length, 1);
}
// 11. Another meeting the same week is no «this meeting»; a duty is told, not
//     keeping one off, and is no part.
{
  const we = { ...part(0, 'weekend_opening_prayer', 'primary'), eventType: 'weekend' };
  check('часть в выходной той же недели — не «на этой встрече»', run('student-lead', { x: [we] }).best[0]?.flags, []);
  const duty = { weekStartDate: wk(0), eventType: 'midweek', kind: 'duty', dutyType: 'microphone', customLabel: null };
  const r = run('student-lead', { x: [duty] });
  check('обязанность на этой встрече — метка, но в лучших', r.best[0]?.flags, [{ kind: 'duty', dutyType: 'microphone', label: null }]);
  const dutyLastWeek = { ...duty, weekStartDate: wk(-1) };
  check('обязанность — не часть (не «прошлая неделя»)', run('student-lead', { x: [dutyLastWeek] }).best[0]?.flags, []);
}
// 12. «Longest without» looks both ways; away people in that order too.
{
  const r = run('student-lead', {
    soon5: [part(5, 'apply_yourself_1', 'primary')],
    never: [],
    back9: [part(-9, 'apply_yourself_1', 'primary')],
  });
  check('ближайшая часть в любую сторону: впереди через 5 — ниже давних', ids(r.best), ['never', 'back9', 'soon5']);
  const a = run('student-lead', { a1: [part(-2, 'bible_reading', 'primary')], a2: [part(-10, 'bible_reading', 'primary')] }, { away: ['a1', 'a2'] });
  check('не смогут — тоже по давности', ids(a.away), ['a2', 'a1']);
}
// 13. What the picker knows itself keeps one off the best.
{
  const r = run('student-lead', { x: [], y: [] }, { extraFlags: (id) => (id === 'x' ? [{ kind: 'noCapability' }] : []) });
  check('нет отметки — не в лучших', ids(r.best), ['y']);
}
// 14. A discussion turn counts discussions only.
{
  const disc = { ...part(-1, 'apply_yourself_3', 'primary'), partTitle: 'Что бы вы сказали?: Обсуждение.' };
  const stud = part(-1, 'apply_yourself_3', 'primary');
  const keys = ['apply_yourself_1', 'apply_yourself_2', 'apply_yourself_3'];
  check('обсуждение на прошлой неделе — очередь', run('rotation', { x: [disc] }, { partKeys: keys, onlyDiscussion: true }).others[0]?.flags, [{ kind: 'rotation' }]);
  check('учебная часть на прошлой неделе — не очередь обсуждения', run('rotation', { x: [stud] }, { partKeys: keys, onlyDiscussion: true }).best.length, 1);
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
