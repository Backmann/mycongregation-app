/**
 * Bringing the territories over (lib/territory-import.ts, 11 November 2026):
 * the old tool's map export, the S-13 spreadsheet and the boundary KML are
 * read, the territory numbers paired across spellings, and the fresher dates
 * matched with the names. Invented files only — the real ones name people.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const JSZip = require('jszip');

// Written inside the app so that `jszip` resolves from its node_modules.
const out = mkdtempSync(join(ROOT, '.check-territory-'));
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
  const src = readFileSync(join(ROOT, 'lib', 'territory-import.ts'), 'utf8');
  writeFileSync(
    join(out, 'ti.mjs'),
    ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  );
  const T = await import(pathToFileURL(join(out, 'ti.mjs')));

  // ---- the map export ----
  const square = (x, y) => ({
    type: 'Polygon',
    coordinates: [[[x, y], [x + 0.01, y], [x + 0.01, y + 0.01], [x, y + 0.01], [x, y]]],
  });
  const map = T.readMapExport(
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          geometry: square(7, 51),
          properties: {
            name: 'Nord1',
            location: 'Nord ',
            comment: '',
            last_process_end: '2025-10-01',
            processes: [
              { start: '2025-02-01', end: '2025-10-01', publisher_id: { id: 11 } },
              { start: '2026-03-01', end: '', publisher_id: { id: 12 } },
            ],
          },
        },
        {
          geometry: square(7.01, 51),
          properties: {
            name: 'Waldweg',
            location: 'Wald',
            comment: 'Nicht besuchen: Musterweg 1',
            processes: [{ start: '2025-04-01', end: '2025-09-15', publisher_id: { id: 12 } }],
          },
        },
      ],
    }),
  );
  check('map: territories', map.territories.map((t) => [t.number, t.locality, t.lastCompletedOn]), [
    ['Nord1', 'Nord', '2025-10-01'],
    ['Waldweg', 'Wald', null],
  ]);
  check('map: a comment is kept for review', map.territories[1].comment, 'Nicht besuchen: Musterweg 1');
  check('map: lines with anonymous holders', map.lines.map((l) => [l.number, l.assignedOn, l.endedOn, l.holder]), [
    ['Nord1', '2025-02-01', '2025-10-01', '#11'],
    ['Nord1', '2026-03-01', null, '#12'],
    ['Waldweg', '2025-04-01', '2025-09-15', '#12'],
  ]);

  // ---- the S-13 spreadsheet: names in one row, dates (Excel days) under ----
  const serial = (iso) => (Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000;
  const shared = ['Номер участка', 'Nord 1', 'Anna Beispiel', 'Waldwegg', 'Boris Muster'];
  const sst = `<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`;
  const cell = (ref, v, s) => (s ? `<c r="${ref}" t="s"><v>${v}</v></c>` : `<c r="${ref}"><v>${v}</v></c>`);
  const sheet = `<worksheet><sheetData>
    <row r="1">${cell('A1', 0, true)}</row>
    <row r="2">${cell('A2', 1, true)}${cell('B2', serial('2024-06-01'))}${cell('C2', 2, true)}</row>
    <row r="3">${cell('C3', serial('2025-02-01'))}${cell('D3', serial('2025-09-30'))}</row>
    <row r="4">${cell('A4', 3, true)}${cell('C4', 4, true)}</row>
    <row r="5">${cell('C5', serial('2025-04-01'))}${cell('D5', serial('2025-09-15'))}</row>
  </sheetData></worksheet>`;
  const zip = new JSZip();
  zip.file('xl/sharedStrings.xml', sst);
  zip.file('xl/worksheets/sheet1.xml', sheet);
  // The same lines again on a second sheet: read once.
  zip.file('xl/worksheets/sheet2.xml', sheet);
  const lines = await T.readS13Xlsx(await zip.generateAsync({ type: 'uint8array' }));
  check('S-13: two lines, header and duplicate sheet ignored', lines, [
    { number: 'Nord 1', assignedOn: '2025-02-01', endedOn: '2025-09-30', holder: 'Anna Beispiel' },
    { number: 'Waldwegg', assignedOn: '2025-04-01', endedOn: '2025-09-15', holder: 'Boris Muster' },
  ]);

  // ---- numbers paired across spellings ----
  const pairs = T.pairNumbers(
    ['Nord 1', 'Waldwegg', 'Fremd9'],
    ['Nord1', 'Waldweg'],
  );
  check('pairs: spaces, and a spelling with the same first letters', [...pairs], [
    ['Nord 1', 'Nord1'],
    ['Waldwegg', 'Waldweg'],
  ]);
  check('pairs: two candidates are not guessed', [...T.pairNumbers(['Ahlen1'], ['Ahlen01', 'Ahlenx1'])], []);

  // ---- reconciling: map dates, sheet names, a holder named once is named everywhere ----
  const r = T.reconcile(map.lines, lines, pairs);
  check('reconcile', r, [
    { number: 'Nord1', assignedOn: '2025-02-01', completedOn: '2025-10-01', name: 'Anna Beispiel', disagrees: true },
    { number: 'Nord1', assignedOn: '2026-03-01', completedOn: null, name: 'Boris Muster', disagrees: false },
    { number: 'Waldweg', assignedOn: '2025-04-01', completedOn: '2025-09-15', name: 'Boris Muster', disagrees: false },
  ]);

  // ---- the boundary ----
  const kml = `<kml><Document><Placemark><ExtendedData>
    <Data name="LastUpdatedIso"><value><![CDATA[2022-06-20]]></value></Data>
    <Data name="BorderNorth"><value><![CDATA[n. von Nord]]></value></Data>
    </ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>7,51,0 7.1,51,0 7.1,51.1,0 7,51,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
  const b = T.readBoundaryKml(kml);
  check('boundary', [b.geometry.coordinates[0].length, b.validFrom, b.description], [4, '2022-06-20', { north: 'n. von Nord' }]);

  // ---- names to cards ----
  const cards = [
    { id: 'a', name: 'Евангелу Валентина' },
    { id: 'b', name: 'Келлер Тамара' },
    { id: 'c', name: 'Келлер Борис' },
  ];
  check('cards: Latin name to a Cyrillic card', T.guessCard('Valentina Evangelou', cards)?.id, 'a');
  check('cards: order of words does not matter', T.guessCard('Keller Tamara', cards)?.id, 'b');
  check('cards: a surname alone matching two cards is not guessed', T.guessCard('Keller', cards), null);
  check('cards: nobody', T.guessCard('Pavel Müller', cards), null);

  // «Last worked» brought over (12 November 2026): the day before the kept
  // years, for the earlier S-13; later days come with the lines themselves.
  const L = (number, assignedOn, endedOn) => ({ number, assignedOn, endedOn, holder: '#1' });
  const hist = [L('A1', '2024-01-10', '2024-05-02'), L('A1', '2024-09-01', '2025-03-01'), L('A1', '2025-10-01', '2026-02-01')];
  check('last worked: the last day before the kept years', T.lastWorkedToBring('A1', hist, '2026-02-01', '2025-09-01'), '2025-03-01');
  check('last worked: other numbers do not count', T.lastWorkedToBring('A2', hist, null, '2025-09-01'), null);
  check('last worked: the tool\'s day, when no kept line has it', T.lastWorkedToBring('A1', hist, '2026-04-04', '2025-09-01'), '2026-04-04');
  check('last worked: only the tool\'s old day', T.lastWorkedToBring('B1', [], '2024-06-01', '2025-09-01'), '2024-06-01');
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`territory import: ${failures} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`territory import: ${passed} passed`);
