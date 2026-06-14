#!/usr/bin/env node
// Прогоняет оба патча режима «Планирование» по порядку.
const { execSync } = require('child_process');
for (const f of ['patch-planning-mode.cjs', 'patch-planning-locales.cjs']) {
  console.log(`\n--- ${f} ---`);
  execSync(`node ${f}`, { stdio: 'inherit' });
}
