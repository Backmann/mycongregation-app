/**
 * «Не посещать» addresses (lib/no-call.ts, 12 November 2026): the same
 * address written otherwise, the street an address names, the streets offered
 * while typing, and the date a note from the old tool already carries.
 * addressKey must read as the server's does (its DB test uses the same pairs).
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-nocall-'));
let failures = 0;
let passed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
}
try {
  const src = readFileSync(join(ROOT, 'lib', 'no-call.ts'), 'utf8');
  writeFileSync(
    join(out, 'nc.mjs'),
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  );
  const N = await import(pathToFileURL(join(out, 'nc.mjs')));
  const same = (a, b) => N.addressKey(a) === N.addressKey(b);

  check('Str. and Strasse are the same', same('Schleusenstr. 8', 'Schleusenstrasse 8'), true);
  check('ß and ss, case and spaces', same('Musterstraße 1', 'musterstrasse  1'), true);
  check('another house is another address', same('Schleusenstr. 8', 'Schleusenstr. 18'), false);
  check('hyphens and spaces in a name', same('Walther- Rathenau Str. 83', 'Walther-Rathenau-Straße 83'), true);

  check('the street of an address', N.streetOf('Am Dahlhof 6'), 'Am Dahlhof');
  check('a street without a number', N.streetOf('Neuruppiner Str.'), 'Neuruppiner Str.');
  check('numbers in a list', N.streetOf('Neuruppiner Str. 2, 4, 6'), 'Neuruppiner Str.');

  const streets = ['Am Dahlhof', 'Dahlweg', 'Lindenfelder Weg', 'Schleusenstraße'];
  check('offered: begins with first, then contains', N.streetSuggestions(streets, 'dahl'), ['Dahlweg', 'Am Dahlhof']);
  check('nothing typed, nothing offered', N.streetSuggestions(streets, '  '), []);
  check('a house number typed: nothing offered', N.streetSuggestions(streets, 'Dahlweg 3'), []);
  check('found by its start', N.streetSuggestions(streets, 'schleusen'), ['Schleusenstraße']);
  check('the same street written short counts as typed', N.streetSuggestions(streets, 'schleusenstr'), []);
  check('the very street typed is not offered again', N.streetSuggestions(streets, 'Dahlweg'), []);

  check('inside', N.streetIsInside(streets, 'Schleusenstr. 8'), true);
  check('not inside', N.streetIsInside(streets, 'Hauptstraße 1'), false);
  check('streets unknown: cannot say', N.streetIsInside([], 'Hauptstraße 1'), null);

  check('the date in a note', N.dateInNote('Schleusenstr. 8 не посещать. Moltchanov, Vogt. 25.10.2026'), '2026-10-25');
  check('the last of two dates', N.dateInNote('Выдан 05.12.23, снова 11.10.2026'), '2026-10-11');
  check('a short year', N.dateInNote('отмечено 05.12.23'), '2023-12-05');
  check('no date', N.dateInNote('Am Ziegelofen 11 - не заходить'), null);
  check('not a real day', N.dateInNote('31.02.2026'), null);
  const note = 'Beispielweg 14 не посещать\nAm Teich 27 не посещать 11.10.2026';
  check('a dated line gives its date', N.dateForAddress(note, 'Am Teich 27'), '2026-10-11');
  check('an undated line gives none', N.dateForAddress(note, 'Beispielweg 14'), null);
  check('a street not in the note gives none', N.dateForAddress(note, 'Hauptstraße 1'), null);
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures > 0) {
  console.error(`\n✗ No-call addresses: ${failures} of ${failures + passed} checks failed.`);
  process.exit(1);
}
console.log(`OK: no-call addresses (${passed} checks).`);
