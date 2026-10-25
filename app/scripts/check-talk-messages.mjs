#!/usr/bin/env node
/**
 * The talk coordinator's ready messages, pinned (Lionel, 25 October 2026).
 *
 * The Russian texts were agreed with him word for word. A change to
 * lib/talk-messages.ts that moves a comma shows here, and the words are
 * changed on purpose or not at all. Also pinned: a line whose facts are
 * missing is left out, the study's songs are named, and a phone written the
 * German way reaches WhatsApp with the country code.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const out = mkdtempSync(join(tmpdir(), 'talk-messages-'));
const js = ts.transpileModule(readFileSync(join(ROOT, 'lib', 'talk-messages.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
writeFileSync(join(out, 'talk-messages.mjs'), js);
const mod = await import(pathToFileURL(join(out, 'talk-messages.mjs')));
const { whatsappNumber } = mod;

/** The app's own words: a key of locales/<lang>.json, {{x}} filled in. */
const trOf = (lang) => {
  const dict = JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8'));
  return (key, vars = {}) => {
    const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), dict);
    if (typeof v !== 'string') throw new Error(`${lang}: no text for ${key}`);
    return v.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  };
};
const ru = trOf('ru');
const LANGS = { ru, de: trOf('de'), en: trOf('en') };
const guestInvitation = (f) => mod.guestInvitation(LANGS[f.lang ?? 'ru'], f);
const guestReminder = (f) => mod.guestReminder(LANGS[f.lang ?? 'ru'], f);
const lunchBagMessage = (f, b) => mod.lunchBagMessage(LANGS[f.lang ?? 'ru'], f, b);

const base = {
  lang: 'ru',
  date: '2026-11-08',
  today: '2026-10-25',
  time: '13:00:00',
  address: 'Лесная ул. 5, Хамм',
  guestFirstName: 'Даниил',
  guestFullName: 'Даниил Орлов',
  guestCongregation: 'Остхайм',
  talkNumber: 101,
  talkTitle: 'Что значит ходить с Богом',
  specialTheme: null,
  openingSong: null,
  studySongs: [12, 34],
  lunchArranged: true,
  senderName: 'Андрей',
  senderIsCoordinator: true,
};

let failed = 0;
const eq = (name, got, want) => {
  if (got === want) return;
  failed++;
  console.error(`✗ ${name}\n  got:\n${got}\n  want:\n${want}\n`);
};

eq(
  'приглашение — как согласовано',
  guestInvitation(base),
  [
    'Дорогой брат Даниил, здравствуй!',
    'Ждём тебя с публичной речью в воскресенье, 8 ноября.',
    'Начало встречи в 13:00, адрес: Лесная ул. 5, Хамм.',
    'Речь №101 «Что значит ходить с Богом».',
    'Сообщи, пожалуйста, номер вступительной песни. В этот день в «Сторожевой башне» поются песни 12 и 34 — их, пожалуйста, не выбирай.',
    'Для тебя будет приготовлен ланч-пакет.',
    'Если что-то изменится — дай знать.',
    'Андрей, координатор речей',
  ].join('\n'),
);
eq(
  'песня уже известна; ни речи, ни пакета, ни песен изучения',
  guestInvitation({ ...base, openingSong: 45, talkNumber: null, talkTitle: null, lunchArranged: false, studySongs: [] }),
  [
    'Дорогой брат Даниил, здравствуй!',
    'Ждём тебя с публичной речью в воскресенье, 8 ноября.',
    'Начало встречи в 13:00, адрес: Лесная ул. 5, Хамм.',
    'Вступительная песня — №45, спасибо!',
    'Если что-то изменится — дай знать.',
    'Андрей, координатор речей',
  ].join('\n'),
);
eq(
  'песня совпала с изучением — просим другую',
  guestInvitation({ ...base, openingSong: 12 }).split('\n')[4],
  'Песня №12 в этот день поётся на изучении. Сообщи, пожалуйста, номер вступительной песни. В этот день в «Сторожевой башне» поются песни 12 и 34 — их, пожалуйста, не выбирай.',
);
eq(
  'напоминание за три дня',
  guestReminder({ ...base, today: '2026-11-05' }),
  [
    'Брат Даниил, напоминаем: в это воскресенье, 8 ноября, в 13:00 ждём тебя с речью №101.',
    'Адрес: Лесная ул. 5, Хамм.',
    'До встречи!',
    'Андрей, координатор речей',
  ].join('\n'),
);
eq(
  'тому, кто несёт ланч-пакет',
  lunchBagMessage({ ...base, senderIsCoordinator: false }, { firstName: 'Анна', sister: true }),
  [
    'Дорогая сестра Анна, здравствуй!',
    'В воскресенье, 8 ноября, у нас с речью брат Даниил Орлов из собрания Остхайм. Принеси, пожалуйста, для него ланч-пакет в Зал Царства к 13:00.',
    'Спасибо тебе большое!',
    'Андрей',
  ].join('\n'),
);
eq('подпись без звания у не-координатора', guestInvitation({ ...base, senderIsCoordinator: false }).split('\n').pop(), 'Андрей');
eq('суббота', guestInvitation({ ...base, date: '2026-11-07' }).split('\n')[1], 'Ждём тебя с публичной речью в субботу, 7 ноября.');
eq('немецкий день', guestInvitation({ ...base, lang: 'de' }).split('\n')[1], 'Wir erwarten dich zum öffentlichen Vortrag am Sonntag, 8. November.');
eq(
  'немецкий ланч-пакет',
  lunchBagMessage({ ...base, lang: 'de' }, { firstName: 'Anna', sister: true }).split('\n')[1],
  'Am Sonntag, 8. November, hält Bruder Даниил Орлов aus der Versammlung Остхайм bei uns den Vortrag. Bring bitte ein Lunchpaket für ihn in den Königreichssaal bis 13:00 Uhr.',
);
for (const lang of ['de', 'en']) {
  for (const f of [guestInvitation, guestReminder]) f({ ...base, lang });
}
eq('номер по-немецки', whatsappNumber('0151 2345 6789'), '4915123456789');
eq('номер с плюсом', whatsappNumber('+49 151 2345 6789'), '4915123456789');
eq('номер с 00', whatsappNumber('0049 151 2345 6789'), '4915123456789');
eq('пустой номер', whatsappNumber('  '), null);

if (failed) {
  console.error(`✗ ${failed} проверок готовых сообщений не прошли`);
  process.exit(1);
}
console.log('OK: готовые сообщения координатора речей — как согласовано (13 проверок и все три языка).');
