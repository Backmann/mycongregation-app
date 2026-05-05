import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

interface Props {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function FilterToggle({ label, value, onValueChange }: Props) {
  return (
    <Pressable
      style={styles.row}
      onPress={() => onValueChange(!value)}
    >
      <Text style={styles.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#e2e8f0', true: '#7dd3fc' }}
        thumbColor={value ? '#0ea5e9' : '#f8fafc'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  label: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
});
