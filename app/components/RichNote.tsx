import React from 'react';
import { Text, View, StyleSheet, TextStyle } from 'react-native';

/**
 * The light markup the app's note toolbars already insert: **bold**, _italic_,
 * bullet lines, blank lines.
 *
 * The toolbar has existed for a while and nothing ever rendered what it wrote,
 * so a note came out on screen with its own asterisks and underscores showing —
 * the formatting was being typed and then displayed as typos. This is the other
 * half of that feature.
 *
 * Deliberately tiny: bold, italic, and lines that start with a bullet. No
 * headings, no links, no tables. A note pinned to a schedule is a few sentences
 * and a list; anything more would be a document, and a document belongs in a
 * document.
 */
export function RichNote({
  text,
  style,
}: {
  text: string;
  style?: TextStyle;
}) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <View>
      {lines.map((line, i) => {
        const bullet = /^\s*[•\-*]\s+/.test(line);
        const body = bullet ? line.replace(/^\s*[•\-*]\s+/, '') : line;
        if (!body.trim()) return <View key={i} style={styles.gap} />;
        return (
          <View key={i} style={styles.line}>
            {bullet ? <Text style={[styles.bulletMark, style]}>•</Text> : null}
            <Text style={[styles.text, style]}>{renderInline(body)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** **bold** and _italic_, in one pass, without a parser worth the name. */
function renderInline(input: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(_([^_]+)_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(input))) {
    if (m.index > last) out.push(input.slice(last, m.index));
    if (m[2] !== undefined) {
      out.push(
        <Text key={`b${key++}`} style={styles.bold}>
          {m[2]}
        </Text>,
      );
    } else {
      out.push(
        <Text key={`i${key++}`} style={styles.italic}>
          {m[4]}
        </Text>,
      );
    }
    last = re.lastIndex;
  }
  if (last < input.length) out.push(input.slice(last));
  return out;
}

/** The same markup as plain HTML, for the printed sheet. */
export function richNoteToHtml(text: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const bullet = /^\s*[•\-*]\s+/.test(line);
      const body = esc(bullet ? line.replace(/^\s*[•\-*]\s+/, '') : line)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/_([^_]+)_/g, '<em>$1</em>');
      if (!body.trim()) return '<div class="gap"></div>';
      return bullet
        ? `<div class="bul"><span>•</span><span>${body}</span></div>`
        : `<div>${body}</div>`;
    })
    .join('');
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 6 },
  gap: { height: 8 },
  text: { flex: 1, fontSize: 14, color: '#0f172a', lineHeight: 20 },
  bulletMark: { fontSize: 14, color: '#94a3b8', lineHeight: 20 },
  bold: { fontFamily: 'Manrope_700Bold' },
  italic: { fontStyle: 'italic' },
});
