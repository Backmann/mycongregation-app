/**
 * The placeholders of the announcement templates (lib/announcement-templates.ts,
 * R-09 step 4): the reader writes them in his language, the server keeps one
 * spelling. Every language names every placeholder, no two alike, and the
 * words go to the server and back unchanged.
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
const out = mkdtempSync(join(ROOT, '.check-template-tokens-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'announcement-templates.ts'), 'utf8');
  writeFileSync(
    join(out, 'm.mjs'),
    ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } })
      .outputText,
  );
  const { TOKENS, toLocalTokens, fromLocalTokens, sampleFill } = await import(pathToFileURL(join(out, 'm.mjs')).href);
  const all = `${TOKENS.map((k) => `{${k}}`).join(' — ')}\n{unknown} { when } {}`;
  for (const lang of ['ru', 'de', 'en']) {
    const names = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')).announcements?.templates?.token ?? {};
    const name = (k) => names[k];
    check(`${lang}: every placeholder has a name`, TOKENS.filter((k) => typeof names[k] !== 'string' || !names[k]), []);
    check(`${lang}: no name holds a brace or a line break`, TOKENS.filter((k) => /[{}\n]/.test(names[k] ?? '')), []);
    const seen = TOKENS.map((k) => names[k]);
    check(`${lang}: no two names alike`, seen.filter((v, i) => seen.indexOf(v) !== i), []);
    const local = toLocalTokens(all, name);
    check(`${lang}: there and back unchanged`, fromLocalTokens(local, name), all);
    check(`${lang}: the reader sees his names`, TOKENS.every((k) => local.includes(`{${names[k]}}`)), true);
  }
  check('the preview fills known ones only', sampleFill('{when} {x} { when }', () => 'V'), 'V {x} { when }');
  check('a value starting a line gets its capital, inside it does not', sampleFill('{when} — a\nb {when}', () => 'v'), 'V — a\nb v');
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`\n✗ Template placeholders: ${failures} failed`);
  process.exit(1);
}
console.log(`✓ template placeholders: ${passed} checks`);
