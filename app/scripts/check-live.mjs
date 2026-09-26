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
 * One case reads ❌ without anything wrong: the site is rebuilt only when a
 * push touches app/ (the workflow's path filter), so a commit elsewhere in
 * the repository leaves the site on the one before.
 *
 * Reads only: two public addresses and `git ls-remote`. Changes nothing.
 */
import { spawnSync } from 'node:child_process';

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
function line(name, live, latest, extra = '') {
  const ok = !!live && live === latest;
  if (!ok) bad += 1;
  const why = !live
    ? 'не сообщает коммит (выкачен до 26 сентября или не отвечает)'
    : live === latest
      ? 'последний коммит'
      : `на GitHub уже ${short(latest)} — выкат ещё идёт или не удался`;
  console.log(`${ok ? '✅' : '❌'} ${name}: ${short(live)} — ${why}${extra}`);
}
line('Сайт', site?.commit ?? null, want.app, site?.app?.hash ? ` · отпечаток ${site.app.hash}` : '');
line('Сервер', api?.commit ?? null, want.server);
process.exit(bad ? 1 : 0);
