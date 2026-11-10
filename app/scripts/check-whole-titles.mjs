#!/usr/bin/env node
/**
 * A talk's or a part's name is shown whole, wherever it is read.
 *
 * 10 November 2026: on the closed card of the programme the theme of a
 * public talk stopped after two lines with «…» — «Везде должно быть полное
 * название, слова без сокращений». The same two-line cut stood on «Мои
 * назначения», on Home's card, in the programme editor, in the talk
 * selector and in the talk coordinator's screens.
 *
 * The rule this keeps: in the screens that name a programme part or a talk,
 * a <Text> whose style is a title, a topic or a talk may not be given
 * `numberOfLines`. A long name wraps; it is never cut.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'app/(app)/schedule/index.tsx',
  'app/(app)/schedule/edit.tsx',
  'app/(app)/home/index.tsx',
  'app/(app)/home/my-assignments.tsx',
  'app/(app)/talk-coordinator/log.tsx',
  'app/(app)/talk-coordinator/speakers.tsx',
  'app/(app)/talk-coordinator/speaker-profile/[id].tsx',
  'app/(app)/talk-coordinator/our-speaker-profile/[id].tsx',
  'components/ProgrammeSheet.tsx',
  'components/PublicTalkSelector.tsx',
];
/** Style names that hold the name of a part or a talk. */
const NAMED = /\b(?:styles|s)\.(?:title|partTitle|topic|nextTopic|nextFootAbout|visitTalk|swapRowTalk|talkChipText|optionTitle|fieldValue|heroTitle)\b/;

const bad = [];
for (const rel of FILES) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  // Every opening <Text …> tag, however many lines it spans.
  for (const m of src.matchAll(/<Text\b[^>]*?>/gs)) {
    const tag = m[0];
    if (NAMED.test(tag) && /numberOfLines\s*=/.test(tag)) {
      const line = src.slice(0, m.index).split('\n').length;
      bad.push(`${rel}:${line}  ${tag.replace(/\s+/g, ' ').slice(0, 90)}`);
    }
  }
}
if (bad.length) {
  console.error('A part or talk name is cut short (numberOfLines on a title):');
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log(`Названия целиком: ${FILES.length} файлов, обрезанных названий нет`);
