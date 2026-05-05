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
  submitLabel = 'Save',
}: Props) {
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
      setError('Name is required');
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
      <FormSection title="Group">
        <FormField
          label="Name"
          value={form.name}
          onChangeText={(v) => update('name', v)}
          required
          placeholder="Группа №1 Север"
        />
        <FormField
          label="Meeting location"
          value={form.meetingLocation}
          onChangeText={(v) => update('meetingLocation', v)}
          placeholder="Brackeler Hellweg 14"
        />
      </FormSection>

      <FormSection title="Leadership">
        <PublisherSelector
          label="Overseer"
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
          label="Assistant"
          value={form.assistantPublisherId}
          onChange={(id) => update('assistantPublisherId', id)}
          excludeIds={
            form.overseerPublisherId ? [form.overseerPublisherId] : []
          }
        />
      </FormSection>

      <FormSection title="Notes">
        <FormField
          label="Notes"
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
            <Text style={styles.buttonPrimaryText}>{submitLabel}</Text>
          )}
        </Pressable>
        {onCancel && (
          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonSecondaryText}>Cancel</Text>
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
