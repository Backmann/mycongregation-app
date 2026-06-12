#!/usr/bin/env node
/**
 * patch-my-tasks-screen.cjs — шаг 1 редизайна Главной:
 *  - новый экран home/my-assignments (полный список по неделям) — файлом
 *  - lib/my-tasks.ts (общая логика) — файлом
 *  - home/index.tsx: MyTasksCard сжимается до 3 строк + ссылка «Все (N)»,
 *    логика переезжает в lib; фикс lint-warning (i18n в HomeScreen)
 *  - home/_layout.tsx: регистрация экрана
 *  - locales: home.allTasks, home.myTasksScreen.* ×3
 * Применять ПОВЕРХ a004d9e (v2 Главной). Idempotent; LF/CRLF tolerant.
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

/** Replaces everything between two unique markers (markers preserved). */
function replaceBetween(txt, label, startMarker, endMarker, replacement) {
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
  return a[0] + startMarker + replacement + endMarker + tail;
}

// ---------- app/(app)/home/index.tsx ----------
{
  const file = 'app/(app)/home/index.tsx';
  const { txt: orig, eol } = readNorm(file);
  if (orig.includes('home.allTasks')) {
    console.log(`SKIP: ${file} already patched (home.allTasks present)`);
  } else {
    let txt = orig;
    // 1) импорт общей логики
    txt = applyEdits(file, txt, [
      [
        'index: import my-tasks lib',
        "import { useMyPublisher } from '../../../lib/useMyPublisher';",
        nl([
          "import { useMyPublisher } from '../../../lib/useMyPublisher';",
          'import {',
          '  refineMyTasks,',
          '  taskMeta,',
          '  taskTitle,',
          "} from '../../../lib/my-tasks';",
        ]),
      ],
      // 2) lint: i18n в HomeScreen не используется
      [
        'index: HomeScreen unused i18n',
        nl([
          'export default function HomeScreen() {',
          '  const { t, i18n } = useTranslation();',
        ]),
        nl([
          'export default function HomeScreen() {',
          '  const { t } = useTranslation();',
        ]),
      ],
    ]);
    // 3) тело MyTasksCard: от заголовка функции до MyAbsencesBlock
    txt = replaceBetween(
      txt,
      'index: compact MyTasksCard',
      'function MyTasksCard() {',
      '\nfunction MyAbsencesBlock',
      nl([
        '',
        '  const { t, i18n } = useTranslation();',
        '  const { user } = useAuth();',
        '  const todayISO = formatDateISO(new Date());',
        '',
        '  const { data: overview } = useQuery({',
        "    queryKey: ['meeting-settings'],",
        '    queryFn: () => meetingSettingsApi.getOverview(),',
        '    staleTime: 5 * 60 * 1000,',
        '  });',
        '  const versions = overview?.versions ?? [];',
        '',
        '  const { data } = useQuery({',
        "    queryKey: ['me', 'assignments'],",
        '    queryFn: () => meApi.assignments(),',
        '    enabled: !!user,',
        '    retry: false,',
        '    staleTime: 60 * 1000,',
        '  });',
        '',
        '  if (!data || data.items.length === 0) return null;',
        '',
        '  const refined = refineMyTasks(data.items, versions, todayISO);',
        '  if (refined.length === 0) return null;',
        '  const top = refined.slice(0, 3);',
        '',
        '  return (',
        '    <>',
        '      <View style={[styles.sectionHeader, { marginTop: 24 }]}>',
        "        <Text style={styles.sectionTitle}>{t('home.myTasks')}</Text>",
        '        <Pressable',
        "          onPress={() => router.push('/home/my-assignments' as any)}",
        '          hitSlop={8}',
        '        >',
        '          <Text style={styles.link}>',
        "            {t('home.allTasks', { count: refined.length })}",
        '          </Text>',
        '        </Pressable>',
        '      </View>',
        '      <View style={styles.card}>',
        '        {top.map((r, idx) => (',
        '          <View',
        '            key={`${r.item.kind}-${idx}-${r.dateISO}`}',
        '            style={[styles.eventRow, idx > 0 && styles.eventRowBorder]}',
        '          >',
        '            <Ionicons',
        '              name={TASK_ICONS[r.item.kind]}',
        '              size={18}',
        '              color="#0ea5e9"',
        '              style={{ marginRight: 10 }}',
        '            />',
        '            <View style={{ flex: 1 }}>',
        '              <Text style={styles.eventTitle} numberOfLines={1}>',
        '                {taskTitle(r.item, t)}',
        '              </Text>',
        '              <Text style={styles.eventDate} numberOfLines={2}>',
        '                {taskMeta(r, t, i18n.language)}',
        '              </Text>',
        '            </View>',
        '          </View>',
        '        ))}',
        '      </View>',
        '    </>',
        '  );',
        '}',
        '',
      ]),
    );
    writeBack(file, txt, eol);
  }
}

// ---------- app/(app)/home/_layout.tsx ----------
{
  const file = 'app/(app)/home/_layout.tsx';
  const { txt: orig, eol } = readNorm(file);
  if (orig.includes('my-assignments')) {
    console.log(`SKIP: ${file} already patched`);
  } else {
    const txt = applyEdits(file, orig, [
      [
        'layout: my-assignments screen',
        nl([
          '      <Stack.Screen name="index" options={{ title: t(\'home.title\') }} />',
        ]),
        nl([
          '      <Stack.Screen name="index" options={{ title: t(\'home.title\') }} />',
          '      <Stack.Screen',
          '        name="my-assignments"',
          "        options={{ title: t('home.myTasksScreen.title') }}",
          '      />',
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
      allTasks: 'Все ({{count}})',
      myTasksScreen: {
        title: 'Мои задания',
        empty: 'Заданий на ближайшие недели нет',
      },
    },
  },
  en: {
    home: {
      allTasks: 'All ({{count}})',
      myTasksScreen: {
        title: 'My assignments',
        empty: 'No assignments in the coming weeks',
      },
    },
  },
  de: {
    home: {
      allTasks: 'Alle ({{count}})',
      myTasksScreen: {
        title: 'Meine Aufgaben',
        empty: 'Keine Aufgaben in den kommenden Wochen',
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

console.log('DONE: my-assignments screen patched');
