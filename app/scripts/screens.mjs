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
 *     node scripts/screens.mjs [before|after]
 *
 * Called directly, NOT as an npm script: the "scripts" block of package.json is
 * part of the Expo fingerprint (runtimeVersion policy "fingerprint"), and a new
 * line there changes it — updates published over the air then no longer reach
 * the APK already installed on phones.
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
// An optional label — «before», «after» — so two runs in the same minute do
// not land in one folder, and a comparison can find them by name.
const LABEL = (process.argv[2] || '').replace(/[^a-z0-9-]/gi, '');
const OUT = join(process.cwd(), '.screens', LABEL ? `${stamp}_${LABEL}` : stamp);
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
 * (in .screens/, which git ignores) and opens the app already signed in on
 * every later run. A session that has expired is replaced.
 *
 * The session is kept at the END of the window's work — keep() — not right
 * after signing in. The page renews its refresh token as it runs, and the
 * server rotates it on every use and reads a token presented twice as stolen:
 * it revokes the whole family (auth, refresh_sessions). A file written right
 * after sign-in held a token the page had already spent, so the next run
 * presented it, the server revoked it, and every run signed in anew. Kept at
 * the end, the file holds the token nobody has used yet.
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
      return { ctx, page, keep: () => keep(ctx, file, email) };
    }
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await login(page, email);
  console.log(`· вход (${email}): новый`);
  return { ctx, page, keep: () => keep(ctx, file, email) };
}

/** Write the window's session to its file — the last refresh token it holds. */
async function keep(ctx, file, email) {
  await ctx.storageState({ path: file });
  console.log(`· сессия (${email}) сохранена в конце работы окна`);
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

/**
 * The congregation's contents, as one person sees them. Which rows stand is
 * the check of rights: each word that must be there, each that must not.
 */
/**
 * Rows that left the Profile in step 3a (22 September) — none may be there for
 * anyone, the admin included; the old delete-account wording neither.
 */
const MOVED_OUT_OF_PROFILE = [
  'Управление пользователями', 'Ответственные', 'Обязанности', 'Районный старейшина',
  'Журнал изменений', 'Резервные копии', 'Каталог публичных речей', 'Песни', 'Импорт песен',
  'Инструкция по уборке зала Царства', 'Удалить аккаунт и данные',
];

/** The admin's «Administration» section — the rows that came from the Profile. */
async function management(page) {
  const label = page.getByText(/^Управление$/).first();
  if (!(await label.count())) { console.log('· 25-congregation-management.png — НЕ ТАК: нет раздела «Управление»'); return; }
  await label.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await around(page, label, '25-congregation-management.png', { above: 40, height: 700 });
  await words(page, '25-congregation-management.png',
    ['Управление пользователями', 'Журнал изменений', 'Каталог публичных речей', 'Импорт песен', 'Районный старейшина'], []);
}

/** The Profile, whole: what must stay, and what must have left. */
async function profileFrame(page, name, expect, forbid) {
  await page.goto(`${BASE}/profile`);
  await page.getByText(/^Язык$/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await answerLanguage(page);
  await page.waitForTimeout(1000);
  const vp = page.viewportSize();
  await page.screenshot({ path: join(OUT, name), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 2600) } });
  await words(page, name, expect, forbid);
  // Step 3b merged the two «Уведомления» and the two «Мои данные» sections.
  // Counted as HEADINGS: «Уведомления» is also the title of the row under its
  // own heading, and counting text read that as a second section (22 Sept).
  const twice = [];
  for (const w of ['Мои данные', 'Уведомления']) {
    const n = await page.getByRole('heading', { name: w, exact: true }).count();
    if (n > 1) twice.push(`«${w}» ${n} раза`);
  }
  const headings = await page.getByRole('heading').count();
  console.log(`· ${name} — разделы без повторов: ${twice.length ? 'НЕТ, ' + twice.join(', ') : 'да'} (заголовков разделов: ${headings})`);
}

/**
 * «Время и место встреч» — one screen since step 3b: what is in force, the
 * history, the halls, the congregation; then the schedule window, opened
 * and closed with «Отмена» so nothing is saved.
 */
async function meetingPlace(page) {
  await page.goto(`${BASE}/publishers/meeting-settings`);
  await page.getByText(/^Сейчас действует$/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await answerLanguage(page);
  await page.waitForTimeout(1000);
  const vp = page.viewportSize();
  await page.screenshot({ path: join(OUT, '28-meeting-place.png'), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 1800) } });
  await words(page, '28-meeting-place.png',
    ['Сейчас действует', 'Изменить расписание', 'Залы Царства', 'Добавить зал', 'Собрание', 'Название собрания', 'Часовой пояс собрания'], []);
  const change = page.getByText(/^Изменить расписание$/).first();
  if (!(await change.count())) return;
  await change.click();
  const title = page.getByRole('dialog').getByText(/^Изменить расписание$/).first();
  await title.waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  await around(page, title, '29-meeting-schedule-window.png', { above: 40, height: 900 });
  await words(page, '29-meeting-schedule-window.png',
    ['Встреча в будний день', 'Встреча в выходной день', 'Адрес Зала Царства', 'Действует с'], []);
  await page.getByRole('dialog').getByText(/^Отмена$/).first().click();
  await page.waitForTimeout(400);
}

