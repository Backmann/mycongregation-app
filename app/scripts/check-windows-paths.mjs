#!/usr/bin/env node
/**
 * Every path in the repository must check out on Windows (Lionel's laptop
 * runs the phone checks from a clone there). On 29 October 2026 a folder
 * named `components/aux` stopped `git pull` dead: AUX, CON, PRN, NUL,
 * COM1-9 and LPT1-9 are device names on Windows, with or without an
 * extension. Also refused there: <>:"\|?* in a name, a name ending in a dot
 * or a space, and two paths differing only in letter case.
 */
import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '--full-name', ':/'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const bad = [];
const seen = new Map();
for (const f of files) {
  for (const part of f.split('/')) {
    if (RESERVED.test(part)) bad.push(`${f}: «${part}» — имя устройства в Windows`);
    else if (/[<>:"\\|?*]/.test(part)) bad.push(`${f}: недопустимый знак в «${part}»`);
    else if (/[. ]$/.test(part)) bad.push(`${f}: «${part}» кончается точкой или пробелом`);
  }
  const low = f.toLowerCase();
  if (seen.has(low) && seen.get(low) !== f) bad.push(`${f} и ${seen.get(low)}: различаются только регистром`);
  seen.set(low, f);
}
if (bad.length) {
  console.error('Пути, которые не откроются на Windows:\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log(`✓ Пути для Windows: ${files.length} файлов, все открываются`);
