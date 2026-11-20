#!/usr/bin/env node
/**
 * «Составление программы»: the lessons of the audit of 20 November 2026,
 * kept as checks so they are not learned again.
 *
 * 1. Every write on the screen refreshes through lib/programme-refresh: the
 *    parts alone went fresh, the «N из M» badge and the person picker's
 *    history (who already has a part this meeting) stayed stale — and a
 *    brother just given part 3 was offered as free for part 4.
 * 2. An empty meeting made by hand has none of the circuit overseer's parts:
 *    they stood in every ordinary week, and a weekend could never be ready.
 * 3. A theme typed by hand clears the catalogue talk: the programme showed
 *    one talk and the talks' history recorded another.
 * 4. Taking a person off and cancelling a part are asked first on every
 *    device, in the app's own dialog (the phone did it at the first tap).
 * 5. A delayed text save goes to the part it was typed into.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
};

const edit = read('app/(app)/schedule/edit.tsx');
const sheet = read('components/AssignmentSheet.tsx');
const form = read('components/AssignmentForm.tsx');
const refresh = read('lib/programme-refresh.ts');
const parts = read('lib/parts.ts');

// 1 — every file of the app, not only the editor: the import, the quick
// replacement, the talk coordinator's journal, «Местные потребности» write
// the programme too (review, 20 November 2026).
const walk = (d) =>
  readdirSync(join(ROOT, d)).flatMap((f) => {
    const p = join(d, f);
    return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(f) ? [p] : [];
  });
const bypass = ['app', 'components', 'lib']
  .flatMap(walk)
  .filter((p) => !p.endsWith('programme-refresh.ts'))
  .filter((p) => /invalidateQueries\(\{\s*queryKey:\s*\[\s*["']assignments["']\s*\]/.test(read(p)));
check(`программа обновляется только через refreshProgramme${bypass.length ? ': ' + bypass.join(', ') : ''}`, bypass.length === 0);
check(
  'refreshProgramme обновляет части, счётчик и историю людей',
  ["'assignments'", "'readiness'", "'publisher-activity'"].every((k) => refresh.includes(k)),
);

// 2
check(
  'части районного — отдельный список',
  /CO_VISIT_PART_KEYS[^=]*=\s*new Set\(\[\s*'co_service_talk',\s*'co_concluding_talk',?\s*\]\)/.test(parts),
);
const create = edit.slice(edit.indexOf('const createWeekMutation'), edit.indexOf('const addChristianLifeMut'));
check('пустая встреча — без частей районного', /\.filter\(\(p\) => !CO_VISIT_PART_KEYS\.has\(p\.key\)\)/.test(create));
check('пустая встреча — номера по порядку, без повторов', /partOrder: i \+ 1/.test(create));
check('пустая встреча — кнопка занята, пока неделя не на экране', /onSuccess: \(\) => refreshProgramme\(\)/.test(create));

// 3
const manual = form.slice(form.indexOf('const onManualTheme'), form.indexOf('const handleSpeakerTypeChange'));
check('тема вручную снимает речь из каталога', /publicTalkId: null/.test(manual));
check('оба поля темы — через onManualTheme', (form.match(/onChangeText=\{onManualTheme\}/g) ?? []).length === 2);

// 4
check('«Снять назначение» спрашивает через общий диалог', /const confirmUnassign = async[\s\S]{0,400}await confirm\(/.test(sheet) && !/window\.confirm/.test(sheet));
check('«Отменить часть» спрашивает', /next === "cancelled" &&[\s\S]{0,120}await confirm\(/.test(form));

// 5
check('отложенная правка сохраняется в свою часть', /debounceBox\.save = onInstantSave/.test(form) && /mutationFn: \(\{ id, input \}/.test(sheet));

if (failures) {
  console.error(`\nСоставление программы: ${failures} проверок не сходятся.`);
  process.exit(1);
}
console.log('\nСоставление программы: всё сходится.');