/**
 * An old Profile address still leads to the screen, now in the Congregation
 * stack — for bookmarks and anything else that kept the old path.
 */
async function redirectCheck(page) {
  for (const [from, to] of [
    ['/profile/journal', '/publishers/journal'],
    ['/profile/halls', '/publishers/meeting-settings'],
  ]) {
    await page.goto(`${BASE}${from}`);
    const ok = await page.waitForURL((url) => url.pathname === to, { timeout: 15000 }).then(() => true).catch(() => false);
    console.log(`· переадресация ${from} → ${to}: ${ok ? 'да' : 'НЕТ, адрес ' + page.url()}`);
  }
}

async function hub(page, name, expect, forbid) {
  await page.goto(`${BASE}/publishers`);
  await page.getByText(/^(Люди|Моя группа)$/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await answerLanguage(page);
  await page.waitForTimeout(800);
  const vp = page.viewportSize();
  await page.screenshot({ path: join(OUT, name), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 900) } });
  const bad = [];
  for (const w of expect) if (!(await page.getByText(new RegExp('^' + w + '$')).count())) bad.push('нет «' + w + '»');
  for (const w of forbid) if (await page.getByText(new RegExp('^' + w + '$')).count()) bad.push('лишнее «' + w + '»');
  console.log('· ' + name + ' — ' + (bad.length ? 'НЕ ТАК: ' + bad.join(', ') : 'строки как положено'));
}

/**
 * The programme screen after duties and cleaning moved out: where the two
 * sections were stand two doors naming where they went, the section titles
 * are gone, and the cleaning door opens this week's cleaning.
 */
async function programmeSections(page) {
  await page.goto(`${BASE}/schedule`);
  const door = page.getByText(/^Уборка зала$/).first();
  await door.waitFor({ timeout: 30000 }).catch(() => {});
  await answerLanguage(page);
  if (!(await door.count())) {
    console.log('· 14/15 — НЕ ТАК: на экране программы нет двери «Уборка зала»');
    return;
  }
  await page.waitForTimeout(1200);
  await around(page, door, '14-programme-moved.png', { above: 160, height: 500 });
  await words(page, '14-programme-moved.png',
    ['Обязанности на встречах', 'Уборка зала',
     'Теперь в своём экране: Собрание → Встречи', 'Теперь в своём экране: Собрание → Зал Царства'],
    ['Обязанности', 'Уборка']);
  await door.click();
  await page.getByText(/^Уборка после встреч$/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const vp = page.viewportSize();
  await page.screenshot({ path: join(OUT, '15-programme-to-cleaning.png'), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 900) } });
  await words(page, '15-programme-to-cleaning.png', ['Уборка после встреч', 'Еженедельная уборка'], []);
}

/** Words that must stand and words that must not — the check of rights. */
async function words(page, name, expect, forbid, labels = { must: [], mustNot: [] }) {
  const bad = [];
  for (const w of expect) if (!(await page.getByText(new RegExp('^' + w + '$')).count())) bad.push('нет «' + w + '»');
  for (const w of forbid) if (await page.getByText(new RegExp('^' + w + '$')).count()) bad.push('лишнее «' + w + '»');
  for (const l of labels.must) if (!(await page.getByLabel(l).count())) bad.push('нет кнопки «' + l + '»');
  for (const l of labels.mustNot) if (await page.getByLabel(l).count()) bad.push('лишняя кнопка «' + l + '»');
  console.log('· ' + name + ' — ' + (bad.length ? 'НЕ ТАК: ' + bad.join(', ') : 'как положено'));
}

