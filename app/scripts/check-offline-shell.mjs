#!/usr/bin/env node
/**
 * What the service worker keeps of the app itself — and what it never touches.
 *
 * public/service-worker.js lets the web app (the app, on an iPhone) open in a
 * hall with no signal. A rule too wide here is worse than none: a cached
 * answer of the data server would show yesterday's truth as today's, a kept
 * /app/ page would hand out an old APK, a kept build-info.json would make
 * check-live.mjs report a deploy that never reached the person. And one broken
 * line in this file breaks the whole site, not one screen.
 *
 * The rules sit between markers and are run here as they are.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const sw = readFileSync(join(ROOT, 'public/service-worker.js'), 'utf8').replace(/\r\n/g, '\n');
const problems = [];

const START = '// <<< OFFLINE RULES';
const END = '// >>> OFFLINE RULES';
const from = sw.indexOf(START);
const to = sw.indexOf(END);
if (from < 0 || to < 0) {
  console.error(`✗ Приложение без сети: в public/service-worker.js нет разметки ${START} … ${END}`);
  process.exit(1);
}
const ctx = { URL };
vm.createContext(ctx);
const entryLine = sw.match(/const ENTRY = (\/.*\/g);/);
if (!entryLine) problems.push('нет ENTRY — по чему узнаётся программа в странице');
vm.runInContext(`const ENTRY = ${entryLine ? entryLine[1] : '/x/g'};\n${sw.slice(from, to)}\nthis.offlineRule = offlineRule; this.pageKey = pageKey; this.programsIn = programsIn;`, ctx);
const { offlineRule, pageKey, programsIn } = ctx;

const O = 'https://mycongregation.org';
const CASES = [
  // [what, href, method, mode, expected]
  ['страница по ссылке', `${O}/home`, 'GET', 'navigate', 'page'],
  ['страница с адресом недели', `${O}/schedule?week=2026-10-12`, 'GET', 'navigate', 'page'],
  ['корень', `${O}/`, 'GET', 'navigate', 'page'],
  ['программа', `${O}/_expo/static/js/web/entry-01395b5dfd98f422c08b5f88fc01aeaa.js`, 'GET', 'no-cors', 'file'],
  ['шрифт', `${O}/assets/node_modules/@expo/vector-icons/Fonts/Ionicons.6148e7019854f3bde85b633cb88f3c25.ttf`, 'GET', 'cors', 'file'],
  ['картинка уборки', `${O}/assets/assets/cleaning/wc-zsk-1.a30b6403e7eb68a5eb8bf4c091a14cb9.webp`, 'GET', 'no-cors', 'file'],
  ['значок', `${O}/icon-192.png`, 'GET', 'no-cors', 'icon'],
  ['манифест', `${O}/manifest.webmanifest`, 'GET', 'cors', 'icon'],

  ['сервер данных', 'https://api.mycongregation.org/api/me/assignments', 'GET', 'cors', null],
  ['сервер данных — вход', 'https://api.mycongregation.org/api/auth/refresh', 'POST', 'cors', null],
  ['свой адрес, но не GET', `${O}/home`, 'POST', 'navigate', null],
  ['страница установки APK', `${O}/app/`, 'GET', 'navigate', null],
  ['страница установки APK без слэша', `${O}/app`, 'GET', 'navigate', null],
  ['сам APK', `${O}/app/mycongregation.apk`, 'GET', 'navigate', null],
  ['отметка выката', `${O}/build-info.json?v=abc`, 'GET', 'cors', null],
  ['сам сервис-воркер', `${O}/service-worker.js`, 'GET', 'same-origin', null],
  ['ссылки приложения Android', `${O}/.well-known/assetlinks.json`, 'GET', 'navigate', null],
  ['проверка экрана', `${O}/screen-check.html`, 'GET', 'navigate', null],
  ['чужой сайт', 'https://fonts.gstatic.com/s/x.woff2', 'GET', 'cors', null],
  ['чужой сайт с такими же путями', 'https://example.com/assets/x.png', 'GET', 'no-cors', null],
  ['чужая программа', 'https://example.com/_expo/static/js/web/entry-ab.js', 'GET', 'no-cors', null],
  ['неизвестный файл не по ссылке', `${O}/robots.txt`, 'GET', 'no-cors', null],
  ['мусор вместо адреса', 'not a url', 'GET', 'navigate', null],
];
for (const [what, href, method, mode, want] of CASES) {
  let got;
  try {
    got = offlineRule(href, method, mode, O);
  } catch (e) {
    got = `ошибка: ${e.message}`;
  }
  if (got !== want) problems.push(`${what}: ожидалось ${want}, вышло ${got}`);
}

for (const [href, want] of [
  [`${O}/schedule?week=2026-10-12&meeting=weekend`, `${O}/schedule`],
  [`${O}/schedule/`, `${O}/schedule`],
  [`${O}/home/index.html`, `${O}/home`],
  [`${O}/login.html`, `${O}/login`],
  [`${O}/`, `${O}/`],
  [`${O}/index.html`, `${O}/`],
]) {
  const got = pageKey(href);
  if (got !== want) problems.push(`копия страницы ${href} хранится как ${got}, а не ${want}`);
}

const html =
  '<script src="/_expo/static/js/web/entry-01395b5dfd98f422c08b5f88fc01aeaa.js" defer></script>' +
  '<script src="/_expo/static/js/web/entry-01395b5dfd98f422c08b5f88fc01aeaa.js"></script>';
const progs = Array.from(programsIn(html));
if (progs.length !== 1 || progs[0] !== '/_expo/static/js/web/entry-01395b5dfd98f422c08b5f88fc01aeaa.js') {
  problems.push(`программа в странице не узнаётся: ${JSON.stringify(progs)}`);
}

// --- the parts around the rules ------------------------------------------------
const after = sw.slice(to);
if (!/event\.respondWith\(handle\.catch\(\(\) => fetch\(event\.request\)\)\)/.test(after)) {
  problems.push('ошибка внутри обработчика не уходит в обычную сеть — сломанный кэш сломает сайт');
}
if (!/if \(!rule\) return;/.test(after)) problems.push('то, что правила не трогают, всё равно перехватывается');
if (!/refreshShell\(\)\.catch\(\(\) => \{\}\)/.test(after)) {
  problems.push('неудача при установке ломает установку — и с ней уведомления');
}
if (!/!\(res\.headers\.get\('content-type'\) \|\| ''\)\.includes\('text\/html'\)/.test(after)) {
  problems.push('файл без проверки, что это не страница: «200» со страницей вместо программы сломает приложение навсегда');
}
for (const fn of ['keepFile', 'serveFile', 'serveIcon']) {
  const i = after.indexOf(`function ${fn}(`);
  const body = i < 0 ? '' : after.slice(i, after.indexOf('\n}\n', i));
  if (!body) problems.push(`нет ${fn}`);
  else if (/res\.ok && res\.type === 'basic'/.test(body)) problems.push(`${fn}: хранит без проверки, что это не страница`);
}
// The notifications live in the same file and must not lose a line to this.
for (const ev of ["addEventListener('push'", "addEventListener('notificationclick'"]) {
  if (!sw.includes(ev)) problems.push(`пропал обработчик ${ev}`);
}

const layout = readFileSync(join(ROOT, 'app/_layout.tsx'), 'utf8');
if (!/postMessage\(\{ type: "keep-loaded", urls \}\)/.test(layout)) {
  problems.push('app/_layout.tsx: страница не отдаёт загруженное — без сети откроется только со второго раза');
}

if (problems.length) {
  console.error('✗ Приложение без сети:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`✓ Приложение без сети: ${CASES.length} адресов разобраны верно; сервер данных, /app/ и build-info не трогаются; ошибка уходит в сеть`);
