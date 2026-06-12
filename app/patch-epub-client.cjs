#!/usr/bin/env node
/**
 * patch-epub-client.cjs — клиентский импорт EPUB (разбор в браузере).
 *  - lib/api.ts: scheduleImportApi.apply → POST /schedule-import/apply
 *  - locales: schedule.import.* новые ключи (ru/en/de)
 *  - проверка зависимости jszip (предупреждение, если не установлена)
 * Новые/заменяемые файлы приходят в tar как полные файлы:
 *  - lib/mwb-parser.ts (новый)
 *  - app/(app)/schedule/import.tsx (полная замена)
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
patchFile('lib/api.ts', "'/schedule-import/apply'", [
  [
    'api: ApplyParsedPayload type import',
    "import { storage } from './storage';",
    nl([
      "import { storage } from './storage';",
      "import type { ApplyParsedPayload } from './mwb-parser';",
    ]),
  ],
  [
    'api: scheduleImportApi.apply',
    nl([
      '      timeout: 120_000,',
      '    });',
      '    return data;',
      '  },',
      '};',
    ]),
    nl([
      '      timeout: 120_000,',
      '    });',
      '    return data;',
      '  },',
      '  /**',
      '   * Применяет программу, разобранную НА КЛИЕНТЕ: файл публикации',
      '   * не загружается — отправляются только готовые назначения.',
      '   */',
      '  async apply(payload: ApplyParsedPayload): Promise<ImportResult> {',
      "    const { data } = await api.post<ImportResult>('/schedule-import/apply', payload);",
      '    return data;',
      '  },',
      '};',
    ]),
  ],
]);

// ---------- locales ----------
const ADDITIONS = {
  ru: {
    schedule: {
      import: {
        privacyNote:
          'Файл разбирается прямо в браузере и не загружается на сервер — в расписание попадают только названия частей и длительности.',
        parsing: 'Разбираем файл…',
        applying: 'Импортируем…',
        applyButton: 'Импортировать ({{count}} нед.)',
        preview: {
          title: 'Найденные недели',
          partsShort: 'частей: {{count}}',
          unclassifiedTitle: 'Не распознано частей: {{count}} (будут пропущены)',
        },
        errors: {
          webOnly:
            'Импорт из файла доступен в веб-версии приложения (откройте mycongregation.org в браузере на компьютере).',
          noWeeks:
            'В файле не найдено недельных программ. Это Рабочая тетрадь?',
          parseFailed: 'Не удалось разобрать файл',
        },
      },
    },
  },
  en: {
    schedule: {
      import: {
        privacyNote:
          'The file is parsed right in your browser and is never uploaded to the server — only part titles and durations go into the schedule.',
        parsing: 'Parsing the file…',
        applying: 'Importing…',
        applyButton: 'Import ({{count}} wk)',
        preview: {
          title: 'Weeks found',
          partsShort: '{{count}} parts',
          unclassifiedTitle: 'Unrecognized parts: {{count}} (will be skipped)',
        },
        errors: {
          webOnly:
            'File import is available in the web version (open mycongregation.org in a desktop browser).',
          noWeeks: 'No weekly programmes found in this file. Is it a Meeting Workbook?',
          parseFailed: 'Could not parse the file',
        },
      },
    },
  },
  de: {
    schedule: {
      import: {
        privacyNote:
          'Die Datei wird direkt im Browser ausgewertet und nie auf den Server hochgeladen — in den Plan gelangen nur Titel und Dauer der Programmpunkte.',
        parsing: 'Datei wird ausgewertet…',
        applying: 'Importiere…',
        applyButton: 'Importieren ({{count}} Wo.)',
        preview: {
          title: 'Gefundene Wochen',
          partsShort: '{{count}} Punkte',
          unclassifiedTitle: 'Nicht erkannte Punkte: {{count}} (werden übersprungen)',
        },
        errors: {
          webOnly:
            'Der Datei-Import ist in der Web-Version verfügbar (mycongregation.org im Desktop-Browser öffnen).',
          noWeeks:
            'Keine Wochenprogramme in dieser Datei gefunden. Ist es ein Arbeitsheft?',
          parseFailed: 'Datei konnte nicht ausgewertet werden',
        },
      },
    },
  },
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
  console.log(`OK: ${file} — added ${report.added.length} keys`);
}

// ---------- jszip dependency ----------
try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.jszip) {
    console.log(`OK: jszip уже в package.json (${deps.jszip})`);
  } else {
    console.log('WARN: jszip НЕ установлен — выполните:  npm install jszip');
  }
} catch (e) {
  console.log(`WARN: cannot check package.json: ${e.message}`);
}

console.log('DONE: client EPUB import patched');
