import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { circuitOverseerApi, extractErrorMessage } from '../../../lib/api';

/**
 * Default circuit-overseer card (admin only). Its name pre-fills every
 * circuit-overseer-visit event; each visit keeps its own snapshot, so editing
 * this later never rewrites past visits.
 */
export default function CircuitOverseerScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['circuit-overseer'],
    queryFn: () => circuitOverseerApi.get(),
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [wifeName, setWifeName] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setFirstName(data.firstName ?? '');
      setLastName(data.lastName ?? '');
      setWifeName(data.wifeName ?? '');
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      circuitOverseerApi.upsert({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        wifeName: wifeName.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['circuit-overseer'] });
      Alert.alert(t('circuitOverseer.savedTitle'), t('circuitOverseer.savedBody'));
    },
    onError: (err: unknown) => setServerError(extractErrorMessage(err)),
  });

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    !mutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setServerError(null);
    mutation.mutate();
  };

  if (isLoading) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 24 }}
      >
        <ActivityIndicator size="small" color="#0ea5e9" />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>{t('circuitOverseer.intro')}</Text>

        {serverError && (
          <Text style={styles.errorBoxText}>{serverError}</Text>
        )}

        <Text style={styles.fieldLabel}>{t('circuitOverseer.firstName')}</Text>
        <TextInputField value={firstName} onChange={setFirstName} />

        <Text style={styles.fieldLabel}>{t('circuitOverseer.lastName')}</Text>
        <TextInputField value={lastName} onChange={setLastName} />

        <Text style={styles.fieldLabel}>{t('circuitOverseer.wifeName')}</Text>
        <TextInputField value={wifeName} onChange={setWifeName} />
        <Text style={styles.fieldHint}>{t('circuitOverseer.wifeHint')}</Text>

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitButton,
            !canSubmit && { opacity: 0.5 },
            pressed && canSubmit && { opacity: 0.85 },
          ]}
        >
          {mutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="save" size={18} color="#fff" />
              <Text style={styles.submitButtonText}>
                {t('circuitOverseer.save')}
              </Text>
            </>
          )}
        </Pressable>

        <Text style={styles.note}>{t('circuitOverseer.note')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TextInputField({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      autoCapitalize="words"
      autoCorrect={false}
      placeholderTextColor="#94a3b8"
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  intro: { fontSize: 14, color: '#475569', marginBottom: 8, lineHeight: 20 },
  errorBoxText: {
    color: '#991b1b',
    fontSize: 13,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 16,
  },
  fieldHint: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0ea5e9',
    marginTop: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  note: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
