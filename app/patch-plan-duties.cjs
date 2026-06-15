#!/usr/bin/env node
/**
 * patch-plan-duties.cjs — №4 (часть 1): обязанности в режиме «Планирование».
 * PlanningMode дополнительно подписывается на ['duties', weekStartISO],
 * фильтрует по eventType зоны, показывает пустые обязанности в отдельной
 * группе «Обязанности» и включает их в счётчик зоны. Тап по обязанности
 * открывает мини-оверлей с PublisherSelector (capability = duty_<type>);
 * выбор → dutiesApi.assign + инвалидация → строка уходит, прогресс растёт.
 * Применять ПОВЕРХ 6adec30. Idempotent; LF/CRLF tolerant.
 * Запускать из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

const file = 'components/PlanningMode.tsx';
let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.log(`FAIL: cannot read ${file}: ${e.message}`);
  process.exit(1);
}
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let txt = raw.split('\r\n').join('\n');

if (txt.includes('dutyPicker')) {
  console.log(`SKIP: ${file} already patched (dutyPicker present)`);
  process.exit(0);
}

function apply(label, anchor, replacement) {
  const parts = txt.split(anchor);
  if (parts.length !== 2) {
    console.log(`FAIL: anchor for "${label}" found ${parts.length - 1} time(s), expected 1`);
    process.exit(1);
  }
  txt = parts[0] + replacement + parts[1];
  console.log(`OK: ${label}`);
}

// 1) импорты: useMutation/useQueryClient + duties API/типы + helpers + selector
apply(
  'imports: react-query hooks',
  "import { useQuery } from '@tanstack/react-query';",
  "import {\n  useQuery,\n  useMutation,\n  useQueryClient,\n} from '@tanstack/react-query';",
);
apply(
  'imports: duties api + helpers',
  "import { Assignment, assignmentsApi, Publisher } from '../lib/api';",
  nl([
    "import {",
    '  Assignment,',
    '  assignmentsApi,',
    '  Duty,',
    '  dutiesApi,',
    '  Publisher,',
    "} from '../lib/api';",
    "import { PublisherSelector } from './PublisherSelector';",
    "import { dutyLabel } from './DutiesSection';",
  ]),
);

// 1b) локальная capabilityFor (в DutiesSection она не экспортирована)
apply(
  'helper: local capabilityFor',
  'function isAssigned(a: Assignment): boolean {',
  nl([
    'function capabilityFor(duty: Duty): string | undefined {',
    "  return duty.dutyType === 'custom' ? undefined : `duty_${duty.dutyType}`;",
    '}',
    '',
    'function isAssigned(a: Assignment): boolean {',
  ]),
);

// 2) состояние выбора обязанности (после editingInPlan)
apply(
  'state: dutyPicker',
  nl([
    '  const [editingInPlan, setEditingInPlan] = useState<Assignment | null>(',
    '    null,',
    '  );',
  ]),
  nl([
    '  const [editingInPlan, setEditingInPlan] = useState<Assignment | null>(',
    '    null,',
    '  );',
    '  const [dutyPicker, setDutyPicker] = useState<Duty | null>(null);',
    '  const queryClient = useQueryClient();',
  ]),
);

// 3) query duties + фильтр по eventType
apply(
  'query: duties',
  nl([
    '  const zoneItems = useMemo(() => {',
  ]),
  nl([
    '  const dutiesQuery = useQuery({',
    "    queryKey: ['duties', zone?.weekStartISO ?? ''],",
    '    queryFn: () =>',
    '      dutiesApi.list({',
    '        weekStart: zone!.weekStartISO,',
    '        weekEnd: zone!.nextWeekISO,',
    '      }),',
    '    enabled: !!zone,',
    '  });',
    '  const zoneDuties = useMemo(',
    '    () =>',
    '      (dutiesQuery.data ?? []).filter(',
    '        (d) => d.eventType === zone?.eventType,',
    '      ),',
    '    [dutiesQuery.data, zone],',
    '  );',
    '  const dutyAssign = useMutation({',
    '    mutationFn: (vars: { id: string; publisherId: string | null }) =>',
    '      dutiesApi.assign(vars.id, { publisherId: vars.publisherId }),',
    '    onSuccess: () => {',
    '      void queryClient.invalidateQueries({',
    "        queryKey: ['duties', zone?.weekStartISO ?? ''],",
    '      });',
    '    },',
    '  });',
    '',
    '  const zoneItems = useMemo(() => {',
  ]),
);

// 4) счётчик: включить обязанности в total/assigned
apply(
  'count: include duties',
  nl([
    '    const assignedCount = real.filter(isAssigned).length;',
    '    return { todo, drafts, assignedCount, totalCount: real.length };',
    '  }, [zoneItems]);',
  ]),
  nl([
    '    const assignedCount = real.filter(isAssigned).length;',
    '    return { todo, drafts, assignedCount, totalCount: real.length };',
    '  }, [zoneItems]);',
    '',
    '  const dutiesTodo = useMemo(',
    '    () => zoneDuties.filter((d) => !d.publisherId),',
    '    [zoneDuties],',
    '  );',
    '  const dutiesAssignedCount = zoneDuties.length - dutiesTodo.length;',
  ]),
);

// 5) объединённый прогресс (части + обязанности)
apply(
  'progress: combined',
  '  const allDone = todo.length === 0;\n  const pct = totalCount === 0 ? 0 : Math.round((assignedCount / totalCount) * 100);',
  nl([
    '  const grandAssigned = assignedCount + dutiesAssignedCount;',
    '  const grandTotal = totalCount + zoneDuties.length;',
    '  const allDone = todo.length === 0 && dutiesTodo.length === 0;',
    '  const pct =',
    '    grandTotal === 0 ? 0 : Math.round((grandAssigned / grandTotal) * 100);',
  ]),
);

// 6) прогресс-текст использует объединённые числа
apply(
  'progress text: grand totals',
  nl([
    "              {t('schedule.planning.progress', {",
    '                done: assignedCount,',
    '                total: totalCount,',
    '              })}',
  ]),
  nl([
    "              {t('schedule.planning.progress', {",
    '                done: grandAssigned,',
    '                total: grandTotal,',
    '              })}',
  ]),
);

// 7) duty helpers для рендера (заголовок/исполнитель) — рядом с assigneeOf
apply(
  'helpers: duty render',
  nl([
    '  const Row = ({ a, draft }: { a: Assignment; draft: boolean }) => (',
  ]),
  nl([
    '  const dutyAssigneeOf = (d: Duty): string | null =>',
    '    d.publisherId',
    '      ? publishersById.get(d.publisherId)?.displayName ?? null',
    '      : null;',
    '',
    '  const DutyRow = ({ d }: { d: Duty }) => (',
    '    <Pressable',
    '      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}',
    '      onPress={() => setDutyPicker(d)}',
    '    >',
    '      <View style={[styles.dot, styles.dotTodo]} />',
    '      <View style={{ flex: 1 }}>',
    '        <Text style={styles.rowTitle} numberOfLines={2}>',
    '          {dutyLabel(d, t)}',
    '        </Text>',
    '        {d.publisherId ? (',
    '          <Text style={styles.rowAssignee} numberOfLines={1}>',
    '            {dutyAssigneeOf(d)}',
    '          </Text>',
    '        ) : null}',
    '      </View>',
    '      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />',
    '    </Pressable>',
    '  );',
    '',
    '  const Row = ({ a, draft }: { a: Assignment; draft: boolean }) => (',
  ]),
);

// 8) duty-группа в рендере — после блока drafts (перед закрытием ScrollView)
apply(
  'render: duties group',
  nl([
    '          {drafts.length > 0 ? (',
  ]),
  nl([
    '          {dutiesTodo.length > 0 ? (',
    '            <>',
    '              <Text style={[styles.groupHeader, { marginTop: 20 }]}>',
    "                {t('schedule.planning.dutiesHeader', {",
    '                  count: dutiesTodo.length,',
    '                })}',
    '              </Text>',
    '              <View style={styles.card}>',
    '                {dutiesTodo.map((d) => (',
    '                  <DutyRow key={d.id} d={d} />',
    '                ))}',
    '              </View>',
    '            </>',
    '          ) : null}',
    '',
    '          {drafts.length > 0 ? (',
  ]),
);

// 9) мини-оверлей выбора возвещателя для обязанности — перед </Modal>
apply(
  'render: duty picker modal',
  nl([
    '      <AssignmentSheet',
  ]),
  nl([
    '      <Modal',
    '        visible={!!dutyPicker}',
    '        animationType="slide"',
    '        transparent',
    '        onRequestClose={() => setDutyPicker(null)}',
    '      >',
    '        <View style={styles.dutyBackdrop}>',
    '          <View style={styles.dutySheet}>',
    '            <View style={styles.dutySheetHeader}>',
    '              <Text style={styles.dutySheetTitle} numberOfLines={1}>',
    '                {dutyPicker ? dutyLabel(dutyPicker, t) : \'\'}',
    '              </Text>',
    '              <Pressable',
    '                onPress={() => setDutyPicker(null)}',
    '                hitSlop={8}',
    '              >',
    "                <Text style={styles.headerBtnText}>{t('common.close')}</Text>",
    '              </Pressable>',
    '            </View>',
    '            {dutyPicker ? (',
    '              <PublisherSelector',
    "                label={t('duties.assignee')}",
    '                value={dutyPicker.publisherId}',
    '                requiredCapability={capabilityFor(dutyPicker)}',
    '                onChange={(id) => {',
    '                  dutyAssign.mutate({ id: dutyPicker.id, publisherId: id });',
    '                  setDutyPicker(null);',
    '                }}',
    '              />',
    '            ) : null}',
    '          </View>',
    '        </View>',
    '      </Modal>',
    '      <AssignmentSheet',
  ]),
);

// 10) стили мини-оверлея
apply(
  'styles: duty sheet',
  "  publishBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },",
  nl([
    "  publishBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },",
    "  dutyBackdrop: {",
    "    flex: 1,",
    "    backgroundColor: 'rgba(15,23,42,0.45)',",
    "    justifyContent: 'flex-end',",
    '  },',
    '  dutySheet: {',
    "    backgroundColor: '#fff',",
    '    borderTopLeftRadius: 16,',
    '    borderTopRightRadius: 16,',
    '    padding: 16,',
    '    maxHeight: \'80%\',',
    '  },',
    '  dutySheetHeader: {',
    "    flexDirection: 'row',",
    "    alignItems: 'center',",
    "    justifyContent: 'space-between',",
    '    marginBottom: 12,',
    '  },',
    "  dutySheetTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', flex: 1 },",
  ]),
);

fs.writeFileSync(file, txt.split('\n').join(eol));
console.log(`OK: ${file} written`);

// ===== локали: duties.assignee + schedule.planning.dutiesHeader =====
const ADDITIONS = {
  ru: {
    duties: { assignee: 'Кто назначен' },
    schedule: { planning: { dutiesHeader: 'Обязанности ({{count}})' } },
  },
  en: {
    duties: { assignee: 'Assignee' },
    schedule: { planning: { dutiesHeader: 'Duties ({{count}})' } },
  },
  de: {
    duties: { assignee: 'Zugeteilt an' },
    schedule: { planning: { dutiesHeader: 'Aufgaben ({{count}})' } },
  },
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!(key in target) || typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      deepMerge(target[key], sv);
    } else if (!(key in target)) {
      target[key] = sv;
    }
  }
}

for (const locale of Object.keys(ADDITIONS)) {
  const lf = `locales/${locale}.json`;
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(lf, 'utf8'));
  } catch (e) {
    console.log(`FAIL: cannot read/parse ${lf}: ${e.message}`);
    process.exit(1);
  }
  const before = JSON.stringify(obj);
  deepMerge(obj, ADDITIONS[locale]);
  if (JSON.stringify(obj) === before) {
    console.log(`SKIP: ${lf} — keys present`);
  } else {
    fs.writeFileSync(lf, JSON.stringify(obj, null, 2) + '\n');
    console.log(`OK: ${lf} — duty keys added`);
  }
}

console.log('DONE: duties in planning mode');
