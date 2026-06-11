import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Assignment,
  assignmentsApi,
  CreateAssignmentInput,
  EventType,
  extractErrorMessage,
  Publisher,
  publishersApi,
  serviceGroupsApi,
  meetingSettingsApi,
  dutiesApi,
  fieldServiceApi,
  cleaningApi,
  publisherActivityApi,
  PublisherActivity,
  specialEventsApi,
} from '../../../lib/api';
import {
  addDays,
  addWeeks,
  formatDateISO,
  startOfWeekMonday,
} from '../../../lib/dates';
import { useSongsMap, enrichSongRef } from '../../../lib/songs';
import {
  getEventTypeLabel,
  getPartLabel,
  PARTS_BY_EVENT,
  buildPartNumbers,
  resolveSubsection,
  Subsection,
  SUBSECTIONS,
} from '../../../lib/parts';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { WeekNavigator } from '../../../components/WeekNavigator';
import { MeetingHeader } from '../../../components/MeetingHeader';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { DutiesSection } from '../../../components/DutiesSection';
import { FieldServiceSection } from '../../../components/FieldServiceSection';
import { CleaningSection } from '../../../components/CleaningSection';
import { usePermissions } from '../../../lib/permissions';
import { SpecialEventsWeekBanner } from '../../../components/SpecialEventsWeekBanner';
import { ReplacedMeetingNotice } from '../../../components/ReplacedMeetingNotice';
import { CollapsibleMeetingBlock } from '../../../components/CollapsibleMeetingBlock';
import { HospitalityZone } from '../../../components/HospitalityZone';

const EVENT_TYPE_ORDER: EventType[] = [
  'midweek',
  'weekend',
  'cleaning',
  'av_duty',
  'public_witnessing',
];

