import { StyleSheet, Switch, Text, View } from 'react-native';

interface Props {
  label: string;
  value: boolean | undefined;
  onValueChange: (value: boolean) => void;
}

export function FormSwitch({ label, value, onValueChange }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        value={value ?? false}
        onValueChange={onValueChange}
        trackColor={{ false: '#e2e8f0', true: '#7dd3fc' }}
        thumbColor={value ? '#0ea5e9' : '#f8fafc'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    minHeight: 44,
  },
  label: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
  },
});
