#!/usr/bin/env node
/**
 * Every role has a name in every language.
 *
 * The profile prints the reader's role with a key built from the value the
 * server sends: `profile.roles.<role>`. A key built at run time is invisible
 * to the translation checks — they look for keys written out in the source —
 * so when the server gained `ministerial_servant` nothing complained, and the
 * profile showed the raw word to every ministerial servant (4 October 2026).
 *
 * The roles are read from the server's own enum when it is checked out beside
 * the app, and from the app's type otherwise (CI of the app alone), so the
 * check never silently passes for lack of a list.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['ru', 'en', 'de'];

function fromServer() {
  const file = join(ROOT, '..', 'server', 'src', 'common', 'enums', 'user-role.enum.ts');
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/=\s*'([a-z_]+)'/g)].map((m) => m[1]);
}

function fromApp() {
  const text = readFileSync(join(ROOT, 'lib', 'api.ts'), 'utf8');
  const found = new Set();
  // Every `role: "a" | "b" | …` union in the API types that is about the
  // user's role — other things are called `role` too (a part's «primary» and
  // «assistant»), and those unions never name an administrator.
  for (const line of text.matchAll(/\brole\??:\s*((?:"[a-z_]+"\s*\|\s*)+"[a-z_]+")/g)) {
    if (!line[1].includes('"admin"')) continue;
    for (const v of line[1].matchAll(/"([a-z_]+)"/g)) found.add(v[1]);
  }
  return [...found];
}

const server = fromServer();
const app = fromApp();
const roles = [...new Set([...(server ?? []), ...app])];

if (roles.length === 0) {
  console.error('Не нашлось ни одной роли: ни в перечне сервера, ни в типах приложения.');
  process.exit(1);
}

const problems = [];
if (server) {
  for (const r of server) {
    if (!app.includes(r)) problems.push(`роль «${r}» есть на сервере, но не в типах приложения (lib/api.ts)`);
  }
}
for (const lang of LANGS) {
  const names = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'))?.profile?.roles ?? {};
  for (const r of roles) {
    if (typeof names[r] !== 'string' || !names[r].trim()) {
      problems.push(`${lang}.json: нет названия для роли «${r}» (profile.roles.${r})`);
    }
  }
}

if (problems.length) {
  console.error('Названия ролей:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(
  `Role names: ${roles.length} roles × ${LANGS.length} languages` +
    (server ? ', compared with the server.' : ' (server not beside the app).'),
);
