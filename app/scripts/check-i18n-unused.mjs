#!/usr/bin/env node
/**
 * Every wording in locales/ru.json is asked for by the code — or it goes.
 *
 * The other translation check guards one direction: a key the code asks for
 * must exist. Nothing guarded the way back, so wording left behind by deleted
 * screens piled up — 279 keys by 5 October 2026, and nobody could tell which
 * text was still on a screen.
 *
 * WHAT COUNTS AS «ASKED FOR». The first version compared against quoted keys
 * and `a.b.${x}` prefixes, reported 456, and a third of that was wrong in the
 * dangerous direction — deleting by its list would have blanked the iPhone
 * install steps. Read from the syntax tree instead, a key is in use when:
 *   - it stands written out in full anywhere — t('a.b'), a table of keys, a
 *     ternary of two keys: any string that IS the key;
 *   - it is a form of number («_one», «_few», «_many», «_other») of such a
 *     key, or of a family below;
 *   - it belongs to a family addressed by its beginning: `a.b.${x}` or
 *     'a.b.' + x — and also `a.bStep${n}`, where the beginning ends in the
 *     middle of a word (that is how «iosStep1…3» were being missed).
 *
 * WHAT IT CANNOT SEE: a key put together with no fixed beginning at all —
 * `${a}.${b}`, or an array joined with dots. There is none in the app today
 * (looked for by hand on 5 October). If one is ever needed, name its keys in
 * KEPT below with a line saying why, rather than weakening the rule.
 *
 * FAILS the gate on any unused key: remove it from all three languages, or
 * list it in KEPT. Run directly — `node scripts/check-i18n-unused.mjs` — and
 * NOT from package.json: a script added there moves the Expo fingerprint and
 * an update published after that never reaches the installed apps.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');

/** Keys in use in a way the scan cannot see — each with its reason. */
const KEPT = new Set([]);

/** Where the app's own code lives. scripts/ is left out: its test data would
 *  count as use. */
const SCAN = ['app', 'components', 'lib', 'hooks', 'utils', 'constants', 'public'];
const PLURAL = /^(.*)_(zero|one|two|few|many|other)$/;
const KEY = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const DOT_PREFIX = /^[A-Za-z][A-Za-z0-9_.]*\.$/;
const WORD_PREFIX = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

export function collect(sources) {
  const literals = new Set();
  const prefixes = new Set();
  for (const { name, text } of sources) {
    const kind = /\.(tsx|jsx)$/.test(name) ? ts.ScriptKind.TSX : undefined;
    const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind);
    const visit = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        if (KEY.test(n.text)) literals.add(n.text);
      } else if (ts.isTemplateExpression(n)) {
        const head = n.head.text;
        if (DOT_PREFIX.test(head) || WORD_PREFIX.test(head)) prefixes.add(head);
      } else if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        (ts.isStringLiteral(n.left) || ts.isNoSubstitutionTemplateLiteral(n.left)) &&
        DOT_PREFIX.test(n.left.text)
      ) {
        prefixes.add(n.left.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { literals, prefixes: [...prefixes] };
}

export function unusedKeys(keys, { literals, prefixes }, kept = KEPT) {
  const used = (k) => literals.has(k) || prefixes.some((p) => k.startsWith(p));
  return keys.filter((k) => {
    if (kept.has(k) || used(k)) return false;
    const m = PLURAL.exec(k);
    return !(m && used(m[1]));
  });
}

function leafKeys(node, prefix = '', out = []) {
  for (const [k, v] of Object.entries(node)) {
    const kp = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') leafKeys(v, kp, out);
    else out.push(kp);
  }
  return out;
}

function sourceFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const f = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(f, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) out.push(f);
  }
  return out;
}

// Run as a script (the self-test imports the two functions instead).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const keys = leafKeys(JSON.parse(readFileSync(join(ROOT, 'locales/ru.json'), 'utf8')));
  const files = SCAN.flatMap((d) => sourceFiles(join(ROOT, d)));
  const found = collect(files.map((f) => ({ name: f, text: readFileSync(f, 'utf8') })));
  const unused = unusedKeys(keys, found);
  const stale = [...KEPT].filter((k) => !keys.includes(k));

  if (unused.length === 0 && stale.length === 0) {
    console.log(
      `OK: all ${keys.length} keys are asked for (${files.length} files, ${found.literals.size} written out, ${found.prefixes.length} families).`,
    );
    process.exit(0);
  }
  if (unused.length) {
    console.error(`✗ ${unused.length} of ${keys.length} keys are asked for by nothing:`);
    for (const k of unused) console.error(`  ${k}`);
    console.error(
      '\nRemove them from locales/ru.json, en.json and de.json — or, if the code builds\nthe key in a way this scan cannot see, list it in KEPT in this script and say why.',
    );
  }
  if (stale.length) {
    console.error(`✗ KEPT names keys that no longer exist: ${stale.join(', ')}`);
  }
  console.error(`\n(scanned ${relative(ROOT, join(ROOT, SCAN[0]))} … ${files.length} files)`);
  process.exit(1);
}
