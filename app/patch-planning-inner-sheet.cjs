#!/usr/bin/env node
/**
 * patch-planning-inner-sheet.cjs — клики в режиме «Планирование» не
 * работали: PlanningMode (Modal) звал внешний onEdit→setEditing, но
 * AssignmentSheet (тоже Modal) смонтирован СОСЕДОМ под режимом и
 * перекрывался им. Решение: PlanningMode сам держит editingInPlan и
 * рендерит AssignmentSheet ВНУТРИ своего Modal (вложенность в поддереве
 * допустима). Внешний onEdit больше не нужен; добавляем canEdit.
 * Применять ПОВЕРХ 3a891b6. Idempotent; LF/CRLF tolerant.
 * Запускать из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

function readNorm(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.log(`FAIL: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return { txt: raw.split('\r\n').join('\n'), eol };
}

function applyOne(file, txt, label, anchor, replacement) {
  const parts = txt.split(anchor);
  if (parts.length !== 2) {
    console.log(`FAIL: anchor for "${label}" found ${parts.length - 1} time(s), expected 1`);
    process.exit(1);
  }
  console.log(`OK: ${label}`);
  return parts[0] + replacement + parts[1];
}

// ===== 1) PlanningMode.tsx =====
{
  const file = 'components/PlanningMode.tsx';
  const { txt: orig, eol } = readNorm(file);
  if (orig.includes('editingInPlan')) {
    console.log(`SKIP: ${file} already patched`);
  } else {
    let txt = orig;
    // 1a) импорты: useState + AssignmentSheet
    txt = applyOne(
      file, txt, 'imports useState',
      "import { useMemo } from 'react';",
      "import { useMemo, useState } from 'react';",
    );
    txt = applyOne(
      file, txt, 'import AssignmentSheet',
      "import { Assignment, Publisher } from '../lib/api';",
      nl([
        "import { Assignment, Publisher } from '../lib/api';",
        "import { AssignmentSheet } from './AssignmentSheet';",
      ]),
    );
    // 1b) Props: убрать onEdit, добавить canEdit
    txt = applyOne(
      file, txt, 'props onEdit→canEdit',
      nl([
        '  publishing: boolean;',
        '  onEdit: (a: Assignment) => void;',
        '  onPublish: (eventType: ',
      ]),
      nl([
        '  publishing: boolean;',
        '  canEdit: boolean;',
        '  onPublish: (eventType: ',
      ]),
    );
    // 1c) деструктуризация
    txt = applyOne(
      file, txt, 'destructure onEdit→canEdit',
      nl([
        '  publishing,',
        '  onEdit,',
        '  onPublish,',
      ]),
      nl([
        '  publishing,',
        '  canEdit,',
        '  onPublish,',
      ]),
    );
    // 1d) локальное состояние редактируемой части (после const { t } = ...)
    txt = applyOne(
      file, txt, 'editingInPlan state',
      "  const { t } = useTranslation();\n  const open = !!zone;",
      nl([
        "  const { t } = useTranslation();",
        '  const open = !!zone;',
        '  const [editingInPlan, setEditingInPlan] = useState<Assignment | null>(',
        '    null,',
        '  );',
      ]),
    );
    // 1e) клик строки → локальный сеттер
    txt = applyOne(
      file, txt, 'row onPress local',
      '      onPress={() => onEdit(a)}',
      '      onPress={() => setEditingInPlan(a)}',
    );
    // 1f) монтируем AssignmentSheet ВНУТРИ Modal — перед </Modal>
    txt = applyOne(
      file, txt, 'inner AssignmentSheet',
      '      </View>\n    </Modal>',
      nl([
        '      </View>',
        '      <AssignmentSheet',
        '        assignment={editingInPlan}',
        '        weekStartISO={zone?.weekStartDate ?? \'\'}',
        '        canEdit={canEdit}',
        '        onClose={() => setEditingInPlan(null)}',
        '      />',
        '    </Modal>',
      ]),
    );
    fs.writeFileSync(file, txt.split('\n').join(eol));
    console.log(`OK: ${file} written`);
  }
}

// ===== 2) index.tsx: onEdit→canEdit в монтировании PlanningMode =====
{
  const file = 'app/(app)/schedule/index.tsx';
  const { txt: orig, eol } = readNorm(file);
  if (orig.includes('canEdit={\n          planningZone?.eventType')) {
    console.log(`SKIP: ${file} already patched`);
  } else {
    let txt = orig;
    txt = applyOne(
      file, txt, 'index PlanningMode onEdit→canEdit',
      nl([
        "        publishing={publishingType === planningZone?.eventType}",
        '        onEdit={setEditing}',
      ]),
      nl([
        "        publishing={publishingType === planningZone?.eventType}",
        '        canEdit={',
        "          planningZone?.eventType === 'midweek'",
        '            ? perms.canEditMidweekSchedule',
        "            : planningZone?.eventType === 'weekend'",
        '              ? perms.canEditWeekendSchedule',
        '              : false',
        '        }',
      ]),
    );
    fs.writeFileSync(file, txt.split('\n').join(eol));
    console.log(`OK: ${file} written`);
  }
}

console.log('DONE: planning mode opens its own sheet');
