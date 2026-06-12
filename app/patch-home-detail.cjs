#!/usr/bin/env node
/**
 * patch-home-detail.cjs — детализация Главной:
 *  - «Мои ближайшие задания»: время встречи из meeting-settings, тип встречи
 *    словами («Встреча среди недели»/«Выходная»), служение → заголовок
 *    «вы ведёте» + адрес в подзаголовок
 *  - «Ближайшие события»: время, адрес, заметка, чип «Вместо встречи»
 *  - locales: home.eventTypes/fieldService/events ×3
 * Только клиент, сервер не меняется. Idempotent; LF/CRLF tolerant.
 * Запускать из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

function patchFile(file, guard, edits) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.log(`FAIL: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let txt = raw.split('\r\n').join('\n');

  if (txt.includes(guard)) {
    console.log(`SKIP: ${file} already patched (${guard} present)`);
    return;
  }

  for (const [label, anchor, replacement] of edits) {
    const parts = txt.split(anchor);
    if (parts.length !== 2) {
      console.log(`FAIL: anchor for "${label}" found ${parts.length - 1} time(s), expected 1`);
      process.exit(1);
    }
    txt = parts[0] + replacement + parts[1];
    console.log(`OK: ${label}`);
  }

  fs.writeFileSync(file, txt.split('\n').join(eol));
  console.log(`OK: ${file} written`);
}

const HOME = 'app/(app)/home/index.tsx';

patchFile(HOME, 'home.eventTypes', [
  // 1) Refined несёт время встречи
  [
    'tasks: Refined +meetingTime',
    nl([
      '  type Refined = {',
      '    item: MyAssignmentItem;',
      '    dateISO: string;',
      '    weekOnly: boolean;',
      '  };',
    ]),
    nl([
      '  type Refined = {',
      '    item: MyAssignmentItem;',
      '    dateISO: string;',
      '    weekOnly: boolean;',
      '    meetingTime?: string;',
      '  };',
    ]),
  ],
  // 2) объявление meetingTime в цикле
  [
    'tasks: let meetingTime',
    nl([
      '    let dateISO: string | null = null;',
      '    let weekOnly = false;',
    ]),
    nl([
      '    let dateISO: string | null = null;',
      '    let weekOnly = false;',
      '    let meetingTime: string | undefined;',
    ]),
  ],
  // 3) захват времени встречи рядом с датой
  [
    'tasks: capture meeting time',
    nl([
      '      if (v && dow) {',
      '        dateISO = formatDateISO(',
      '          addDays(new Date(`${item.weekStartDate}T00:00:00`), dow - 1),',
      '        );',
      '      }',
    ]),
    nl([
      '      if (v && dow) {',
      '        dateISO = formatDateISO(',
      '          addDays(new Date(`${item.weekStartDate}T00:00:00`), dow - 1),',
      '        );',
      '        meetingTime =',
      "          item.eventType === 'midweek' ? v.midweekTime : v.weekendTime;",
      '      }',
    ]),
  ],
  // 4) пробрасываем в refined
  [
    'tasks: push meetingTime',
    '    refined.push({ item, dateISO, weekOnly });',
    '    refined.push({ item, dateISO, weekOnly, meetingTime });',
  ],
  // 5) служение: человеческий заголовок вместо адреса
  [
    'tasks: field service title',
    nl([
      '      return (',
      '        item.label +',
      "        (item.asAssistant ? ` (${t('home.meeting.asAssistant')})` : '')",
      '      );',
      '    }',
      '    return item.label;',
    ]),
    nl([
      '      return (',
      '        item.label +',
      "        (item.asAssistant ? ` (${t('home.meeting.asAssistant')})` : '')",
      '      );',
      '    }',
      "    if (item.kind === 'field_service') {",
      "      return t('home.fieldService.leading');",
      '    }',
      '    return item.label;',
    ]),
  ],
  // 6) сводная метастрока (дата · время · тип · адрес)
  [
    'tasks: metaFor helper',
    nl([
      '    return d.toLocaleDateString(i18n.language, {',
      "      weekday: 'short',",
      "      day: 'numeric',",
      "      month: 'long',",
      '    });',
      '  };',
    ]),
    nl([
      '    return d.toLocaleDateString(i18n.language, {',
      "      weekday: 'short',",
      "      day: 'numeric',",
      "      month: 'long',",
      '    });',
      '  };',
      '',
      '  const metaFor = (r: Refined): string => {',
      '    const bits: string[] = [dateFor(r)];',
      '    const time = r.item.time ?? r.meetingTime;',
      '    if (time) {',
      '      bits.push(',
      '        r.item.endTime ? `${time}\\u2013${r.item.endTime}` : time,',
      '      );',
      '    }',
      '    if (',
      "      (r.item.kind === 'meeting' || r.item.kind === 'duty') &&",
      "      (r.item.eventType === 'midweek' || r.item.eventType === 'weekend')",
      '    ) {',
      '      bits.push(t(`home.eventTypes.${r.item.eventType}`));',
      '    } else {',
      '      bits.push(t(`home.kinds.${r.item.kind}`));',
      '    }',
      "    if (r.item.kind === 'field_service' && r.item.location) {",
      '      bits.push(r.item.location);',
      '    }',
      "    return bits.join(' \\u00b7 ');",
      '  };',
    ]),
  ],
  // 7) подзаголовок задания → metaFor
  [
    'tasks: subtitle render',
    nl([
      '              <Text style={styles.eventDate} numberOfLines={1}>',
      '                {dateFor(r)}',
      '                {r.item.time',
      '                  ? ` · ${r.item.time}${r.item.endTime ? `\\u2013${r.item.endTime}` : \'\'}`',
      "                  : ''}",
      "                {' · '}",
      '                {t(`home.kinds.${r.item.kind}`)}',
      '              </Text>',
    ]),
    nl([
      '              <Text style={styles.eventDate} numberOfLines={2}>',
      '                {metaFor(r)}',
      '              </Text>',
    ]),
  ],
  // 8) события: время/адрес/заметка/чип
  [
    'events: detailed rows',
    nl([
      '              <View style={{ flex: 1 }}>',
      '                <Text style={styles.eventTitle} numberOfLines={1}>',
      '                  {e.title}',
      '                </Text>',
      '                <Text style={styles.eventDate}>',
      '                  {eventDateLabel(e, i18n.language)}',
      '                </Text>',
      '              </View>',
    ]),
    nl([
      '              <View style={{ flex: 1 }}>',
      '                <Text style={styles.eventTitle} numberOfLines={2}>',
      '                  {e.title}',
      '                </Text>',
      '                <Text style={styles.eventDate}>',
      '                  {eventDateLabel(e, i18n.language)}',
      "                  {e.time ? ` · ${e.time}` : ''}",
      '                </Text>',
      '                {e.address ? (',
      '                  <Text style={styles.eventMeta} numberOfLines={1}>',
      '                    {e.address}',
      '                  </Text>',
      '                ) : null}',
      '                {e.note ? (',
      '                  <Text style={styles.eventMeta} numberOfLines={1}>',
      '                    {e.note}',
      '                  </Text>',
      '                ) : null}',
      '                {e.replacesMeeting ? (',
      '                  <View style={styles.replacesChip}>',
      '                    <Text style={styles.replacesChipText}>',
      "                      {t('home.events.replacesMeeting')}",
      '                    </Text>',
      '                  </View>',
      '                ) : null}',
      '              </View>',
    ]),
  ],
  // 9) стили
  [
    'styles: eventMeta + chip',
    "  eventDate: { fontSize: 13, color: '#0369a1', marginTop: 2 },",
    nl([
      "  eventDate: { fontSize: 13, color: '#0369a1', marginTop: 2 },",
      "  eventMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },",
      '  replacesChip: {',
      "    alignSelf: 'flex-start',",
      '    marginTop: 6,',
      "    backgroundColor: '#fff7ed',",
      '    borderWidth: 1,',
      "    borderColor: '#fdba74',",
      '    borderRadius: 10,',
      '    paddingHorizontal: 8,',
      '    paddingVertical: 2,',
      '  },',
      '  replacesChipText: {',
      '    fontSize: 10,',
      "    fontWeight: '700',",
      "    color: '#c2410c',",
      "    textTransform: 'uppercase',",
      '    letterSpacing: 0.4,',
      '  },',
    ]),
  ],
]);

// ---------- locales ----------
const ADDITIONS = {
  ru: {
    home: {
      eventTypes: {
        midweek: 'Встреча среди недели',
        weekend: 'Выходная встреча',
      },
      fieldService: {
        leading: 'Встреча для проповеди — вы ведёте',
      },
      events: {
        replacesMeeting: 'Вместо встречи собрания',
      },
    },
  },
  en: {
    home: {
      eventTypes: {
        midweek: 'Midweek meeting',
        weekend: 'Weekend meeting',
      },
      fieldService: {
        leading: 'Field service meeting — you conduct',
      },
      events: {
        replacesMeeting: 'Replaces the congregation meeting',
      },
    },
  },
  de: {
    home: {
      eventTypes: {
        midweek: 'Zusammenkunft unter der Woche',
        weekend: 'Wochenend-Zusammenkunft',
      },
      fieldService: {
        leading: 'Predigtdienst-Zusammenkunft — du leitest',
      },
      events: {
        replacesMeeting: 'Ersetzt die Zusammenkunft',
      },
    },
  },
};

function deepMerge(target, source, pathPrefix, report) {
  for (const key of Object.keys(source)) {
    const p = pathPrefix ? `${pathPrefix}.${key}` : key;
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!(key in target) || typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      deepMerge(target[key], sv, p, report);
    } else if (key in target) {
      report.skipped.push(p);
    } else {
      target[key] = sv;
      report.added.push(p);
    }
  }
}

for (const locale of Object.keys(ADDITIONS)) {
  const file = `locales/${locale}.json`;
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`FAIL: cannot read/parse ${file}: ${e.message}`);
    process.exit(1);
  }
  const report = { added: [], skipped: [] };
  deepMerge(obj, ADDITIONS[locale], '', report);
  if (report.added.length === 0) {
    console.log(`SKIP: ${file} — all keys already present`);
    continue;
  }
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  console.log(`OK: ${file} — added ${report.added.length} keys`);
}

console.log('DONE: home detail patched');