/** «Hall cleaning»: the list of weeks, and (for the first account) one week opened. */
async function cleaningFrames(page, name, expect, forbid, labels, weekFrame, planFrame) {
  await page.goto(`${BASE}/publishers/cleaning`);
  await page.getByText(/^Эта неделя$/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await answerLanguage(page);
  await page.waitForTimeout(1200);
  const vp = page.viewportSize();
  await page.screenshot({ path: join(OUT, name), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 900) } });
  await words(page, name, expect, forbid, labels);
  if (planFrame) {
    // The halo round the week's windows breathes on a 2.3-second loop, so a
    // frame taken at a fixed delay caught it at a different point on every
    // run: two runs of the same code differed inside the halo alone. With
    // «reduce motion» the plan holds it still. Asked for this frame only —
    // every other frame stays as a person sees it.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // The windows' plan must open in one tap for anyone — a publisher included.
    await page.getByText(/^На плане$/).first().click();
    await page.getByText(/^Окна недели$/).first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    // Around the plan itself: in the tall window it opens mid-screen, far
    // below the top 900 points the other frames take.
    await around(page, page.getByText(/^Окна недели$/).first(), planFrame, { above: 60, height: 900 });
    // Rooms named inside the rooms, the choice in words under the plan, and
    // the toilets' signs named for a screen reader (the bar carries the label).
    await words(page, planFrame, ['Окна недели', 'Закрыть', 'Фойе', 'Кухня', 'Класс', 'Окна: 5'], [],
      { must: ['Окна: 9 · Муж. туалет', 'Окна: 9 · Туалет (инв.)'], mustNot: [] });
    // The proof the frame is steady, not a hope: two shots of the screen,
    // longer apart than half a breath, must be the same byte for byte.
    const first = await page.screenshot();
    await page.waitForTimeout(1300);
    const second = await page.screenshot();
    console.log(`· ${planFrame} — ореол стоит: ${first.equals(second) ? 'да' : 'НЕТ, кадр будет плавать'}`);
    await page.getByText(/^Закрыть$/).first().click();
    await page.waitForTimeout(400);
    await page.emulateMedia({ reducedMotion: null });
  }
  if (!weekFrame) return;
  const first = page.getByText(/^После встреч — /).first();
  if (!(await first.count())) { console.log('· ' + weekFrame + ' — пропущено: нет недели с группой'); return; }
  await first.click();
  await page.getByText(/^Уборка после встреч$/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, weekFrame), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 1100) } });
  await words(page, weekFrame, ['Уборка после встреч', 'Еженедельная уборка'], []);
}

/** The cleaning list on a laptop: weeks on the left, this week's editor on the right. */
async function cleaningWide(page) {
  await page.goto(`${BASE}/publishers/cleaning`);
  await page.getByText(/^Эта неделя$/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, '19-cleaning-desktop.png') });
  await words(page, '19-cleaning-desktop.png', ['Эта неделя', 'Уборка после встреч', 'Еженедельная уборка'], []);
}

// «1 из 8» carries no-break spaces, so «0 из 8» never splits across lines.
const NB = '\u00a0';

/** «Meeting duties»: the list of meetings, and (for the first account) one opened. */
async function dutiesFrames(page, name, expect, forbid, labels, meetingFrame) {
  await page.goto(`${BASE}/publishers/duties`);
  await page.getByText(/^(Встреча в будний день|Обязанности на встречах распределяют.*)$/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await answerLanguage(page);
  await page.waitForTimeout(1200);
  const vp = page.viewportSize();
  await page.screenshot({ path: join(OUT, name), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 900) } });
  await words(page, name, expect, forbid, labels);
  if (!meetingFrame) return;
  await page.getByText(/^Встреча в будний день$/).first().click();
  await page.getByText(/^Распорядитель у входа$/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, meetingFrame), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 1400) } });
  await words(page, meetingFrame, ['Распорядитель у входа', 'Микрофон', 'Добавить обязанность'], []);
}

/** The duties list on a laptop: meetings on the left, the first one's sheet on the right. */
async function dutiesWide(page) {
  await page.goto(`${BASE}/publishers/duties`);
  await page.getByText(/^Распорядитель у входа$/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, '22-duties-desktop.png') });
  await words(page, '22-duties-desktop.png', ['Встреча в будний день', 'Распорядитель у входа'], []);
}

/**
 * Wait for Expo to finish bundling before anything is measured.
 *
 * After a change Expo rebuilds the app, which took minutes on a cold start;
 * the first page then waited its 30 seconds and the whole run died on a
 * timeout that said nothing about why. Now the first load gets five minutes
 * and the run says what it is waiting for — and a server that is down fails
 * here, with that said, instead of somewhere in the middle.
 */
