#!/usr/bin/env node
/**
 * Работа 11–13 октября 2026 на телефоне Android: перенос и отмена встречи
 * для проповеди, «программа стала записью» через неделю после встречи,
 * исправление задним числом, журнал.
 *
 *   ADB=C:/platform-tools/adb.exe node scripts/android-changes.mjs
 *
 * НИЧЕГО НЕ СОХРАНЯЕТ. Окна открываются, снимаются и закрываются кнопкой
 * «Назад» или «Отмена». «Сохранить», «Опубликовать», «Вернуть встречу» не
 * нажимаются. «Отменить встречу» нажимается ровно один раз — он только
 * раскрывает панель с причиной; кнопка подтверждения в панели не нажимается.
 * «Исправить задним числом» открывает подтверждение, в нём — «Отмена».
 *
 * Недели берутся от сегодняшнего дня: позапрошлая (её программа точно
 * стала записью) и прошлая (запись или «можно поправить до» — смотря по
 * дню недели). Итог — report.txt; папку присылать архивом.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PKG = process.env.PKG || 'com.backmann.mycongregation';
const ADB =
  process.platform === 'win32'
    ? (process.env.ADB || 'adb').replace(/^\/([a-zA-Z])\//, '$1:/')
    : process.env.ADB || 'adb';

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
const OUT = resolve(process.cwd(), '..', '..', 'congmap-android-screens', `changes-${stamp}`);
mkdirSync(OUT, { recursive: true });
const log = [];
const say = (s) => {
  console.log(s);
  log.push(s);
};
const finish = (code) => {
  writeFileSync(join(OUT, 'report.txt'), log.join('\n') + '\n');
  console.log(`\nПапка результата: ${OUT}`);
  process.exit(code);
};
const fail = (s) => {
  say(`❌ ${s}`);
  finish(1);
};
function adb(args, { binary = false } = {}) {
  const r = spawnSync(ADB, args, { encoding: binary ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) fail(`не запускается adb (${r.error.message}). Укажите ADB=путь.`);
  if (r.status !== 0) fail(`adb ${args.join(' ')}: ${(r.stderr || '').toString().trim()}`);
  return r.stdout;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The screen's markup — or nothing. uiautomator refuses while anything on
 * screen keeps moving («could not get idle state»), and the first two runs
 * then read the PREVIOUS dump from the file and acted on a screen that was
 * no longer there. The file is removed before each try, the tool's own
 * answer is checked, and a failure is reported as one, never papered over.
 */
let stale = 0;
function dump(name) {
  let xml = '';
  for (let i = 0; i < 4 && !xml.includes('<hierarchy'); i++) {
    spawnSync(ADB, ['shell', 'rm', '-f', '/sdcard/cm-ch.xml'], { encoding: 'utf8' });
    const r = spawnSync(ADB, ['shell', 'uiautomator', 'dump', '/sdcard/cm-ch.xml'], { encoding: 'utf8' });
    if (!/dumped to/i.test(String(r.stdout) + String(r.stderr))) continue;
    xml = adb(['exec-out', 'cat', '/sdcard/cm-ch.xml']);
  }
  if (!xml.includes('<hierarchy')) {
    stale += 1;
    say(`⚠️  разметка экрана не прочиталась${name ? ` (${name})` : ''} — экран не успокаивается`);
  }
  if (name) writeFileSync(join(OUT, `${name}.xml`), xml);
  const nodes = [];
  for (const m of xml.matchAll(/<node\b([^>]*)>?/g)) {
    const attr = (k) => (m[1].match(new RegExp(`(?:^|\\s)${k}="([^"]*)"`)) || [])[1] ?? '';
    const b = attr('bounds').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    const un = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#10;/g, '\n');
    nodes.push({
      text: un(attr('text') || attr('content-desc')),
      cls: attr('class'),
      scrollable: attr('scrollable') === 'true',
      x1, y1, x2, y2, h: y2 - y1,
    });
  }
  return nodes;
}
const shot = (name) =>
  writeFileSync(join(OUT, `${name}.png`), adb(['exec-out', 'screencap', '-p'], { binary: true }));

const devices = adb(['devices']).split('\n').slice(1).filter((l) => /\sdevice\s*$/.test(l));
if (devices.length === 0) fail('телефон не виден: `adb devices` не показывает ни одного device.');
if (devices.length > 1) fail('подключено несколько устройств — оставьте одно.');
const size = adb(['shell', 'wm', 'size']).match(/(\d+)x(\d+)\s*$/m);
const [W, H] = size ? [Number(size[1]), Number(size[2])] : [1080, 2400];
say(`Телефон: ${adb(['shell', 'getprop', 'ro.product.model']).trim()}, экран ${W}×${H}`);
say(`Дата: ${now.toLocaleString('ru-RU')}`);

