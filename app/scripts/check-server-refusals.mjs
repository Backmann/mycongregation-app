/**
 * The server's refusals, in words (13 October 2026).
 *
 *   1. lib/refusal-text.ts, run here as it is: a code with words, a wrong
 *      field, «only these may», «not found», and a refusal not yet coded.
 *   2. Every code the server may send (its list in
 *      ../server/src/common/errors/refusal.ts, read when the server is
 *      checked out beside the app) has words in ru, de and en — or is
 *      handled by a screen of its own, which names the code in its source.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const transpile = (src) =>
  ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } })
    .outputText;
const load = (js) => import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const problems = [];

// --- the locales ---------------------------------------------------------------
const LANGS = ['ru', 'de', 'en'];
const locales = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(read(`locales/${l}.json`))]));
const get = (obj, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const hasIn = (lang, key) => typeof get(locales[lang], key) === 'string';
const hasAll = (key) => LANGS.every((l) => hasIn(l, key));

// --- 1. the words ----------------------------------------------------------------
const { refusalText } = await load(transpile(read('lib/refusal-text.ts')));
const ru = locales.ru;
const tools = {
  // The key and its options, so a case can see what was asked for.
  say: (key, o) => {
    const text = get(ru, key);
    if (typeof text !== 'string') return `MISSING:${key}`;
    return text.replace(/\{\{(\w+)\}\}/g, (_, k) => String(o?.[k] ?? `{{${k}}}`));
  },
  has: (key) => typeof get(ru, key) === 'string',
  day: (iso) => `«${iso}»`,
  month: (ym) => `«${ym}»`,
  lang: 'ru',
};
for (const [what, status, data, check] of [
  ['код со словами и датой', 409, { code: 'FS_PAST_LOCKED', date: '2026-10-10', message: 'x' },
    (s) => s?.includes('«2026-10-10»') && !s.includes('{{')],
  ['поле с именем и правилом', 400, { code: 'INVALID_FIELD', fields: [{ field: 'address', rules: ['maxLength'] }] },
    (s) => s?.includes(get(ru, 'serverError.fields.address')) && s.includes(get(ru, 'serverError.rules.maxLength'))],
  ['поле во вложенном списке — по последней части', 400,
    { code: 'INVALID_FIELD', fields: [{ field: 'slots.2.startTime', rules: ['matches'] }] },
    (s) => s?.includes(get(ru, 'serverError.fields.startTime'))],
  ['поле без имени в приложении', 400, { code: 'INVALID_FIELD', fields: [{ field: 'zzz', rules: ['isUuid'] }] },
    (s) => s?.startsWith(get(ru, 'serverError.invalid.anonymous').split('{{')[0]) &&
      s.includes(get(ru, 'serverError.rules.isUuid'))],
  ['неизвестное правило', 400, { code: 'INVALID_FIELD', fields: [{ field: 'address', rules: ['somethingNew'] }] },
    (s) => s?.includes(get(ru, 'serverError.rules.other'))],
  ['лишнее поле — ошибка приложения, не человека', 400,
    { code: 'INVALID_FIELD', fields: [{ field: 'bogus', rules: ['whitelistValidation'] }] },
    (s) => s === get(ru, 'serverError.invalid.extra')],
  ['кто может — по обязанностям, со строчной', 403,
    { code: 'NEEDS_RESPONSIBILITY', responsibilities: ['service_overseer', 'service_overseer_assistant'] },
    (s) => s?.includes('служебный старейшина') && !s.includes('service_overseer')],
  ['кто может — по ролям', 403, { code: 'NEEDS_ROLE', roles: ['admin', 'elder'] },
    (s) => s?.includes('администратор') && s.includes('старейшина')],
  ['код особых событий — их прежние слова', 400, { code: 'EVENT_PAST_LOCKED' },
    (s) => s === get(ru, 'specialEvents.errors.EVENT_PAST_LOCKED')],
  ['404 без кода — общими словами', 404, { message: 'Field service meeting not found' },
    (s) => s === get(ru, 'serverError.notFound')],
  ['409 без кода — слова сервера (null)', 409, { message: 'Some conflict' }, (s) => s === null],
  ['403 без кода — слова сервера (null)', 403, { message: 'Not allowed' }, (s) => s === null],
  ['код, которого приложение ещё не знает', 400, { code: 'BRAND_NEW', message: 'x' }, (s) => s === null],
  ['месяц в словах', 409, { code: 'REPORT_EXISTS', reportMonth: '2026-09' }, (s) => s?.includes('«2026-09»')],
  ['пустой ответ', 400, null, (s) => s === null],
]) {
  let got;
  try {
    got = refusalText(status, data, tools);
  } catch (e) {
    got = `THREW ${e.message}`;
  }
  if (!check(got) || (typeof got === 'string' && got.includes('MISSING:'))) {
    problems.push(`слова: ${what} — вышло ${JSON.stringify(got)}`);
  }
}

// --- 2. every code the server may send has words -------------------------------------
let codes = null;
try {
  const text = read('../server/src/common/errors/refusal.ts');
  const body = text.slice(text.indexOf('REFUSAL_CODES = ['));
  codes = [...body.slice(0, body.indexOf(']')).matchAll(/'([A-Z][A-Z_]+)'/g)].map((m) => m[1]);
} catch {
  // The server is not checked out beside the app (CI of the app alone).
}

// The app's own source, without the locales: a screen that names a code
// handles it in its own words.
const scan = (d) =>
  readdirSync(join(ROOT, d)).flatMap((n) => {
    const p = `${d}/${n}`;
    return statSync(join(ROOT, p)).isDirectory() ? scan(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
const SOURCE = ['app', 'components', 'lib']
  .flatMap(scan)
  .filter((p) => p !== 'lib/refusal-text.ts')
  .map(read)
  .join('\n');

for (const key of [
  'serverError.notFound',
  'serverError.invalid.named',
  'serverError.invalid.anonymous',
  'serverError.invalid.extra',
  'serverError.rules.other',
]) {
  if (!hasAll(key)) problems.push(`нет слов ${key} в одном из языков`);
}

let byWords = 0;
let byScreen = 0;
if (codes) {
  if (codes.length === 0) problems.push('Список кодов отказов сервера пуст или не читается.');
  for (const code of codes) {
    if (code === 'INVALID_FIELD') continue; // said by serverError.invalid.*
    if (hasAll(`serverError.codes.${code}`) || hasAll(`specialEvents.errors.${code}`)) {
      byWords += 1;
      continue;
    }
    // Words in one language but not another: that is a gap, not a screen.
    const some = LANGS.some((l) => hasIn(l, `serverError.codes.${code}`));
    if (!some && (SOURCE.includes(`'${code}'`) || SOURCE.includes(`"${code}"`))) {
      byScreen += 1;
      continue;
    }
    problems.push(`код ${code}: нет слов во всех трёх языках (serverError.codes.${code})`);
  }
}

// --- 2b. the rule names are class-validator's own ---------------------------------
// The server names a broken rule by class-validator's constraint key, and
// those are not the decorators' names: @IsUUID says `isUuid`, @IsISO8601
// `isIso8601`, @Length `isLength`. Words kept under the decorator's name
// were never found, and «ничего не выбрано» became «значение не подходит»
// (13 October 2026). Checked when the server is checked out beside the app.
let rulesChecked = 0;
try {
  const serverRequire = createRequire(join(ROOT, '../server/package.json'));
  const cv = serverRequire('class-validator');
  const KNOWN = new Set(
    Object.entries(cv)
      .filter(([k, v]) => /^[A-Z][A-Z0-9_]+$/.test(k) && typeof v === 'string')
      .map(([, v]) => v),
  );
  const ruleKeys = (lang) => Object.keys(get(locales[lang], 'serverError.rules') ?? {});
  for (const lang of LANGS) {
    for (const key of ruleKeys(lang)) {
      if (key !== 'other' && !KNOWN.has(key)) {
        problems.push(`serverError.rules.${key} (${lang}): такого правила class-validator не присылает — слова не найдутся`);
      }
    }
  }
  // Every validating decorator the server uses has words, in every language.
  const scanServer = (d) =>
    readdirSync(join(ROOT, d)).flatMap((n) => {
      const p = `${d}/${n}`;
      return statSync(join(ROOT, p)).isDirectory() ? scanServer(p) : /\.ts$/.test(n) && !/\.spec\.ts$/.test(n) ? [p] : [];
    });
  const used = new Set();
  for (const rel of scanServer('../server/src')) {
    for (const m of read(rel).matchAll(/@([A-Z][A-Za-z0-9]+)\(/g)) used.add(m[1]);
  }
  // Decorator → constant: IsUUID → IS_UUID, MaxLength → MAX_LENGTH, Length → IS_LENGTH.
  const constant = (d) => d.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toUpperCase();
  const NOT_A_RULE = new Set(['IsOptional', 'ValidateIf', 'ValidateNested', 'Validate', 'Type', 'Transform']);
  for (const dec of used) {
    if (NOT_A_RULE.has(dec) || typeof cv[dec] !== 'function') continue;
    const value = cv[constant(dec)] ?? cv[`IS_${constant(dec)}`];
    if (typeof value !== 'string') continue;
    rulesChecked += 1;
    for (const lang of LANGS) {
      if (!hasIn(lang, `serverError.rules.${value}`) && value !== 'isObject') {
        problems.push(`@${dec}: сервер пришлёт правило «${value}», а слов serverError.rules.${value} (${lang}) нет`);
      }
    }
  }
  if (rulesChecked === 0) problems.push('Ни одного правила сервера не распознано — проверка правил сломалась.');
} catch (e) {
  if (e?.code !== 'MODULE_NOT_FOUND' && e?.code !== 'ENOENT') throw e;
  // The server is not checked out beside the app, or not installed.
}

// --- 3. the one door every screen goes through asks the words first -------------------
{
  const api = read('lib/api.ts');
  const fn = api.slice(api.indexOf('export function extractErrorMessage('));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  const a = body.indexOf('refusalText(');
  const b = body.indexOf('requestErrorText(');
  if (a < 0) problems.push('lib/api.ts: extractErrorMessage не спрашивает lib/refusal-text — отказы снова по-английски');
  else if (b >= 0 && a > b) problems.push('lib/api.ts: refusalText спрашивается после requestErrorText — код без слов сервера станет «ошибка 409»');
}

// --- 4. a window shows its own messages ----------------------------------------------
// A Modal is drawn above the whole app, the root strip under it: a refusal
// inside a window was raised where nobody could see it (13 October 2026).
// Every Modal carries <Toast layer />, unless it only picks a value and
// never saves — those are named here with the reason.
const PICKERS_ONLY = {
  'components/LanguagePicker.tsx': 'выбирает язык, ничего не сохраняет',
  'components/StatusReasonsModal.tsx': 'показывает причины, ничего не сохраняет',
  'components/DateField.tsx': 'выбирает дату, ничего не сохраняет',
  'components/WeekDrawer.tsx': 'выбирает неделю, ничего не сохраняет',
};
let windows = 0;
for (const rel of ['app', 'components'].flatMap(scan)) {
  const src = read(rel);
  const opened = (src.match(/<Modal\b/g) ?? []).length;
  if (opened === 0) continue;
  windows += opened;
  if (PICKERS_ONLY[rel]) continue;
  const strips = (src.match(/<Toast layer \/>/g) ?? []).length;
  if (strips < opened) {
    problems.push(`${rel}: окно (Modal) без своей полосы сообщений <Toast layer /> — отказ при сохранении окажется под окном`);
  }
}

if (problems.length > 0) {
  console.error('✗ Отказы сервера словами:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(
  codes
    ? `✓ Отказы сервера словами: ${codes.length} кодов — ${byWords} общими словами, ${byScreen} своим экраном; ${rulesChecked} правил проверки полей — со словами; правило проверено на 15 случаях; ${windows} окон показывают сообщения поверх себя`
    : `✓ Отказы сервера словами: правило проверено на 15 случаях (сервера рядом нет — коды не сверены); ${windows} окон показывают сообщения поверх себя`,
);
