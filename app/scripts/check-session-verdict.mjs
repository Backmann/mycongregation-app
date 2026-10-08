#!/usr/bin/env node
/**
 * A session is ended only when the server says so.
 *
 * lib/session-verdict.ts tells «the server refused» from «the server could
 * not be reached». Getting it wrong in one direction signs people out for a
 * bad signal; in the other it keeps a dead session knocking for ever.
 *
 * It also holds the two places that act on the answer: the renewal in
 * lib/api.ts and the start in lib/auth.tsx may wipe the keys only after
 * asking.
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
const js = ts.transpileModule(read('lib/session-verdict.ts'), {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { sessionVerdict, renewalRetryDelayMs } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

const answered = (status) => ({ response: { status }, message: `Request failed with status code ${status}` });
const CASES = [
  ['нет сети вовсе', { message: 'Network Error' }, 'unreachable'],
  ['десять секунд без ответа', { message: 'timeout of 10000ms exceeded', code: 'ECONNABORTED' }, 'unreachable'],
  ['сервер перезапускается (502)', answered(502), 'unreachable'],
  ['сервер перезапускается (503)', answered(503), 'unreachable'],
  ['шлюз не дождался (504)', answered(504), 'unreachable'],
  ['Cloudflare: сервер не отвечает (522)', answered(522), 'unreachable'],
  ['ошибка самого сервера (500)', answered(500), 'unreachable'],
  ['слишком часто (429)', answered(429), 'unreachable'],
  ['запрос не успел (408)', answered(408), 'unreachable'],
  ['сеанс закончен (401)', answered(401), 'refused'],
  ['запись отключена (403)', answered(403), 'refused'],
  ['длинного ключа на устройстве нет', { message: 'No refresh token available' }, 'refused'],
  ['ключи оставлены при прошлой попытке — это не отказ, даже при 401', { ...answered(401), sessionKept: true }, 'unreachable'],
  ['что-то непонятное', null, 'unreachable'],
  ['что-то непонятное', 'строка', 'unreachable'],
];
const problems = [];
for (const [name, error, want] of CASES) {
  const got = sessionVerdict(error);
  if (got !== want) problems.push(`${name}: ожидалось «${want}», вышло «${got}»`);
}

// The retries fit inside the minute the server allows for a lost reply, with
// room for three ten-second timeouts.
let waited = 0;
let tries = 1;
for (let a = 0; renewalRetryDelayMs(a) !== null; a++) {
  waited += renewalRetryDelayMs(a);
  tries++;
  if (a > 10) { problems.push('повторы не кончаются'); break; }
}
if (tries < 2) problems.push('повторов нет вовсе');
if (waited + tries * 10_000 > 60_000) problems.push(`повторы (${waited} мс пауз и ${tries} попытки по 10 с) не укладываются в минуту`);

// Nobody wipes the keys without asking.
const api = read('lib/api.ts');
const interceptor = api.slice(api.indexOf('api.interceptors.response.use('));
const wipe = interceptor.indexOf('await clearAuthTokens();');
if (wipe < 0) problems.push('lib/api.ts: в обработчике ответа нет очистки ключей — проверка устарела');
else if (!/sessionVerdict\([^)]*\) === 'refused'/.test(interceptor.slice(Math.max(0, wipe - 400), wipe))) {
  problems.push('lib/api.ts: ключи стираются без вопроса «сервер отказал или недоступен?»');
}
const auth = read('lib/auth.tsx');
for (const m of auth.matchAll(/await clearAuthTokens\(\);/g)) {
  const before = auth.slice(Math.max(0, m.index - 500), m.index);
  const asked = /sessionVerdict\(/.test(before) || /signOut = useCallback/.test(auth.slice(Math.max(0, m.index - 1400), m.index));
  if (!asked) problems.push(`lib/auth.tsx: ключи стираются без вопроса (позиция ${m.index})`);
}

if (problems.length) {
  console.error('✗ Сеанс и связь:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`✓ Сеанс и связь: ${CASES.length} случаев; ключи стираются только по отказу сервера; ${tries} попытки обновления укладываются в минуту`);
