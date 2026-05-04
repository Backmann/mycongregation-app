import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  label: string;
  value: string | undefined;
  onChangeText: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
}

export function FormField({
  label,
  value,
  onChangeText,
  required,
  multiline,
  placeholder,
  ...rest
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={value ?? ''}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#cbd5e1"
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        autoCorrect={false}
        {...rest}
      />
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
    marginBottom: 4,
    fontWeight: '500',
  },
  required: { color: '#dc2626' },
  input: {
    fontSize: 16,
    color: '#0f172a',
    paddingVertical: 4,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
