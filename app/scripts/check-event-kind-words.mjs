#!/usr/bin/env node
/**
 * Every kind of event that can be made has its words.
 *
 * The event form builds its keys from the kind: the name
 * (specialEvents.types.<kind>), the hint on the choice
 * (specialEvents.create.hint.<kind>) and the save button
 * (specialEvents.form.save.<kind>). The usage scan cannot see a key built
 * from a variable, so a new kind with one of them missing passed every check
 * and showed the raw key on the button (25 November 2026, the general
 * cleaning). This reads the kinds from the form and asks for all three in
 * every language.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORM = 'components/SpecialEventForm.tsx';
const LANGS = ['ru', 'en', 'de'];
const SETS = ['specialEvents.types', 'specialEvents.create.hint', 'specialEvents.form.save'];

const src = readFileSync(join(ROOT, FORM), 'utf8');
const block = src.match(/export const EVENT_TYPES = \[([\s\S]*?)\] as const;/);
if (!block) {
  console.error(`✗ ${FORM}: EVENT_TYPES not found — the check must be updated with the form.`);
  process.exit(1);
}
const kinds = [...block[1].replace(/\/\/.*$/gm, '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
if (kinds.length < 5) {
  console.error(`✗ ${FORM}: only ${kinds.length} kinds read from EVENT_TYPES — the check must be updated.`);
  process.exit(1);
}

const missing = [];
for (const lang of LANGS) {
  const words = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'));
  for (const set of SETS) {
    const node = set.split('.').reduce((o, k) => (o ? o[k] : undefined), words);
    for (const kind of kinds) {
      const v = node?.[kind];
      if (typeof v !== 'string' || !v.trim()) missing.push(`${lang}: ${set}.${kind}`);
    }
  }
}

if (missing.length) {
  console.error(`✗ ${missing.length} words missing for the kinds of events:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exit(1);
}
console.log(`✓ Kinds of events: ${kinds.length} kinds × ${SETS.length} words × ${LANGS.length} languages`);
