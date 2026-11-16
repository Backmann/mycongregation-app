#!/usr/bin/env node
/**
 * The app has its own page for an address that is no page (16 November 2026).
 *
 * Without app/+not-found.tsx Expo Router draws its built-in "Unmatched Route"
 * page: English, with a link to the list of every route, and — opened from
 * scratch in the browser — not matching the page shell the server sends, so
 * React throws #418 and draws the page again. Measured on the stand before
 * and after: the own route file is loaded like the others and hydrates.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', '+not-found.tsx');
if (!existsSync(file) || !/export default function/.test(readFileSync(file, 'utf8'))) {
  console.error('✗ app/+not-found.tsx is missing: unknown addresses fall to Expo Router\'s English page and React #418.');
  process.exit(1);
}
console.log('✓ own page for unknown addresses');
