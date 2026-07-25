/**
 * Lists locale keys that nothing in the code appears to reference.
 *
 * The existing i18n check guards one direction only — every key the code asks
 * for must exist. Nothing guarded the other way, so keys left behind by
 * deleted screens piled up quietly and the next person could not tell which
 * wording was still in use.
 *
 * RUN IT AS `node scripts/check-i18n-unused.mjs` — deliberately NOT wired into
 * package.json. The app's runtimeVersion policy is "fingerprint", and the
 * fingerprint hashes package.json: adding a script there changes the runtime
 * version, and an over-the-air update published under a new runtime never
 * reaches the copies already installed. A reporting tool is not worth
 * stranding everyone's app, so this one stays out of the manifest.
 *
 * This REPORTS and always exits 0. It is deliberately not a gate: a key can be
 * assembled at run time in ways no scan can see (a value out of a variable, a
 * name built from data), so a hard failure here would block honest work over a
 * guess. Read the list, check the ones you recognise, delete what is truly
 * gone.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ru = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'locales/ru.json'), 'utf8'),
);

const keys = [];
const walk = (node, prefix) => {
  for (const [k, v] of Object.entries(node)) {
    const kp = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') walk(v, kp);
    else keys.push(kp);
  }
};
walk(ru, '');

const files = [];
const scan = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.'))
      continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) scan(f);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(f);
  }
};
scan(ROOT);
const src = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

// Keys written out in full, anywhere: t('a.b'), a list of key names, …
const literals = new Set();
for (const m of src.matchAll(
  /['"`]([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)['"`]/g,
))
  literals.add(m[1]);

// Families addressed by prefix: t(`home.kinds.${kind}`)
const prefixes = new Set();
for (const m of src.matchAll(/`([a-zA-Z][a-zA-Z0-9_.]*)\.\$\{/g))
  prefixes.add(`${m[1]}.`);

const unused = keys.filter(
  (k) => !literals.has(k) && ![...prefixes].some((p) => k.startsWith(p)),
);

if (unused.length === 0) {
  console.log(`OK: all ${keys.length} keys are referenced.`);
  process.exit(0);
}

const byArea = {};
for (const k of unused) (byArea[k.split('.')[0]] ??= []).push(k);

console.log(
  `${unused.length} of ${keys.length} keys look unreferenced (report only — verify before deleting):\n`,
);
for (const [area, list] of Object.entries(byArea).sort(
  (a, b) => b[1].length - a[1].length,
)) {
  console.log(`${area} (${list.length})`);
  for (const k of list) console.log(`  ${k}`);
}
