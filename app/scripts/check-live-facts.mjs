#!/usr/bin/env node
/**
 * The promise of scripts/live-facts.console.js, checked (6 October 2026).
 *
 * That file is pasted into the console of the LIVE site and its output is
 * handed to whoever is fixing things. It promises two things, and neither can
 * be left to the care of the next person who adds a section:
 *
 *   1. it only READS — every request is a GET, bar the one that obtains the
 *      working token the way the app itself does;
 *   2. NOT ONE NAME leaves it — no name, phone, address, note or record id.
 *
 * So the file is run here, in Node, against a server that does not exist: a
 * stand-in `fetch` answering with records in which every field a person fills
 * in carries a marker. The run fails if a marker — or any record id — shows
 * up in the output, or if anything but a GET is asked for.
 *
 * The stand-in answers ANY path with the same rich records, so a section
 * added later is covered without touching this file: whatever it reads, it
 * reads marked data.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, 'live-facts.console.js'), 'utf8');

/** Stands in every field written by a person. Must never reach the output. */
const MARK = 'ЛИЧНОЕ';
const today = new Date().toLocaleDateString('en-CA');
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const ids = [];
const newId = () => {
  const v = id();
  ids.push(v);
  return v;
};

function world() {
  const overseerCard = newId();
  const guestCard = newId();
  const ahead = addDays(today, 30);
  const farAhead = addDays(today, 120);
  const past = addDays(today, -60);
  const visit = (date, role, first) => ({
    id: newId(),
    type: 'circuit_overseer_visit',
    title: `${MARK} визит`,
    date,
    endDate: addDays(date, 5),
    coFirstName: `${MARK}${first}`,
    coLastName: `${MARK}ов`,
    coWifeName: `${MARK} жена`,
    coRole: role,
    coAccommodationAddress: `${MARK} улица 1`,
    note: `${MARK} заметка`,
    address: `${MARK} адрес`,
    deletedAt: null,
  });
  const speakers = [
    {
      id: overseerCard,
      firstName: `${MARK}Иван`,
      lastName: `${MARK}ов`,
      phone: `+49 ${MARK} 151`,
      note: `${MARK} заметка о брате`,
      externalCongregationId: null,
      externalCongregation: null,
      circuitOverseer: true,
      circuitRole: 'overseer',
      autoCreated: true,
      talkNumbers: [12],
    },
    {
      id: guestCard,
      firstName: `${MARK}Пётр`,
      lastName: `${MARK}ин`,
      phone: `${MARK}`,
      note: null,
      externalCongregationId: newId(),
      externalCongregation: { id: newId(), name: `${MARK}-Собрание` },
      circuitOverseer: false,
      autoCreated: false,
      talkNumbers: [],
    },
  ];
  const entry = (date, over) => ({
    id: newId(),
    direction: 'incoming',
    date,
    status: 'confirmed',
    publisherId: null,
    visitingSpeakerId: null,
    speakerName: null,
    speakerCongregation: `${MARK}-Собрание`,
    note: `${MARK} обед у семьи`,
    hospitalityPublisherId: newId(),
    deletedAt: null,
    ...over,
  });
  const sunday = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return addDays(iso, 7 - (d.getUTCDay() || 7));
  };
  const monday = (iso) => addDays(sunday(iso), -6);
  return {
    '/special-events': [
      visit(past, 'substitute', 'Олег'),
      visit(ahead, 'overseer', 'Иван'),
      visit(farAhead, 'overseer', 'Иван'),
      { id: newId(), type: 'memorial', title: `${MARK}`, date: farAhead, deletedAt: null },
    ],
    '/visiting-speakers': speakers,
    '/external-congregations': [
      { id: newId(), name: `${MARK}-Собрание`, contactName: `${MARK}`, contactPhone: `+49 ${MARK}`, note: `${MARK}` },
      { id: newId(), name: `${MARK}-Собрание-2`, contactName: null, contactPhone: '  ', note: null },
    ],
    '/talk-exchange': [
      entry(sunday(ahead), { visitingSpeakerId: overseerCard, speakerName: `${MARK}Иван ${MARK}ов` }),
      entry(sunday(farAhead), { visitingSpeakerId: guestCard, speakerName: `${MARK}Пётр ${MARK}ин` }),
      entry(sunday(past), { publisherId: newId() }),
    ],
    '/assignments': {
      total: 1,
      data: [
        {
          id: newId(),
          weekStartDate: monday(ahead),
          partKey: 'public_talk_speaker',
          partTitle: `${MARK} тема речи`,
          speakerName: `${MARK}Иван ${MARK}ов`,
          speakerCongregation: `${MARK}-Собрание`,
          visitingSpeakerId: overseerCard,
          publisherId: newId(),
          publicTalkId: newId(),
          notes: `${MARK}`,
          deletedAt: null,
        },
      ],
    },
    '/health': { status: 'ok', commit: '0c040ebdfe94914180b15cee9b2028f6e14401ae' },
    '/build-info.json': { commit: '0c040ebdfe94914180b15cee9b2028f6e14401ae' },
    '/auth/refresh': { accessToken: `${MARK}-token` },
  };
}

