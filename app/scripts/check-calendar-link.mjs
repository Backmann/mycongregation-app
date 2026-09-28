#!/usr/bin/env node
/**
 * «В мой календарь» (28 September): the dates and the file the calendars read.
 * Called directly from the gate — a new npm script would move the fingerprint.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const src = readFileSync(join(ROOT, 'lib', 'calendar-link.ts'), 'utf8').replace(
  "import { Linking, Platform } from 'react-native';",
  'const Linking = {}; const Platform = { OS: "test" };',
);
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { calendarSpan, toIcs, googleCalendarUrl } = mod.exports;

let bad = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    bad++;
    console.error(`✗ ${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
  }
};
const base = { title: 'Вечеря', date: '2027-03-22', endDate: null, time: '19:30', timeEnd: null, location: null, details: null };
eq('час без конца — два часа', calendarSpan(base), { allDay: false, start: '20270322T193000', end: '20270322T213000' });
eq('час с концом', calendarSpan({ ...base, timeEnd: '21:15' }), { allDay: false, start: '20270322T193000', end: '20270322T211500' });
eq('не за полночь', calendarSpan({ ...base, time: '23:00' }).end, '20270322T235900');
eq('без часа — весь день', calendarSpan({ ...base, time: null }), { allDay: true, start: '20270322', end: '20270323' });
eq('несколько дней — весь день, конец не включён', calendarSpan({ ...base, date: '2027-07-09', endDate: '2027-07-11' }), { allDay: true, start: '20270709', end: '20270712' });
eq('через конец месяца', calendarSpan({ ...base, time: null, date: '2027-02-28' }).end, '20270301');
const ics = toIcs({ ...base, title: 'А, б; в', location: 'Bunsenstr. 46, Ahlen' }, 'e1');
eq('экранирование', ics.includes('SUMMARY:А\\, б\\; в') && ics.includes('LOCATION:Bunsenstr. 46\\, Ahlen'), true);
eq('строки CRLF', ics.split('\r\n').length > 8, true);
eq('ссылка Google', googleCalendarUrl(base).includes('dates=20270322T193000%2F20270322T213000'), true);

if (bad) {
  console.error(`Календарь: ${bad} расхождений`);
  process.exit(1);
}
console.log('OK: «В мой календарь» — даты, весь день, конец дня и файл .ics как надо.');
