#!/usr/bin/env node
/**
 * Аудит обходом (24 сентября): каждый экран приложения под каждой учёткой.
 *
 * Для каждого адреса и каждой из трёх ролей — администратор, старейшина без
 * поручений, возвещатель — открывает экран, ждёт, пока он успокоится, и
 * записывает:
 *   - снимок экрана;
 *   - каждый ответ сервера с кодом 400 и выше (что, куда, какой код);
 *   - ошибки приложения в браузере (pageerror и console.error);
 *   - куда экран в итоге привёл (переадресация, выброс на вход);
 *   - признаки поломки на самом экране: «Что-то пошло не так», пустой экран.
 * Итог — audit.json (всё) и audit.txt (сводка по ролям и находкам).
 *
 * Ничего не меняет: только открывает экраны. Ходит только на localhost.
 *
 *   node scripts/audit-crawl.mjs [метка]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.APP_URL || 'http://localhost:8081';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error(`Отказ: аудит ходит только на localhost, а не на ${BASE}.`);
  process.exit(1);
}
const ROLES = [
  ['admin', process.env.ADMIN || 'bauer800@example.invalid'],
  ['elder', process.env.ELDER || 'bondar838@example.invalid'],
  ['publisher', process.env.PUBLISHER || 'bergman855@example.invalid'],
  // ONLY=publisher (or admin, elder, several with commas) walks just those —
  // to finish a run that Expo broke off half-way.
].filter(([role]) => !process.env.ONLY || process.env.ONLY.split(',').includes(role));
const PASSWORD = process.env.PASSWORD || 'local12345';

// Every screen of the app reachable by a plain address. Dynamic ones ([id])
// are reached from their lists at the end.
const ROUTES = [
  '/home', '/home/my-assignments',
  '/schedule', '/schedule/edit', '/schedule/conduct', '/schedule/new', '/schedule/rules', '/schedule/import',
  '/special-events', '/special-events/new', '/local-needs',
  '/publishers', '/publishers/list', '/publishers/new', '/service-groups', '/service-groups/new',
  '/absences', '/absences/new', '/publishers/responsibilities',
  '/publishers/duties', '/publishers/duties-meeting', '/publishers/cleaning', '/publishers/cleaning-week', '/cleaning/guide',
  '/publishers/meeting-settings',
  '/publishers/admin-users', '/publishers/journal', '/publishers/backups', '/publishers/public-talks',
  '/publishers/public-talks-retire', '/publishers/public-talks-import', '/publishers/songs-import', '/publishers/circuit-overseer',
  '/talk-coordinator', '/talk-coordinator/speakers', '/talk-coordinator/our-speakers', '/talk-coordinator/congregations', '/talk-coordinator/log',
  '/tasks', '/tasks/agenda', '/tasks/archive', '/pioneer-school', '/pioneer-school/helpers',
  '/cart', '/cart/field-service', '/cart/witnessing', '/cart/locations', '/cart/co-schedule', '/cart/service-overseer', '/cart/auxiliary-pioneers',
  '/service-reports', '/service-reports/new', '/service-reports/group', '/service-reports/summary', '/service-reports/annual',
  '/service-reports/attendance', '/service-reports/activity', '/service-reports/audit-log', '/service-reports/publisher-history',
  '/service-reports/pioneer-year-review',
  '/profile', '/profile/my-tasks', '/profile/contacts', '/profile/notifications', '/profile/change-password', '/profile/delete-account',
  // old addresses that must forward
  '/profile/journal', '/profile/halls', '/profile/meeting-settings', '/schedule/feed',
];
// Cards ([id] screens) are opened by their ids, taken from the lists the
// admin's pass loads — clicking rows found nothing reliable (24 September).
const ids = { publisher: [], event: [], group: [], speaker: [] };
function collectIds(url, json) {
  const rows = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : Array.isArray(json?.data) ? json.data : null;
  if (!rows) return;
  const take = (key) => {
    for (const r of rows) if (r && typeof r.id === 'string' && !ids[key].includes(r.id) && ids[key].length < 3) ids[key].push(r.id);
  };
  const path = url.replace(/^.*\/api/, '').split('?')[0];
  if (path === '/publishers') take('publisher');
  else if (path === '/special-events') take('event');
  else if (path === '/service-groups') take('group');
  else if (path === '/visiting-speakers') take('speaker');
}
/**
 * Personal fields of a publisher that the server strips for anyone not
 * entitled to them (server publisher-privacy.ts). For the ordinary publisher
 * the audit reads every answer about people and reports any that still
 * carries one — hidden on the screen is not the same as not sent.
 */
