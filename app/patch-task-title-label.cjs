#!/usr/bin/env node
/**
 * patch-task-title-label.cjs — заголовки выходных частей показывались
 * сырым ключом (weekend_chairman, weekend_opening_prayer): taskTitle брал
 * item.label как есть, а сервер кладёт туда partKey, когда нет
 * человеческого partTitle (как у частей из EPUB). Теперь meeting-заголовок
 * пропускается через getPartLabel: ключи из реестра переводятся
 * («Председатель встречи»), а готовые заголовки будней возвращаются без
 * изменений (их нет в реестре). Чинит и ленту Главной, и «Мои задания».
 * Idempotent; LF/CRLF tolerant. Запускать из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

const file = 'lib/my-tasks.ts';
let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.log(`FAIL: cannot read ${file}: ${e.message}`);
  process.exit(1);
}
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let txt = raw.split('\r\n').join('\n');

if (txt.includes('getPartLabel')) {
  console.log(`SKIP: ${file} already patched (getPartLabel present)`);
  process.exit(0);
}

const edits = [
  // 1) импорт getPartLabel из соседнего lib/parts
  [
    'import getPartLabel',
    "import { addDays, formatDateISO } from './dates';",
    nl([
      "import { addDays, formatDateISO } from './dates';",
      "import { getPartLabel } from './parts';",
    ]),
  ],
  // 2) meeting-заголовок через getPartLabel (ключи переводятся, заголовки — нет)
  [
    'meeting title via getPartLabel',
    nl([
      "  if (item.kind === 'meeting') {",
      '    return (',
      '      item.label +',
      "      (item.asAssistant ? ` (${t('home.meeting.asAssistant')})` : '')",
      '    );',
      '  }',
    ]),
    nl([
      "  if (item.kind === 'meeting') {",
      '    // label is either a human part title (from EPUB) or a raw partKey',
      '    // (e.g. weekend_chairman); getPartLabel translates known keys and',
      '    // returns the input unchanged for anything not in the registry.',
      '    const label = getPartLabel(item.label);',
      '    return (',
      '      label +',
      "      (item.asAssistant ? ` (${t('home.meeting.asAssistant')})` : '')",
      '    );',
      '  }',
    ]),
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
console.log('DONE: meeting part titles are localized');
