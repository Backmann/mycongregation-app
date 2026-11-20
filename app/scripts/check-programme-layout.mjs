#!/usr/bin/env node
/**
 * Variant «В» of the programme screen (lib/programme-layout.ts, 20 November
 * 2026), held to examples: a phone and a tablet upright stay as they were
 * (the part as a window over the week); with the side menu the part opens on
 * the right; the two meetings stand side by side only while no part is open
 * beside them. And the screen really places the part in a panel.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'programme-layout-'));
for (const name of ['screen-width', 'programme-layout'])
  writeFileSync(
    join(out, `${name}.mjs`),
    ts
      .transpileModule(readFileSync(join(ROOT, 'lib', `${name}.ts`), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      })
      .outputText.replace(/from '\.\/([a-z-]+)'/g, "from './$1.mjs'"),
  );
const L = await import(pathToFileURL(join(out, 'programme-layout.mjs')));

let failures = 0;
let passed = 0;
const check = (name, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
};
const off = { panel: false, twoColumns: false, meetingsOpen: false };
check('phone', L.programmeLayout(390, 390, false), off);
check('phone, part open', L.programmeLayout(390, 390, true), off);
check('tablet upright stays as it was', L.programmeLayout(820, 820, true), off);
check('1024: part on the right, meetings one under the other', L.programmeLayout(1024, 792, false),
  { panel: true, twoColumns: false, meetingsOpen: true });
check('1280: both meetings side by side', L.programmeLayout(1280, 1048, false),
  { panel: true, twoColumns: true, meetingsOpen: true });
check('1280 with a part open: one column beside the panel', L.programmeLayout(1280, 1048, true),
  { panel: true, twoColumns: false, meetingsOpen: true });
check('a narrow area on a wide window is not a panel', L.programmeLayout(1280, 700, false), off);

const edit = readFileSync(join(ROOT, 'app/(app)/schedule/edit.tsx'), 'utf8');
check('the screen asks the layout', edit.includes('programmeLayout('), true);
check('the part is placed in a panel', /<AssignmentSheet\s+panel/.test(edit), true);
const sheet = readFileSync(join(ROOT, 'components/Sheet.tsx'), 'utf8');
check('the shell knows a panel', sheet.includes('variant === "panel"'), true);
check('a window opened inside the panel stays in it', sheet.includes('<PanelPortal host={panelHost}>'), true);

console.log(`${failures ? '✗' : '✓'} раскладка программы: ${passed} проверок${failures ? `, ошибок ${failures}` : ''}`);
process.exit(failures ? 1 : 0);
