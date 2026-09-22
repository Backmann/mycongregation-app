#!/usr/bin/env node
/**
 * Снимки ленты программы — одной командой, без рук.
 *
 * Входит под администратором, открывает /schedule/feed, щёлкает вкладки
 * раскрытой встречи, раскрывает воскресенье и день проповеди, снимает
 * прошедшие; потом входит под возвещателем; потом открывает ленту на широком
 * экране. Всё — в папку .screens/<дата-время>/.
 *
 * Зачем: «посмотри глазами» превращается в повторяемую проверку. После любой
 * правки — те же снимки, и «было — стало» сравнивается точно, а не по памяти.
 *
 * Нужно один раз:
 *     npm i -D playwright
 *     npx playwright install chromium
 * Запуск (сервер и Expo web должны работать):
 *     npm run screens
 *
 * Можно переопределить: APP_URL, ADMIN, PUBLISHER, PASSWORD.
 *
 * Если что-то не найдено, скрипт сохраняет ERROR.png и печатает, какие поля и
 * кнопки видит на странице, — чтобы поправить его за один заход.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.APP_URL || 'http://localhost:8081';
const ADMIN = process.env.ADMIN || 'bauer800@example.invalid';
const PUBLISHER = process.env.PUBLISHER || 'bergman855@example.invalid';
const PASSWORD = process.env.PASSWORD || 'local12345';

// Local wall-clock time for the folder name — not toISOString(), which is UTC
// and which the «no UTC calendar dates» check rightly refuses.
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
const OUT = join(process.cwd(), '.screens', stamp);
mkdirSync(OUT, { recursive: true });

const PHONE = { width: 390, height: 5200 }; // tall: the whole list fits, no inner scrolling
const DESKTOP = { width: 1280, height: 900 };
const REAL_PHONE = { width: 390, height: 844 };

/** Does the feed open on «today»? A real-size window, where it has to scroll. */
async function landing(page, name) {
  await page.waitForTimeout(1500);
  const box = await page.getByText(/^Сегодня ·/).first().boundingBox();
  const vp = page.viewportSize();
  const ok = !!box && box.y >= 0 && box.y < vp.height * 0.5;
  console.log(`· посадка на «Сегодня» (${name}): ${ok ? 'да' : 'НЕТ'}${box ? ` — черта на ${Math.round(box.y)} из ${vp.height}` : ' — черты не видно'}`);
  return ok;
}

async function fail(page, what) {
  const file = join(OUT, 'ERROR.png');
  await page.screenshot({ path: file }).catch(() => {});
  const buttons = await page.locator('[role="button"], button, [role="tab"]').allInnerTexts().catch(() => []);
  const inputs = await page
    .locator('input')
    .evaluateAll((els) => els.map((e) => `${e.type || 'text'}${e.placeholder ? ` «${e.placeholder}»` : ''}`))
    .catch(() => []);
  console.error(`\nОСТАНОВКА: ${what}`);
  console.error(`адрес: ${page.url()}`);
  console.error(`поля: ${inputs.join(' | ') || '—'}`);
  console.error(`кнопки: ${buttons.map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 25).join(' | ') || '—'}`);
  console.error(`снимок: ${file}`);
  process.exit(1);
}

async function login(page, email) {
  await page.goto(BASE);
  const pw = page.locator('input[type="password"]').first();
  try {
    await pw.waitFor({ timeout: 30000 });
  } catch {
    await fail(page, `вход (${email}): не видно поля пароля`);
  }
  // The language question can stand over the sign-in page too; a key press
  // went through its layer, a click does not — so answer it first.
  await answerLanguage(page);
  await page.locator('input:not([type="password"])').first().fill(email);
  await pw.fill(PASSWORD);
  // The sign-in button has no button role, so it is found by its label. The
  // server's answer is printed: it tells a refusal, the limiter (6 tries per
  // name in 15 minutes) and a request that never left apart.
  const answer = page
    .waitForResponse((r) => /\/auth\/login/.test(r.url()) && r.request().method() === 'POST', { timeout: 15000 })
    .catch(() => null);
  const submit = page.getByText(/^(Войти|Log in|Sign in|Anmelden)$/).last();
  if (await submit.count()) await submit.click();
  else await pw.press('Enter');
  const res = await answer;
  console.log(`· вход (${email}): ${res ? 'сервер ответил ' + res.status() : 'запрос входа не ушёл'}`);
  try {
    await pw.waitFor({ state: 'detached', timeout: 30000 });
  } catch {
    // Whatever the sign-in page says — a wrong password, too many attempts.
    const said = await page
      .getByText(/попыт|слишком|неверн|ошиб|подожд|attempt|too many|wrong|error/i)
      .allInnerTexts()
      .catch(() => []);
    if (said.length) console.error(`страница входа говорит: «${said.join(' | ').replace(/\s+/g, ' ').trim()}»`);
    await fail(page, `вход (${email}): страница входа не ушла`);
  }
}

