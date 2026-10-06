#!/usr/bin/env node
/**
 * Обход экранов на телефоне Android (28 сентября) — то же, что audit-crawl
 * делает в браузере, но на самом приложении, под учётной записью, в которую
 * вошли на телефоне.
 *
 *   node scripts/android-screens.mjs
 *
 * ТОЛЬКО СМОТРИТ: открывает экраны по ссылкам mycongregation://…, ничего не
 * нажимает и не сохраняет (единственное нажатие — «Позже» на ежегодном окне
 * проверки контактов, как сделал бы человек). Формы новых записей
 * открываются пустыми и закрываются, не сохранив ничего.
 *
 * На каждом экране: снимок (NN-имя.png), разметка (NN-имя.xml) и, если экран
 * длиннее одного, второй снимок после прокрутки (NN-имя-2.png). Сам ищет:
 *   - «Что-то пошло не так», «Не удалось загрузить», «Unmatched Route»;
 *   - почти пустой экран (меньше трёх надписей);
 *   - надписи, вылезающие за край экрана (частая беда на Android: ширины
 *     округляются до пикселей — так 27 сентября съехал календарь).
 * Итог — report.txt. Всю папку присылать (архивом).
 *
 * Что нужно: как для android-check — кабель, «Отладка по USB», вход в
 * приложении. Путь к adb: ADB=C:/platform-tools/adb.exe
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PKG = process.env.PKG || 'com.backmann.mycongregation';
const ADB =
  process.platform === 'win32'
    ? (process.env.ADB || 'adb').replace(/^\/([a-zA-Z])\//, '$1:/')
    : process.env.ADB || 'adb';

// The same list as the browser audit (scripts/audit-crawl.mjs), minus the
// old addresses that only forward.
const ROUTES = [
  '/home', '/home/my-assignments',
  '/schedule', '/schedule/edit', '/schedule/conduct', '/schedule/rules', '/schedule/import',
  '/special-events', '/special-events/new', '/local-needs',
  '/publishers', '/publishers/list', '/service-groups',
  '/absences', '/absences/new', '/publishers/responsibilities', '/publishers/responsibilities-list',
  '/publishers/duties', '/publishers/cleaning', '/cleaning/guide',
  '/publishers/meeting-settings',
  '/publishers/admin-users', '/publishers/journal', '/publishers/backups', '/publishers/public-talks',
  '/publishers/public-talks-retire', '/publishers/circuit-overseer',
  '/talk-coordinator', '/talk-coordinator/speakers', '/talk-coordinator/our-speakers', '/talk-coordinator/congregations', '/talk-coordinator/log',
  '/tasks', '/tasks/agenda', '/tasks/archive', '/pioneer-school',
  '/cart', '/cart/field-service', '/cart/witnessing', '/cart/locations', '/cart/co-schedule', '/cart/service-overseer', '/cart/auxiliary-pioneers', '/cart/auxiliary-pioneers-month',
  '/service-reports', '/service-reports/group', '/service-reports/summary', '/service-reports/annual',
  '/service-reports/attendance', '/service-reports/activity', '/service-reports/publisher-history',
  '/service-reports/pioneer-year-review',
  '/profile', '/profile/my-tasks', '/profile/contacts', '/profile/notifications',
];

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
const OUT = resolve(process.cwd(), '..', '..', 'congmap-android-screens', stamp);
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

function dump(name) {
  // uiautomator refuses now and then while the screen animates: try again.
  let xml = '';
  for (let i = 0; i < 3 && !xml.includes('<hierarchy'); i++) {
    spawnSync(ADB, ['shell', 'uiautomator', 'dump', '/sdcard/cm-screens.xml'], { encoding: 'utf8' });
    xml = adb(['exec-out', 'cat', '/sdcard/cm-screens.xml']);
  }
  if (name) writeFileSync(join(OUT, `${name}.xml`), xml);
  const nodes = [];
  for (const m of xml.matchAll(/<node\b([^>]*)>?/g)) {
    const attr = (k) => (m[1].match(new RegExp(`(?:^|\\s)${k}="([^"]*)"`)) || [])[1] ?? '';
    const b = attr('bounds').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    nodes.push({
      text: attr('text') || attr('content-desc'),
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

const BROKEN = /Что-то пошло не так|Something went wrong|Unmatched Route|This screen doesn't exist|Не удалось загрузить|Ошибка загрузки/i;
const open = (path) =>
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `mycongregation:/${path}`, PKG]);

// A fresh start, and the build line from the Profile — which update runs.
adb(['shell', 'am', 'force-stop', PKG]);
await sleep(800);
open('/profile');
await sleep(12000);
let build = null;
for (let i = 0; i < 5 && !build; i++) {
  const ns = dump();
  build = ns.map((n) => n.text).find((s) => /^v\S+ · /.test(s)) ?? null;
  const later = ns.find((n) => n.text === 'Позже' && n.h > 0);
  if (later) adb(['shell', 'input', 'tap', String(Math.round((later.x1 + later.x2) / 2)), String(Math.round((later.y1 + later.y2) / 2))]);
  else if (!build) adb(['shell', 'input', 'swipe', String(W / 2), String(Math.round(H * 0.8)), String(W / 2), String(Math.round(H * 0.3)), '400']);
  await sleep(1500);
}
say(`Версия в приложении: ${build ?? 'не прочитана'}`);
say('');

const findings = [];
let n = 0;
for (const path of ROUTES) {
  n += 1;
  const name = `${pad(n)}-${path.replace(/^\//, '').replace(/\//g, '_') || 'root'}`;
  open(path);
  await sleep(4500);
  let ns = dump(name);
  // The yearly contacts window stands over everything: «Позже», like a person.
  const later = ns.find((x) => x.text === 'Позже' && x.h > 0);
  if (later) {
    adb(['shell', 'input', 'tap', String(Math.round((later.x1 + later.x2) / 2)), String(Math.round((later.y1 + later.y2) / 2))]);
    await sleep(1500);
    ns = dump(name);
  }
  shot(name);

  const texts = ns.filter((x) => x.text && x.h > 0 && x.y2 > 0 && x.y1 < H);
  const problems = [];
  const broken = texts.find((x) => BROKEN.test(x.text));
  if (broken) problems.push(`на экране: «${broken.text.slice(0, 80)}»`);
  if (texts.length < 3) problems.push(`почти пусто (${texts.length} надписи)`);
  // Only real text leaving the screen: a scroller's content legitimately
  // runs past the edge when it scrolls sideways, so its children are judged
  // by whether they are cut by the screen, not by a scroller.
  const sideways = ns.filter((x) => /HorizontalScrollView/.test(x.cls) && x.h > 0);
  const inSideways = (x) => sideways.some((r) => x.y1 >= r.y1 - 2 && x.y2 <= r.y2 + 2);
  const out = texts.filter((x) => (x.x2 > W + 2 || x.x1 < -2) && !inSideways(x));
  if (out.length) problems.push(`за краем экрана: ${out.slice(0, 3).map((x) => `«${x.text.slice(0, 30)}» [${x.x1}..${x.x2}]`).join(', ')}`);

  // A second look further down when the screen scrolls.
  const list = ns.filter((x) => x.scrollable && x.h > H * 0.3).sort((a, b) => b.h - a.h)[0];
  if (list) {
    adb(['shell', 'input', 'swipe', String(W / 2), String(Math.round(H * 0.75)), String(W / 2), String(Math.round(H * 0.25)), '600']);
    await sleep(1400);
    shot(`${name}-2`);
  }
  const top = texts.slice(0, 4).map((x) => x.text.slice(0, 40)).join(' | ');
  say(`${problems.length ? '❌' : '✅'} ${path}${problems.length ? ' — ' + problems.join('; ') : ''}`);
  say(`     ${top}`);
  if (problems.length) findings.push(`${path}: ${problems.join('; ')}`);
}

say('');
say(`Экранов: ${ROUTES.length}, с находками: ${findings.length}`);
for (const f of findings) say(`  ${f}`);
finish(0);
