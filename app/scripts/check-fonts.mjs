/**
 * One typeface, really (14 October 2026).
 *
 * The app is set in Manrope, one file per weight. On a phone screenshot of
 * 14 October most of it was not: «Общая встреча», «10:30», «Добрый день»,
 * the dates and the tab labels were Roboto, and only the lines that named a
 * face and nothing else («Ведёт …») were Manrope. Two causes, both silent:
 *
 *  - a style that names a Manrope face AND a fontWeight. Android looks the
 *    pair up as «Manrope_700Bold, bold», which nobody registered, and draws
 *    the system font instead; the browser draws the bold file and then fakes
 *    bold over it. The face IS the weight: no fontWeight beside it.
 *  - a <Text> whose own style names no face. The base face is set through
 *    Text.defaultProps, and defaultProps only apply when no style is passed:
 *    any style replaces it, and the text falls back to Roboto on the phone
 *    and to the system font in the browser (Times New Roman when the words
 *    sat in a View, not a Text at all).
 *
 * Checked here, by reading the code:
 *  1. no fontWeight anywhere, except «normal» beside a face — to undo a
 *     library's own weight (the tab labels);
 *  2. every fontFamily is one of the five loaded faces;
 *  3. no italic (no italic file is loaded), except the note toolbar's own
 *     «italic» markup, which is the point there;
 *  4. a <Text>/<TextInput> not inside another Text, whose base style (the
 *     style, or the first of an array) can be read in the same file, names
 *     a face. A Text inside a Text inherits its parent's face and must not
 *     name one unless it means to change it.
 *
 * Called DIRECTLY from the gate, never through package.json `scripts`.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');

const FACES = new Set([
  'Manrope_400Regular',
  'Manrope_500Medium',
  'Manrope_600SemiBold',
  'Manrope_700Bold',
  'Manrope_800ExtraBold',
  // The paste boxes of the two importers show the pasted lines as they are.
  'monospace',
]);
const TEXTLIKE = new Set(['Text', 'TextInput', 'Animated.Text', 'Animated.TextInput']);
// The note toolbar writes _italic_; the button and the rendered note show it.
const ITALIC_ALLOWED = new Set([
  'components/RichText.tsx',
  'components/SpecialEventForm.tsx',
  'app/(app)/pioneer-school/[id].tsx',
]);

const propOf = (obj, name) =>
  obj.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      p.name &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name,
  );

export function fontProblems(rel, src) {
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const at = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

  const sheets = new Map();
  const collect = (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.expression.getText() === 'StyleSheet.create' &&
      ts.isIdentifier(n.name)
    ) {
      const arg = n.initializer.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const m = new Map();
        for (const p of arg.properties)
          if (ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) m.set(p.name.getText(), p.initializer);
        sheets.set(n.name.text, m);
      }
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const resolve = (e) => {
    if (!e) return null;
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e)) e = e.expression;
    if (ts.isObjectLiteralExpression(e)) return [e];
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && sheets.has(e.expression.text)) {
      const o = sheets.get(e.expression.text).get(e.name.text);
      return o ? [o] : null;
    }
    if (ts.isConditionalExpression(e)) {
      const a = resolve(e.whenTrue);
      const b = resolve(e.whenFalse);
      return a && b ? [...a, ...b] : null;
    }
    return null;
  };

  const visit = (n) => {
    if (ts.isObjectLiteralExpression(n)) {
      const w = propOf(n, 'fontWeight');
      const fam = propOf(n, 'fontFamily');
      const st = propOf(n, 'fontStyle');
      if (w) {
        const v = w.initializer.getText().replace(/['"`]/g, '');
        if (v !== 'normal') out.push(`${at(w)} fontWeight ${v}: the face carries the weight — name the face instead`);
        else if (!fam) out.push(`${at(w)} fontWeight normal without a face`);
      }
      if (fam) {
        const e = fam.initializer;
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
          if (!FACES.has(e.text)) out.push(`${at(fam)} fontFamily «${e.text}» is not a loaded face`);
        } else if (e.getText() === 'undefined') {
          out.push(`${at(fam)} fontFamily undefined: a later layer then wipes the face`);
        }
      }
      if (st && /italic/.test(st.initializer.getText()) && !ITALIC_ALLOWED.has(rel))
        out.push(`${at(st)} italic: no italic file is loaded`);
    }
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && TEXTLIKE.has(n.tagName.getText())) {
      const el = ts.isJsxOpeningElement(n) ? n.parent : n;
      let nested = false;
      for (let p = el.parent; p; p = p.parent)
        if (ts.isJsxElement(p) && TEXTLIKE.has(p.openingElement.tagName.getText())) {
          nested = true;
          break;
        }
      const st = n.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === 'style');
      const e = st && st.initializer && ts.isJsxExpression(st.initializer) ? st.initializer.expression : null;
      if (e && !nested) {
        const base = ts.isArrayLiteralExpression(e) ? e.elements[0] : e;
        const objs = resolve(base);
        if (objs && objs.some((o) => !propOf(o, 'fontFamily')))
          out.push(`${at(n)} <${n.tagName.getText()} style=${base.getText().slice(0, 50)}>: its base style names no face, so it is drawn in the system font`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// --- the rule, on cases ------------------------------------------------------
const CASES = [
  ['bold and a face', `const s = StyleSheet.create({ a: { fontWeight: '700', fontFamily: 'Manrope_700Bold' } });`, 1],
  ['a face alone', `const s = StyleSheet.create({ a: { fontSize: 14, fontFamily: 'Manrope_700Bold' } });`, 0],
  ['a weight alone', `const s = StyleSheet.create({ a: { fontWeight: '600' } });`, 1],
  ['normal beside a face', `const o = { fontFamily: 'Manrope_600SemiBold', fontWeight: 'normal' };`, 0],
  ['a face that is not loaded', `const o = { fontFamily: 'Manrope_300Light' };`, 1],
  ['undefined face', `const o = { fontFamily: undefined, fontSize: 13 };`, 1],
  ['FONT constant', `const o = { fontFamily: FONT.bold };`, 0],
  ['italic', `const o = { fontFamily: 'Manrope_400Regular', fontStyle: 'italic' };`, 1],
  ['Text with a faceless style', `const s = StyleSheet.create({ a: { fontSize: 13 } }); const X = () => <Text style={s.a}>x</Text>;`, 1],
  ['Text with a faced style', `const s = StyleSheet.create({ a: { fontSize: 13, fontFamily: 'Manrope_400Regular' } }); const X = () => <Text style={s.a}>x</Text>;`, 0],
  ['faceless later layer', `const s = StyleSheet.create({ a: { fontFamily: 'Manrope_700Bold' }, b: { color: 'red' } }); const X = () => <Text style={[s.a, s.b]}>x</Text>;`, 0],
  ['faceless first layer', `const s = StyleSheet.create({ a: { color: 'red' }, b: { fontFamily: 'Manrope_700Bold' } }); const X = () => <Text style={[s.a, s.b]}>x</Text>;`, 1],
  ['nested Text inherits', `const s = StyleSheet.create({ a: { fontFamily: 'Manrope_700Bold' }, b: { color: 'red' } }); const X = () => <Text style={s.a}>x <Text style={s.b}>y</Text></Text>;`, 0],
  ['either branch faceless', `const s = StyleSheet.create({ a: { fontFamily: 'Manrope_700Bold' }, b: { color: 'red' } }); const X = ({ c }) => <Text style={c ? s.a : s.b}>x</Text>;`, 1],
  ['inline faceless', `const X = () => <Text style={{ fontSize: 12 }}>x</Text>;`, 1],
  ['style from outside', `const X = ({ style }) => <Text style={style}>x</Text>;`, 0],
];
const caseFailures = [];
for (const [name, src, want] of CASES) {
  const got = fontProblems('case.tsx', src).length;
  if (got !== want) caseFailures.push(`${name}: expected ${want} problem(s), got ${got}`);
}

// --- the app -----------------------------------------------------------------
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules') continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(n) && !/\.d\.ts$/.test(n)) files.push(p);
  }
};
['app', 'components', 'lib'].forEach((d) => walk(join(ROOT, d)));
const problems = [];
for (const f of files) {
  // Forward slashes on every system: the allowed list is written that way.
  const rel = relative(ROOT, f).split(sep).join('/');
  problems.push(...fontProblems(rel, readFileSync(f, 'utf8').replace(/\r\n/g, '\n')));
}

if (caseFailures.length || problems.length) {
  if (caseFailures.length) console.error(`✗ Шрифт — правило не прошло своих случаев:\n  ${caseFailures.join('\n  ')}`);
  if (problems.length) console.error(`✗ Шрифт — ${problems.length} мест(а) не в Manrope:\n  ${problems.slice(0, 60).join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ Шрифт: ${files.length} файлов — везде Manrope начертанием, без отдельной жирности; правило проверено на ${CASES.length} случаях`);
