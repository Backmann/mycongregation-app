#!/usr/bin/env node
/**
 * The rule «which wording is still asked for», pinned (5 October 2026).
 *
 * scripts/check-i18n-unused.mjs fails the gate on a key nothing asks for —
 * so a rule that is wrong either way does harm: too strict, and working text
 * gets deleted (the first version would have removed the iPhone install
 * steps); too loose, and dead wording stays for good. Each case here is one
 * way the app really asks for a key, or really does not.
 */
import { collect, unusedKeys } from './check-i18n-unused.mjs';

const code = (text, name = 'x.tsx') => ({ name, text });
// [what the code says, the keys in the locale, which of them are unused, why]
const CASES = [
  ["t('a.b')", ['a.b', 'a.c'], ['a.c'], 'written out in full'],
  ['t("a.b"); t(`a.c`)', ['a.b', 'a.c'], [], 'any quote'],
  ["t(ok ? 'a.yes' : 'a.no')", ['a.yes', 'a.no', 'a.maybe'], ['a.maybe'], 'a ternary of two keys'],
  ["const ROWS = [{ label: 'a.b' }]; t(row.label)", ['a.b', 'a.c'], ['a.c'], 'a key kept in a table'],
  ['t(`a.kinds.${k}`)', ['a.kinds.one', 'a.kinds.two', 'a.other'], ['a.other'], 'a family by its beginning'],
  ["t('a.kinds.' + k)", ['a.kinds.x', 'a.z'], ['a.z'], 'a family joined with +'],
  ['t(`a.step${n}`)', ['a.step1', 'a.step2', 'a.stop'], ['a.stop'], 'the beginning ends inside a word'],
  ['t(`a.steps.${c}.${s}`)', ['a.steps.x.y', 'a.b'], ['a.b'], 'two variables after a fixed beginning'],
  ["t('a.days', { count })", ['a.days_one', 'a.days_few', 'a.days_many', 'a.weeks_one'], ['a.weeks_one'], 'forms of number of a used key'],
  ['t(`a.k.${x}`, { count })', ['a.k.day_one', 'a.k.day_many'], [], 'forms of number inside a family'],
  ["t('a.b_one')", ['a.b_one', 'a.b_few'], ['a.b_few'], 'a form named outright does not free its siblings'],
  ["// t('a.b')", ['a.b'], ['a.b'], 'a key only in a comment is not asked for'],
  ['const x = `${a}.title`', ['a.title'], ['a.title'], 'no fixed beginning — cannot be seen, and is not guessed'],
  ["fetch('/a.b')", ['a.b'], ['a.b'], 'a path is not a key'],
  ["i18n.t('a.b')", ['a.b'], [], 'another translator'],
  ['<Text>{t("a.b")}</Text>', ['a.b', 'a.c'], ['a.c'], 'inside markup'],
];

let failed = 0;
for (const [text, keys, want, why] of CASES) {
  const got = unusedKeys(keys, collect([code(text)]), new Set());
  if (got.join(',') !== want.join(',')) {
    failed++;
    console.error(`✗ ${why}\n    код: ${text}\n    ждали лишними: [${want}], вышло: [${got}]`);
  }
}
// KEPT spares a key, and only that key.
const kept = unusedKeys(['a.b', 'a.c'], collect([code('')]), new Set(['a.b']));
if (kept.join(',') !== 'a.c') { failed++; console.error(`✗ KEPT: ждали [a.c], вышло [${kept}]`); }

if (failed) {
  console.error(`\n${failed} из ${CASES.length + 1} — правило «какой текст ещё нужен» разошлось с ожидаемым`);
  process.exit(1);
}
console.log(`OK: ${CASES.length + 1} проверок правила «какой текст ещё нужен».`);
