#!/usr/bin/env node
/**
 * patch-assignment-sheet.cjs — КОММИТ B: редактирование назначения
 * открывается боттом-шитом поверх расписания, а не уходом на /schedule/[id].
 * Неделя, скролл и раскрытый блок остаются на месте; пикеры сохраняют
 * оптимистично (строка заполняется мгновенно). Экран [id] остаётся для
 * прямых ссылок. Idempotent; LF/CRLF tolerant. Запускать из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

const file = 'app/(app)/schedule/index.tsx';
let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.log(`FAIL: cannot read ${file}: ${e.message}`);
  process.exit(1);
}
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let txt = raw.split('\r\n').join('\n');

if (txt.includes('AssignmentSheet')) {
  console.log(`SKIP: ${file} already patched (AssignmentSheet present)`);
  process.exit(0);
}

const edits = [
  // 1) импорт компонента шита
  [
    'import AssignmentSheet',
    "import { HospitalityZone } from '../../../components/HospitalityZone';",
    nl([
      "import { HospitalityZone } from '../../../components/HospitalityZone';",
      "import { AssignmentSheet } from '../../../components/AssignmentSheet';",
    ]),
  ],
  // 2) состояние выбранного назначения + права на редактирование
  [
    'sheet state',
    nl([
      '  const params = useLocalSearchParams<{ week?: string }>();',
      '  const weekStart = weekFromParam(params.week);',
    ]),
    nl([
      '  const params = useLocalSearchParams<{ week?: string }>();',
      '  const [editing, setEditing] = useState<Assignment | null>(null);',
      '  const weekStart = weekFromParam(params.week);',
    ]),
  ],
  // 3) Row: новый проп onEdit в типе
  [
    'row prop type',
    nl([
      '  displayNumber,',
      '  groupNameById,',
      '}: {',
      '  assignment: Assignment;',
      '  publisher: Publisher | null;',
      '  assistant: Publisher | null;',
      '  accentColor?: string;',
      '  displayNumber?: number | null;',
      '  groupNameById: Map<string, string>;',
      '}) {',
    ]),
    nl([
      '  displayNumber,',
      '  groupNameById,',
      '  onEdit,',
      '}: {',
      '  assignment: Assignment;',
      '  publisher: Publisher | null;',
      '  assistant: Publisher | null;',
      '  accentColor?: string;',
      '  displayNumber?: number | null;',
      '  groupNameById: Map<string, string>;',
      '  onEdit: (a: Assignment) => void;',
      '}) {',
    ]),
  ],
  // 4) song-ветка: открыть шит вместо навигации
  [
    'row song onPress',
    nl([
      '        ]}',
      '        onPress={() => router.push(`/schedule/${assignment.id}` as any)}',
      '      >',
      '        <View style={[styles.orderBadge, styles.orderBadgeInfo]}>',
    ]),
    nl([
      '        ]}',
      '        onPress={() => onEdit(assignment)}',
      '      >',
      '        <View style={[styles.orderBadge, styles.orderBadgeInfo]}>',
    ]),
  ],
  // 5) основная ветка: открыть шит вместо навигации
  [
    'row main onPress',
    nl([
      '      onPress={() => router.push(`/schedule/${assignment.id}` as any)}',
      '    >',
      '      <View',
      '        style={[',
      '          styles.orderBadge,',
    ]),
    nl([
      '      onPress={() => onEdit(assignment)}',
      '    >',
      '      <View',
      '        style={[',
      '          styles.orderBadge,',
    ]),
  ],
  // 6) прокидка onEdit в два прямых вызова (в ScheduleIndexScreen).
  //    Якорь — пара "assignment={a}" + следующая строка "publisher={"
  //    с тем же отступом (уникальна).
  [
    'pass onEdit #1 (26sp)',
    '                          assignment={a}\n                          publisher={',
    '                          assignment={a}\n                          onEdit={setEditing}\n                          publisher={',
  ],
  [
    'pass onEdit #2 (24sp)',
    '                        assignment={a}\n                        publisher={',
    '                        assignment={a}\n                        onEdit={setEditing}\n                        publisher={',
  ],
  // 6b) третий вызов Row живёт в компоненте MidweekSections — там нет
  //     setEditing. Прокидываем onEdit сквозь него как проп.
  [
    'MidweekSections prop type',
    nl([
      '  publishersById,',
      '  groupNameById,',
      '}: {',
      '  items: Assignment[];',
      '  numbers: Map<string, number | null>;',
      '  publishersById: Map<string, Publisher>;',
      '  groupNameById: Map<string, string>;',
      '}) {',
    ]),
    nl([
      '  publishersById,',
      '  groupNameById,',
      '  onEdit,',
      '}: {',
      '  items: Assignment[];',
      '  numbers: Map<string, number | null>;',
      '  publishersById: Map<string, Publisher>;',
      '  groupNameById: Map<string, string>;',
      '  onEdit: (a: Assignment) => void;',
      '}) {',
    ]),
  ],
  [
    'MidweekSections row onEdit (18sp)',
    '                  assignment={a}\n                  publisher={',
    '                  assignment={a}\n                  onEdit={onEdit}\n                  publisher={',
  ],
  [
    'MidweekSections call passes onEdit',
    nl([
      '                    <MidweekSections',
      '                      items={items}',
    ]),
    nl([
      '                    <MidweekSections',
      '                      onEdit={setEditing}',
      '                      items={items}',
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

// 7) монтирование шита перед закрывающим тегом корневого View.
//    Корневой View расписания закрывается // </View> прямо перед
//    закрытием компонента. Берём последний </View> файла-компонента:
//    надёжнее — якорим на WeekNavigator-контейнер закрытие основного
//    return. Вставляем шит сразу после закрытия ScrollView/контента,
//    перед финальным </View>. Используем уникальный маркер: конец
//    основного return — строка "  );\n}" функции ScheduleIndexScreen.
{
  const marker = '      <WeekNavigator weekStart={weekStart} onChange={setWeekStart} />';
  // Найдём блок canEdit для прокидки в шит: вычислим из текущей недели.
  // Право редактирования зависит от типа встречи назначения — считаем в
  // момент открытия по eventType.
  const canEditExpr = nl([
    '  const canEditEditing =',
    '    editing == null',
    '      ? false',
    "      : editing.eventType === 'weekend'",
    '        ? canEditWeekendSchedule',
    "        : editing.eventType === 'midweek'",
    '          ? canEditMidweekSchedule',
    '          : perms.isAdmin;',
    '',
  ]);
  // Вставляем расчёт права прямо перед return (после маркера hasMidweek).
  const beforeReturn = '  const isEmpty = assignments.length === 0;';
  if (!txt.includes(beforeReturn)) {
    console.log('FAIL: anchor "isEmpty" for canEdit calc not found');
    process.exit(1);
  }
  txt = txt.split(beforeReturn).join(beforeReturn + '\n' + canEditExpr);
  console.log('OK: canEdit for sheet computed');

  // Монтируем шит сразу после WeekNavigator (он точно внутри корневого View).
  if (!txt.includes(marker)) {
    console.log('FAIL: WeekNavigator marker not found for sheet mount');
    process.exit(1);
  }
  const mount = nl([
    marker,
    '      <AssignmentSheet',
    '        assignment={editing}',
    '        weekStartISO={weekStartISO}',
    '        canEdit={canEditEditing}',
    '        onClose={() => setEditing(null)}',
    '      />',
  ]);
  txt = txt.split(marker).join(mount);
  console.log('OK: AssignmentSheet mounted');
}

fs.writeFileSync(file, txt.split('\n').join(eol));
console.log(`OK: ${file} written`);
console.log('DONE: bottom-sheet editing wired');