const PRIVATE = ['mobilePhone', 'email', 'address', 'notes', 'removedNote', 'birthDate', 'baptismDate',
  'ministryStartDate', 'pioneerSince', 'removalReason', 'removedAt', 'isDeaf', 'isBlind', 'isImprisoned',
  'contactsConfirmedAt', 'userId'];
function leaks(json, selfUserId) {
  const found = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    // A person's own row may carry their own details.
    const isPerson = typeof o.id === 'string' && ('lastName' in o || 'firstName' in o);
    if (isPerson && !(selfUserId && o.userId === selfUserId)) {
      for (const f of PRIVATE) {
        const v = o[f];
        if (v !== undefined && v !== null && v !== '' && v !== false) found.add(f);
      }
    }
    Object.values(o).forEach(walk);
  };
  walk(json);
  return [...found];
}


const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
const LABEL = (process.argv[2] || 'audit').replace(/[^a-z0-9-]/gi, '');
const OUT = join(process.cwd(), '.screens', `${stamp}_${LABEL}`);
mkdirSync(OUT, { recursive: true });
const PHONE = { width: 390, height: 844 };

async function answerLanguage(page) {
  const dialog = page.locator('[role="dialog"]').filter({ hasText: /Выберите язык|Choose .*language|Sprache wählen/i });
  if (!(await dialog.first().waitFor({ timeout: 1500 }).then(() => true).catch(() => false))) return;
  await dialog.getByText(/^Русский$/).first().click();
  await dialog.getByText(/^Подтвердить$|^Confirm$|^Bestätigen$/).first().click();
  await dialog.first().waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
}
async function answerContactsCheck(page) {
  const later = page.getByText(/^Позже$/).filter({ visible: true }).first();
  if (await later.waitFor({ timeout: 1000 }).then(() => true).catch(() => false)) {
    await later.click().catch(() => {});
    await page.waitForTimeout(400);
  }
}
/**
 * Wait for Expo to finish bundling before anything is typed (24 September).
 * The web app is served pre-rendered: the sign-in form shows BEFORE the
 * script that runs it has loaded, and what is typed and pressed then goes
 * nowhere — the first run straight after an Expo restart failed all three
 * sign-ins that way, the password still sitting in its field.
 */
async function warmUp(browser) {
  const started = Date.now();
  console.log('· жду сборку Expo…');
  const ctx = await browser.newContext({ viewport: PHONE, locale: 'ru-RU' });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE, { timeout: 300000 });
    await page.waitForLoadState('networkidle', { timeout: 300000 }).catch(() => {});
  } catch (e) {
    console.error(`Expo не ответил за 5 минут: ${String(e.message).split('\n')[0]}`);
    console.error('Проверь окно, где запущен npx expo start --web: не упал ли он и идёт ли сборка.');
    process.exit(1);
  }
  await ctx.close();
  console.log(`· Expo готов — ${Math.round((Date.now() - started) / 1000)} с`);
}
async function login(page, email) {
  await page.goto(BASE);
  const pw = page.locator('input[type="password"]').first();
  await pw.waitFor({ timeout: 30000 });
  // Only a page whose script has loaded can be signed in on.
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await answerLanguage(page);
  await page.locator('input:not([type="password"])').first().fill(email);
  await pw.fill(PASSWORD);
  // What the server says to the sign-in is kept, so a refusal explains itself
  // (a wrong password, the limit on attempts, a server that is down) instead
  // of surfacing as «the password field is still there».
  const answer = page
    .waitForResponse((r) => /\/auth\/login/.test(r.url()) && r.request().method() === 'POST', { timeout: 20000 })
    .catch(() => null);
  const submit = page.getByText(/^(Войти|Log in|Sign in|Anmelden)$/).last();
  if (await submit.count()) await submit.click();
  else await pw.press('Enter');
  const r = await answer;
  const gone = await pw.waitFor({ state: 'detached', timeout: 20000 }).then(() => true).catch(() => false);
  if (gone) return;
  const shotName = `login-failed-${email.split('@')[0]}.png`;
  await page.screenshot({ path: join(OUT, shotName) }).catch(() => {});
  const server = r ? `сервер ответил ${r.status()}: ${(await r.text().catch(() => '')).slice(0, 200)}` : 'запрос на вход не ушёл вовсе (страница не отправила форму)';
  throw new Error(`${server}. Снимок: ${shotName}`);
}
async function signedIn(browser, email) {
  const file = join(process.cwd(), '.screens', `.session-${email.replace(/[^a-z0-9]/gi, '_')}.json`);
  if (existsSync(file)) {
    const ctx = await browser.newContext({ viewport: PHONE, locale: 'ru-RU', storageState: file });
    const page = await ctx.newPage();
    await page.goto(BASE);
    if (await page.getByText(/^Главная$/).first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false)) {
      console.log(`· вход (${email}): сохранённая сессия`);
      return { ctx, page, file };
    }
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: PHONE, locale: 'ru-RU' });
  const page = await ctx.newPage();
  await login(page, email);
  console.log(`· вход (${email}): новый`);
  return { ctx, page, file };
}

