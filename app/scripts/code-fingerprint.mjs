/**
 * A fingerprint of the code a check is about to test (26 September).
 *
 * Why not the commit: a patch changes files and the commit comes later, so
 * the commit is the same before and after — the one moment it matters. What
 * is compared is the CONTENT of the files that go into the thing being
 * checked.
 *
 * The same number on every computer for the same files: paths in sorted
 * order with «/», and Windows line endings made «\n» in text files (git on
 * Windows may write either). A file counts as text the way git decides —
 * no zero byte in its first 8000. The server computes the very same thing
 * (src/dev-info/source-fingerprint.ts); keep the two in step.
 *
 * Used by local-web.mjs (stamps the build), walkthrough.mjs (refuses a build
 * or a server older than the code) — and by me, to know that a green report
 * was made on exactly the patch I sent.
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** What goes into the web build. Not scripts/ — the checks themselves. */
export const APP_INPUTS = {
  dirs: ['app', 'components', 'lib', 'locales', 'assets', 'public'],
  files: ['app.json', 'package.json', 'package-lock.json', 'tsconfig.json'],
};

/** What the server runs. Tests are left out: they never reach the process. */
export const SERVER_INPUTS = { dirs: ['src'], files: [] };
const SERVER_SKIP = (rel) => /\.spec\.ts$/.test(rel) || /(^|\/)__tests__\//.test(rel);

function walk(root, dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(root, full, out);
    else if (st.isFile()) out.push(relative(root, full).split(sep).join('/'));
  }
}

export function listInputs(root, inputs, skip = () => false) {
  const files = [];
  for (const d of inputs.dirs) if (existsSync(join(root, d))) walk(root, join(root, d), files);
  for (const f of inputs.files) if (existsSync(join(root, f))) files.push(f);
  return files.filter((f) => !skip(f)).sort();
}

function normalized(buf) {
  const head = buf.subarray(0, 8000);
  if (head.includes(0)) return buf; // binary: as it is
  // CRLF → LF, byte by byte (no decoding, so nothing is lost).
  const out = Buffer.allocUnsafe(buf.length);
  let n = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a) continue;
    out[n++] = buf[i];
  }
  return out.subarray(0, n);
}

/** { hash, files: { path: fileHash } } — the per-file hashes name what changed. */
export function fingerprint(root, inputs, skip) {
  const total = createHash('sha256');
  const files = {};
  for (const rel of listInputs(root, inputs, skip)) {
    const body = normalized(readFileSync(join(root, rel)));
    const h = createHash('sha256').update(body).digest('hex').slice(0, 16);
    files[rel] = h;
    total.update(rel).update('\0').update(h).update('\0');
  }
  return { hash: total.digest('hex').slice(0, 12), files };
}

export const appFingerprint = (appDir) => fingerprint(appDir, APP_INPUTS);
export const serverFingerprint = (serverDir) =>
  fingerprint(serverDir, SERVER_INPUTS, SERVER_SKIP);

/** The files that differ between two fingerprints, for a message a person reads. */
export function changedFiles(was, now) {
  const all = new Set([...Object.keys(was.files || {}), ...Object.keys(now.files || {})]);
  return [...all].filter((f) => was.files?.[f] !== now.files?.[f]).sort();
}

export function describeChanges(list, max = 4) {
  if (list.length === 0) return '';
  const shown = list.slice(0, max).join(', ');
  return list.length > max ? `${shown} и ещё ${list.length - max}` : shown;
}
