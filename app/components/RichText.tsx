import { Text, TextStyle, StyleProp } from 'react-native';

/**
 * Renders the light formatting produced by the note toolbar: **bold**,
 * _italic_ and plain line breaks. Anything else passes through untouched,
 * so old plain-text notes look exactly as before.
 */
export function RichText({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
}) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|_[^_\n]+_)/g);
  return (
    <Text style={style}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4)
          return (
            <Text key={i} style={{ fontWeight: '700' }}>
              {p.slice(2, -2)}
            </Text>
          );
        if (p.startsWith('_') && p.endsWith('_') && p.length > 2)
          return (
            <Text key={i} style={{ fontStyle: 'italic' }}>
              {p.slice(1, -1)}
            </Text>
          );
        return p;
      })}
    </Text>
  );
}