const BROKEN = /Что-то пошло не так|Something went wrong|Unmatched Route|This screen doesn't exist|Не удалось загрузить|Ошибка загрузки/i;

/** Open one address and record everything that went wrong on the way. */
async function visit(page, role, path, name) {
  const errors = [];
  const onResp = (r) => {
    const u = r.url();
    if (!u.includes('/api/')) return;
    const s = r.status();
    if (s === 200 && r.request().method() === 'GET') {
      const path = u.replace(/^.*\/api/, '').split('?')[0];
      // Who is looking: their own card may carry their own details.
      if (path === '/auth/me') {
        r.json()
          .then((me) => {
            // /auth/me carries the account id; one's own card is the row whose
            // userId it is (a field sent only on one's own row).
            page.__selfUserId = me?.id ?? page.__selfUserId;
          })
          .catch(() => {});
      }
      if (role === 'admin' || (role === 'publisher' && /^\/(publishers|service-groups|special-events|visiting-speakers)(\/|$)/.test(path))) {
        r.json()
          .then((json) => {
            if (role === 'admin') collectIds(u, json);
            else {
              const f = leaks(json, page.__selfUserId);
              if (f.length) errors.push({ kind: 'leak', text: `${path}: возвещателю пришли личные поля чужих людей — ${f.join(', ')}` });
            }
          })
          .catch(() => {});
      }
    }
    // 401 on /auth/me before a refresh is the normal wake-up (see infrastructure notes).
    if (s >= 400 && !(s === 401 && /\/auth\/(me|refresh)/.test(u))) errors.push({ kind: 'http', status: s, method: r.request().method(), url: u.replace(/^.*\/api/, '/api') });
  };
  const onErr = (e) => errors.push({ kind: 'pageerror', text: String(e).slice(0, 300) });
  const onCon = (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return; // the http listener has it, with the address
    errors.push({ kind: 'console', text: t.slice(0, 300) });
  };
  page.on('response', onResp);
  page.on('pageerror', onErr);
  page.on('console', onCon);
  try {
    await page.goto(`${BASE}${path}`);
    await answerLanguage(page);
    await answerContactsCheck(page);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
  } catch (e) {
    errors.push({ kind: 'navigation', text: String(e.message || e).slice(0, 200) });
  }
  const landed = new URL(page.url()).pathname;
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  const broken = BROKEN.test(body) ? body.match(BROKEN)[0] : null;
  const words = body.replace(/\s+/g, ' ').trim().length;
  const file = `${role}__${name}.png`;
  await page.screenshot({ path: join(OUT, file) }).catch(() => {});
  page.off('response', onResp);
  page.off('pageerror', onErr);
  page.off('console', onCon);
  return { role, path, landed, broken, textLength: words, errors, file };
}

