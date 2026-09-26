#!/usr/bin/env node
/**
 * Обход вместо ручных проверок — одной командой (24 сентября).
 *
 * Проходит под тремя учётками то, что раньше проверялось руками после каждого
 * шага перестройки: меню «…», «Править программу», двери со старого экрана,
 * Вечерю в ленте, «Управление», снятие речей, номер 8 на плане, «Время и
 * место встреч», даты словами, Профиль, немецкий язык, права старейшины и
 * возвещателя. Каждый шаг снимается, каждый получает ✅ или ❌ с причиной, и
 * одна проверка не останавливает остальные. Отчёт — в конце и в report.txt.
 *
 * ЧТО ОН МЕНЯЕТ В ЛОКАЛЬНОЙ БАЗЕ — и возвращает:
 *  - «Время и место встреч»: сохраняет версию расписания С ТЕМИ ЖЕ днями,
 *    временем и адресом, что действуют, с 1-го числа этого месяца будущего
 *    года — и тут же удаляет её (удалить можно только будущую).
 *  - язык админа: переключает на немецкий и обратно на русский.
 * Ничего не назначает и не снимает: окно назначения открывается и
 * закрывается. Боевую базу не трогает никогда — адрес только localhost.
 *
 * Перед началом проверяет, что сборка и сервер собраны из кода в папках, а в
 * базе все миграции, — иначе отказывается (см. freshness ниже).
 *
 * Запуск (база, сервер и Expo web работают):
 *     node scripts/walkthrough.mjs [метка]
 * Можно переопределить: APP_URL, ADMIN, ELDER, PUBLISHER, PASSWORD.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  appFingerprint,
  changedFiles,
  describeChanges,
  serverFingerprint,
} from './code-fingerprint.mjs';

const BASE = process.env.APP_URL || 'http://localhost:8081';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Отказ: обход меняет базу и ходит только на localhost, а не на ${BASE}.`);
  process.exit(1);
}
const ADMIN = process.env.ADMIN || 'bauer800@example.invalid';
const ELDER = process.env.ELDER || 'bondar838@example.invalid';
const PUBLISHER = process.env.PUBLISHER || 'bergman855@example.invalid';
const PASSWORD = process.env.PASSWORD || 'local12345';

// --- is what we are about to test the code on disk? ---------------------------
/*
 * 25 September: A15 failed on a build older than the patch, and the time went
 * to a fault that was not there. A green run on old code is worse still — it
 * says «checked» about something that was not. So before anything opens:
 *   - the web build must carry the fingerprint of the code in this folder
 *     (local-web.mjs stamps it);
 *   - the server must have started from the source in its folder, and the
 *     database must have every migration (the server tells, in development).
 * There is no «run anyway»: rebuilding costs minutes, a false green costs a
 * release. SERVER_DIR — where the server's folder is, if not ../server.
 */
