#!/usr/bin/env node
/**
 * patch-planning-live-data.cjs — режим «Планирование» показывал снимок:
 * setPlanningZone({items}) фиксировал массив на момент клика, и после
 * сохранения в шите список/прогресс не обновлялись. Теперь PlanningMode
 * сам подписан на тот же query ['assignments', weekStartISO] и фильтрует
 * по eventType (для weekend — без hospitality), поэтому видит свежие
 * данные сразу после назначения. zone больше не несёт items.
 * Применять ПОВЕРХ 5ea7f55. Idempotent; LF/CRLF tolerant.
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

function applyOne(file, txt, label, anchor, replacement) {
  const parts = txt.split(anchor);
  if (parts.length !== 2) {
    console.log(`FAIL: anchor for "${label}" found ${parts.length - 1} time(s), expected 1`);
    process.exit(1);
  }
  console.log(`OK: ${label}`);
  return parts[0] + replacement + parts[1];
}

// ===== 1) PlanningMode.tsx: живой query вместо zone.items =====
{
  const file = 'components/PlanningMode.tsx';
  const { txt: orig, eol } = readNorm(file);
  if (orig.includes('const liveQuery = useQuery({')) {
    console.log(`SKIP: ${file} already patched (live query present)`);
  } else {
    let txt = orig;
    // 1a) импорты: useQuery + api
    txt = applyOne(
      file, txt, 'import useQuery',
      "import { useMemo, useState } from 'react';",
      nl([
        "import { useMemo, useState } from 'react';",
        "import { useQuery } from '@tanstack/react-query';",
      ]),
    );
    txt = applyOne(
      file, txt, 'import assignmentsApi',
      "import { Assignment, Publisher } from '../lib/api';",
      "import { Assignment, assignmentsApi, Publisher } from '../lib/api';",
    );
    // 1b) zone: items → weekStartISO/nextWeekISO (метаданные зоны без снимка)
    txt = applyOne(
      file, txt, 'zone shape (drop items)',
      nl([
        '    title: string;',
        '    meta: string | null;',
        '    items: Assignment[];',
        '    weekStartDate: string;',
        '  } | null;',
      ]),
      nl([
        '    title: string;',
        '    meta: string | null;',
        '    weekStartISO: string;',
        '    nextWeekISO: string;',
        '    weekStartDate: string;',
        '  } | null;',
      ]),
    );
    // 1c) живой query + вычисление items из него (заменяем тело useMemo-источника)
    txt = applyOne(
      file, txt, 'live query + items',
      nl([
        '  const { todo, drafts, assignedCount, totalCount } = useMemo(() => {',
        '    const real = (zone?.items ?? []).filter(',
        '      (a) => !SONG_KEYS.includes(a.partKey),',
        '    );',
      ]),
      nl([
        '  const liveQuery = useQuery({',
        "    queryKey: ['assignments', zone?.weekStartISO ?? ''],",
        '    queryFn: () =>',
        '      assignmentsApi.list({',
        '        weekStart: zone!.weekStartISO,',
        '        weekEnd: zone!.nextWeekISO,',
        '      }),',
        '    enabled: !!zone,',
        '  });',
        '  const zoneItems = useMemo(() => {',
        '    const all = (liveQuery.data?.data ?? []).filter(',
        '      (a) => a.eventType === zone?.eventType,',
        '    );',
        "    return zone?.eventType === 'weekend'",
        "      ? all.filter((a) => a.partKey !== 'weekend_hospitality')",
        '      : all;',
        '  }, [liveQuery.data, zone]);',
        '',
        '  const { todo, drafts, assignedCount, totalCount } = useMemo(() => {',
        '    const real = zoneItems.filter(',
        '      (a) => !SONG_KEYS.includes(a.partKey),',
        '    );',
      ]),
    );
    // 1d) useMemo deps: [zone] → [zoneItems]
    txt = applyOne(
      file, txt, 'useMemo deps',
      '    return { todo, drafts, assignedCount, totalCount: real.length };\n  }, [zone]);',
      '    return { todo, drafts, assignedCount, totalCount: real.length };\n  }, [zoneItems]);',
    );
    fs.writeFileSync(file, txt.split('\n').join(eol));
    console.log(`OK: ${file} written`);
  }
}

// ===== 2) index.tsx: setPlanningZone без items, с weekStartISO/nextWeekISO =====
{
  const file = 'app/(app)/schedule/index.tsx';
  const { txt: orig, eol } = readNorm(file);
  if (orig.includes('weekStartISO: string;\n    nextWeekISO: string;')) {
    console.log(`SKIP: ${file} already patched`);
  } else {
    let txt = orig;
    // 2a) тип состояния planningZone: items → weekStartISO/nextWeekISO
    txt = applyOne(
      file, txt, 'planningZone state type',
      nl([
        '  const [planningZone, setPlanningZone] = useState<{',
        "    eventType: 'midweek' | 'weekend';",
        '    title: string;',
        '    meta: string | null;',
        '    items: Assignment[];',
        '    weekStartDate: string;',
        '  } | null>(null);',
      ]),
      nl([
        '  const [planningZone, setPlanningZone] = useState<{',
        "    eventType: 'midweek' | 'weekend';",
        '    title: string;',
        '    meta: string | null;',
        '    weekStartISO: string;',
        '    nextWeekISO: string;',
        '    weekStartDate: string;',
        '  } | null>(null);',
      ]),
    );
    // midweek
    txt = applyOne(
      file, txt, 'midweek zone fields',
      nl([
        "                            title: getEventTypeLabel('midweek'),",
        "                            meta: meetingDateLabel('midweek'),",
        '                            items,',
        '                            weekStartDate: items[0].weekStartDate,',
      ]),
      nl([
        "                            title: getEventTypeLabel('midweek'),",
        "                            meta: meetingDateLabel('midweek'),",
        '                            weekStartISO,',
        '                            nextWeekISO,',
        '                            weekStartDate: items[0].weekStartDate,',
      ]),
    );
    // weekend
    txt = applyOne(
      file, txt, 'weekend zone fields',
      nl([
        "                            title: getEventTypeLabel('weekend'),",
        "                            meta: meetingDateLabel('weekend'),",
        '                            items: programItems,',
        '                            weekStartDate: items[0].weekStartDate,',
      ]),
      nl([
        "                            title: getEventTypeLabel('weekend'),",
        "                            meta: meetingDateLabel('weekend'),",
        '                            weekStartISO,',
        '                            nextWeekISO,',
        '                            weekStartDate: items[0].weekStartDate,',
      ]),
    );
    fs.writeFileSync(file, txt.split('\n').join(eol));
    console.log(`OK: ${file} written`);
  }
}

console.log('DONE: planning mode reads live data');
