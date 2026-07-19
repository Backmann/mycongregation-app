import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * FormSection look-alike whose body can be collapsed. Used for rarely-edited
 * fields ("Additional"); pass initiallyOpen when any of the inner fields
 * already holds a value so existing data is never hidden.
 */
export function CollapsibleSection({
  title,
  initiallyOpen = false,
  children,
}: {
  title: string;
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.section}>
      <Pressable
        style={styles.header}
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.title}>{title}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#64748b"
        />
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches FormSection so both kinds of block sit on the same grid.
  section: { marginTop: 16, marginHorizontal: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  title: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  body: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8edf3',
    overflow: 'hidden',
  },
});
