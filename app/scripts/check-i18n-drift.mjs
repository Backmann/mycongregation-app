#!/usr/bin/env node
// scripts/check-i18n-drift.mjs
//
// Validates that locales/ru.json, locales/en.json, locales/de.json
// all contain the same set of keys (recursively, dot-flattened).
//
// CLDR plural awareness: Russian (and some other languages) have plural
// categories like _few and _many that English/German do not. Keys ending
// in those category suffixes may legitimately be missing from locales
// that do not need them. These suffixes are exempted from drift detection.
// _one and _other ARE required across all locales (every CLDR language
// uses them), so they are NOT exempted.
//
// Usage:
//   node scripts/check-i18n-drift.mjs
//   npm run i18n:check
//
// Added in P0 #3 (HANDOFF backlog).

import { readFile } from 'node:fs/promises';

const LANGUAGES = ['ru', 'en', 'de'];
const LOCALES_DIR = 'locales';

// CLDR plural suffixes that some languages need but others do not.
// Russian uses _few and _many; Arabic uses _zero and _two. English/German
// only use _one and _other (which are required to be consistent).
const OPTIONAL_PLURAL_SUFFIXES = ['_zero', '_two', '_few', '_many'];

function isOptionalPluralKey(key) {
  return OPTIONAL_PLURAL_SUFFIXES.some((s) => key.endsWith(s));
}

function flattenKeys(obj, prefix = '') {
  const keys = new Set();
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return keys;
  }
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const k of flattenKeys(value, fullKey)) {
        keys.add(k);
      }
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

const flattenedKeys = {};
for (const lang of LANGUAGES) {
  const path = `${LOCALES_DIR}/${lang}.json`;
  let json;
  try {
    json = JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    console.error(`Cannot parse ${path}: ${e.message}`);
    process.exit(1);
  }
  flattenedKeys[lang] = flattenKeys(json);
}

const union = new Set();
for (const lang of LANGUAGES) {
  for (const key of flattenedKeys[lang]) {
    union.add(key);
  }
}

let driftFound = false;
let optionalPluralCount = 0;

for (const lang of LANGUAGES) {
  const allMissing = [...union]
    .filter((k) => !flattenedKeys[lang].has(k))
    .sort();

  const required = allMissing.filter((k) => !isOptionalPluralKey(k));
  const optional = allMissing.filter((k) => isOptionalPluralKey(k));

  optionalPluralCount += optional.length;

  if (required.length > 0) {
    if (!driftFound) {
      console.error('i18n drift detected:\n');
      driftFound = true;
    }
    console.error(`Missing in ${lang}.json (${required.length} keys):`);
    for (const k of required) {
      console.error(`  - ${k}`);
    }
    console.error('');
  }
}

if (driftFound) {
  console.error(
    'Fix by adding the missing keys with translated values, or removing them',
  );
  console.error('from the other locales if intentional. Run this check with:');
  console.error('  npm run i18n:check');
  process.exit(1);
}

const summary = `OK: ${union.size} keys consistent across ${LANGUAGES.join('/')}`;
if (optionalPluralCount > 0) {
  console.log(
    `${summary} (${optionalPluralCount} CLDR-optional plural variants exempted).`,
  );
} else {
  console.log(`${summary}.`);
}
