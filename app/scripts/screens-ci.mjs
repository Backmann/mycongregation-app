#!/usr/bin/env node
/**
 * The same screens, photographed with the main branch and with a pull request.
 *
 *   node scripts/screens-ci.mjs --a <dist of main> --b <dist of the PR> \
 *        --current YYYY-MM-DD --out <folder> [--reset "<command>"]
 *
 * Run by the app's CI (job "screens") against a throwaway server filled by the
 * server's scripts/seed-screens.mjs; --current is the week it calls "current"
 * (the browser clock is frozen on that week's Tuesday, 10:00, Berlin). Both
 * builds are served here on :8091 and :8092 and photographed on the same
 * machine, with the same data and the same clock — so a difference between two
 * pictures is a difference the pull request makes, and fonts or dates cannot
 * fake one.
 *
 * Two kinds of result:
 *
 *  • DIFFERENCES between main and the PR. Reported, never a failure: a change
 *    of a screen is often the very point of a pull request. Each changed frame
 *    is saved as a/, b/ and diff/ (the PR's picture with changed pixels in
 *    red); report.md lists them. Shading noise of ±2 is named as noise
 *    (see screens-compare.mjs for where that number comes from).
 *
 *  • DEFECTS on the PR's own pictures — checked on every frame, whether the PR
 *    touched it or not, because a comparison cannot see what is broken on both
 *    sides. These fail the job:
 *      - text cut off (an ellipsis or a clamped line that does not fit);
 *      - the page wider than the window (sideways scrolling on a phone);
 *      - a raw translation key on screen;
 *      - the screen-failure or load-failure text;
 *      - a script error, an error in the console, a server answer of 500+;
 *      - an empty page.
 *    The same checks on main are reported for information, so a defect that is
 *    already in main is told apart from one the PR brings.
 *
 * Refuses a build that talks to the live server: the script signs in.
 * Called directly, never through package.json `scripts` (Expo fingerprint).
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { decode, encode } from './png.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const DIST = { a: resolve(arg('a', '')), b: resolve(arg('b', '')) };
const CURRENT = arg('current', '');
/** Puts the seeded database back before each side (a screen can write). */
const RESET = arg('reset', '');
const OUT = resolve(arg('out', 'screens-out'));
const PASSWORD = process.env.SCREENS_PASSWORD || 'Screens-Check-2026!';
const LOGIN = { admin: 'admin@example.invalid', publisher: 'publisher' };
const PORT = { a: 8091, b: 8092 };
const LIVE = 'api.mycongregation.org';
const NOISE = 2;
/**
 * A difference this small is named "tiny", apart from real changes: on
 * 10 November the same build photographed twice differed in 5 pixels on the
 * rounded edge of the active sidebar item (sub-pixel placement). Listed, not
 * hidden — but not mixed in with changes a person has to look at.
 */
const TINY = 24;

if (!/^\d{4}-\d{2}-\d{2}$/.test(CURRENT)) fail('--current YYYY-MM-DD is required (the seed prints it).');
for (const k of ['a', 'b']) {
  if (!existsSync(join(DIST[k], 'index.html'))) fail(`--${k}: no index.html in ${DIST[k]}`);
  if (bundleMentions(DIST[k], LIVE)) fail(`--${k}: the build talks to ${LIVE}; this script signs in and is never run against the live server.`);
}

function fail(msg) {
  console.error(`screens-ci: ${msg}`);
  process.exit(2);
}
function bundleMentions(dir, text) {
  const walk = (d) => readdirSync(d).some((n) => {
    const p = join(d, n);
    if (statSync(p).isDirectory()) return walk(p);
    return n.endsWith('.js') && readFileSync(p, 'utf8').includes(text);
  });
  return walk(dir);
}

