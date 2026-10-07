#!/usr/bin/env node
/**
 * «No Google services on this phone» is recognised — and only that.
 *
 * lib/push-no-google.ts turns one failure of the notification key into a
 * plain sentence. Recognising too little leaves a Huawei owner reading about
 * Firebase and rebuilds; recognising too much would tell somebody whose
 * phone merely had no network that it can never receive anything.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'lib/push-no-google.ts'), 'utf8');
const m = /export const NO_GOOGLE_SERVICES = \/(.+)\/([a-z]*);/.exec(src);
if (!m) {
  console.error('✗ lib/push-no-google.ts: образец NO_GOOGLE_SERVICES не найден');
  process.exit(1);
}
const pattern = new RegExp(m[1], m[2]);

const YES = [
  // As the Huawei said it, word for word.
  'Fetching the token failed: java.util.concurrent.ExecutionException: java.io.IOException: MISSING_INSTANCEID_SERVICE',
  'java.io.IOException: missing_instanceid_service',
  'com.google.android.gms.common.GooglePlayServicesNotAvailableException',
  'Google Play services is not available on this device',
];
const NO = [
  // A build without Firebase — July's cause, cured by a rebuild.
  'Default FirebaseApp is not initialized in this process com.backmann.mycongregation',
  // No network at that moment: tomorrow it works.
  'Fetching the token failed: java.util.concurrent.ExecutionException: java.io.IOException: SERVICE_NOT_AVAILABLE',
  'java.io.IOException: TOO_MANY_REGISTRATIONS',
  'java.io.IOException: AUTHENTICATION_FAILED',
  'Network request failed',
  '',
];
const problems = [];
for (const s of YES) if (!pattern.test(s)) problems.push(`не узнано: «${s}»`);
for (const s of NO) if (pattern.test(s)) problems.push(`узнано зря: «${s}»`);

// And the screen really asks, and drops July's hint when the answer is yes.
const screen = readFileSync(join(ROOT, 'app/(app)/profile/notifications.tsx'), 'utf8');
if (!/noGoogleServices\(/.test(screen)) problems.push('экран «Уведомления» не спрашивает noGoogleServices()');
if (!/state === 'no_token' && Platform\.OS === 'android' && !noGoogle \? \(\s*<Text[^>]*>\s*\{t\('notificationPrefs\.device\.androidHint'\)\}/.test(screen)) {
  problems.push('подсказка про Firebase показывается и телефону без сервисов Google');
}

if (problems.length) {
  console.error(`✗ Телефон без сервисов Google (${problems.length}):`);
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(`OK: телефон без сервисов Google узнаётся (${YES.length} случая) и не путается с другими сбоями (${NO.length}).`);
