#!/usr/bin/env node
/**
 * A phone on its side: no screen runs under the system buttons (9 October 2026).
 *
 * Edge-to-edge, Android draws the app under the navigation buttons and the
 * camera cut-out. The header and the tab bar step aside by themselves; the
 * screens' own content did not, and on the right it went under the buttons.
 *
 * Held here:
 *   1. every screen stands under ScreenGate's frame, which pads the side
 *      insets — and the frame is ALWAYS drawn (not only when an inset is
 *      there), or turning the phone would rebuild the screen and lose what
 *      was typed in it;
 *   2. the full-screen sheet pads them on Android as well.
 * That every stack uses screenGate at all is held by check-screen-failure.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const problems = [];

const gate = read('components/ScreenGate.tsx');
if (!/function SideInsets\([^)]*\) \{\s*const \{ left, right \} = useSafeAreaInsets\(\);\s*return \(\s*<View style=\{\[styles\.frame, \{ paddingLeft: left, paddingRight: right \}\]\}/.test(gate)) {
  problems.push('ScreenGate: рамка экрана больше не отступает от боковых системных полос');
}
if (!/layout = function ScreenLayout\(\{ children, route \}\) \{\s*return \(\s*<SideInsets>\s*<Gate route=/.test(gate)) {
  problems.push('ScreenGate: экран стоит не под рамкой с боковыми отступами');
}
if (/SideInsets[\s\S]{0,200}(left|right)\s*(>|===|!==|\?\?|&&)/.test(gate.slice(gate.indexOf('function SideInsets'), gate.indexOf('type ScreenLayout')))) {
  problems.push('ScreenGate: рамка рисуется по условию — при повороте экран пересоздастся и потеряет набранное');
}
const sheet = read('components/Sheet.tsx');
if (!/Platform\.OS === "android" \? \{ paddingLeft: sideInsets\.left, paddingRight: sideInsets\.right \} : null/.test(sheet) || !/<SafeAreaView style=\{\[styles\.screen, sideRoom\]\}>/.test(sheet)) {
  problems.push('Sheet: полноэкранное окно на Android уходит под боковые системные кнопки');
}

if (problems.length) {
  console.error('✗ Телефон на боку:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('✓ Телефон на боку: экраны и полноэкранное окно отступают от боковых системных полос');
