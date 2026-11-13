/**
 * The journal's lines for the territory section (lib/territory-journal.ts,
 * 12 November 2026): the server's facts read as words, never as code names
 * («outline», «leaving») and never as nothing (the card's before/after).
 * Every key the lines use must exist in ru, de and en.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-tjournal-'));
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
const locales = Object.fromEntries(
  ['ru', 'de', 'en'].map((l) => [l, JSON.parse(readFileSync(join(ROOT, 'locales', `${l}.json`), 'utf8'))]),
);
const lookup = (obj, key) => key.split('.').reduce((o, p) => (o == null ? undefined : o[p]), obj);
const used = new Set();
const tFor = (lang) => (key, opts) => {
  used.add(key);
  let v = lookup(locales[lang], key);
  if (typeof v !== 'string') return `!!${key}`;
  for (const [a, b] of Object.entries(opts ?? {})) v = v.replaceAll(`{{${a}}}`, String(b));
  return v;
};
try {
  const src = readFileSync(join(ROOT, 'lib', 'territory-journal.ts'), 'utf8');
  writeFileSync(
    join(out, 'tj.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const { territoryJournalLines: L } = await import(pathToFileURL(join(out, 'tj.mjs')));
  const t = tFor('ru');
  const date = (iso) => `[${iso}]`;
  const show = (lines) => lines.map((l) => `${l.label}: ${l.was ? `${l.was} → ` : ''}${l.now}`);

  check('card', show(L('territory', {
    before: { number: 'A01', locality: null, kind: 'city' },
    after: { number: 'A10', locality: null, kind: 'suburb' },
    noteChanged: true,
  }, t, date)), ['Номер: A01 → A10', 'Местность: Город → Пригород', 'Заметка: изменена']);
  check('outline', show(L('territory', { outline: 'edit', number: 'A01', with: ['A02'], leaving: 3, gaining: 0 }, t, date)),
    ['Участок: A01', 'Граница: изменена', 'Вместе с соседями: A02', 'По земле: уходит 3%, добавляется 0%']);
  check('businesses added', show(L('territory', { number: 'G-1', businessesAdded: 12 }, t, date)),
    ['Участок: G-1', 'Добавлено в список предприятий: 12']);
  check('one business added', show(L('territory', { number: 'G-1', businessesAdded: 1, business: 'Kiosk' }, t, date)),
    ['Участок: G-1', 'Добавлено в список предприятий: Kiosk']);
  check('business renamed', show(L('territory', { number: 'G-1', businessEdited: 'Kiosk Eck', businessWas: 'Kiosk' }, t, date)),
    ['Участок: G-1', 'Предприятие: Kiosk → Kiosk Eck']);
  check('business removed', show(L('territory', { number: 'G-1', businessRemoved: 'Kiosk' }, t, date)),
    ['Участок: G-1', 'Убрано из списка предприятий: Kiosk']);
  check('outline told', show(L('territory', { outline: 'edit', number: 'A02', with: ['A01'], leaving: 5, gaining: 0, noCallsMoved: 1, holderTold: true }, t, date)),
    ['Участок: A02', 'Граница: изменена', 'Вместе с соседями: A01', 'По земле: уходит 5%, добавляется 0%', 'Перенесено адресов «не посещать»: 1', 'Держателю: отправлено уведомление']);
  check('split', show(L('territory', { split: true, number: 'A01', made: 'A06', noCallsMoved: 2 }, t, date)),
    ['Участок: A01', 'Разделён: новый участок A06', 'Перенесено адресов «не посещать»: 2']);
  check('split off', show(L('territory', { splitFrom: 'A01', number: 'A06' }, t, date)),
    ['Участок: A06', 'Выделен из участка: A01']);
  check('merge', show(L('territory', { merged: 'A02', number: 'A01', lastWorkedOn: '2026-04-04', noCallsMoved: 0 }, t, date)),
    ['Участок: A01', 'Присоединён участок: A02', '«Последний раз пройден»: [2026-04-04]']);
  check('merged away', show(L('territory', { archived: true, mergedInto: 'A01' }, t, date)),
    ['Объединён с участком: A01', 'Архив: убран в архив']);
  check('undo', show(L('territory', { undone: 'merge', number: 'A01' }, t, date)),
    ['Участок: A01', 'Отменено: объединение']);
  check('new', show(L('territory', { number: 'Д-1', category: 'business' }, t, date)),
    ['Участок: Д-1', 'Вид: Деловая территория']);
  check('no-call moved', show(L('territory_no_call', { territory: 'A01', changed: ['territory'], movedTo: 'A02' }, t, date)),
    ['Участок: A01', 'Изменено: участок', 'Перенесён в участок: A02']);
  check('other sections untouched', L('publisher', { x: 1 }, t, date), null);

  // Every key the lines read exists in every language.
  for (const lang of ['de', 'en']) {
    const tl = tFor(lang);
    for (const d of [
      { before: { number: 'a', kind: 'city' }, after: { number: 'b', kind: 'village' }, noteChanged: true },
      { outline: 'undo', number: 'a', with: ['b'], leaving: 1, gaining: 1 },
      { split: true, made: 'b', number: 'a', noCallsMoved: 1 },
      { splitFrom: 'a', number: 'b' },
      { merged: 'b', lastWorkedOn: null, number: 'a' },
      { archived: true, mergedInto: 'a' },
      { archived: false, number: 'a' },
      { undone: 'split' }, { undone: 'merge' }, { undone: 'new' },
      { number: 'a', category: 'residential' },
    ]) {
      const lines = show(L('territory', d, tl, date));
      check(`${lang}: no missing words in ${JSON.stringify(d)}`, lines.some((x) => x.includes('!!')), false);
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`check-territory-journal: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`check-territory-journal: ${passed} checks passed`);
