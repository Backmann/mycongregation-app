/**
 * The folder for the circuit overseer, S-61 (17 November 2026), held to the
 * decisions: the options of page 2 as the form gives them (1, 2, 10, 12 only
 * ДА / НЕТ), «передано» only after all fifteen answers, a saved file that
 * changed is not ready, file names numbered and clean, the browser's file
 * name taken from the sheet's <title>, and the sheets escaping what they
 * print. Every locale has the fifteen questions and the sixteen items.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');

const out = mkdtempSync(join(ROOT, '.check-co-folder-'));
let failures = 0;
let passed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
}
const emit = (file, name) => {
  const src = readFileSync(join(ROOT, 'lib', file), 'utf8');
  const js = ts
    .transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    })
    .outputText.replace(/from '\.\/s21'/g, "from './s21.mjs'");
  writeFileSync(join(out, name), js);
};

try {
  emit('co-folder-rules.ts', 'rules.mjs');
  emit('s21.ts', 's21.mjs');
  emit('coFolderPdf.ts', 'pdf.mjs');
  const R = await import(pathToFileURL(join(out, 'rules.mjs')));
  const P = await import(pathToFileURL(join(out, 'pdf.mjs')));

  // Page 2: the form's own options.
  for (const q of [1, 2, 10, 12]) check(`q${q} yes/no only`, R.optionsOf(q), ['yes', 'no']);
  check('q4 has н/о', R.optionsOf(4), ['yes', 'no', 'na']);
  check('fifteen questions', R.QUESTIONS.length, 15);

  // «Передано» only when every question has an answer.
  const page2 = (answered, erasedAt = null) => ({ page2: { total: 15, answered, erasedAt } });
  check('handing over with 14 answers', R.mayHandOver(page2(14)), false);
  check('handing over with 15 answers', R.mayHandOver(page2(15)), true);
  check('handing over after erasing', R.mayHandOver(page2(0, '2027-03-01')), true);
  check('no page 2, no handing over', R.mayHandOver({}), false);

  // A saved file whose data changed is «changed», not done.
  check('changed', R.toneOf({ state: 'saved', changed: true, ready: false }), 'changed');
  check('saved', R.toneOf({ state: 'saved', changed: false, ready: true }), 'done');
  check('paper', R.toneOf({ state: 'paper', changed: false, ready: true }), 'manual');
  check('na', R.toneOf({ state: 'na', changed: false, ready: true }), 'na');
  check('groups half', R.toneOf({ state: null, changed: false, ready: false }, true), 'partial');

  // Filters.
  const f = {
    access: { roles: ['secretary'] },
    items: [
      { key: '1.1', role: 'coordinator', ready: true },
      { key: '2.1', role: 'secretary', ready: false },
      { key: '2.2', role: 'secretary', ready: true },
    ],
  };
  check('mine', R.filterItems(f, 'mine').map((i) => i.key), ['2.1', '2.2']);
  check('open', R.filterItems(f, 'open').map((i) => i.key), ['2.1']);

  // Group numbers follow the order the server gives.
  const g = { groups: [{ key: '2.1:a' }, { key: '2.1:b' }, { key: '2.1:none' }] };
  check('group number', R.groupNumber(g, '2.1:none'), '2.1.3');

  // File names: numbered, nothing a file system refuses, no doubled spaces.
  check('file name', R.fileName('2.1.3', 'S-21 Группа: 3/4'), '2.1.3 S-21 Группа 3 4');

  // The browser names the PDF after <title>: replaced, not doubled.
  const t = P.withTitle('<html><head><title>S-88</title></head></html>', '2.2 Посещаемость <встреч>');
  check('title replaced', t, '<html><head><title>2.2 Посещаемость &lt;встреч&gt;</title></head></html>');
  check('title added', P.withTitle('<html><head></head></html>', 'x'), '<html><head><title>x</title></head></html>');

  // Sheets escape what they print, and say so when there is nothing.
  const head = { kicker: 'K', title: '1.3 T', subtitle: 'S', foot: 'F' };
  const tab = P.buildTableHtml(head, ['A'], [['<b>x</b>']], 'нет');
  check('escaped cell', tab.includes('&lt;b&gt;x&lt;/b&gt;') && !tab.includes('<b>x</b>'), true);
  check('empty sheet', P.buildTableHtml(head, ['A'], [], 'нет записей').includes('нет записей'), true);

  // Contacts: a person with no group gets the words for it.
  const c = P.buildContactsHtml(
    head,
    [{ lastName: 'Ланг', firstName: 'Анна', group: null, mobilePhone: '+49', email: null, address: null }],
    { name: 'N', group: 'G', phone: 'P', email: 'E', address: 'A' },
    'Без группы',
    '-',
  );
  check('contacts no group', c.includes('Без группы') && c.includes('Ланг Анна'), true);

  // Every locale: the sixteen items and the fifteen questions.
  for (const lang of ['ru', 'de', 'en']) {
    const d = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')).coFolder;
    const items = ['1_1', '1_2', '1_3', '1_4', '1_5', '2_1', '2_2', '2_3', '2_4', '2_5', '3_1', '3_2', '3_3', '3_4', '3_5', '3_6'];
    check(`${lang}: items`, items.every((k) => d.item[k]?.title && d.item[k]?.hint), true);
    check(`${lang}: questions`, R.QUESTIONS.every((q) => !!d.q[String(q)]), true);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n✗ Папка для районного: ${failures} из ${failures + passed} проверок не прошли`);
  process.exit(1);
}
console.log(`✓ Папка для районного (S-61): ${passed} проверок`);
