#!/usr/bin/env node
/**
 * «Did not load» is never drawn as «nothing there» (lib/screen-failure.ts).
 *
 * With the server switched off (8 October 2026) eight screens told a brother
 * something untrue — «Задач пока нет», «Пока нет докладчиков», «График на
 * эту неделю ещё не открыт» with a button to build it — because a failed
 * request is an empty list to a screen that draws `data ?? []`.
 *
 * This holds three things:
 *   1. the rule itself (run here as it is) — only a request that could not
 *      reach the server, and only when there is nothing earlier to show;
 *   2. the boundary before every screen that turns it into «Не удалось
 *      загрузить», and that every stack has that boundary — a request thrown
 *      outside one would take the whole app down;
 *   3. every screen: its main data is marked, or it stands below with the
 *      reason it is not. A new screen with neither does not pass.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const problems = [];

// --- 1. the rule ------------------------------------------------------------------
const load = async (rel) => {
  const js = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};
const { sessionVerdict } = await load('lib/session-verdict.ts');
// screen-failure imports session-verdict; give it the real one.
const sfSrc = read('lib/screen-failure.ts').replace(
  /import \{ sessionVerdict \} from '\.\/session-verdict';/,
  '',
);
const sfJs = ts.transpileModule(sfSrc, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
globalThis.sessionVerdict = sessionVerdict;
const { failsScreen, isRequestError } = await import(
  `data:text/javascript;base64,${Buffer.from(`const sessionVerdict = globalThis.sessionVerdict;\n${sfJs}`).toString('base64')}`
);
const ax = (status) => ({ isAxiosError: true, message: status ? `Request failed with status code ${status}` : 'Network Error', response: status ? { status } : undefined });
const q = (data) => ({ state: { data } });
for (const [what, err, query, want] of [
  ['нет сети, показать нечего', ax(), q(undefined), true],
  ['сервер падает (502), показать нечего', ax(502), q(undefined), true],
  ['ошибка сервера (500), показать нечего', ax(500), q(undefined), true],
  ['нет сети, но прежний ответ есть — экран остаётся со своим', ax(), q([1]), false],
  ['нет сети, прежний ответ — пустой список: он ответ, экран остаётся', ax(), q([]), false],
  ['отказ (403) — экран говорит сам, как раньше', ax(403), q(undefined), false],
  ['не найдено (404) — как раньше', ax(404), q(undefined), false],
  ['ошибка в коде, не запрос — не прятать под «нет связи»', new TypeError('x is undefined'), q(undefined), false],
  ['ничего', null, q(undefined), false],
]) {
  const got = failsScreen(err, query);
  if (got !== want) problems.push(`правило: ${what} — ожидалось ${want}, вышло ${got}`);
}
if (!isRequestError(ax()) || isRequestError(new Error('x'))) problems.push('правило: не отличает ошибку запроса от ошибки кода');

// --- 2. the boundary --------------------------------------------------------------
const gate = read('components/ScreenGate.tsx');
if (!/if \(screenAllowed\(route, perms, user\)\) \{\s*return <ScreenFailureBoundary>\{children\}<\/ScreenFailureBoundary>;/.test(gate)) {
  problems.push('ScreenGate: открытый экран больше не стоит за границей «Не удалось загрузить»');
}
if (!/if \(perms\.failed\) \{[\s\S]{0,300}<LoadFailure/.test(gate)) {
  problems.push('ScreenGate: список поручений не пришёл — а показывается «Нет доступа»');
}
const boundary = read('components/ScreenFailure.tsx');
if (!/if \(!isRequestError\(error\)\) throw error;/.test(boundary)) {
  problems.push('ScreenFailure: ловит и ошибки кода — баг будет выглядеть как «нет связи»');
}
if (!/QueryErrorResetBoundary/.test(boundary) || !/this\.props\.onReset\(\)/.test(boundary)) {
  problems.push('ScreenFailure: «Повторить» не сбрасывает неудачные запросы — экран упадёт снова, не спросив');
}
if (!/failed: isError && allResponsibilities === undefined/.test(read('lib/permissions.ts'))) {
  problems.push('lib/permissions.ts: нет признака «список поручений не пришёл»');
}
const appDir = join(ROOT, 'app', '(app)');
for (const d of readdirSync(appDir)) {
  const layout = join(appDir, d, '_layout.tsx');
  if (statSync(join(appDir, d)).isDirectory() && existsSync(layout) && !/screenLayout=\{screenGate\(/.test(readFileSync(layout, 'utf8'))) {
    problems.push(`app/(app)/${d}/_layout.tsx: стопка без screenGate — брошенный запрос уронит всё приложение`);
  }
}

// --- 3. every screen ---------------------------------------------------------------
/** Screens that are not marked, and why. */
const EXEMPT = {
  // Keep what arrived last on the device and say so themselves (lib/offline-keep.ts).
  'home/index.tsx': 'хранит пришедшее последним и сам пишет «Нет связи · показано …»',
  'home/my-assignments.tsx': 'хранит пришедшее последним и сам пишет «Нет связи · показано …»',
  'schedule/index.tsx': 'хранит пришедшее последним и сам пишет «Нет связи · показано …»',
  // Hubs: a door to each section, with a line of news where there is some. A
  // line that did not come is left out; none says «nothing there».
  'cart/index.tsx': 'оглавление: несостоявшаяся строка не выводится (null — не «пусто»)',
  'publishers/index.tsx': 'оглавление: сводка без ответа не выводится',
  'profile/index.tsx': 'оглавление: «Где вы вошли» без ответа не выводится',
  'talk-coordinator/index.tsx': 'оглавление без данных',
  'cleaning/guide.tsx': 'инструкция, данных с сервера нет',
  // Forms: nothing is drawn from the server to be mistaken for an answer; a
  // save without a connection fails and says so.
  'absences/new.tsx': 'форма',
  'publishers/new.tsx': 'форма',
  'service-groups/new.tsx': 'форма',
  'special-events/new.tsx': 'форма',
  'publishers/songs-import.tsx': 'форма загрузки файла',
  'publishers/public-talks-import.tsx': 'форма загрузки файла',
  'profile/change-password.tsx': 'форма',
  'profile/delete-account.tsx': 'форма',
};
/** Screens whose main data is asked by a component or hook they draw — marked there. */
const VIA = {
  'special-events/[id].tsx': ['components/SpecialEventDetail.tsx'],
  'publishers/cleaning-week.tsx': ['lib/useCleaningWeek.ts'],
};
const MARK = /throwOnError: failsScreen\b/;
const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : n.endsWith('.tsx') && n !== '_layout.tsx' ? [p] : [];
  });
