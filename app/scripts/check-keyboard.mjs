#!/usr/bin/env node
/**
 * A field being typed in is never left under the keyboard (2 November 2026).
 *
 * On Android the app runs edge-to-edge, and the window does not shrink for
 * the keyboard: it is drawn over the screen. Seen on Lionel's phone: the
 * address in «Мои контакты», the note of a new absence, the e-mail and the
 * notes of a new card — each one wholly under the keyboard. The cure is
 * components/KeyboardScroll.tsx; this check keeps every form on it.
 *
 * The rule:
 *   1. A file CARRIES text fields when it has a TextInput or a FormField in
 *      it, or imports a component that carries them inline. Components whose
 *      fields live inside their OWN sheet or dialog (a picker, an editor
 *      sheet) are named below with the reason: the sheet keeps its own fields
 *      above the keyboard, the screen behind it has nothing to do.
 *   2. In a file that carries fields, every vertical ScrollView is a
 *      KeyboardScroll — or the line above it says `keyboard-ok:` and why
 *      (a short inner list, a scroller with no field in it).
 *   3. In such a file every bare <Modal> lifts its card by the keyboard
 *      (useBottomRoom) — or says `keyboard-ok:` and why.
 *   4. The two shells everyone uses, Sheet and Dialog, scroll with
 *      KeyboardScroll themselves.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Fields inside their own sheet or dialog: the caller needs nothing. */
const SELF_CONTAINED = new Map([
  ['components/PublisherSelector.tsx', 'its search sits in its own sheet'],
  ['components/PublicTalkSelector.tsx', 'its search sits in its own sheet'],
  ['components/QuickReplaceSheet.tsx', 'a sheet'],
  ['components/StageScreenSheets.tsx', 'sheets'],
  ['components/attendance/AttendanceEditor.tsx', 'a sheet'],
  ['components/hours/LogSheet.tsx', 'a sheet'],
  ['components/local-needs/TopicForm.tsx', 'a sheet'],
  ['components/talk-log/QuickVisit.tsx', 'a sheet'],
  ['components/FieldServiceMeetingSheet.tsx', 'a sheet'],
  ['components/FieldServiceRuleSheet.tsx', 'a sheet'],
  ['components/PioneerMeetingForm.tsx', 'a sheet'],
  ['components/MemorialMeetingBlock.tsx', 'its fields are in its sheet'],
  ['components/DutiesSection.tsx', 'its fields are in its dialog'],
  ['components/PublisherAccessContent.tsx', 'its fields are in its dialogs'],
  ['components/auxiliary/AuxYearHistory.tsx', 'its field is in its dialog'],
  ['components/AssignmentForm.tsx', 'shown only inside AssignmentSheet, a sheet'],
  ['components/SongPicker.tsx', 'shown only inside AssignmentSheet, a sheet'],
]);

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}
const files = [...walk('app'), ...walk('components')];
const text = new Map(files.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
const problems = [];

for (const f of SELF_CONTAINED.keys()) {
  if (!text.has(f)) problems.push(`${f}: named as self-contained, but there is no such file`);
}

const direct = (s) => /<TextInput\b|<FormField\b/.test(s);
const importsOf = (f) => {
  const out = [];
  for (const m of text.get(f).matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const base = resolve(join(ROOT, dirname(f)), m[1]);
    for (const ext of ['.tsx', '/index.tsx']) {
      const rel = relative(ROOT, base + ext);
      if (text.has(rel)) out.push(rel);
    }
  }
  return out;
};

// 1. Which files carry fields inline — directly, or through what they import.
const carries = new Map();
function carriesFields(f, seen = new Set()) {
  if (carries.has(f)) return carries.get(f);
  if (seen.has(f)) return false;
  seen.add(f);
  let yes = direct(text.get(f));
  if (!yes) {
    for (const g of importsOf(f)) {
      if (SELF_CONTAINED.has(g)) continue;
      if (g === 'components/Sheet.tsx' || g === 'components/Dialog.tsx') continue;
      if (carriesFields(g, seen)) {
        yes = true;
        break;
      }
    }
  }
  carries.set(f, yes);
  return yes;
}

const okAbove = (lines, i) =>
  lines.slice(Math.max(0, i - 3), i + 1).some((l) => l.includes('keyboard-ok:'));

for (const f of files) {
  if (f === 'components/KeyboardScroll.tsx') continue;
  const isShell = f === 'components/Sheet.tsx' || f === 'components/Dialog.tsx';
  if (!isShell && !carriesFields(f)) continue;
  const lines = text.get(f).split('\n');
  lines.forEach((line, i) => {
    // 2. Vertical scrollers.
    if (/^\s*<ScrollView\b/.test(line)) {
      const tag = lines.slice(i, i + 8).join(' ');
      const horizontal = /\bhorizontal\b/.test(tag.split('>')[0]);
      if (!horizontal && !okAbove(lines, i)) {
        problems.push(
          `${f}:${i + 1}: поля ввода и простой ScrollView — клавиатура закроет нижние поля. ` +
            'Нужен KeyboardScroll (или строкой выше «keyboard-ok: почему»).',
        );
      }
    }
    // 3. Bare modals.
    if (/^\s*<Modal\b/.test(line) && !isShell && !okAbove(lines, i)) {
      if (!/useBottomRoom\(/.test(text.get(f))) {
        problems.push(
          `${f}:${i + 1}: окно <Modal> с полями ввода не поднимается над клавиатурой. ` +
            'Нужен useBottomRoom() (или строкой выше «keyboard-ok: почему»).',
        );
      }
    }
  });
}

// 4. The shells.
for (const f of ['components/Sheet.tsx', 'components/Dialog.tsx']) {
  if (!/<KeyboardScroll\b/.test(text.get(f))) {
    problems.push(`${f}: оболочка окна прокручивает без KeyboardScroll — поле с курсором не доедет до видимой части`);
  }
}

if (problems.length) {
  console.error(`✗ Клавиатура закроет поле (${problems.length}):`);
  for (const p of problems) console.error('  • ' + p);
  process.exit(1);
}
const n = [...carries.values()].filter(Boolean).length;
console.log(`✓ Поля над клавиатурой: ${n} файлов с полями ввода проверено`);
