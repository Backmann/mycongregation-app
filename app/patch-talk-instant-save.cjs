#!/usr/bin/env node
/**
 * patch-talk-instant-save.cjs — КОММИТ C: выбор публичного доклада
 * сохраняется сразу. handleTalkSelect обновлял только локальный form,
 * но (в отличие от выбора возвещателя) не звал onInstantSave — поэтому
 * в боттом-шите выбор доклада никуда не уходил. Теперь шлём publicTalkId
 * и сгенерированный partTitle мгновенно, как остальные пикеры.
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

if (txt.includes('// instant-save the talk pick')) {
  console.log(`SKIP: ${file} already patched`);
  process.exit(0);
}

const anchor = nl([
  '  const handleTalkSelect = (talk: PublicTalk | null) => {',
  '    setForm((prev) => ({',
  '      ...prev,',
  '      publicTalkId: talk?.id ?? null,',
  '      // Auto-update partTitle when picking a talk; keep manual text when clearing',
  '      partTitle: talk ? `№${talk.number}. ${talk.title}` : prev.partTitle,',
  '    }));',
  '  };',
]);

const replacement = nl([
  '  const handleTalkSelect = (talk: PublicTalk | null) => {',
  '    // Keep manual title when clearing; derive it from the talk when picking.',
  '    const nextTitle = talk',
  '      ? `№${talk.number}. ${talk.title}`',
  '      : form.partTitle ?? null;',
  '    setForm((prev) => ({',
  '      ...prev,',
  '      publicTalkId: talk?.id ?? null,',
  '      partTitle: talk ? nextTitle ?? undefined : prev.partTitle,',
  '    }));',
  '    // instant-save the talk pick (publicTalkId + derived title) like the',
  '    // publisher pickers do — otherwise the choice never leaves the form.',
  '    void instant({',
  '      publicTalkId: talk?.id ?? null,',
  '      ...(talk ? { partTitle: nextTitle ?? undefined } : {}),',
  '    });',
  '  };',
]);

const parts = txt.split(anchor);
if (parts.length !== 2) {
  console.log(`FAIL: anchor for handleTalkSelect found ${parts.length - 1} time(s), expected 1`);
  process.exit(1);
}
txt = parts[0] + replacement + parts[1];
console.log('OK: handleTalkSelect now instant-saves the pick');

fs.writeFileSync(file, txt.split('\n').join(eol));
console.log(`OK: ${file} written`);
console.log('DONE: public talk pick saves instantly');
