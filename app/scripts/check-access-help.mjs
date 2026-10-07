#!/usr/bin/env node
/**
 * «Нужна помощь» — who the list of accounts points at, case by case.
 *
 * lib/access-help.ts is the one rule. A wrong word in it is silent in the
 * worst way: somebody who cannot sign in is simply not in the list the
 * administrator looks at, and everything else on the screen looks fine.
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
const js = ts.transpileModule(readFileSync(join(ROOT, 'lib/access-help.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { helpReason, HELP_ORDER, helpRank } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`
);

const NOW = Date.parse('2026-10-07T12:00:00Z');
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
const ahead = (days) => new Date(NOW + days * 86400000).toISOString();
const base = {
  isActive: true,
  publisherId: 'p1',
  hasPassword: true,
  lastLoginAt: ago(2),
  lastSeenAt: ago(1),
  inviteExpiresAt: null,
  lastFailedLoginAt: null,
};

const CASES = [
  ['входит как обычно', {}, null],
  ['не открывал приложение три месяца — не «застрял»', { lastLoginAt: ago(95) }, null],
  ['выключен — это чьё-то решение', { isActive: false, lastLoginAt: null, lastSeenAt: null, hasPassword: false }, null],
  ['выключен, даже с отказом сегодня', { isActive: false, lastFailedLoginAt: ago(0) }, null],
  ['последняя попытка не удалась', { lastFailedLoginAt: ago(0) }, 'failed'],
  ['не входил ни разу, отказ сегодня — важнее истёкшего кода', { lastLoginAt: null, lastSeenAt: null, hasPassword: false, inviteExpiresAt: ago(3), lastFailedLoginAt: ago(0) }, 'failed'],
  ['не входил, код истёк', { lastLoginAt: null, lastSeenAt: null, hasPassword: false, inviteExpiresAt: ago(3) }, 'codeExpired'],
  ['не входил, код ещё жив — ждёт, а не застрял', { lastLoginAt: null, lastSeenAt: null, hasPassword: false, inviteExpiresAt: ahead(20) }, 'codeWaiting'],
  ['не входил, кода не было, пароля нет', { lastLoginAt: null, lastSeenAt: null, hasPassword: false }, 'neverInvited'],
  ['не входил, хотя пароль ему задали', { lastLoginAt: null, lastSeenAt: null, hasPassword: true }, 'neverSignedIn'],
  ['не входил, пароль задан, код истёк', { lastLoginAt: null, lastSeenAt: null, hasPassword: true, inviteExpiresAt: ago(1) }, 'codeExpired'],
  ['входит, но карточки за записью нет', { publisherId: null }, 'noCard'],
  ['без карточки и не входил ни разу — сначала вход', { publisherId: null, lastLoginAt: null, lastSeenAt: null, hasPassword: false }, 'neverInvited'],
  ['входил раньше, выдан код, не использован', { inviteExpiresAt: ahead(1) }, 'codeWaiting'],
  ['входил раньше, тот код давно истёк — помогать не с чем', { inviteExpiresAt: ago(10) }, null],
  ['отметки входа нет, но приложением пользуется — входил', { lastLoginAt: null, lastSeenAt: ago(4), hasPassword: true }, null],
  ['отметки входа нет, пользуется, и выдан код', { lastLoginAt: null, lastSeenAt: ago(4), inviteExpiresAt: ahead(3) }, 'codeWaiting'],
  ['старый сервер: поля отказа нет вовсе', { lastFailedLoginAt: undefined }, null],
];

const problems = [];
for (const [name, over, want] of CASES) {
  const got = helpReason({ ...base, ...over }, NOW);
  if (got !== want) problems.push(`${name}: ожидалось «${want}», вышло «${got}»`);
}
// Every reason the rule can give has a place in the order, and a text in all
// three languages.
const reasons = new Set(CASES.map((c) => c[2]).filter(Boolean));
for (const r of reasons) if (helpRank(r) < 0) problems.push(`причины «${r}» нет в порядке показа`);
for (const r of HELP_ORDER) {
  if (!reasons.has(r)) problems.push(`причина «${r}» не проверена ни одним случаем`);
  for (const lang of ['ru', 'en', 'de']) {
    const dict = JSON.parse(readFileSync(join(ROOT, `locales/${lang}.json`), 'utf8'));
    if (typeof dict?.admin?.users?.help?.reason?.[r] !== 'string') {
      problems.push(`нет текста admin.users.help.reason.${r} в ${lang}.json`);
    }
  }
}

if (problems.length) {
  console.error('✗ Кому нужна помощь:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`✓ Кому нужна помощь: ${CASES.length} случаев, ${HELP_ORDER.length} причин с текстами на трёх языках`);
