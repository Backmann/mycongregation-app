/**
 * Where to go after signing in (lib/return-path.ts, 16 November
 * 2026): only a path of this site comes back.
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
const out = mkdtempSync(join(ROOT, '.check-return-path-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'return-path.ts'), 'utf8');
  writeFileSync(
    join(out, 'm.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const { returnPath } = await import(pathToFileURL(join(out, 'm.mjs')).href);
  check('a proposal comes back', returnPath('/cart/recut/0f1e2d3c-aaaa-4bbb-8ccc-123456789abc'), '/cart/recut/0f1e2d3c-aaaa-4bbb-8ccc-123456789abc');
  check('with its query', returnPath('/cart/recut?x=1'), '/cart/recut?x=1');
  check('from an array of params: the first', returnPath(['/cart', '/x']), '/cart');
  check('another site: no', [returnPath('//evil.example/x'), returnPath('https://evil.example'), returnPath('/\\evil.example'), returnPath('javascript:alert(1)')], [null, null, null, null]);
  check('Home and the root: no (Home is where it goes anyway)', [returnPath('/'), returnPath('/home')], [null, null]);
  check('the sign-in pages: no', [returnPath('/login'), returnPath('/reset-password?token=x'), returnPath('/invite/abc')], [null, null, null]);
  check('nothing, a number, too long: no', [returnPath(undefined), returnPath(5), returnPath('/' + 'a'.repeat(400))], [null, null, null]);
  check('spaces and quotes: no', [returnPath('/a b'), returnPath('/a"b'), returnPath('/a<b')], [null, null, null]);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`✗ return after sign-in: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ return after sign-in: ${passed} checks`);
