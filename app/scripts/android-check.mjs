#!/usr/bin/env node
/**
 * Проверка на телефоне Android через кабель — то, что обход (walkthrough)
 * проверяет в браузере, здесь смотрится на самом приложении.
 *
 *   node scripts/android-check.mjs            проверка C08 (плашки «Программы»)
 *
 * Что нужно: телефон подключён кабелем, включена «Отладка по USB», на
 * компьютере есть adb (`adb devices` показывает телефон как device), на
 * телефоне установлено приложение и выполнен вход. Путь к adb можно задать:
 * ADB=C:/platform-tools/adb.exe (из Git Bash годится и /c/platform-tools/…).
 *
 * ЧТО ОН ДЕЛАЕТ — только смотрит, листает и нажимает на плашки, ничего не
 * сохраняет. Открыта всегда одна встреча (решение 25 сентября); нажатая
 * плашка не должна сдвинуться. Два случая, как в обходе:
 *   1. открытая встреча выше ещё видна: нажимаю плашку под ней посередине
 *      экрана — плашка на месте и открылась, верхняя пока открыта; потом
 *      медленно листаю, пока верхняя не уйдёт, — она закрывается (это
 *      записано на видео linger.mp4: там видно, дёрнулось ли что-нибудь);
 *   2. открытая встреча выше уже ушла с экрана: нажимаю плашку у самого верха
 *      списка — верхняя закрывается сразу, а нажатая остаётся на месте.
 * Перед каждым случаем приложение открывается заново (закрывается и
 * запускается), чтобы начать с одной и той же ленты.
 *
 * В папке результата: снимки и разметка экрана (*.png, *.xml), видео tap1.mp4,
 * linger.mp4, tap2.mp4 и report.txt — эту папку и присылать.
 *
 * Координаты берутся из разметки экрана (uiautomator), а не на глаз: каждая
 * встреча в ленте помечена как meeting-<неделя>-<вид>.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PKG = process.env.PKG || 'com.backmann.mycongregation';
const LINK = process.env.LINK || 'mycongregation://schedule';
// Git Bash writes /c/platform-tools/adb.exe; Node on Windows needs C:/….
const ADB =
  process.platform === 'win32'
    ? (process.env.ADB || 'adb').replace(/^\/([a-zA-Z])\//, '$1:/')
    : process.env.ADB || 'adb';

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
const OUT = resolve(process.cwd(), '..', '..', 'congmap-android-check', stamp);
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
  if (r.error) fail(`не запускается adb (${r.error.message}). Установите Android platform-tools или укажите ADB=путь.`);
  if (r.status !== 0) fail(`adb ${args.join(' ')}: ${(r.stderr || '').toString().trim()}`);
  return r.stdout;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the screen as data -----------------------------------------------------
function dump(name) {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/cm-check.xml']);
  const xml = adb(['exec-out', 'cat', '/sdcard/cm-check.xml']);
  if (name) writeFileSync(join(OUT, `${name}.xml`), xml);
  const nodes = [];
  for (const m of xml.matchAll(/<node\b([^>]*)>?/g)) {
    const attr = (k) => (m[1].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1] ?? '';
    const b = attr('bounds').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    nodes.push({
      id: attr('resource-id').replace(/^.*:id\//, ''),
      cls: attr('class'),
      clickable: attr('clickable') === 'true',
      scrollable: attr('scrollable') === 'true',
      x1, y1, x2, y2, h: y2 - y1,
    });
  }
  return nodes;
}
const meetings = (nodes) =>
  nodes.filter((n) => /^meeting-\d{4}-\d{2}-\d{2}-/.test(n.id)).sort((a, b) => a.y1 - b.y1);
const find = (nodes, id) => nodes.find((n) => n.id === id);
// The header of a meeting row: the topmost pressable inside it.
const headerOf = (nodes, row) =>
  nodes
    .filter((n) => n.clickable && n.y1 >= row.y1 && n.y2 <= row.y2 && n.x1 >= row.x1 && n.x2 <= row.x2)
    .sort((a, b) => a.y1 - b.y1)[0];
// The feed's list: the tallest vertical scroller on screen.
const listOf = (nodes) =>
  nodes.filter((n) => n.scrollable && n.h > H * 0.3).sort((a, b) => b.h - a.h)[0];
function shot(name) {
  writeFileSync(join(OUT, `${name}.png`), adb(['exec-out', 'screencap', '-p'], { binary: true }));
}
function record(name, seconds) {
  const p = spawn(ADB, ['shell', 'screenrecord', '--time-limit', String(seconds), `/sdcard/cm-${name}.mp4`]);
  // Listened for from the start: the recording may end before we ask.
  const done = new Promise((r) => p.on('exit', r));
  return async () => {
    await done;
    await sleep(1200);
    writeFileSync(join(OUT, `${name}.mp4`), adb(['exec-out', 'cat', `/sdcard/cm-${name}.mp4`], { binary: true }));
  };
}

// ---- run --------------------------------------------------------------------
const devices = adb(['devices'])
  .split('\n')
  .slice(1)
  .filter((l) => /\sdevice\s*$/.test(l));
if (devices.length === 0) fail('телефон не виден: `adb devices` не показывает ни одного device (кабель, «Отладка по USB», разрешение на телефоне).');
if (devices.length > 1) fail('подключено несколько устройств — оставьте одно.');
const size = adb(['shell', 'wm', 'size']).match(/(\d+)x(\d+)\s*$/m);
const [W, H] = size ? [Number(size[1]), Number(size[2])] : [1080, 2400];
const model = adb(['shell', 'getprop', 'ro.product.model']).trim();
const android = adb(['shell', 'getprop', 'ro.build.version.release']).trim();
say(`Телефон: ${model}, Android ${android}, экран ${W}×${H}`);
say(`Дата проверки: ${now.toLocaleString('ru-RU')}`);
say('');

const x = Math.round(W / 2);
let nodes = [];
// Slow and short: a flick would keep the list gliding after the finger lifts.
async function swipe(d) {
  const y0 = Math.round(H * 0.6 + d / 2);
  adb(['shell', 'input', 'swipe', String(x), String(y0), String(x), String(Math.round(y0 - d)), '1200']);
  await sleep(1300);
  nodes = dump();
}

/** Opens the feed afresh and finds the open meeting and the one after it. */
async function landOnFeed(tag) {
  adb(['shell', 'am', 'force-stop', PKG]);
  await sleep(800);
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', LINK, PKG]);
  await sleep(8000);
  nodes = dump();
  if (meetings(nodes).length === 0) {
    dump(`${tag}-no-meetings`);
    shot(`${tag}-no-meetings`);
    fail('на экране не найдено ни одной встречи (meeting-…). Снимок и разметка — *-no-meetings: пришлите их.');
  }
  // The open card is the tallest meeting row; the one to tap is the meeting
  // right after it. On a tall phone the open card can fill the whole screen,
  // so the next one is found by its id — ids sort in date order, weekday
  // before weekend — scrolling down until it shows.
  const ms = meetings(nodes);
  const open = ms.reduce((a, b) => (b.h > a.h ? b : a), ms[0]);
  const after = (ns) => meetings(ns).map((n) => n.id).filter((id) => id > open.id).sort()[0];
  let target = after(nodes);
  for (let i = 0; !target && i < 8; i++) {
    await swipe(H * 0.3);
    target = after(nodes);
  }
  if (!target) fail(`под открытой встречей (${open.id}) не нашлось следующей и после прокрутки.`);
  return { upper: open.id, target };
}

