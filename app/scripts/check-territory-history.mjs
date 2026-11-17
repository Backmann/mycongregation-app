/**
 * «Что происходит» and a territory's journal (lib/territory-history.ts,
 * 17 November 2026): every step the server names reads as a line a
 * territory servant understands — the new shapes with holders and the old
 * ones without — and never as a code name, a raw key or nothing. Every key
 * the lines use must exist in ru, de and en.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-thistory-'));
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
const compile = (file, as, rewrite = (s) => s) => {
  const src = readFileSync(join(ROOT, 'lib', file), 'utf8');
  writeFileSync(
    join(out, as),
    rewrite(
      ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
        .outputText,
    ),
  );
};
try {
  compile('territory-journal.ts', 'tj.mjs');
  compile('territory-history.ts', 'th.mjs', (s) => s.replace("from './territory-journal'", "from './tj.mjs'"));
  const { historyLine, dayHeading } = await import(pathToFileURL(join(out, 'th.mjs')));
  const t = tFor('ru');
  const date = (iso) => `[${iso}]`;
  const L = (item) => {
    const r = historyLine(
      { entityType: 'territory_assignment', holder: null, fromHolder: null, forGroup: null, detail: null, ...item },
      t,
      date,
    );
    return `${r.title} | ${r.meta}`;
  };

  check('given', L({ kind: 'given', holder: 'Петренко С.', detail: { dueOn: '2027-02-02' } }),
    'Выдан: Петренко С. | срок [2027-02-02]');
  check('given for a group', L({ kind: 'given', holder: 'Кузьмин В.', forGroup: 'Гр. 2', detail: {} }),
    'Выдан: Гр. 2 · Кузьмин В. | ');
  check('handed on (new shape)', L({
    kind: 'transferred', holder: 'Мельник О.', fromHolder: 'Петренко С.',
    detail: { on: '2026-11-16', dueOn: '2027-02-02' },
  }), 'Передан: Петренко С. → Мельник О. | с [2026-11-16] · срок [2027-02-02]');
  check('handed on (old shape: no holders in the entry)', L({ kind: 'transferred', detail: { transferredFrom: 'x', on: '2026-11-11' } }),
    'Передан: кто-то → кто-то | с [2026-11-11]');
  check('earlier record', L({
    kind: 'past', holder: 'Ткач Н.',
    detail: { assignedOn: '2025-09-04', completedOn: '2025-12-19' },
  }), 'Добавлена прошлая запись: Ткач Н. | [2025-09-04] → [2025-12-19] · пройден');
  check('earlier record still held', L({ kind: 'past', holder: 'Ткач Н.', detail: { assignedOn: '2026-10-01' } }),
    'Добавлена прошлая запись: Ткач Н. | [2026-10-01] → на руках');
  check('worked', L({ kind: 'worked', holder: 'Шмидт Д.', forGroup: 'Гр. 1', detail: { completedOn: '2026-11-15' } }),
    'Пройден | держал Гр. 1 · Шмидт Д. · [2026-11-15]');
  check('returned', L({ kind: 'returned', holder: 'Шмидт Д.', detail: { returnedOn: '2026-11-15' } }),
    'Возвращён без обработки | держал Шмидт Д. · [2026-11-15]');
  check('campaign', L({ kind: 'campaign', detail: { campaign: ['A01', 'A02'], workedOn: '2026-11-01' } }),
    'Обработаны в кампанию | A01, A02 · [2026-11-01]');
  check('extended', L({ kind: 'extended', holder: 'Шмидт Д.', detail: { dueOn: '2027-01-01' } }),
    'Продлён до [2027-01-01] | держал Шмидт Д.');
  check('removed', L({ kind: 'removed', holder: 'Ткач Н.', detail: { assignedOn: '2026-01-03', returnedOn: '2026-02-01' } }),
    'Удалена запись: Ткач Н. | [2026-01-03] → [2026-02-01] · вернули');
  check('corrected (new shape): who and a day', L({
    kind: 'corrected', holder: 'Кузьмин В.', forGroup: 'Гр. 2',
    detail: {
      correction: true,
      before: { holder: 'Кузьмин В.', forGroup: null, assignedOn: '2026-01-03', completedOn: '2026-05-09', method: 'door_to_door' },
      after: { holder: 'Кузьмин В.', forGroup: 'Гр. 2', assignedOn: '2026-01-03', completedOn: '2026-05-11', method: 'door_to_door' },
    },
  }), 'Исправлена запись: Гр. 2 · Кузьмин В. | Кузьмин В. → Гр. 2 · Кузьмин В. · пройден [2026-05-09] → [2026-05-11]');
  check('corrected (new shape): method', L({
    kind: 'corrected', holder: 'А',
    detail: {
      before: { holder: 'А', completedOn: '2026-05-09', method: 'door_to_door' },
      after: { holder: 'А', completedOn: '2026-05-09', method: 'letters' },
    },
  }), `Исправлена запись: А | ${t('territories.method.door_to_door')} → ${t('territories.method.letters')}`);
  check('corrected (old shape: what was sent)', L({
    kind: 'corrected', holder: 'Шмидт Д.',
    detail: { before: { assignedOn: '2026-01-01' }, after: { reopen: true, dueOn: '2026-12-01' } },
  }), 'Исправлена запись: Шмидт Д. | снова на руках · срок [2026-12-01]');
  check('the territory itself: a boundary', L({
    kind: 'territory', entityType: 'territory', detail: { number: 'A01', outline: 'edit', with: ['A02'] },
  }), 'Граница: изменена | Вместе с соседями: A02');
  check('the territory itself: nothing readable', L({ kind: 'territory', entityType: 'territory', detail: { number: 'A01' } }),
    'Участок изменён | ');

  // Live data, 17 November 2026: the division for pairs read as «Участок изменён».
  check('divided for pairs', L({ kind: 'territory', entityType: 'territory', detail: { split: 'made', mode: 'together', parts: 3, doors: [10, 11, 9] } }),
    'Разделён на пары | частей: 3');
  check('divided for pairs (older shape)', L({ kind: 'territory', entityType: 'territory', detail: { split: 'made', parts: 2, houses: [4, 5] } }),
    'Разделён на пары | частей: 2');
  check('division redone', L({ kind: 'territory', entityType: 'territory', detail: { split: 'again', parts: 4 } }),
    'Деление на пары переделано | частей: 4');
  check('division removed', L({ kind: 'territory', entityType: 'territory', detail: { split: 'removed' } }),
    'Деление на пары убрано | ');
  check('held back for a join', L({ kind: 'territory', entityType: 'territory', detail: { recut: 'held', number: 'A01' } }),
    'Придержан для объединения | ');
  check('a join applied', L({ kind: 'territory', entityType: 'territory', detail: { recut: 'applied', kind: 'join', kept: 'A01', made: [], archived: ['A02'] } }),
    'Объединение применено | в архив: A02');
  check('a cut applied', L({ kind: 'territory', entityType: 'territory', detail: { recut: 'applied', kind: 'cut', kept: 'A01', made: ['A01a'], archived: [] } }),
    'Разрезание применено | новые: A01a');
  check('the congregation boundary', L({ kind: 'territory', entityType: 'territory_boundary', detail: { validFrom: '2026-11-01' } }),
    'Граница собрания обновлена | ');
  const now = new Date(2026, 10, 16, 21, 0);
  check('today', dayHeading(new Date(2026, 10, 16, 8, 0).toISOString(), now, t, date), 'Сегодня');
  check('yesterday', dayHeading(new Date(2026, 10, 15, 23, 30).toISOString(), now, t, date), 'Вчера');
  check('earlier', dayHeading(new Date(2026, 10, 2, 9, 0).toISOString(), now, t, date), '[2026-11-02]');

  // Every key the lines and the screens use exists in all three languages.
  const screens = [
    'app/(app)/cart/desk.tsx',
    'app/(app)/cart/territory/[id].tsx',
    'app/(app)/cart/territory/journal/[id].tsx',
    'components/territories/HistoryFeed.tsx',
    'components/territories/HolderSheet.tsx',
    'components/territories/TransferSheet.tsx',
  ].map((f) => readFileSync(join(ROOT, f), 'utf8'));
  for (const src of screens) {
    for (const m of src.matchAll(/t\(\s*['`](territories\.(?:history|line|transfer|holder)\.[A-Za-z.]+)['`]/g)) used.add(m[1]);
  }
  for (const key of [...used].filter((k) => k.startsWith('territories.') || k.startsWith('journal.'))) {
    for (const lang of ['ru', 'de', 'en']) {
      if (typeof lookup(locales[lang], key) !== 'string') {
        failures += 1;
        console.error(`✗ ${lang}: no «${key}»`);
      }
    }
  }
  // Nothing the lines print is a raw key.
  for (const lang of ['ru', 'de', 'en']) {
    const tl = tFor(lang);
    for (const kind of ['given', 'transferred', 'past', 'worked', 'returned', 'campaign', 'extended', 'removed', 'corrected']) {
      const r = historyLine(
        { kind, entityType: 'territory_assignment', holder: 'X', fromHolder: 'Y', forGroup: null, detail: { dueOn: '2027-01-01', before: { holder: 'X' }, after: { holder: 'Z' } } },
        tl,
        date,
      );
      if (`${r.title}${r.meta}`.includes('!!')) {
        failures += 1;
        console.error(`✗ ${lang} ${kind}: ${r.title} | ${r.meta}`);
      } else passed += 1;
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`check-territory-history: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`check-territory-history: ${passed} passed`);
