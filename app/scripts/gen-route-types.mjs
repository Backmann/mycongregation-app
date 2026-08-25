#!/usr/bin/env node
/**
 * Write the route declarations the type checker needs.
 *
 * app.json sets `experiments.typedRoutes: true`, so `router.push('/absences')`
 * is supposed to be checked against the routes that actually exist. It never
 * was: the declarations live in `.expo/types/router.d.ts`, that folder is in
 * .gitignore, and nothing generates it before `tsc --noEmit` runs — not in CI,
 * not locally. `npx expo export` does not produce it either; only the dev
 * server does, as a side effect of watching.
 *
 * With no declarations, EVERY route string is an error, which is why all 96
 * navigations in this app carry `as any` or `as never`. And a cast is not a
 * check: rename a screen and the old path passes tsc, passes lint, passes the
 * bundler, and fails in someone's hands.
 *
 * So the declarations are generated here, from the same expo-router internals
 * the dev server uses, and the type check runs afterwards. Removing the casts
 * is a separate job — this only makes it possible.
 *
 * Called DIRECTLY, never through a new entry in package.json `scripts`: that
 * block is an input to the Expo fingerprint. Measured, not assumed — adding a
 * single character to the `lint` script moved the fingerprint from
 * cee67fec… to f809e7eb…, and an update published under a runtime version no
 * installed app has reaches nobody. That cost four releases in a row on
 * 3 August.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));

const OUT = join(ROOT, '.expo', 'types');
mkdirSync(OUT, { recursive: true });

// The generator needs a require-context over the routes folder. Given none it
// silently produces a declaration file with NO routes in it — which type-checks
// every path as invalid and would be worse than having none at all.
const ponyfill = require(
  'expo-router/build/testing-library/require-context-ponyfill',
).default;
const ctx = ponyfill(resolve(ROOT, 'app'));

const { regenerateDeclarations } = require('expo-router/build/typed-routes');

// The write is debounced inside expo-router (Metro renames folders as a
// delete plus an add, and generating between the two would crash), so the
// process has to stay alive long enough for it to land.
regenerateDeclarations(OUT, {}, ctx);
setTimeout(() => {
  console.log('OK: route types written to .expo/types/router.d.ts');
}, 800);