// ============================================================================
const browser = await chromium.launch(
  process.env.CHROME
    ? { executablePath: process.env.CHROME, args: process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [] }
    : {},
);
await warmUp(browser);
const all = [];
for (const [role, email] of ROLES) {
  let s;
  try {
    s = await signedIn(browser, email);
  } catch (e) {
    console.log(`⚠️ ${role}: не смог войти (${email}) — ${e.message}`);
    continue;
  }
  console.log(`\n— ${role} —`);
  for (const path of ROUTES) {
    const r = await visit(s.page, role, path, path.replace(/\//g, '_').replace(/^_/, ''));
    if (r.errors.some((e) => e.kind === 'navigation' && /ERR_CONNECTION_REFUSED/.test(e.text))) {
      console.log(`\n⛔ Expo перестал отвечать на ${path} — обход ${role} прерван. Перезапусти Expo и дойди этой ролью заново: ONLY=${role} node scripts/audit-crawl.mjs ...`);
      all.push({ ...r, errors: [{ kind: 'navigation', text: 'Expo не отвечает — обход роли прерван здесь' }] });
      break;
    }
    all.push(r);
    const flag = r.broken || r.errors.length ? '❗' : '·';
    console.log(`${flag} ${path}${r.landed !== path ? ' → ' + r.landed : ''}${r.broken ? ' «' + r.broken + '»' : ''}${r.errors.length ? ' — ' + r.errors.map((e) => e.status || e.kind).join(',') : ''}`);
  }
  // Cards, by id (collected on the admin's pass).
  const cardPaths = [
    ...ids.publisher.slice(1, 2).map((id) => [`/publishers/${id}`, 'карточка-возвещателя']),
    ...ids.event.slice(0, 1).map((id) => [`/special-events/${id}`, 'карточка-события']),
    ...ids.group.slice(0, 1).map((id) => [`/service-groups/${id}`, 'карточка-группы']),
    ...ids.speaker.slice(0, 1).map((id) => [`/talk-coordinator/speaker-profile/${id}`, 'карточка-докладчика']),
  ];
  if (!cardPaths.length) console.log('· карточки: номеров нет — они собираются на проходе админа (запусти без ONLY или с ONLY=admin,…)');
  for (const [path, name] of cardPaths) {
    const r = await visit(s.page, role, path, name);
    r.from = 'card';
    all.push(r);
    const flag = r.broken || r.errors.length ? '❗' : '·';
    console.log(`${flag} ${path} (${name})${r.broken ? ' «' + r.broken + '»' : ''}${r.errors.length ? ' — ' + r.errors.map((e) => e.status || e.kind).join(',') : ''}`);
  }
  await s.ctx.storageState({ path: s.file }).catch(() => {});
  await s.ctx.close();
}
await browser.close();

// --- the report ---------------------------------------------------------------
writeFileSync(join(OUT, 'audit.json'), JSON.stringify(all, null, 2));
const lines = [`Аудит ${stamp}: ${all.length} открытий экранов`, ''];
for (const [role] of ROLES) {
  const mine = all.filter((r) => r.role === role);
  const bad = mine.filter((r) => r.broken || r.errors.length);
  lines.push(`## ${role}: экранов ${mine.length}, с замечаниями ${bad.length}`);
  for (const r of bad) {
    lines.push(`- ${r.path}${r.landed !== r.path ? ' → ' + r.landed : ''}${r.broken ? ` [на экране: «${r.broken}»]` : ''} (${r.file})`);
    for (const e of r.errors) lines.push(`    ${e.kind === 'http' ? `${e.status} ${e.method} ${e.url}` : `${e.kind}: ${e.text}`}`);
  }
  lines.push('');
}
lines.push('## Куда ведут адреса (где экран увёл в другое место)');
for (const r of all.filter((x) => x.landed !== x.path && !x.from)) lines.push(`- ${r.role}: ${r.path} → ${r.landed}`);
writeFileSync(join(OUT, 'audit.txt'), lines.join('\n') + '\n', 'utf8');
console.log('\n' + lines.join('\n'));
console.log(`\nГотово: ${OUT}`);
