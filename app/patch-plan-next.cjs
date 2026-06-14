#!/usr/bin/env node
/**
 * patch-plan-next.cjs — авто-переход к следующей пустой части в режиме
 * «Планирование». AssignmentSheet получает ОПЦИОНАЛЬНЫЙ проп onNext: если
 * он передан (только из режима), в шапке рядом с «Закрыть» появляется
 * «Далее →». PlanningMode вычисляет следующую незаполненную часть из
 * живого zoneItems и передаёт onNext, открывающий её. Вне режима проп не
 * передаётся — поведение шита нигде не меняется.
 * Применять ПОВЕРХ 0357b8f. Idempotent; LF/CRLF tolerant.
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

function patchFile(file, guard, edits) {
  const { txt: orig, eol } = readNorm(file);
  if (orig.includes(guard)) {
    console.log(`SKIP: ${file} already patched (${guard})`);
    return;
  }
  let txt = orig;
  for (const [label, anchor, replacement] of edits) {
    const parts = txt.split(anchor);
    if (parts.length !== 2) {
      console.log(`FAIL: anchor for "${label}" in ${file} found ${parts.length - 1} time(s), expected 1`);
      process.exit(1);
    }
    txt = parts[0] + replacement + parts[1];
    console.log(`OK: ${label}`);
  }
  fs.writeFileSync(file, txt.split('\n').join(eol));
  console.log(`OK: ${file} written`);
}

// ===== 1) AssignmentSheet.tsx: опциональный onNext + кнопка «Далее» =====
patchFile('components/AssignmentSheet.tsx', 'onNext', [
  [
    'sheet: onNext prop',
    nl([
      '  canEdit: boolean;',
      '  onClose: () => void;',
      '}',
    ]),
    nl([
      '  canEdit: boolean;',
      '  onClose: () => void;',
      '  /** When set (planning mode), shows a "Next" button to jump to the',
      '   * next unassigned part. */',
      '  onNext?: (() => void) | null;',
      '}',
    ]),
  ],
  [
    'sheet: destructure onNext',
    nl([
      '  canEdit,',
      '  onClose,',
      '}: Props) {',
    ]),
    nl([
      '  canEdit,',
      '  onClose,',
      '  onNext,',
      '}: Props) {',
    ]),
  ],
  [
    'sheet: Next button in header',
    nl([
      '          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>',
      '            <Text style={styles.closeText}>{t(\'common.close\')}</Text>',
      '          </Pressable>',
    ]),
    nl([
      '          <View style={{ flexDirection: \'row\', alignItems: \'center\', gap: 4 }}>',
      '            {onNext ? (',
      '              <Pressable onPress={onNext} hitSlop={8} style={styles.nextBtn}>',
      "                <Text style={styles.nextText}>{t('schedule.sheet.next')}</Text>",
      '              </Pressable>',
      '            ) : null}',
      '            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>',
      "              <Text style={styles.closeText}>{t('common.close')}</Text>",
      '            </Pressable>',
      '          </View>',
    ]),
  ],
  [
    'sheet: next button styles',
    "  closeText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600' },",
    nl([
      "  closeText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600' },",
      '  nextBtn: {',
      "    backgroundColor: '#0ea5e9',",
      '    borderRadius: 8,',
      '    paddingHorizontal: 12,',
      '    paddingVertical: 6,',
      '  },',
      "  nextText: { color: '#fff', fontSize: 14, fontWeight: '700' },",
    ]),
  ],
]);

// ===== 2) PlanningMode.tsx: вычислить следующую пустую + передать onNext =====
patchFile('components/PlanningMode.tsx', 'nextUnassigned', [
  [
    'plan: pass onNext',
    nl([
      '        onClose={() => setEditingInPlan(null)}',
      '      />',
    ]),
    nl([
      '        onNext={(() => {',
      '          if (!editingInPlan) return null;',
      '          const nextUnassigned = zoneItems.find(',
      '            (a) =>',
      "              !SONG_KEYS.includes(a.partKey) &&",
      '              !a.publisherId &&',
      '              !a.speakerName &&',
      '              a.id !== editingInPlan.id,',
      '          );',
      '          return nextUnassigned',
      '            ? () => setEditingInPlan(nextUnassigned)',
      '            : null;',
      '        })()}',
      '        onClose={() => setEditingInPlan(null)}',
      '      />',
    ]),
  ],
]);

// ===== 3) локали: schedule.sheet.next =====
const ADDITIONS = {
  ru: { schedule: { sheet: { next: 'Далее →' } } },
  en: { schedule: { sheet: { next: 'Next →' } } },
  de: { schedule: { sheet: { next: 'Weiter →' } } },
};

function deepMerge(target, source, p, report) {
  for (const key of Object.keys(source)) {
    const path = p ? `${p}.${key}` : key;
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!(key in target) || typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      deepMerge(target[key], sv, path, report);
    } else if (key in target) {
      report.skipped.push(path);
    } else {
      target[key] = sv;
      report.added.push(path);
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
    console.log(`SKIP: ${file} — all keys present`);
    continue;
  }
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
  console.log(`OK: ${file} — added ${report.added.length} keys`);
}

console.log('DONE: planning mode has next-empty navigation');
