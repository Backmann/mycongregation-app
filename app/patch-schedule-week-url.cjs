#!/usr/bin/env node
/**
 * patch-schedule-week-url.cjs — КОММИТ A: выбранная неделя расписания
 * живёт в URL (?week=YYYY-MM-DD), а не в локальном useState. Это:
 *  - переживает ремаунт экрана (возврат с формы больше не сбрасывает
 *    неделю на текущую);
 *  - даёт ссылку, которой можно поделиться / открыть закладкой;
 *  - не меняет поведение навигатора недели для пользователя.
 * Idempotent; LF/CRLF tolerant. Запускать из ~/congmap/app.
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

if (txt.includes('weekFromParam')) {
  console.log(`SKIP: ${file} already patched (weekFromParam present)`);
  process.exit(0);
}

const edits = [
  // 1) импорт useLocalSearchParams рядом с router
  [
    'import useLocalSearchParams',
    "import { router } from 'expo-router';",
    "import { router, useLocalSearchParams } from 'expo-router';",
  ],
  // 2) helper парсинга ISO-понедельника — перед компонентом
  [
    'helper weekFromParam',
    'export default function ScheduleIndexScreen() {',
    nl([
      '/** Parse ?week=YYYY-MM-DD into a Monday; fall back to current week. */',
      'function weekFromParam(raw: string | string[] | undefined): Date {',
      '  const v = Array.isArray(raw) ? raw[0] : raw;',
      '  if (v && /^\\d{4}-\\d{2}-\\d{2}$/.test(v)) {',
      '    const d = new Date(`${v}T00:00:00`);',
      '    if (!Number.isNaN(d.getTime())) return startOfWeekMonday(d);',
      '  }',
      '  return startOfWeekMonday(new Date());',
      '}',
      '',
      'export default function ScheduleIndexScreen() {',
    ]),
  ],
  // 3) неделя выводится из URL, смена недели пишет в URL
  [
    'week state from URL',
    nl([
      '  const queryClient = useQueryClient();',
      '  const [weekStart, setWeekStart] = useState(() =>',
      '    startOfWeekMonday(new Date()),',
      '  );',
      '',
      '  const weekStartISO = formatDateISO(weekStart);',
    ]),
    nl([
      '  const queryClient = useQueryClient();',
      '  const params = useLocalSearchParams<{ week?: string }>();',
      '  const weekStart = weekFromParam(params.week);',
      '  const weekStartISO = formatDateISO(weekStart);',
      '  const setWeekStart = (d: Date) => {',
      '    router.setParams({ week: formatDateISO(startOfWeekMonday(d)) });',
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
console.log('DONE: schedule week is now URL-driven');
