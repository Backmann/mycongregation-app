#!/usr/bin/env node
/**
 * ONE STOP AT THE END OF A SENTENCE (24 November 2026): a value that ends
 * with a stop — «Nordstr.», «Иванов И.», a reason typed as a sentence — put
 * before a translation's own stop gave «Nordstr..». lib/punctuation.ts tidies
 * every translated string; this check holds that:
 *   - the translations never hold «..», «?.», «!.» themselves, so the tidying
 *     only ever touches what a value brought;
 *   - real translations with such values come out with one stop, an ellipsis
 *     stays, a question keeps its mark;
 *   - lib/i18n.ts really runs the tidying on every string.
 * Run directly, never through package.json (that block feeds the Expo fingerprint).
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const i18next = require('i18next');
const out = mkdtempSync(join(tmpdir(), 'punct-'));
const js = ts.transpileModule(readFileSync(join(ROOT, 'lib/punctuation.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'punctuation.mjs'), js);
const P = await import(pathToFileURL(join(out, 'punctuation.mjs')));

let n = 0;
const check = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}\n  ${e.message}`); process.exit(1); } };
const locales = Object.fromEntries(['ru', 'en', 'de'].map((l) => [l, JSON.parse(readFileSync(join(ROOT, `locales/${l}.json`), 'utf8'))]));

check('the translations themselves hold no «..», «?.», «!.»', () => {
  const bad = [];
  for (const [l, j] of Object.entries(locales)) {
    const walk = (o, p) => { for (const [k, v] of Object.entries(o)) { const q = p ? `${p}.${k}` : k; if (typeof v === 'string') { if (/(^|[^.])\.\.(?!\.)/.test(v) || /[?!…]\.(?=\s|$)/.test(v)) bad.push(`${l} ${q}`); } else if (v && typeof v === 'object') walk(v, q); } };
    walk(j, '');
  }
  assert.deepEqual(bad, []);
});

check('the rule itself', () => {
  assert.equal(P.tidyPunctuation('Адрес: Nordstr..'), 'Адрес: Nordstr.');
  assert.equal(P.tidyPunctuation('ждём тебя с речью «Что такое вера?».'), 'ждём тебя с речью «Что такое вера?».');
  assert.equal(P.tidyPunctuation('Причина: вы уверены?.'), 'Причина: вы уверены?');
  assert.equal(P.tidyPunctuation('Подождите...'), 'Подождите...');
  assert.equal(P.tidyPunctuation('1.5 ч. и 2.5 ч.'), '1.5 ч. и 2.5 ч.');
  assert.equal(P.tidyPunctuation('Готово. Дальше.'), 'Готово. Дальше.');
});

await i18next.use(P.punctuationProcessor).init({
  resources: Object.fromEntries(Object.entries(locales).map(([l, j]) => [l, { translation: j }])),
  lng: 'ru',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
  postProcess: ['punctuation'],
});
check('real translations with values that end in a stop', () => {
  const t = i18next.t.bind(i18next);
  assert.equal(t('talkCoordinator.msgText.addressOnly', { address: 'Nordstr.' }), 'Адрес: Nordstr.');
  assert.equal(t('conduct.live.taken', { name: 'Иванов И.' }).includes('Иванов И. Этот'), true);
  assert.equal(t('fieldService.conflict.cancelledThereWhy', { time: '10:00', reason: 'Дождь!' }), 'В этот день встреча в 10:00 отменена: Дождь!');
  assert.equal(t('talkCoordinator.msgText.addressOnly', { address: 'Nordstraße 5' }), 'Адрес: Nordstraße 5.');
  assert.equal(i18next.t('talkCoordinator.msgText.addressOnly', { address: 'Nordstr.', lng: 'de' }).endsWith('Nordstr.'), true);
});

check('lib/i18n.ts tidies every string', () => {
  const src = readFileSync(join(ROOT, 'lib/i18n.ts'), 'utf8');
  assert.ok(src.includes('.use(punctuationProcessor)'), 'the processor is not registered');
  assert.ok(src.includes("postProcess: ['punctuation']"), 'the processor is not applied to every string');
});

console.log(`✓ Одна точка в конце предложения (проверок: ${n})`);
