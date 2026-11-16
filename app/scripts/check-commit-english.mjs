/**
 * Git is strictly English (16 October 2026). CI checks every commit message
 * of a pull request — and a pushed commit cannot be rewritten, so a Cyrillic
 * word there means a new branch and a new pull request (17 November 2026,
 * #233 → #234). This runs the same test locally on the commits of the
 * current branch that main does not have yet, before anything is pushed.
 */
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
let base = '';
for (const ref of ['origin/main', 'main']) {
  try {
    base = git('merge-base', 'HEAD', ref);
    break;
  } catch {
    // try the next
  }
}
if (!base) {
  console.log('check-commit-english: no main to compare with — skipped');
  process.exit(0);
}
const log = git('log', '--format=%h%x09%B%x00', `${base}..HEAD`);
const bad = log
  .split('\0')
  .map((s) => s.trim())
  .filter((s) => s && /[Ѐ-ӿ]/.test(s));
for (const b of bad) console.error(`✗ Not English: ${b.split('\n')[0]} …`);
if (bad.length) {
  console.error(`check-commit-english: ${bad.length} commit message(s) with Cyrillic — amend before pushing`);
  process.exit(1);
}
console.log('check-commit-english: every commit of this branch is in English');
