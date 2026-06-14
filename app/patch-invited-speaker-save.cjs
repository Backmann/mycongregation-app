#!/usr/bin/env node
/**
 * patch-invited-speaker-save.cjs — приглашённый (не местный) докладчик не
 * сохранялся: поля speakerName/speakerCongregation звали только update()
 * (локальный form), без onInstantSave — как и публичная речь раньше. В
 * боттом-шите (без кнопки «Сохранить») имя терялось, строка показывала
 * «Не назначен». Теперь поля шлют queueInstant, а переключатель
 * местный/приглашённый — instant с очисткой противоположных полей.
 * Idempotent; LF/CRLF tolerant. Запускать из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

const file = 'components/AssignmentForm.tsx';
let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.log(`FAIL: cannot read ${file}: ${e.message}`);
  process.exit(1);
}
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let txt = raw.split('\r\n').join('\n');

if (txt.includes('// instant-save invited speaker')) {
  console.log(`SKIP: ${file} already patched`);
  process.exit(0);
}

const edits = [
  // 1) speakerName → queueInstant
  [
    'speakerName instant',
    nl([
      '                  value={form.speakerName ?? \'\'}',
      "                  onChangeText={(v) => update('speakerName', v || null)}",
    ]),
    nl([
      '                  value={form.speakerName ?? \'\'}',
      '                  onChangeText={(v) => {',
      "                    update('speakerName', v || null);",
      '                    // instant-save invited speaker',
      "                    queueInstant({ speakerName: v || null });",
      '                  }}',
    ]),
  ],
  // 2) speakerCongregation → queueInstant
  [
    'speakerCongregation instant',
    nl([
      '                  onChangeText={(v) =>',
      "                    update('speakerCongregation', v || null)",
      '                  }',
    ]),
    nl([
      '                  onChangeText={(v) => {',
      "                    update('speakerCongregation', v || null);",
      "                    queueInstant({ speakerCongregation: v || null });",
      '                  }}',
    ]),
  ],
  // 3) переключатель типа: instant с очисткой противоположных полей
  [
    'speaker type instant',
    nl([
      "  const handleSpeakerTypeChange = (type: 'local' | 'invited') => {",
      '    setSpeakerType(type);',
      "    if (type === 'local') {",
      '      // Clear invited fields',
      '      setForm((prev) => ({',
      '        ...prev,',
      '        speakerName: null,',
      '        speakerCongregation: null,',
      '      }));',
      '    } else {',
      '      // Clear local publisher',
      '      setForm((prev) => ({ ...prev, publisherId: null }));',
      '    }',
      '  };',
    ]),
    nl([
      "  const handleSpeakerTypeChange = (type: 'local' | 'invited') => {",
      '    setSpeakerType(type);',
      "    if (type === 'local') {",
      '      // Clear invited fields',
      '      setForm((prev) => ({',
      '        ...prev,',
      '        speakerName: null,',
      '        speakerCongregation: null,',
      '      }));',
      '      if (onInstantSave) {',
      '        void instant({ speakerName: null, speakerCongregation: null });',
      '      }',
      '    } else {',
      '      // Clear local publisher',
      '      setForm((prev) => ({ ...prev, publisherId: null }));',
      '      if (onInstantSave) {',
      '        void instant({ publisherId: null });',
      '      }',
      '    }',
      '  };',
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
console.log('DONE: invited speaker saves instantly');