async function warmUp(browser) {
  const started = Date.now();
  console.log('· жду сборку Expo…');
  const ctx = await browser.newContext({ viewport: REAL_PHONE, locale: 'ru-RU' });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE, { timeout: 300000 });
  } catch (e) {
    console.error(`Expo не ответил за 5 минут: ${e.message.split('\n')[0]}`);
    console.error('Проверь окно, где запущен npx expo start --web: не упал ли он (heap out of memory) и идёт ли сборка.');
    process.exit(1);
  }
  await ctx.close();
  console.log(`· Expo готов — ${Math.round((Date.now() - started) / 1000)} с`);
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
await warmUp(browser);
try {
  // --- Администратор, телефон ---
  const { ctx: admin, page: a, keep: keepAdmin } = await signedIn(browser, ADMIN, PHONE);
  await openFeed(a);

  const today = a.getByText(/^Сегодня ·/).first();
  await around(a, today, '01-open-default.png', { above: 20, height: 2000 });

  await click(a, a.getByRole('tab', { name: /Обязанности/ }), 'вкладка «Обязанности»');
  await around(a, a.getByRole('tablist').first(), '02-duties.png', { above: 200, height: 900 });

  await click(a, a.getByRole('tab', { name: /Уборка/ }), 'вкладка «Уборка»');
  await around(a, a.getByRole('tablist').first(), '03-cleaning.png', { above: 200, height: 600 });
  await words(a, '03-cleaning.png', ['Править уборку', 'Окна: 5', 'На плане'], []);

  const sunday = a.getByRole('button', { name: /Как Библия может вам помочь/ });
  await click(a, sunday, 'воскресенье 27-го');
  await around(a, sunday.first(), '04-sunday.png', { above: 20, height: 1200 });

  const saturday = a.getByRole('button', { name: /Ahlen/ });
  await click(a, saturday, 'суббота с проповедью');
  await around(a, saturday.first(), '05-saturday.png', { above: 20, height: 700 });

  const past = a.getByText(/^Прошли$/i).first();
  if (await past.count()) await around(a, past, '06-past.png', { above: 60, height: 1600 });
  else console.log('· 06-past.png — пропущено: прошедших нет');

  await hub(a, '12-congregation-admin.png',
    ['Люди', 'Возвещатели', 'Группы служения', 'Отсутствия', 'Ответственные', 'Встречи', 'Составление программы',
     'Координатор речей', 'Совет старейшин', 'Задачи совета старейшин', 'Школа пионеров',
     'Зал Царства', 'Уборка зала', 'Время и место встреч', 'Обязанности на встречах'],
    ['Моя группа', 'Мои отсутствия']);
  await management(a);
  await meetingPlace(a);
  await profileFrame(a, '26-profile-admin.png',
    ['Импорт расписания', 'Удалить учётную запись и данные'],
    [...MOVED_OUT_OF_PROFILE, 'Время и место встреч', 'Залы Царства']);
  await redirectCheck(a);
  await programmeSections(a);
  await cleaningFrames(a, '16-cleaning-admin.png',
    ['Эта неделя', 'После встреч — Hamm-Werries', 'Уборка после встреч не назначена',
     'Убирает ваша группа — после встреч', 'Как убирать', 'Показать прошедшие недели', 'Окна: 5'],
    [], { must: ['Распечатать график уборки'], mustNot: [] }, '17-cleaning-week.png');
  await dutiesFrames(a, '20-duties-admin.png',
    ['Встреча в будний день', 'Встреча в выходной день', `обязанности 1${NB}из${NB}8`],
    [], { must: ['Распечатать обязанности на месяц'], mustNot: [] }, '21-duties-meeting.png');

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
  await cleaningWide(a);
  await dutiesWide(a);

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
  await keepAdmin();
  await admin.close();

  // --- Возвещатель, телефон ---
  const { ctx: pub, page: p, keep: keepPub } = await signedIn(browser, PUBLISHER, PHONE);
  await openFeed(p);
  await around(p, p.getByText(/^Сегодня ·/).first(), '07-publisher.png', { above: 20, height: 1800 });
  await hub(p, '13-congregation-publisher.png',
    ['Моя группа', 'Группы служения', 'Мои отсутствия', 'Уборка зала'],
    ['Люди', 'Возвещатели', 'Составление программы', 'Задачи совета старейшин', 'Отсутствия', 'Обязанности на встречах',
     'Ответственные', 'Управление', 'Журнал изменений', 'Каталог публичных речей', 'Время и место встреч']);
  await cleaningFrames(p, '18-cleaning-publisher.png',
    ['Эта неделя', 'Убирает ваша группа — после встреч', 'Как убирать', 'Окна: 5'],
    [], { must: [], mustNot: ['Распечатать график уборки'] }, null, '24-windows-plan.png');
  await profileFrame(p, '27-profile-publisher.png',
    ['Мои контакты', 'Уведомления', 'Язык', 'Удалить учётную запись и данные'],
    [...MOVED_OUT_OF_PROFILE, 'Инструменты администратора', 'Время и место встреч', 'Импорт расписания']);
  await dutiesFrames(p, '23-duties-publisher.png',
    ['Обязанности на встречах распределяют координатор обязанностей и координатор совета старейшин.'],
    ['Встреча в будний день'], { must: [], mustNot: ['Распечатать обязанности на месяц'] }, null);
  await keepPub();
  await pub.close();

  if (landings.includes(false)) console.log('\nВНИМАНИЕ: лента открылась не на «Сегодня» — см. строки «посадка» выше');
  console.log(`\nГотово: ${OUT}`);
} finally {
  await browser.close();
}
