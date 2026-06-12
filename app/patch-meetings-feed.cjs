#!/usr/bin/env node
/**
 * patch-meetings-feed.cjs — шаг 2 редизайна Главной:
 *  - NextMeetingCard + NextFieldServiceCard → единая лента MeetingsFeed:
 *    все встречи ближайших 7 дней (среди недели, выходная, служения)
 *    в хронологическом порядке;
 *  - карточка с моим заданием подсвечена акцентной кромкой + блок
 *    «Ваши задания» с заголовками частей (из кэша /me/assignments);
 *  - событие с «вместо встречи» встаёт в ленту на место встречи
 *    (карточка события, тап ведёт на его экран);
 *  - чип «Сегодня» на карточке текущего дня;
 *  - подчистка осиротевших импортов (Assignment, assignmentsApi,
 *    getPartLabel).
 * Применять ПОВЕРХ 32e5f0c (шаг 1). Idempotent; LF/CRLF tolerant.
 * Запускать из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

function readNorm(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.log(`FAIL: cannot read ${file}: ${e.message}`);
    process.exit(1);
  }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return { txt: raw.split('\r\n').join('\n'), eol };
}

function writeBack(file, txt, eol) {
  fs.writeFileSync(file, txt.split('\n').join(eol));
  console.log(`OK: ${file} written`);
}

function applyEdits(file, txt, edits) {
  for (const [label, anchor, replacement] of edits) {
    const parts = txt.split(anchor);
    if (parts.length !== 2) {
      console.log(`FAIL: anchor for "${label}" found ${parts.length - 1} time(s), expected 1`);
      process.exit(1);
    }
    txt = parts[0] + replacement + parts[1];
    console.log(`OK: ${label}`);
  }
  return txt;
}

/** Replaces a span INCLUDING both markers with the replacement text. */
function replaceSpan(txt, label, startMarker, endMarker, replacement) {
  const a = txt.split(startMarker);
  if (a.length !== 2) {
    console.log(`FAIL: start marker for "${label}" found ${a.length - 1} time(s)`);
    process.exit(1);
  }
  const b = a[1].split(endMarker);
  if (b.length < 2) {
    console.log(`FAIL: end marker for "${label}" not found after start`);
    process.exit(1);
  }
  const tail = b.slice(1).join(endMarker);
  console.log(`OK: ${label}`);
  return a[0] + replacement + tail;
}

