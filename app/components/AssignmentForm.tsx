import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { PublicTalkSelector } from './PublicTalkSelector';
import {
  AssignmentStatus,
  CreateAssignmentInput,
  EventType,
  extractErrorMessage,
  PublicTalk,
  PublisherActivity,
  publisherActivityApi,
} from '../lib/api';
import {
  getPartDef,
  getPartLabel,
  skillCapabilityFromTitle,
} from '../lib/parts';
import { useTranslation } from 'react-i18next';

interface Props {
  initial?: Partial<CreateAssignmentInput>;
  onSubmit: (data: CreateAssignmentInput) => Promise<unknown>;
  onCancel?: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
  /** When true, weekStartDate / eventType / partKey become read-only. */
  lockIdentity?: boolean;
  /** When true the whole form is non-interactive and the actions are hidden. */
  readOnly?: boolean;
}

// EVENT_TYPE_OPTIONS, STATUS_OPTIONS, SPEAKER_TYPE_OPTIONS moved inside component (i18n)

export function AssignmentForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
  lockIdentity,
  readOnly,
}: Props) {
  const { t } = useTranslation();
  const effectiveSubmitLabel = submitLabel ?? t('common.save');
  const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
    { value: 'midweek', label: t('assignments.eventTypeShort.midweek') },
    { value: 'weekend', label: t('assignments.eventTypeShort.weekend') },
    { value: 'cleaning', label: t('assignments.eventTypeShort.cleaning') },
    { value: 'av_duty', label: t('assignments.eventTypeShort.av_duty') },
    { value: 'public_witnessing', label: t('assignments.eventTypeShort.public_witnessing') },
  ];
  const STATUS_OPTIONS: { value: AssignmentStatus; label: string }[] = [
    { value: 'draft', label: t('assignments.status.draft') },
    { value: 'published', label: t('assignments.status.published') },
    { value: 'cancelled', label: t('assignments.status.cancelled') },
  ];
  const SPEAKER_TYPE_OPTIONS: { value: 'local' | 'invited'; label: string }[] = [
    { value: 'local', label: t('assignments.speakerType.local') },
    { value: 'invited', label: t('assignments.speakerType.invited') },
  ];
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
    publicTalkId: initial?.publicTalkId ?? null,
    speakerName: initial?.speakerName ?? null,
    speakerCongregation: initial?.speakerCongregation ?? null,
  });

  // For public_talk_speaker only: 'local' = use publisherId, 'invited' = use speakerName
  const [speakerType, setSpeakerType] = useState<'local' | 'invited'>(
    initial?.speakerName ? 'invited' : 'local',
  );

  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof CreateAssignmentInput>(
    key: K,
    value: CreateAssignmentInput[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const activityQuery = useQuery({
    queryKey: ['publisher-activity', form.weekStartDate],
    queryFn: () =>
      publisherActivityApi.getActivity({
        weekStart: form.weekStartDate,
        weeks: 4,
      }),
    enabled: !!form.weekStartDate,
  });
  const activityById = new Map<string, PublisherActivity>();
  for (const a of activityQuery.data ?? []) activityById.set(a.publisherId, a);

  const partDef = getPartDef(form.partKey);
  const isPublicTalkSpeaker = form.partKey === 'public_talk_speaker';
  const showAssistant = !!partDef?.hasAssistant;
  // Apply-Yourself parts are numbered positionally, but the real skill is in
  // the title — prefer that so the picker filters by the correct capability.
  const titleCap = form.partKey?.startsWith('apply_yourself')
    ? skillCapabilityFromTitle(form.partTitle)
    : null;
  const requiredCap = titleCap ?? partDef?.requiredCapability;
  const requiredAssistantCap =
    titleCap ??
    partDef?.requiredAssistantCapability ??
    partDef?.requiredCapability;
  const requiredSkillLabel = requiredCap
    ? t(`capabilities.items.${requiredCap}`)
    : null;

  const handleTalkSelect = (talk: PublicTalk | null) => {
    setForm((prev) => ({
      ...prev,
      publicTalkId: talk?.id ?? null,
      // Auto-update partTitle when picking a talk; keep manual text when clearing
      partTitle: talk ? `№${talk.number}. ${talk.title}` : prev.partTitle,
    }));
  };

  const handleSpeakerTypeChange = (type: 'local' | 'invited') => {
    setSpeakerType(type);
    if (type === 'local') {
      // Clear invited fields
      setForm((prev) => ({
        ...prev,
        speakerName: null,
        speakerCongregation: null,
      }));
    } else {
      // Clear local publisher
      setForm((prev) => ({ ...prev, publisherId: null }));
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.weekStartDate?.trim()) {
      setError(t('assignments.form.validation.weekStartRequired'));
      return;
    }
    if (!form.partKey?.trim()) {
      setError(t('assignments.form.validation.partKeyRequired'));
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
      <View
        pointerEvents={readOnly ? 'none' : 'auto'}
        style={readOnly ? { opacity: 0.55 } : undefined}
      >
      <FormSection title={t('assignments.form.section.identity')}>
        {lockIdentity ? (
          <>
            <View style={styles.readonly}>
              <Text style={styles.readonlyLabel}>{t('assignments.form.readonly.weekStart')}</Text>
              <Text style={styles.readonlyValue}>{form.weekStartDate}</Text>
            </View>
            <View style={styles.readonly}>
              <Text style={styles.readonlyLabel}>{t('assignments.form.readonly.eventType')}</Text>
              <Text style={styles.readonlyValue}>{form.eventType}</Text>
            </View>
            <View style={styles.readonly}>
              <Text style={styles.readonlyLabel}>{t('assignments.form.readonly.part')}</Text>
              <Text style={styles.readonlyValue}>
                {getPartLabel(form.partKey)}
              </Text>
            </View>
          </>
        ) : (
          <>
            <FormField
              label={t('assignments.form.field.weekStartFull')}
              value={form.weekStartDate}
              onChangeText={(v) => update('weekStartDate', v)}
              placeholder={t('assignments.form.placeholder.weekStart')}
              required
              autoCapitalize="none"
            />
            <FormChips
              label={t('assignments.form.field.eventType')}
              value={form.eventType}
              options={EVENT_TYPE_OPTIONS}
              onChange={(v) => update('eventType', v)}
            />
            <FormField
              label={t('assignments.form.field.partKey')}
              value={form.partKey}
              onChangeText={(v) => update('partKey', v)}
              placeholder={t('assignments.form.placeholder.partKey')}
              required
              autoCapitalize="none"
            />
            <FormField
              label={t('assignments.form.field.partOrder')}
              value={form.partOrder?.toString() ?? '0'}
              onChangeText={(v) => update('partOrder', parseInt(v, 10) || 0)}
              keyboardType="numeric"
            />
          </>
        )}
      </FormSection>

      {isPublicTalkSpeaker && (
        <FormSection title={t('assignments.form.section.publicTalk')}>
          <PublicTalkSelector
            label={t('assignments.form.field.talk')}
            value={form.publicTalkId}
            onChange={handleTalkSelect}
          />
        </FormSection>
      )}

      <FormSection title={t('assignments.form.section.details')}>
        <FormField
          label={t('assignments.form.field.partTitleOverride')}
          value={form.partTitle ?? ''}
          onChangeText={(v) => update('partTitle', v)}
          placeholder={t('assignments.form.placeholder.partTitleOverride')}
          multiline
        />
        <FormField
          label={t('assignments.form.field.durationMinutes')}
          value={form.partDurationMin?.toString() ?? ''}
          onChangeText={(v) =>
            update('partDurationMin', v ? parseInt(v, 10) : undefined)
          }
          keyboardType="numeric"
          placeholder={t('assignments.form.placeholder.duration')}
        />
        {requiredSkillLabel && (
          <View
            style={{
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderTopWidth: 1,
              borderTopColor: '#f1f5f9',
            }}
          >
            <Text style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
              {t('assignments.form.field.requiredSkill')}
            </Text>
            <Text style={{ fontSize: 15, color: '#0f172a' }}>
              {requiredSkillLabel}
            </Text>
          </View>
        )}
      </FormSection>

      <FormSection title={isPublicTalkSpeaker ? t('assignments.form.section.speaker') : t('assignments.form.section.assignment')}>
        {isPublicTalkSpeaker ? (
          <>
            <FormChips
              label={t('assignments.form.field.speakerTypeLabel')}
              value={speakerType}
              options={SPEAKER_TYPE_OPTIONS}
              onChange={handleSpeakerTypeChange}
            />
            {speakerType === 'local' ? (
              <PublisherSelector
                label={t('assignments.form.field.publisher')}
                value={form.publisherId}
                onChange={(id) => update('publisherId', id)}
                requiredCapability={requiredCap}
                activityById={activityById}
                currentWeekStart={form.weekStartDate}
                currentEventType={form.eventType}
              />
            ) : (
              <>
                <FormField
                  label={t('assignments.form.field.speakerName')}
                  value={form.speakerName ?? ''}
                  onChangeText={(v) => update('speakerName', v || null)}
                  placeholder={t('assignments.form.placeholder.speakerName')}
                />
                <FormField
                  label={t('assignments.form.field.fromCongregation')}
                  value={form.speakerCongregation ?? ''}
                  onChangeText={(v) =>
                    update('speakerCongregation', v || null)
                  }
                  placeholder={t('assignments.form.placeholder.fromCongregation')}
                />
              </>
            )}
          </>
        ) : (
          <>
            <PublisherSelector
              label={t('assignments.form.field.publisher')}
              value={form.publisherId}
              onChange={(id) => update('publisherId', id)}
              excludeIds={
                form.assistantPublisherId ? [form.assistantPublisherId] : []
              }
              requiredCapability={requiredCap}
              activityById={activityById}
              currentWeekStart={form.weekStartDate}
              currentEventType={form.eventType}
            />
            {showAssistant && (
              <PublisherSelector
                label={t('assignments.form.field.assistant')}
                value={form.assistantPublisherId}
                onChange={(id) => update('assistantPublisherId', id)}
                excludeIds={form.publisherId ? [form.publisherId] : []}
                requiredCapability={requiredAssistantCap}
                activityById={activityById}
                currentWeekStart={form.weekStartDate}
                currentEventType={form.eventType}
              />
            )}
          </>
        )}
      </FormSection>

      <FormSection title={t('assignments.form.section.status')}>
        <FormChips
          label={t('assignments.form.field.statusLabel')}
          value={form.status ?? 'draft'}
          options={STATUS_OPTIONS}
          onChange={(v) => update('status', v)}
        />
        <FormField
          label={t('common.notes')}
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

      {!readOnly && (
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
