#!/usr/bin/env node
/**
 * The hours queue on the phone (28 November 2026, independent review):
 * lib/service-log-queue.ts with the server and the phone's store stubbed.
 *
 * A change leaves the queue by identity: removing «the first» while the
 * queue was changed under a send (a month handed in, an edit) dropped
 * another entry unsent. A second send waits for the first instead of
 * answering «not sent». A change withdrawn on its way is not told as refused.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'hours-queue-'));
writeFileSync(
  join(out, 'store.mjs'),
  `const m = new Map();
   export default { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };`,
);
writeFileSync(join(out, 'axios.mjs'), `export class AxiosError extends Error { constructor(status) { super('x'); this.response = { status }; } }`);
writeFileSync(
  join(out, 'api.mjs'),
  `export const calls = [];
   const waits = new Map();
   export const control = {
     hold(id) { let r; const p = new Promise((res) => (r = res)); waits.set(id, { p, r }); },
     release(id, err) { const w = waits.get(id); waits.delete(id); w.r(err); },
   };
   async function go(kind, id) {
     calls.push(kind + ':' + id);
     const w = waits.get(id);
     if (w) { const err = await w.p; if (err) throw err; }
   }
   export const serviceLogApi = { put: (id) => go('put', id), remove: (id) => go('delete', id) };
   export const extractErrorMessage = () => 'refused';`,
);
const src = readFileSync(join(ROOT, 'lib', 'service-log-queue.ts'), 'utf8');
let js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
js = js
  .replace(/from ['"]@react-native-async-storage\/async-storage['"]/, `from './store.mjs'`)
  .replace(/from ['"]axios['"]/, `from './axios.mjs'`)
  .replace(/from ['"]\.\/api['"]/, `from './api.mjs'`);
writeFileSync(join(out, 'queue.mjs'), js);
const q = await import(pathToFileURL(join(out, 'queue.mjs')).href);
const { calls, control } = await import(pathToFileURL(join(out, 'api.mjs')).href);
const { AxiosError } = await import(pathToFileURL(join(out, 'axios.mjs')).href);

let bad = 0;
const ok = (cond, why) => {
  if (!cond) {
    bad += 1;
    console.error(`✗ ${why}`);
  }
};
const tick = () => new Promise((r) => setTimeout(r, 5));
const put = (id, day) => ({ type: 'put', id, body: { day, minutes: 60, kind: 'field' } });
const U = 'user-1';

// 1. A month handed in while its entry is on its way: the next entry still goes.
await q.initQueue(U);
control.hold('A');
await q.enqueue(U, put('A', '2026-11-30'));
await q.enqueue(U, put('B', '2026-12-01'));
await tick();
await q.discardUnsent(U, new Set(['A']));
control.release('A', new AxiosError(409));
await q.flush(U);
await tick();
ok(calls.includes('put:B'), 'запись декабря отправлена, хотя ноябрьскую убрали во время её отправки');
ok(q.pendingOps(U).length === 0, 'очередь пуста');
ok(q.currentRefusals().length === 0, 'убранная (вошедшая в отчёт) запись не показана как отклонённая');

// 2. An entry changed while its first version is on its way: nothing else lost.
calls.length = 0;
control.hold('C');
await q.enqueue(U, put('C', '2026-12-02'));
await q.enqueue(U, put('D', '2026-12-03'));
await tick();
await q.enqueue(U, { ...put('C', '2026-12-02'), body: { day: '2026-12-02', minutes: 90, kind: 'field' } });
control.release('C');
await q.flush(U);
await tick();
ok(calls.filter((c) => c === 'put:C').length === 2 && calls.includes('put:D'), 'правка во время отправки: D не потеряна, C отправлена дважды');
ok(q.pendingOps(U).length === 0, 'очередь пуста после правки');

// 3. A second send waits for the first, then answers truly.
control.hold('E');
await q.enqueue(U, put('E', '2026-12-04'));
await tick();
const second = q.flush(U);
let settled = false;
second.then(() => (settled = true));
await tick();
ok(!settled, 'второй вызов ждёт первый, а не отвечает «не отправлено» сразу');
control.release('E');
ok((await second) === true, 'после ожидания — «всё отправлено»');

// 4. A real refusal is told, with its day.
control.hold('F');
await q.enqueue(U, put('F', '2026-11-30'));
await tick();
control.release('F', new AxiosError(409));
await q.flush(U);
await tick();
const r = q.currentRefusals();
ok(r.length === 1 && r[0].id === 'F' && r[0].day === '2026-11-30', 'отказ сервера сохранён с днём записи');
q.dismissRefusal('F');
ok(q.currentRefusals().length === 0, 'закрытый отказ уходит');

if (bad) {
  console.error(`\n${bad} проверок очереди учёта часов не прошли.`);
  process.exit(1);
}
console.log('OK: очередь учёта часов — удаление по записи, ожидание отправки, отказы.');