const FEED = nl([
  'type FeedEntry = {',
  '  key: string;',
  "  kind: 'midweek' | 'weekend' | 'field_service';",
  '  dateISO: string;',
  '  time: string;',
  '  address: string;',
  '  conductorName: string | null;',
  '  unassignedConductor: boolean;',
  '  topic: string | null;',
  '  sourceUrl: string | null;',
  '  replacedBy: SpecialEvent | null;',
  '  myLabels: string[];',
  '};',
  '',
  '/**',
  ' * Every meeting of the next 7 days — congregation meetings from the',
  ' * meeting settings, field-service meetings of this and next week —',
  ' * in one chronological feed. Cards with my assignments are highlighted;',
  ' * an event flagged "replaces meeting" takes the meeting\u2019s place.',
  ' */',
  'function MeetingsFeed() {',
  '  const { t, i18n } = useTranslation();',
  '  const todayISO = formatDateISO(new Date());',
  '  const horizonISO = formatDateISO(',
  '    addDays(new Date(`${todayISO}T00:00:00`), 7),',
  '  );',
  '  const thisMonday = formatDateISO(startOfWeekMonday(new Date()));',
  '  const nextMonday = formatDateISO(',
  '    addDays(startOfWeekMonday(new Date()), 7),',
  '  );',
  '',
  '  const { data: overview, isLoading } = useQuery({',
  "    queryKey: ['meeting-settings'],",
  '    queryFn: () => meetingSettingsApi.getOverview(),',
  '    staleTime: 5 * 60 * 1000,',
  '  });',
  '  const versions = overview?.versions ?? [];',
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
  '  const eventsQuery = useQuery({',
  "    queryKey: ['special-events', 'home'],",
  '    queryFn: () => specialEventsApi.list(),',
  '  });',
  '  const myTasksQuery = useQuery({',
  "    queryKey: ['me', 'assignments'],",
  '    queryFn: () => meApi.assignments(),',
  '    retry: false,',
  '    staleTime: 60 * 1000,',
  '  });',
  '',
  '  const publishersById = new Map<string, Publisher>(',
  '    (publishersQuery.data?.data ?? []).map((p) => [p.id, p]),',
  '  );',
  '  const myItems = myTasksQuery.data?.items ?? [];',
  '  const events = eventsQuery.data ?? [];',
  '',
  '  const entries: FeedEntry[] = [];',
  '',
  '  for (const weekISO of [thisMonday, nextMonday]) {',
  '    const v = effectiveVersionFor(versions, weekISO);',
  '    if (!v) continue;',
  "    for (const kind of ['midweek', 'weekend'] as const) {",
  "      const dow = kind === 'midweek' ? v.midweekDow : v.weekendDow;",
  "      const time = kind === 'midweek' ? v.midweekTime : v.weekendTime;",
  '      if (!dow) continue;',
  '      const dateISO = formatDateISO(',
  '        addDays(new Date(`${weekISO}T00:00:00`), dow - 1),',
  '      );',
  '      if (dateISO < todayISO || dateISO > horizonISO) continue;',
  '      const replacedBy =',
  '        events.find(',
  '          (e) =>',
  '            e.replacesMeeting &&',
  '            e.date <= dateISO &&',
  '            dateISO <= (e.endDate ?? e.date),',
  '        ) ?? null;',
  '      const myLabels = myItems',
  '        .filter(',
  '          (it) =>',
  "            (it.kind === 'meeting' || it.kind === 'duty') &&",
  '            it.weekStartDate === weekISO &&',
  '            it.eventType === kind,',
  '        )',
  '        .map((it) => taskTitle(it, t));',
  '      entries.push({',
  '        key: `${kind}-${dateISO}`,',
  '        kind,',
  '        dateISO,',
  '        time,',
  '        address: v.address,',
  '        conductorName: null,',
  '        unassignedConductor: false,',
  '        topic: null,',
  '        sourceUrl: null,',
  '        replacedBy,',
  '        myLabels,',
  '      });',
  '    }',
  '  }',
  '',
  '  for (const m of [...(weekA.data ?? []), ...(weekB.data ?? [])]) {',
  '    const dateISO = formatDateISO(',
  '      addDays(new Date(`${m.weekStartDate}T00:00:00`), m.dayOfWeek - 1),',
  '    );',
  '    if (dateISO < todayISO || dateISO > horizonISO) continue;',
  '    const conductor = m.conductorPublisherId',
  '      ? publishersById.get(m.conductorPublisherId) ?? null',
  '      : null;',
  '    const myLabels = myItems',
  '      .filter(',
  '        (it) =>',
  "          it.kind === 'field_service' &&",
  '          it.weekStartDate === m.weekStartDate &&',
  '          it.dayOfWeek === m.dayOfWeek &&',
  '          (!it.time || it.time === m.startTime),',
  '      )',
  "      .map(() => t('home.feed.youConduct'));",
  '    entries.push({',
  '      key: `fs-${m.id}`,',
  "      kind: 'field_service',",
  '      dateISO,',
  '      time: m.startTime,',
  '      address: m.address,',
  '      conductorName: conductor ? conductor.displayName : null,',
  '      unassignedConductor: !conductor,',
  '      topic: m.topic,',
  '      sourceUrl: m.sourceUrl,',
  '      replacedBy: null,',
  '      myLabels,',
  '    });',
  '  }',
  '',
  '  entries.sort(',
  '    (a, b) =>',
  '      a.dateISO.localeCompare(b.dateISO) || a.time.localeCompare(b.time),',
  '  );',
  '',
  '  if (isLoading) {',
  '    return (',
  '      <View style={styles.card}>',
  '        <ActivityIndicator style={{ paddingVertical: 16 }} />',
  '      </View>',
  '    );',
  '  }',
  '  if (entries.length === 0) {',
  '    return (',
  '      <View style={styles.card}>',
  "        <Text style={styles.muted}>{t('home.feed.empty')}</Text>",
  '      </View>',
  '    );',
  '  }',
  '',
  '  return (',
  '    <View style={{ gap: 10 }}>',
  '      {entries.map((en) => {',
  '        const mine = en.myLabels.length > 0;',
  '        const isToday = en.dateISO === todayISO;',
  '        const dateLabel = new Date(',
  '          `${en.dateISO}T00:00:00`,',
  '        ).toLocaleDateString(i18n.language, {',
  "          weekday: 'long',",
  "          day: 'numeric',",
  "          month: 'long',",
  '        });',
  '',
  '        if (en.replacedBy) {',
  '          const e = en.replacedBy;',
  '          const typeLabel = e.type',
  '            ? t(`specialEvents.types.${e.type}`, e.type)',
  '            : null;',
  '          return (',
  '            <Pressable',
  '              key={en.key}',
  '              style={[styles.card, { paddingVertical: 14 }]}',
  '              onPress={() => router.push(`/special-events/${e.id}` as any)}',
  '            >',
  '              <View style={styles.meetingHeader}>',
  '                <Ionicons name="megaphone-outline" size={18} color="#0ea5e9" />',
  '                <Text style={styles.meetingKind}>',
  "                  {typeLabel ?? t('home.kinds.meeting')}",
  '                </Text>',
  '                {isToday ? (',
  "                  <Text style={styles.todayChip}>{t('home.feed.today')}</Text>",
  '                ) : null}',
  '              </View>',
  '              <Text style={styles.meetingDate}>{e.title}</Text>',
  '              <Text style={styles.meetingMeta}>',
  '                {dateLabel}',
  "                {e.time ? ` · ${e.time}` : ''}",
  "                {e.address ? ` · ${e.address}` : ''}",
  '              </Text>',
  '            </Pressable>',
  '          );',
  '        }',
  '',
  '        const kindLabel =',
  "          en.kind === 'field_service'",
  "            ? t('home.nextFieldService')",
  '            : t(`home.eventTypes.${en.kind}`);',
  '        return (',
  '          <View',
  '            key={en.key}',
  '            style={[',
  '              styles.card,',
  '              { paddingVertical: 14 },',
  '              mine && styles.feedMine,',
  '            ]}',
  '          >',
  '            <View style={styles.meetingHeader}>',
  '              <Ionicons',
  "                name={en.kind === 'field_service' ? 'walk-outline' : 'calendar'}",
  '                size={18}',
  '                color="#0ea5e9"',
  '              />',
  '              <Text style={styles.meetingKind}>{kindLabel}</Text>',
  '              {isToday ? (',
  "                <Text style={styles.todayChip}>{t('home.feed.today')}</Text>",
  '              ) : null}',
  '            </View>',
  '            <Text style={styles.meetingDate}>{dateLabel}</Text>',
  '            <Text style={styles.meetingMeta}>',
  '              {en.time}',
  "              {en.address ? ` · ${en.address}` : ''}",
  '            </Text>',
  "            {en.kind === 'field_service' ? (",
  '              <Text',
  '                style={[',
  '                  styles.meetingMeta,',
  '                  en.unassignedConductor && styles.fsUnassigned,',
  '                ]}',
  '              >',
  "                {t('fieldService.conductor')}:{' '}",
  "                {en.conductorName ?? t('fieldService.unassigned')}",
  '              </Text>',
  '            ) : null}',
  '            {!!en.topic && <Text style={styles.fsTopic}>{en.topic}</Text>}',
  '            {!!en.sourceUrl && (',
  '              <Pressable',
  '                onPress={() =>',
  '                  Linking.openURL(en.sourceUrl as string).catch(() => {})',
  '                }',
  '                hitSlop={6}',
  '              >',
  '                <Text style={styles.fsLink} numberOfLines={1}>',
  "                  {t('fieldService.openLink')}",
  '                </Text>',
  '              </Pressable>',
  '            )}',
  '            {mine ? (',
  '              <View style={styles.partsBox}>',
  "                <Text style={styles.partsTitle}>{t('home.meeting.myParts')}</Text>",
  '                {en.myLabels.map((l, i) => (',
  '                  <Text key={i} style={styles.partRow} numberOfLines={2}>',
  "                    {'\\u2022 '}",
  '                    {l}',
  '                  </Text>',
  '                ))}',
  '              </View>',
  '            ) : null}',
  '          </View>',
  '        );',
  '      })}',
  '    </View>',
  '  );',
  '}',
  '',
  'function EventHomeRow({',
]);

