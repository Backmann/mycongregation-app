#!/usr/bin/env node
/**
 * patch-home-detail2.cjs — детализация Главной (v2, по правкам Lionel):
 *  1) Новый блок «Встреча для проповеди» для ВСЕХ членов собрания —
 *     ближайшая встреча этой/следующей недели со всеми деталями графика:
 *     день · время, дата, адрес, ведущий по имени, тема, ссылка.
 *  2) «Ближайшие события» — зеркало админской карточки: дата-бейдж
 *     (или диапазон), тег типа, заголовок, диапазон дат, время · адрес,
 *     заметка. БЕЗ подсказки «вместо встречи».
 *  3) «Мои ближайшие задания»: время встречи из настроек, тип встречи
 *     словами, служение → «вы ведёте» + адрес в подзаголовке.
 * Только клиент. Idempotent; LF/CRLF tolerant. Запускать из ~/congmap/app.
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

patchFile(HOME, 'NextFieldServiceCard', [
  // ---------- импорты ----------
  [
    'imports: Linking',
    nl(['import {', '  ActivityIndicator,', '  Pressable,']),
    nl(['import {', '  ActivityIndicator,', '  Linking,', '  Pressable,']),
  ],
  [
    'imports: fieldServiceApi + FieldServiceMeeting',
    nl(['  Assignment,', '  assignmentsApi,', '  meApi,']),
    nl([
      '  Assignment,',
      '  assignmentsApi,',
      '  fieldServiceApi,',
      '  FieldServiceMeeting,',
      '  meApi,',
    ]),
  ],
  [
    'imports: Publisher + publishersApi',
    nl(['  MyAssignmentItem,', '  SpecialEvent,']),
    nl([
      '  MyAssignmentItem,',
      '  Publisher,',
      '  publishersApi,',
      '  SpecialEvent,',
    ]),
  ],
  // ---------- eventDateLabel → хелперы админского экрана ----------
  [
    'helpers: pad/ddmm/rangeLabel вместо eventDateLabel',
    nl([
      'function eventDateLabel(e: SpecialEvent, loc: string): string {',
      '  const start = new Date(`${e.date}T00:00:00`);',
      '  if (!e.endDate) {',
      "    return start.toLocaleDateString(loc, { day: 'numeric', month: 'long' });",
      '  }',
      '  const end = new Date(`${e.endDate}T00:00:00`);',
      '  const sameMonth =',
      '    start.getMonth() === end.getMonth() &&',
      '    start.getFullYear() === end.getFullYear();',
      '  if (sameMonth) {',
      '    return `${start.getDate()}\\u2013${end.toLocaleDateString(loc, {',
      "      day: 'numeric',",
      "      month: 'long',",
      '    })}`;',
      '  }',
      '  return `${start.toLocaleDateString(loc, {',
      "    day: 'numeric',",
      "    month: 'long',",
      "  })} \\u2013 ${end.toLocaleDateString(loc, { day: 'numeric', month: 'long' })}`;",
      '}',
    ]),
    nl([
      "const pad = (n: number) => String(n).padStart(2, '0');",
      'const ddmm = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;',
      '',
      'function rangeLabel(start: Date, end: Date, loc: string): string {',
      '  const sameYear = start.getFullYear() === end.getFullYear();',
      '  const startStr = start.toLocaleDateString(loc, {',
      "    day: 'numeric',",
      "    month: 'long',",
      "    ...(sameYear ? {} : { year: 'numeric' }),",
      '  });',
      '  const endStr = end.toLocaleDateString(loc, {',
      "    day: 'numeric',",
      "    month: 'long',",
      "    year: 'numeric',",
      '  });',
      '  return `${startStr} \\u2013 ${endStr}`;',
      '}',
    ]),
  ],
  // ---------- новые компоненты перед TASK_ICONS ----------
  [
    'components: NextFieldServiceCard + EventHomeRow',
    "const TASK_ICONS: Record<MyAssignmentItem['kind'], keyof typeof Ionicons.glyphMap> = {",
    nl([
      'function NextFieldServiceCard() {',
      '  const { t, i18n } = useTranslation();',
      '  const todayISO = formatDateISO(new Date());',
      '  const thisMonday = formatDateISO(startOfWeekMonday(new Date()));',
      '  const nextMonday = formatDateISO(',
      '    addDays(startOfWeekMonday(new Date()), 7),',
      '  );',
      '',
      '  const weekA = useQuery({',
      "    queryKey: ['field-service', thisMonday],",
      '    queryFn: () => fieldServiceApi.list({ weekStart: thisMonday }),',
      '    staleTime: 60 * 1000,',
      '  });',
      '  const weekB = useQuery({',
      "    queryKey: ['field-service', nextMonday],",
      '    queryFn: () => fieldServiceApi.list({ weekStart: nextMonday }),',
      '    staleTime: 60 * 1000,',
      '  });',
      '  const publishersQuery = useQuery({',
      "    queryKey: ['publishers', 'all-for-schedule'],",
      '    queryFn: () => publishersApi.list({ limit: 200 }),',
      '    staleTime: 5 * 60 * 1000,',
      '  });',
      '  const publishersById = new Map<string, Publisher>(',
      '    (publishersQuery.data?.data ?? []).map((p) => [p.id, p]),',
      '  );',
      '',
      '  type Dated = { m: FieldServiceMeeting; dateISO: string };',
      '  const dated: Dated[] = [];',
      '  for (const m of [...(weekA.data ?? []), ...(weekB.data ?? [])]) {',
      '    const dateISO = formatDateISO(',
      '      addDays(new Date(`${m.weekStartDate}T00:00:00`), m.dayOfWeek - 1),',
      '    );',
      '    if (dateISO < todayISO) continue;',
      '    dated.push({ m, dateISO });',
      '  }',
      '  dated.sort(',
      '    (a, b) =>',
      '      a.dateISO.localeCompare(b.dateISO) ||',
      '      a.m.startTime.localeCompare(b.m.startTime),',
      '  );',
      '  const next = dated[0];',
      '  if (!next) return null;',
      '',
      '  const m = next.m;',
      '  const conductor = m.conductorPublisherId',
      '    ? publishersById.get(m.conductorPublisherId) ?? null',
      '    : null;',
      '  const dateLabel = new Date(`${next.dateISO}T00:00:00`).toLocaleDateString(',
      '    i18n.language,',
      "    { weekday: 'long', day: 'numeric', month: 'long' },",
      '  );',
      '',
      '  return (',
      '    <>',
      '      <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>',
      "        {t('home.nextFieldService')}",
      '      </Text>',
      '      <View style={[styles.card, { paddingVertical: 14 }]}>',
      '        <View style={styles.meetingHeader}>',
      '          <Ionicons name="walk-outline" size={18} color="#0ea5e9" />',
      '          <Text style={styles.meetingKind}>',
      '            {t(`fieldService.days.${m.dayOfWeek}`)} · {m.startTime}',
      '          </Text>',
      '        </View>',
      '        <Text style={styles.meetingDate}>{dateLabel}</Text>',
      '        <Text style={styles.meetingMeta}>{m.address}</Text>',
      '        <Text',
      '          style={[styles.meetingMeta, !conductor && styles.fsUnassigned]}',
      '        >',
      "          {t('fieldService.conductor')}:{' '}",
      "          {conductor ? conductor.displayName : t('fieldService.unassigned')}",
      '        </Text>',
      '        {!!m.topic && <Text style={styles.fsTopic}>{m.topic}</Text>}',
      '        {!!m.sourceUrl && (',
      '          <Pressable',
      '            onPress={() =>',
      '              Linking.openURL(m.sourceUrl as string).catch(() => {})',
      '            }',
      '            hitSlop={6}',
      '          >',
      '            <Text style={styles.fsLink} numberOfLines={1}>',
      "              {t('fieldService.openLink')}",
      '            </Text>',
      '          </Pressable>',
      '        )}',
      '      </View>',
      '    </>',
      '  );',
      '}',
      '',
      'function EventHomeRow({',
      '  event: e,',
      '  first,',
      '}: {',
      '  event: SpecialEvent;',
      '  first: boolean;',
      '}) {',
      '  const { t, i18n } = useTranslation();',
      '  const start = new Date(`${e.date}T00:00:00`);',
      '  const end = e.endDate ? new Date(`${e.endDate}T00:00:00`) : null;',
      '  const typeLabel = e.type',
      '    ? t(`specialEvents.types.${e.type}`, e.type)',
      '    : null;',
      "  const meta = [e.time, e.address].filter(Boolean).join(' · ');",
      '  return (',
      '    <Pressable',
      '      style={[styles.eventRow, !first && styles.eventRowBorder]}',
      '      onPress={() => router.push(`/special-events/${e.id}` as any)}',
      '    >',
      '      {end ? (',
      '        <View style={[styles.evBadge, styles.evBadgeRange]}>',
      '          <Text style={styles.evRangeNum}>{ddmm(start)}</Text>',
      '          <Ionicons name="arrow-down" size={11} color="#0369a1" />',
      '          <Text style={styles.evRangeNum}>{ddmm(end)}</Text>',
      '        </View>',
      '      ) : (',
      '        <View style={styles.evBadge}>',
      '          <Text style={styles.evDay}>',
      "            {start.toLocaleDateString(i18n.language, { day: '2-digit' })}",
      '          </Text>',
      '          <Text style={styles.evMon}>',
      "            {start.toLocaleDateString(i18n.language, { month: 'short' })}",
      '          </Text>',
      '        </View>',
      '      )}',
      '      <View style={{ flex: 1, marginLeft: 10 }}>',
      '        {typeLabel ? (',
      '          <Text style={styles.evTypeTag}>{typeLabel}</Text>',
      '        ) : null}',
      '        <Text style={styles.eventTitle} numberOfLines={2}>',
      '          {e.title}',
      '        </Text>',
      '        {end ? (',
      '          <Text style={styles.evRange}>',
      '            {rangeLabel(start, end, i18n.language)}',
      '          </Text>',
      '        ) : null}',
      '        {meta ? (',
      '          <Text style={styles.evMeta} numberOfLines={1}>',
      '            {meta}',
      '          </Text>',
      '        ) : null}',
      '        {e.note ? (',
      '          <Text style={styles.evMeta} numberOfLines={1}>',
      '            {e.note}',
      '          </Text>',
      '        ) : null}',
      '      </View>',
      '      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />',
      '    </Pressable>',
      '  );',
      '}',
      '',
      "const TASK_ICONS: Record<MyAssignmentItem['kind'], keyof typeof Ionicons.glyphMap> = {",
    ]),
  ],
  // ---------- задания: время и тип встречи ----------
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
  [
    'tasks: push meetingTime',
    '    refined.push({ item, dateISO, weekOnly });',
    '    refined.push({ item, dateISO, weekOnly, meetingTime });',
  ],
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
  // ---------- монтирование карточки служения ----------
  [
    'mount: NextFieldServiceCard',
    nl([
      '      <NextMeetingCard myPublisherId={myPublisherId} />',
      '',
      '      <MyTasksCard />',
    ]),
    nl([
      '      <NextMeetingCard myPublisherId={myPublisherId} />',
      '',
      '      <NextFieldServiceCard />',
      '',
      '      <MyTasksCard />',
    ]),
  ],
  // ---------- события: зеркало админской карточки ----------
  [
    'events: admin-style rows',
    nl([
      '          upcoming.map((e, idx) => (',
      '            <Pressable',
      '              key={e.id}',
      '              style={[styles.eventRow, idx > 0 && styles.eventRowBorder]}',
      '              onPress={() => router.push(`/special-events/${e.id}` as any)}',
      '            >',
      '              <Ionicons',
      '                name="megaphone-outline"',
      '                size={18}',
      '                color="#0ea5e9"',
      '                style={{ marginRight: 10 }}',
      '              />',
      '              <View style={{ flex: 1 }}>',
      '                <Text style={styles.eventTitle} numberOfLines={1}>',
      '                  {e.title}',
      '                </Text>',
      '                <Text style={styles.eventDate}>',
      '                  {eventDateLabel(e, i18n.language)}',
      '                </Text>',
      '              </View>',
      '              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />',
      '            </Pressable>',
      '          ))',
    ]),
    nl([
      '          upcoming.map((e, idx) => (',
      '            <EventHomeRow key={e.id} event={e} first={idx === 0} />',
      '          ))',
    ]),
  ],
  // ---------- стили ----------
  [
    'styles: badge/typeTag/fs',
    "  eventDate: { fontSize: 13, color: '#0369a1', marginTop: 2 },",
    nl([
      "  eventDate: { fontSize: 13, color: '#0369a1', marginTop: 2 },",
      '  evBadge: {',
      '    width: 56,',
      "    alignItems: 'center',",
      "    justifyContent: 'center',",
      "    backgroundColor: '#e0f2fe',",
      '    borderRadius: 8,',
      '    paddingVertical: 8,',
      '  },',
      '  evBadgeRange: { paddingVertical: 10 },',
      "  evDay: { fontSize: 20, fontWeight: '700', color: '#0369a1' },",
      '  evMon: {',
      '    fontSize: 11,',
      "    color: '#0369a1',",
      "    textTransform: 'uppercase',",
      '    marginTop: 1,',
      '  },',
      "  evRangeNum: { fontSize: 14, fontWeight: '700', color: '#0369a1' },",
      '  evTypeTag: {',
      '    fontSize: 11,',
      "    fontWeight: '700',",
      "    color: '#0369a1',",
      "    textTransform: 'uppercase',",
      '    letterSpacing: 0.4,',
      '    marginBottom: 2,',
      '  },',
      "  evRange: { fontSize: 13, color: '#0369a1', fontWeight: '500', marginTop: 2 },",
      "  evMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },",
      "  fsUnassigned: { color: '#cbd5e1' },",
      '  fsTopic: {',
      '    fontSize: 13,',
      "    color: '#64748b',",
      "    fontStyle: 'italic',",
      '    marginTop: 4,',
      '  },',
      "  fsLink: { fontSize: 13, color: '#0369a1', fontWeight: '600', marginTop: 6 },",
    ]),
  ],
]);

// ---------- locales ----------
const ADDITIONS = {
  ru: {
    home: {
      nextFieldService: 'Встреча для проповеди',
      eventTypes: {
        midweek: 'Встреча среди недели',
        weekend: 'Выходная встреча',
      },
      fieldService: {
        leading: 'Встреча для проповеди — вы ведёте',
      },
    },
  },
  en: {
    home: {
      nextFieldService: 'Field service meeting',
      eventTypes: {
        midweek: 'Midweek meeting',
        weekend: 'Weekend meeting',
      },
      fieldService: {
        leading: 'Field service meeting — you conduct',
      },
    },
  },
  de: {
    home: {
      nextFieldService: 'Predigtdienst-Zusammenkunft',
      eventTypes: {
        midweek: 'Zusammenkunft unter der Woche',
        weekend: 'Wochenend-Zusammenkunft',
      },
      fieldService: {
        leading: 'Predigtdienst-Zusammenkunft — du leitest',
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

console.log('DONE: home detail v2 patched');
