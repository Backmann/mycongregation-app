#!/usr/bin/env node
/**
 * The app speaks in its own windows, on every platform.
 *
 * Until 23 November 2026 six places showed the BROWSER's alert on the web
 * (window.alert) and the app's strip on phones: an unstyled grey box with the
 * site's address on it, which blocks the page, cannot be translated, and was
 * the only window of the app that did not look like the app (the UX review
 * of the programme windows, 22 November). The app has its own:
 * `notify` (lib/error-bus.ts) for one line, `confirm` with `info: true`
 * (components/ConfirmHost.tsx) for a list or anything longer.
 *
 * Refused here: window.alert / window.confirm / window.prompt, and a bare
 * alert( / confirm( / prompt( call of the browser's — in the app's code.
 * A comment saying what it replaced is fine.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIRS = ['app', 'components', 'lib'];
const BROWSER = /\bwindow\.(alert|confirm|prompt)\s*\(|(^|[^.\w])(alert|prompt)\s*\(/;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(tsx?|jsx?)$/.test(name)) yield p;
  }
}

export function offending(source) {
  const out = [];
  source.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    if (BROWSER.test(code)) out.push(i + 1);
  });
  return out;
}

if (process.argv.includes('--self-test')) {
  const bad = offending('if (web) window.alert(msg);\nconst x = alert("hi");\nwindow.confirm(q)');
  const good = offending('Alert.alert(t, b);\n// window.alert was here\n * window.alert(x) in a doc\nconfirm({ title })\nnotify(t, m);');
  if (bad.join() !== '1,2,3' || good.length !== 0) {
    console.error('self-test failed:', bad, good);
    process.exit(1);
  }
  console.log('OK: self-test.');
  process.exit(0);
}

const hits = [];
for (const d of DIRS) {
  for (const f of files(join(ROOT, d))) {
    for (const n of offending(readFileSync(f, 'utf8'))) hits.push(`${relative(ROOT, f)}:${n}`);
  }
}
if (hits.length) {
  console.error(
    'Окно браузера вместо окна приложения (notify — одна строка, confirm с info — список):\n  ' + hits.join('\n  '),
  );
  process.exit(1);
}
console.log('OK: the app uses its own windows only.');
