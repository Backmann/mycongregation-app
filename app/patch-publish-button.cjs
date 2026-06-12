#!/usr/bin/env node
/**
 * patch-publish-button.cjs
 * "Explicit outside": a Publish button on the collapsible meeting block.
 *  - lib/api.ts: assignmentsApi.publish({weekStartDate, eventType})
 *  - CollapsibleMeetingBlock: optional action button in the header
 *  - schedule/index.tsx: button shown to the section's editor while the
 *    meeting still has drafts; publishes, invalidates the week; the button
 *    disappears once no drafts remain.
 * Idempotent; LF/CRLF tolerant.
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
    console.log(`SKIP: ${file} already patched (${guard} present)`);
    return;
  }

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
}

// ---------- lib/api.ts ----------
patchFile('lib/api.ts', "'/assignments/publish'", [
  [
    'api: publish method',
    nl([
      '  async bulkCreate(inputs: CreateAssignmentInput[]): Promise<Assignment[]> {',
      "    const { data } = await api.post<Assignment[]>('/assignments/bulk', {",
      '      assignments: inputs.map(cleanPayload),',
      '    });',
      '    return data;',
      '  },',
    ]),
    nl([
      '  async bulkCreate(inputs: CreateAssignmentInput[]): Promise<Assignment[]> {',
      "    const { data } = await api.post<Assignment[]>('/assignments/bulk', {",
      '      assignments: inputs.map(cleanPayload),',
      '    });',
      '    return data;',
      '  },',
      '  /** Flip every draft of one meeting (week + section) to published. */',
      '  async publish(input: {',
      '    weekStartDate: string;',
      '    eventType: EventType;',
      '  }): Promise<{ published: number }> {',
      '    const { data } = await api.post<{ published: number }>(',
      "      '/assignments/publish',",
      '      input,',
      '    );',
      '    return data;',
      '  },',
    ]),
  ],
]);

// ---------- components/CollapsibleMeetingBlock.tsx ----------
patchFile('components/CollapsibleMeetingBlock.tsx', 'actionLabel', [
  [
    'block: destructure',
    nl(['  total,', '  initiallyOpen = true,']),
    nl(['  total,', '  actionLabel,', '  onAction,', '  actionBusy,', '  initiallyOpen = true,']),
  ],
  [
    'block: prop types',
    nl(['  total: number;', '  initiallyOpen?: boolean;']),
    nl([
      '  total: number;',
      '  /** Header action (e.g. Publish); rendered only when both are set. */',
      '  actionLabel?: string;',
      '  onAction?: () => void;',
      '  actionBusy?: boolean;',
      '  initiallyOpen?: boolean;',
    ]),
  ],
  [
    'block: action button',
    nl([
      '        <View',
      '          style={[styles.badge, complete ? styles.badgeDone : styles.badgeOpen]}',
      '        >',
    ]),
    nl([
      '        {actionLabel && onAction ? (',
      '          <Pressable',
      '            style={({ pressed }) => [',
      '              styles.actionBtn,',
      '              pressed && styles.actionBtnPressed,',
      '              actionBusy && styles.actionBtnDisabled,',
      '            ]}',
      '            onPress={onAction}',
      '            disabled={!!actionBusy}',
      '          >',
      '            <Text style={styles.actionBtnText}>',
      "              {actionBusy ? '…' : actionLabel}",
      '            </Text>',
      '          </Pressable>',
      '        ) : null}',
      '        <View',
      '          style={[styles.badge, complete ? styles.badgeDone : styles.badgeOpen]}',
      '        >',
    ]),
  ],
  [
    'block: action styles',
    "  headerPressed: { backgroundColor: '#f8fafc' },",
    nl([
      "  headerPressed: { backgroundColor: '#f8fafc' },",
      '  actionBtn: {',
      "    backgroundColor: '#0ea5e9',",
      '    borderRadius: 8,',
      '    paddingHorizontal: 12,',
      '    paddingVertical: 6,',
      '  },',
      '  actionBtnPressed: { opacity: 0.8 },',
      '  actionBtnDisabled: { opacity: 0.5 },',
      "  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },",
    ]),
  ],
]);

