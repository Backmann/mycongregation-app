import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormField } from './FormField';
import { FormSection } from './FormSection';
import { CollapsibleSection } from './CollapsibleSection';
import { FormChips } from './FormChips';
import { PublisherSelector } from './PublisherSelector';
import { PublicTalkSelector } from './PublicTalkSelector';
import { EventOnDateNotice } from './EventOnDateNotice';
import {
  AssignmentStatus,
  CreateAssignmentInput,
  EventType,
  extractErrorMessage,
  localNeedsApi,
  LocalNeedsTopic,
  PublicTalk,
  PublisherActivity,
  publisherActivityApi,
} from '../lib/api';
import {
  getPartDef,
  PARTS_BY_EVENT,
  skillCapabilityFromTitle,
} from '../lib/parts';
import { usePermissions } from '../lib/permissions';
import { useTranslation } from 'react-i18next';

interface Props {
  initial?: Partial<CreateAssignmentInput>;
  onSubmit: (data: CreateAssignmentInput) => Promise<unknown>;
  /** When set, edits save instantly (pickers) or debounced (text). */
  onInstantSave?: (patch: Partial<CreateAssignmentInput>) => Promise<unknown>;
  onCancel?: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
  /** When true, weekStartDate / eventType / partKey become read-only. */
  lockIdentity?: boolean;
  /** When true the whole form is non-interactive and the actions are hidden. */
  readOnly?: boolean;
  /**
   * Circuit overseer for this week (when it is a CO-visit week), used to offer
   * the overseer as a prayer participant and to label his talks. Null otherwise.
   */
  circuitOverseer?: { displayName: string } | null;
}

// EVENT_TYPE_OPTIONS, STATUS_OPTIONS, SPEAKER_TYPE_OPTIONS moved inside component (i18n)

