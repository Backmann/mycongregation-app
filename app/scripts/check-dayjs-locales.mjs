#!/usr/bin/env node
/**
 * Dates speak the language of the page on every screen, whichever is opened
 * first.
 *
 * dayjs knows English only; `.locale('ru')` is silently ignored unless the
 * Russian names were loaded by somebody. They were loaded screen by screen,
 * and a screen that forgot still looked right — until it was the first one
 * opened. See lib/dayjs-locales.ts.
 *
 * Three things are held here:
 *   1. every language the app has wording for has its names in
 *      lib/dayjs-locales.ts (English is dayjs's own);
 *   2. lib/i18n.ts loads that file, and the root layout loads lib/i18n.ts —
 *      so the names are there before any screen;
 *   3. the mechanism itself: without the names the same call answers in
 *      English, with them — in the language asked for. If dayjs ever changes
 *      that, this says so instead of a screen.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts` — that
 * block is an input to the Expo fingerprint.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const problems = [];

const languages = readdirSync(join(ROOT, 'locales'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));
const source = read('lib/dayjs-locales.ts');
const loaded = [...source.matchAll(/^import ['"]dayjs\/locale\/([a-z-]+)['"];?$/gm)].map((m) => m[1]);

for (const lang of languages) {
  if (lang === 'en') continue;
  if (!loaded.includes(lang)) {
    problems.push(`язык «${lang}» есть в locales/, а названий месяцев для него в lib/dayjs-locales.ts нет`);
  }
}
if (!/^import ['"]\.\/dayjs-locales['"];?$/m.test(read('lib/i18n.ts'))) {
  problems.push('lib/i18n.ts не подключает ./dayjs-locales');
}
if (!/from ['"]\.\.\/lib\/i18n['"]/.test(read('app/_layout.tsx'))) {
  problems.push('app/_layout.tsx не подключает ../lib/i18n — названия не окажутся загружены до первого экрана');
}

// The mechanism, on the real library.
const require = createRequire(join(ROOT, 'package.json'));
const dayjs = require('dayjs');
const DAY = '2027-02-28';
const EXPECT = { ru: '28 февраля 2027 · воскресенье', de: '28 Februar 2027 · Sonntag' };
const say = (lang) => dayjs(DAY).locale(lang).format('D MMMM YYYY · dddd');
const before = say('ru');
if (before !== '28 February 2027 · Sunday') {
  problems.push(`без загруженных названий dayjs ответил «${before}», а ждали английского — правило изменилось, проверьте lib/dayjs-locales.ts`);
}
for (const lang of loaded) require(`dayjs/locale/${lang}`);
for (const lang of languages) {
  if (lang === 'en' || !EXPECT[lang]) {
    if (lang !== 'en') problems.push(`для языка «${lang}» нет ожидаемой строки в этой проверке`);
    continue;
  }
  const got = say(lang);
  if (got !== EXPECT[lang]) problems.push(`«${lang}»: «${got}», а должно быть «${EXPECT[lang]}»`);
}

if (problems.length) {
  console.error('✗ Названия месяцев и дней недели:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`✓ Названия месяцев и дней недели: ${loaded.join(', ')} загружаются до первого экрана`);
