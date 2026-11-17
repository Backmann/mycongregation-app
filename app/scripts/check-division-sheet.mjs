/**
 * The division on paper (17 November 2026): each pair in its own colour
 * and with its number, streets in walking order, walked ones struck out —
 * and never a «не посещать» address on the sheet, only how many there are
 * (decision of 13 November 2026: paper is lost on the street).
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(ROOT, '.check-division-sheet-'));
let failures = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${name}${detail ? `\n    ${detail}` : ''}`);
  }
};
try {
  const src = readFileSync(join(ROOT, 'lib', 'divisionSheetPdf.ts'), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  writeFileSync(join(out, 'sheet.mjs'), js);
  const { buildDivisionSheetHtml } = await import(pathToFileURL(join(out, 'sheet.mjs')));
  const sheet = {
    title: 'Hamm17 — пары 18 ноября',
    kicker: 'Участок на пары',
    number: 'Hamm17',
    subtitle: 'Hamm · 2 пары',
    png: null,
    scale: { mm: 20, label: '200 m' },
    parts: [
      {
        n: 1,
        color: '#0e7490',
        head: 'Пара 1',
        streets: [
          { text: 'Heessener Straße 2–84', sub: 'чётная сторона', walked: false },
          { text: 'Irisweg <b>', sub: null, walked: true },
        ],
        noCalls: 'На улицах этой пары 2 адреса «не посещать»',
      },
      { n: 2, color: '#c2410c', head: 'Пара 2', streets: [{ text: 'Ostring', sub: null, walked: false }], noCalls: null },
    ],
    walkedWord: 'пройдено',
    foot: 'Лист только на сегодня',
  };
  const html = buildDivisionSheetHtml(sheet);
  check('each pair in its colour', html.includes('border-left-color:#0e7490') && html.includes('border-left-color:#c2410c'));
  check('each pair numbered', /class="dot"[^>]*>1</.test(html) && /class="dot"[^>]*>2</.test(html));
  check('streets in order', html.indexOf('Heessener') < html.indexOf('Irisweg'));
  check('walked struck out', html.includes('<li class="walked">Irisweg'));
  check('escaped', html.includes('Irisweg &lt;b&gt;') && !html.includes('Irisweg <b>'));
  check('no map, no empty picture', !html.includes('<img'));
  check('with a map, the picture', buildDivisionSheetHtml({ ...sheet, png: 'data:image/png;base64,AA' }).includes('<img class="map"'));
  check('the count of do-not-call addresses', html.includes('2 адреса «не посещать»'));
  check('the title names the file', html.includes('<title>Hamm17 — пары 18 ноября</title>'));

  // The button that fills the sheet hands over a count, never an address.
  const button = readFileSync(join(ROOT, 'components', 'territories', 'DivisionPrint.tsx'), 'utf8');
  check('no address goes to paper', !/\.address\b/.test(button) && /noCalls\.length/.test(button));
  const builder = src.replace(/\/\*\*[\s\S]*?\*\//g, '');
  check('the sheet has no field for an address', !/address/i.test(builder));

  for (const lang of ['ru', 'de', 'en']) {
    const d = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')).territories.division.sheet;
    check(`${lang}: words of the sheet`, ['print', 'title', 'kicker', 'pair', 'walked', 'foot', 'commonStart', 'ownStart'].every((k) => !!d?.[k]));
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
if (failures) {
  console.error(`\n✗ Лист деления: ${failures} из ${failures + passed} проверок не прошли`);
  process.exit(1);
}
console.log(`✓ Лист деления на пары: ${passed} проверок`);
