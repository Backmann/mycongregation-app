#!/usr/bin/env node
/**
 * Reading a whole issue, checked (5 October 2026).
 *
 * scripts/check-import-parsers.mjs holds the small text rules. This is the
 * half nobody had ever tested, in either copy of the parsers: opening the
 * file and deciding which heading opens a section, which is a part, where
 * the songs stand. The day it was first compared with a real issue — the
 * workbook for January 2027 — it turned out to have been wrong in three ways:
 *   - a heading INSIDE a part came in as a part of its own, with no minutes;
 *   - the three songs of a midweek meeting were not read at all, because the
 *     publication now sets them as paragraphs and only headings were looked at;
 *   - a week whose dates could not be read was dropped without a word.
 *
 * THE SAMPLES ARE NOT THE PUBLICATION. Its text is not ours to put in a
 * public repository. They are built here with invented wording on the
 * skeleton of the real pages — the same tags, nested the same way — which is
 * the only thing the reader looks at.
 *
 * HOW IT RUNS WITHOUT A BROWSER. The parsers ask a browser for a document;
 * the gate has none. A small stand-in is put together from the XML parser the
 * app already carries (through Expo) and the three things the parsers call on
 * it. On the real issues this stand-in and Chrome gave the same result to the
 * last value — checked on 5 October for both publications, before and after
 * the fixes. The fixed reader was then held against three real workbooks,
 * September 2026 to February 2027: 25 weeks, every song and every part's
 * minutes as the documents have them; on the two older issues it sends
 * exactly what the reader before it sent. If the parsers start asking a browser for more, the stand-in
 * fails loudly here rather than agreeing with itself.
 *
 * Called directly from the gate — no test runner in the app, and a new npm
 * script would move the Expo fingerprint.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const JSZip = require('jszip');

// ───── the stand-in for a browser's document ─────
{
  const { DOMParser } = require('@xmldom/xmldom');
  const probe = new DOMParser().parseFromString('<a><b/></a>', 'text/xml');
  const elementProto = Object.getPrototypeOf(probe.documentElement);
  const documentProto = Object.getPrototypeOf(probe);
  const walk = (node, tags, found) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      if (tags.includes((c.localName || c.tagName).toLowerCase())) found.push(c);
      walk(c, tags, found);
    }
    return found;
  };
  // Tag names only, comma-separated — all the parsers use. Anything else is
  // refused, so a new kind of selector cannot pass here by matching nothing.
  const all = function (selector) {
    const tags = selector.split(',').map((s) => s.trim().toLowerCase());
    if (!tags.every((t) => /^[a-z][a-z0-9]*$/.test(t))) {
      throw new Error(`check-import-documents: the stand-in does not know the selector «${selector}»`);
    }
    return walk(this, tags, []);
  };
  for (const proto of [elementProto, documentProto]) {
    proto.querySelectorAll = all;
    proto.querySelector = function (selector) {
      return all.call(this, selector)[0] ?? null;
    };
  }
  Object.defineProperty(elementProto, 'nextElementSibling', {
    configurable: true,
    get() {
      let n = this.nextSibling;
      while (n && n.nodeType !== 1) n = n.nextSibling;
      return n ?? null;
    },
  });
  globalThis.DOMParser = class {
    parseFromString(text, type) {
      const quiet = { warning() {}, error() {}, fatalError(e) { throw new Error(String(e)); } };
      return new DOMParser({ errorHandler: quiet }).parseFromString(
        text,
        type === 'text/html' ? 'text/html' : 'application/xhtml+xml',
      );
    }
  };
}

// ───── the parsers as the app ships them ─────
const out = mkdtempSync(join(tmpdir(), 'import-documents-'));
async function load(name) {
  const js = ts
    .transpileModule(readFileSync(join(ROOT, 'lib', `${name}.ts`), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    })
    .outputText.replace(/from ['"]jszip['"]/, `from ${JSON.stringify(pathToFileURL(require.resolve('jszip')).href)}`)
    .replace(/from ['"]\.\/mwb-parser['"]/, "from './mwb-parser.mjs'");
  const file = join(out, `${name}.mjs`);
  writeFileSync(file, js);
  return import(pathToFileURL(file));
}
const mwb = await load('mwb-parser');
const wt = await load('wt-parser');

// ───── samples: invented wording on the real skeleton ─────
const page = (body) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>x</title></head><body>${body}</body></html>`;
const section = (name) => `<div><h2><strong>${name}</strong></h2></div>`;
/** A numbered part as the workbook sets it: heading, then its minutes below. */
const part = (heading, minutes, text = '') =>
  `<h3><strong>${heading}</strong></h3><div><div><p>(${minutes} мин.)${text ? ` ${text}` : ''}</p></div><p>Первый пункт части.</p><p>Второй пункт части.</p></div>`;

