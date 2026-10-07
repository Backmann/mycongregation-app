#!/usr/bin/env node
/**
 * The QR code the app draws is a QR code.
 *
 * lib/qr.ts is our own, written so that no new dependency has to be installed
 * (see the note at its top). A picture that only looks like a code is worse
 * than none — the elder holds his phone out, the camera finds nothing, and
 * the two of them conclude that «приложение не работает».
 *
 * So every module of it is compared here with a second implementation that
 * shares no line with ours — Kazuhiko Arase's, which Expo's own tooling
 * carries as qrcode-terminal — for every version we support and all eight
 * masks. Where that package is not on the machine, the comparison is made
 * against digests recorded from it, so the check never passes by being absent.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');

const source = readFileSync(join(ROOT, 'lib/qr.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText;
const qr = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

const problems = [];

// One text per version 1…9: the address the app really shows, and around it
// every size the generator claims to handle, down to the last byte that fits.
const CAPACITY = [14, 26, 42, 62, 84, 106, 122, 152, 180];
const ADDRESS = 'https://mycongregation.org/reset-password?code=ABCD-2345&lang=ru';
const texts = [ADDRESS, 'Ж', 'https://mycongregation.org'];
for (const n of CAPACITY) {
  texts.push('x'.repeat(n));
  texts.push('y'.repeat(n - 1));
}

const picture = (rows) => rows.map((r) => r.map((v) => (v ? '1' : '0')).join('')).join('\n');
const digest = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

let reference = null;
try {
  const QRCode = require('qrcode-terminal/vendor/QRCode');
  const Level = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');
  reference = (text, version, mask) => {
    const code = new QRCode(version, Level.M);
    // The reference takes a string of single-byte characters.
    code.addData(String.fromCharCode(...qr.utf8Bytes(text)));
    code.makeImpl(false, mask);
    const size = code.getModuleCount();
    const rows = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(code.isDark(r, c));
      rows.push(row);
    }
    return rows;
  };
} catch {
  reference = null;
}

// Recorded from the reference on 7 October 2026: all eight masks of each text,
// one digest per text. Used alone when the reference is not installed, and
// checked against it when it is — so the record cannot go stale unnoticed.
const RECORDED = /*RECORDED*/ {
  '0d0d9e90a55f0eec': '363a9e10512c3efa',
  'af01de547c2d86e9': '3425b94e4aee982a',
  '86d7e1ede64ae1b4': '3111ee241f1ba767',
  '8108ed602688b707': '85d9327b09dd1834',
  '4240b5c3b74c1773': 'c555d93ac28bb997',
  '18d2a9c4fd84ab05': '2d7b42978db26a20',
  '329188efa21f89b7': '2f322c7cfce4f6ab',
  '2b2573d5ea0b352e': 'fe2d2fec5e1d9250',
  'ae294f629903e252': 'f5ed6d57cdd7ef99',
  '21210f9644c6fe6b': 'b7185b7e6280deb7',
  'f9180c0a8526ba9a': 'f7e97537da291c3c',
  '7197490a0df09feb': 'b6b02c76ae5dac54',
  'c807e8d8601a0eb7': 'f7b4ad863af03189',
  '5ccd9c2dfee48627': 'e996d71bafa9290b',
  '6c6a6dfa14be35c4': '405a4c24793dc7c0',
  'ccd16bc19afac2e6': '9f373db2a37e3626',
  '92dd06142f0237d7': 'f750649e1a80784b',
  '68d4a95bc47664e3': 'c4ad4d2a5fa9147d',
  '52e22f4068e1ea4c': '2f5b0a74d5ec76d9',
  '06b6bce48b25b355': 'bfbf549d7ac017d0',
  '919d951a0453f0a2': 'a87d35535a081af9',
} /*END*/;

const seenVersions = new Set();
for (const text of texts) {
  const bytes = qr.utf8Bytes(text);
  const version = qr.qrVersionFor(bytes.length);
  if (version === null) {
    problems.push(`«${text.slice(0, 24)}…» (${bytes.length} байт): версия не подобрана`);
    continue;
  }
  seenVersions.add(version);
  const ours = [];
  for (let mask = 0; mask < 8; mask++) {
    const m = qr.qrMatrixWithMask(bytes, version, mask);
    if (m.length !== version * 4 + 17) problems.push(`версия ${version}: размер ${m.length}`);
    ours.push(picture(m));
    if (reference) {
      const theirs = picture(reference(text, version, mask));
      if (theirs !== ours[mask]) {
        problems.push(`версия ${version}, маска ${mask}, ${bytes.length} байт: расходится с эталоном`);
      }
    }
  }
  const key = digest(text);
  const got = digest(ours.join('\n\n'));
  if (process.argv.includes('--record')) RECORDED[key] = got;
  else if (RECORDED[key] !== got) {
    problems.push(`${bytes.length} байт (версия ${version}): рисунок не совпадает с записанным`);
  }
}
for (let v = 1; v <= qr.QR_MAX_VERSION; v++) {
  if (!seenVersions.has(v)) problems.push(`версия ${v} не проверена ни одним текстом`);
}

// The picture the screen shows is one of the eight, whole, and square.
const shown = qr.qrMatrix(ADDRESS);
if (!shown) problems.push('адрес из письма не помещается в код');
else {
  const bytes = qr.utf8Bytes(ADDRESS);
  const version = qr.qrVersionFor(bytes.length);
  const all = [];
  for (let mask = 0; mask < 8; mask++) all.push(picture(qr.qrMatrixWithMask(bytes, version, mask)));
  if (!all.includes(picture(shown))) problems.push('показанный код не совпадает ни с одной из восьми масок');
}
// Longer than it was built for: «нет кода», never a broken one.
if (qr.qrMatrix('z'.repeat(181)) !== null) problems.push('текст длиннее 180 байт должен давать null');

if (process.argv.includes('--record')) {
  // Never record a picture the reference disagrees with.
  if (!reference || problems.length) {
    console.error('✗ запись невозможна:', reference ? problems.join('; ') : 'эталон не установлен');
    process.exit(1);
  }
  console.log(JSON.stringify(RECORDED, null, 2));
  process.exit(0);
}
if (problems.length) {
  console.error('✗ QR-код:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(
  `✓ QR-код: ${texts.length} текстов × 8 масок, версии 1–${qr.QR_MAX_VERSION}` +
    (reference ? ' — сверено с независимой реализацией' : ' — сверено с записанными рисунками'),
);