async function run(hostname) {
  const data = world();
  const asked = [];
  const printed = [];
  const fetch = async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const path = String(url).replace(/^https?:\/\/[^/]+(\/api)?/, '').split('?')[0];
    asked.push({ method, path, url: String(url) });
    const key = Object.keys(data).find((k) => path === k || path.endsWith(k));
    // An unknown path is answered too — with marked records, so that a
    // section written later is checked without this file knowing about it.
    const body = key ? data[key] : data['/visiting-speakers'];
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  const sandbox = {
    location: { hostname },
    fetch,
    console: {
      log: (...a) => printed.push(a.join(' ')),
      error: (...a) => printed.push(a.join(' ')),
      table: (...a) => printed.push(JSON.stringify(a)),
    },
    copy: (t) => printed.push(String(t)),
    Date,
    Promise,
    Set,
    Map,
    String,
    JSON,
  };
  const text = await vm.runInNewContext(source, sandbox, { filename: 'live-facts.console.js' });
  return { text: String(text ?? ''), printed: printed.join('\n'), asked };
}

const failures = [];
let checks = 0;
const expect = (good, what) => {
  checks += 1;
  if (!good) failures.push(what);
};

for (const host of ['mycongregation.org', 'localhost']) {
  const { text, printed, asked } = await run(host);
  const everything = `${text}\n${printed}`;

  expect(text.includes('──── факты ────') && text.includes('──── конец ────'),
    `[${host}] the run produced no fact block`);
  expect(!everything.includes(MARK),
    `[${host}] a field written by a person reached the output:\n` +
      everything.split('\n').filter((l) => l.includes(MARK)).slice(0, 5).join('\n'));
  expect(!ids.some((v) => everything.includes(v)),
    `[${host}] a record id reached the output`);
  expect(!/\S+@\S+\.\S+/.test(everything), `[${host}] something shaped like an e-mail in the output`);

  const writes = asked.filter((a) => a.method !== 'GET' && !a.path.endsWith('/auth/refresh'));
  expect(writes.length === 0,
    `[${host}] the script asked for more than reading: ${writes.map((a) => `${a.method} ${a.path}`).join(', ')}`);
  expect(asked.filter((a) => a.method !== 'GET').length === 1,
    `[${host}] the token should be obtained exactly once`);

  const wantApi = host === 'localhost' ? 'http://localhost:3000/api' : 'https://api.mycongregation.org/api';
  expect(asked.filter((a) => a.url.startsWith('http')).every((a) => a.url.startsWith(wantApi)),
    `[${host}] a request went somewhere other than ${wantApi}`);

  // The facts themselves, on the world built above: the overseer who comes
  // has his entry and his marked card; the far visit has another guest's.
  expect(/визитов районного всего: 3/.test(text), `[${host}] the visits were not counted`);
  expect(/из них с пометкой: 1/.test(text), `[${host}] the marked cards were not counted`);
  expect(/под ним остался наш брат: да/.test(text), `[${host}] the brother beneath the overseer was not reported`);
  expect(/✗\s+под районным не остался наш брат/.test(text), `[${host}] a brother left beneath the overseer should fail a check`);
  expect(/из них другого докладчика: 1/.test(text), `[${host}] another guest on the visit's weekend was not reported`);
  expect(/ИТОГ: не прошло проверок — \d+/.test(text), `[${host}] a visit without its entry should fail a check`);
  // The directory section counts filled fields and prints none of them.
  expect(/карточек приезжих: 2\n\s+из них с телефоном: 2\n\s+из них с заметкой: 1/.test(text), `[${host}] the speakers' contacts were not counted`);
  expect(/других собраний: 2\n\s+из них с контактным лицом: 1\n\s+из них с телефоном контакта: 1\n\s+из них с заметкой: 1/.test(text), `[${host}] the congregations' contacts were not counted`);
  expect(/записей журнала: 3\n\s+из них с заметкой: 3\n\s+из них с указанным гостеприимством: 3/.test(text), `[${host}] the journal's notes were not counted`);
}

// The guard itself: a value that is not a number, a date, yes/no or a word
// written in the file must come out hidden. Proved by breaking the file on
// purpose — a fact fed a person's field — and seeing the marker still absent.
{
  const broken = source.replace(
    "fact('  имя в визите указано', name !== '');",
    "fact('  имя в визите указано', v.coFirstName);",
  );
  expect(broken !== source, 'the line used to prove the guard has moved — update this check');
  const printed = [];
  const data = world();
  const text = await vm.runInNewContext(
    broken,
    {
      location: { hostname: 'mycongregation.org' },
      fetch: async (url) => {
        const path = String(url).replace(/^https?:\/\/[^/]+(\/api)?/, '').split('?')[0];
        const key = Object.keys(data).find((k) => path === k || path.endsWith(k));
        return { ok: true, status: 200, json: async () => structuredClone(data[key] ?? []) };
      },
      console: { log: (...a) => printed.push(a.join(' ')), error: () => {}, table: () => {} },
      copy: () => {},
      Date, Promise, Set, Map, String, JSON,
    },
  );
  expect(!String(text).includes(MARK), 'a person’s field passed to fact() was printed instead of hidden');
  expect(String(text).includes('[скрыто]'), 'the guard should say it hid something');
}

if (failures.length) {
  console.error('Факты без имён: не прошло\n');
  for (const f of failures) console.error('  ✗ ' + f + '\n');
  process.exit(1);
}
console.log(`OK: ${checks} проверок — скрипт фактов только читает и не выдаёт ни одного имени.`);
