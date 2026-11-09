#!/usr/bin/env node
/**
 * Stand check (9 November 2026): «Все мои назначения» in the app against the
 * server's own agenda (/me/agenda, which the calendar feed reads). Same days
 * on both, and the screen in order of day and hour. Needs the stand running
 * (server on :3000, web on :8082 — scripts/local-web.mjs).
 *
 *   NODE_PATH=$(npm root -g) node scripts/stand-agenda-crosscheck.mjs anna.weber timo.lang
 *
 * Exits 1 when any login disagrees. Not part of the gate: it needs the stand.
 */
import { chromium } from 'playwright';

const BASE = process.env.WEB ?? 'http://localhost:8082';
const API = process.env.API ?? 'http://localhost:3000/api';
const PASSWORD = process.env.STAND_PASSWORD ?? 'Stand-12345!';
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const logins = process.argv.slice(2);
if (logins.length === 0) {
  console.error('Укажите логины стенда: anna.weber timo.lang …');
  process.exit(2);
}

const browser = await chromium.launch();
let bad = 0;
for (const who of logins) {
  const login = `${who}@example.invalid`;
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login, password: PASSWORD }),
  });
  const j = await r.json();
  const token = j.accessToken ?? j.access_token ?? j.tokens?.accessToken;
  const ag = await (await fetch(`${API}/me/agenda`, { headers: { authorization: `Bearer ${token}` } })).json();
  const mine = (ag.items ?? ag).filter((x) => x.scope === 'mine');

  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Berlin' });
  const page = await ctx.newPage();
  await page.goto(BASE);
  const pw = page.locator('input[type="password"]').first();
  await pw.waitFor({ timeout: 30000 });
  await page.locator('input:not([type="password"])').first().fill(login);
  await pw.fill(PASSWORD);
  await page.getByText(/^(Войти)$/).last().click();
  await pw.waitFor({ state: 'detached', timeout: 30000 });
  await page.goto(`${BASE}/home/my-assignments`);
  await page.waitForTimeout(6000);
  const txt = await page.locator('body').innerText();
  await ctx.close();

  // «чт, 12 ноября · 13:00» — the row heads; «нояб.» inside a mark is not one.
  const year = new Date().getFullYear();
  const rows = [...txt.matchAll(/(?:пн|вт|ср|чт|пт|сб|вс), (\d{1,2}) ([а-я]+)(?: (\d{4}))?(?: · (\d{1,2}:\d{2}))?/g)]
    .map((m) => {
      const mo = MONTHS.indexOf(m[2]) + 1;
      if (mo === 0) return null;
      const y = m[3] ? Number(m[3]) : mo < new Date().getMonth() + 1 ? year + 1 : year;
      const hm = m[4] ? m[4].padStart(5, '0') : '';
      return `${y}-${String(mo).padStart(2, '0')}-${String(m[1]).padStart(2, '0')} ${hm}`.trim();
    })
    .filter(Boolean);
  const a = [...new Set(mine.map((x) => x.date))].sort();
  const b = [...new Set(rows.map((x) => x.slice(0, 10)))].sort();
  const onlyAgenda = a.filter((d) => !b.includes(d));
  const onlyScreen = b.filter((d) => !a.includes(d));
  const sorted = [...rows].sort().join('|') === rows.join('|');
  const ok = onlyAgenda.length === 0 && onlyScreen.length === 0 && sorted;
  if (!ok) bad += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${who}: дней в повестке ${a.length}, на экране ${b.length}` +
      (onlyAgenda.length ? `; только в повестке: ${onlyAgenda.join(', ')}` : '') +
      (onlyScreen.length ? `; только на экране: ${onlyScreen.join(', ')}` : '') +
      (sorted ? '' : `; порядок на экране: ${rows.join(' ; ')}`),
  );
}
await browser.close();
process.exit(bad ? 1 : 0);
