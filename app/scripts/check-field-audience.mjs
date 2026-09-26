#!/usr/bin/env node
/**
 * Who a field-service meeting is for, checked (26 September).
 *
 * `lib/field-audience.ts` decides, for every screen that draws field-service
 * meetings, whether a meeting is a service overseer's visit, a group's own,
 * the combined one or open to anybody — and, for one person, which of a
 * day's meetings they need to see. The case that started it: a visit to the
 * group Ahlen at 10:00 and an ordinary meeting at 10:30 on the same
 * Saturday read as two meetings for everybody.
 *
 * Called directly from the gate, like the week-rules check — the app has no
 * test runner, and a new npm script would move the Expo fingerprint.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'field-audience-'));
const src = readFileSync(join(ROOT, 'lib', 'field-audience.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'field-audience.mjs'), js);
const { audienceOf, arrangeFieldDay, fieldNotes, isOnMeeting } = await import(pathToFileURL(join(out, 'field-audience.mjs')));

const AHLEN = 'g-ahlen';
const HAMM = 'g-hamm';
const meeting = (id, time, extra = {}) => ({
  id,
  weekStartDate: '2026-09-28',
  dayOfWeek: 6,
  startTime: time,
  serviceGroupId: null,
  isGeneral: false,
  serviceOverseerVisit: false,
  conductorPublisherId: null,
  serviceOverseerPublisherId: null,
  serviceOverseerAssistantId: null,
  ...extra,
});
const visit = meeting('visit', '10:00', {
  serviceGroupId: AHLEN,
  serviceOverseerVisit: true,
  serviceOverseerPublisherId: 'overseer',
  conductorPublisherId: 'overseer',
});
const open = meeting('open', '10:30');
const hamm = meeting('hamm', '09:30', { serviceGroupId: HAMM, conductorPublisherId: 'lesch' });
const general = meeting('general', '10:30', { isGeneral: true });
const ids = (xs) => xs.map((p) => p.meeting.id);

const failures = [];
let CASES = 0;
function check(name, got, want) {
  CASES += 1;
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) failures.push(`${name}\n      получено: ${a}\n      ожидалось: ${b}`);
}

check('посещение — это посещение', audienceOf(visit), 'visit');
check('встреча без группы — не «общая»', audienceOf(open), 'open');
check('общая — только по отметке', audienceOf(general), 'general');
check('встреча группы', audienceOf(hamm), 'group');
check(
  'отметка посещения без группы не делает посещения',
  audienceOf(meeting('x', '10:00', { serviceOverseerVisit: true })),
  'open',
);

{
  const day = arrangeFieldDay([open, visit, hamm], AHLEN, 'me');
  check('группа Ahlen: видит посещение и открытую, по времени', ids(day.shown), ['visit', 'open']);
  check('группа Ahlen: чужая группа свёрнута', ids(day.others), ['hamm']);
  check('группа Ahlen: её группа в этот день на посещении', day.myGroupOnVisit, true);
  check(
    'группа Ahlen: открытая встреча не для неё сегодня, посещение — для неё',
    day.shown.map((p) => [p.meeting.id, p.notForMyGroupToday, p.own]),
    [
      ['visit', false, true],
      ['open', true, false],
    ],
  );
}
{
  const day = arrangeFieldDay([open, visit, hamm], HAMM, 'me');
  check('группа Hamm: своя и открытая, посещение чужой группы свёрнуто', ids(day.shown), ['hamm', 'open']);
  check('группа Hamm: свёрнуто посещение Ahlen', ids(day.others), ['visit']);
  check('группа Hamm: её день обычный', day.shown.some((p) => p.notForMyGroupToday), false);
}
{
  // 26.09, found on the stand: the Hamm meeting, unfolded by a member of
  // Ahlen, said «ваша группа на посещении» — it was never theirs.
  const day = arrangeFieldDay([open, visit, hamm], AHLEN, 'me');
  check('группа Ahlen: у чужой группы нет пометки «ваша группа на посещении»',
    day.others.map((p) => p.notForMyGroupToday), [false]);
}
{
  const withAssistant = { ...visit, serviceOverseerAssistantId: 'assistant' };
  const day = arrangeFieldDay([open, withAssistant, hamm], HAMM, 'assistant');
  check('помощник видит посещение, хоть группа и не его', ids(day.shown), ['hamm', 'visit', 'open']);
  check('помощник «на» посещении', isOnMeeting(withAssistant, 'assistant'), true);
  check('посторонний не «на» посещении', isOnMeeting(withAssistant, 'someone'), false);
  check('без карточки никто не «на» встрече', isOnMeeting({ ...hamm, conductorPublisherId: null }, null), false);
}
{
  const notes = fieldNotes([open, visit, hamm], AHLEN, 'me');
  check('пометки для Ahlen', [notes.get('visit'), notes.get('open'), notes.get('hamm')],
    [null, { kind: 'notForYourGroup' }, null]);
  const h = fieldNotes([open, visit, hamm], HAMM, 'me');
  check('пометки для Hamm', [h.get('visit'), h.get('open'), h.get('hamm')],
    [{ kind: 'onlyFor', groupId: AHLEN }, null, null]);
  const other = fieldNotes([open, { ...visit, dayOfWeek: 5 }, hamm], AHLEN, 'me');
  check('посещение в другой день не трогает субботу', other.get('open'), null);
  const none = fieldNotes([open, visit, hamm], null, 'me');
  check('без своей группы пометок нет', [...none.values()].filter(Boolean).length, 0);
}
{
  const day = arrangeFieldDay([open, visit, hamm], HAMM, 'overseer');
  check('служебный старейшина видит посещение, хоть группа и не его', ids(day.shown), ['hamm', 'visit', 'open']);
}
{
  const day = arrangeFieldDay([open, visit, hamm], null, 'me');
  check('без своей группы ничего не свёрнуто', [ids(day.shown), ids(day.others)], [['hamm', 'visit', 'open'], []]);
}

{
  // The overseer and his assistant are in Hamm; on the day they visit Ahlen
  // their own group's meeting and the open one are not theirs.
  const withAssistant = { ...visit, serviceOverseerAssistantId: 'assistant' };
  for (const who of ['overseer', 'assistant']) {
    const n = fieldNotes([open, withAssistant, hamm], HAMM, who);
    check(`${who}: своя группа и открытая — «вы на посещении группы Ahlen»`,
      [n.get('hamm'), n.get('open')],
      [{ kind: 'awayOnVisit', groupId: AHLEN }, { kind: 'awayOnVisit', groupId: AHLEN }]);
    check(`${who}: у самого посещения нет «только для группы Ahlen»`, n.get('visit'), null);
  }
  const lead = fieldNotes([open, visit, hamm], HAMM, 'lesch');
  check('ведущий встречи Hamm не на посещении — пометок нет', [lead.get('hamm'), lead.get('open')], [null, null]);
}

if (failures.length > 0) {
  console.error(`Кому встреча для проповеди — ${failures.length} расхождений:\n`);
  for (const f of failures) console.error('  ✗ ' + f + '\n');
  process.exit(1);
}
console.log(`OK: field-service audiences as agreed (${CASES} cases).`);
