#!/usr/bin/env node
/**
 * patch-planning-locales.cjs — ключи schedule.planning.* (ru/en/de).
 * Idempotent; пропускает существующие. Запускать из ~/congmap/app.
 */
const fs = require('fs');

const ADDITIONS = {
  ru: {
    schedule: {
      planning: {
        enter: 'Планировать',
        title: 'Планирование встречи',
        progress: 'Назначено {{done}} из {{total}}',
        todoHeader: 'Нужно назначить ({{count}})',
        draftHeader: 'Черновик, не опубликовано ({{count}})',
        allAssigned: 'Все части этой встречи назначены',
        publishThis: 'Опубликовать эту встречу',
        publishing: 'Публикуем…',
      },
    },
  },
  en: {
    schedule: {
      planning: {
        enter: 'Plan',
        title: 'Meeting planning',
        progress: '{{done}} of {{total}} assigned',
        todoHeader: 'Needs assigning ({{count}})',
        draftHeader: 'Draft, not published ({{count}})',
        allAssigned: 'Every part of this meeting is assigned',
        publishThis: 'Publish this meeting',
        publishing: 'Publishing…',
      },
    },
  },
  de: {
    schedule: {
      planning: {
        enter: 'Planen',
        title: 'Zusammenkunft planen',
        progress: '{{done}} von {{total}} zugeteilt',
        todoHeader: 'Zuzuteilen ({{count}})',
        draftHeader: 'Entwurf, nicht veröffentlicht ({{count}})',
        allAssigned: 'Alle Programmpunkte dieser Zusammenkunft sind zugeteilt',
        publishThis: 'Diese Zusammenkunft veröffentlichen',
        publishing: 'Wird veröffentlicht…',
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
    console.log(`SKIP: ${file} — all keys already present`);
    continue;
  }
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  console.log(`OK: ${file} — added ${report.added.length} keys`);
}
console.log('DONE: planning locales');