/** The layout of 2027: every song is a paragraph. */
function weekOf2027({ heading, box = '', songs = [5, 7, 9] }) {
  return page(
    `<header><h1><strong>${heading}</strong></h1><h2><strong>ИСАЙЯ 1, 2</strong></h2></header>` +
      `<div class="bodyTxt">` +
      `<p><a href="#"><strong>Песня ${songs[0]}</strong></a> <strong>и молитва | Вступительные слова</strong> (1 мин.)</p>` +
      section('СОКРОВИЩА ИЗ СЛОВА БОГА') +
      part('1. Вымышленная тема речи', 10) +
      part('2. Духовные жемчужины', 10) +
      `<h3><strong>3. Чтение Библии</strong></h3><div><p>(4 мин.) Иса 1:1—10 (th урок 5).</p></div>` +
      section('ОТТАЧИВАЕМ НАВЫКИ СЛУЖЕНИЯ') +
      part('4. Начинайте разговор', 3, 'ПРОПОВЕДЬ ПО ДОМАМ.') +
      part('5. Развивайте интерес', 4, 'НЕФОРМАЛЬНОЕ СЛУЖЕНИЕ.') +
      part('6. Объясняйте свои взгляды', 5, 'Речь.') +
      section('ХРИСТИАНСКАЯ ЖИЗНЬ') +
      `<p><a href="#"><strong>Песня ${songs[1]}</strong></a></p>` +
      part('7. Вымышленная часть с обсуждением', 15, 'Обсуждение.') +
      box +
      part('8. Изучение Библии в собрании', 30, 'книга 1, абз. 1—6') +
      `<h3><strong>Заключительные слова</strong> <span>(3 мин.)</span></h3>` +
      `<p><a href="#"><strong>Песня ${songs[2]}</strong></a> <strong>и молитва</strong></p>` +
      `</div>`,
  );
}
/**
 * The layout up to the end of 2026: the three songs stood in headings — the
 * opening one with the prayer, «Песня N» alone at the head of «Христианская
 * жизнь», and the closing one in the heading of the concluding comments.
 * Taken from the real issues for September and November 2026; the January
 * 2027 issue is the first to set them as paragraphs.
 */
const weekOf2026 = page(
  `<header><h1>11—17 МАЯ</h1><h2>ИСАЙЯ 3, 4</h2></header><div class="bodyTxt">` +
    `<h3>Песня 21 и молитва | Вступительные слова (1 мин.)</h3>` +
    section('СОКРОВИЩА ИЗ СЛОВА БОГА') +
    part('1. Ещё одна вымышленная тема', 10) +
    part('2. Духовные жемчужины', 10) +
    part('3. Чтение Библии', 4) +
    section('ОТТАЧИВАЕМ НАВЫКИ СЛУЖЕНИЯ') +
    part('4. Начинайте разговор', 4) +
    part('5. Развивайте интерес', 4) +
    section('ХРИСТИАНСКАЯ ЖИЗНЬ') +
    `<h3>Песня 22</h3>` +
    part('6. Местные потребности', 15) +
    part('7. Изучение Библии в собрании', 30) +
    `<h3><strong>Заключительные слова</strong> <span>(3 мин.)</span> | <span><a href="#"><strong>Песня 23</strong></a></span> <strong>и молитва</strong></h3></div>`,
);
const BOX = `<h3><strong>Подзаголовок рамки внутри части</strong></h3><div><p>Текст рамки без минут.</p></div>`;
const cover = page(`<header><h1>Вымышленная тетрадь. Январь — февраль 2027 года</h1></header><div><p>Содержание.</p></div>`);

async function issue(files) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  for (const [name, text] of Object.entries(files)) zip.file(`OEBPS/${name}`, text);
  return zip.generateAsync({ type: 'uint8array' });
}