/** Scrolls until the target's top is within `tol` of `want` (px on screen). */
async function place(id, want, tol) {
  for (let i = 0; i < 12; i++) {
    const t = find(nodes, id);
    if (t && Math.abs(t.y1 - want) <= tol) return t;
    const from = t ? t.y1 : H * 0.8;
    await swipe(Math.max(-H * 0.35, Math.min(H * 0.35, from - want)));
  }
  return find(nodes, id);
}

async function tapAndWatch(tag, id) {
  nodes = dump(`${tag}-before`);
  const before = find(nodes, id);
  const head = before && headerOf(nodes, before);
  if (!head) fail(`у плашки ${id} не найден заголовок на экране.`);
  shot(`${tag}-before`);
  const stop = record(tag, 5);
  await sleep(1200);
  adb(['shell', 'input', 'tap', String(Math.round((head.x1 + head.x2) / 2)), String(Math.round((head.y1 + head.y2) / 2))]);
  await stop();
  nodes = dump(`${tag}-after`);
  shot(`${tag}-after`);
  return { before, after: find(nodes, id) };
}


/**
 * Scrolls back up to a card and reports whether it is closed: seen whole on
 * the screen and no taller than a collapsed row. A card cut by the top or the
 * bottom of the list is not judged by its visible part.
 */
async function closedAbove(id) {
  for (let i = 0; i < 8; i++) {
    const n = find(nodes, id);
    const list = listOf(nodes);
    if (n && list && n.y1 > list.y1 + 2) {
      const whole = n.y2 < list.y2 - 2;
      return { found: true, closed: whole && n.h < H * 0.3, h: n.h, whole };
    }
    await swipe(-Math.round(H * 0.2));
  }
  return { found: false, closed: false, h: 0, whole: false };
}

let bad = 0;
const ok = (cond, good, wrong) => {
  if (cond) say(`✅ ${good}`);
  else {
    say(`❌ ${wrong}`);
    bad++;
  }
};