// ---------- app/(app)/schedule/index.tsx ----------
patchFile('app/(app)/schedule/index.tsx', 'publishMeetingNow', [
  [
    'index: usePermissions import',
    "import { CollapsibleMeetingBlock } from '../../../components/CollapsibleMeetingBlock';",
    nl([
      "import { CollapsibleMeetingBlock } from '../../../components/CollapsibleMeetingBlock';",
      "import { usePermissions } from '../../../lib/permissions';",
    ]),
  ],
  [
    'index: perms + publishing state',
    nl([
      'export default function ScheduleIndexScreen() {',
      '  const { t, i18n } = useTranslation();',
      '  const queryClient = useQueryClient();',
    ]),
    nl([
      'export default function ScheduleIndexScreen() {',
      '  const { t, i18n } = useTranslation();',
      '  const perms = usePermissions();',
      '  const [publishingType, setPublishingType] = useState<string | null>(null);',
      '  const queryClient = useQueryClient();',
    ]),
  ],
  [
    'index: draftCount + publishMeetingNow',
    nl([
      "      weekday: 'long',",
      "      day: 'numeric',",
      "      month: 'long',",
      '    });',
      '  };',
    ]),
    nl([
      "      weekday: 'long',",
      "      day: 'numeric',",
      "      month: 'long',",
      '    });',
      '  };',
      '  const draftCount = (list: Assignment[]) =>',
      "    list.filter((x) => String(x.status) === 'draft').length;",
      '  const publishMeetingNow = async (',
      "    eventType: 'midweek' | 'weekend',",
      '    weekStartDate: string,',
      '  ) => {',
      '    setPublishingType(eventType);',
      '    try {',
      '      await assignmentsApi.publish({ weekStartDate, eventType });',
      "      await queryClient.invalidateQueries({ queryKey: ['assignments'] });",
      '    } catch (e) {',
      '      const msg = e instanceof Error ? e.message : String(e);',
      "      if (typeof window !== 'undefined' && typeof window.alert === 'function') {",
      '        window.alert(msg);',
      '      }',
      '    } finally {',
      '      setPublishingType(null);',
      '    }',
      '  };',
    ]),
  ],
  [
    'index: midweek block action',
    nl([
      '                  <CollapsibleMeetingBlock',
      '                    key="midweek"',
      "                    title={getEventTypeLabel('midweek')}",
      "                    meta={meetingDateLabel('midweek')}",
      '                    assigned={assignedCount(items)}',
      '                    total={items.length}',
      '                  >',
    ]),
    nl([
      '                  <CollapsibleMeetingBlock',
      '                    key="midweek"',
      "                    title={getEventTypeLabel('midweek')}",
      "                    meta={meetingDateLabel('midweek')}",
      '                    assigned={assignedCount(items)}',
      '                    total={items.length}',
      '                    actionLabel={',
      '                      perms.canEditMidweekSchedule && draftCount(items) > 0',
      "                        ? t('schedule.publish.button')",
      '                        : undefined',
      '                    }',
      "                    actionBusy={publishingType === 'midweek'}",
      '                    onAction={() =>',
      "                      void publishMeetingNow('midweek', items[0].weekStartDate)",
      '                    }',
      '                  >',
    ]),
  ],
  [
    'index: weekend block action',
    nl([
      '                  <CollapsibleMeetingBlock',
      '                    key="weekend"',
      "                    title={getEventTypeLabel('weekend')}",
      "                    meta={meetingDateLabel('weekend')}",
      '                    assigned={assignedCount(items)}',
      '                    total={items.length}',
      '                  >',
    ]),
    nl([
      '                  <CollapsibleMeetingBlock',
      '                    key="weekend"',
      "                    title={getEventTypeLabel('weekend')}",
      "                    meta={meetingDateLabel('weekend')}",
      '                    assigned={assignedCount(items)}',
      '                    total={items.length}',
      '                    actionLabel={',
      '                      perms.canEditWeekendSchedule && draftCount(items) > 0',
      "                        ? t('schedule.publish.button')",
      '                        : undefined',
      '                    }',
      "                    actionBusy={publishingType === 'weekend'}",
      '                    onAction={() =>',
      "                      void publishMeetingNow('weekend', items[0].weekStartDate)",
      '                    }',
      '                  >',
    ]),
  ],
]);

// ---------- locales ----------
const ADDITIONS = {
  ru: { schedule: { publish: { button: 'Опубликовать' } } },
  en: { schedule: { publish: { button: 'Publish' } } },
  de: { schedule: { publish: { button: 'Veröffentlichen' } } },
};

function deepMerge(target, source, pathPrefix, report) {
  for (const key of Object.keys(source)) {
    const p = pathPrefix ? `${pathPrefix}.${key}` : key;
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!(key in target) || typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      deepMerge(target[key], sv, p, report);
    } else if (key in target) {
      report.skipped.push(p);
    } else {
      target[key] = sv;
      report.added.push(p);
    }
  }
}

for (const locale of Object.keys(ADDITIONS)) {
  const file = `locales/${locale}.json`;
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`FAIL: cannot read/parse ${file}: ${e.message}`);
    process.exit(1);
  }
  const report = { added: [], skipped: [] };
  deepMerge(obj, ADDITIONS[locale], '', report);
  if (report.added.length === 0) {
    console.log(`SKIP: ${file} — all keys already present`);
    continue;
  }
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  console.log(`OK: ${file} — added ${report.added.join(', ')}`);
}