export function AssignmentForm({
  initial,
  onSubmit,
  onInstantSave,
  onCancel,
  isSubmitting,
  submitLabel,
  lockIdentity,
  readOnly,
  circuitOverseer,
}: Props) {
  const { t } = useTranslation();
  const autosave = !!onInstantSave;
  const [instantSaving, setInstantSaving] = useState(false);
  const [instantSavedAt, setInstantSavedAt] = useState<number | null>(null);
  const [instantError, setInstantError] = useState<string | null>(null);
  // useState initializer: a stable box that survives re-renders (no useRef
  // needed, keeps the import surface untouched).
  const debounceBox = useState(() => ({
    timer: null as ReturnType<typeof setTimeout> | null,
  }))[0];
  const instant = async (patch: Partial<CreateAssignmentInput>) => {
    if (!onInstantSave) return;
    setInstantSaving(true);
    setInstantError(null);
    try {
      await onInstantSave(patch);
      setInstantSavedAt(Date.now());
    } catch (e) {
      setInstantError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstantSaving(false);
    }
  };
  const queueInstant = (patch: Partial<CreateAssignmentInput>) => {
    if (!onInstantSave) return;
    if (debounceBox.timer) clearTimeout(debounceBox.timer);
    debounceBox.timer = setTimeout(() => void instant(patch), 1200);
  };
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

  // ---- Local Needs: insert a planned topic into a "Living as Christians" part ----
  const qc = useQueryClient();
  const { canManageLocalNeeds } = usePermissions();
  const [lnPickerOpen, setLnPickerOpen] = useState(false);
  const isLivingChristians = (form.partKey ?? '').startsWith(
    'living_christians',
  );
  const lnQuery = useQuery({
    queryKey: ['local-needs', 'planned'],
    queryFn: () => localNeedsApi.list({ onlyPlanned: true }),
    enabled: lnPickerOpen,
  });
  const markUsedMut = useMutation({
    mutationFn: (id: string) =>
      localNeedsApi.update(id, { usedWeek: form.weekStartDate || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['local-needs'] }),
  });
  const applyLocalNeed = (topic: LocalNeedsTopic) => {
    update('partTitle', topic.title);
    void instant({ partTitle: topic.title });
    if (topic.speakerPublisherId) {
      update('publisherId', topic.speakerPublisherId);
      void instant({ publisherId: topic.speakerPublisherId });
    }
    if (form.weekStartDate) markUsedMut.mutate(topic.id);
    setLnPickerOpen(false);
  };

  const activityQuery = useQuery({
    queryKey: ['publisher-activity', form.weekStartDate],
    queryFn: () =>
      publisherActivityApi.getActivity({
        weekStart: form.weekStartDate,
        weeks: 13,
      }),
    enabled: !!form.weekStartDate,
  });
  const activityById = new Map<string, PublisherActivity>();
  for (const a of activityQuery.data ?? []) activityById.set(a.publisherId, a);

  const partDef = getPartDef(form.partKey);
  const isPublicTalkSpeaker = form.partKey === 'public_talk_speaker';
  const showAssistant = !!partDef?.hasAssistant;

  // ---- Circuit-overseer visit week: CO talks + CO-led prayers ----
  const PRAYER_KEYS = [
    'midweek_opening_prayer',
    'midweek_closing_prayer',
    'weekend_opening_prayer',
    'weekend_closing_prayer',
  ];
  const isPrayer = PRAYER_KEYS.includes(form.partKey ?? '');
  const isCoTalk =
    form.partKey === 'co_service_talk' ||
    form.partKey === 'co_concluding_talk';
  const isCoWeek = !!circuitOverseer;
  const coName = circuitOverseer?.displayName?.trim() || null;
  // 'co' = the prayer is said by the circuit overseer (stored in speakerName).
  const [prayerBy, setPrayerBy] = useState<'local' | 'co'>(
    initial?.speakerName ? 'co' : 'local',
  );
  const PRAYER_BY_OPTIONS: { value: 'local' | 'co'; label: string }[] = [
    { value: 'local', label: t('assignments.form.prayerBy.local') },
    {
      value: 'co',
      label: coName
        ? t('assignments.form.prayerBy.co', { name: coName })
        : t('assignments.form.prayerBy.coShort'),
    },
  ];
  const handlePrayerByChange = (v: 'local' | 'co') => {
    setPrayerBy(v);
    if (v === 'co') {
      update('speakerName', coName);
      update('publisherId', null);
      void instant({ speakerName: coName, publisherId: null });
    } else {
      update('speakerName', null);
      void instant({ speakerName: null });
    }
  };
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

  // Equivalent keys for "last did this part" suggestions: the whole
  // apply-yourself family counts as one part; everything else is exact.
  const suggestionPartKeys = useMemo(() => {
    const key = form.partKey?.trim();
    if (!key) return [];
    if (key.startsWith('apply_yourself')) {
      const family = (PARTS_BY_EVENT.midweek ?? [])
        .map((p) => p.key)
        .filter((k) => k.startsWith('apply_yourself'));
      return family.length > 0 ? family : [key];
    }
    return [key];
  }, [form.partKey]);

  const handleTalkSelect = (talk: PublicTalk | null) => {
    // Picking derives the title from the talk; clearing wipes both the talk
    // and its derived title so the program shows the slot as empty.
    const nextTitle = talk ? `№${talk.number}. ${talk.title}` : null;
    setForm((prev) => ({
      ...prev,
      publicTalkId: talk?.id ?? null,
      partTitle: nextTitle ?? '',
    }));
    // instant-save the talk pick (publicTalkId + derived title) like the
    // publisher pickers do — otherwise the choice never leaves the form.
    void instant({
      publicTalkId: talk?.id ?? null,
      partTitle: nextTitle ?? '',
    });
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
      if (onInstantSave) {
        void instant({ speakerName: null, speakerCongregation: null });
      }
    } else {
      // Clear local publisher
      setForm((prev) => ({ ...prev, publisherId: null }));
      if (onInstantSave) {
        void instant({ publisherId: null });
      }
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
      {(form.eventType === 'midweek' || form.eventType === 'weekend') &&
      !!form.weekStartDate ? (
        <EventOnDateNotice
          weekStartDate={form.weekStartDate}
          eventType={form.eventType}
        />
      ) : null}
      {lockIdentity ? (
        <View style={styles.contextCard}>
          <Text style={styles.contextMeta}>
            {form.weekStartDate}
            {' \u00b7 '}
            {t(`assignments.eventTypeShort.${form.eventType}`, {
              defaultValue: form.eventType,
            })}
          </Text>
          {autosave && (instantSaving || instantSavedAt || instantError) ? (
            <Text
              style={[
                styles.instantStatus,
                instantError ? styles.instantStatusError : null,
              ]}
              numberOfLines={2}
            >
              {instantError
                ? instantError
                : instantSaving
                  ? t('assignments.form.saving')
                  : t('assignments.form.saved')}
            </Text>
          ) : null}
          {form.partDurationMin || requiredSkillLabel ? (
            <View style={styles.contextChips}>
              {form.partDurationMin ? (
                <View style={styles.contextChip}>
                  <Text style={styles.contextChipText}>
                    {t('assignments.form.minutesShort', {
                      count: form.partDurationMin,
                    })}
                  </Text>
                </View>
              ) : null}
              {requiredSkillLabel ? (
                <View style={styles.contextChip}>
                  <Text style={styles.contextChipText}>
                    {requiredSkillLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : (
        <FormSection title={t('assignments.form.section.identity')}>
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
        </FormSection>
      )}

      {isLivingChristians && canManageLocalNeeds && !readOnly ? (
        <Pressable
          style={styles.lnInsertBtn}
          onPress={() => setLnPickerOpen(true)}
        >
          <Ionicons name="bulb-outline" size={18} color="#0ea5e9" />
          <Text style={styles.lnInsertText}>{t('localNeeds.insertCta')}</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={lnPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setLnPickerOpen(false)}
      >
        <View style={styles.lnBackdrop}>
          <View style={styles.lnCard}>
            <View style={styles.lnHeader}>
              <Text style={styles.lnTitle}>{t('localNeeds.insertTitle')}</Text>
              <Pressable onPress={() => setLnPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            {lnQuery.isLoading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} />
            ) : (lnQuery.data ?? []).length === 0 ? (
              <Text style={styles.lnEmpty}>{t('localNeeds.insertEmpty')}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {(lnQuery.data ?? []).map((topic) => (
                  <Pressable
                    key={topic.id}
                    style={styles.lnRow}
                    onPress={() => applyLocalNeed(topic)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lnRowTitle}>{topic.title}</Text>
                      {topic.notes ? (
                        <Text style={styles.lnRowNotes} numberOfLines={2}>
                          {topic.notes}
                        </Text>
                      ) : null}
                      {topic.speaker ? (
                        <Text style={styles.lnRowSpeaker}>
                          {topic.speaker.displayName}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name="add-circle-outline"
                      size={22}
                      color="#0ea5e9"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {isCoTalk && (
        <FormSection title={t('assignments.form.section.coTalk')}>
          <PublicTalkSelector
            label={t('assignments.form.field.talk')}
            value={form.publicTalkId}
            onChange={handleTalkSelect}
          />
          <FormField
            label={t('assignments.form.field.talkThemeManual')}
            value={form.partTitle ?? ''}
            onChangeText={(v) => {
              update('partTitle', v);
              queueInstant({ partTitle: v });
            }}
            placeholder={t('assignments.form.placeholder.talkThemeManual')}
            multiline
          />
          <View style={styles.coSpeakerNote}>
            <Ionicons name="person" size={16} color="#6d28d9" />
            <Text style={styles.coSpeakerText}>
              {form.speakerName || coName
                ? t('assignments.form.coSpeaker', {
                    name: form.speakerName ?? coName ?? '',
                  })
                : t('assignments.form.coSpeakerNoName')}
            </Text>
          </View>
        </FormSection>
      )}

      {isPublicTalkSpeaker && (
        <FormSection title={t('assignments.form.section.publicTalk')}>
          <PublicTalkSelector
            label={t('assignments.form.field.talk')}
            value={form.publicTalkId}
            onChange={handleTalkSelect}
          />
          {isCoWeek && (
            <FormField
              label={t('assignments.form.field.talkThemeManual')}
              value={form.partTitle ?? ''}
              onChangeText={(v) => {
                update('partTitle', v);
                queueInstant({ partTitle: v });
              }}
              placeholder={t('assignments.form.placeholder.talkThemeManual')}
              multiline
            />
          )}
        </FormSection>
      )}

      {!isCoTalk && (
      <FormSection
        title={
          isPublicTalkSpeaker
            ? t('assignments.form.section.speaker')
            : isPrayer && isCoWeek
              ? t('assignments.form.section.prayer')
              : t('assignments.form.section.assignment')
        }
      >
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
                onChange={(id) => {
                  update('publisherId', id);
                  void instant({ publisherId: id });
                }}
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
                  onChangeText={(v) => {
                    update('speakerName', v || null);
                    // instant-save invited speaker
                    queueInstant({ speakerName: v || null });
                  }}
                  placeholder={t('assignments.form.placeholder.speakerName')}
                />
                <FormField
                  label={t('assignments.form.field.fromCongregation')}
                  value={form.speakerCongregation ?? ''}
                  onChangeText={(v) => {
                    update('speakerCongregation', v || null);
                    queueInstant({ speakerCongregation: v || null });
                  }}
                  placeholder={t('assignments.form.placeholder.fromCongregation')}
                />
              </>
            )}
          </>
        ) : isPrayer && isCoWeek ? (
          <>
            <FormChips
              label=""
              value={prayerBy}
              options={PRAYER_BY_OPTIONS}
              onChange={handlePrayerByChange}
            />
            {prayerBy === 'local' ? (
              <PublisherSelector
                label={t('assignments.form.field.publisher')}
                value={form.publisherId}
                onChange={(id) => {
                  update('publisherId', id);
                  void instant({ publisherId: id });
                }}
                requiredCapability={requiredCap}
                activityById={activityById}
                currentWeekStart={form.weekStartDate}
                currentEventType={form.eventType}
              />
            ) : null}
          </>
        ) : (
          <>
            <PublisherSelector
              label={t('assignments.form.field.publisher')}
              value={form.publisherId}
              onChange={(id) => {
                update('publisherId', id);
                void instant({ publisherId: id });
              }}
              excludeIds={
                form.assistantPublisherId ? [form.assistantPublisherId] : []
              }
              requiredCapability={requiredCap}
              suggestionPartKeys={suggestionPartKeys}
              activityById={activityById}
              currentWeekStart={form.weekStartDate}
              currentEventType={form.eventType}
            />
            {showAssistant && (
              <PublisherSelector
                label={t('assignments.form.field.assistant')}
                value={form.assistantPublisherId}
                onChange={(id) => {
                  update('assistantPublisherId', id);
                  void instant({ assistantPublisherId: id });
                }}
                excludeIds={form.publisherId ? [form.publisherId] : []}
                requiredCapability={requiredAssistantCap}
                suggestionPartKeys={suggestionPartKeys}
                suggestionRole="assistant"
                partnerOfPublisherId={form.publisherId ?? null}
                matchGenderOfPublisherId={form.publisherId ?? null}
                activityById={activityById}
                currentWeekStart={form.weekStartDate}
                currentEventType={form.eventType}
              />
            )}
          </>
        )}
      </FormSection>
      )}

      <CollapsibleSection
        title={t('assignments.form.section.details')}
        initiallyOpen={false}
      >
        <FormField
          label={t('assignments.form.field.partTitleOverride')}
          value={form.partTitle ?? ''}
          onChangeText={(v) => {
            update('partTitle', v);
            queueInstant({ partTitle: v });
          }}
          placeholder={t('assignments.form.placeholder.partTitleOverride')}
          multiline
        />
        <FormField
          label={t('assignments.form.field.durationMinutes')}
          value={form.partDurationMin?.toString() ?? ''}
          onChangeText={(v) => {
            update('partDurationMin', v ? parseInt(v, 10) : undefined);
            queueInstant({ partDurationMin: v ? parseInt(v, 10) : undefined });
          }}
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
        <FormField
          label={t('common.notes')}
          value={form.notes ?? ''}
          onChangeText={(v) => {
            update('notes', v);
            queueInstant({ notes: v });
          }}
          multiline
        />
      </CollapsibleSection>

      <FormSection title={t('assignments.form.section.status')}>
        {!autosave && (
          <FormChips
            label={t('assignments.form.field.statusLabel')}
            value={form.status ?? 'draft'}
            options={STATUS_OPTIONS}
            onChange={(v) => update('status', v)}
          />
        )}
        {autosave ? (
          <Pressable
            style={({ pressed }) => [
              styles.cancelPartLink,
              pressed && styles.cancelPartLinkPressed,
            ]}
            onPress={() => {
              const next =
                form.status === 'cancelled' ? 'draft' : 'cancelled';
              update('status', next);
              void instant({ status: next });
            }}
          >
            <Text
              style={[
                styles.cancelPartText,
                form.status === 'cancelled' && styles.restorePartText,
              ]}
            >
              {form.status === 'cancelled'
                ? t('assignments.form.restorePart')
                : t('assignments.form.cancelPart')}
            </Text>
          </Pressable>
        ) : null}
      </FormSection>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!readOnly && !autosave && (
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
  instantStatus: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 2,
  },
  instantStatusError: { color: '#dc2626' },
  cancelPartLink: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancelPartLinkPressed: { opacity: 0.6 },
  cancelPartText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  restorePartText: { color: '#0369a1' },
  contextCard: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 16,
    gap: 4,
  },
  contextMeta: {
    fontSize: 12,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  contextChips: { flexDirection: 'row', gap: 6, marginTop: 4 },
  contextChip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  contextChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
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
  lnInsertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
  },
  lnInsertText: { color: '#0369a1', fontSize: 15, fontWeight: '700' },
  coSpeakerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  coSpeakerText: { flex: 1, fontSize: 14, color: '#6d28d9', fontWeight: '600' },
  lnBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  lnCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  lnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  lnTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  lnEmpty: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginVertical: 24,
    lineHeight: 20,
  },
  lnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  lnRowTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  lnRowNotes: { fontSize: 13, color: '#64748b', marginTop: 2 },
  lnRowSpeaker: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '500',
    marginTop: 3,
  },
});
