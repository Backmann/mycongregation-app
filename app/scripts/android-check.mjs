#!/usr/bin/env node
/**
 * Проверка на телефоне Android через кабель — то, что обход (walkthrough)
 * проверяет в браузере, здесь смотрится на самом приложении.
 *
 *   node scripts/android-check.mjs            проверка C08 (плашки «Программы»)
 *
 * Что нужно: телефон подключён кабелем, включена «Отладка по USB», на
 * компьютере есть adb (`adb devices` показывает телефон как device), на
 * телефоне установлено приложение и выполнен вход.
 *
 * ЧТО ОН ДЕЛАЕТ — только смотрит и нажимает на плашки, ничего не сохраняет:
 *   1. открывает приложение на «Программе»;
 *   2. находит открытую встречу и плашку ПОД ней, прокручивает так, чтобы
 *      эта плашка стояла посередине экрана;
 *   3. записывает видео экрана и нажимает на неё;
 *   4. сравнивает, где плашка была до нажатия и где стоит после, и считает,
 *      сколько встреч открыто.
 * В папке результата: before.png, after.png, tap.mp4 (видео нажатия),
 * before.xml, after.xml (разметка экрана с координатами) и report.txt —
 * эту папку и присылать.
 *
 * Координаты берутся из разметки экрана (uiautomator), а не на глаз: каждая
 * встреча в ленте помечена как meeting-<неделя>-<вид>.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PKG = process.env.PKG || 'com.backmann.mycongregation';
const LINK = process.env.LINK || 'mycongregation://schedule';
const ADB = process.env.ADB || 'adb';

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
      text: attr('text') || attr('content-desc'),
      clickable: attr('clickable') === 'true',
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
function shot(name) {
  writeFileSync(join(OUT, `${name}.png`), adb(['exec-out', 'screencap', '-p'], { binary: true }));
}

// ---- run --------------------------------------------------------------------
const devices = adb(['devices'])
  .split('\n')
  .slice(1)
  .filter((l) => /\tdevice$/.test(l.trim()) || /\sdevice$/.test(l));
if (devices.length === 0) fail('телефон не виден: `adb devices` не показывает ни одного device (кабель, «Отладка по USB», разрешение на телефоне).');
if (devices.length > 1) fail('подключено несколько устройств — оставьте одно.');
const size = adb(['shell', 'wm', 'size']).match(/(\d+)x(\d+)\s*$/m);
const [W, H] = size ? [Number(size[1]), Number(size[2])] : [1080, 2400];
const model = adb(['shell', 'getprop', 'ro.product.model']).trim();
const android = adb(['shell', 'getprop', 'ro.build.version.release']).trim();
say(`Телефон: ${model}, Android ${android}, экран ${W}×${H}`);
say(`Дата проверки: ${now.toLocaleString('ru-RU')}`);
say('');

adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', LINK, PKG]);
await sleep(6000);

let nodes = dump();
if (meetings(nodes).length === 0) {
  // Someone signed out, a dialog on top, or the markers are not in the dump.
  dump('no-meetings');
  shot('no-meetings');
  fail('на экране не найдено ни одной встречи (meeting-…). Снимок и разметка — no-meetings.png/.xml: пришлите их.');
}

// The open card is the tallest meeting row; the one to tap is the next.
const pickTarget = (ns) => {
  const ms = meetings(ns);
  const open = ms.reduce((a, b) => (b.h > a.h ? b : a), ms[0]);
  const i = ms.indexOf(open);
  return { open, next: ms[i + 1] };
};
let { open, next } = pickTarget(nodes);
if (!next) fail(`под открытой встречей (${open.id}) нет следующей плашки на экране.`);
const openId = open.id;
const targetId = next.id;
say(`Открыта: ${openId} (высота ${open.h}), нажимаю: ${targetId}`);

// Bring the target to the middle of the screen: slow swipes, no fling.
const want = Math.round(H * 0.45);
for (let i = 0; i < 8; i++) {
  const t = find(nodes, targetId);
  if (t && Math.abs(t.y1 - want) < H * 0.08) break;
  const from = t ? t.y1 : H * 0.8;
  const d = Math.max(-H * 0.4, Math.min(H * 0.4, from - want));
  const x = Math.round(W / 2);
  const y0 = Math.round(H * 0.55 + d / 2);
  adb(['shell', 'input', 'swipe', String(x), String(y0), String(x), String(Math.round(y0 - d)), '900']);
  await sleep(1200);
  nodes = dump();
}
nodes = dump('before');
const before = find(nodes, targetId);
if (!before) fail(`плашка ${targetId} ушла с экрана при прокрутке — запустите ещё раз.`);
const head = headerOf(nodes, before);
if (!head) fail(`у плашки ${targetId} не найден заголовок, на который нажимать.`);
// The card above is partly off the screen by now; what is seen of it is
// enough — if it closed, its visible part would shrink or move.
const aboveBefore = find(nodes, openId);
shot('before');
say(`До нажатия: верх ${targetId} на ${before.y1} px; встреча выше видна ${aboveBefore ? `на ${aboveBefore.y1}–${aboveBefore.y2} px` : 'не видна'}`);

// Film the tap: the video shows every frame in between, the numbers only the end.
const rec = spawn(ADB, ['shell', 'screenrecord', '--time-limit', '5', '/sdcard/cm-tap.mp4']);
await sleep(1200);
adb(['shell', 'input', 'tap', String(Math.round((head.x1 + head.x2) / 2)), String(Math.round((head.y1 + head.y2) / 2))]);
await new Promise((r) => rec.on('exit', r));
await sleep(1500);
writeFileSync(join(OUT, 'tap.mp4'), adb(['exec-out', 'cat', '/sdcard/cm-tap.mp4'], { binary: true }));

nodes = dump('after');
shot('after');
const after = find(nodes, targetId);
if (!after) fail(`после нажатия плашки ${targetId} нет на экране — она уехала. Смотрите tap.mp4.`);
const aboveAfter = find(nodes, openId);
say(`После нажатия: верх ${targetId} на ${after.y1} px, видимая высота ${before.h} → ${after.h} px; встреча выше ${aboveAfter ? `на ${aboveAfter.y1}–${aboveAfter.y2} px` : 'не видна'}`);
say('');

let bad = 0;
// A pixel or two is rounding between dp and px, not a move.
if (Math.abs(after.y1 - before.y1) > 3) {
  say(`❌ C08 плашка сдвинулась на ${after.y1 - before.y1} px`);
  bad++;
} else say(`✅ C08 плашка на месте (${before.y1} → ${after.y1} px)`);
if (after.h <= before.h) {
  say('❌ C08 плашка не открылась');
  bad++;
} else say('✅ C08 плашка открылась');
if (!aboveBefore) say(`· встреча выше (${openId}) до нажатия не видна — её проверяет только положение нажатой плашки`);
else if (!aboveAfter || Math.abs(aboveAfter.y1 - aboveBefore.y1) > 3 || Math.abs(aboveAfter.y2 - aboveBefore.y2) > 3) {
  say(`❌ C08 встреча выше (${openId}) изменилась — закрылась или сдвинулась`);
  bad++;
} else say(`✅ C08 встреча выше (${openId}) осталась открытой и на месте`);
say('');
say(bad ? `Итог: ошибок ${bad}. Пришлите папку целиком.` : 'Итог: всё верно. Пришлите папку целиком — видео тоже посмотрю.');
finish(bad ? 1 : 0);
