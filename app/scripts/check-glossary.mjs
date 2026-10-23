#!/usr/bin/env node
/**
 * ONE WORD FOR ONE THING, in German and English (23 October 2026).
 *
 * The walk in both languages found the same thing named three and five ways —
 * «Wochentag», «Wochenmitte», «Zusammenkunft (Woche)» for the midweek
 * meeting; «Conducted by», «Led by», «CONDUCTS» for one person. The words
 * were agreed then; this keeps the ones put aside from coming back. Each
 * entry says which word to use instead.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BANNED = {
  de: [
    [/\bWochenmitte\b/, 'Unter der Woche / Zusammenkunft unter der Woche'],
    [/Zusammenkunft \(Woche\)/, 'Zusammenkunft unter der Woche'],
    [/\b(Eröffnungsgebet|Eingangsgebet)/, 'Anfangsgebet'],
    [/Geistige Kostbarkeiten/, 'Nach geistigen Schätzen graben'],
    [/Gruppenverantwortlich|Gruppenassistent/, 'Gruppenaufseher / Gehilfe des Gruppenaufsehers'],
    [/\bDA-Gehilfe/, 'Dienstamtgehilfe'],
    [/\bVorleser/, 'Leser'],
    [/hat hinzufügt/, 'hat hinzugefügt'],
    [/Werde ein besserer Lehrer|Uns im Predigtdienst verbessern/i, 'Uns im Dienst verbessern'],
    [/\b(wähle|speichere|tippe|gib|öffne|schreibe)\b/, 'Sie-Form'],
    [/\b\d* ?(T|Wo)\.(?=\s|$)/, '«Tagen», «Wochen» ausgeschrieben'],
  ],
  en: [
    [/\b[Ll]ed by\b|\bCONDUCTS\b|\bWho conducts\b/, 'Conducted by / Conductor'],
    [/\bhanded in\b/i, 'submitted'],
    [/\bGood night\b/, 'Good evening'],
    [/\bAdviser\b/, 'Auxiliary counselor'],
    [/\bAttendance record\b(?!er)/, 'Attendance recorder'],
    [/\b[Pp]rogramme|\b[Cc]atalogue|\b[Cc]ancelled|\bE-mail|\be-mail/, 'American spelling'],
    [/\b(by|a|this|the|several|these|such|no) letters?\b/i, 'email (a letter is only the branch’s)'],
    [/\bChange journal\b/, 'Activity log'],
    [/\bPioneer school\b/, 'Pioneer Service School'],
  ],
};

let bad = 0;
for (const [lang, rules] of Object.entries(BANNED)) {
  const flat = [];
  const walk = (o, p) => {
    for (const [k, v] of Object.entries(o)) {
      const key = p ? `${p}.${k}` : k;
      if (v && typeof v === 'object') walk(v, key);
      else if (typeof v === 'string') flat.push([key, v]);
    }
  };
  walk(JSON.parse(readFileSync(join(ROOT, 'locales', `${lang}.json`), 'utf8')), '');
  for (const [key, value] of flat) {
    for (const [re, use] of rules) {
      if (re.test(value)) {
        console.error(`✗ ${lang} ${key}: «${value.slice(0, 80)}» — ${use}`);
        bad++;
      }
    }
  }
}
if (bad) process.exit(1);
console.log('✓ Словарь терминов (de, en) соблюдён');
