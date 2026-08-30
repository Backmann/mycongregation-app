#!/usr/bin/env node
/**
 * Every screen must say whether it belongs in the tab bar.
 *
 * expo-router turns any folder under `app/(app)` into a tab unless the layout
 * names it and hides it with `href: null`. That is a silent default: nothing
 * fails, nothing warns, a new word simply appears at the bottom of the screen
 * next to «Главная» and «Профиль». It happened the day the Memorial screen was
 * added — the folder was there, the line was not, and «memorial» sat in the
 * tab bar in English until somebody looked at a screenshot.
 *
 * Nine screens were already hidden this way; forgetting the tenth cost nothing
 * but a person noticing. This is so the eleventh does not need noticing.
 *
 * The check is only that each screen is MENTIONED. Whether it is a real tab or
 * a hidden one is a decision, and decisions belong in the layout.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'app', '(app)');
const LAYOUT = join(DIR, '_layout.tsx');

const entries = readdirSync(DIR, { withFileTypes: true });
const screens = [
  ...entries.filter((e) => e.isDirectory()).map((e) => e.name),
  ...entries
    .filter((e) => e.isFile() && e.name.endsWith('.tsx'))
    .map((e) => e.name.replace(/\.tsx$/, ''))
    .filter((n) => n !== '_layout'),
];

const layout = readFileSync(LAYOUT, 'utf8');
const named = new Set(
  [...layout.matchAll(/name=["']([\w-]+)["']/g)].map((m) => m[1]),
);

const missing = screens.filter((s) => !named.has(s));

if (missing.length > 0) {
  console.error(
    'Эти экраны не названы в app/(app)/_layout.tsx и потому станут вкладками:\n',
  );
  for (const m of missing) console.error('  ' + m);
  console.error(
    '\nДобавь строку в раскладку — видимой вкладкой или, чаще,\n' +
      '  <Tabs.Screen name="' +
      missing[0] +
      '" options={{ href: null }} />',
  );
  process.exit(1);
}

console.log(`OK: all ${screens.length} screens are accounted for in the tab bar.`);
