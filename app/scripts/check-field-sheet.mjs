/**
 * The theme's length and the printed sheet of field-service meetings
 * (variant A, 14 October 2026) — checked on cases, not by eye.
 *
 *  - lib/field-topic: the jw.org length at the END of a theme is split off
 *    («… Обсуждение. Длительность: 2:35» → theme + «2:35»); anything else,
 *    including a time inside the sentence, stays the theme.
 *  - lib/fieldServicePdf: the usual place is said once at the top and only
 *    when it really is the usual one; a row names its place only when it
 *    differs; a date once per day; «!» before a notice and «✕» before a
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
const { buildFieldServicePdfHtml, usualPlace } = await import(toUrl(sheetJs));

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
  ['', null, null],
  [null, null, null],
];
for (const [topic, text, length] of TOPICS) eq(`splitTopic(${JSON.stringify(topic)})`, splitTopic(topic), { text, length });

// --- the usual place -------------------------------------------------------------
const row = (o) => ({
  dateISO: '2026-10-17', dayLabel: 'сб', time: '10:30', kind: 'Общая встреча', address: 'Зал, Hamm',
  topic: null, notice: null, cancelledLine: null, conductorName: 'Кох Никлас',
  isOverseerVisit: false, overseerName: null, assistantName: null, fromCoVisit: false, ...o,
});
eq('usual: one meeting is not «usual»', usualPlace([{ title: 'x', theme: null, rows: [row({})] }]), null);
eq('usual: 2 of 3', usualPlace([{ title: 'x', theme: null, rows: [row({}), row({}), row({ address: 'Парк' })] }]), 'Зал, Hamm');
eq('usual: 2 of 6 is not', usualPlace([{ title: 'x', theme: null, rows: [row({}), row({}), row({ address: 'a' }), row({ address: 'b' }), row({ address: 'c' }), row({ address: 'd' })] }]), null);
eq('usual: a circuit visit outing is not counted', usualPlace([{ title: 'x', theme: null, rows: [row({}), row({ fromCoVisit: true, address: 'B' }), row({ fromCoVisit: true, address: 'B' }), row({ fromCoVisit: true, address: 'B' })] }]), null);

// --- the sheet -------------------------------------------------------------------
const L = {
  title: 'Встречи для проповеди', date: 'Дата', time: 'Время', meeting: 'Встреча', conductor: 'Ведёт',
  overseer: 'служебный старейшина', assistant: 'помощник', usualPlace: 'Где не указано иначе —', place: 'Место',
  monthTheme: 'Тема месяца', generated: 'Сформировано',
};
const html = buildFieldServicePdfHtml({
  congregationName: 'Test',
  rangeLabel: 'октябрь 2026 г.',
  generatedDate: '14.10.2026',
  labels: L,
  months: [
    {
      title: 'октябрь 2026 г.',
      theme: null,
      rows: [
        row({ dateISO: '2026-10-10', time: '10:00', kind: 'Группа Верне — посещение', address: 'Lindenweg 5, Werne', isOverseerVisit: true, conductorName: 'Вебер Андреас', overseerName: 'Беккер Йонас', assistantName: 'Вебер Андреас' }),
        row({ dateISO: '2026-10-10', time: '10:30', topic: 'Тема. Длительность: 2:35' }),
        row({ dateISO: '2026-10-17', notice: 'Зал на ремонте' }),
        row({ dateISO: '2026-10-31', cancelledLine: 'Отменена: конгресс', topic: 'Тема, которой не будет' }),
      ],
    },
  ],
});
const has = (what, s) => (html.includes(s) ? null : problems.push(`sheet: ${what} — нет «${s}»`));
const hasNot = (what, s) => (html.includes(s) ? problems.push(`sheet: ${what} — лишнее «${s}»`) : null);
has('usual place at the top', 'Где не указано иначе —<br><b>Зал, Hamm</b>');
has('a row names a place that differs', 'Место: Lindenweg 5, Werne');
hasNot('the usual place in a row', 'Место: Зал, Hamm');
eq('the date once per day', (html.match(/сб 10\.10/g) ?? []).length, 1);
has('the second meeting of the day marked as the same day', 'class="same"');
has('the length at the end of the theme', 'Тема. <span class="len">· 2:35</span>');
has('notice with «!»', '! Зал на ремонте');
has('cancellation with «✕»', '✕ Отменена: конгресс');
hasNot('a cancelled meeting prints no theme', 'Тема, которой не будет');
has('on a visit the overseer under the conductor', 'Вебер Андреас<div class="with">служебный старейшина Беккер Йонас</div>');
hasNot('the assistant who IS the conductor is not repeated', 'помощник Вебер Андреас');
has('the month capitalised', '<h2>Октябрь 2026 г.</h2>');
hasNot('no weight beside a face', 'font-weight: 700');
has('the columns fixed for every month', 'table-layout: fixed');

if (problems.length) {
  console.error(`✗ Лист встреч для проповеди:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ Лист встреч для проповеди: ${TOPICS.length} тем с длительностью и без, 4 случая «обычного места», 14 проверок листа`);
