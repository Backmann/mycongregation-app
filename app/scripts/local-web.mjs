#!/usr/bin/env node
/**
 * The web app as built files, served on this computer — for long checks.
 *
 *   node scripts/local-web.mjs          build, check, serve on :8082
 *   node scripts/local-web.mjs --serve  serve the last build without rebuilding
 *
 * Why: the screen audit opens some 220 screens in a row, and the development
 * server (npx expo start --web) compiles each one as it is asked for; on this
 * laptop it ran out of breath and stopped answering halfway (25 September,
 * three runs in a row). A built copy is plain files — nothing is compiled
 * while the audit walks, so nothing can fall over.
 *
 * Safety, checked before serving:
 *   - the address of the server comes from app/.env (the one Expo uses for
 *     development) and must be on this computer — localhost or 127.0.0.1;
 *   - the build must contain that address and must NOT contain the live
 *     server's (api.mycongregation.org). A build that talks to the live site
 *     is never served: the audit signs in and presses buttons.
 *
 * Freshness: the build is stamped with a fingerprint of the code it was made
 * from (build-info.json, see code-fingerprint.mjs); the walkthrough refuses a
 * build whose stamp is not the code on disk. On 25 September A15 failed on a
 * build older than the patch, and the time went to a fault that was not there.
 *
 * The build goes to a folder NEXT TO the repository (…/congmap-web), not
 * inside it: nothing for git to see, and app/dist — which EAS uses — is left
 * alone.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { appFingerprint, changedFiles, describeChanges } from './code-fingerprint.mjs';

const PORT = Number(process.env.PORT || 8082);
const OUT = resolve(process.cwd(), '..', '..', 'congmap-web');
const LIVE = 'api.mycongregation.org';

function fail(msg) {
  console.error(`Отказ: ${msg}`);
  process.exit(1);
}

if (!existsSync('app.json') && !existsSync('app.config.js') && !existsSync('app.config.ts'))
  fail('запускать из папки app (~/congmap/app).');

const envText = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const api = (envText.match(/^\s*EXPO_PUBLIC_API_URL\s*=\s*(\S+)/m) || [])[1];
if (!api) fail('в app/.env нет EXPO_PUBLIC_API_URL.');
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(api))
  fail(`EXPO_PUBLIC_API_URL в app/.env — ${api}, а не сервер на этом компьютере.`);

if (!process.argv.includes('--serve')) {
  // What is being built — taken before, and again after: a file saved while
  // the bundler runs may or may not be in the build, and nobody can tell.
  const before = appFingerprint(process.cwd());
  console.log(`· собираю веб в ${OUT} (сервер: ${api}) — несколько минут…`);
  // --clear: Metro keeps compiled modules between runs, and a module compiled
  // for `eas update` carries the LIVE address baked in — reused here, it put
  // api.mycongregation.org into a build meant for this computer (25 September,
  // first run on the laptop). Starting clean costs a minute and removes that.
  const r = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', OUT], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      // Set here, so no .env.production can put the live address in its place.
      EXPO_PUBLIC_API_URL: api,
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192',
    },
  });
  if (r.status !== 0) fail('сборка не удалась (см. выше).');
  const after = appFingerprint(process.cwd());
  if (after.hash !== before.hash) {
    fail(
      `код менялся во время сборки (${describeChanges(changedFiles(before, after))}) — ` +
        'сборка может быть смесью старого и нового. Запусти ещё раз.',
    );
  }
  // The stamp the walkthrough reads before it trusts this build.
  writeFileSync(
    join(OUT, 'build-info.json'),
    JSON.stringify({ app: before, api, builtAt: new Date().toISOString() }),
  );
  console.log(`· отпечаток кода в сборке: ${before.hash}`);
}

// What the built script will actually talk to.
const jsDir = join(OUT, '_expo', 'static', 'js', 'web');
if (!existsSync(jsDir)) fail(`нет сборки в ${OUT} — запусти без --serve.`);
let hasLocal = false;
for (const f of readdirSync(jsDir).filter((n) => n.endsWith('.js'))) {
  const text = readFileSync(join(jsDir, f), 'utf8');
  const at = text.indexOf(LIVE);
  if (at >= 0) {
    // Where it sits, so the reason can be found rather than guessed.
    const around = text.slice(Math.max(0, at - 120), at + 60).replace(/\s+/g, ' ');
    fail(`в сборке есть адрес боевого сервера (${LIVE}) — не запускаю.\n  файл: ${f}\n  рядом: …${around}…`);
  }
  if (text.includes(api)) hasLocal = true;
}
if (!hasLocal) fail(`в сборке нет адреса ${api} — не понимаю, куда она пойдёт; не запускаю.`);
console.log(`· сборка ходит на ${api}, боевого адреса в ней нет`);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};
const isFile = (p) => existsSync(p) && statSync(p).isFile();
createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.includes('..')) {
    res.writeHead(400).end();
    return;
  }
  // A route is served by its own page when there is one, else by the app's entry.
  const file =
    [path, `${path}.html`, join(path, 'index.html')].map((p) => join(OUT, p)).find(isFile) ??
    join(OUT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`· готово: http://localhost:${PORT} — окно не закрывать; остановить Ctrl+C`);
});
