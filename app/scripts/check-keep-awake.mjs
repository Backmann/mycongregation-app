#!/usr/bin/env node
/**
 * The screen stays on while the chairman runs the meeting — and the screen
 * survives a build without the native part.
 *
 * expo-keep-awake is not in package.json: it comes with expo itself and is
 * built into the installed app (autolinked; its android folder is part of the
 * runtime fingerprint). Declaring it would change the fingerprint and cut the
 * installed APKs off from updates, so it is used as it is.
 *
 * It looks for its native part THE MOMENT it is imported and throws if there
 * is none. So it must never be imported at the top of a file — one build
 * without it would lose the whole screen, not just the wake lock.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const problems = [];

const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
  });
for (const dir of ['app', 'components', 'lib']) {
  for (const f of walk(join(ROOT, dir))) {
    if (/^\s*import[^;]*from\s+['"]expo-keep-awake['"]/m.test(readFileSync(f, 'utf8'))) {
      problems.push(`${f.slice(ROOT.length + 1)}: expo-keep-awake подключён сверху файла — без нативной части экран упадёт целиком`);
    }
  }
}

const conduct = readFileSync(join(ROOT, 'app/(app)/schedule/conduct.tsx'), 'utf8');
if (!/try \{[\s\S]{0,200}require\('expo-keep-awake'\)/.test(conduct)) {
  problems.push('«Ведение встречи»: экран больше не держится включённым в приложении (или держится без try)');
}
if (!/deactivateKeepAwake\(TAG\)/.test(conduct)) problems.push('«Ведение встречи»: экран не отпускается после встречи');
if (!/wakeLock[\s\S]{0,80}request\('screen'\)/.test(conduct)) problems.push('«Ведение встречи»: в браузере экран больше не держится');

if (!existsSync(join(ROOT, 'node_modules/expo-keep-awake/expo-module.config.json'))) {
  problems.push('expo-keep-awake больше не приходит с expo — его нативной части нет в сборке');
}
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
if (pkg.dependencies?.['expo-keep-awake']) {
  problems.push('expo-keep-awake записан в package.json — это меняет отпечаток и отрезает установленные APK от обновлений');
}

if (problems.length) {
  console.error('✗ Экран не гаснет:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('✓ Экран не гаснет: на встрече держится и в приложении, и в браузере; модуль подключается так, что без него экран не падает');
