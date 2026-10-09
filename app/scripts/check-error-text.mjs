#!/usr/bin/env node
/**
 * A failed request is said in words — and a contents screen says when it is
 * not showing everything (9 October 2026).
 *
 *   1. lib/error-text.ts, run here as it is: no answer, no answer in time,
 *      the server failing, «too many», a bare code — each in words; the
 *      server's own words left alone; a request called off by the app is
 *      not a failure.
 *   2. Every message after a failed request goes through extractErrorMessage
 *      (and so through that rule): no screen shows `e.message` of a request
 *      — that is where «Network Error» and «Request failed with status code
 *      400» came from.
 *   3. The three contents screens stand under PartlyShown, fed with every
 *      request a line of theirs is read from; and the rule for «a line did
 *      not come» is the screens' own (403 is an answer, not a gap).
 *   4. The words exist in all three languages.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const problems = [];
const transpile = (src) =>
  ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const load = (js) => import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

// --- 1. the words ----------------------------------------------------------------
const { requestErrorText } = await load(transpile(read('lib/error-text.ts')));
const say = (key, o) => (o && o.status !== undefined ? `${key}(${o.status})` : key);
const ax = (o) => ({ isAxiosError: true, message: 'x', ...o });
for (const [what, err, want] of [
  ['нет связи (ответа нет вовсе)', ax({ message: 'Network Error', code: 'ERR_NETWORK' }), 'connection.request.offline'],
  ['ответа нет, кода нет', ax({}), 'connection.request.offline'],
  ['не дождались ответа', ax({ code: 'ECONNABORTED' }), 'connection.request.timeout'],
  ['не дождались ответа (ETIMEDOUT)', ax({ code: 'ETIMEDOUT' }), 'connection.request.timeout'],
  ['408', ax({ response: { status: 408, data: {} } }), 'connection.request.timeout'],
  ['502 от прокси — страница, не слова', ax({ response: { status: 502, data: '<html>' } }), 'connection.request.server(502)'],
  ['500 «Internal server error» — не для человека', ax({ response: { status: 500, data: { message: 'Internal server error' } } }), 'connection.request.server(500)'],
  ['429 «ThrottlerException» — не для человека', ax({ response: { status: 429, data: { message: 'ThrottlerException: Too Many Requests' } } }), 'connection.request.tooMany'],
  ['429 с кодом', ax({ response: { status: 429, data: { code: 'RATE_LIMITED' } } }), 'connection.request.tooMany'],
  ['409 со словами сервера — их и показать', ax({ response: { status: 409, data: { message: 'Эта речь уже назначена' } } }), null],
  ['400 со списком слов сервера', ax({ response: { status: 400, data: { message: ['поле обязательно'] } } }), null],
  ['403 со словами сервера', ax({ response: { status: 403, data: { message: 'Нет доступа' } } }), null],
  ['404 без слов', ax({ response: { status: 404, data: {} } }), 'connection.request.other(404)'],
  ['409 только с кодом', ax({ response: { status: 409, data: { code: 'X' } } }), 'connection.request.other(409)'],
  ['отменён самим приложением', ax({ code: 'ERR_CANCELED' }), null],
  ['ошибка кода, не запрос', new TypeError('x is undefined'), null],
  ['ничего', null, null],
]) {
  const got = requestErrorText(err, say);
  if (got !== want) problems.push(`слова: ${what} — ожидалось ${want}, вышло ${got}`);
}

const api = read('lib/api.ts');
if (!/export function extractErrorMessage\(error: unknown\): string \{\s*if \(error instanceof AxiosError\) \{[\s\S]{0,200}requestErrorText\(error,[\s\S]{0,80}if \(said\) return said;/.test(api)) {
  problems.push('lib/api.ts: extractErrorMessage больше не спрашивает lib/error-text — вернётся «Network Error»');
}

// --- 2. no raw messages ---------------------------------------------------------
const walk = (d) =>
  readdirSync(join(ROOT, d)).flatMap((n) => {
    const p = join(d, n);
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : n.endsWith('.tsx') ? [p] : [];
  });
const RAW = /\be(?:rr|rror)?\s+instanceof\s+Error\s*\?\s*e(?:rr|rror)?\.message|\(\s*e(?:rr|rror)?\s+as\s+Error\s*\)\.message/;
for (const rel of [...walk('app'), ...walk('components')]) {
  const src = read(rel);
  if (RAW.test(src)) problems.push(`${relative('.', rel)}: показывает сырое сообщение ошибки — только через extractErrorMessage`);
}

// --- 3. the contents screens ----------------------------------------------------
const sf = read('lib/screen-failure.ts');
if (!/export function lineMissing\([^)]*\): boolean \{\s*return q\.isError && q\.data === undefined && isRequestError\(q\.error\) && sessionVerdict\(q\.error\) === 'unreachable';/.test(sf)) {
  problems.push('lib/screen-failure.ts: правило «строка не пришла» уже не то, что у экранов');
}
const cs = read('components/ConnectionState.tsx');
if (!/const missing = queries\.filter\(lineMissing\);\s*if \(missing\.length === 0\) return <KeptNotice/.test(cs)) {
  problems.push('ConnectionState: PartlyShown не говорит о недошедших строках или не показывает прежнее, когда их нет');
}
if (!/\{notice \? <View/.test(read('components/DoorList.tsx'))) problems.push('DoorList: строка над оглавлением не выводится');
const HUBS = {
  // [where it stands, the requests every line is read from]
  'app/(app)/cart/index.tsx': [/notice=\{<PartlyShown queries=\{asked\}/, ['standingQ', 'collectionQ', 'attendanceQ', 'fieldQ', '...cartQs', 'visitsQ', 'eventsQ', 'auxQ', 'servingQ']],
  'app/(app)/publishers/index.tsx': [/notice=\{<PartlyShown queries=\{\[/, ['summaryQ']],
  'app/(app)/profile/index.tsx': [/contentContainerStyle=\{\{ paddingBottom: 32 \}\}\s*>\s*\{\/\*[\s\S]{0,200}?\*\/\}\s*<PartlyShown\s+queries=\{\[/, ['signedInQuery', 'myTasksQuery', 'myPublisherQuery']],
};
for (const [rel, [where, names]] of Object.entries(HUBS)) {
  const src = read(rel);
  if (!where.test(src)) {
    problems.push(`${rel}: оглавление без строки «часть строк не показана» наверху`);
    continue;
  }
  // The list actually handed over: `const asked = [...]` or `queries={[...]}`.
  const list = (src.match(/const asked = \[([^\]]*)\]/) ?? src.match(/<PartlyShown\s+queries=\{\[([^\]]*)\]/))?.[1] ?? '';
  const handed = list.split(',').map((x) => x.trim()).filter(Boolean);
  for (const n of names) if (!handed.includes(n)) problems.push(`${rel}: запрос ${n} не передан в PartlyShown`);
  // And a request added to the screen later must join the list.
  const made = [...src.matchAll(/const (?:\{[^}]*query: )?(\w+)\}? = use(?:Query|Queries)\(/g)].map((m) => m[1]);
  for (const m of made) {
    if (!handed.some((n) => n.replace('...', '') === m)) problems.push(`${rel}: запрос ${m} не передан в PartlyShown — его строка пропадёт молча`);
  }
}

// --- 4. the words in three languages --------------------------------------------
const KEYS = ['request.offline', 'request.timeout', 'request.server', 'request.tooMany', 'request.other', 'partlyOffline', 'partlyFailed'];
for (const lang of ['ru', 'en', 'de']) {
  const c = JSON.parse(read(`locales/${lang}.json`)).connection;
  for (const k of KEYS) {
    const v = k.split('.').reduce((o, p) => o?.[p], c);
    if (typeof v !== 'string' || !v.trim()) problems.push(`locales/${lang}.json: нет connection.${k}`);
    else if (/request\.(server|other)/.test(k) && !v.includes('{{status}}')) problems.push(`locales/${lang}.json: connection.${k} без кода ответа`);
  }
}

if (problems.length) {
  console.error('✗ Ошибка запроса — словами; оглавления говорят, что не всё показано:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('✓ Ошибка запроса — словами (17 случаев); три оглавления говорят, что не всё показано');
