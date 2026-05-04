import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface ChipOption<T> {
  value: T;
  label: string;
}

interface Props<T> {
  label: string;
  value: T | undefined | null;
  options: ChipOption<T>[];
  onChange: (value: T) => void;
}

export function FormChips<T extends string | number | null>({
  label,
  value,
  options,
  onChange,
}: Props<T>) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <Pressable
              key={String(opt.value)}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onChange(opt.value)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
    fontWeight: '500',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 20,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  chipText: { color: '#475569', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
});
