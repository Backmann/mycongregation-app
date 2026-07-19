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
  // Same shape as DateField, so a form looks like one set of controls.
  container: { marginBottom: 14 },
  label: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 6,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  required: { color: '#dc2626' },
  input: {
    fontSize: 15,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#fff',
  },
  multiline: {
    minHeight: 88,
    paddingTop: 11,
    textAlignVertical: 'top',
  },
});
