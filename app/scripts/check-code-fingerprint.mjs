#!/usr/bin/env node
/**
 * The code fingerprint, checked (26 September).
 *
 * The walkthrough compares a fingerprint worked out HERE with the one the
 * build and the server took; the server computes it in its own code
 * (src/dev-info/source-fingerprint.ts). Both are held to one fixture and one
 * number — if they drift apart, every server would look stale.
 */
import { Buffer } from 'node:buffer';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serverFingerprint, appFingerprint, changedFiles } from './code-fingerprint.mjs';

// Same number in the server's source-fingerprint.spec.ts.
const FIXTURE_HASH = process.env.PRINT_FIXTURE ? null : '10f81ed39fe1';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'fp-'));
  mkdirSync(join(root, 'src', 'b', '__tests__'), { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), 'x\r\ny\n');
  writeFileSync(join(root, 'src', 'b', 'c.ts'), 'z');
  writeFileSync(join(root, 'src', 'b', 'bin.dat'), Buffer.from([1, 0, 13, 10]));
  writeFileSync(join(root, 'src', 'd.spec.ts'), 'left out');
  writeFileSync(join(root, 'src', 'b', '__tests__', 'e.ts'), 'left out');
  return root;
}

if (process.env.PRINT_FIXTURE) {
  console.log(serverFingerprint(fixture()).hash);
  process.exit(0);
}

const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };

check('та же цифра, что у сервера', serverFingerprint(fixture()).hash === FIXTURE_HASH);
{
  const a = fixture();
  const b = fixture();
  writeFileSync(join(b, 'src', 'a.ts'), 'x\ny\n');
  check('переводы строк Windows и Unix — один и тот же файл', serverFingerprint(a).hash === serverFingerprint(b).hash);
}
{
  const a = fixture();
  const before = serverFingerprint(a);
  writeFileSync(join(a, 'src', 'd.spec.ts'), 'still left out');
  check('тесты сервера не в счёт', serverFingerprint(a).hash === before.hash);
  writeFileSync(join(a, 'src', 'b', 'c.ts'), 'zz');
  const after = serverFingerprint(a);
  check('правка файла меняет отпечаток', after.hash !== before.hash);
  check('и называет файл', JSON.stringify(changedFiles(before, after)) === '["src/b/c.ts"]');
}
{
  const root = mkdtempSync(join(tmpdir(), 'fpa-'));
  mkdirSync(join(root, 'lib'));
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'lib', 'x.ts'), 'a');
  writeFileSync(join(root, 'scripts', 'walk.mjs'), 'a');
  const before = appFingerprint(root);
  writeFileSync(join(root, 'scripts', 'walk.mjs'), 'b');
  check('правка самих проверок (scripts/) не требует пересборки', appFingerprint(root).hash === before.hash);
  writeFileSync(join(root, 'lib', 'x.ts'), 'b');
  check('правка кода приложения — требует', appFingerprint(root).hash !== before.hash);
}

if (failures.length) {
  console.error('Отпечаток кода — расхождения:\n' + failures.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
console.log('OK: code fingerprint agrees with the server and ignores what it should.');
