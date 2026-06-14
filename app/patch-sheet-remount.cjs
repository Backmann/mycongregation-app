#!/usr/bin/env node
/**
 * patch-sheet-remount.cjs — форма в боттом-шите пересинхронизируется с
 * выбранной частью. AssignmentForm берёт initial только при монтировании
 * (useState), а Modal переиспользует поддерево — поэтому при открытии уже
 * заполненной части поля были пустыми/чужими. Даём форме key={assignment.id}:
 * при смене части React пересоздаёт её с актуальными значениями (речь,
 * докладчик, ассистент, статус, заметки), а пока часть та же — твой ввод
 * не затирается. Применять ПОВЕРХ e281850. Idempotent; LF/CRLF tolerant.
 * Запускать из ~/congmap/app.
 */
const fs = require('fs');

const file = 'components/AssignmentSheet.tsx';
let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.log(`FAIL: cannot read ${file}: ${e.message}`);
  process.exit(1);
}
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let txt = raw.split('\r\n').join('\n');

if (txt.includes('key={assignment.id}')) {
  console.log(`SKIP: ${file} already patched`);
  process.exit(0);
}

const edits = [
  [
    'key on SongPicker',
    '            <SongPicker\n              currentTitle={assignment.partTitle}',
    '            <SongPicker\n              key={assignment.id}\n              currentTitle={assignment.partTitle}',
  ],
  [
    'key on AssignmentForm',
    '              <AssignmentForm\n                initial={{',
    '              <AssignmentForm\n                key={assignment.id}\n                initial={{',
  ],
];

for (const [label, anchor, replacement] of edits) {
  const parts = txt.split(anchor);
  if (parts.length !== 2) {
    console.log(`FAIL: anchor for "${label}" found ${parts.length - 1} time(s), expected 1`);
    process.exit(1);
  }
  txt = parts[0] + replacement + parts[1];
  console.log(`OK: ${label}`);
}

fs.writeFileSync(file, txt.split('\n').join(eol));
console.log(`OK: ${file} written`);
console.log('DONE: sheet form remounts per assignment');