/**
 * A signed-in window, signing in only when there is no living session.
 *
 * The server limits how often one may sign in, so the script keeps the session
 * after the first sign-in (in .screens/, which git ignores) and opens the app
 * already signed in on every later run. A session that has expired is replaced.
 */
async function signedIn(browser, email, viewport) {
  mkdirSync(join(process.cwd(), '.screens'), { recursive: true });
  const file = join(process.cwd(), '.screens', `.session-${email.replace(/[^a-z0-9]/gi, '_')}.json`);
  if (existsSync(file)) {
    const ctx = await browser.newContext({ viewport, locale: 'ru-RU', storageState: file });
    const page = await ctx.newPage();
    await page.goto(BASE);
    // The app shows the sign-in page for a moment while it restores a session,
    // so wait for a sign of being inside rather than judging at first sight.
    const inside = page.getByText(/^Главная$/).first();
    const alive = await inside.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    if (alive) {
      console.log(`· вход (${email}): сохранённая сессия`);
      return { ctx, page };
    }
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await login(page, email);
  await ctx.storageState({ path: file });
  console.log(`· вход (${email}): новый, сессия сохранена`);
  return { ctx, page };
}

/**
 * The first-run language window. A fresh browser has no language chosen yet,
 * so the app asks — over everything, with a full-screen layer that takes every
 * tap. A person answers it once; the script answers it the same way.
 */
async function answerLanguage(page) {
  const dialog = page.locator('[role="dialog"]').filter({ hasText: /Выберите язык|Choose .*language|Sprache/i });
  try {
    await dialog.first().waitFor({ timeout: 3000 });
  } catch {
    return; // no question asked — nothing to answer
  }
  await dialog.getByText(/^Русский$/).first().click();
  await dialog.getByText(/^Подтвердить$|^Confirm$|^Bestätigen$/).first().click();
  try {
    await dialog.first().waitFor({ state: 'detached', timeout: 10000 });
  } catch {
    await fail(page, 'окно выбора языка не закрылось');
  }
  console.log('· язык выбран: русский');
}

async function openFeed(page) {
  await page.goto(`${BASE}/schedule/feed`);
  try {
    await page.getByText(/^Сегодня ·/).first().waitFor({ timeout: 30000 });
  } catch {
    await fail(page, 'лента: не появилась черта «Сегодня»');
  }
  await answerLanguage(page);
  await page.waitForTimeout(1500); // let every piece of the list arrive
}

/** A picture of the part of the screen around one element. */
async function around(page, locator, name, { above = 260, height = 1100 } = {}) {
  const box = await locator.boundingBox();
  if (!box) await fail(page, `${name}: элемент не на экране`);
  const vp = page.viewportSize();
  const y = Math.max(0, box.y - above);
  await page.screenshot({
    path: join(OUT, name),
    clip: { x: 0, y, width: vp.width, height: Math.min(height, vp.height - y) },
  });
  console.log(`· ${name}`);
}

/**
 * What lies on top at the element's centre — the element itself, or something
 * covering it. Prints the chain of ancestors with size, position and text, so
 * the text tells which component a covering layer belongs to.
 */
async function whoCovers(page, locator) {
  const box = await locator.first().boundingBox();
  if (!box) return 'у элемента нет рамки';
  return page.evaluate(({ x, y }) => {
    const chain = [];
    let n = document.elementFromPoint(x, y);
    for (let i = 0; n && i < 10; i++, n = n.parentElement) {
      const r = n.getBoundingClientRect();
      const role = n.getAttribute('role');
      const label = n.getAttribute('aria-label');
      const text = (n.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70);
      const style = getComputedStyle(n);
      chain.push(
        `${n.tagName.toLowerCase()}${role ? '[role=' + role + ']' : ''}${label ? ' aria-label=«' + label + '»' : ''}` +
          ` ${Math.round(r.width)}×${Math.round(r.height)} сверху ${Math.round(r.top)}` +
          ` ${style.position}${style.opacity !== '1' ? ' opacity ' + style.opacity : ''}${style.pointerEvents !== 'auto' ? ' pointer-events ' + style.pointerEvents : ''}` +
          ` текст «${text}»`,
      );
    }
    return chain.join('\n   ↑ ');
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

async function click(page, locator, what) {
  if (!(await locator.count())) await fail(page, `не найдено: ${what}`);
  try {
    await locator.first().click({ timeout: 5000 });
  } catch {
    console.error(`\nНАЖАТИЕ НЕ ПРОШЛО: ${what}`);
    console.error(`сверху в точке нажатия лежит:\n   ${await whoCovers(page, locator)}`);
    await fail(page, `${what}: нажатие перехвачено`);
  }
  await page.waitForTimeout(500);
}

const browser = await chromium.launch();
try {
  // --- Администратор, телефон ---
  const { ctx: admin, page: a } = await signedIn(browser, ADMIN, PHONE);
  await openFeed(a);

  const today = a.getByText(/^Сегодня ·/).first();
  await around(a, today, '01-open-default.png', { above: 20, height: 2000 });

  await click(a, a.getByRole('tab', { name: /Обязанности/ }), 'вкладка «Обязанности»');
  await around(a, a.getByRole('tablist').first(), '02-duties.png', { above: 200, height: 900 });

  await click(a, a.getByRole('tab', { name: /Уборка/ }), 'вкладка «Уборка»');
  await around(a, a.getByRole('tablist').first(), '03-cleaning.png', { above: 200, height: 600 });

  const sunday = a.getByRole('button', { name: /Как Библия может вам помочь/ });
  await click(a, sunday, 'воскресенье 27-го');
  await around(a, sunday.first(), '04-sunday.png', { above: 20, height: 1200 });

  const saturday = a.getByRole('button', { name: /Ahlen/ });
  await click(a, saturday, 'суббота с проповедью');
  await around(a, saturday.first(), '05-saturday.png', { above: 20, height: 700 });

  const past = a.getByText(/^Прошли$/i).first();
  if (await past.count()) await around(a, past, '06-past.png', { above: 60, height: 1600 });
  else console.log('· 06-past.png — пропущено: прошедших нет');

  // --- Тот же вход, окна настоящих размеров: где лента встаёт ---
  // One sign-in for all of these: the server limits how often one may sign in,
  // and a fourth sign-in within a minute was refused.
  const landings = [];
  await a.setViewportSize(DESKTOP);
  await openFeed(a);
  landings.push(await landing(a, 'ноутбук'));
  await a.screenshot({ path: join(OUT, '08-desktop.png') });
  console.log('· 08-desktop.png');

  // На широком экране строка не раскрывается, а выбирает: справа — выбранная встреча.
  const sundayWide = a.getByRole('button', { name: /Как Библия может вам помочь/ });
  if (await sundayWide.count()) {
    await sundayWide.first().click();
    await a.waitForTimeout(700);
    await a.screenshot({ path: join(OUT, '11-desktop-sunday.png') });
    const right = await a.getByText(/^Не прекращайте узнавать Иегову$/).count();
    console.log(`· 11-desktop-sunday.png — справа воскресенье: ${right ? 'да' : 'НЕТ'}`);
  } else console.log('· 11-desktop-sunday.png — пропущено: воскресенья 27-го нет в списке');

  await a.setViewportSize(REAL_PHONE);
  await openFeed(a);
  landings.push(await landing(a, 'телефон'));
  await a.screenshot({ path: join(OUT, '09-phone-landing.png') });
  console.log('· 09-phone-landing.png');

  // --- «Впереди»: «Показать ещё» до конца программы, затем то, что за ним ---
  for (let i = 0; i < 12; i++) {
    const more = a.getByText(/^Показать ещё$/);
    if (!(await more.count())) break;
    await more.first().click();
    await a.waitForTimeout(1500);
  }
  const end = a.getByText(/^Дальше программы нет$/).first();
  if (await end.count()) {
    await end.scrollIntoViewIfNeeded();
    await a.waitForTimeout(300);
    await a.screenshot({ path: join(OUT, '10-ahead.png') });
    const aheadRows = await a.getByText(/^Впереди$/).count();
    console.log(`· 10-ahead.png — «Впереди» ${aheadRows ? 'есть' : 'НЕТ'}`);
  } else console.log('· 10-ahead.png — пропущено: конец программы не показался');
  await admin.close();

  // --- Возвещатель, телефон ---
  const { ctx: pub, page: p } = await signedIn(browser, PUBLISHER, PHONE);
  await openFeed(p);
  await around(p, p.getByText(/^Сегодня ·/).first(), '07-publisher.png', { above: 20, height: 1800 });
  await pub.close();

  if (landings.includes(false)) console.log('\nВНИМАНИЕ: лента открылась не на «Сегодня» — см. строки «посадка» выше');
  console.log(`\nГотово: ${OUT}`);
} finally {
  await browser.close();
}
