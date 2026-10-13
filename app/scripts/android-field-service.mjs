#!/usr/bin/env node
/**
 * Встречи для проповеди на телефоне Android (11 октября 2026) — обход ВСЕХ
 * экранов и окон раздела с нажатиями, которых android-screens не делает:
 * открыть день в ленте, встречу на странице месяца, «Подготовить месяц»,
 * «Изменить шаблон встреч», «Автоматически», лист на печать, форму новой
 * встречи, раздел недели в «Составлении программы».
 *
 *   ADB=C:/platform-tools/adb.exe node scripts/android-field-service.mjs
 *
 * НИЧЕГО НЕ СОХРАНЯЕТ: окна открываются, снимаются и закрываются кнопкой
 * «Назад»; ни одна кнопка «Сохранить», «Создать», «Опубликовать» не нажимается.
 * Единственное нажатие в данных — «Позже» на окне проверки контактов.
 *
 * На каждом шаге: снимок NN-имя.png, при длинном экране — NN-имя-2.png после
 * прокрутки, и разметка NN-имя.xml. Итог — report.txt. Всю папку присылать
 * архивом, как для android-screens.
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
const OUT = resolve(process.cwd(), '..', '..', 'congmap-android-screens', `field-service-${stamp}`);
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
    spawnSync(ADB, ['shell', 'rm', '-f', '/sdcard/cm-fs.xml'], { encoding: 'utf8' });
    const r = spawnSync(ADB, ['shell', 'uiautomator', 'dump', '/sdcard/cm-fs.xml'], { encoding: 'utf8' });
    if (!/dumped to/i.test(String(r.stdout) + String(r.stderr))) continue;
    xml = adb(['exec-out', 'cat', '/sdcard/cm-fs.xml']);
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
    const under = texts.filter((x) => x !== prep && x.y1 < prep.y2 && x.y2 > prep.y1 && x.x2 > prep.x1 && x.x1 < prep.x2);
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

// ── Главная ────────────────────────────────────────────────────────────
await open('/home', /^Две недели|^Ваше ближайшее/i);
await snap('home');

// ── Программа: фильтр «Проповедь», открытый день ──────────────────────
await open('/schedule', /^Проповедь$/);
await snap('programme-all', { scroll: false });
if (await tap(/^Проповедь$/, 'чип «Проповедь»')) {
  await snap('programme-field');
  await open('/schedule', /^Проповедь$/);
  await tap(/^Проповедь$/, 'чип «Проповедь»');
  // The kind line above a row's title is the row itself.
  if (await tap(/^Проповедь · \d/, 'строка дня проповеди')) await snap('programme-field-open');
}

// ── Служение → Встречи для проповеди ──────────────────────────────────
await open('/cart', /^Встречи для проповеди$/);
await snap('cart', { scroll: false });
const MONTH = /^Подготовить месяц$|^Добавить встречу$|^Ведёт /;
await open('/cart/field-service', MONTH);
await snap('month');
// A meeting: its conductor line is the row.
if (await tap(/^(Ведёт |Ведущий не назначен)/, 'строка встречи')) {
  await snap('meeting-sheet');
  await back();
}
// A new meeting, opened and closed empty.
await open('/cart/field-service', MONTH);
if (await tap(/^Добавить встречу$/, '«Добавить встречу»')) {
  await snap('meeting-new');
  await back();
}
// The printed sheet's dialog (its button is the icon in the header).
await open('/cart/field-service', MONTH);
if (await tap(/^Встречи для проповеди$/, 'значок листа на печать (шапка)', 1800, { right: true })) {
  await snap('pdf-dialog', { scroll: false });
  await back();
}
// Prepare → template → rule → automatic.
await open('/cart/field-service', MONTH);
if (await tap(/^Подготовить месяц$/, '«Подготовить месяц»')) {
  await snap('prepare');
  if (await tap(/^Изменить шаблон встреч$/, '«Изменить шаблон встреч»')) {
    await snap('template');
    if (await tap(/^Добавить встречу в шаблон$/, '«Добавить встречу в шаблон»')) {
      await snap('rule-new');
      await back();
    }
    if (await tap(/^Автоматически$/, '«Автоматически»')) {
      await snap('auto');
      await back();
    }
    await back();
  }
  await back();
}

// ── Составление программы → неделя → встречи для проповеди ────────────
await open('/schedule/edit', /^Встречи для проповеди$/);
if (await tap(/^Встречи для проповеди$/, 'раздел «Встречи для проповеди» в неделе')) {
  // The section's header sits at the foot of the screen, so its lines open
  // BELOW the edge — and uiautomator lists what is on screen only. Scroll
  // down first, then look; the three runs before this one looked without
  // scrolling, saw nothing, tapped again and closed what had just opened.
  const OPENED = /^(Добавить встречу|Ведёт |Ведущий не назначен)/;
  await sleep(1500);
  await swipeUp();
  if (!(await waitFor(OPENED, 5000))) {
    // Not open after all (or it was open and the tap closed it): once more.
    adb(['shell', 'input', 'swipe', String(W / 2), String(Math.round(H * 0.3)), String(W / 2), String(Math.round(H * 0.75)), '600']);
    await sleep(1200);
    await tap(/^Встречи для проповеди$/, 'раздел «Встречи для проповеди» в неделе');
    await sleep(1500);
    await swipeUp();
    if (!(await waitFor(OPENED, 5000))) say('⚠️  раздел недели так и не раскрылся');
  }
  await snap('edit-week-field', { scroll: false });
}

// ── Служебный старейшина, задачи ──────────────────────────────────────
await open('/cart/service-overseer', /^Служебный год/);
await snap('service-overseer');
await open('/tasks', /^Открытые/);
await snap('tasks');

say('');
say(`Шагов: ${n}, с находками: ${findings.length}${stale ? `, разметка не прочиталась ${stale} раз` : ''}`);
for (const f of findings) say(`  ${f}`);
finish(0);
