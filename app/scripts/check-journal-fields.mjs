#!/usr/bin/env node
/**
 * EVERY FIELD THE JOURNAL MAY SHOW HAS A NAME (20 October 2026).
 *
 * The change journal names each changed field through
 * `journal.fieldNames.<field>`, and falls back to the field's code name when
 * there is none. Thirty-three fields had none: «CANCELREASON», «NOTICE»,
 * «PUBLISHEDAT» stood in the journal of every language, and nothing noticed,
 * because no check knew which fields the SERVER writes. Found only by walking
 * the screens in English and German.
 *
 * This reads the server's own calls to the journal — logUpdate, logCreate,
 * logRawUpdate, logFieldsChanged, logEvent — with the TypeScript parser, and
 * collects the field names they can write:
 *
 *   - `fields: [...]` and `changedFields: [...]` (string literals, a spread
 *     of a constant array declared in the same file);
 *   - the keys of an object literal given as `after:` (a creation lists
 *     every key it is given) or `detail:` (an event lists its detail keys);
 *   - the same through a function of the same file that returns an object
 *     literal (`after: speakerSnapshot(saved)`).
 *
 * What it cannot follow (a computed key, an object built elsewhere) it
 * counts and says so; it does not guess. Checked when the server is checked
 * out beside the app (the local gate); CI of the app alone skips it, as
 * scripts/check-server-refusals.mjs does.
 *
 * Usage: node scripts/check-journal-fields.mjs   (from the app folder)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, '../server/src');
if (!existsSync(SERVER)) {
  console.log('Журнал: сервер не лежит рядом — проверка полей пропущена.');
  process.exit(0);
}
const ts = createRequire(import.meta.url)('typescript');

const LANGS = ['ru', 'en', 'de'];
const names = Object.fromEntries(
  LANGS.map((l) => [
    l,
    JSON.parse(readFileSync(join(ROOT, `locales/${l}.json`), 'utf8')).journal.fieldNames,
  ]),
);

/**
 * Detail keys the journal says in its own sentence rather than as a line
 * (HANDLED_DETAIL in app/(app)/publishers/journal.tsx), and keys it never
 * shows as a field of its own.
 */
const journalSrc = readFileSync(join(ROOT, 'app/(app)/publishers/journal.tsx'), 'utf8');
const handled = new Set(
  [...(/const HANDLED_DETAIL = new Set\(\[([^\]]*)\]/.exec(journalSrc)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
    (m) => m[1],
  ),
);
const NOT_SHOWN = new Map([
  // the journal's own tail already speaks these (journal.tsx Row)
  ['document', 'S-21 view'],
  ['reason', 'refusal reason'],
  // an object (the dates a month's preparation passed over, with why): the
  // journal shows no line for a value it cannot read (readValue → null)
  ['skipped', 'object, not shown'],
]);

const METHODS = new Set(['logUpdate', 'logCreate', 'logRawUpdate', 'logFieldsChanged', 'logEvent']);

function files(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const found = new Map(); // field -> Set of "entity @ file:line"
let unresolved = 0;
const note = (field, where) => {
  if (!found.has(field)) found.set(field, new Set());
  found.get(field).add(where);
};

for (const file of files(SERVER)) {
  const src = readFileSync(file, 'utf8');
  if (!/\.log(Update|Create|RawUpdate|FieldsChanged|Event)\(/.test(src)) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);

  // Constants and functions of this file, by name.
  const consts = new Map();
  const funcs = new Map();
  const collect = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      let init = n.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init)) init = init.expression;
      consts.set(n.name.text, init);
      if (ts.isArrowFunction(init)) funcs.set(n.name.text, init);
    }
    if (ts.isFunctionDeclaration(n) && n.name) funcs.set(n.name.text, n);
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const stringsOf = (expr) => {
    if (!expr) return null;
    while (ts.isAsExpression(expr)) expr = expr.expression;
    if (ts.isIdentifier(expr) && consts.has(expr.text)) return stringsOf(consts.get(expr.text));
    if (!ts.isArrayLiteralExpression(expr)) return null;
    const out = [];
    for (const el of expr.elements) {
      if (ts.isStringLiteralLike(el)) out.push(el.text);
      else if (ts.isSpreadElement(el)) {
        const inner = stringsOf(el.expression);
        if (!inner) return null;
        out.push(...inner);
      } else return null;
    }
    return out;
  };

  const returnedObject = (fn) => {
    let body = fn.body;
    if (!body) return null;
    if (ts.isParenthesizedExpression(body)) body = body.expression;
    if (ts.isObjectLiteralExpression(body)) return body;
    let obj = null;
    const find = (n) => {
      if (!obj && ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) {
        obj = n.expression;
      }
      if (!obj) ts.forEachChild(n, find);
    };
    find(body);
    return obj;
  };

  const keysOf = (expr) => {
    if (!expr) return null;
    while (ts.isAsExpression(expr) || ts.isParenthesizedExpression(expr)) expr = expr.expression;
    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && funcs.has(expr.expression.text)) {
      expr = returnedObject(funcs.get(expr.expression.text));
      if (!expr) return null;
    }
    if (ts.isIdentifier(expr) && consts.has(expr.text)) return keysOf(consts.get(expr.text));
    if (!ts.isObjectLiteralExpression(expr)) return null;
    const out = [];
    for (const p of expr.properties) {
      if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name) {
        if (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) out.push(p.name.text);
        else return null; // a computed key — said by its own rule, not here
      } else if (ts.isSpreadAssignment(p)) {
        const inner = keysOf(p.expression);
        if (!inner) return null;
        out.push(...inner);
      } else return null;
    }
    return out;
  };

  const visit = (n) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      METHODS.has(n.expression.name.text) &&
      n.arguments[0] &&
      ts.isObjectLiteralExpression(n.arguments[0])
    ) {
      const method = n.expression.name.text;
      const props = new Map();
      for (const p of n.arguments[0].properties) {
        if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) props.set(p.name.text, p.initializer);
      }
      const entity = props.get('entityType');
      const ent = entity && ts.isStringLiteralLike(entity) ? entity.text : '?';
      const where = `${ent} @ ${file.slice(SERVER.length + 1)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
      let fields = null;
      if (method === 'logUpdate') fields = stringsOf(props.get('fields'));
      else if (method === 'logRawUpdate' || method === 'logFieldsChanged') {
        fields = stringsOf(props.get('changedFields') ?? props.get('fields'));
      } else if (method === 'logCreate') fields = keysOf(props.get('after'));
      else if (method === 'logEvent') fields = props.has('detail') ? keysOf(props.get('detail')) : [];
      if (fields === null) {
        unresolved++;
        if (process.env.VERBOSE) console.log(`  не разобрать: ${method} ${where}`);
      }
      else for (const f of fields) note(f, where);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const problems = [];
for (const [field, where] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
  if (handled.has(field) || NOT_SHOWN.has(field)) continue;
  const missing = LANGS.filter((l) => !names[l][field]);
  if (missing.length) problems.push(`  ${field} (нет: ${missing.join(', ')}) — ${[...where][0]}`);
}

if (problems.length) {
  console.error(
    `Журнал: ${problems.length} полей сервер может записать, а журнал назовёт их кодом — нет journal.fieldNames:\n`,
  );
  console.error(problems.join('\n'));
  console.error('\nДобавьте слова в locales/*.json → journal.fieldNames (все три языка).');
  process.exit(1);
}
console.log(
  `OK: журнал — у всех ${found.size} полей сервера есть названия на трёх языках` +
    (unresolved ? ` (${unresolved} вызовов не разобрать статически — их поля не проверены)` : ''),
);