const SERVER_DIR = process.env.SERVER_DIR || resolve(process.cwd(), '..', 'server');
function refuse(msg) {
  console.error(`Отказ: ${msg}`);
  process.exit(1);
}
async function freshness() {
  const info = await fetch(`${BASE}/build-info.json`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (!info?.app?.hash) {
    refuse(
      `у сборки на ${BASE} нет отметки, из какого кода она собрана (собрана до 26 сентября, или это не local-web).\n` +
        '  Пересоберите: node scripts/local-web.mjs',
    );
  }
  const app = appFingerprint(process.cwd());
  if (app.hash !== info.app.hash) {
    refuse(
      `сборка старше кода — с её сборки изменены: ${describeChanges(changedFiles(info.app, app))}.\n` +
        '  Остановите local-web (Ctrl+C) и пересоберите: node scripts/local-web.mjs',
    );
  }
  const api = String(info.api || '').replace(/\/$/, '');
  const res = await fetch(`${api}/health/dev`).catch(() => null);
  if (!res) refuse(`сервер ${api} не отвечает — в ~/congmap/server: npm run start:dev`);
  if (res.status === 404) {
    refuse(
      'сервер не сообщает, из какого кода он запущен: либо он старее этой проверки (обновите ~/congmap/server: git pull),\n' +
        '  либо запущен не в режиме разработки (в server/.env должно быть NODE_ENV=development). Потом: npm run start:dev',
    );
  }
  const dev = await res.json().catch(() => null);
  if (!existsSync(join(SERVER_DIR, 'src'))) {
    refuse(`не нашёл исходники сервера в ${SERVER_DIR} — укажите папку: SERVER_DIR=… node scripts/walkthrough.mjs`);
  }
  const server = serverFingerprint(SERVER_DIR);
  if (!dev || dev.sourceFingerprint !== server.hash) {
    refuse(
      `сервер работает на старом коде (запущен из ${dev?.sourceFingerprint ?? '?'}, в папке сейчас ${server.hash}).\n` +
        '  Перезапустите его: Ctrl+C в окне сервера, затем npm run start:dev. Если он не стартует — ошибка в том окне.',
    );
  }
  if (dev.pendingMigrations) {
    refuse('в локальной базе не применены миграции — в ~/congmap/server: npm run migration:run, потом снова обход.');
  }
  // Which commit, and how much on top of it — for the report, not a condition.
  const git = (args, cwd) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const describeRepo = (cwd, path) => {
    const head = git(['rev-parse', '--short', 'HEAD'], cwd);
    const dirty = (git(['status', '--porcelain', '--', path], cwd) || '').split('\n').filter(Boolean).length;
    return head ? `${head}${dirty ? ` + ${dirty} незакоммич.` : ''}` : '?';
  };
  return {
    app: app.hash,
    server: server.hash,
    appRepo: describeRepo(process.cwd(), '.'),
    serverRepo: describeRepo(SERVER_DIR, 'src'),
  };
}
const CODE = await freshness();
const codeLine = `Код: приложение ${CODE.app} (${CODE.appRepo}) · сервер ${CODE.server} (${CODE.serverRepo})`;
console.log(`· ${codeLine} — сборка и сервер свежие`);

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
const LABEL = (process.argv[2] || 'walk').replace(/[^a-z0-9-]/gi, '');
const OUT = join(process.cwd(), '.screens', `${stamp}_${LABEL}`);
mkdirSync(OUT, { recursive: true });

const PHONE = { width: 390, height: 844 };

// --- the record ------------------------------------------------------------
const results = [];
let shot = 0;
async function snap(page, name) {
  shot += 1;
  const file = `${String(shot).padStart(3, '0')}-${name}.png`;
  await page.screenshot({ path: join(OUT, file) }).catch(() => {});
  return file;
}
/**
 * One check. `fn` throws with a plain reason when something is not as it
 * should be; whatever happens, the next check runs.
 */
async function check(page, id, title, fn) {
  try {
    const note = await fn();
    const file = await snap(page, id);
    results.push({ id, title, ok: true, note: note || '', file });
    console.log(`✅ ${id} ${title}${note ? ' — ' + note : ''}`);
  } catch (e) {
    const file = await snap(page, `${id}-ОШИБКА`);
    const why = String(e?.message || e).split('\n')[0].slice(0, 300);
    results.push({ id, title, ok: false, note: why, file });
    console.log(`❌ ${id} ${title} — ${why} (снимок ${file}, адрес ${page.url()})`);
    // Leave whatever window stands open so the next check starts clean.
    await page.keyboard.press('Escape').catch(() => {});
  }
}
const skip = (id, title, why) => {
  results.push({ id, title, ok: null, note: why, file: '' });
  console.log(`⚠️ ${id} ${title} — ${why}`);
};

// --- small verbs -----------------------------------------------------------
const exact = (s) => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
/*
 * Only what is SHOWN counts. The app keeps earlier screens of a stack mounted
 * and hidden, so an unfiltered search finds the feed's row while the planning
 * screen is in front — and waits in vain for it to become visible.
 */
async function see(page, text, timeout = 15000) {
  const loc = page.getByText(typeof text === 'string' ? exact(text) : text).filter({ visible: true }).first();
  await loc.waitFor({ timeout }).catch(() => {
    throw new Error(`не вижу «${text}»`);
  });
  return loc;
}
async function notSee(page, text) {
  const n = await page.getByText(typeof text === 'string' ? exact(text) : text).filter({ visible: true }).count();
  if (n) throw new Error(`видно «${text}», а не должно`);
}
async function tap(page, text) {
  const loc = await see(page, text);
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await loc.click();
  await page.waitForTimeout(700);
}
async function atPath(page, pathStart, timeout = 15000) {
  const ok = await page
    .waitForURL((u) => u.pathname.startsWith(pathStart), { timeout })
    .then(() => true)
    .catch(() => false);
  if (!ok) throw new Error(`ожидал адрес ${pathStart}, а стоит ${new URL(page.url()).pathname}`);
}
/**
 * The yearly «check your contacts» window stands over everything for an
 * account with a card that has not confirmed yet. A person answers «Позже»;
 * so does the script — it is not what is being checked.
 */
async function answerContactsCheck(page) {
  const later = page.getByText(/^Позже$/).first();
  if (await later.waitFor({ timeout: 1500 }).then(() => true).catch(() => false)) {
    await later.click().catch(() => {});
    await page.waitForTimeout(500);
  }
}
async function go(page, path, waitFor) {
  await page.goto(`${BASE}${path}`);
  await answerLanguage(page);
  await answerContactsCheck(page);
  if (waitFor) await see(page, waitFor, 30000);
  await page.waitForTimeout(800);
}
/** The app's own «back» in the header — the browser's follows tab history. */
async function back(page) {
  const b = page.getByLabel('Назад', { exact: true }).last();
  if (!(await b.count())) throw new Error('нет кнопки «назад» в шапке');
  await b.click();
  await page.waitForTimeout(800);
}
async function hasLabel(page, label) {
  return (await page.getByLabel(label, { exact: true }).count()) > 0;
}
function mondayPlus(weeks) {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + 7 * weeks);
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}`;
}

// --- signing in (the same way screens.mjs does) ----------------------------
async function answerLanguage(page) {
  const dialog = page.locator('[role="dialog"]').filter({ hasText: /Выберите язык|Choose .*language|Sprache wählen/i });
  if (!(await dialog.first().waitFor({ timeout: 2000 }).then(() => true).catch(() => false))) return;
  await dialog.getByText(/^Русский$/).first().click();
  await dialog.getByText(/^Подтвердить$|^Confirm$|^Bestätigen$/).first().click();
  await dialog.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
}
async function login(page, email) {
  await page.goto(BASE);
  const pw = page.locator('input[type="password"]').first();
  await pw.waitFor({ timeout: 30000 });
  await answerLanguage(page);
  await page.locator('input:not([type="password"])').first().fill(email);
  await pw.fill(PASSWORD);
  const submit = page.getByText(/^(Войти|Log in|Sign in|Anmelden)$/).last();
  if (await submit.count()) await submit.click();
  else await pw.press('Enter');
  await pw.waitFor({ state: 'detached', timeout: 30000 });
}
/** A signed-in window, reusing a kept session (the sign-in limiter is strict). */
async function signedIn(browser, email) {
  mkdirSync(join(process.cwd(), '.screens'), { recursive: true });
  const file = join(process.cwd(), '.screens', `.session-${email.replace(/[^a-z0-9]/gi, '_')}.json`);
  const keep = async (ctx) => {
    await ctx.storageState({ path: file }).catch(() => {});
  };
  if (existsSync(file)) {
    const ctx = await browser.newContext({ viewport: PHONE, locale: 'ru-RU', storageState: file });
    const page = await ctx.newPage();
    await page.goto(BASE);
    if (await page.getByText(/^Главная$/).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) {
      console.log(`· вход (${email}): сохранённая сессия`);
      return { ctx, page, keep: () => keep(ctx) };
    }
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: PHONE, locale: 'ru-RU' });
  const page = await ctx.newPage();
  try {
    await login(page, email);
  } catch {
    await snap(page, `вход-${email.split('@')[0]}-ОШИБКА`);
    throw new Error(`не смог войти как ${email}`);
  }
  console.log(`· вход (${email}): новый`);
  return { ctx, page, keep: () => keep(ctx) };
}
// Every confirm() of the web — «Снять назначение?» and the like — is answered
// «yes» only where a check means it; elsewhere nothing asks.
function acceptDialogs(page) {
  page.on('dialog', (d) => d.accept().catch(() => {}));
}

// ============================================================================
// CHROME / CHROME_ARGS: another Chromium than Playwright's own — how the
// script was tried out on a machine where Playwright's download is closed.
const browser = await chromium.launch(
  process.env.CHROME
    ? { executablePath: process.env.CHROME, args: process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [] }
    : {},
);
let memorialWeek = null; // found as the admin, reused by the others

// --- the admin --------------------------------------------------------------
{
  const { ctx, page, keep } = await signedIn(browser, ADMIN);
  acceptDialogs(page);
  console.log('\n— Администратор —');

  await check(page, 'A01', 'Вкладка «Программа»: лента, заголовок, «…»', async () => {
    await go(page, '/schedule', /^Сегодня ·/);
    await see(page, 'Программа');
    await notSee(page, 'Лента встреч');
    if (!(await hasLabel(page, 'Ещё'))) throw new Error('нет кнопки «…» (метка «Ещё»)');
  });

  await check(page, 'A02', '«…» в Программе: События и Составление; «События» и назад', async () => {
    await go(page, '/schedule', /^Сегодня ·/);
    await page.getByLabel('Ещё', { exact: true }).first().click();
    await see(page, 'События');
    await see(page, 'Составление программы');
    await snap(page, 'A02-шторка');
    await tap(page, 'События');
    await atPath(page, '/special-events');
    await back(page);
    await atPath(page, '/schedule');
  });

  await check(page, 'A03', '«Составление»: «+» и «…» с тремя пунктами, каждый открывается', async () => {
    const targets = [
      ['Правила собрания', '/schedule/rules'],
      ['Импорт программы', '/schedule/import'],
      ['Местные потребности', '/local-needs'],
    ];
    for (const [row, path] of targets) {
      await go(page, '/schedule/edit');
      await page.waitForTimeout(1500);
      if (!(await hasLabel(page, 'Новое назначение'))) throw new Error('нет «+» (метка «Новое назначение»)');
      await page.getByLabel('Ещё', { exact: true }).first().click();
      await tap(page, row);
      await atPath(page, path);
      await snap(page, `A03-${path.split('/').pop()}`);
      await back(page);
      await atPath(page, '/schedule/edit');
    }
    await notSee(page, 'Координатор речей');
  });

  const week = mondayPlus(3);
  await check(page, 'A04', '«Править программу» в ленте → Составление на этой неделе и встрече', async () => {
    await go(page, `/schedule?week=${week}&meeting=weekend`);
    const card = page.getByTestId(`meeting-${week}-weekend`);
    await card.waitFor({ timeout: 30000 }).catch(() => {
      throw new Error(`нет выходной встречи недели ${week}`);
    });
    await page.waitForTimeout(1500);
    const link = card.getByText(/^Править программу$/).first();
    await link.scrollIntoViewIfNeeded();
    await link.click();
    await atPath(page, '/schedule/edit');
    const u = new URL(page.url());
    if (u.searchParams.get('week') !== week || u.searchParams.get('meeting') !== 'weekend')
      throw new Error(`адрес ${u.pathname}${u.search} — не та неделя или встреча`);
    return `${u.pathname}${u.search}`;
  });

  await check(page, 'A05', 'Составление: окно назначения части открывается и закрывается', async () => {
    await go(page, `/schedule/edit?week=${week}&meeting=midweek`);
    await page.waitForTimeout(2000);
    // Imported parts carry their length in the title: «Чтение Библии (4 мин)».
    await tap(page, /^Чтение Библии/);
    await see(page, 'Снять назначение');
    await snap(page, 'A05-окно');
    await tap(page, 'Закрыть');
    return 'назначение не менялось — окно открыто и закрыто';
  });

  await check(page, 'A06', 'Составление: гостеприимство на выходной встрече', async () => {
    await go(page, `/schedule/edit?week=${week}&meeting=weekend`);
    await page.waitForTimeout(2000);
    const zone = await see(page, 'Гостеприимство');
    await zone.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    return 'зона есть — нагрузку смотреть на снимке';
  });

  await check(page, 'A07', 'Составление: две двери «Теперь в своём экране»', async () => {
    for (const [title, path] of [
      ['Обязанности на встречах', '/publishers/duties'],
      ['Уборка зала', '/publishers/cleaning'],
    ]) {
      await go(page, '/schedule/edit');
      await page.waitForTimeout(2000);
      const door = page.getByText(/^Теперь в своём экране/).locator('..').filter({ hasText: title }).first();
      if (!(await door.count())) throw new Error(`нет двери «${title}»`);
      await door.scrollIntoViewIfNeeded();
      await door.click();
      await atPath(page, path);
    }
  });

  // --- the Memorial
  await go(page, '/special-events');
  await page.waitForTimeout(2000);
  const memorialRow = page.getByText(/^Вечеря воспоминания/).first();
  if (!(await memorialRow.count())) {
    for (const [id, t] of [
      ['A08', 'Вечеря: ссылка на неделю открывает ленту с раскрытой программой'],
      ['A09', 'Вечеря: «Печать»'],
      ['A10', 'Вечеря: «Править программу» → Составление'],
    ])
      skip(id, t, 'в событиях нет Вечери — создай учебную (например, на ближайший четверг) и запусти ещё раз');
  } else {
    await check(page, 'A08', 'Вечеря: ссылка на неделю открывает ленту с раскрытой программой', async () => {
      await go(page, '/special-events');
      await page.waitForTimeout(1500);
      await page.getByText(/^Вечеря воспоминания/).first().click();
      await tap(page, 'Открыть в расписании');
      await atPath(page, '/schedule');
      const u = new URL(page.url());
      memorialWeek = u.searchParams.get('week');
      if (u.searchParams.get('meeting') !== 'memorial') throw new Error(`в адресе нет meeting=memorial: ${u.search}`);
      const card = page.getByTestId(`memorial-${memorialWeek}`);
      await card.waitFor({ timeout: 30000 }).catch(() => {
        throw new Error('нет строки Вечери в ленте');
      });
      await page.waitForTimeout(2500);
      const printBtn = card.getByText(/^Печать$/);
      const rows = await card.innerText();
      if (!(await printBtn.count()) && !/Председатель|Песня|молитв/i.test(rows))
        throw new Error('строка Вечери не раскрыта или программа пуста');
      return `неделя ${memorialWeek}`;
    });
    await check(page, 'A09', 'Вечеря: «Печать» открывает лист', async () => {
      const card = page.getByTestId(`memorial-${memorialWeek}`);
      const printBtn = card.getByText(/^Печать$/).first();
      if (!(await printBtn.count())) throw new Error('нет «Печать» — программа Вечери пуста?');
      const popup = page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
      await printBtn.click();
      const win = await popup;
      if (!win) throw new Error('лист не открылся (нет нового окна)');
      await win.waitForLoadState().catch(() => {});
      await win.screenshot({ path: join(OUT, 'A09-лист-Вечери.png') }).catch(() => {});
      await win.close().catch(() => {});
    });
    await check(page, 'A10', 'Вечеря: «Править программу» → Составление на её неделе', async () => {
      const card = page.getByTestId(`memorial-${memorialWeek}`);
      await card.getByText(/^Править программу$/).first().click();
      await atPath(page, '/schedule/edit');
      if (new URL(page.url()).searchParams.get('week') !== memorialWeek) throw new Error('не та неделя');
      await page.waitForTimeout(2000);
      // The block's own title wraps in its narrow header — so not an exact line.
      await see(page, /Вечеря\s+воспоминания/);
    });
  }

  // --- the Congregation tab
  await check(page, 'A11', 'Собрание → «Составление программы»', async () => {
    await go(page, '/publishers', 'Возвещатели');
    await tap(page, 'Составление программы');
    await atPath(page, '/schedule/edit');
  });

  await check(page, 'A12', '«Управление»: каждая строка открывается, «назад» — в Собрание', async () => {
    const rows = [
      ['Управление пользователями', '/publishers/admin-users'],
      ['Журнал изменений', '/publishers/journal'],
      ['Резервные копии', '/publishers/backups'],
      ['Каталог публичных речей', '/publishers/public-talks'],
      ['Импорт песен', '/publishers/songs-import'],
      ['Районный старейшина', '/publishers/circuit-overseer'],
    ];
    const missing = [];
    for (const [row, path] of rows) {
      await go(page, '/publishers', 'Возвещатели');
      const loc = page.getByText(exact(row)).first();
      if (!(await loc.count())) { missing.push(row); continue; }
      await loc.scrollIntoViewIfNeeded();
      await loc.click();
      await atPath(page, path);
      await page.waitForTimeout(800);
      await back(page);
      await atPath(page, '/publishers');
    }
    if (missing.length && !(missing.length === 1 && missing[0] === 'Резервные копии'))
      throw new Error(`нет строк: ${missing.join(', ')}`);
    return missing.length ? '«Резервных копий» нет — у этой учётки нет права на копии' : '';
  });

  await check(page, 'A13', 'Каталог речей → «Снятие речей» → назад в каталог', async () => {
    await go(page, '/publishers/public-talks');
    await page.waitForTimeout(1500);
    await tap(page, 'Снять речи');
    await atPath(page, '/publishers/public-talks-retire');
    await back(page);
    await atPath(page, '/publishers/public-talks');
  });

  await check(page, 'A14', 'План окон: нажатие на НОМЕР 8 зажигает все три 8', async () => {
    await go(page, '/publishers/cleaning');
    await page.waitForTimeout(2000);
    // The first week row, then «Выбрать» next to the windows.
    await tap(page, /^После встреч/);
    await page.waitForTimeout(800);
    await tap(page, 'Выбрать');
    await see(page, 'Окна недели');
    const before = (await page.getByText(/^Окна: /).last().innerText().catch(() => '')) || '';
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.getByText(/^8$/).first().click();
    await page.waitForTimeout(600);
    const after = (await page.getByText(/^Окна: /).last().innerText().catch(() => '')) || '';
    await snap(page, 'A14-после-нажатия');
    await tap(page, 'Отмена');
    if (!/8/.test(after) || before === after) throw new Error(`строка под планом: было «${before}», стало «${after}»`);
    return `«${before}» → «${after}», отменено`;
  });

  // 25 September: only a version that has not started may be deleted — past
  // weeks are counted by the one in force then. So the check saves a version
  // starting on the 1st of this month NEXT year, deletes it, and makes sure
  // the version in force has no trash at all.
  await check(page, 'A15', '«Время и место встреч»: будущую версию можно удалить, действующую — нет', async () => {
    await go(page, '/publishers/meeting-settings', 'Сейчас действует');
    const trash = () => page.getByLabel('Удалить версию?', { exact: true });
    // Every trash belongs to a version marked «Ещё не действует», and none
    // to the one in force.
    const upcoming = () => page.getByText('Ещё не действует', { exact: true });
    const trashMatches = async () => {
      const [t, u] = [await trash().count(), await upcoming().count()];
      if (t !== u) throw new Error(`корзинок ${t}, а будущих версий ${u} — корзинка есть у действующей или прошлой`);
    };
    await see(page, 'Действует сейчас');
    await trashMatches();
    await see(page, /^Удалить можно только версию, которая ещё не начала действовать/);
    const now = new Date();
    const future = new Date(now.getFullYear() + 1, now.getMonth(), 1);
    const words = future.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
    const futureRow = () => page.getByText(new RegExp('^с ' + words.replace(/\./g, '\\.') + '$'));
    // A real version on that date would be overwritten by the save and then
    // deleted by this check — so then nothing is touched at all.
    if (await futureRow().count()) return `версия с ${words} уже есть — сохранение и удаление пропущены, ничего не менялось`;
    const before = await trash().count();
    await tap(page, 'Изменить расписание');
    await see(page, 'Действует с');
    const dialog = page.locator('[role="dialog"]').last();
    // The date field shows today in words; the calendar opens on this month.
    await dialog.getByText(/^\d{1,2} [а-яё]+ \d{4} г\.$/).first().click();
    await page.waitForTimeout(600);
    await page.getByText(new RegExp(`^[а-яё]+ ${now.getFullYear()}$`)).last().click();
    await page.getByText(new RegExp(`^${future.getFullYear()}$`)).last().click();
    await page.getByText(/^1$/).last().click();
    await page.waitForTimeout(600);
    await see(page, new RegExp('^' + words.replace(/\./g, '\\.') + '$'));
    await snap(page, 'A15-окно');
    await dialog.getByText(/^Сохранить$/).first().click();
    await futureRow().first().waitFor({ timeout: 15000 }).catch(() => {
      throw new Error(`версия с ${words} не появилась в истории`);
    });
    await page.waitForTimeout(1000);
    const row = futureRow().first().locator('xpath=ancestor::*[.//*[@aria-label="Удалить версию?"]][1]');
    if (!(await row.getByText('Ещё не действует', { exact: true }).count()))
      throw new Error('у будущей версии нет пометки «Ещё не действует»');
    const mid = await trash().count();
    await snap(page, 'A15-добавлена');
    await row.getByLabel('Удалить версию?', { exact: true }).first().click();
    await page.getByText(/^Удалить$/).last().click();
    await page.waitForTimeout(2000);
    if (await futureRow().count()) throw new Error(`версия с ${words} осталась — УДАЛИ ЕЁ РУКАМИ`);
    const after = await trash().count();
    await trashMatches();
    if (after !== before) throw new Error(`корзинок было ${before}, после удаления ${after} — ПРОВЕРЬ ИСТОРИЮ РУКАМИ`);
    return `с ${words}: корзинок было ${before}, стало ${mid}, снова ${after}; у действующей корзинки нет`;
  });

  await check(page, 'A16', '«Время и место встреч»: окно зала, «Отмена»', async () => {
    await go(page, '/publishers/meeting-settings', 'Сейчас действует');
    await tap(page, 'по умолчанию');
    await see(page, 'Изменить зал');
    await see(page, 'Сделать залом по умолчанию');
    await tap(page, 'Отмена');
  });

  await check(page, 'A17', 'Название и часовой пояс: окна; «Сейчас там» живое', async () => {
    await go(page, '/publishers/meeting-settings', 'Сейчас действует');
    await tap(page, 'Название собрания');
    await page.waitForTimeout(500);
    await tap(page, 'Отмена');
    await tap(page, 'Часовой пояс собрания');
    const input = page.locator('[role="dialog"]').last().locator('input').first();
    await input.fill('Europe/Nowhere');
    await see(page, /Такого часового пояса нет/);
    await input.fill('Asia/Tokyo');
    await see(page, /^Сейчас там:/);
    await snap(page, 'A17-пояс');
    await tap(page, 'Отмена');
  });

  await check(page, 'A18', 'Поле даты: пусто — «Выбрать дату», выбрал — словами', async () => {
    await go(page, '/publishers/new');
    await page.waitForTimeout(1500);
    const field = await see(page, 'Выбрать дату');
    await field.click();
    await page.waitForTimeout(800);
    await page.getByText(/^15$/).last().click();
    await page.waitForTimeout(800);
    await see(page, /^\d{1,2} [а-яё]+ \d{4} г\.$/);
    await snap(page, 'A18-дата');
    return 'новая карточка не сохранялась';
  });

  await check(page, 'A19', 'Профиль: нет служебных строк, разделы по разу', async () => {
    await go(page, '/profile', 'Язык');
    for (const w of ['Инструменты администратора', 'Импорт программы', 'Импорт расписания', 'Время и место встреч', 'Управление пользователями'])
      await notSee(page, w);
    for (const w of ['Уведомления', 'Мои данные']) {
      const n = await page.getByRole('heading', { name: w, exact: true }).count();
      if (n !== 1) throw new Error(`раздел «${w}» — ${n} раз(а)`);
    }
  });

  await check(page, 'A20', 'Немецкий: «KLASSENRAUM» на плане; обратно русский', async () => {
    const switchTo = async (fromRow, lang, confirmWord) => {
      await go(page, '/profile');
      await tap(page, fromRow);
      await tap(page, lang);
      const c = page.getByText(new RegExp(`^${confirmWord}$`)).last();
      if (await c.count()) await c.click();
      await page.waitForTimeout(1500);
    };
    await switchTo('Язык', 'Deutsch', 'Подтвердить');
    try {
      await go(page, '/publishers/cleaning');
      await page.waitForTimeout(2000);
      await tap(page, 'Auf dem Plan');
      await see(page, /^Klassenraum$/i);
      await snap(page, 'A20-план-по-немецки');
      await page.getByText(/^Schließen$/).first().click().catch(() => {});
    } finally {
      await switchTo('Sprache', 'Русский', 'Bestätigen');
    }
    await go(page, '/profile');
    await see(page, 'Язык');
    return 'язык возвращён на русский';
  });

  await check(page, 'A21', 'Главная → «Все мои задания» → одна шапка → назад на Главную', async () => {
    await go(page, '/home', 'Ближайшие две недели');
    await tap(page, 'Все мои задания');
    await atPath(page, '/home/my-assignments');
    await page.waitForTimeout(1500);
    // One header — the screen once drew a second one under the stack's.
    const titles = await page.getByText(/^Мои задания$/).filter({ visible: true }).count();
    if (titles !== 1) throw new Error(`заголовок «Мои задания» виден ${titles} раз(а)`);
    await snap(page, 'A21-мои-задания');
    await back(page);
    await atPath(page, '/home');
  });
  // 25 September: an arrow used to empty the screen to a spinner and refill it
  // piece by piece. Now the week being left stays, dimmed, until the next one
  // is in hand — so the meeting cards must never disappear, and must end up
  // where they were.
  await check(page, 'A22', 'Составление: стрелки недель — карточки встреч не пропадают и не прыгают', async () => {
    await go(page, `/schedule/edit?week=${mondayPlus(0)}`, /^Встреча в (будний|выходной) день$/);
    await page.waitForTimeout(1500);
    const cardsTop = () =>
      page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find(
          (d) => d.childElementCount === 0 && /^Встреча в (будний|выходной) день$/.test(d.textContent || ''),
        );
        return el && el.offsetParent !== null ? Math.round(el.getBoundingClientRect().top) : null;
      });
    const before = await cardsTop();
    for (const label of ['Следующая неделя', 'Предыдущая неделя']) {
      await page.getByLabel(label, { exact: true }).first().click();
      const seen = new Set();
      for (let i = 0; i < 30; i++) {
        seen.add(await cardsTop());
        await page.waitForTimeout(50);
      }
      if (seen.has(null)) throw new Error(`после «${label}» карточки встреч пропадали`);
      if (seen.size > 1) throw new Error(`после «${label}» карточки прыгали: ${[...seen].join(' → ')}`);
    }
    const after = await cardsTop();
    if (after !== before) throw new Error(`карточки сдвинулись: ${before} → ${after}`);
    return `на месте, ${before} точек от верха`;
  });

  await keep();
  await ctx.close();
}

// --- the elder without assignments -------------------------------------------
try {
  const { ctx, page, keep } = await signedIn(browser, ELDER);
  acceptDialogs(page);
  console.log('\n— Старейшина без поручений —');
  await check(page, 'B01', '«Управление»: каталог и импорт песен, без админских строк', async () => {
    await go(page, '/publishers');
    await page.waitForTimeout(1500);
    await see(page, 'Каталог публичных речей');
    await see(page, 'Импорт песен');
    for (const w of ['Управление пользователями', 'Журнал изменений', 'Районный старейшина', 'Ответственные'])
      await notSee(page, w);
  });
  await check(page, 'B02', 'Программа → «…» → есть «Составление программы»', async () => {
    await go(page, '/schedule', /^Сегодня ·/);
    await page.getByLabel('Ещё', { exact: true }).first().click();
    await see(page, 'Составление программы');
  });
  if (memorialWeek) {
    await check(page, 'B03', 'Неделя Вечери: программа видна, «Править» есть', async () => {
      await go(page, `/schedule?week=${memorialWeek}&meeting=memorial`);
      const card = page.getByTestId(`memorial-${memorialWeek}`);
      await card.waitFor({ timeout: 30000 });
      await page.waitForTimeout(2500);
      if (!(await card.getByText(/^Править программу$/).count())) throw new Error('нет «Править программу»');
    });
  } else skip('B03', 'Неделя Вечери у старейшины', 'нет Вечери (см. A08)');
  await check(page, 'B04', 'Служение: старейшина видит «Отчёты по группе» и «Посещаемость встреч», лист открывается', async () => {
    await go(page, '/service-reports');
    await see(page, 'Отчёты по группе');
    await tap(page, 'Посещаемость встреч');
    await atPath(page, '/service-reports/attendance');
    await page.waitForTimeout(2000);
    await notSee(page, 'Нет доступа');
  });
  await keep();
  await ctx.close();
} catch (e) {
  skip('B', 'Старейшина без поручений', String(e.message || e));
}

// --- the publisher -----------------------------------------------------------
try {
  const { ctx, page, keep } = await signedIn(browser, PUBLISHER);
  acceptDialogs(page);
  console.log('\n— Возвещатель —');
  await check(page, 'C01', 'Программа: сразу мегафон, без «…»; открывает События', async () => {
    await go(page, '/schedule', /^Сегодня ·/);
    if (await hasLabel(page, 'Ещё')) throw new Error('есть «…», а у возвещателя должен быть значок');
    await page.getByLabel('События', { exact: true }).first().click();
    await atPath(page, '/special-events');
  });
  if (memorialWeek) {
    await check(page, 'C02', 'Неделя Вечери: черновик — «готовится», опубликована — программа и «Печать»; «Править» нет', async () => {
      await go(page, `/schedule?week=${memorialWeek}&meeting=memorial`);
      const card = page.getByTestId(`memorial-${memorialWeek}`);
      await card.waitFor({ timeout: 30000 });
      await page.waitForTimeout(2500);
      if (await card.getByText(/^Править программу$/).count()) throw new Error('есть «Править программу»');
      // A draft is for those who prepare it (24 September).
      if (await card.getByText(/^Программа Вечери готовится$/).count()) {
        if (await card.getByText(/^Печать$/).count()) throw new Error('черновик, а «Печать» есть');
        if (await card.getByText(/Черновик/).count()) throw new Error('возвещателю видна плашка черновика');
        return 'черновик: «Программа Вечери готовится», печати нет';
      }
      if (!(await card.getByText(/^Печать$/).count())) throw new Error('опубликована, а «Печать» нет');
      return 'опубликована: программа и «Печать»';
    });
  } else skip('C02', 'Неделя Вечери у возвещателя', 'нет Вечери (см. A08)');
  await check(page, 'C03', 'Собрание: нет «Управления», «Ответственных», «Составления»', async () => {
    await go(page, '/publishers');
    await page.waitForTimeout(1500);
    for (const w of ['Управление', 'Ответственные', 'Составление программы']) await notSee(page, w);
  });
  await check(page, 'C04', 'Служение: нет «Посещаемость встреч»; по адресу — «Нет доступа»', async () => {
    await go(page, '/service-reports');
    await page.waitForTimeout(2000);
    await notSee(page, 'Посещаемость встреч');
    await go(page, '/service-reports/attendance');
    await see(page, 'Нет доступа');
  });
  await check(page, 'C07', 'Служение: нет «Отчёты по группе» (он не надзиратель группы)', async () => {
    await go(page, '/service-reports');
    await page.waitForTimeout(2500);
    await notSee(page, 'Отчёты по группе');
  });
  // 25 September: one meeting open at a time (Lionel), and the tapped row once
  // flew off the screen by the height of the card that closed above it. Two
  // cases, each watched on every frame — one frame in the wrong place is a
  // jump:
  //  1. the open card above is still partly on screen: the tapped row stays
  //     put and opens, the card above stays open; scrolled on until it has
  //     left the screen, it closes — and what is on screen does not move;
  //  2. the open card above is already out of sight: it closes at once and
  //     the tapped row stays put.
  await check(page, 'C08', 'Программа: нажатая плашка остаётся на месте, открыта одна', async () => {
    const helpers = () => {
      window.__sc = (el) => {
        let sc = el.parentElement;
        while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
        return sc;
      };
      window.__open = () =>
        [...document.querySelectorAll('[data-testid^="meeting-"]')]
          .filter((el) => el.getBoundingClientRect().height > 300)
          .map((el) => el.getAttribute('data-testid'));
      window.__watch = (id, n) => {
        window.__tops = [];
        const tick = () => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          window.__tops.push(el ? Math.round(el.getBoundingClientRect().top) : null);
          if (window.__tops.length < n) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
    };
    const land = async () => {
      await go(page, '/schedule', /^Сегодня ·/);
      await page.waitForTimeout(2500);
      await page.evaluate(helpers);
      // The open card is the tallest row; the row after it is the one to tap.
      return page.evaluate(() => {
        const rows = [...document.querySelectorAll('[data-testid^="meeting-"]')];
        let open = -1, h = 0;
        rows.forEach((el, i) => { const r = el.getBoundingClientRect().height; if (r > h) { h = r; open = i; } });
        const next = rows[open + 1];
        return open >= 0 && next && h > 300
          ? { upper: rows[open].getAttribute('data-testid'), target: next.getAttribute('data-testid') }
          : null;
      });
    };
    const placeAt = (id, y) =>
      page.evaluate(([id, y]) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        const sc = window.__sc(el);
        const want = y === 'top' ? sc.getBoundingClientRect().top : y;
        sc.scrollTop += el.getBoundingClientRect().top - want;
      }, [id, y]);
    const topOf = (id) =>
      page.evaluate((id) => Math.round(document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().top), id);
    const tapWatch = async (id) => {
      const before = await topOf(id);
      await page.evaluate((id) => window.__watch(id, 60), id);
      await page.mouse.click(200, before + 25);
      await page.waitForTimeout(1500);
      const tops = await page.evaluate(() => window.__tops);
      const moved = [...new Set(tops)].filter((t) => t !== before);
      if (moved.length) throw new Error(`плашка ${id} сдвигалась: ${before} → ${moved.join(', ')}`);
      return before;
    };

    // 1 — the card above still partly on screen.
    let pair = await land();
    if (!pair) return 'нет открытой встречи с плашкой после неё — нечего проверять';
    await placeAt(pair.target, 420);
    await page.waitForTimeout(600);
    const y1 = await tapWatch(pair.target);
    let open = await page.evaluate(() => window.__open());
    if (!open.includes(pair.target)) throw new Error(`нажатая ${pair.target} не открылась`);
    if (!open.includes(pair.upper)) throw new Error(`${pair.upper} ещё видна, но закрылась — плашка под ней должна была уехать`);
    // Scroll on, 40 points at a time, until the card above has left; watch the
    // tapped one on screen — it moves by the 40 points of each step and by
    // nothing else, also in the step where the card above closes (the list's
    // own position may change then: that is the correction, not a move).
    const drift = await page.evaluate(async ([id, upper]) => {
      const el = () => document.querySelector(`[data-testid="${id}"]`);
      const sc = window.__sc(el());
      const bad = [];
      for (let i = 0; i < 40; i++) {
        if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 41) break;
        const t0 = el().getBoundingClientRect().top;
        sc.scrollTop += 40;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const moved = el().getBoundingClientRect().top - t0;
        if (Math.abs(moved + 40) > 1) bad.push(`${Math.round(moved)} вместо −40`);
        const u = document.querySelector(`[data-testid="${upper}"]`);
        if (u && u.getBoundingClientRect().height < 300) break;
      }
      return bad;
    }, [pair.target, pair.upper]);
    if (drift.length) throw new Error(`при закрытии верхней плашка ${pair.target} дёрнулась: ${drift.join('; ')}`);
    open = await page.evaluate(() => window.__open());
    if (open.includes(pair.upper)) throw new Error(`${pair.upper} ушла с экрана, но не закрылась`);

    // 2 — the card above already out of sight.
    pair = await land();
    await placeAt(pair.target, 'top');
    await page.waitForTimeout(600);
    const y2 = await tapWatch(pair.target);
    open = await page.evaluate(() => window.__open());
    if (open.length !== 1 || open[0] !== pair.target)
      throw new Error(`после нажатия открыты: ${open.join(', ') || 'никакие'} — должна одна ${pair.target}`);
    return `${pair.target} на месте (${y1} и ${y2} точек), верхняя закрылась, когда ушла`;
  });
  // The chairman heads the programme card, weekday and weekend alike.
  for (const kind of ['midweek', 'weekend']) {
    const id = kind === 'midweek' ? 'C05' : 'C06';
    await check(page, id, `Программа: у ${kind === 'midweek' ? 'будней' : 'выходной'} встречи строка «Председатель» в карточке`, async () => {
      const week = mondayPlus(1);
      await go(page, `/schedule?week=${week}&meeting=${kind}`);
      const card = page.getByTestId(`meeting-${week}-${kind}`);
      await card.waitFor({ timeout: 30000 });
      await page.waitForTimeout(2000);
      if (!(await card.getByText(/^Председатель$/).filter({ visible: true }).count()))
        throw new Error(`нет строки «Председатель» на неделе ${week}`);
      return `неделя ${week}`;
    });
  }
  await keep();
  await ctx.close();
} catch (e) {
  skip('C', 'Возвещатель', String(e.message || e));
}

await browser.close();

// --- the report ----------------------------------------------------------------
const ok = results.filter((r) => r.ok === true).length;
const bad = results.filter((r) => r.ok === false).length;
const skipped = results.filter((r) => r.ok === null).length;
const lines = [
  `Обход ${stamp} — ✅ ${ok} · ❌ ${bad} · ⚠️ ${skipped}`,
  codeLine,
  '',
  ...results.map((r) => `${r.ok === true ? '✅' : r.ok === false ? '❌' : '⚠️'} ${r.id} ${r.title}${r.note ? ' — ' + r.note : ''}${r.file ? ` [${r.file}]` : ''}`),
  '',
  'Не входит в обход: сводка за август на боевом сайте (86 и 2) — только руками.',
];
writeFileSync(join(OUT, 'report.txt'), lines.join('\n') + '\n', 'utf8');
console.log('\n' + lines.join('\n'));
console.log(`\nГотово: ${OUT}`);
process.exit(bad ? 1 : 0);