// ── what is photographed ───────────────────────────────────────────────
const SCREENS = [
  ['home', '/home'],
  ['feed', '/schedule'],
  ['midweek', `/schedule?week=${CURRENT}&meeting=midweek`],
  ['weekend', `/schedule?week=${CURRENT}&meeting=weekend`],
  ['mine', '/home/my-assignments'],
  ['congregation', '/publishers'],
  ['profile', '/profile'],
  ['crashes', '/publishers/crashes', 'admin'],
  // The territory section (11 November 2026): the whole of it for the
  // keeper, a holder's own and his group's for the publisher.
  ['territories', '/cart/territories', 'admin'],
  ['my-territories', '/cart/my-territories', 'publisher'],
  // The desk (13 November 2026): on a phone the days beside a name cut it short.
  ['desk', '/cart/desk', 'admin'],
];
// Phone, tablet portrait, the narrowest wide layout, wide screen.
// 1024 is where the wide layout begins and is at its tightest: a tab label
// was cut there and no other width showed it (10 November 2026).
const SIZES = [[390, 1400], [820, 1180], [1024, 800], [1280, 900]];
// German has the longest words: a few frames in it, on a phone.
const GERMAN = ['home', 'midweek', 'mine'];

function framesFor(role, lang) {
  const out = [];
  for (const [w, h] of lang === 'de' ? [SIZES[0]] : SIZES) {
    for (const [name, path, only] of SCREENS) {
      if (only && only !== role) continue;
      if (lang === 'de' && !GERMAN.includes(name)) continue;
      out.push({
        id: `${role}-${lang}-${w}-${name}`,
        w,
        h,
        path,
        // The programme opened by a link to a week, on the wide layout: where
        // it lands must not depend on when the data comes (see landingHolds).
        landing: w >= 1024 && (name === 'midweek' || name === 'weekend'),
      });
    }
  }
  return out;
}
const RUNS = [['admin', 'ru'], ['publisher', 'ru'], ['publisher', 'de']];

