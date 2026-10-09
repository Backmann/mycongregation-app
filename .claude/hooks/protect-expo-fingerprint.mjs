#!/usr/bin/env node
// PreToolUse hook: keeps Claude away from app/package.json and app/.gitignore.
//
// Both files are inputs to the Expo fingerprint. Any change to them moves the
// runtime version, and an over-the-air update published under a runtime
// version no installed app carries reaches nobody. Lionel's rule: never touch
// them. This hook turns the rule into a refusal Claude cannot talk past.
//
// Edits through Edit / Write / MultiEdit / NotebookEdit are blocked reliably.
// Shell commands are checked on a best-effort basis: writes that name one of
// the two files, and package-manager commands that rewrite package.json when
// they run inside app/.
//
// Exit 2 = block; the message on stderr goes back to Claude.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROTECTED = ['app/package.json', 'app/.gitignore'];
const REASON =
  'Blocked by .claude/hooks/protect-expo-fingerprint.mjs: app/package.json and ' +
  'app/.gitignore are inputs to the Expo fingerprint. Changing them moves the ' +
  'runtime version and over-the-air updates stop reaching installed apps. ' +
  'Do not change them; if a change seems necessary, stop and ask Lionel.';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0); // unreadable input: never block on our own failure
}

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const isWin = /^[A-Za-z]:[\\/]/.test(root);
const P = isWin ? path.win32 : path.posix;

// Git Bash spells C:\x as /c/x; bring it back to a Windows path.
const fromGitBash = (p) =>
  isWin && /^\/[A-Za-z]\//.test(p) ? `${p[1]}:${p.slice(2)}` : p;

const relToRoot = (p) => {
  const abs = P.resolve(fromGitBash(input.cwd || root), fromGitBash(String(p)));
  const rel = P.relative(fromGitBash(root), abs).split(P.sep).join('/');
  return isWin ? rel.toLowerCase() : rel;
};

const block = () => {
  process.stderr.write(REASON + '\n');
  process.exit(2);
};

const tool = input.tool_name;
const ti = input.tool_input || {};

if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
  const target = ti.file_path || ti.notebook_path;
  if (target && PROTECTED.includes(relToRoot(target))) block();
  process.exit(0);
}

if (tool === 'Bash') {
  const cmd = String(ti.command || '');
  const names = String.raw`(?:package\.json|\.gitignore)`;

  // 1. A write that names one of the files: redirect into it, or an editing
  //    command in the same statement that mentions it.
  const redirectInto = new RegExp(String.raw`(?:>>?|\btee\b(?:\s+-a)?)\s*["']?[^\s;&|"']*` + names + String.raw`\b`);
  const editingTool = /\b(?:sed|perl)\b[^;&|]*\s-i|\bprettier\b[^;&|]*--write|\bgit\s+(?:checkout|restore|rm)\b|\b(?:mv|cp|rm|truncate|touch)\b|writeFile/;
  const statements = cmd.split(/;|&&|\|\||\n/);
  const namesRe = new RegExp(String.raw`(?:^|[\s"'/=])` + names + String.raw`\b`);
  for (const s of statements) {
    if (redirectInto.test(s)) block();
    if (editingTool.test(s) && namesRe.test(s)) block();
  }

  // 2. Package-manager commands that rewrite package.json, when run in app/.
  const cwdRel = input.cwd ? relToRoot(input.cwd) : '';
  const inApp =
    cwdRel === 'app' ||
    cwdRel.startsWith('app/') ||
    /\bcd\s+["']?(?:[^\s;&|"']*\/)?app["']?(?:\s|;|&|$)/.test(cmd) ||
    /(?:--prefix|-C)\s+["']?(?:\.\/)?app\b/.test(cmd);
  if (inApp) {
    const rewrites = [
      // install/add with a package name (a bare `npm install` / `npm ci` is fine)
      /\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\s+(?!-)[^\s;&|]+/,
      /\b(?:npm|pnpm|yarn|bun)\s+(?:remove|rm|uninstall|un|update|up|upgrade|dedupe|link|unlink|version)\b/,
      /\bnpm\s+pkg\s+(?:set|delete|fix)\b/,
      /\bnpm\s+audit\s+fix\b/,
      /\bexpo\s+(?:install|prebuild)\b/,
    ];
    // `npm --prefix app i x`: drop directory flags so the verb sits next to the tool
    const bare = cmd.replace(/\s(?:--prefix|-C|--cwd|--dir)[=\s]+["']?[^\s;&|"']+["']?/g, ' ');
    if (rewrites.some((re) => re.test(bare))) block();
  }
}

process.exit(0);
