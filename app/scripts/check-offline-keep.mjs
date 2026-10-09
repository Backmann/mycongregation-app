#!/usr/bin/env node
/**
 * What a phone keeps for a hall with no signal — and what it never keeps.
 *
 * lib/offline-keep-rules.ts names the few answers kept on the device. A key
 * slipping into that list keeps something nobody agreed to keep (contacts,
 * reports, the elders' tasks) on a phone that may be lost or shared; a key
 * falling out of it brings back «Назначений нет» in a hall with no signal.
 *
 * Also held: who wipes what was kept (sign-out, a refused session, another
 * person signing in), and that a failure is SAID on the two screens instead
 * of looking like «nothing there».
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const js = ts.transpileModule(read('lib/offline-keep-rules.ts'), {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { keptName, pruneKept, keptIdentity, mondayOf, KEEP_DAYS, keptMeetingRows } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

const problems = [];
const MON = '2026-10-05';

// --- kept, and only these -----------------------------------------------------
const KEPT = [
  ['мои назначения', ['me', 'assignments']],
  ['время встреч', ['meeting-settings']],
  ['особые события', ['special-events']],
  ['особые события на Главной', ['special-events', 'home']],
  ['особые события в ленте', ['special-events', 'all']],
  ['имена людей', ['publishers', 'roster']],
  ['группы', ['service-groups']],
  ['программа с этого понедельника', ['assignments', 'range', MON, '2026-11-30']],
  ['обязанности с этого понедельника', ['duties', 'range', MON, '2026-11-30']],
  ['уборка с этого понедельника', ['cleaning', 'range', MON, '2026-11-30']],
  ['проповедь с этого понедельника (лента)', ['field-service', 'range', MON, '2026-11-30']],
  ['проповедь с этого понедельника (Главная)', ['field-service', 'range', MON]],
];
const NEVER = [
  ['своя карточка с контактами', ['me-publisher']],
  ['карточка человека', ['publisher', 'x']],
  ['список возвещателей', ['publishers']],
  ['список возвещателей с фильтром', ['publishers', 'list', {}]],
  ['отсутствия', ['absences', 'mine', 'x']],
  ['свой отчёт', ['reports', 'my-standing']],
  ['задачи совета', ['tasks', 'meetings']],
  ['журнал', ['audit-log']],
  ['уведомления', ['me', 'inbox']],
  ['«нужно сделать»', ['me', 'pending']],
  ['визит районного', ['co-visit-mine']],
  ['программа прошлой недели', ['assignments', 'range', '2026-09-28', '2026-11-23']],
  ['прошлые месяцы ленты', ['assignments', 'range', '2026-09-01', MON]],
  ['готовность (видят не все)', ['readiness', 'range', MON, '2026-11-30']],
  ['назначение по id', ['assignment', 'x']],
  ['особые события с лишним', ['special-events', 'all', 'x']],
  ['мои назначения с лишним', ['me', 'assignments', 'x']],
];
for (const [name, key] of KEPT) {
  if (!keptName(key, MON)) problems.push(`не сохраняется, а должно: ${name} ${JSON.stringify(key)}`);
}
for (const [name, key] of NEVER) {
  const got = keptName(key, MON);
  if (got) problems.push(`сохраняется, а не должно: ${name} ${JSON.stringify(key)} → ${got}`);
}
const names = KEPT.map(([, k]) => keptName(k, MON));
if (new Set(names).size !== names.length) problems.push('два разных запроса сохраняются под одним именем');

// --- what stays of what was kept ----------------------------------------------
const now = Date.parse('2026-10-08T12:00:00Z');
const day = 86_400_000;
const entry = (key, ageDays) => ({ key, data: { ok: 1 }, at: now - ageDays * day });
const pruned = pruneKept(
  {
    'me/assignments': entry(['me', 'assignments'], 3),
    'meeting-settings': entry(['meeting-settings'], KEEP_DAYS + 1),
    [`assignments/${MON}/2026-11-30`]: entry(['assignments', 'range', MON, '2026-11-30'], 1),
    'assignments/2026-09-28/2026-11-23': entry(['assignments', 'range', '2026-09-28', '2026-11-23'], 8),
    'service-groups': entry(['me-publisher'], 1),
    'publishers/roster': { key: ['publishers', 'roster'], data: {}, at: now + 5 * day },
    junk: null,
  },
  now,
  MON,
);
const keptNow = Object.keys(pruned).sort().join(', ');
const wantNow = [`assignments/${MON}/2026-11-30`, 'me/assignments'].sort().join(', ');
if (keptNow !== wantNow) problems.push(`после чистки осталось «${keptNow}», ожидалось «${wantNow}»`);

// --- one's own card: who and which group, never the contacts ------------------
const me = keptIdentity({
  id: 'p1',
  displayName: 'Иванов Пётр',
  firstName: 'Пётр',
  lastName: 'Иванов',
  pioneerType: null,
  appointment: 'ms',
  serviceGroupId: 'g1',
  mobilePhone: '+49 000',
  email: 'x@example.invalid',
  address: 'где-то',
  contactsConfirmedAt: '2026-01-01',
  contactsConfirmedByUserId: 'u',
  contactsConfirmedByName: 'кто-то',
});
const leaked = Object.keys(me ?? {}).filter((k) => /phone|mail|address|contacts/i.test(k));
if (!me || me.id !== 'p1' || me.serviceGroupId !== 'g1') problems.push('своя карточка не сохраняется (кто и какая группа)');
if (leaked.length) problems.push(`в своей карточке сохраняются контакты: ${leaked.join(', ')}`);
if (keptIdentity(null) !== null || keptIdentity({}) !== null) problems.push('пустая карточка сохраняется как настоящая');

// --- Monday as the screens count it -------------------------------------------
for (const [d, want] of [
  ['2026-10-05T09:00:00', '2026-10-05'],
  ['2026-10-08T23:30:00', '2026-10-05'],
  ['2026-10-11T23:59:00', '2026-10-05'],
  ['2026-10-12T00:01:00', '2026-10-12'],
  ['2026-03-29T12:00:00', '2026-03-23'],
]) {
  const got = mondayOf(new Date(d));
  if (got !== want) problems.push(`понедельник для ${d}: ${got}, а не ${want}`);
}

// --- the wiring -----------------------------------------------------------------
const keep = read('lib/offline-keep.ts');
if (!/from '@react-native-async-storage\/async-storage'/.test(keep)) problems.push('lib/offline-keep.ts: хранит не в AsyncStorage');
if (!/setQueryData\(e\.key, e\.data, \{ updatedAt: e\.at \}\);\s*\n(\s*\/\/.*\n)*\s*void qc\.invalidateQueries\(\{ queryKey: e\.key, exact: true, refetchType: 'none' \}\)/.test(keep)) {
  problems.push('lib/offline-keep.ts: возвращённое не помечено старым — свежее на вид не переспросится и встанет без строки «показано то, что пришло»');
}
if (/from '\.\/storage'/.test(keep)) problems.push('lib/offline-keep.ts: пишет в защищённое хранилище ключей — оно не для этого');

const auth = read('lib/auth.tsx');
const bodyOf = (name) => {
  const i = auth.indexOf(`const ${name} = useCallback(`);
  return i < 0 ? '' : auth.slice(i, auth.indexOf('}, [', i));
};
if (!/forgetKept\(\)/.test(bodyOf('signOut'))) problems.push('lib/auth.tsx: при выходе сохранённое не стирается');
for (const n of ['signIn', 'adoptSession']) {
  if (!/forgetKeptOfOthers\(authUser\.id\)/.test(bodyOf(n))) problems.push(`lib/auth.tsx: ${n} не стирает сохранённое для другого человека`);
}
const failure = auth.slice(auth.indexOf('setOnAuthFailure(() => {'), auth.indexOf('setOnReachability('));
if (!/forgetKept\(\)/.test(failure)) problems.push('lib/auth.tsx: сервер отказал в сеансе — а сохранённое остаётся');
const refusals = [...auth.matchAll(/sessionVerdict\(error\) === 'refused'\) \{([\s\S]*?)\n {6,8}\}/g)];
if (refusals.length < 2) problems.push('lib/auth.tsx: не нашёл обе ветки «сервер отказал» — проверка устарела');
for (const m of refusals) if (!/forgetKept\(\)/.test(m[1])) problems.push('lib/auth.tsx: ветка «сервер отказал» не стирает сохранённое');
const remembered = auth.indexOf('if (remembered && alive) {');
const restoreAt = auth.indexOf('await restoreKept(queryClient, remembered.id)', remembered);
const setAt = auth.indexOf('setUser(remembered)', remembered);
if (remembered < 0 || restoreAt < 0 || setAt < 0 || restoreAt > setAt) {
  problems.push('lib/auth.tsx: сохранённое возвращается не до первого экрана');
}
if (!/startKeeping\(queryClient, userId\)/.test(auth)) problems.push('lib/auth.tsx: ответы не сохраняются');

const layout = read('app/_layout.tsx');
if ((layout.match(/networkMode: "always"/g) ?? []).length < 2) {
  problems.push('app/_layout.tsx: без networkMode "always" браузер без сети молча «ставит на паузу» запросы и изменения');
}

const mine = read('app/(app)/home/my-assignments.tsx');
const emptyAt = mine.indexOf("t('home.myTasksScreen.empty')");
const failAt = mine.indexOf('<LoadFailed');
if (failAt < 0 || emptyAt < 0 || failAt > emptyAt || !/\) : failedQuery \? \(\s*<LoadFailed/.test(mine)) problems.push('«Мои назначения»: при неудаче снова пишется «назначений нет»');
if (!/const failedQuery = \[tasksQuery, overviewQuery\]\.find\(\(q\) => q\.isError && q\.data === undefined\)/.test(mine)) {
  problems.push('«Мои назначения»: неудача больше не распознаётся');
}
if (!mine.includes('<KeptNotice')) problems.push('«Мои назначения»: не сказано, что показано сохранённое');

const feed = read('app/(app)/schedule/index.tsx');
if (!/node: feedFailed \? \(\s*<LoadFailed/.test(feed)) problems.push('«Программа»: при неудаче вместо слов — пустая лента и «Показать ещё»');
if (!feed.includes('<KeptNotice')) problems.push('«Программа»: не сказано, что показано сохранённое');
if (!read('app/(app)/home/index.tsx').includes('<KeptNotice')) problems.push('«Главная»: не сказано, что показано сохранённое');

// The keys the screens ask by must be the kept ones: if a screen renames its
// key, nothing it shows is kept any more — silently.
const home = read('app/(app)/home/index.tsx');
for (const [where, src, re] of [
  ['Главная: программа', home, /queryKey: \["assignments", "range", mon0, programmeTo\]/],
  ['Главная: проповедь', home, /queryKey: \["field-service", "range", mon0\]/],
  ['Главная: мои назначения', home, /queryKey: \["me", "assignments"\]/],
  ['Мои назначения', mine, /queryKey: \['me', 'assignments'\]/],
  ['Лента: программа кусками', feed, /queryKey: \["assignments", "range", sp\.from, sp\.to\]/],
  ['Лента: куски от этого понедельника', feed, /from: formatDateISO\(addDays\(currentMonday, i \* CHUNK \* 7\)\)/],
]) {
  if (!re.test(src)) problems.push(`${where}: ключ запроса изменился — сохранение его больше не узнаёт`);
}

// --- «Ведение встречи» from what is kept -----------------------------------------
{
  const row = (week, eventType, id, deletedAt = null) => ({ weekStartDate: week, eventType, id, deletedAt });
  const older = { at: 100, rows: [row('2026-10-12', 'midweek', 'a1'), row('2026-10-12', 'weekend', 'w1')] };
  const newer = { at: 200, rows: [row('2026-10-12', 'midweek', 'a2'), row('2026-10-12', 'midweek', 'gone', '2026-10-01')] };
  const other = { at: 300, rows: [row('2026-10-19', 'midweek', 'b1')] };
  const got = keptMeetingRows([older, newer, other], '2026-10-12', 'midweek');
  if (!got || got.at !== 200 || got.rows.map((r) => r.id).join() !== 'a2') {
    problems.push(`встреча из сохранённого: взято ${JSON.stringify(got)}, а не свежий кусок без удалённых и без выходной`);
  }
  if (keptMeetingRows([other], '2026-10-12', 'midweek') !== null) problems.push('встреча из сохранённого: чужая неделя выдана за эту');
  if (keptMeetingRows([], '2026-10-12', 'midweek') !== null) problems.push('встреча из сохранённого: из ничего что-то взялось');
}
const conduct = read('app/(app)/schedule/conduct.tsx');
if (!/throwOnError: \(error, query\) => !kept && failsScreen\(error, query\)/.test(conduct)) {
  problems.push('«Ведение встречи»: «Не удалось загрузить» и при сохранённой программе');
}
if (!/keptMeetingRows\(pieces, week, 'midweek'\)/.test(conduct)) problems.push('«Ведение встречи»: не берёт программу из сохранённого');
if (!/keptMe\(user\?\.id\)/.test(conduct) || !/const myPublisherId = meQuery\.data\?\.publisher\?\.id \?\? keptMyId;/.test(conduct)) problems.push('«Ведение встречи»: без связи председатель не узнан — «вести может председатель этой недели»');
if (/useAllPublishers/.test(conduct)) problems.push('«Ведение встречи»: имена из полного справочника — он не хранится и закрыт не-старейшинам');
if (!/<KeptNotice/.test(conduct)) problems.push('«Ведение встречи»: не сказано, что показано сохранённое');

if (problems.length) {
  console.error('✗ Сохранённое на устройстве:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(
  `✓ Сохранённое на устройстве: ${KEPT.length} запросов сохраняются, ${NEVER.length} — никогда; контакты не сохраняются; стирается при выходе, отказе и смене человека; неудача названа неудачей`,
);
