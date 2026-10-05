#!/usr/bin/env node
/**
 * «Возможно, один брат», checked (5 October 2026).
 *
 * lib/similar-names.ts decides which two cards of visiting speakers the
 * directory offers to merge. A rule that pairs strangers would nag; one that
 * misses «Иван Ротарь» / «Iwan Rotar» is the fault it was written to end.
 * Both directions are pinned here, with the names invented.
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
const out = mkdtempSync(join(tmpdir(), 'similar-names-'));
const js = ts.transpileModule(readFileSync(join(ROOT, 'lib', 'similar-names.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'similar-names.mjs'), js);
const { likelySameName, likelyDoubles } = await import(pathToFileURL(join(out, 'similar-names.mjs')));

// [first, second, expected, why]
const CASES = [
  ['Иван Ротарь', 'Ротарь Иван', true, 'порядок слов'],
  ['Иван Ротарь', 'Iwan Rotar', true, 'латиница по-немецки'],
  ['Иван Ротарь', 'Ivan Rotar', true, 'латиница по-английски'],
  ['Иван Ротарюк', 'Rotariuk Iwan', true, 'ю = iu, и порядок'],
  ['иван  ротарь', 'ИВАН РОТАРЬ', true, 'регистр и пробелы'],
  ['Пётр Вагнер', 'Петр Вагнер', true, 'ё = е'],
  ['Пётр Вагнер', 'Peter Wagner', true, 'Peter = Пётр, w = в'],
  ['Александр Беккер', 'Alexander Becker', true, 'x = кс, -er, ck'],
  ['Александр Шнайдер', 'Alexander Schneider', true, 'sch = ш, ei = ай'],
  ['Александр Кауфман', 'Alexander Kaufmann', true, 'двойная n'],
  ['Виктор Нойман', 'Viktor Neumann', true, 'eu = ой'],
  ['Виктор Нойман', 'Wiktor Neumann', true, 'w = в'],
  ['Василий Стрельчук', 'Wasilij Strelchuk', true, 'ij = ий, ch = ч'],
  ['Фёдор Черных', 'Fedor Chernih', true, 'ch = ч, конечное h'],
  ['Фёдор Черных', 'Fjodor Tschernych', true, 'tsch = ч, ch = х'],
  ['Сергей Еськов', 'Sergej Eskow', true, 'мягкий знак, j = й'],
  ['Сергей Еськов', 'Sergey Eskov', true, 'y = й'],
  ['Виталий Хан', 'Vitali Hahn', true, 'немое h'],
  ['Иван Шустов', 'Iwan Schustow', true, 'sch = ш'],
  ['Алексей Зоммерфельд', 'Aleksej Sommerfeld', true, 's = з, двойная m'],
  ['Юрий Мюллер', 'Juri Müller', true, 'ju = ю, ü'],
  ['Михаил Коршудьянц', 'Michail Korschudjanz', true, 'ch = х, z = ц'],
  ['Шефер Сергей', 'Sergej Schäfer', true, 'ä = е'],
  ['Ротарь, Иван', 'Иван Ротарь', true, 'запятая'],
  // — и то, что двойником НЕ считается —
  ['Иван Ротарь', 'Пётр Ротарь', false, 'та же фамилия, другое имя'],
  ['Иван Ротарь', 'Иван Вагнер', false, 'то же имя, другая фамилия'],
  ['Иван', 'Иван', false, 'одного слова мало'],
  ['Иван Ротарь', 'Иван', false, 'разное число слов'],
  ['Иван Ротарь', 'Иван Петрович Ротарь', false, 'с отчеством — не решаем'],
  ['Андреас Шмидт', 'Андрей Шмидт', false, 'Андреас — не Андрей'],
  ['Виктор Нойман', 'Виктор Науман', false, 'похожие, но разные фамилии'],
  ['Сергей Шефер', 'Сергей Шейфер', false, 'Шефер — не Шейфер'],
  ['', 'Иван Ротарь', false, 'пусто'],
];

let failed = 0;
for (const [a, b, want, why] of CASES) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const got = likelySameName(x, y);
    if (got !== want) {
      failed++;
      console.error(`✗ «${x}» / «${y}»: ждали ${want}, вышло ${got} — ${why}`);
    }
  }
}

// The list: pairs in order, a card never with itself, an answered pair gone.
const cards = [
  { id: 'a', fullName: 'Иван Ротарь' },
  { id: 'b', fullName: 'Пётр Вагнер' },
  { id: 'c', fullName: 'Iwan Rotar' },
  { id: 'd', fullName: 'Ротарь Иван' },
];
const ids = (pairs) => pairs.map(([x, y]) => `${x.id}${y.id}`).join(',');
const all = ids(likelyDoubles(cards, []));
if (all !== 'ac,ad,cd') { failed++; console.error(`✗ список: ждали ac,ad,cd, вышло ${all}`); }
const answered = ids(likelyDoubles(cards, [['c', 'a'], ['a', 'd']]));
if (answered !== 'cd') { failed++; console.error(`✗ «разные братья» в любом порядке: ждали cd, вышло ${answered}`); }
if (likelyDoubles([], []).length !== 0) { failed++; console.error('✗ пустой список'); }

if (failed) {
  console.error(`\n${failed} из ${CASES.length * 2 + 3} — правило «возможно, один брат» разошлось с ожидаемым`);
  process.exit(1);
}
console.log(`OK: ${CASES.length * 2 + 3} проверок правила «возможно, один брат».`);
