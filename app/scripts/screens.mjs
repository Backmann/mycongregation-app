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
import { mkdirSync } from 'node:fs';
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
  await page.locator('input:not([type="password"])').first().fill(email);
  await pw.fill(PASSWORD);
  const button = page.getByRole('button', { name: /войти|log in|sign in|anmelden/i }).first();
  if (await button.count()) await button.click();
  else await pw.press('Enter');
  try {
    await pw.waitFor({ state: 'detached', timeout: 30000 });
  } catch {
    await fail(page, `вход (${email}): страница входа не ушла`);
  }
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
  const admin = await browser.newContext({ viewport: PHONE, locale: 'ru-RU' });
  const a = await admin.newPage();
  await login(a, ADMIN);
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
  await admin.close();

  // --- Возвещатель, телефон ---
  const pub = await browser.newContext({ viewport: PHONE, locale: 'ru-RU' });
  const p = await pub.newPage();
  await login(p, PUBLISHER);
  await openFeed(p);
  await around(p, p.getByText(/^Сегодня ·/).first(), '07-publisher.png', { above: 20, height: 1800 });
  await pub.close();

  // --- Администратор, широкий экран ---
  const wide = await browser.newContext({ viewport: DESKTOP, locale: 'ru-RU' });
  const w = await wide.newPage();
  await login(w, ADMIN);
  await openFeed(w);
  await w.screenshot({ path: join(OUT, '08-desktop.png') });
  console.log('· 08-desktop.png');
  await wide.close();

  console.log(`\nГотово: ${OUT}`);
} finally {
  await browser.close();
}