// ---------- app/(app)/home/index.tsx ----------
{
  const file = 'app/(app)/home/index.tsx';
  const { txt: orig, eol } = readNorm(file);
  if (orig.includes('MeetingsFeed')) {
    console.log(`SKIP: ${file} already patched (MeetingsFeed present)`);
  } else {
    let txt = orig;
    txt = applyEdits(file, txt, [
      [
        'index: drop Assignment/assignmentsApi imports',
        nl(['  absencesApi,', '  Assignment,', '  assignmentsApi,', '  fieldServiceApi,']),
        nl(['  absencesApi,', '  fieldServiceApi,']),
      ],
      [
        'index: drop getPartLabel import',
        "import { getPartLabel } from '../../../lib/parts';\n",
        '',
      ],
    ]);
    txt = replaceSpan(
      txt,
      'index: NextMeetingCard + NextFieldServiceCard -> MeetingsFeed',
      'type NextMeeting = {',
      'function EventHomeRow({',
      FEED,
    );
    txt = applyEdits(file, txt, [
      [
        'index: mount MeetingsFeed',
        nl([
          '      <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>',
          "        {t('home.nextMeeting')}",
          '      </Text>',
          '      <NextMeetingCard myPublisherId={myPublisherId} />',
          '',
          '      <NextFieldServiceCard />',
          '',
          '      <MyTasksCard />',
        ]),
        nl([
          '      <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>',
          "        {t('home.nextMeetings')}",
          '      </Text>',
          '      <MeetingsFeed />',
          '',
          '      <MyTasksCard />',
        ]),
      ],
      [
        'index: styles feedMine + todayChip',
        "  meetingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },",
        nl([
          "  meetingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },",
          "  feedMine: { borderLeftWidth: 3, borderLeftColor: '#0ea5e9' },",
          '  todayChip: {',
          "    marginLeft: 'auto',",
          '    fontSize: 10,',
          "    fontWeight: '700',",
          "    color: '#0369a1',",
          "    backgroundColor: '#e0f2fe',",
          '    borderRadius: 8,',
          '    paddingHorizontal: 8,',
          '    paddingVertical: 2,',
          "    textTransform: 'uppercase',",
          '    letterSpacing: 0.4,',
          '  },',
        ]),
      ],
    ]);
    writeBack(file, txt, eol);
  }
}

// ---------- locales ----------
const ADDITIONS = {
  ru: {
    home: {
      nextMeetings: 'Следующие встречи',
      feed: {
        empty: 'Встреч в ближайшие 7 дней нет',
        today: 'Сегодня',
        youConduct: 'Вы ведёте эту встречу',
      },
    },
  },
  en: {
    home: {
      nextMeetings: 'Next meetings',
      feed: {
        empty: 'No meetings in the next 7 days',
        today: 'Today',
        youConduct: 'You conduct this meeting',
      },
    },
  },
  de: {
    home: {
      nextMeetings: 'Nächste Zusammenkünfte',
      feed: {
        empty: 'Keine Zusammenkünfte in den nächsten 7 Tagen',
        today: 'Heute',
        youConduct: 'Du leitest diese Zusammenkunft',
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

console.log('DONE: meetings feed patched');
