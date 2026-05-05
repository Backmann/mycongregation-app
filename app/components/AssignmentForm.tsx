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
import { FormChips } from './FormChips';
import { PublisherSelector } from './PublisherSelector';
import {
  AssignmentStatus,
  CreateAssignmentInput,
  EventType,
  extractErrorMessage,
} from '../lib/api';
import { getPartDef, getPartLabel } from '../lib/parts';

interface Props {
  initial?: Partial<CreateAssignmentInput>;
  onSubmit: (data: CreateAssignmentInput) => Promise<unknown>;
  onCancel?: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
  /** When true, weekStartDate / eventType / partKey become read-only. */
  lockIdentity?: boolean;
}

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'midweek', label: 'Midweek' },
  { value: 'weekend', label: 'Weekend' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'av_duty', label: 'A/V' },
  { value: 'public_witnessing', label: 'Public W.' },
];

const STATUS_OPTIONS: { value: AssignmentStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function AssignmentForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = 'Save',
  lockIdentity,
}: Props) {
  const [form, setForm] = useState<CreateAssignmentInput>({
    weekStartDate: initial?.weekStartDate ?? '',
    eventType: initial?.eventType ?? 'midweek',
    partKey: initial?.partKey ?? '',
    partOrder: initial?.partOrder ?? 0,
    partTitle: initial?.partTitle ?? '',
    partDurationMin: initial?.partDurationMin,
    publisherId: initial?.publisherId ?? null,
    assistantPublisherId: initial?.assistantPublisherId ?? null,
    status: initial?.status ?? 'draft',
    notes: initial?.notes ?? '',
  });

  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof CreateAssignmentInput>(
    key: K,
    value: CreateAssignmentInput[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const partDef = getPartDef(form.partKey);
  const showAssistant = !!partDef?.hasAssistant;
  const requiredCap = partDef?.requiredCapability;
  const requiredAssistantCap =
    partDef?.requiredAssistantCapability ?? partDef?.requiredCapability;

  const handleSubmit = async () => {
    setError(null);
    if (!form.weekStartDate?.trim()) {
      setError('Week start date is required');
      return;
    }
    if (!form.partKey?.trim()) {
      setError('Part key is required');
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
      <FormSection title="Identity">
        {lockIdentity ? (
          <>
            <View style={styles.readonly}>
              <Text style={styles.readonlyLabel}>Week start</Text>
              <Text style={styles.readonlyValue}>{form.weekStartDate}</Text>
            </View>
            <View style={styles.readonly}>
              <Text style={styles.readonlyLabel}>Event type</Text>
              <Text style={styles.readonlyValue}>{form.eventType}</Text>
            </View>
            <View style={styles.readonly}>
              <Text style={styles.readonlyLabel}>Part</Text>
              <Text style={styles.readonlyValue}>
                {getPartLabel(form.partKey)}
              </Text>
            </View>
          </>
        ) : (
          <>
            <FormField
              label="Week start (Monday, YYYY-MM-DD)"
              value={form.weekStartDate}
              onChangeText={(v) => update('weekStartDate', v)}
              placeholder="2026-05-04"
              required
              autoCapitalize="none"
            />
            <FormChips
              label="Event type"
              value={form.eventType}
              options={EVENT_TYPE_OPTIONS}
              onChange={(v) => update('eventType', v)}
            />
            <FormField
              label="Part key"
              value={form.partKey}
              onChangeText={(v) => update('partKey', v)}
              placeholder="bible_reading"
              required
              autoCapitalize="none"
            />
            <FormField
              label="Part order"
              value={form.partOrder?.toString() ?? '0'}
              onChangeText={(v) => update('partOrder', parseInt(v, 10) || 0)}
              keyboardType="numeric"
            />
          </>
        )}
      </FormSection>

      <FormSection title="Details">
        <FormField
          label="Part title (override)"
          value={form.partTitle ?? ''}
          onChangeText={(v) => update('partTitle', v)}
          placeholder="e.g. Числа 1:1-19"
          multiline
        />
        <FormField
          label="Duration (minutes)"
          value={form.partDurationMin?.toString() ?? ''}
          onChangeText={(v) =>
            update('partDurationMin', v ? parseInt(v, 10) : undefined)
          }
          keyboardType="numeric"
          placeholder="4"
        />
      </FormSection>

      <FormSection title="Assignment">
        <PublisherSelector
          label="Publisher"
          value={form.publisherId}
          onChange={(id) => update('publisherId', id)}
          excludeIds={
            form.assistantPublisherId ? [form.assistantPublisherId] : []
          }
          requiredCapability={requiredCap}
        />
        {showAssistant && (
          <PublisherSelector
            label="Assistant"
            value={form.assistantPublisherId}
            onChange={(id) => update('assistantPublisherId', id)}
            excludeIds={form.publisherId ? [form.publisherId] : []}
            requiredCapability={requiredAssistantCap}
          />
        )}
      </FormSection>

      <FormSection title="Status">
        <FormChips
          label="Status"
          value={form.status ?? 'draft'}
          options={STATUS_OPTIONS}
          onChange={(v) => update('status', v)}
        />
        <FormField
          label="Notes"
          value={form.notes ?? ''}
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
  readonly: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  readonlyLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 2,
  },
  readonlyValue: { fontSize: 15, color: '#0f172a' },
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
