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
import { CreateServiceGroupInput, extractErrorMessage } from '../lib/api';
import { useTranslation } from 'react-i18next';

interface Props {
  initial?: Partial<CreateServiceGroupInput>;
  onSubmit: (data: CreateServiceGroupInput) => Promise<unknown>;
  onCancel?: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
}

export function ServiceGroupForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}: Props) {
  const { t } = useTranslation();
  const effectiveSubmitLabel = submitLabel ?? t('common.save');
  const [form, setForm] = useState<CreateServiceGroupInput>({
    name: initial?.name ?? '',
    overseerPublisherId: initial?.overseerPublisherId ?? null,
    assistantPublisherId: initial?.assistantPublisherId ?? null,
    meetingLocation: initial?.meetingLocation ?? '',
    notes: initial?.notes ?? '',
  });

  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof CreateServiceGroupInput>(
    key: K,
    value: CreateServiceGroupInput[K],
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
      <FormSection title={t('serviceGroups.form.section')}>
        <FormField
          label={t('common.name')}
          value={form.name}
          onChangeText={(v) => update('name', v)}
          required
          placeholder={t('serviceGroups.form.namePlaceholder')}
        />
        <FormField
          label={t('serviceGroups.form.meetingLocation')}
          value={form.meetingLocation}
          onChangeText={(v) => update('meetingLocation', v)}
          placeholder={t('serviceGroups.form.meetingLocationPlaceholder')}
        />
      </FormSection>

      <FormSection title={t('serviceGroups.form.leadership')}>
        <PublisherSelector
          label={t('serviceGroups.form.overseer')}
          value={form.overseerPublisherId}
          onChange={(id) => {
            update('overseerPublisherId', id);
            // If assistant matches new overseer, clear it
            if (id && form.assistantPublisherId === id) {
              update('assistantPublisherId', null);
            }
          }}
        />
        <PublisherSelector
          label={t('serviceGroups.form.assistant')}
          value={form.assistantPublisherId}
          onChange={(id) => update('assistantPublisherId', id)}
          excludeIds={
            form.overseerPublisherId ? [form.overseerPublisherId] : []
          }
        />
      </FormSection>

      <FormSection title={t('common.notes')}>
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