export default function ScheduleIndexScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const [publishingType, setPublishingType] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeekMonday(new Date()),
  );

  const weekStartISO = formatDateISO(weekStart);
  const nextWeekISO = formatDateISO(addWeeks(weekStart, 1));

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', weekStartISO],
    queryFn: () =>
      assignmentsApi.list({
        weekStart: weekStartISO,
        weekEnd: nextWeekISO,
      }),
  });

  const specialEventsQuery = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
  });
  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all-for-schedule'],
    queryFn: () => publishersApi.list({ limit: 200 }),
  });
  const groupsQuery = useQuery({
    queryKey: ['service-groups', 'names'],
    queryFn: () => serviceGroupsApi.list({}),
  });
  const meetingSettingsQuery = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
  });
  const meetingVersion = effectiveVersionFor(
    meetingSettingsQuery.data?.versions,
    weekStartISO,
  );
  const {
    canEditDuties,
    canEditFieldServiceMeetings,
    canEditCleaning,
    canEditMidweekSchedule,
    canEditWeekendSchedule,
  } = usePermissions();
  const dutiesQuery = useQuery({
    queryKey: ['duties', weekStartISO],
    queryFn: () =>
      dutiesApi.list({ weekStart: weekStartISO, weekEnd: nextWeekISO }),
  });
  const duties = dutiesQuery.data ?? [];
  const generateDutiesMutation = useMutation({
    mutationFn: (eventType: EventType) =>
      dutiesApi.generate({ weekStartDate: weekStartISO, eventType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['duties', weekStartISO] });
    },
  });
  const activityQuery = useQuery({
    queryKey: ['publisher-activity', weekStartISO],
    queryFn: () =>
      publisherActivityApi.getActivity({ weekStart: weekStartISO, weeks: 4 }),
  });
  const activityById = new Map<string, PublisherActivity>();
  for (const a of activityQuery.data ?? []) activityById.set(a.publisherId, a);

  const invalidateDuties = () => {
    queryClient.invalidateQueries({ queryKey: ['duties', weekStartISO] });
    queryClient.invalidateQueries({
      queryKey: ['publisher-activity', weekStartISO],
    });
  };
  const showDutyWarnings = (warnings: string[]) => {
    if (warnings.length === 0) return;
    const body = warnings.map((w) => t(`duties.warnings.${w}`)).join('\n');
    if (Platform.OS === 'web') {
      window.alert(`${t('duties.warningsTitle')}\n\n${body}`);
    } else {
      Alert.alert(t('duties.warningsTitle'), body);
    }
  };
  const assignDutyMutation = useMutation({
    mutationFn: (vars: { id: string; publisherId: string | null }) =>
      dutiesApi.assign(vars.id, { publisherId: vars.publisherId }),
    onSuccess: (res) => {
      invalidateDuties();
      showDutyWarnings(res.warnings);
    },
  });
  const createCustomDutyMutation = useMutation({
    mutationFn: (vars: { eventType: EventType; customLabel: string }) =>
      dutiesApi.createCustom({
        weekStartDate: weekStartISO,
        eventType: vars.eventType,
        customLabel: vars.customLabel,
      }),
    onSuccess: () => invalidateDuties(),
  });
  const removeDutyMutation = useMutation({
    mutationFn: (id: string) => dutiesApi.removeDuty(id),
    onSuccess: () => invalidateDuties(),
  });

  const fieldServiceQuery = useQuery({
    queryKey: ['field-service', weekStartISO],
    queryFn: () => fieldServiceApi.list({ weekStart: weekStartISO }),
  });
  const fieldServiceMeetings = fieldServiceQuery.data ?? [];
  const invalidateFieldService = () =>
    queryClient.invalidateQueries({
      queryKey: ['field-service', weekStartISO],
    });
  const createFieldServiceMutation = useMutation({
    mutationFn: (input: Parameters<typeof fieldServiceApi.create>[0]) =>
      fieldServiceApi.create(input),
    onSuccess: () => invalidateFieldService(),
  });
  const updateFieldServiceMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      input: Parameters<typeof fieldServiceApi.update>[1];
    }) => fieldServiceApi.update(vars.id, vars.input),
    onSuccess: () => invalidateFieldService(),
  });
  const removeFieldServiceMutation = useMutation({
    mutationFn: (id: string) => fieldServiceApi.remove(id),
    onSuccess: () => invalidateFieldService(),
  });

  const cleaningQuery = useQuery({
    queryKey: ['cleaning', weekStartISO],
    queryFn: () => cleaningApi.getWeek(weekStartISO),
  });
  const cleaningWeek = cleaningQuery.data ?? {
    assignments: [],
    suggestedAfterMeetingGroupId: null,
  };
  const invalidateCleaning = () =>
    queryClient.invalidateQueries({ queryKey: ['cleaning', weekStartISO] });
  const setCleaningSlotMutation = useMutation({
    mutationFn: (vars: {
      slotType: Parameters<typeof cleaningApi.setSlot>[0]['slotType'];
      serviceGroupId: string | null;
    }) =>
      cleaningApi.setSlot({
        weekStartDate: weekStartISO,
        slotType: vars.slotType,
        serviceGroupId: vars.serviceGroupId,
      }),
    onSuccess: () => invalidateCleaning(),
  });
  const clearCleaningSlotMutation = useMutation({
    mutationFn: (slotType: Parameters<typeof cleaningApi.clearSlot>[1]) =>
      cleaningApi.clearSlot(weekStartISO, slotType),
    onSuccess: () => invalidateCleaning(),
  });

  const createWeekMutation = useMutation({
    mutationFn: (eventType: EventType) => {
      const parts = PARTS_BY_EVENT[eventType] ?? [];
      const inputs: CreateAssignmentInput[] = parts.map((p) => ({
        weekStartDate: weekStartISO,
        eventType,
        partKey: p.key,
        partOrder: p.defaultOrder,
        partDurationMin: p.defaultDurationMin || undefined,
        status: 'draft',
      }));
      return assignmentsApi.bulkCreate(inputs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', weekStartISO] });
    },
  });

  const weekEvents = (specialEventsQuery.data ?? []).filter(
    (e) => e.date < nextWeekISO && (e.endDate ?? e.date) >= weekStartISO,
  );
  const assignments = assignmentsQuery.data?.data ?? [];
  const publishersById = new Map<string, Publisher>(
    (publishersQuery.data?.data ?? []).map((p) => [p.id, p]),
  );
  const groupNameById = new Map<string, string>(
    (groupsQuery.data?.data ?? []).map((g) => [g.id, g.name]),
  );

  const grouped = new Map<EventType, Assignment[]>();
  for (const a of assignments) {
    const arr = grouped.get(a.eventType) ?? [];
    arr.push(a);
    grouped.set(a.eventType, arr);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.partOrder - b.partOrder);
  }

  // v2: a replacesMeeting event covering a meeting's date replaces its section.
  const replacedBy = (kind: 'midweek' | 'weekend') => {
    if (!meetingVersion) return undefined;
    const dow =
      kind === 'midweek' ? meetingVersion.midweekDow : meetingVersion.weekendDow;
    if (!dow) return undefined;
    const dateISO = formatDateISO(addDays(weekStart, dow - 1));
    return weekEvents.find(
      (e) =>
        e.replacesMeeting &&
        e.date <= dateISO &&
        (e.endDate ?? e.date) >= dateISO,
    );
  };
  const midweekReplacedBy = replacedBy('midweek');
  const weekendReplacedBy = replacedBy('weekend');
  const assignedCount = (list: Assignment[]) =>
    list.filter((x) => x.publisherId && x.status !== 'cancelled').length;
  const meetingDateLabel = (kind: 'midweek' | 'weekend'): string | null => {
    if (!meetingVersion) return null;
    const dow =
      kind === 'midweek' ? meetingVersion.midweekDow : meetingVersion.weekendDow;
    if (!dow) return null;
    return addDays(weekStart, dow - 1).toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };
  const draftCount = (list: Assignment[]) =>
    list.filter((x) => String(x.status) === 'draft').length;
  const publishMeetingNow = async (
    eventType: 'midweek' | 'weekend',
    weekStartDate: string,
  ) => {
    setPublishingType(eventType);
    try {
      await assignmentsApi.publish({ weekStartDate, eventType });
      await queryClient.invalidateQueries({ queryKey: ['assignments'] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(msg);
      }
    } finally {
      setPublishingType(null);
    }
  };

  const hospitalityMutation = useMutation({
    mutationFn: (v: {
      existing: Assignment | null;
      publisherId: string | null;
      weekStartDate: string;
    }) =>
      v.existing
        ? assignmentsApi.update(v.existing.id, { publisherId: v.publisherId })
        : assignmentsApi.create({
            weekStartDate: v.weekStartDate,
            eventType: 'weekend',
            partKey: 'weekend_hospitality',
            partOrder: 99,
            partTitle: 'Гостеприимство',
            publisherId: v.publisherId,
            status: 'draft',
          }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['assignments'] }),
  });

  const hasMidweek = (grouped.get('midweek')?.length ?? 0) > 0;
  const hasWeekend = (grouped.get('weekend')?.length ?? 0) > 0;
  const isEmpty = assignments.length === 0;

  return (
    <View style={styles.container}>
      <WeekNavigator weekStart={weekStart} onChange={setWeekStart} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={assignmentsQuery.isRefetching}
            onRefresh={() => assignmentsQuery.refetch()}
          />
        }
      >
        {assignmentsQuery.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractErrorMessage(assignmentsQuery.error)}
            </Text>
          </View>
        )}

        {assignmentsQuery.isLoading ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : (
          <>
            <SpecialEventsWeekBanner events={weekEvents} />
            {EVENT_TYPE_ORDER.map((eventType) => {
              const items = grouped.get(eventType) ?? [];
              if (items.length === 0) return null;
              const numbers = buildPartNumbers(items);
              if (eventType === 'midweek' && midweekReplacedBy) {
                return (
                  <ReplacedMeetingNotice
                    key="midweek"
                    event={midweekReplacedBy}
                    eventType="midweek"
                    hiddenCount={items.length}
                  />
                );
              }
              if (eventType === 'weekend' && weekendReplacedBy) {
                return (
                  <ReplacedMeetingNotice
                    key="weekend"
                    event={weekendReplacedBy}
                    eventType="weekend"
                    hiddenCount={items.length}
                  />
                );
              }
              if (eventType === 'midweek') {
                return (
                  <CollapsibleMeetingBlock
                    key="midweek"
                    title={getEventTypeLabel('midweek')}
                    meta={meetingDateLabel('midweek')}
                    assigned={assignedCount(items)}
                    total={items.length}
                    actionLabel={
                      perms.canEditMidweekSchedule && draftCount(items) > 0
                        ? t('schedule.publish.button')
                        : undefined
                    }
                    actionBusy={publishingType === 'midweek'}
                    onAction={() =>
                      void publishMeetingNow('midweek', items[0].weekStartDate)
                    }
                  >
                    <MeetingHeader
                      weekStart={weekStart}
                      version={meetingVersion}
                      eventType="midweek"
                    />
                    <MidweekSections
                      items={items}
                      numbers={numbers}
                      publishersById={publishersById}
                      groupNameById={groupNameById}
                    />
                    <DutiesSection
                      only="midweek"
                      duties={duties}
                      publishersById={publishersById}
                      canEdit={canEditDuties}
                      onGenerate={(eventType) =>
                        generateDutiesMutation.mutate(eventType)
                      }
                      onAssign={(id, publisherId) =>
                        assignDutyMutation.mutate({ id, publisherId })
                      }
                      onAddCustom={(eventType, customLabel) =>
                        createCustomDutyMutation.mutate({ eventType, customLabel })
                      }
                      onRemoveDuty={(id) => removeDutyMutation.mutate(id)}
                      activityById={activityById}
                      weekStartISO={weekStartISO}
                    />
                  </CollapsibleMeetingBlock>
                );
              }
              if (eventType === 'weekend') {
                const hospitality =
                  items.find((a) => a.partKey === 'weekend_hospitality') ??
                  null;
                const programItems = items.filter(
                  (a) => a.partKey !== 'weekend_hospitality',
                );
                return (
                  <CollapsibleMeetingBlock
                    key="weekend"
                    title={getEventTypeLabel('weekend')}
                    meta={meetingDateLabel('weekend')}
                    assigned={assignedCount(programItems)}
                    total={programItems.length}
                    actionLabel={
                      perms.canEditWeekendSchedule && draftCount(items) > 0
                        ? t('schedule.publish.button')
                        : undefined
                    }
                    actionBusy={publishingType === 'weekend'}
                    onAction={() =>
                      void publishMeetingNow('weekend', items[0].weekStartDate)
                    }
                  >
                    <MeetingHeader
                      weekStart={weekStart}
                      version={meetingVersion}
                      eventType="weekend"
                    />
                    <View style={styles.sectionBody}>
                      {programItems.map((a) => (
                        <AssignmentRow
                          key={a.id}
                          assignment={a}
                          publisher={
                            a.publisherId
                              ? publishersById.get(a.publisherId) ?? null
                              : null
                          }
                          assistant={
                            a.assistantPublisherId
                              ? publishersById.get(a.assistantPublisherId) ??
                                null
                              : null
                          }
                          displayNumber={numbers.get(a.id) ?? null}
                          groupNameById={groupNameById}
                        />
                      ))}
                    </View>
                    <DutiesSection
                      only="weekend"
                      duties={duties}
                      publishersById={publishersById}
                      canEdit={canEditDuties}
                      onGenerate={(eventType) =>
                        generateDutiesMutation.mutate(eventType)
                      }
                      onAssign={(id, publisherId) =>
                        assignDutyMutation.mutate({ id, publisherId })
                      }
                      onAddCustom={(eventType, customLabel) =>
                        createCustomDutyMutation.mutate({ eventType, customLabel })
                      }
                      onRemoveDuty={(id) => removeDutyMutation.mutate(id)}
                      activityById={activityById}
                      weekStartISO={weekStartISO}
                    />
                    <HospitalityZone
                      hospitality={hospitality}
                      canEdit={perms.canEditWeekendSchedule}
                      publishersById={publishersById}
                      activityById={activityById}
                      weekStartISO={weekStartISO}
                      onChange={(publisherId) =>
                        hospitalityMutation.mutate({
                          existing: hospitality,
                          publisherId,
                          weekStartDate: items[0].weekStartDate,
                        })
                      }
                    />
                  </CollapsibleMeetingBlock>
                );
              }
              return (
                <View key={eventType} style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    {getEventTypeLabel(eventType)} ({items.length})
                  </Text>
                  <View style={styles.sectionBody}>
                    {items.map((a) => (
                      <AssignmentRow
                        key={a.id}
                        assignment={a}
                        publisher={
                          a.publisherId
                            ? publishersById.get(a.publisherId) ?? null
                            : null
                        }
                        assistant={
                          a.assistantPublisherId
                            ? publishersById.get(a.assistantPublisherId) ?? null
                            : null
                        }
                        displayNumber={numbers.get(a.id) ?? null}
                        groupNameById={groupNameById}
                      />
                    ))}
                  </View>
                </View>
              );
            })}


            <FieldServiceSection
              meetings={fieldServiceMeetings}
              publishersById={publishersById}
              canEdit={canEditFieldServiceMeetings}
              weekStartISO={weekStartISO}
              onCreate={(input) => createFieldServiceMutation.mutate(input)}
              onUpdate={(id, input) =>
                updateFieldServiceMutation.mutate({ id, input })
              }
              onRemove={(id) => removeFieldServiceMutation.mutate(id)}
              pending={
                createFieldServiceMutation.isPending ||
                updateFieldServiceMutation.isPending ||
                removeFieldServiceMutation.isPending
              }
            />

            <CleaningSection
              assignments={cleaningWeek.assignments}
              publishersById={publishersById}
              canEdit={canEditCleaning}
              pending={
                setCleaningSlotMutation.isPending ||
                clearCleaningSlotMutation.isPending
              }
              onSetSlot={(slotType, serviceGroupId) =>
                setCleaningSlotMutation.mutate({ slotType, serviceGroupId })
              }
              onClearSlot={(slotType) =>
                clearCleaningSlotMutation.mutate(slotType)
              }
            />

            {isEmpty && (
              <Text style={styles.emptyHint}>
                {t('schedule.noAssignments')}
              </Text>
            )}

            {/* Create buttons — show one per missing event type that has a template */}
            <View style={styles.createButtons}>
              {!hasMidweek && canEditMidweekSchedule && (
                <CreateButton
                  label={t('schedule.createEmptyMidweek', { count: PARTS_BY_EVENT.midweek.length })}
                  primary={isEmpty}
                  onPress={() => createWeekMutation.mutate('midweek')}
                  disabled={createWeekMutation.isPending}
                />
              )}
              {!hasWeekend && canEditWeekendSchedule && (
                <CreateButton
                  label={t('schedule.createEmptyWeekend', { count: PARTS_BY_EVENT.weekend.length })}
                  primary={isEmpty && !PARTS_BY_EVENT.midweek.length}
                  onPress={() => createWeekMutation.mutate('weekend')}
                  disabled={createWeekMutation.isPending}
                />
              )}
            </View>

            {createWeekMutation.error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>
                  {extractErrorMessage(createWeekMutation.error)}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const SUBSECTION_ORDER: Subsection[] = [
  'opening',
  'treasures',
  'apply_yourself',
  'christian_life',
];

function MidweekSections({
  items,
  numbers,
  publishersById,
  groupNameById,
}: {
  items: Assignment[];
  numbers: Map<string, number | null>;
  publishersById: Map<string, Publisher>;
  groupNameById: Map<string, string>;
}) {
  const { t } = useTranslation();

  const bySubsection = new Map<Subsection, Assignment[]>();
  for (const a of items) {
    const sub = resolveSubsection(a.partKey);
    const arr = bySubsection.get(sub) ?? [];
    arr.push(a);
    bySubsection.set(sub, arr);
  }

  return (
    <>
      {SUBSECTION_ORDER.map((sub) => {
        const arr = bySubsection.get(sub) ?? [];
        if (arr.length === 0) return null;
        const meta = SUBSECTIONS[sub];
        return (
          <View key={sub} style={styles.section}>
            <View style={[styles.subsectionBanner, { backgroundColor: meta.color }]}>
              <Ionicons name={meta.icon as any} size={16} color="#fff" />
              <Text style={styles.subsectionBannerText}>{t(meta.i18nKey)}</Text>
            </View>
            <View style={styles.sectionBody}>
              {arr.map((a) => (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  publisher={
                    a.publisherId
                      ? publishersById.get(a.publisherId) ?? null
                      : null
                  }
                  assistant={
                    a.assistantPublisherId
                      ? publishersById.get(a.assistantPublisherId) ?? null
                      : null
                  }
                  displayNumber={numbers.get(a.id) ?? null}
                  accentColor={meta.color}
                  groupNameById={groupNameById}
                />
              ))}
            </View>
          </View>
        );
      })}
    </>
  );
}

function CreateButton({
  label,
  primary,
  onPress,
  disabled,
}: {
  label: string;
  primary: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.createButton,
        primary ? styles.createPrimary : styles.createSecondary,
        disabled && { opacity: 0.6 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.createButtonText,
          primary ? styles.createPrimaryText : styles.createSecondaryText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}


const PRAYER_PARTS = new Set<string>([
  'midweek_opening_prayer',
  'midweek_closing_prayer',
  'weekend_opening_prayer',
  'weekend_closing_prayer',
]);

/** Extracts just the song reference (e.g. "Песня 44") from a prayer title. */
function songFromTitle(title: string): string | null {
  const m = title.match(/(?:Песня|Song|Lied)\s*№?\s*\d+/i);
  return m ? m[0] : null;
}

/**
 * Bold label + subtitle for an assignment. For parts whose imported title is
 * "<MWB part name>: <description>", show the real MWB name as the bold label and
 * the rest as the subtitle; otherwise use the generic part label + full title.
 */
function partDisplay(
  partKey: string,
  partTitle: string | null | undefined,
): { label: string; subtitle: string | null } {
  if (
    partKey === 'mid_song' ||
    partKey === 'weekend_song' ||
    partKey === 'weekend_opening_song'
  ) {
    return { label: partTitle || 'Песня', subtitle: null };
  }
  if (PRAYER_PARTS.has(partKey)) {
    return {
      label: getPartLabel(partKey),
      subtitle: partTitle ? songFromTitle(partTitle) : null,
    };
  }
  // EPUB/override title is always the heading when present; the generic
  // part label is only a fallback for untitled parts.
  if (partTitle) {
    const idx = partTitle.indexOf(': ');
    if (idx > 0) {
      return {
        label: partTitle.slice(0, idx),
        subtitle: partTitle.slice(idx + 2).trim() || null,
      };
    }
    return { label: partTitle, subtitle: null };
  }
  return { label: getPartLabel(partKey), subtitle: null };
}

function AssignmentRow({
  assignment,
  publisher,
  assistant,
  accentColor,
  displayNumber,
  groupNameById,
}: {
  assignment: Assignment;
  publisher: Publisher | null;
  assistant: Publisher | null;
  accentColor?: string;
  displayNumber?: number | null;
  groupNameById: Map<string, string>;
}) {
  const { t } = useTranslation();
  const { label: rawPartLabel, subtitle: rawSubtitle } = partDisplay(
    assignment.partKey,
    assignment.partTitle,
  );
  const songTitles = useSongsMap();
  const partLabel = enrichSongRef(rawPartLabel, songTitles) ?? rawPartLabel;
  const subtitle = enrichSongRef(rawSubtitle, songTitles);

  // Resolve who is assigned: local publisher OR invited speaker fallback
  const hasInvitedSpeaker = !publisher && !!assignment.speakerName;

  // Songs (e.g. the middle song) are informational — no assignment, no editing.
  const isSong =
    assignment.partKey === 'mid_song' ||
    assignment.partKey === 'weekend_song' ||
    assignment.partKey === 'weekend_opening_song';
  if (isSong) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          accentColor
            ? { borderLeftWidth: 3, borderLeftColor: accentColor }
            : null,
          pressed && styles.rowPressed,
        ]}
        onPress={() => router.push(`/schedule/${assignment.id}` as any)}
      >
        <View style={[styles.orderBadge, styles.orderBadgeInfo]}>
          <Text style={styles.orderText}>·</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.partLabel}>{partLabel}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        accentColor ? { borderLeftWidth: 3, borderLeftColor: accentColor } : null,
        pressed && styles.rowPressed,
      ]}
      onPress={() => router.push(`/schedule/${assignment.id}` as any)}
    >
      <View
        style={[
          styles.orderBadge,
          displayNumber == null && styles.orderBadgeInfo,
        ]}
      >
        <Text style={styles.orderText}>{displayNumber ?? '·'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.partLabel}>{partLabel}</Text>
        {subtitle && (
          <Text style={styles.partTitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
        <View style={styles.assigneeRow}>
          {publisher ? (
            <Text style={styles.assignee}>{publisher.displayName}</Text>
          ) : hasInvitedSpeaker ? (
            <Text style={styles.invitedSpeaker}>
              ✈ {assignment.speakerName}
              {assignment.speakerCongregation
                ? ` (${assignment.speakerCongregation})`
                : ''}
            </Text>
          ) : (
            <Text style={styles.unassigned}>{t('schedule.unassigned')}</Text>
          )}
          {assistant && (
            <Text style={styles.assistant}> + {assistant.displayName}</Text>
          )}
        </View>
        {publisher?.serviceGroupId &&
        groupNameById.get(publisher.serviceGroupId) ? (
          <View style={styles.assigneeGroupRow}>
            <Ionicons name="people-outline" size={11} color="#94a3b8" />
            <Text style={styles.assigneeGroup}>
              {groupNameById.get(publisher.serviceGroupId)}
            </Text>
          </View>
        ) : null}
        {assignment.status !== 'draft' && (
          <View
            style={[
              styles.statusBadge,
              assignment.status === 'published' && styles.statusPublished,
              assignment.status === 'cancelled' && styles.statusCancelled,
            ]}
          >
            <Text style={styles.statusBadgeText}>
              {t(`assignments.status.${assignment.status}`).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  emptyHint: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 32,
    marginBottom: 8,
  },
  createButtons: { padding: 16, gap: 8 },
  createButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  createPrimary: { backgroundColor: '#0ea5e9' },
  createSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0ea5e9',
  },
  createButtonText: { fontSize: 14, fontWeight: '600' },
  createPrimaryText: { color: '#fff' },
  assigneeGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  assigneeGroup: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  createSecondaryText: { color: '#0ea5e9' },

  section: { marginTop: 16 },
  subsectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  subsectionBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  sectionBody: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'flex-start',
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  orderBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  orderText: { color: '#0369a1', fontWeight: '700', fontSize: 13 },
  orderBadgeInfo: { backgroundColor: '#f1f5f9' },
  partLabel: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  partTitle: {
    fontSize: 13,
    color: '#475569',
    marginTop: 2,
    fontStyle: 'italic',
  },
  assigneeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  assignee: { fontSize: 14, color: '#0f172a' },
  invitedSpeaker: { fontSize: 14, color: '#7c3aed', fontWeight: '500' },
  assistant: { fontSize: 13, color: '#64748b' },
  unassigned: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  statusPublished: { backgroundColor: '#dcfce7' },
  statusCancelled: { backgroundColor: '#fee2e2' },
  chevron: { color: '#cbd5e1', fontSize: 24, marginLeft: 8 },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14 },
});
