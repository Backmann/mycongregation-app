#!/usr/bin/env node
/**
 * What is live right now — asked of the site and the server themselves
 * (26 September).
 *
 *   node scripts/check-live.mjs
 *
 * Both say which commit they were built from (the deploy stamps it). This
 * compares that with the last commit pushed to GitHub for each repository,
 * so «did the deploy land?» has one answer that does not depend on the
 * Actions page — which twice that day showed a list minutes out of date.
 *
 * The site is rebuilt only when a push touches app/ (the workflow's path
 * filter), so a commit elsewhere in the repository leaves the site on the one
 * before. That used to read ❌ with nothing wrong; it is now told apart — see
 * nothingToDeploy.
 *
 * Reads only: two public addresses and `git ls-remote`. Changes nothing.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository this script lives in: app/scripts → two levels up. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SITE = 'https://mycongregation.org/build-info.json';
const API = 'https://api.mycongregation.org/api/health';
const REPOS = {
  app: 'https://github.com/Backmann/mycongregation-app',
  server: 'https://github.com/Backmann/mycongregation-server',
};

function pushed(repo) {
  const r = spawnSync('git', ['ls-remote', repo, 'refs/heads/main'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\s/)[0] : null;
}
async function json(url) {
  try {
    const res = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const [site, api] = await Promise.all([json(SITE), json(API)]);
const want = { app: pushed(REPOS.app), server: pushed(REPOS.server) };
const short = (s) => (s ? s.slice(0, 7) : '—');
let bad = 0;
/**
 * The site is rebuilt only when a push touches what the deploy watches. A
 * later commit that changes nothing there — a file in the repository's root,
 * say — leaves the site on the commit before, and that is the latest code of
 * the app, not a deploy that failed (5 October: removing a console tool from
 * the root read as «выкат не удался»). Answered from the local repository;
 * if it does not know both commits, the old wording stands.
 */
function nothingToDeploy(from, to, watched) {
  if (!watched || !from || !to) return false;
  const r = spawnSync('git', ['diff', '--quiet', from, to, '--', ...watched], { cwd: REPO_ROOT });
  return r.status === 0;
}
function line(name, live, latest, extra = '', watched = null) {
  const same = !!live && live === latest;
  const idle = !same && nothingToDeploy(live, latest, watched);
  const ok = same || idle;
  if (!ok) bad += 1;
  const why = !live
    ? 'не сообщает коммит (выкачен до 26 сентября или не отвечает)'
    : same
      ? 'последний коммит'
      : idle
        ? `последний код приложения (${short(latest)} на GitHub новее, но менял только файлы вне app/ — выкатывать нечего)`
        : `на GitHub уже ${short(latest)} — выкат ещё идёт или не удался`;
  console.log(`${ok ? '✅' : '❌'} ${name}: ${short(live)} — ${why}${extra}`);
}
// The same two paths as the workflow's filter (.github/workflows/deploy.yml).
line('Сайт', site?.commit ?? null, want.app, site?.app?.hash ? ` · отпечаток ${site.app.hash}` : '', [
  'app',
  '.github/workflows/deploy.yml',
]);
line('Сервер', api?.commit ?? null, want.server);
process.exit(bad ? 1 : 0);
