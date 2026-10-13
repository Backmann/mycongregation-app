/**
 * The app speaks German with «Sie» (decision of 28 September 2026).
 *
 * Three refusals written on 13 October 2026 slipped back to «du» — «Dein
 * Konto…», «kannst du…» — among 226 lines that were right, and nothing
 * noticed. This reads every German text of the app and fails on the
 * familiar forms. Words that merely contain the letters (Dutzend, Dusche)
 * are not matched: only the whole words. The plural «euch» is left alone:
 * it appears in titles quoted from publications («Vergewissert euch, was
 * wichtiger ist»), which are not the app speaking.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const de = JSON.parse(readFileSync(join(ROOT, 'locales/de.json'), 'utf8'));

const DU = /(^|[^\p{L}])(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)(?=[^\p{L}]|$)/iu;

const found = [];
let count = 0;
const walk = (o, path) => {
  if (typeof o === 'string') {
    count += 1;
    if (DU.test(o)) found.push(`${path}: ${o}`);
    return;
  }
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
  }
};
walk(de, '');

// The rule is checked on itself, so a broken pattern cannot pass silently.
const self = [
  ['Dein Konto ist nicht verbunden.', true],
  ['Diesen Bericht kannst du nicht ändern.', true],
  ['Bitte geben Sie Ihr Passwort ein.', false],
  ['Ein Dutzend Duschen', false],
];
for (const [text, want] of self) {
  if (DU.test(text) !== want) found.push(`Regel sich selbst: «${text}» — erwartet ${want}`);
}

if (found.length) {
  console.error('✗ Deutsch mit «Sie»: «du» gefunden:');
  for (const f of found) console.error('  ' + f);
  process.exit(1);
}
console.log(`✓ Deutsch mit «Sie»: ${count} Texte, kein «du»`);
