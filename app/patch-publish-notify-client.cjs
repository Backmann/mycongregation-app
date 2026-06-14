#!/usr/bin/env node
/**
 * patch-publish-notify-client.cjs — два понятных действия публикации в
 * режиме «Планирование»: крупная «Опубликовать и уведомить» (push братьям)
 * и неприметная «Опубликовать тихо» (без push). Протаскивает notify через
 * assignmentsApi.publish → publishMeetingNow → onPublish.
 * Применять ПОВЕРХ 093ec2b (клиент) + серверного notify-патча.
 * Idempotent; LF/CRLF tolerant. Запускать из ~/congmap/app.
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

function patchFile(file, guard, edits) {
  const { txt: orig, eol } = readNorm(file);
  if (orig.includes(guard)) {
    console.log(`SKIP: ${file} already patched (${guard})`);
    return;
  }
  let txt = orig;
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

// 1) api.ts: notify?: boolean в тип publish
patchFile('lib/api.ts', 'notify?: boolean;\n  }): Promise<{ published: number }>', [
  [
    'api: notify in publish input',
    nl([
      '  async publish(input: {',
      '    weekStartDate: string;',
      '    eventType: EventType;',
      '  }): Promise<{ published: number }> {',
    ]),
    nl([
      '  async publish(input: {',
      '    weekStartDate: string;',
      '    eventType: EventType;',
      '    notify?: boolean;',
      '  }): Promise<{ published: number }> {',
    ]),
  ],
]);

// 2) index.tsx: publishMeetingNow принимает notify + проброс в onPublish
patchFile('app/(app)/schedule/index.tsx', 'notify = true,\n  ) => {', [
  [
    'index: publishMeetingNow notify param',
    nl([
      '  const publishMeetingNow = async (',
      "    eventType: 'midweek' | 'weekend',",
      '    weekStartDate: string,',
      '  ) => {',
    ]),
    nl([
      '  const publishMeetingNow = async (',
      "    eventType: 'midweek' | 'weekend',",
      '    weekStartDate: string,',
      '    notify = true,',
      '  ) => {',
    ]),
  ],
  [
    'index: publish passes notify',
    'await assignmentsApi.publish({ weekStartDate, eventType });',
    'await assignmentsApi.publish({ weekStartDate, eventType, notify });',
  ],
  [
    'index: onPublish forwards notify',
    '        onPublish={(et, ws) => void publishMeetingNow(et, ws)}',
    '        onPublish={(et, ws, notify) => void publishMeetingNow(et, ws, notify)}',
  ],
]);

// 3) PlanningMode.tsx: onPublish с notify + две кнопки
patchFile('components/PlanningMode.tsx', 'publishSilently', [
  [
    'plan: onPublish signature',
    "  onPublish: (eventType: 'midweek' | 'weekend', weekStartDate: string) => void;",
    "  onPublish: (\n    eventType: 'midweek' | 'weekend',\n    weekStartDate: string,\n    notify: boolean,\n  ) => void;",
  ],
  [
    'plan: two publish buttons',
    nl([
      '            <Pressable',
      '              style={({ pressed }) => [',
      '                styles.publishBtn,',
      '                pressed && styles.publishBtnPressed,',
      '                publishing && styles.publishBtnDisabled,',
      '              ]}',
      '              disabled={publishing}',
      '              onPress={() =>',
      '                zone && onPublish(zone.eventType, zone.weekStartDate)',
      '              }',
      '            >',
      '              <Text style={styles.publishBtnText}>',
      '                {publishing',
      "                  ? t('schedule.planning.publishing')",
      "                  : t('schedule.planning.publishThis')}",
      '              </Text>',
      '            </Pressable>',
    ]),
    nl([
      '            <Pressable',
      '              style={({ pressed }) => [',
      '                styles.publishBtn,',
      '                pressed && styles.publishBtnPressed,',
      '                publishing && styles.publishBtnDisabled,',
      '              ]}',
      '              disabled={publishing}',
      '              onPress={() =>',
      '                zone && onPublish(zone.eventType, zone.weekStartDate, true)',
      '              }',
      '            >',
      '              <Text style={styles.publishBtnText}>',
      '                {publishing',
      "                  ? t('schedule.planning.publishing')",
      "                  : t('schedule.planning.publishNotify')}",
      '              </Text>',
      '            </Pressable>',
      '            <Pressable',
      '              style={({ pressed }) => [',
      '                styles.publishSilently,',
      '                pressed && styles.publishBtnPressed,',
      '              ]}',
      '              disabled={publishing}',
      '              onPress={() =>',
      '                zone && onPublish(zone.eventType, zone.weekStartDate, false)',
      '              }',
      '            >',
      '              <Text style={styles.publishSilentlyText}>',
      "                {t('schedule.planning.publishSilent')}",
      '              </Text>',
      '            </Pressable>',
    ]),
  ],
  [
    'plan: silent button styles',
    "  publishBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },",
    nl([
      "  publishBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },",
      '  publishSilently: {',
      "    alignItems: 'center',",
      '    paddingVertical: 10,',
      '    marginTop: 6,',
      '  },',
      "  publishSilentlyText: { color: '#64748b', fontSize: 13, fontWeight: '600' },",
    ]),
  ],
]);

// 4) локали
const ADDITIONS = {
  ru: {
    schedule: {
      planning: {
        publishNotify: 'Опубликовать и уведомить',
        publishSilent: 'Опубликовать тихо (без уведомления)',
      },
    },
  },
  en: {
    schedule: {
      planning: {
        publishNotify: 'Publish and notify',
        publishSilent: 'Publish silently (no notification)',
      },
    },
  },
  de: {
    schedule: {
      planning: {
        publishNotify: 'Veröffentlichen und benachrichtigen',
        publishSilent: 'Still veröffentlichen (ohne Benachrichtigung)',
      },
    },
  },
};

function deepMerge(target, source, p, report) {
  for (const key of Object.keys(source)) {
    const path = p ? `${p}.${key}` : key;
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!(key in target) || typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      deepMerge(target[key], sv, path, report);
    } else if (key in target) {
      report.skipped.push(path);
    } else {
      target[key] = sv;
      report.added.push(path);
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
    console.log(`SKIP: ${file} — all keys present`);
    continue;
  }
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  console.log(`OK: ${file} — added ${report.added.length} keys`);
}

console.log('DONE: client has notify / silent publish buttons');
