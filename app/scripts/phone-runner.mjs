#!/usr/bin/env node
/**
 * Исполнитель проверок на телефоне (17 октября 2026).
 *
 * Claude работает в облаке и видит папку ~/congmap через приложение Claude,
 * но телефон, подключённый кабелем к ноутбуку, ему недоступен: adb есть
 * только в Windows. Этот скрипт — мостик. Лионель запускает его один раз за
 * сеанс работы и оставляет окно открытым:
 *
 *   cd ~/congmap
 *   git pull --ff-only && node app/scripts/phone-runner.mjs
 *
 * Claude кладёт в ~/congmap/.phone-jobs/ файл-заявку <имя>.job с одной
 * строкой — названием задания из СПИСКА НИЖЕ (например `android-screens`).
 * Исполнитель:
 *   1. подтягивает свежий main (`git pull --ff-only`), чтобы скрипты были те
 *      же, что на GitHub; если отслеживаемые файлы правлены или ветка не
 *      main — не трогает рабочее дерево и задание не запускает;
 *   2. запускает ровно то, что записано в списке, — без своих аргументов и
 *      без произвольных команд: неизвестное название отклоняется;
 *   3. пишет весь вывод в .phone-jobs/<имя>.log, а итог — в
 *      .phone-jobs/<имя>.done (код выхода, время, коммит).
 * Снимки и report.txt скрипты по-прежнему кладут в ~/congmap-android-screens.
 *
 * Если с GitHub пришла новая версия самого исполнителя, он перезапускается
 * сам в том же окне, а заявка ждёт новую версию.
 *
 * Задания идут по одному, в порядке появления. Дольше 30 минут задание не
 * живёт. Остановить исполнитель — Ctrl+C.
 *
 * Путь к adb: переменная ADB, иначе C:/platform-tools/adb.exe, если он есть,
 * иначе просто `adb`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(APP, '..');
const JOBS = join(ROOT, '.phone-jobs');
const SELF = fileURLToPath(import.meta.url);
const POLL_MS = 2000;
const LIMIT_MS = 30 * 60 * 1000;

const adbPath = () => {
  if (process.env.ADB) return process.env.ADB.replace(/^\/([a-zA-Z])\//, '$1:/');
  if (process.platform === 'win32' && existsSync('C:/platform-tools/adb.exe')) return 'C:/platform-tools/adb.exe';
  return 'adb';
};
const ADB = adbPath();

// Единственное, что исполнитель умеет запускать. Новое задание — только
// строкой здесь, через pull request.
const TASKS = {
  devices: { what: 'виден ли телефон (adb devices -l)', cmd: [ADB, 'devices', '-l'] },
  tools: {
    what: 'какие инструменты есть на ноутбуке (node, git, adb, java, maestro)',
    cmd: [
      'node',
      '-e',
      `const { spawnSync } = require('node:child_process');
for (const [n, c] of [['node', 'node --version'], ['git', 'git --version'], ['adb', '"${ADB}" version'],
  ['java', 'java -version'], ['JAVA_HOME', 'echo %JAVA_HOME%'], ['maestro', 'maestro --version']]) {
  const r = spawnSync(c, { shell: true, encoding: 'utf8' });
  const out = ((r.stdout || '') + (r.stderr || '')).split(/\\r?\\n/).filter((l) => l.trim() && !l.startsWith('Picked up'))[0] || '';
  console.log(n.padEnd(10) + (r.status === 0 ? out : 'нет (' + (out || 'код ' + r.status) + ')'));
}`,
    ],
  },
  'android-version': {
    what: 'стоит ли на телефоне последнее обновление',
    cmd: ['node', 'scripts/android-check.mjs', '--version'],
  },
  'android-check': { what: 'плашки «Программы» (C08)', cmd: ['node', 'scripts/android-check.mjs'] },
  'android-screens': { what: 'обход всех экранов', cmd: ['node', 'scripts/android-screens.mjs'] },
  'android-field-service': {
    what: 'раздел встреч для проповеди с нажатиями',
    cmd: ['node', 'scripts/android-field-service.mjs'],
  },
  'android-changes': { what: 'переносы, отмены, журнал', cmd: ['node', 'scripts/android-changes.mjs'] },
};

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const say = (line) => console.log(`[${stamp()}] ${line}`);

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

// Свежий main, или отказ с объяснением. Возвращает текст для журнала задания.
function freshMain() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
  if (branch !== 'main') return { ok: false, note: `рабочее дерево на ветке «${branch}», а не main — не трогаю` };
  // Новые неотслеживаемые файлы pull не мешают (столкновение он отвергнет сам),
  // а правленые отслеживаемые — повод ничего не трогать.
  const dirty = git(['status', '--porcelain', '--untracked-files=no']).out;
  if (dirty) return { ok: false, note: `в рабочем дереве есть правки — не трогаю:\n${dirty}` };
  const before = git(['rev-parse', '--short', 'HEAD']).out;
  const selfBefore = readFileSync(SELF, 'utf8');
  const pull = git(['pull', '--ff-only', '--quiet']);
  if (!pull.ok) return { ok: false, note: `git pull --ff-only не прошёл:\n${pull.out}` };
  const after = git(['rev-parse', '--short', 'HEAD']).out;
  const note = before === after ? `main ${after}, уже свежий` : `main ${before} → ${after}`;
  return { ok: true, note, head: after, selfChanged: readFileSync(SELF, 'utf8') !== selfBefore };
}

function runTask(name, task, logFile) {
  return new Promise((done) => {
    const [bin, ...args] = task.cmd;
    const child = spawn(bin, args, { cwd: APP, env: { ...process.env, ADB }, windowsHide: true });
    const write = (chunk) => appendFileSync(logFile, chunk);
    child.stdout.on('data', write);
    child.stderr.on('data', write);
    const timer = setTimeout(() => {
      write(`\n[исполнитель] задание «${name}» дольше 30 минут — останавливаю\n`);
      child.kill();
    }, LIMIT_MS);
    child.on('error', (e) => {
      clearTimeout(timer);
      write(`\n[исполнитель] не запускается ${bin}: ${e.message}\n`);
      done(127);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done(code ?? 1);
    });
  });
}

async function handle(file) {
  const id = file.slice(0, -'.job'.length);
  const running = join(JOBS, `${id}.running`);
  renameSync(join(JOBS, file), running);
  const name = readFileSync(running, 'utf8').trim();
  const logFile = join(JOBS, `${id}.log`);
  const started = stamp();
  writeFileSync(logFile, `[исполнитель] заявка ${id}: «${name}», ${started}\n`);
  const result = { id, task: name, started, finished: null, exit: null, head: null, note: '' };

  // Сначала свежий main: новое задание могло прийти вместе с новым списком.
  const fresh = freshMain();
  appendFileSync(logFile, `[исполнитель] ${fresh.note}\n`);
  if (fresh.selfChanged) {
    // Сам исполнитель обновился — заявку вернуть в очередь и перезапуститься.
    appendFileSync(logFile, '[исполнитель] сам исполнитель обновился — перезапускаюсь, заявка вернётся в очередь\n');
    renameSync(running, join(JOBS, file));
    relaunch();
    return;
  }
  result.note = fresh.note;
  result.head = fresh.head || null;
  const task = Object.hasOwn(TASKS, name) ? TASKS[name] : null;
  if (!fresh.ok) {
    result.exit = 3;
  } else if (!task) {
    result.note = `неизвестное задание «${name}»; разрешены: ${Object.keys(TASKS).join(', ')}`;
    result.exit = 2;
    appendFileSync(logFile, `[исполнитель] ${result.note}\n`);
  } else {
    say(`${id}: ${name} — ${task.what}`);
    result.exit = await runTask(name, task, logFile);
  }
  result.finished = stamp();
  appendFileSync(logFile, `\n[исполнитель] готово, код ${result.exit}, ${result.finished}\n`);
  writeFileSync(join(JOBS, `${id}.done`), JSON.stringify(result, null, 2) + '\n');
  renameSync(running, join(JOBS, `${id}.finished`));
  say(`${id}: ${name} — код ${result.exit}`);
}

mkdirSync(JOBS, { recursive: true });
// Заявка, оставшаяся «в работе» после прошлого сеанса, — отметить и не повторять.
for (const f of readdirSync(JOBS).filter((f) => f.endsWith('.running'))) {
  renameSync(join(JOBS, f), join(JOBS, f.replace(/\.running$/, '.abandoned')));
}
say(`Исполнитель запущен. Жду заявки в ${JOBS}`);
say(`adb: ${ADB}. Задания: ${Object.keys(TASKS).join(', ')}`);
say('Окно не закрывать; остановить — Ctrl+C.');

let busy = false;
let stopped = false;

// Новая версия исполнителя пришла с GitHub: запустить её в этом же окне и
// ждать, пока она работает. Ctrl+C останавливает обе.
function relaunch() {
  stopped = true;
  say('Исполнитель обновился с GitHub — запускаю новую версию в этом же окне.');
  const child = spawn(process.execPath, [SELF], { stdio: 'inherit' });
  child.on('close', (code) => process.exit(code ?? 0));
}

setInterval(async () => {
  if (busy || stopped) return;
  const next = readdirSync(JOBS)
    .filter((f) => f.endsWith('.job'))
    .map((f) => ({ f, t: statSync(join(JOBS, f)).mtimeMs }))
    .sort((a, b) => a.t - b.t)[0];
  if (!next) return;
  busy = true;
  try {
    await handle(next.f);
  } catch (e) {
    say(`ошибка исполнителя: ${e.message}`);
  } finally {
    busy = false;
  }
}, POLL_MS);
