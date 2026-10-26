#!/usr/bin/env node
/**
 * NO SCREEN THAT NOTHING LEADS TO (26 October 2026).
 *
 * `/schedule/[id]` lived on for weeks after the programme moved its editing
 * into a sheet: no link, no notification, no server address led to it, and it
 * was found only by chance. A screen nobody can reach is code nobody checks —
 * and still a door: typed by hand, it opens.
 *
 * This lists every screen under app/ and looks for something that leads to it:
 * a path written in the app's code ('/schedule/edit', `/talk-coordinator/
 * speaker-profile/${id}`, { pathname: '/schedule' }), a tab of the tab bar, the
 * notification table of the service worker. A screen reached only from outside
 * the app — a link in an email, a QR code — goes in OUTSIDE with the reason.
 *
 * Called directly from the gate, never through package.json `scripts`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Reached from outside the app — each with where from. */
const OUTSIDE = new Map([
  ['/', 'the address of the site itself'],
  ['/reset-password', 'the link in the password email and its QR code (server users.service)'],
]);

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// Every screen file → the path it answers at.
const screens = walk(join(ROOT, 'app'))
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => relative(join(ROOT, 'app'), f).split(sep).join('/'))
  .filter((f) => !/(^|\/)_layout\.tsx?$/.test(f) && !/(^|\/)\+/.test(f))
  .map((f) => {
    const segs = f
      .replace(/\.tsx?$/, '')
      .split('/')
      .filter((s) => !/^\(.*\)$/.test(s));
    if (segs[segs.length - 1] === 'index') segs.pop();
    // As the code may write it too: with its group, «/(auth)/invite».
    const grouped = f.replace(/\.tsx?$/, '').replace(/\/index$/, '');
    return { file: `app/${f}`, route: `/${segs.join('/')}`, grouped: `/${grouped}` };
  });

// What the app's own code says, as text.
const SOURCES = ['app', 'components', 'lib', 'public']
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => /\.(tsx?|js|mjs)$/.test(f));
const text = SOURCES.map((f) => readFileSync(f, 'utf8')).join('\n');

// Tabs are reached by the tab bar: <Tabs.Screen name="home" … /> without href: null.
const tabs = new Set(
  [...text.matchAll(/<Tabs\.Screen\s+name="([^"]+)"(?![^>]*href:\s*null)/g)].map(
    (m) => `/${m[1]}`,
  ),
);

/** The pattern of a route with its [params] as «anything». */
const asPattern = (route) =>
  new RegExp(
    `['"\`]${route
      .split('/')
      .map((s) =>
        /^\[.*\]$/.test(s) ? '[^\'"`/?]+' : s.replace(/[.*+?^${}()|\\]/g, '\\$&'),
      )
      .join('/')}(?:['"\`?/]|\\$\\{)`,
  );
/** A dynamic route written as a template: `/a/b/${id}`. */
const asTemplate = (route) => {
  const head = route.split('/[')[0];
  return route.includes('[') ? `\`${head}/\${` : null;
};

const orphans = [];
for (const s of screens) {
  if (OUTSIDE.has(s.route)) continue;
  if (tabs.has(s.route)) continue;
  const tpl = asTemplate(s.route);
  if (asPattern(s.route).test(text) || (tpl && text.includes(tpl))) continue;
  if (s.grouped !== s.route && asPattern(s.grouped).test(text)) continue;
  orphans.push(s);
}

if (orphans.length) {
  console.error('✗ Экраны, к которым ничего не ведёт:');
  for (const o of orphans) console.error(`  ${o.route}  (${o.file})`);
  console.error(
    '\nУдалите экран — или, если к нему ведут извне (письмо, QR), впишите его в OUTSIDE с причиной.',
  );
  process.exit(1);
}
console.log(`OK: к каждому из ${screens.length} экранов что-то ведёт.`);
