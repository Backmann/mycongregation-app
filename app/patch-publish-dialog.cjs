#!/usr/bin/env node
/**
 * patch-publish-dialog.cjs — единый выбор «уведомить / тихо / отмена» во
 * ВСЕХ точках публикации: кнопки «Опубликовать» на блоках встреч и в
 * режиме «Планирование» открывают один PublishDialog. Так UX публикации
 * одинаков по всему проекту. PlanningMode возвращается к 2-арг onPublish
 * (открывает диалог), index держит publishPrompt и монтирует диалог.
 * Применять ПОВЕРХ 0de498c. Idempotent; LF/CRLF tolerant.
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

// ===== 1) PlanningMode.tsx: пара кнопок → одна, onPublish снова 2-арг =====
patchFile('components/PlanningMode.tsx', 'openPublishDialog', [
  [
    'plan: onPublish 2-arg',
    "  onPublish: (\n    eventType: 'midweek' | 'weekend',\n    weekStartDate: string,\n    notify: boolean,\n  ) => void;",
    "  // openPublishDialog: opens the shared publish dialog for this zone.\n  onPublish: (eventType: 'midweek' | 'weekend', weekStartDate: string) => void;",
  ],
  [
    'plan: single publish button',
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
  ],
  [
    'plan: drop orphan silent styles',
    nl([
      '  publishSilently: {',
      "    alignItems: 'center',",
      '    paddingVertical: 10,',
      '    marginTop: 6,',
      '  },',
      "  publishSilentlyText: { color: '#64748b', fontSize: 13, fontWeight: '600' },",
    ]),
    '',
  ],
]);

// ===== 2) index.tsx =====
patchFile('app/(app)/schedule/index.tsx', 'PublishDialog', [
  // 2a) импорт диалога
  [
    'index: import PublishDialog',
    "import { PlanningMode } from '../../../components/PlanningMode';",
    nl([
      "import { PlanningMode } from '../../../components/PlanningMode';",
      "import { PublishDialog } from '../../../components/PublishDialog';",
    ]),
  ],
  // 2b) состояние запроса публикации
  [
    'index: publishPrompt state',
    "  const [planningZone, setPlanningZone] = useState<{",
    nl([
      '  const [publishPrompt, setPublishPrompt] = useState<{',
      "    eventType: 'midweek' | 'weekend';",
      '    weekStartDate: string;',
      '  } | null>(null);',
      '  const [planningZone, setPlanningZone] = useState<{',
    ]),
  ],
  // 2c) midweek-блок: onAction открывает диалог
  [
    'index: midweek onAction → dialog',
    nl([
      '                    onAction={() =>',
      "                      void publishMeetingNow('midweek', items[0].weekStartDate)",
      '                    }',
    ]),
    nl([
      '                    onAction={() =>',
      '                      setPublishPrompt({',
      "                        eventType: 'midweek',",
      '                        weekStartDate: items[0].weekStartDate,',
      '                      })',
      '                    }',
    ]),
  ],
  // 2d) weekend-блок: onAction открывает диалог
  [
    'index: weekend onAction → dialog',
    nl([
      '                    onAction={() =>',
      "                      void publishMeetingNow('weekend', items[0].weekStartDate)",
      '                    }',
    ]),
    nl([
      '                    onAction={() =>',
      '                      setPublishPrompt({',
      "                        eventType: 'weekend',",
      '                        weekStartDate: items[0].weekStartDate,',
      '                      })',
      '                    }',
    ]),
  ],
  // 2e) PlanningMode onPublish: открыть диалог (2-арг)
  [
    'index: PlanningMode onPublish → dialog',
    '        onPublish={(et, ws, notify) => void publishMeetingNow(et, ws, notify)}',
    '        onPublish={(et, ws) => setPublishPrompt({ eventType: et, weekStartDate: ws })}',
  ],
  // 2f) монтирование PublishDialog рядом с PlanningMode
  [
    'index: mount PublishDialog',
    nl([
      '        onClose={() => setPlanningZone(null)}',
      '      />',
    ]),
    nl([
      '        onClose={() => setPlanningZone(null)}',
      '      />',
      '      <PublishDialog',
      '        open={!!publishPrompt}',
      "        busy={publishingType === publishPrompt?.eventType}",
      '        onPublish={(notify) => {',
      '          if (publishPrompt) {',
      '            void publishMeetingNow(',
      '              publishPrompt.eventType,',
      '              publishPrompt.weekStartDate,',
      '              notify,',
      '            );',
      '          }',
      '          setPublishPrompt(null);',
      '        }}',
      '        onCancel={() => setPublishPrompt(null)}',
      '      />',
    ]),
  ],
]);

// ===== 3) локали PublishDialog =====
const ADDITIONS = {
  ru: {
    common: { cancel: 'Отмена' },
    schedule: {
      publishDialog: {
        title: 'Опубликовать встречу',
        subtitle: 'Назначения станут видны всем. Уведомить братьев?',
        notify: 'Опубликовать и уведомить',
        notifyHint: 'Братья получат уведомление',
        silent: 'Опубликовать тихо',
        silentHint: 'Без уведомления',
      },
    },
  },
  en: {
    common: { cancel: 'Cancel' },
    schedule: {
      publishDialog: {
        title: 'Publish meeting',
        subtitle: 'Assignments become visible to everyone. Notify the brothers?',
        notify: 'Publish and notify',
        notifyHint: 'The brothers get a notification',
        silent: 'Publish silently',
        silentHint: 'No notification',
      },
    },
  },
  de: {
    common: { cancel: 'Abbrechen' },
    schedule: {
      publishDialog: {
        title: 'Zusammenkunft veröffentlichen',
        subtitle: 'Zuteilungen werden für alle sichtbar. Brüder benachrichtigen?',
        notify: 'Veröffentlichen und benachrichtigen',
        notifyHint: 'Die Brüder erhalten eine Benachrichtigung',
        silent: 'Still veröffentlichen',
        silentHint: 'Ohne Benachrichtigung',
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

console.log('DONE: unified publish dialog everywhere');
