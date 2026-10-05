#!/usr/bin/env node
/**
 * The address behind «Открыть источник», checked (5 October 2026).
 *
 * lib/source-link.ts decides what is offered as a link and how it is opened:
 * an address typed without «https://» must still open, and something that is
 * not an address must not become a dead link — or worse, a `javascript:` one.
 *
 * Called directly from the gate — no test runner in the app, and a new npm
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
const out = mkdtempSync(join(tmpdir(), 'source-link-'));
const js = ts.transpileModule(readFileSync(join(ROOT, 'lib', 'source-link.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'source-link.mjs'), js);
const { sourceHref } = await import(pathToFileURL(join(out, 'source-link.mjs')));

const CASES = [
  ['https://wol.jw.org/ru/wol/d/r2/lp-u/202026', 'https://wol.jw.org/ru/wol/d/r2/lp-u/202026', 'полный адрес — как есть'],
  ['http://example.org/a?b=1#c', 'http://example.org/a?b=1#c', 'http — как есть'],
  ['  https://www.jw.org/ru/  ', 'https://www.jw.org/ru/', 'пробелы по краям'],
  ['wol.jw.org/ru/wol/d/r2/lp-u/202026', 'https://wol.jw.org/ru/wol/d/r2/lp-u/202026', 'без https:// — дописывается'],
  ['www.jw.org', 'https://www.jw.org', 'только сайт'],
  ['HTTPS://WOL.JW.ORG/x', 'HTTPS://WOL.JW.ORG/x', 'заглавная схема'],
  ['', null, 'пусто'],
  [null, null, 'нет значения'],
  [undefined, null, 'не задано'],
  ['см. рабочую тетрадь, с. 5', null, 'слова, а не адрес'],
  ['w06 15.3', null, 'сокращение с пробелом'],
  ['w06', null, 'одно слово без точки'],
  ['javascript:alert(1)', null, 'javascript: не открывается'],
  ['mailto:someone@example.org', null, 'почта не источник'],
  ['file:///etc/passwd', null, 'файл не источник'],
  ['https://a.org и ещё', null, 'адрес с текстом после пробела'],
];

let failures = 0;
for (const [input, want, name] of CASES) {
  const got = sourceHref(input);
  if (got !== want) {
    failures += 1;
    console.error(`✗ ${name}\n    вход: ${JSON.stringify(input)}\n    получено: ${JSON.stringify(got)}\n    ожидалось: ${JSON.stringify(want)}`);
  }
}
if (failures) {
  console.error(`\nСсылка на источник: ${failures} не сошлось из ${CASES.length}`);
  process.exit(1);
}
console.log(`Ссылка на источник: ${CASES.length} случаев сходятся`);