// Animations off for the run: the app follows the device's «reduce motion»
// (React Native reads transition_animation_scale == 0), so the breathing
// rows stand still and uiautomator can read the screen. Put back at the end.
const SCALES = ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'];
const savedScales = SCALES.map((k) => adb(['shell', 'settings', 'get', 'global', k]).trim());
for (const k of SCALES) adb(['shell', 'settings', 'put', 'global', k, '0']);
const restoreScales = () => {
  SCALES.forEach((k, i) => {
    const v = savedScales[i] === 'null' || savedScales[i] === '' ? '1' : savedScales[i];
    spawnSync(ADB, ['shell', 'settings', 'put', 'global', k, v], { encoding: 'utf8' });
  });
};
process.on('exit', restoreScales);
say(`Анимации на время прогона выключены (было: ${savedScales.join(' / ')})`);

const tapNode = (n) =>
  adb(['shell', 'input', 'tap', String(Math.round((n.x1 + n.x2) / 2)), String(Math.round((n.y1 + n.y2) / 2))]);
const back = async () => {
  adb(['shell', 'input', 'keyevent', '4']);
  await sleep(1200);
};
const swipeUp = async () => {
  adb(['shell', 'input', 'swipe', String(W / 2), String(Math.round(H * 0.75)), String(W / 2), String(Math.round(H * 0.3)), '600']);
  await sleep(1300);
};
/**
 * Wait until a text is on screen (the phone draws a screen in one to ten
 * seconds, and the first run read the previous screen at 4.5 s flat).
 */
const waitFor = async (re, ms = 15000) => {
  const until = Date.now() + ms;
  let ns = [];
  while (Date.now() < until) {
    ns = dump();
    const later = ns.find((x) => x.text === 'Позже' && x.h > 0);
    if (later) {
      tapNode(later);
      await sleep(1500);
      continue;
    }
    if (ns.some((x) => x.h > 0 && re.test(x.text))) return ns;
    await sleep(1000);
  }
  return null;
};
const open = async (path, until) => {
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `mycongregation:/${path}`, PKG]);
  await sleep(2500);
  if (!(await waitFor(until))) say(`⚠️  ${path}: не дождался «${until}»`);
  await sleep(800);
};

let n = 0;
const BROKEN = /Что-то пошло не так|Something went wrong|Unmatched Route|Не удалось загрузить|Ошибка загрузки/i;
const findings = [];
/** Snap the screen as it is: picture, markup, a second picture lower down. */
async function snap(label, { scroll = true } = {}) {
  n += 1;
  const name = `${pad(n)}-${label}`;
  const ns = dump(name);
  shot(name);
  const texts = ns.filter((x) => x.text && x.h > 0 && x.y2 > 0 && x.y1 < H);
  const problems = [];
  const broken = texts.find((x) => BROKEN.test(x.text));
  if (broken) problems.push(`на экране: «${broken.text.slice(0, 80)}»`);
  const sideways = ns.filter((x) => /HorizontalScrollView/.test(x.cls) && x.h > 0);
  const inSideways = (x) => sideways.some((r) => x.y1 >= r.y1 - 2 && x.y2 <= r.y2 + 2);
  const out = texts.filter((x) => (x.x2 > W + 2 || x.x1 < -2) && !inSideways(x));
  if (out.length) problems.push(`за краем экрана: ${out.slice(0, 3).map((x) => `«${x.text.slice(0, 30)}» [${x.x1}..${x.x2}]`).join(', ')}`);
  // Two things drawn over each other: the month chips under «Подготовить месяц».
  const prep = texts.find((x) => x.text === 'Подготовить месяц');
  if (prep) {
    // The button's own nodes are not «under» it: the pressable around the
    // words (no text of its own, or the same words as its label) and any
    // ancestor that contains it whole. Two runs reported exactly those
    // (13 October 2026) while the chips sat clean beside the button.
    const contains = (o, i) => o.x1 <= i.x1 && o.y1 <= i.y1 && o.x2 >= i.x2 && o.y2 >= i.y2;
    const under = texts.filter(
      (x) =>
        x !== prep &&
        x.text.trim() !== '' &&
        x.text !== prep.text &&
        !contains(x, prep) &&
        // The «+» glyph is drawn INSIDE the button (run of 13 October 2026).
        !contains(prep, x) &&
        x.y1 < prep.y2 && x.y2 > prep.y1 && x.x2 > prep.x1 && x.x1 < prep.x2,
    );
    if (under.length) problems.push(`под кнопкой «Подготовить месяц»: ${under.map((x) => `«${x.text}»`).join(', ')}`);
  }
  if (scroll) {
    const list = ns.filter((x) => x.scrollable && x.h > H * 0.3).sort((a, b) => b.h - a.h)[0];
    if (list) {
      await swipeUp();
      shot(`${name}-2`);
    }
  }
  const top = texts.slice(0, 5).map((x) => x.text.replace(/\n/g, ' ').slice(0, 40)).join(' | ');
  say(`${problems.length ? '❌' : '✅'} ${label}${problems.length ? ' — ' + problems.join('; ') : ''}`);
  say(`     ${top}`);
  if (problems.length) findings.push(`${label}: ${problems.join('; ')}`);
  return ns;
}
/** Tap the first visible node whose text matches; false when none is there. */
async function tap(re, what, wait = 1800, { right = false } = {}) {
  let hit = null;
  for (let i = 0; i < 8 && !hit; i++) {
    const ns = dump();
    hit = ns.find((x) => x.h > 0 && x.y1 >= 0 && x.y2 <= H && re.test(x.text) && (!right || x.x1 > W * 0.7));
    if (!hit) await sleep(1000);
  }
  if (!hit) {
    say(`⚠️  не нашёл «${what}» — пропускаю`);
    findings.push(`не найдено на экране: «${what}»`);
    return false;
  }
  tapNode(hit);
  await sleep(wait);
  return true;
}


