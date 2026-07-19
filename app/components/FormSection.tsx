import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A section reads as its own card: the label sits above it, and the fields
  // inside share one padding, so every form keeps the same rhythm.
  section: { marginTop: 16, marginHorizontal: 12 },
  title: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 6,
    marginBottom: 8,
    letterSpacing: 0.6,
  },
  body: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8edf3',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 1,
  },
});
