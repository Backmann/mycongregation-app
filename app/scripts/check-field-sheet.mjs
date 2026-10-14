/**
 * The theme's length and the printed sheet of field-service meetings
 * (variant A, 14 October 2026) — checked on cases, not by eye. The month
 * and its theme stand in the table head, which the printer repeats at the
 * top of a continued page.
 *
 *  - lib/field-topic: the jw.org length at the END of a theme is split off
 *    («… Обсуждение. Длительность: 2:35» → theme + «2:35»); anything else,
 *    including a time inside the sentence, stays the theme.
 *  - lib/fieldServicePdf: the place on every line, a hall by its name over
 *    its address; one month — no month heading under the header; a day once; «!» before a notice and «✕» before a
 *    cancellation (black-and-white printers); a cancelled meeting prints no
 *    theme; on a visit the conductor leads, the overseer stands under him.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const transpile = (src) =>
  ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const toUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;

const topicJs = transpile(readFileSync(join(ROOT, 'lib/field-topic.ts'), 'utf8'));
const { splitTopic } = await import(toUrl(topicJs));
// The sheet imports './field-topic': point it at the module just built.
const sheetJs = transpile(readFileSync(join(ROOT, 'lib/fieldServicePdf.ts'), 'utf8')).replace(
  /from ['"]\.\/field-topic['"]/,
  `from '${toUrl(topicJs)}'`,
);
const { buildFieldServicePdfHtml } = await import(toUrl(sheetJs));

const problems = [];
const eq = (what, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${what}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
};

// --- the length -----------------------------------------------------------------
const TOPICS = [
  ['Помогайте изучающим развить близкую дружбу с Иеговой. Обсуждение.\nДлительность: 2:35', 'Помогайте изучающим развить близкую дружбу с Иеговой. Обсуждение.', '2:35'],
  ['Проповедуйте «радостную весть о мире». Берите на себя инициативу Длительность: 2:09', 'Проповедуйте «радостную весть о мире». Берите на себя инициативу', '2:09'],
  ['Обсуждение.Длительность: 12:05', 'Обсуждение.', '12:05'],
  ['Thema. Dauer: 1:02:30', 'Thema.', '1:02:30'],
  ['Topic. Duration: 3:04 ', 'Topic.', '3:04'],
  ['Встреча в 10:30 у парка', 'Встреча в 10:30 у парка', null],
  ['Длительность: 2:35 — потом обсуждение', 'Длительность: 2:35 — потом обсуждение', null],
  ['Длительность: 2:35', null, '2:35'],
  ['Как проповедовать по домофону (№ 1 и №2) Обсуждение Длительность: 1:10 и 3:39', 'Как проповедовать по домофону (№ 1 и №2) Обсуждение', '1:10 и 3:39'],
  ['Zwei Videos. Dauer: 1:10 und 3:39', 'Zwei Videos.', '1:10 und 3:39'],
  ['Тема. Длительность: 1:10, 2:00', 'Тема.', '1:10, 2:00'],
  ['Тема. Длительность: 1:10 и потом', 'Тема. Длительность: 1:10 и потом', null],
  ['', null, null],
  [null, null, null],
];
for (const [topic, text, length] of TOPICS) eq(`splitTopic(${JSON.stringify(topic)})`, splitTopic(topic), { text, length });

// --- the sheet -------------------------------------------------------------------
const row = (o) => ({
  dateISO: '2026-10-17', dayLabel: 'сб', time: '10:30', kind: 'Общая встреча', address: 'Bunsenstr. 46, Ahlen',
  placeName: 'Зал Царства Ahlen', topic: null, notice: null, cancelledLine: null, conductorName: 'Кох Никлас',
  isOverseerVisit: false, overseerName: null, assistantName: null, fromCoVisit: false, ...o,
});
const L = {
  title: 'Встречи для проповеди', date: 'День', time: 'Время', meeting: 'Встреча', where: 'Место', conductor: 'Ведёт',
  visit: 'посещение служебного старейшины', overseer: 'служебный старейшина', assistant: 'помощник',
  monthTheme: 'Тема месяца', generated: 'Сформировано',
};
const sheet = (months) =>
  buildFieldServicePdfHtml({ congregationName: 'Test', rangeLabel: 'Ноябрь 2026', generatedDate: '14.10.2026', labels: L, months });
const html = sheet([
  {
    title: 'Октябрь',
    theme: null,
    rows: [
      row({ dateISO: '2026-10-10', time: '10:00', kind: 'Группа Верне', address: 'Lindenweg 5, Werne', placeName: null, isOverseerVisit: true, conductorName: 'Вебер Андреас', overseerName: 'Вебер Андреас', assistantName: 'Келлер Давид' }),
      row({ dateISO: '2026-10-10', time: '10:30', topic: 'Тема. Длительность: 2:35' }),
      row({ dateISO: '2026-10-17', notice: 'Зал на ремонте' }),
      row({ dateISO: '2026-10-31', cancelledLine: 'Отменена: конгресс', topic: 'Тема, которой не будет' }),
    ],
  },
  { title: 'Ноябрь', theme: null, rows: [row({ dateISO: '2026-11-07', overseerName: null })] },
]);
const has = (what, s, h = html) => (h.includes(s) ? null : problems.push(`sheet: ${what} — нет «${s}»`));
const hasNot = (what, s, h = html) => (h.includes(s) ? problems.push(`sheet: ${what} — лишнее «${s}»`) : null);
const count = (s, h = html) => h.split(s).length - 1;
eq('the place on every line', count('<div class="addr">'), 5);
has("a hall named over its address, street and town on two lines", "<div class=\"hall\">Зал Царства Ahlen</div><div class=\"addr\">Bunsenstr. 46<br>Ahlen</div>");
has("a place that is no hall: its address alone", "<td class=\"where\"><div class=\"addr\">Lindenweg 5<br>Werne</div></td>");
hasNot('no «usual place» any more', 'Где не указано');
eq('the day once per day', count('<span class="dnum">10</span>'), 1);
has('the second meeting of the day marked as the same day', 'class="same"');
has('the length at the end of the theme', 'Тема. <span class="len">· 2:35</span>');
has('notice with «!»', '! Зал на ремонте');
has('cancellation with «✕»', '✕ Отменена: конгресс');
hasNot('a cancelled meeting prints no theme', 'Тема, которой не будет');
has('a visit tagged under the group', 'Группа Верне</div><div class="tag">посещение служебного старейшины</div>');
has('the overseer who conducts: named once, with his role', 'Вебер Андреас<div class="with">служебный старейшина</div><div class="with">помощник Келлер Давид</div>');
eq('two months: a heading each', count('<h2>'), 2);
has('the month capitalised', '<h2>Октябрь</h2>');
// In the table's head, so that a month running over onto the next page is
// named again at the top of it.
has('the month in the head that repeats on every page', '<thead><tr><th colspan="5" class="mcap"><h2>Октябрь</h2></th></tr><tr class="cols">');
has('the head repeated on every page', 'thead { display: table-header-group; }');
eq('one month: no heading under the header', count('<h2>', sheet([{ title: 'Ноябрь', theme: null, rows: [row({})] }])), 0);
has(
  "one month's theme still in the repeating head",
  '<thead><tr><th colspan="5" class="mcap"><div class="mtheme">Тема месяца: Радуйтесь</div></th></tr>',
  sheet([{ title: 'Ноябрь', theme: 'Радуйтесь', rows: [row({})] }]),
);
hasNot('no weight beside a face', 'font-weight: 700');
has('the columns fixed for every month', 'table-layout: fixed');

if (problems.length) {
  console.error(`✗ Лист встреч для проповеди:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ Лист встреч для проповеди: ${TOPICS.length} тем с длительностью и без, 20 проверок листа`);
