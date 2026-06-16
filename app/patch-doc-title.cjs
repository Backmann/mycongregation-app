#!/usr/bin/env node
/**
 * patch-doc-title.cjs — выставлять локализованный <title> вместе с <html
 * lang>. Сейчас document.title пустой ('') — у Chrome нет сильного сигнала
 * языка, и он предлагает перевод даже при lang=ru и русском тексте (видимо,
 * из-за латиницы в данных — email, имена). Осмысленный русский заголовок
 * даёт явный сигнал и заодно правильно именует вкладку (полезно само по
 * себе: a11y, закладки). Расширяет syncHtmlLang в lib/i18n.ts.
 * Применять ПОВЕРХ 04cf598. Idempotent; LF/CRLF tolerant. Из ~/congmap/app.
 */
const fs = require('fs');

function nl(lines) {
  return lines.join('\n');
}

// ===== 1) lib/i18n.ts: добавить установку title в syncHtmlLang =====
const file = 'lib/i18n.ts';
let raw;
try {
  raw = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.log(`FAIL: cannot read ${file}: ${e.message}`);
  process.exit(1);
}
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let txt = raw.split('\r\n').join('\n');

if (txt.includes('document.title')) {
  console.log(`SKIP: ${file} already patched (document.title present)`);
} else {
  const anchor = '    document.documentElement.lang = lang;';
  const parts = txt.split(anchor);
  if (parts.length !== 2) {
    console.log(`FAIL: anchor (documentElement.lang) found ${parts.length - 1} time(s), expected 1`);
    process.exit(1);
  }
  const replacement = nl([
    '    document.documentElement.lang = lang;',
    '    // A localized, non-empty title gives Chrome a strong language signal',
    '    // (otherwise it may offer to translate despite lang=ru).',
    "    const title = i18n.t('app.title');",
    "    if (title && title !== 'app.title') document.title = title;",
  ]);
  txt = parts[0] + replacement + parts[1];
  fs.writeFileSync(file, txt.split('\n').join(eol));
  console.log(`OK: ${file} — title set in syncHtmlLang`);
}

// ===== 2) локали: app.title =====
const ADDITIONS = {
  ru: { app: { title: 'Моё собрание' } },
  en: { app: { title: 'My Congregation' } },
  de: { app: { title: 'Meine Versammlung' } },
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!(key in target) || typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      deepMerge(target[key], sv);
    } else if (!(key in target)) {
      target[key] = sv;
    }
  }
}

for (const locale of Object.keys(ADDITIONS)) {
  const lf = `locales/${locale}.json`;
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(lf, 'utf8'));
  } catch (e) {
    console.log(`FAIL: cannot read/parse ${lf}: ${e.message}`);
    process.exit(1);
  }
  const before = JSON.stringify(obj);
  deepMerge(obj, ADDITIONS[locale]);
  if (JSON.stringify(obj) === before) {
    console.log(`SKIP: ${lf} — app.title present`);
  } else {
    fs.writeFileSync(lf, JSON.stringify(obj, null, 2) + '\n');
    console.log(`OK: ${lf} — app.title added`);
  }
}

console.log('DONE: localized document.title');