// ── the clock: that week's Tuesday, 10:00 in Berlin ─────────────────────
function berlin(dateIso, hh) {
  const guess = Date.parse(`${dateIso}T${hh}:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  );
  const asLocal = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return new Date(guess - (asLocal - guess));
}
const NOW = berlin(new Date(Date.parse(`${CURRENT}T00:00:00Z`) + 86400000).toISOString().slice(0, 10), '10');

// ── texts that mean "this screen failed" and the keys that must never show ──
const LOCALES = Object.fromEntries(['ru', 'de', 'en'].map((l) => [l, JSON.parse(readFileSync(join(HERE, '..', 'locales', `${l}.json`), 'utf8'))]));
const KEYS = new Set();
const FAILURE_TEXTS = new Set();
(function walk(node, path) {
  for (const [k, v] of Object.entries(node)) {
    const p = path ? `${path}.${k}` : k;
    if (v && typeof v === 'object') walk(v, p);
    else {
      KEYS.add(p.replace(/_(one|few|many|other|zero|two)$/, ''));
      KEYS.add(p);
    }
  }
})(LOCALES.ru, '');
for (const loc of Object.values(LOCALES)) {
  if (loc.screenCrash?.title) FAILURE_TEXTS.add(loc.screenCrash.title);
  (function walk(node) {
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === 'object') walk(v);
      else if (k === 'loadFailed' && typeof v === 'string') FAILURE_TEXTS.add(v);
    }
  })(loc);
}

// ── serving the two builds ─────────────────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function serve(dir, port) {
  const isFile = (p) => existsSync(p) && statSync(p).isFile();
  return new Promise((ok) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = [path, `${path}.html`, join(path, 'index.html')].map((p) => join(dir, p)).find(isFile) ?? join(dir, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    }).listen(port, () => ok(server));
  });
}

// ── one frame ──────────────────────────────────────────────────────────
/** Wait until two pictures in a row are the same (fades, late data, fonts). */
async function steady(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  let last = null;
  for (let i = 0; i < 12; i++) {
    const shot = await page.screenshot({ fullPage: true });
    if (last && shot.equals(last)) return shot;
    last = shot;
    await page.waitForTimeout(500);
  }
  return last; // still moving: the defect check below will not hide it, the diff may show it
}

async function dismissPrompts(page) {
  for (const re of [/^Позже$/, /^Später$/, /^Later$/]) {
    const b = page.getByText(re);
    if (await b.count()) await b.first().click().catch(() => {});
  }
}

/** Defects visible on the page itself — independent of any comparison. */
async function defectsOf(page, events) {
  const found = await page.evaluate(({ keys, failures }) => {
    const out = [];
    const doc = document.scrollingElement || document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) out.push(`страница шире окна: ${doc.scrollWidth} > ${window.innerWidth}`);
    const text = document.body.innerText || '';
    if (text.trim().length < 20) out.push('пустая страница');
    for (const f of failures) if (text.includes(f)) out.push(`текст сбоя: «${f}»`);
    const keySet = new Set(keys);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue.trim();
      if (t && keySet.has(t)) out.push(`ключ перевода вместо текста: ${t}`);
    }
    // Text that is there but cannot be seen: an animation that never ran (a
    // fade that ignores «reduce motion» stays at opacity 0 under the frozen
    // clock — the feed's list did, until 10 November).
    const opacityOf = (el) => {
      let o = 1;
      for (let e = el; e && e !== document.body; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    };
    const hidden = new Set();
    for (const el of document.querySelectorAll('body *')) {
      // Letters or digits only: icon fonts draw glyphs from the private-use
      // area, and the tab bar keeps an inactive icon layer at opacity 0 on
      // purpose.
      if (![...el.childNodes].some((c) => c.nodeType === 3 && /[\p{L}\p{N}]/u.test(c.nodeValue))) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.top > document.documentElement.scrollHeight) continue;
      if (opacityOf(el) < 0.05) hidden.add(el.textContent.trim().slice(0, 60));
    }
    if (hidden.size) out.push(`текст есть, но невидим (прозрачность ≈ 0), например «${[...hidden][0]}» — всего ${hidden.size}`);
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const clamps = cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
      if (!clamps) continue;
      const cut = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      if (cut && el.innerText.trim()) out.push(`текст обрезан: «${el.innerText.trim().slice(0, 90)}»`);
    }
    return out;
  }, { keys: [...KEYS], failures: [...FAILURE_TEXTS] });
  return [...new Set([...found, ...events])];
}

async function photograph(side) {
  const base = `http://localhost:${PORT[side]}`;
  const browser = await chromium.launch();
  const results = {};
  try {
    for (const [role, lang] of RUNS) {
      const ctx = await browser.newContext({ locale: lang === 'de' ? 'de-DE' : 'ru-RU', timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', deviceScaleFactor: 1, viewport: { width: 390, height: 1400 } });
      await ctx.clock.setFixedTime(NOW);
      await ctx.addInitScript((l) => {
        try { localStorage.setItem('user_language', l); } catch { /* storage refused: language falls back */ }
      }, lang);
      const page = await ctx.newPage();
      const events = [];
      page.on('pageerror', (e) => events.push(`ошибка скрипта: ${String(e.message).slice(0, 160)}`));
      page.on('console', (m) => { if (m.type() === 'error') events.push(`ошибка в консоли: ${m.text().slice(0, 160)}`); });
      page.on('response', (r) => { if (r.status() >= 500) events.push(`сервер ответил ${r.status()}: ${new URL(r.url()).pathname}`); });

      // Sign in once per role and language.
      await page.goto(base);
      const pw = page.locator('input[type="password"]').first();
      await pw.waitFor({ timeout: 60000 });
      await page.locator('input:not([type="password"])').first().fill(LOGIN[role]);
      await pw.fill(PASSWORD);
      await page.getByText(/^(Войти|Anmelden|Sign in|Log in)$/).last().click();
      await pw.waitFor({ state: 'detached', timeout: 60000 });
      await page.waitForTimeout(1000);
      await dismissPrompts(page);
      events.length = 0;

      for (const f of framesFor(role, lang)) {
        await page.setViewportSize({ width: f.w, height: f.h });
        events.length = 0;
        try {
          await page.goto(`${base}${f.path}`);
          await page.waitForTimeout(800);
          await dismissPrompts(page);
          const shot = await steady(page);
          writeFileSync(join(OUT, side, `${f.id}.png`), shot);
          results[f.id] = await defectsOf(page, events);
          if (f.landing) results[f.id].push(...(await landingHolds(page, `${base}${f.path}`, shot)));
        } catch (e) {
          results[f.id] = [`кадр не снят: ${String(e.message).split('\n')[0]}`];
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

/**
 * WHERE THE FEED LANDS must not depend on WHEN its data comes (10 November
 * 2026). The same frame again, with the field service meetings answering
 * 2.5 s late and a click outside the list while they are on their way —
 * a dialog closed over the feed. Before the fix the list then stood a card
 * lower: the browser had moved the scroll to keep the row on screen while
 * the feed believed itself in place, and any click anywhere had let go of
 * the landing. Must give the very same picture as the frame taken normally.
 */
async function landingHolds(page, url, normal) {
  const late = async (route) => {
    await new Promise((ok) => setTimeout(ok, 2500));
    await route.continue().catch(() => {});
  };
  await page.route(/\/field-service-meetings/, late);
  try {
    await page.goto(url);
    await page.waitForTimeout(1200);
    // An empty spot of the header, outside the list (the logo at the corner
    // would navigate).
    const vp = page.viewportSize();
    await page.mouse.click(Math.round(vp.width * 0.6), 30);
    await page.waitForTimeout(2600);
    await dismissPrompts(page);
    const again = await steady(page);
    const a = decodeBuffer(normal), b = decodeBuffer(again);
    if (a.width !== b.width || a.height !== b.height) return ['лента встала иначе, когда данные пришли позже (другой размер кадра)'];
    let n = 0;
    for (let i = 0; i < a.width * a.height; i++) {
      const ia = i * a.bpp, ib = i * b.bpp;
      if (Math.max(Math.abs(a.px[ia] - b.px[ib]), Math.abs(a.px[ia + 1] - b.px[ib + 1]), Math.abs(a.px[ia + 2] - b.px[ib + 2])) > NOISE) n++;
    }
    return n > TINY ? [`лента встала иначе, когда данные пришли позже (${n} пикс.)`] : [];
  } finally {
    await page.unroute(/\/field-service-meetings/, late);
  }
}

function decodeBuffer(buf) {
  const file = join(OUT, `.tmp-${process.pid}.png`);
  writeFileSync(file, buf);
  try {
    return decode(file);
  } finally {
    rmSync(file, { force: true });
  }
}

// ── comparison ─────────────────────────────────────────────────────────
function compare(id) {
  const fa = join(OUT, 'a', `${id}.png`), fb = join(OUT, 'b', `${id}.png`);
  if (!existsSync(fa) || !existsSync(fb)) return { kind: 'missing' };
  const a = decode(fa), b = decode(fb);
  if (a.width !== b.width || a.height !== b.height) {
    return { kind: 'diff', note: `размер ${a.width}×${a.height} → ${b.width}×${b.height}` };
  }
  let n = 0, step = 0, y0 = b.height, y1 = -1;
  const out = Buffer.alloc(b.width * b.height * 4);
  for (let i = 0, j = 0; i < b.width * b.height; i++) {
    const ia = i * a.bpp, ib = i * b.bpp;
    const d = Math.max(Math.abs(a.px[ia] - b.px[ib]), Math.abs(a.px[ia + 1] - b.px[ib + 1]), Math.abs(a.px[ia + 2] - b.px[ib + 2]));
    j = i * 4;
    if (d > NOISE) {
      out[j] = 230; out[j + 1] = 20; out[j + 2] = 20; out[j + 3] = 255;
    } else {
      // The PR's picture, faded, so the red stands out.
      out[j] = 255 - ((255 - b.px[ib]) >> 2); out[j + 1] = 255 - ((255 - b.px[ib + 1]) >> 2); out[j + 2] = 255 - ((255 - b.px[ib + 2]) >> 2); out[j + 3] = 255;
    }
    if (d > 0) {
      n++; if (d > step) step = d;
      const y = Math.floor(i / b.width); if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (n === 0) return { kind: 'same' };
  if (step <= NOISE) return { kind: 'noise', note: `${n} пикс., оттенок ±${step}` };
  let strong = 0;
  for (let i = 0; i < out.length; i += 4) if (out[i] === 230 && out[i + 1] === 20) strong++;
  if (strong <= TINY) return { kind: 'tiny', note: `${strong} пикс. сильнее шума, строки ${y0}–${y1}` };
  writeFileSync(join(OUT, 'diff', `${id}.png`), encode({ width: b.width, height: b.height, px: out }));
  return { kind: 'diff', note: `${n} пикс., строки ${y0}–${y1}` };
}

// ── run ────────────────────────────────────────────────────────────────
for (const d of ['a', 'b', 'diff']) mkdirSync(join(OUT, d), { recursive: true });
const servers = [await serve(DIST.a, PORT.a), await serve(DIST.b, PORT.b)];
const started = Date.now();
// One side after the other, each on the seeded database as it was made.
const reset = () => { if (RESET) execSync(RESET, { stdio: 'inherit' }); };
reset();
const ra = await photograph('a');
reset();
const rb = await photograph('b');
servers.forEach((s) => s.close());

const ids = Object.keys(rb);
const rows = ids.map((id) => ({ id, cmp: compare(id), defects: rb[id], before: ra[id] ?? [] }));
const changed = rows.filter((r) => r.cmp.kind === 'diff' || r.cmp.kind === 'missing');
const broken = rows.filter((r) => r.defects.length);
const newDefects = broken.filter((r) => r.defects.some((d) => !r.before.includes(d)));

const lines = [];
lines.push(`## Screens: main ↔ pull request`, '');
lines.push(`Frames: ${rows.length} · changed: ${changed.length} · tiny: ${rows.filter((r) => r.cmp.kind === 'tiny').length} · noise: ${rows.filter((r) => r.cmp.kind === 'noise').length} · frames with defects: ${broken.length} (new in this PR: ${newDefects.length}) · ${Math.round((Date.now() - started) / 1000)} s`, '');
lines.push(`Data: invented congregation, current week ${CURRENT}, browser clock ${NOW.toISOString()}.`, '');
if (changed.length) {
  lines.push('### Changed frames', '');
  for (const r of changed) lines.push(`- \`${r.id}\` — ${r.cmp.note ?? 'missing on one side'}`);
  lines.push('');
}
if (broken.length) {
  lines.push('### Defects on the pull request\'s screens', '');
  for (const r of broken) {
    for (const d of r.defects) lines.push(`- \`${r.id}\` — ${d}${r.before.includes(d) ? ' _(already in main)_' : ' **(new)**'}`);
  }
  lines.push('');
}
const tiny = rows.filter((r) => r.cmp.kind === 'tiny');
if (tiny.length) {
  lines.push('### Tiny differences (sub-pixel edges)', '');
  for (const r of tiny) lines.push(`- \`${r.id}\` — ${r.cmp.note}`);
  lines.push('');
}
if (!changed.length && !broken.length) lines.push('No changed frames, no defects.', '');
writeFileSync(join(OUT, 'report.md'), lines.join('\n'));
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ current: CURRENT, now: NOW, rows }, null, 2));
console.log(lines.join('\n'));
process.exit(broken.length ? 1 : 0);
