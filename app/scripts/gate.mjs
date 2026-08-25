#!/usr/bin/env node
/**
 * The whole gate, in one command.
 *
 * The checks had been accumulating faster than the shell alias that ran them:
 * the type check, `expo lint`, the three i18n checks, the UTC-date guard, the
 * route-type generator, and `eslint .` for everything `expo lint` refuses to
 * look at. Each new one meant editing a .bashrc on a Windows machine, which is
 * the one place none of this is versioned — so in practice a check would live
 * in CI and be invisible locally until GitHub complained.
 *
 * Now the list lives here. Adding a check is a change to this file, and the
 * alias never needs touching again.
 *
 * ORDER MATTERS in one place: the route declarations must be written before
 * the type check, or every path in the app is an unknown route.
 *
 * Called DIRECTLY, never through a new entry in package.json `scripts`. That
 * block is an input to the Expo fingerprint — measured, not assumed: adding
 * `&& eslint lib scripts` to the `lint` script moved the fingerprint from
 * cee67fec… to f809e7eb…, and an update published under a runtime version no
 * installed app carries reaches nobody. That cost four releases on 3 August.
 * Two of the steps below DO call npm scripts that already exist; that is fine,
 * because it changes nothing in the file.
 *
 * Usage, from anywhere inside the app folder:
 *   node scripts/gate.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every step, in the order CI runs them. */
const STEPS = [
  ['Типы маршрутов', 'node', ['scripts/gen-route-types.mjs']],
  ['Проверка типов', 'npx', ['tsc', '--noEmit']],
  ['expo lint', 'npm', ['run', 'lint']],
  // `expo lint` walks only /app and /components; this covers lib/, scripts/
  // and public/ — 51 files it never saw, including api.ts and week-rules.ts.
  ['eslint (всё остальное)', 'npx', ['eslint', '.']],
  ['Переводы', 'npm', ['run', 'i18n:check']],
  ['Даты без UTC', 'node', ['scripts/check-dates.mjs']],
];

let failed = null;

for (const [name, cmd, args] of STEPS) {
  process.stdout.write(`\n── ${name} ───────────────────────────\n`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    // npm and npx are .cmd shims on Windows; without a shell they are not
    // found at all, and the gate would report a failure that is not one.
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    failed = name;
    break;
  }
}

if (failed) {
  console.error(`\n✗ ВОРОТА ЗАКРЫТЫ: ${failed}\n`);
  process.exit(1);
}

console.log('\n✓ Ворота пройдены — можно коммитить\n');