adb(['shell', 'am', 'force-stop', PKG]);
await sleep(800);

const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monday = new Date(now);
monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
const weekBack = (k) => {
  const d = new Date(monday);
  d.setDate(monday.getDate() - 7 * k);
  return iso(d);
};
const FROZEN_WEEK = weekBack(2);
const LAST_WEEK = weekBack(1);
const has = (ns, re) => ns.some((x) => x.h > 0 && x.y1 < H && re.test(x.text));
const expect = (ok, what) => {
  say(`   ${ok ? '✓' : '✗'} ${what}`);
  if (!ok) findings.push(`ожидалось: ${what}`);
};
const SHEET = /^(Снять назначение|Сохранить|Назначить|Выбрать возвещателя)$/;
const FROZEN = /стала записью/;
const GRACE = /можно поправить до/;
const WEEK_READY = /^Встреча в будний день$|^Встреча в выходной день$/;

/** The week's notes; when the meeting's block is folded, open it once. */
async function weekNotes(week, label) {
  await open(`/schedule/edit?week=${week}`, WEEK_READY);
  let ns = dump();
  if (!has(ns, FROZEN) && !has(ns, GRACE)) {
    await tap(/^Встреча в будний день$/, 'блок «Встреча в будний день»', 1500);
    ns = dump();
  }
  ns = await snap(label, { scroll: false });
  return ns;
}

// ── 1. Позапрошлая неделя: программа стала записью ───────────────────
say(`Неделя-запись: ${FROZEN_WEEK}, прошлая неделя: ${LAST_WEEK}`);
let ns = await weekNotes(FROZEN_WEEK, 'frozen-week');
expect(has(ns, FROZEN), '«…программа стала записью, изменить её нельзя»');
const mayFix = has(ns, /^Исправить задним числом$/);
say(`   кнопка «Исправить задним числом»: ${mayFix ? 'есть' : 'нет'} (есть только у администратора и координатора совета)`);
// A part of a frozen week opens nothing.
// The first parts on screen (the live run of 13 October found no «Чтение
// Библии» there: it sits lower).
if (await tap(/^(Вступительная молитва|Председатель встречи|Председатель)$/, 'часть программы')) {
  ns = await snap('frozen-part-tap', { scroll: false });
  const opened = has(ns, SHEET);
  expect(!opened, 'нажатие на часть ничего не открывает');
  if (opened) await back();
}
// The correction's confirmation — and «Отмена».
if (mayFix) {
  await open(`/schedule/edit?week=${FROZEN_WEEK}`, WEEK_READY);
  if (await tap(/^Исправить задним числом$/, '«Исправить задним числом»', 1500)) {
    ns = await snap('fix-confirm', { scroll: false });
    expect(has(ns, /^Исправить программу задним числом\?$/), 'окно «Исправить программу задним числом?»');
    if (await tap(/^(Отмена|ОТМЕНА)$/, '«Отмена» в подтверждении', 1500)) {
      ns = await snap('fix-cancelled', { scroll: false });
      expect(!has(ns, /без уведомлений/), 'после «Отмена» неделя осталась закрытой');
    }
  }
}

// ── 2. Прошлая неделя: «можно поправить до …» или уже запись ──────────
ns = await weekNotes(LAST_WEEK, 'last-week');
const grace = has(ns, GRACE);
const frozen = has(ns, FROZEN);
expect(grace || frozen, 'над встречей строка «можно поправить до …» или «стала записью»');
say(`   прошлая неделя: ${grace ? 'ещё можно поправить' : frozen ? 'уже запись' : '—'}`);

