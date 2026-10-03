#!/usr/bin/env node
/**
 * What a browser tells the server about its device, checked (3 October 2026).
 *
 * The server sends «one notification a physical device»: an iPhone or iPad
 * always, a browser on Android only when the app did not take the message, a
 * computer only when nothing in the hand did. It learns which is which from
 * `lib/web-device-kind.ts`, and a wrong word there is silent — an iPad that
 * calls itself a computer simply gets nothing while a phone is registered.
 *
 * Called directly from the gate — the app has no test runner, and a new npm
 * script would move the Expo fingerprint.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'web-device-kind-'));
const src = readFileSync(join(ROOT, 'lib', 'web-device-kind.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'web-device-kind.mjs'), js);
const { deviceKindOf } = await import(pathToFileURL(join(out, 'web-device-kind.mjs')));

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

/** [what it is, user agent, touch points, expected] */
const CASES = [
  ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 5, 'ios'],
  ['iPad that says so', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 5, 'ios'],
  // The case the whole file exists for.
  ['iPad calling itself a Mac', MAC, 5, 'ios'],
  ['a real Mac', MAC, 0, 'desktop'],
  ['Android, Chrome', 'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', 5, 'android'],
  ['Android tablet', 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 10, 'android'],
  // A touch screen alone does not make a computer a phone.
  ['Windows laptop with a touch screen', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 10, 'desktop'],
  ['Linux desktop', 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0', 0, 'desktop'],
  ['nothing at all', '', 0, 'desktop'],
];

let failed = 0;
for (const [what, ua, touch, want] of CASES) {
  const got = deviceKindOf(ua, touch);
  if (got !== want) {
    failed += 1;
    console.error(`✗ ${what}: ждали «${want}», получили «${got}»`);
  }
}

// The server accepts exactly these three words; a fourth is a 400 and the
// device is not registered at all.
const serverDto = join(ROOT, '..', 'server', 'src', 'web-push', 'device-kind.ts');
try {
  const text = readFileSync(serverDto, 'utf8');
  const m = text.match(/WEB_DEVICE_KINDS = \[([^\]]+)\]/);
  const server = m ? m[1].replace(/['\s]/g, '').split(',').filter(Boolean).sort().join(',') : '';
  if (server !== 'android,desktop,ios') {
    failed += 1;
    console.error(`✗ сервер принимает «${server}», приложение шлёт «android,desktop,ios»`);
  }
} catch {
  // The server is not checked out beside the app (CI of the app alone).
}

if (failed) {
  console.error(`Устройство подписки: ${failed} расхождений`);
  process.exit(1);
}
console.log(`Устройство подписки: ${CASES.length} случаев сходятся`);
