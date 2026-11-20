#!/usr/bin/env node
/**
 * The midweek meeting's guidelines as rules (Lionel, 20 November 2026: «если
 * что-то расходится, то стоит сделать так, как указано»).
 *
 * The server refuses a save against them; the app's pickers offer only who
 * may take the part. Two copies of one rule drift, so:
 *   1. the examples of titles (lib/meeting-guidelines.fixtures.json) are the
 *      SAME file as the server's src/assignments/meeting-guidelines.fixtures.json
 *      — checked when the server is checked out beside the app;
 *   2. the rule's own text here is the server's, word for word, once the
 *      server's enum names are read as their values;
 *   3. this copy reads every example as the server's tests do, and the
 *      pickers get the limits the guidelines give each part.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
let passed = 0;
const check = (label, ok) => {
  if (ok) passed += 1;
  else {
    failures += 1;
    console.error(`✗ ${label}`);
  }
};

const appFixtures = read(join(ROOT, 'lib/meeting-guidelines.fixtures.json'));
const appRule = read(join(ROOT, 'lib/meeting-guidelines.ts'));

// --- 1, 2: the server's copy ------------------------------------------------
const serverDir = [
  process.env.SERVER_DIR,
  join(ROOT, '../server'),
  join(ROOT, '../../mycongregation-server'),
].find((d) => d && existsSync(join(d, 'src/assignments/meeting-guidelines.ts')));
if (serverDir) {
  check(
    'примеры названий совпадают с серверными (src/assignments/meeting-guidelines.fixtures.json)',
    read(join(serverDir, 'src/assignments/meeting-guidelines.fixtures.json')) === appFixtures,
  );
  const cut = (src) => {
    const a = src.indexOf('/** What a part of');
    const b = src.indexOf('export interface GuidelineRow');
    const c = src.indexOf('/** What the pickers of a part are allowed to offer. */');
    return src.slice(a, b > 0 ? b : c).trim();
  };
  const server = cut(read(join(serverDir, 'src/assignments/meeting-guidelines.ts')))
    .replace(/PublisherAppointment\.ELDER/g, "'elder'")
    .replace(/PublisherAppointment\.MINISTERIAL_SERVANT/g, "'ministerial_servant'")
    .replace(/PublisherAppointment\.STUDENT/g, "'student'")
    .replace(/Gender\.SISTER/g, "'sister'")
    .replace('gender: Gender | string | null;', 'gender: string | null;')
    .replace('appointment: PublisherAppointment | string | null;', 'appointment: string | null;');
  const norm = (s) => s.replace(/\s+/g, ' ');
  check(
    'правило в приложении — слово в слово серверное (lib/meeting-guidelines.ts)',
    norm(cut(appRule)) === norm(server),
  );
} else {
  console.log('· сервер не лежит рядом — сверка с ним пропущена');
}

// --- 3: this copy, on the examples ---------------------------------------------
const js = ts.transpileModule(appRule, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText;
const G = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const fx = JSON.parse(appFixtures);
for (const [title, kind] of fx.kinds) check(`вид «${title}» → ${kind}`, G.ministryKind(title) === kind);
for (const [title, yes] of fx.localNeeds) check(`местные потребности «${title}» → ${yes}`, G.isLocalNeeds(title) === yes);

const pg = (k, t) => G.pickerGuideline(k, t);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check('чтение Библии — братья (п. 5)', pg('bible_reading')?.leadGender === 'brother');
check('учебная речь — братья, без помощника (п. 12)', same(pg('apply_yourself_4', 'Речь'), { leadGender: 'brother', noAssistant: true, studentCap: 'fs_talk' }));
check('«Развивайте интерес» — помощник того же пола (п. 8)', pg('apply_yourself_2', 'Развивайте интерес')?.assistant === 'same');
check('«Подготавливайте учеников» — того же пола (п. 10)', pg('apply_yourself_3', 'Подготавливайте учеников')?.assistant === 'same');
check('«Начинайте разговор» — тот же пол или семья (п. 7)', pg('apply_yourself_1', 'Начинайте разговор')?.assistant === 'same-or-family');
check('«Объясняйте свои взгляды» — тот же пол или семья (п. 11)', pg('apply_yourself_3', 'Объясняйте свои взгляды')?.assistant === 'same-or-family');
check('вид не распознан — строго тот же пол', pg('apply_yourself_2', 'Тестовый пункт')?.assistant === 'same');
check('обсуждение — старейшины и помощники собрания, без помощника (п. 6, 9)', same(pg('apply_yourself_3', 'Что бы вы сказали?: Обсуждение.'), { leadAppointments: ['elder', 'ministerial_servant'], noAssistant: true, studentCap: null }));
check('«Местные потребности» — старейшины (п. 16)', same(pg('living_christians_1', 'Местные потребности')?.leadAppointments, ['elder']));
check('«Христианская жизнь» — старейшины и помощники (п. 16)', same(pg('living_christians_2', 'Тема')?.leadAppointments, ['elder', 'ministerial_servant']));
for (const k of ['treasures_talk', 'spiritual_gems', 'midweek_chairman', 'cbs_conductor'])
  check(`${k} — старейшины и помощники собрания`, same(pg(k)?.leadAppointments, ['elder', 'ministerial_servant']));
check('выходной день — без правил указаний', pg('watchtower_reader') === null);

// --- the pickers and the form use it ------------------------------------------
const form = read(join(ROOT, 'components/AssignmentForm.tsx'));
const selector = read(join(ROOT, 'components/PublisherSelector.tsx'));
check('окно части передаёт правило обоим выборам', (form.match(/guideline=\{guideline\}/g) ?? []).length >= 2);
check('у помощника — роль assistant', form.includes('guidelineRole="assistant"'));
check('обсуждение и речь — без помощника', /isStudentTalk =[\s\S]{0,120}guideline\?\.noAssistant/.test(form));
check('выбор не показывает тех, кого правило не пускает (не снимается «показать всех»)', /if \(guideline && !guidelineAllows\(p\)\) return false;/.test(selector));
check('другой пол — только с подтверждением «член семьи»', selector.includes('pickers.family.title'));
const topic = read(join(ROOT, 'components/local-needs/TopicForm.tsx'));
check('докладчик «Местных потребностей» — только старейшина', topic.includes('appointmentFilter="elder"'));

console.log(`${failures ? '✗' : '✓'} указания к встрече: ${passed} проверок${failures ? `, ошибок ${failures}` : ''}`);
process.exit(failures ? 1 : 0);
