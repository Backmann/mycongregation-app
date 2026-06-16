#!/usr/bin/env node
/**
 * patch-lang-flags-htmllang.cjs — два независимых улучшения выбора языка:
 *  1) Убрать флаги стран из LanguagePicker (флаг страны ≠ язык: русский не
 *     только РФ, английский не только Британия). Остаются названия языков.
 *  2) Синхронизировать <html lang> с выбранным языком (web). Без этого Expo
 *     ставит дефолтный lang (en), и Chrome предлагает перевести русскую
 *     страницу. Выставление documentElement.lang убирает это и улучшает a11y.
 * Применять ПОВЕРХ 3ace618. Idempotent; LF/CRLF tolerant. Из ~/congmap/app.
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
    console.log(`SKIP: ${file} already patched (${guard})`);
    return;
  }
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

// ===== 1) LanguagePicker.tsx: убрать флаги =====
patchFile('components/LanguagePicker.tsx', '/* flags removed */', [
  // 1a) тип: убрать flag: string
  [
    'picker: drop flag from type',
    nl([
      '  code: SupportedLanguage;',
      '  nameKey: string;',
      '  flag: string;',
      '}[] = [',
    ]),
    nl([
      '  /* flags removed */',
      '  code: SupportedLanguage;',
      '  nameKey: string;',
      '}[] = [',
    ]),
  ],
  // 1b) массив: убрать flag-поля
  [
    'picker: drop flag from data',
    nl([
      "  { code: 'en', nameKey: 'language.english', flag: '🇬🇧' },",
      "  { code: 'ru', nameKey: 'language.russian', flag: '🇷🇺' },",
      "  { code: 'de', nameKey: 'language.german', flag: '🇩🇪' },",
    ]),
    nl([
      "  { code: 'en', nameKey: 'language.english' },",
      "  { code: 'ru', nameKey: 'language.russian' },",
      "  { code: 'de', nameKey: 'language.german' },",
    ]),
  ],
  // 1c) рендер: убрать строку с флагом
  [
    'picker: drop flag render',
    nl([
      '                <Text style={styles.flag}>{lang.flag}</Text>',
      '                <View style={{ flex: 1 }}>',
    ]),
    '                <View style={{ flex: 1 }}>',
  ],
  // 1d) стиль flag — убрать
  [
    'picker: drop flag style',
    "  flag: { fontSize: 24, marginRight: 12 },\n",
    '',
  ],
]);

// ===== 2) lib/i18n.ts: синхронизация <html lang> =====
patchFile('lib/i18n.ts', 'syncHtmlLang', [
  // 2a) импорт Platform
  [
    'i18n: import Platform',
    "import * as Localization from 'expo-localization';",
    nl([
      "import { Platform } from 'react-native';",
      "import * as Localization from 'expo-localization';",
    ]),
  ],
  // 2b) хелпер syncHtmlLang — после SupportedLanguage type
  [
    'i18n: syncHtmlLang helper',
    "export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];",
    nl([
      "export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];",
      '',
      '/**',
      ' * Keep <html lang> in sync with the active language (web only). Without',
      ' * this the page advertises the default lang (en) while showing e.g.',
      " * Russian, so Chrome offers to translate it. Also helps screen readers.",
      ' */',
      'function syncHtmlLang(lang: SupportedLanguage): void {',
      "  if (Platform.OS === 'web' && typeof document !== 'undefined') {",
      '    document.documentElement.lang = lang;',
      '  }',
      '}',
    ]),
  ],
  // 2c) init: sync после changeLanguage(stored)
  [
    'i18n: sync in init',
    nl([
      '      await i18n.changeLanguage(stored);',
      '      return { language: stored as SupportedLanguage, isFirstLaunch: false };',
    ]),
    nl([
      '      await i18n.changeLanguage(stored);',
      '      syncHtmlLang(stored as SupportedLanguage);',
      '      return { language: stored as SupportedLanguage, isFirstLaunch: false };',
    ]),
  ],
  // 2d) setLanguage: sync после changeLanguage(lang)
  [
    'i18n: sync in setLanguage',
    nl([
      '  await i18n.changeLanguage(lang);',
      '}',
    ]),
    nl([
      '  await i18n.changeLanguage(lang);',
      '  syncHtmlLang(lang);',
      '}',
    ]),
  ],
]);

console.log('DONE: flags removed + html lang synced');
