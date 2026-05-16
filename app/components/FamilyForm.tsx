import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FormField } from './FormField';
import { FormSection } from './FormSection';
import { PublisherSelector } from './PublisherSelector';
import { CreateFamilyInput, extractErrorMessage } from '../lib/api';
import { useTranslation } from 'react-i18next';

interface Props {
  initial?: Partial<CreateFamilyInput>;
  onSubmit: (data: CreateFamilyInput) => Promise<unknown>;
  onCancel?: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
}

export function FamilyForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}: Props) {
  const { t } = useTranslation();
  const effectiveSubmitLabel = submitLabel ?? t('common.save');
  const [form, setForm] = useState<CreateFamilyInput>({
    name: initial?.name ?? '',
    headPublisherId: initial?.headPublisherId ?? null,
    notes: initial?.notes ?? '',
  });

  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof CreateFamilyInput>(
    key: K,
    value: CreateFamilyInput[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.name?.trim()) {
      setError(t('common.nameRequired'));
      return;
    }
    try {
      await onSubmit(form);
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <FormSection title={t('families.form.section')}>
        <FormField
          label={t('common.name')}
          value={form.name}
          onChangeText={(v) => update('name', v)}
          required
          placeholder={t('families.form.namePlaceholder')}
        />
        <PublisherSelector
          label={t('families.form.head')}
          value={form.headPublisherId}
          onChange={(id) => update('headPublisherId', id)}
        />
        <FormField
          label={t('common.notes')}
          value={form.notes}
          onChangeText={(v) => update('notes', v)}
          multiline
        />
      </FormSection>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[
            styles.button,
            styles.buttonPrimary,
            isSubmitting && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonPrimaryText}>{effectiveSubmitLabel}</Text>
          )}
        </Pressable>
        {onCancel && (
          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonSecondaryText}>{t('common.cancel')}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14 },
  actions: { padding: 20, gap: 8 },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  buttonPrimary: { backgroundColor: '#0ea5e9' },
  buttonDisabled: { opacity: 0.6 },
  buttonPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  buttonSecondaryText: { color: '#475569', fontSize: 16, fontWeight: '500' },
});