// ---- case 1: the open card above is still partly on screen ------------------
say('— Случай 1: открытая встреча выше ещё видна —');
{
  const { upper, target } = await landOnFeed('c1');
  say(`Открыта: ${upper}, нажимаю: ${target}`);
  await place(target, Math.round(H * 0.45), Math.round(H * 0.08));
  const upBefore = find(nodes, upper);
  if (!upBefore) say(`· ${upper} не видна над ${target} — случай 1 здесь не получится, смотрите случай 2`);
  const { before, after } = await tapAndWatch('tap1', target);
  const upAfter = find(nodes, upper);
  say(`До: верх ${target} на ${before.y1} px; после: ${after ? after.y1 : 'нет на экране'} px, видимая высота ${before.h} → ${after ? after.h : 0}`);
  ok(after && Math.abs(after.y1 - before.y1) <= 3, `плашка на месте (${before.y1} → ${after?.y1})`, `плашка сдвинулась: ${before.y1} → ${after ? after.y1 : 'ушла с экрана'}`);
  ok(after && after.h > before.h, 'нажатая открылась', 'нажатая не открылась');
  if (upBefore)
    ok(
      upAfter && Math.abs(upAfter.y1 - upBefore.y1) <= 3 && Math.abs(upAfter.y2 - upBefore.y2) <= 3,
      `верхняя (${upper}) пока открыта и на месте — закроется, когда уйдёт`,
      `верхняя (${upper}) изменилась, пока была видна`,
    );

  // Scroll on slowly until the upper card has left; it closes then. The
  // numbers below are the target's place after each step; the video shows
  // every frame in between.
  const stop = record('linger', 12);
  await sleep(1000);
  const path = [];
  for (let i = 0; i < 6; i++) {
    await swipe(Math.round(H * 0.12));
    const t = find(nodes, target);
    path.push(t ? t.y1 : 'нет');
    if (!find(nodes, upper)) break;
  }
  await stop();
  nodes = dump('linger-after');
  shot('linger-after');
  say(`Прокрутка до ухода верхней: верх ${target} по шагам — ${path.join(' → ')} px (видео linger.mp4)`);
  // Back up to see that the upper card is closed now.
  const up = await closedAbove(upper);
  ok(up.closed, `верхняя (${upper}) закрылась, когда ушла с экрана`, `верхняя (${upper}) не закрылась${up.found ? ` (видно ${up.h} px${up.whole ? '' : ', не целиком'})` : ' или не найдена'}`);
}
say('');

// ---- case 2: the open card above has already left the screen ---------------
say('— Случай 2: открытая встреча выше уже ушла с экрана —');
{
  const { upper, target } = await landOnFeed('c2');
  say(`Открыта: ${upper}, нажимаю: ${target}`);
  let list = listOf(nodes);
  const top = list ? list.y1 : Math.round(H * 0.2);
  // First near the top of the list, then in small steps until the card above
  // is entirely out of sight. The target's top is then hidden too (the two
  // touch), so its place is read from the BOTTOM of its header.
  await place(target, top + 200, 80);
  // Just enough each time to take off what is still seen of the card above
  // (its bottom edge down to the top of the list), plus the finger's slack.
  // A swipe by the card's whole height would carry the target away too
  // (25 September, S24: the header ended up above the list).
  for (let i = 0; i < 14; i++) {
    const u = find(nodes, upper);
    const l = listOf(nodes);
    if (!u || u.h <= 1 || !l) break;
    await swipe(Math.max(60, Math.min(u.y2 - l.y1 + 40, Math.round(H * 0.2))));
  }
  list = listOf(nodes);
  const upSeen = find(nodes, upper);
  if (upSeen && upSeen.h > 1) say(`· ${upper} ещё видна (${upSeen.h} px) — тогда она закроется позже, как в случае 1`);
  nodes = dump('tap2-before');
  const row = find(nodes, target);
  const head = row && headerOf(nodes, row);
  if (!head || head.h < 40) fail(`заголовок ${target} не виден у верха списка — запустите ещё раз.`);
  shot('tap2-before');
  const stop = record('tap2', 5);
  await sleep(1200);
  adb(['shell', 'input', 'tap', String(Math.round((head.x1 + head.x2) / 2)), String(Math.round((Math.max(head.y1, list ? list.y1 : 0) + head.y2) / 2))]);
  await stop();
  nodes = dump('tap2-after');
  shot('tap2-after');
  const rowAfter = find(nodes, target);
  const headAfter = rowAfter && headerOf(nodes, rowAfter);
  say(`До: низ заголовка ${target} на ${head.y2} px; после: ${headAfter ? headAfter.y2 : 'нет на экране'} px`);
  ok(headAfter && Math.abs(headAfter.y2 - head.y2) <= 3, `плашка на месте (${head.y2} → ${headAfter?.y2})`, `плашка сдвинулась: ${head.y2} → ${headAfter ? headAfter.y2 : 'ушла с экрана'}`);
  ok(rowAfter && rowAfter.h > row.h, 'нажатая открылась', 'нажатая не открылась');
  // Look above: the upper card must be closed.
  const up = await closedAbove(upper);
  ok(up.closed, `верхняя (${upper}) закрылась сразу`, `верхняя (${upper}) открыта${up.found ? ` (видно ${up.h} px${up.whole ? '' : ', не целиком'})` : ' или не найдена'}`);
}

say('');
say(bad ? `Итог: ошибок ${bad}. Пришлите папку целиком.` : 'Итог: всё верно. Пришлите папку целиком — видео тоже посмотрю.');
finish(bad ? 1 : 0);
