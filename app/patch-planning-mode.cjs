#!/usr/bin/env node
/**
 * patch-planning-mode.cjs — КОММИТ D: режим «Планирование».
 * Кнопка «Планировать» внутри каждого блока встречи (перед MeetingHeader)
 * открывает фокус-оверлей PlanningMode по ЭТОЙ встрече (зоне): прогресс,
 * группы «нужно назначить» / «черновики», тап → тот же боттом-шит, мягкая
 * кнопка «Опубликовать эту встречу» внизу. По одной встрече за раз —
 * под разные роли братьев. Применять ПОВЕРХ 680ab5c. Idempotent;
 * LF/CRLF tolerant. Запускать из ~/congmap/app.
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

const file = 'app/(app)/schedule/index.tsx';
const { txt: orig, eol } = readNorm(file);
if (orig.includes('PlanningMode')) {
  console.log(`SKIP: ${file} already patched (PlanningMode present)`);
  process.exit(0);
}
let txt = orig;

function apply(label, anchor, replacement) {
  const parts = txt.split(anchor);
  if (parts.length !== 2) {
    console.log(`FAIL: anchor for "${label}" found ${parts.length - 1} time(s), expected 1`);
    process.exit(1);
  }
  txt = parts[0] + replacement + parts[1];
  console.log(`OK: ${label}`);
}

// 1) импорт оверлея
apply(
  'import PlanningMode',
  "import { AssignmentSheet } from '../../../components/AssignmentSheet';",
  nl([
    "import { AssignmentSheet } from '../../../components/AssignmentSheet';",
    "import { PlanningMode } from '../../../components/PlanningMode';",
  ]),
);

// 2) состояние выбранной зоны планирования
apply(
  'planning state',
  '  const [editing, setEditing] = useState<Assignment | null>(null);',
  nl([
    '  const [editing, setEditing] = useState<Assignment | null>(null);',
    '  const [planningZone, setPlanningZone] = useState<{',
    "    eventType: 'midweek' | 'weekend';",
    '    title: string;',
    '    meta: string | null;',
    '    items: Assignment[];',
    '    weekStartDate: string;',
    '  } | null>(null);',
  ]),
);

// 3) кнопка «Планировать» в midweek — перед его MeetingHeader
apply(
  'midweek plan button',
  nl([
    '                    <MeetingHeader',
    '                      weekStart={weekStart}',
    '                      version={meetingVersion}',
    '                      eventType="midweek"',
    '                    />',
    '                    <MidweekSections',
  ]),
  nl([
    '                    <MeetingHeader',
    '                      weekStart={weekStart}',
    '                      version={meetingVersion}',
    '                      eventType="midweek"',
    '                    />',
    '                    {perms.canEditMidweekSchedule ? (',
    '                      <Pressable',
    '                        style={styles.planBtn}',
    '                        onPress={() =>',
    '                          setPlanningZone({',
    "                            eventType: 'midweek',",
    "                            title: getEventTypeLabel('midweek'),",
    "                            meta: meetingDateLabel('midweek'),",
    '                            items,',
    '                            weekStartDate: items[0].weekStartDate,',
    '                          })',
    '                        }',
    '                      >',
    '                        <Ionicons',
    '                          name="create-outline"',
    '                          size={16}',
    '                          color="#0ea5e9"',
    '                        />',
    '                        <Text style={styles.planBtnText}>',
    "                          {t('schedule.planning.enter')}",
    '                        </Text>',
    '                      </Pressable>',
    '                    ) : null}',
    '                    <MidweekSections',
  ]),
);

// 4) кнопка «Планировать» в weekend — перед его MeetingHeader
apply(
  'weekend plan button',
  nl([
    '                    <MeetingHeader',
    '                      weekStart={weekStart}',
    '                      version={meetingVersion}',
    '                      eventType="weekend"',
    '                    />',
  ]),
  nl([
    '                    <MeetingHeader',
    '                      weekStart={weekStart}',
    '                      version={meetingVersion}',
    '                      eventType="weekend"',
    '                    />',
    '                    {perms.canEditWeekendSchedule ? (',
    '                      <Pressable',
    '                        style={styles.planBtn}',
    '                        onPress={() =>',
    '                          setPlanningZone({',
    "                            eventType: 'weekend',",
    "                            title: getEventTypeLabel('weekend'),",
    "                            meta: meetingDateLabel('weekend'),",
    '                            items: programItems,',
    '                            weekStartDate: items[0].weekStartDate,',
    '                          })',
    '                        }',
    '                      >',
    '                        <Ionicons',
    '                          name="create-outline"',
    '                          size={16}',
    '                          color="#0ea5e9"',
    '                        />',
    '                        <Text style={styles.planBtnText}>',
    "                          {t('schedule.planning.enter')}",
    '                        </Text>',
    '                      </Pressable>',
    '                    ) : null}',
  ]),
);

// 5) монтирование оверлея рядом с AssignmentSheet
apply(
  'mount PlanningMode',
  nl([
    '      <AssignmentSheet',
    '        assignment={editing}',
    '        weekStartISO={weekStartISO}',
    '        canEdit={canEditEditing}',
    '        onClose={() => setEditing(null)}',
    '      />',
  ]),
  nl([
    '      <AssignmentSheet',
    '        assignment={editing}',
    '        weekStartISO={weekStartISO}',
    '        canEdit={canEditEditing}',
    '        onClose={() => setEditing(null)}',
    '      />',
    '      <PlanningMode',
    '        zone={planningZone}',
    '        publishersById={publishersById}',
    '        canPublish={',
    "          planningZone?.eventType === 'midweek'",
    '            ? perms.canEditMidweekSchedule',
    "            : planningZone?.eventType === 'weekend'",
    '              ? perms.canEditWeekendSchedule',
    '              : false',
    '        }',
    "        publishing={publishingType === planningZone?.eventType}",
    '        onEdit={setEditing}',
    '        onPublish={(et, ws) => void publishMeetingNow(et, ws)}',
    '        onClose={() => setPlanningZone(null)}',
    '      />',
  ]),
);

// 6) стиль кнопки «Планировать»
apply(
  'planBtn style',
  "  container: { flex: 1, backgroundColor: '#f1f5f9' },",
  nl([
    "  container: { flex: 1, backgroundColor: '#f1f5f9' },",
    '  planBtn: {',
    "    flexDirection: 'row',",
    "    alignItems: 'center',",
    "    alignSelf: 'flex-start',",
    '    gap: 6,',
    '    marginVertical: 8,',
    '    paddingVertical: 8,',
    '    paddingHorizontal: 14,',
    '    borderRadius: 10,',
    "    backgroundColor: '#e0f2fe',",
    '  },',
    "  planBtnText: { color: '#0369a1', fontSize: 14, fontWeight: '700' },",
  ]),
);

fs.writeFileSync(file, txt.split('\n').join(eol));
console.log(`OK: ${file} written`);
console.log('DONE: planning mode wired');