// ── 3. Текущая неделя: ни той ни другой строки ───────────────────────
await open('/schedule/edit', WEEK_READY);
ns = await snap('this-week', { scroll: false });
expect(!has(ns, FROZEN) && !has(ns, /^Исправить задним числом$/), 'текущая неделя открыта, без «стала записью»');

// ── 4. Встречи для проповеди: перенос и отмена (без сохранения) ──────
const MONTH = /^Подготовить месяц$|^Добавить встречу$|^Ведёт /;
const ROW = /^(Ведёт |Ведущий не назначен)/;
/**
 * The month from a clean start. A deep link to the screen already open
 * leaves an open sheet in place, and the live run of 13 October then looked
 * for the month under it twice and found nothing.
 */
async function freshMonth() {
  adb(['shell', 'am', 'force-stop', PKG]);
  await sleep(800);
  await open('/cart/field-service', MONTH);
}
/**
 * A meeting still ahead: the month lists its past days first, so scroll
 * once and take the LAST meeting row on screen.
 */
async function tapFutureRow() {
  await swipeUp();
  const rows = dump().filter((x) => x.h > 0 && x.y1 >= 0 && x.y2 <= H && ROW.test(x.text));
  if (!rows.length) {
    say('⚠️  не нашёл строку встречи — пропускаю');
    findings.push('не найдено на экране: строка встречи');
    return false;
  }
  tapNode(rows[rows.length - 1]);
  await sleep(1800);
  return true;
}

await freshMonth();
ns = await snap('month');
say(`   отменённые встречи в месяце: ${has(ns, /^Отменена/) ? 'есть' : 'нет на первом экране'}`);
if (await tapFutureRow()) {
  // No scroll before the tap: the snap's own swipe moved «Другая неделя»
  // off the screen in the live run of 13 October.
  ns = await snap('meeting-sheet', { scroll: false });
  const other = has(ns, /^Другая неделя$/);
  say(`   «Другая неделя»: ${other ? 'есть' : 'нет (прошедшая или черновик?)'}`);
  if (other && (await tap(/^Другая неделя$/, '«Другая неделя»', 1500))) {
    await snap('move-calendar', { scroll: false });
    await back();
  }
  await swipeUp();
  await snap('meeting-sheet-lower', { scroll: false });
}
await freshMonth();
if (await tapFutureRow()) {
  // The cancel button sits low in the sheet.
  let found = null;
  for (let i = 0; i < 4 && !found; i++) {
    // Only above the sheet's foot: a button scrolled behind «Отмена /
    // Сохранить» is still listed, and a tap there would land on «Сохранить».
    const ns2 = dump();
    const foot = Math.min(H, ...ns2.filter((x) => x.h > 0 && /^(Сохранить|Отмена)$/.test(x.text)).map((x) => x.y1 - 20));
    found = ns2.find((x) => x.h > 0 && x.y1 > 0 && x.y2 <= foot && x.text === 'Отменить встречу');
    if (!found) await swipeUp();
  }
  if (found) {
    tapNode(found); // ONE tap: it only opens the panel
    await sleep(1500);
    await swipeUp();
    ns = await snap('cancel-panel', { scroll: false });
    expect(has(ns, /^Не отменять$/), 'панель отмены с «Не отменять»');
    // Leave by «Назад», never by the panel's own button.
    await back();
  } else {
    say('   «Отменить встречу» нет (встреча прошедшая или черновик)');
  }
}
// A cancelled meeting, when the month has one on screen.
await freshMonth();
if (has(dump(), /^Отменена/)) {
  await tap(/^Отменена/, 'отменённая встреча');
  ns = await snap('cancelled-sheet');
  expect(has(ns, /^Вернуть встречу$/) || has(ns, /Встреча отменена/), 'отменённая встреча: причина и «Вернуть встречу»');
  await back();
}

// ── 5. Лента «Проповедь» и главная ───────────────────────────────────
await open('/schedule', /^Проповедь$/);
if (await tap(/^Проповедь$/, 'чип «Проповедь»')) await snap('feed-field');
await open('/home', /^Две недели|^Ваше ближайшее/i);
await snap('home');

// ── 6. Журнал изменений ─────────────────────────────────────────────
await open('/profile/journal', /^Журнал изменений$/);
await snap('journal');

say('');
say(`Шагов: ${n}, с находками: ${findings.length}${stale ? `, разметка не прочиталась ${stale} раз` : ''}`);
for (const f of findings) say(`  ${f}`);
finish(0);
