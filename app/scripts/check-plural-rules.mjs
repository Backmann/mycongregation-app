#!/usr/bin/env node
/**
 * The plural rules the phone uses, checked (28 September).
 *
 * lib/plural-rules.ts stands in for `Intl.PluralRules` on Android, where
 * Hermes has none and i18next fell back to «one or other» («86
 * возвещателя»). Here, where Node has the real rules:
 *   1. the stand-in answers exactly as the real rules do — every number from
 *      0 to 1000 and a few fractions, in Russian, English and German;
 *   2. with the real rules taken away, as on the phone, i18next with the
 *      stand-in chooses the right forms from the app's own translations.
 *
 * Called directly from the gate — a new npm script would move the Expo
 * fingerprint.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'plural-'));
const src = readFileSync(join(ROOT, 'lib', 'plural-rules.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'plural-rules.mjs'), js);
const { SimplePluralRules, installPluralRules } = await import(
  pathToFileURL(join(out, 'plural-rules.mjs')).href
);

let bad = 0;
const fail = (s) => {
  bad++;
  if (bad <= 15) console.error('✗ ' + s);
};

// 1. The same answers as the real rules.
const numbers = [...Array(1001).keys(), 0.5, 1.5, 2.5, 5.5, 21.3, 1.0];
for (const lang of ['ru', 'en', 'de']) {
  for (const type of ['cardinal', 'ordinal']) {
    if (type === 'ordinal' && lang !== 'en') continue;
    const real = new Intl.PluralRules(lang, { type });
    const mine = new SimplePluralRules(lang, { type });
    for (const n of numbers) {
      if (real.select(n) !== mine.select(n)) {
        fail(`${lang} ${type} ${n}: настоящее «${real.select(n)}», наше «${mine.select(n)}»`);
      }
    }
    const a = [...real.resolvedOptions().pluralCategories].sort().join(',');
    const b = [...mine.resolvedOptions().pluralCategories].sort().join(',');
    if (a !== b) fail(`${lang} ${type}: категории ${a} против ${b}`);
  }
}

// 2. As on the phone: no rules of the engine's own.
const realPR = Intl.PluralRules;
delete Intl.PluralRules;
const installed = installPluralRules();
if (!installed) fail('без встроенных правил заплатка не встала');
const i18next = require('i18next').default ?? require('i18next');
const ru = JSON.parse(readFileSync(join(ROOT, 'locales', 'ru.json'), 'utf8'));
const inst = i18next.createInstance();
await inst.init({
  lng: 'ru',
  resources: { ru: { translation: ru } },
  compatibilityJSON: 'v4',
  interpolation: { escapeValue: false },
});
const cases = [
  ['congregationHub.live.publishers', 86, '86 возвещателей'],
  ['congregationHub.live.publishers', 1, '1 возвещатель'],
  ['congregationHub.live.publishers', 22, '22 возвещателя'],
  ['congregationHub.live.groups', 5, '5 групп'],
  ['congregationHub.live.groups', 3, '3 группы'],
  ['congregationHub.live.groups', 21, '21 группа'],
];
for (const [key, count, want] of cases) {
  const got = inst.t(key, { count });
  if (got !== want) fail(`${key} ${count}: «${got}», а нужно «${want}»`);
}
Intl.PluralRules = realPR;
// With the real rules present, nothing is replaced.
if (installPluralRules()) fail('при настоящих правилах заплатка всё равно встала');

if (bad) {
  console.error(`Правила чисел: ${bad} расхождений`);
  process.exit(1);
}
console.log(`OK: правила чисел совпадают с настоящими (ru, en, de; 0–1000 и дроби), и без них i18next говорит «86 возвещателей».`);
