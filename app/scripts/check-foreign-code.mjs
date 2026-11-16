/**
 * Failures of code not the app's own (lib/foreign-code.ts, 16 November
 * 2026): not sent to the journal of failures.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-foreign-code-'));
let failures = 0;
let passed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
}
try {
  const src = readFileSync(join(ROOT, 'lib', 'foreign-code.ts'), 'utf8');
  writeFileSync(
    join(out, 'm.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const { foreignOnly } = await import(pathToFileURL(join(out, 'm.mjs')).href);
  const O = 'https://mycongregation.org';
  // The entry of 14 November, and the same made again on the stand.
  check('the console or a tool: foreign', foreignOnly('TypeError: ts is not iterable\n    at <anonymous>:1:297', undefined, O), true);
  check('a one-line script with its call: foreign', foreignOnly('TypeError: x\n    at <anonymous>:1:77\n    at <anonymous>:1:98', undefined, O), true);
  check('an extension: foreign', foreignOnly('Error: x\n    at f (chrome-extension://abc/content.js:3:9)', undefined, O), true);
  check('Firefox console: foreign', foreignOnly('x@debugger eval code:1:5', undefined, O), true);
  check('the error event names another file: foreign', foreignOnly(undefined, 'chrome-extension://abc/x.js', O), true);
  // The app's own: always sent.
  check('a frame of the bundle: own', foreignOnly(`TypeError: a\n    at bl (${O}/_expo/static/js/web/entry-1.js:335:36758)`, undefined, O), false);
  check('Safari frames of the bundle: own', foreignOnly(`b@${O}/_expo/static/js/web/entry-1.js:3:4`, undefined, O), false);
  check('a native frame and one of the bundle: own', foreignOnly(`SyntaxError: j\n    at JSON.parse (<anonymous>)\n    at f (${O}/_expo/static/js/web/entry-1.js:3:4)`, undefined, O), false);
  check('no stack, no file (a network failure): own', foreignOnly(undefined, undefined, O), false);
  check('a stack of words without frames: own', foreignOnly('Error: Network request failed', undefined, O), false);
  check('the error event in the bundle file: own', foreignOnly(undefined, `${O}/_expo/static/js/web/entry-1.js`, O), false);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`✗ foreign code: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ failures of code not the app's own are not sent: ${passed} checks`);