let marked = 0;
let redirects = 0;
for (const file of walk(appDir)) {
  const rel = relative(appDir, file).split('\\').join('/');
  const src = readFileSync(file, 'utf8');
  if (/<Redirect\b/.test(src) && !/useQuery|useInfiniteQuery|useQueries/.test(src)) {
    redirects++;
    continue;
  }
  if (MARK.test(src)) {
    marked++;
    if (EXEMPT[rel]) problems.push(`${rel}: и помечен, и стоит в исключениях — что-то одно`);
    continue;
  }
  if (VIA[rel]) {
    for (const v of VIA[rel]) if (!MARK.test(read(v))) problems.push(`${rel}: главный запрос в ${v} больше не помечен`);
    continue;
  }
  if (EXEMPT[rel]) {
    // The keepers must really keep: their own notice is the reason they are exempt.
    if (/хранит/.test(EXEMPT[rel]) && !/KeptNotice/.test(src)) problems.push(`${rel}: в исключениях как «хранит», а строки о сохранённом нет`);
    continue;
  }
  problems.push(`${rel}: главный запрос экрана не помечен (throwOnError: failsScreen) и экрана нет в исключениях с причиной`);
}
for (const rel of [...Object.keys(EXEMPT), ...Object.keys(VIA)]) {
  if (!existsSync(join(appDir, rel))) problems.push(`исключение «${rel}»: такого экрана больше нет — убрать из списка`);
}

// The rule may be used only where a screen boundary stands above: in screen
// files, and in the few hooks and components drawn by screens alone.
const OUTSIDE_SCREENS = ['lib/useCleaningWeek.ts', 'lib/useDutiesWeek.ts', 'components/SpecialEventDetail.tsx'];
const scan = (d) =>
  readdirSync(join(ROOT, d)).flatMap((n) => {
    const p = join(d, n);
    return statSync(join(ROOT, p)).isDirectory() ? scan(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
for (const rel of [...scan('components'), ...scan('lib')]) {
  if (rel === 'lib/screen-failure.ts') continue; // where the rule is written down
  if (MARK.test(read(rel)) && !OUTSIDE_SCREENS.includes(rel)) {
    problems.push(`${rel}: правило «не удалось загрузить» вне экрана — если это нарисовано в шапке или вкладках, приложение упадёт целиком`);
  }
}
const users = {
  'lib/useCleaningWeek.ts': /useCleaningWeek\(/,
  'lib/useDutiesWeek.ts': /useDutiesWeek\(/,
  'components/SpecialEventDetail.tsx': /<SpecialEventDetail\b/,
  'components/CleaningWeekEditor.tsx': /<CleaningWeekEditor\b/,
  'components/DutiesMeetingEditor.tsx': /<DutiesMeetingEditor\b/,
};
for (const [rel, re] of Object.entries(users)) {
  for (const f of [...scan('components'), ...scan('lib'), ...walk(appDir).map((p) => relative(ROOT, p))]) {
    const norm = f.split('\\').join('/');
    if (norm === rel || norm.endsWith('.d.ts')) continue;
    if (!re.test(read(norm))) continue;
    const inScreen = norm.startsWith('app/(app)/');
    const viaScreenOnly = Object.keys(users).includes(norm);
    if (!inScreen && !viaScreenOnly) problems.push(`${rel} нарисован в ${norm} — не на экране: брошенный запрос некому поймать`);
  }
}

if (problems.length) {
  console.error('✗ «Не удалось загрузить» вместо «пусто»:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(
  `✓ «Не удалось загрузить» вместо «пусто»: правило проверено на 9 случаях; помечено экранов ${marked}, исключений с причиной ${Object.keys(EXEMPT).length}, через компонент ${Object.keys(VIA).length}, переадресаций ${redirects}`,
);
