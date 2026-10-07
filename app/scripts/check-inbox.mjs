#!/usr/bin/env node
/**
 * «Мои уведомления»: when the bell is lit, and which day a message is under.
 *
 * lib/inbox.ts decides both. A dot that never goes out teaches people to
 * ignore it; one that never lights makes the list pointless.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const js = ts.transpileModule(readFileSync(join(ROOT, 'lib/inbox.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { hasUnread, isUnread, daysAgo } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

const problems = [];
const expect = (name, got, want) => {
  if (got !== want) problems.push(`${name}: ожидалось ${want}, вышло ${got}`);
};
const at = (iso) => ({ at: iso });

expect('пустой список — колокольчик не горит', hasUnread([], null), false);
expect('список ни разу не открывали — горит', hasUnread([at('2026-10-07T10:00:00Z')], null), true);
expect('пришло после прочтения — горит', hasUnread([at('2026-10-07T10:00:00Z'), at('2026-10-05T10:00:00Z')], '2026-10-06T00:00:00Z'), true);
expect('всё пришло до прочтения — не горит', hasUnread([at('2026-10-05T10:00:00Z')], '2026-10-06T00:00:00Z'), false);
expect('пришло в ту же секунду, что прочтение, — уже прочитано', hasUnread([at('2026-10-06T00:00:00Z')], '2026-10-06T00:00:00Z'), false);
expect('строка новее отметки — новая', isUnread(at('2026-10-07T10:00:00Z'), '2026-10-06T00:00:00Z'), true);
expect('строка старше отметки — прочитана', isUnread(at('2026-10-05T10:00:00Z'), '2026-10-06T00:00:00Z'), false);

// The day is the reader's own: local midnight, not UTC's.
const local = (y, m, d, h, min) => new Date(y, m - 1, d, h, min);
const now = local(2026, 10, 7, 0, 10);
expect('23:30 вчера в 00:10 сегодня — «вчера»', daysAgo(local(2026, 10, 6, 23, 30).toISOString(), now), 1);
expect('00:05 сегодня — «сегодня»', daysAgo(local(2026, 10, 7, 0, 5).toISOString(), now), 0);
expect('три дня назад', daysAgo(local(2026, 10, 4, 12, 0).toISOString(), now), 3);
expect('часы устройства отстают — не «завтра»', daysAgo(local(2026, 10, 8, 9, 0).toISOString(), now), 0);

if (problems.length) {
  console.error('✗ Мои уведомления:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('✓ Мои уведомления: 11 случаев — когда горит колокольчик и под каким днём стоит сообщение');
