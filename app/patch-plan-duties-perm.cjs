#!/usr/bin/env node
/**
 * patch-plan-duties-perm.cjs — фикс прав: обязанности в режиме «Планирование»
 * показывались/назначались по праву на ПРОГРАММУ встречи (canEdit =
 * canEditMidweekSchedule/canEditWeekendSchedule), а не по отдельному праву
 * canEditDuties. У не-админа без canEditDuties это рассогласование. Теперь
 * PlanningMode принимает canEditDuties; при false zoneDuties пуст → группа
 * «Обязанности» не показывается, счётчик их не учитывает, picker недоступен.
 * Применять ПОВЕРХ ca51c88. Двухфайловый: PlanningMode + index.
 * Idempotent; LF/CRLF tolerant. Запускать из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

function patchFile(file, guard, edits) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.log(`FAIL: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let txt = raw.split('\r\n').join('\n');
  if (txt.includes(guard)) {
    console.log(`SKIP: ${file} already patched (${guard})`);
    return;
  }
  for (const [label, anchor, replacement] of edits) {
    const parts = txt.split(anchor);
    if (parts.length !== 2) {
      console.log(`FAIL: anchor for "${label}" in ${file} found ${parts.length - 1} time(s), expected 1`);
      process.exit(1);
    }
    txt = parts[0] + replacement + parts[1];
    console.log(`OK: ${label}`);
  }
  fs.writeFileSync(file, txt.split('\n').join(eol));
  console.log(`OK: ${file} written`);
}

// ===== 1) PlanningMode.tsx =====
patchFile('components/PlanningMode.tsx', 'canEditDuties', [
  // 1a) проп в interface Props (после canEdit: boolean;)
  [
    'pm: prop in interface',
    nl([
      '  canEdit: boolean;',
      '  // openPublishDialog: opens the shared publish dialog for this zone.',
    ]),
    nl([
      '  canEdit: boolean;',
      '  /** Separate right for duties — distinct from the meeting schedule. */',
      '  canEditDuties: boolean;',
      '  // openPublishDialog: opens the shared publish dialog for this zone.',
    ]),
  ],
  // 1b) деструктуризация
  [
    'pm: destructure',
    nl([
      '  canEdit,',
      '  onPublish,',
      '  onClose,',
      '}: Props) {',
    ]),
    nl([
      '  canEdit,',
      '  canEditDuties,',
      '  onPublish,',
      '  onClose,',
      '}: Props) {',
    ]),
  ],
  // 1c) гейтить zoneDuties через canEditDuties
  [
    'pm: gate zoneDuties',
    nl([
      '  const zoneDuties = useMemo(',
      '    () =>',
      '      (dutiesQuery.data ?? []).filter(',
      '        (d) => d.eventType === zone?.eventType,',
      '      ),',
      '    [dutiesQuery.data, zone],',
      '  );',
    ]),
    nl([
      '  const zoneDuties = useMemo(',
      '    () =>',
      '      canEditDuties',
      '        ? (dutiesQuery.data ?? []).filter(',
      '            (d) => d.eventType === zone?.eventType,',
      '          )',
      '        : [],',
      '    [dutiesQuery.data, zone, canEditDuties],',
      '  );',
    ]),
  ],
]);

// ===== 2) index: передать canEditDuties в PlanningMode =====
patchFile('app/(app)/schedule/index.tsx', 'canEditDuties={canEditDuties}', [
  [
    'index: pass canEditDuties',
    nl([
      '        publishing={publishingType === planningZone?.eventType}',
      '        canEdit={',
    ]),
    nl([
      '        publishing={publishingType === planningZone?.eventType}',
      '        canEditDuties={canEditDuties}',
      '        canEdit={',
    ]),
  ],
]);

console.log('DONE: duties in planning mode gated by canEditDuties');