// ───── the checks ─────
let passed = 0;
const failures = [];
function check(name, got, want) {
  if (isDeepStrictEqual(got, want)) passed++;
  else failures.push(`${name}\n    ждали  ${JSON.stringify(want)}\n    вышло  ${JSON.stringify(got)}`);
}
/** A week as the server receives it: key, order, minutes, title. */
const sent = (workbook, i = 0) =>
  mwb.toApplyPayload(workbook).weeks[i].parts.map((p) => [p.partKey, p.partOrder, p.partDurationMin, p.partTitle]);

{
  const book = await mwb.parseMwbFile(
    await issue({
      '202027000.xhtml': cover,
      '202027001.xhtml': weekOf2027({ heading: '4—10 ЯНВАРЯ' }),
      '202027002.xhtml': weekOf2027({ heading: '11—17 ЯНВАРЯ', box: BOX, songs: [130, 58, 159] }),
      '202027003.xhtml': weekOf2027({ heading: '28 ДЕКАБРЯ 2026 ГОДА — 3 ЯНВАРЯ 2027 ГОДА' }),
      '202027004.xhtml': weekOf2027({ heading: 'НЕДЕЛЯ БЕЗ ДАТЫ' }),
      'toc.xhtml': page('<h1>1—7 МАРТА</h1>'),
    }),
    2027,
    'mwb_U_202701.epub',
  );
  check('ошибок чтения нет', book.errors, []);
  check('три недели, по порядку дат', book.weeks.map((w) => [w.weekStartDate, w.weekEndDate]), [
    ['2026-12-28', '2027-01-03'],
    ['2027-01-04', '2027-01-10'],
    ['2027-01-11', '2027-01-17'],
  ]);
  check('отрывок недели — первый заголовок, не раздел', book.weeks[1].biblePassage, 'ИСАЙЯ 1, 2');
  check('неделя без даты названа, обложка — нет', book.unreadWeeks, ['НЕДЕЛЯ БЕЗ ДАТЫ']);
  check('вёрстка 2027: вся неделя, как уходит на сервер', sent(book, 1), [
    ['midweek_chairman', 1, null, null],
    ['midweek_opening_prayer', 2, 1, 'Песня 5 и молитва | Вступительные слова'],
    ['treasures_talk', 3, 10, 'Вымышленная тема речи: Первый пункт части.'],
    ['spiritual_gems', 4, 10, 'Духовные жемчужины: Первый пункт части.'],
    ['bible_reading', 5, 4, 'Чтение Библии: Иса 1:1—10 (th урок 5).'],
    ['apply_yourself_1', 6, 3, 'Начинайте разговор: ПРОПОВЕДЬ ПО ДОМАМ.'],
    ['apply_yourself_2', 7, 4, 'Развивайте интерес: НЕФОРМАЛЬНОЕ СЛУЖЕНИЕ.'],
    ['apply_yourself_3', 8, 5, 'Объясняйте свои взгляды: Речь.'],
    ['mid_song', 9, null, 'Песня 7'],
    ['living_christians_1', 10, 15, 'Вымышленная часть с обсуждением: Обсуждение.'],
    ['cbs_conductor', 13, 30, 'Изучение Библии в собрании: книга 1, абз. 1—6'],
    ['cbs_reader', 14, null, null],
    ['midweek_closing_prayer', 15, 3, 'Заключительные слова | Песня 9 и молитва'],
  ]);
  const withBox = sent(book, 2);
  check('рамка внутри части не становится частью', withBox.map((p) => p[0]).filter((k) => k.startsWith('living_christians')), [
    'living_christians_1',
  ]);
  check('и ничего другого в неделе с рамкой не сдвигает', withBox.length, 13);
  check('три песни недели — из абзацев', [1, 8, 12].map((i) => withBox[i]?.[3] ?? null), [
    'Песня 130 и молитва | Вступительные слова',
    'Песня 58',
    'Заключительные слова | Песня 159 и молитва',
  ]);
}
{
  const book = await mwb.parseMwbFile(await issue({ '202026001.xhtml': weekOf2026 }), 2026, 'mwb_U_202605.epub');
  const parts = sent(book);
  check('вёрстка до конца 2026: песни в заголовках читаются по-прежнему', [
    parts.find((p) => p[0] === 'midweek_opening_prayer'),
    parts.find((p) => p[0] === 'mid_song'),
    parts.find((p) => p[0] === 'midweek_closing_prayer'),
  ], [
    ['midweek_opening_prayer', 2, 1, 'Песня 21 и молитва | Вступительные слова'],
    ['mid_song', 9, null, 'Песня 22'],
    ['midweek_closing_prayer', 15, 3, 'Заключительные слова (3 мин.) | Песня 23 и молитва'],
  ]);
  check('и частей столько же, сколько в документе', parts.length, 12);
}
{
  // What must NOT be taken for a song or dropped as a box.
  const body = (extra) =>
    page(
      `<header><h1>1—7 МАРТА</h1><h2>ИСАЙЯ 5</h2></header><div><p>Песня 1 и молитва | Вступительные слова (1 мин.)</p>` +
        section('СОКРОВИЩА ИЗ СЛОВА БОГА') + part('1. Тема', 10) + extra + section('ХРИСТИАНСКАЯ ЖИЗНЬ') +
        `<p>Песня 2</p>` + part('2. Часть', 15) + `<h3>Заключительные слова (3 мин.)</h3><p>Песня 3 и молитва</p></div>`,
    );
  const a = sent(await mwb.parseMwbFile(await issue({ '1.xhtml': body('<div><p>Песня 99 упомянута в тексте части.</p></div>') }), 2027));
  check('«Песня N» в тексте части — не песня встречи', a.filter((p) => /Песня/.test(p[3] ?? '')).map((p) => p[3]), [
    'Песня 1 и молитва | Вступительные слова',
    'Песня 2',
    'Заключительные слова | Песня 3 и молитва',
  ]);
  const b = sent(await mwb.parseMwbFile(await issue({ '1.xhtml': body('<h3>Заголовок без номера, но с минутами</h3><div><p>(5 мин.) Текст.</p></div>') }), 2027));
  check('заголовок без номера, но с минутами — остаётся частью', b.some((p) => p[2] === 5), true);
}
{
  const article = (dates, title, first, last) =>
    page(
      `<header><div><p>${dates}</p></div><div><p><strong>ПЕСНЯ ${first}</strong> Название песни</p></div><h1>${title}</h1></header>` +
        `<div><p>«Вымышленный ключевой стих»</p></div><div><p>1.</p><p>Первый абзац статьи.</p><h2>ПОДЗАГОЛОВОК</h2><p>Второй абзац.</p></div>` +
        `<div><p><strong>ПЕСНЯ ${last}</strong> Название другой песни</p></div>`,
    );
  const issueWt = await wt.parseWtFile(
    await issue({
      '2026640.xhtml': page(`<header><div><p>4—31 ЯНВАРЯ 2027</p></div><h1>Выпуск для изучения</h1></header>`),
      '2026642.xhtml': article('4—10 ЯНВАРЯ 2027 ГОДА', 'Первая вымышленная статья', 36, 159),
      '2026643.xhtml': article('11—17 ЯНВАРЯ 2027 ГОДА', 'Вторая вымышленная статья', 103, 109),
      '2026644.xhtml': page(`<header><h1>Статья не для изучения</h1></header><div><p>Текст.</p></div>`),
    }),
    2026,
    'w_U_202611.epub',
  );
  check('«Сторожевая башня»: две статьи для изучения, обложка и прочее — мимо', issueWt.weeks.map((w) => [w.weekStartDate, w.weekEndDate, w.articleTitle, w.openingSong, w.closingSong]), [
    ['2027-01-04', '2027-01-10', 'Первая вымышленная статья', 36, 159],
    ['2027-01-11', '2027-01-17', 'Вторая вымышленная статья', 103, 109],
  ]);
  const parts = sent(wt.wtToWorkbook(issueWt));
  check('и встреча в выходные, как уходит на сервер', parts, [
    ['weekend_chairman', 1, null, null],
    ['weekend_opening_song', 2, null, null],
    ['weekend_opening_prayer', 3, 1, null],
    ['public_talk_speaker', 4, 30, null],
    ['weekend_song', 5, null, 'Песня 36'],
    ['watchtower_conductor', 6, 60, 'Первая вымышленная статья'],
    ['watchtower_reader', 7, 60, null],
    ['weekend_closing_prayer', 8, 1, 'Песня 159 и молитва'],
  ]);
}

if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`\n${failures.length} из ${passed + failures.length} — чтение выпуска разошлось с ожидаемым`);
  process.exit(1);
}
console.log(`OK: ${passed} проверок чтения выпуска целиком (тетрадь двух вёрсток и «Сторожевая башня»).`);
