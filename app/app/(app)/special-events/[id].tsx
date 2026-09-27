import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { RichText } from '../../../components/RichText';
import { formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import {
  circuitOverseersApi,
  CircuitOverseer,
  extractErrorMessage,
  meetingSettingsApi,
  SpecialEvent,
  specialEventsApi,
} from '../../../lib/api';
import {
  CongressSections,
  EventHeader,
  PastVisits,
  PrimaryAction,
  VisitTools,
  VisitWeek,
} from '../../../components/EventDetailSections';
import { programmeLinkOf } from '../../../lib/event-view';
import { usePermissions } from '../../../lib/permissions';
import { MeetingChangeNote } from '../../../components/MeetingChangeNote';
import { confirm } from '../../../components/ConfirmHost';
import {
  eventErrorMessage,
  eventIsOver,
  invalidateAfterEventChange,
} from '../../../lib/special-event-effects';
import {
  SpecialEventForm,
  EventFormValue,
  CIRCUIT_OVERSEER_VISIT_TYPE,
  meetingPayload,
} from '../../../components/SpecialEventForm';

function toForm(e: SpecialEvent): EventFormValue {
  return {
    title: e.title ?? '',
    type: e.type ?? '',
    date: e.date ?? '',
    endDate: e.endDate ?? '',
    time: e.time ?? '',
    timeEnd: e.timeEnd ?? '',
    address: e.address ?? '',
    mapUrl: e.mapUrl ?? '',
    programUrl: e.programUrl ?? '',
    note: e.note ?? '',
    meetingMode: e.meetingMode ?? (e.replacesMeeting ? 'none' : 'usual'),
    meetingNote: e.meetingNote ?? '',
    meetingTime: e.meetingTime ?? '',
    meetingAddress: e.meetingAddress ?? '',
    coFirstName: e.coFirstName ?? '',
    coLastName: e.coLastName ?? '',
    coWifeName: e.coWifeName ?? '',
    coRole: e.coRole ?? 'overseer',
    coAccommodationAddress: e.coAccommodationAddress ?? '',
    coMidweekDow: e.coMidweekDow ?? 2,
  };
}

export default function SpecialEventDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { canManageEvents, isAdmin, canViewCoSchedule } = usePermissions();
  const settingsQ = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
  });
  const versions = settingsQ.data?.versions;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EventFormValue | null>(null);

  const { data: event, isLoading, error } = useQuery({
    queryKey: ['special-events', id],
    queryFn: () => specialEventsApi.getById(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (event && !form) setForm(toForm(event));
  }, [event, form]);

  const updateM = useMutation({
    mutationFn: () =>
      specialEventsApi.update(id!, {
        // An emptied field is sent as null — cleared — not left out, which
        // the server reads as «unchanged».
        title: form!.title.trim(),
        type: form!.type.trim() || null,
        date: form!.date.trim(),
        endDate: form!.endDate.trim() || null,
        time: form!.time.trim() || null,
        timeEnd: form!.timeEnd.trim() || null,
        address: form!.address.trim() || null,
        mapUrl: form!.mapUrl.trim() || null,
        programUrl: form!.programUrl.trim() || null,
        note: form!.note.trim() || null,
        ...meetingPayload(form!),
        coFirstName: form!.coFirstName.trim() || null,
        coLastName: form!.coLastName.trim() || null,
        coWifeName: form!.coWifeName.trim() || null,
        coRole:
          form!.type.trim() === CIRCUIT_OVERSEER_VISIT_TYPE
            ? form!.coRole
            : undefined,
        coAccommodationAddress: form!.coAccommodationAddress.trim() || null,
        coMidweekDow:
          form!.type.trim() === CIRCUIT_OVERSEER_VISIT_TYPE
            ? form!.coMidweekDow
            : undefined,
      }),
    onSuccess: () => {
      invalidateAfterEventChange(qc);
      setEditing(false);
    },
  });

  const removeM = useMutation({
    mutationFn: () => specialEventsApi.remove(id!),
    onSuccess: () => {
      invalidateAfterEventChange(qc);
      router.back();
    },
  });

  const restoreM = useMutation({
    mutationFn: () => specialEventsApi.restore(id!),
    onSuccess: () => invalidateAfterEventChange(qc),
  });

  const isCoVisit = event?.type === CIRCUIT_OVERSEER_VISIT_TYPE;
  // The Memorial's programme lives on the week's schedule, in the place of the
  // meeting it takes — one place, not two. This is the way TO it, which is
  // what a past Memorial was missing: everything about it is kept, and there
  // was no door to go and read it.
  const isMemorial = event?.type === 'memorial';

  // Circuit overseers the manager can switch the visit to, right from the
  // event. Loaded only for a CO visit and only for managers (the picker is
  // theirs); the read-only name below is taken from the event snapshot, so
  // every member still sees who is coming without this list.
  const { data: overseers } = useQuery({
    queryKey: ['circuit-overseers'],
    queryFn: () => circuitOverseersApi.list(),
    enabled: !!isCoVisit && canManageEvents,
  });
  // Earlier visits, for the history under a visit's page.
  const { data: allEvents } = useQuery({
    queryKey: ['special-events', 'list-all', false],
    queryFn: () => specialEventsApi.list({ all: true }),
    enabled: !!isCoVisit,
  });

  const pickM = useMutation({
    mutationFn: (c: CircuitOverseer) =>
      specialEventsApi.update(id!, {
        coFirstName: c.firstName,
        coLastName: c.lastName,
        coWifeName: c.wifeName ?? null,
        coRole: c.role,
      }),
    onSuccess: () => invalidateAfterEventChange(qc),
  });

  if (isLoading) {
    return <ActivityIndicator size="large" style={{ marginTop: 32 }} />;
  }
  if (error || !event) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{extractErrorMessage(error)}</Text>
      </View>
    );
  }

  const isRemoved = !!event.deletedAt;
  // Past events are history: their days and kind stay, and only an
  // administrator removes one (without touching the programme of that week).
  const isOver = eventIsOver(event, formatDateISO(new Date()));

  /**
   * One tap used to delete — for a visit, rewriting the programme of its week
   * with no word said. Now it asks, and says what will happen.
   */
  const askRemove = async () => {
    const body = isOver
      ? t('specialEvents.remove.bodyPast')
      : isCoVisit
        ? t('specialEvents.remove.bodyVisit')
        : event.replacesMeeting ||
            event.meetingMode === 'changed' ||
            event.type === 'regional_convention' ||
            event.type === 'circuit_assembly'
          ? t('specialEvents.remove.bodyMeetings')
          : t('specialEvents.remove.body');
    const ok = await confirm({
      title: t('specialEvents.remove.title', { title: event.title }),
      body,
      confirmLabel: t('specialEvents.remove.confirm'),
      danger: true,
    });
    if (ok) removeM.mutate();
  };

  if (editing && form) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <SpecialEventForm value={form} onChange={setForm} pastLocked={isOver} />
        {updateM.isError && (
          <Text style={styles.error}>{eventErrorMessage(updateM.error, t)}</Text>
        )}
        <Pressable
          style={styles.save}
          disabled={updateM.isPending}
          onPress={() => updateM.mutate()}
        >
          {updateM.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>
              {t('specialEvents.actions.save')}
            </Text>
          )}
        </Pressable>
        <Pressable
          style={styles.cancel}
          onPress={() => {
            setForm(toForm(event));
            setEditing(false);
          }}
        >
          <Text style={styles.cancelText}>
            {t('specialEvents.actions.cancel')}
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  const today = formatDateISO(new Date());
  const isCongress =
    event.type === 'regional_convention' || event.type === 'circuit_assembly';
  const link = programmeLinkOf(
    { kind: 'event', key: event.id, date: event.date, end: event.endDate ?? event.date, event },
    versions,
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <EventHeader event={event} today={today} />
      {isCoVisit && event.coRole === 'substitute' ? (
        <Text style={styles.coMeta}>{t('circuitOverseer.roleSubstitute')}</Text>
      ) : null}
      {isRemoved ? (
        <Text style={styles.removedBadge}>{t('common.showRemoved')}</Text>
      ) : null}
      {/* Not for the Memorial: it does not leave the meeting's place empty,
          it STANDS in it, with a programme of its own on the week's schedule.
          The phrase is right for any other flagged event, where the evening
          really is otherwise free. */}
      {event.replacesMeeting && event.type !== 'memorial' ? (
        <Text style={styles.hint}>{t('specialEvents.replacesMeetingHint')}</Text>
      ) : null}
      <MeetingChangeNote event={event} />

      {/* The one thing the page is most often opened for. */}
      {isCongress && event.programUrl ? (
        <PrimaryAction
          icon="document-text-outline"
          label={t('specialEvents.page.congressProgramme')}
          onPress={() => Linking.openURL(event.programUrl!)}
        />
      ) : link && !isMemorial ? (
        <PrimaryAction
          icon="calendar-outline"
          label={t(isCoVisit ? 'specialEvents.page.weekInProgramme' : 'specialEvents.page.meetingInProgramme')}
          onPress={() =>
            router.push(`/schedule?week=${link.week}&meeting=${link.meeting}` as never)
          }
        />
      ) : null}

      {isCoVisit && !isRemoved ? <VisitWeek event={event} versions={versions} /> : null}
      {isCoVisit ? <VisitTools canView={canViewCoSchedule} /> : null}
      {isCongress ? <CongressSections event={event} versions={versions} /> : null}

      {isMemorial ? (
        <Pressable
          style={styles.weekLink}
          onPress={() =>
            router.push(
              `/schedule?week=${formatDateISO(
                startOfWeekMonday(new Date(`${event!.date}T00:00:00`)),
              )}&meeting=memorial` as any,
            )
          }
        >
          <Ionicons name="calendar-outline" size={18} color="#0e7490" />
          <View style={{ flex: 1 }}>
            <Text style={styles.weekLinkTitle}>
              {t('memorial.openInSchedule')}
            </Text>
            <Text style={styles.weekLinkHint}>
              {t('memorial.openInScheduleHint')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </Pressable>
      ) : null}

      {/* The keeper's part of a visit: where they stay, who comes. */}
      {isCoVisit &&
      canManageEvents &&
      !isRemoved &&
      (!!event.coAccommodationAddress || (overseers?.length ?? 0) > 0) ? (
        <View style={styles.coBlock}>
          {canManageEvents && event.coAccommodationAddress ? (
            <Text style={styles.coMeta}>
              {t('circuitOverseer.accommodationAddress')}:{' '}
              {event.coAccommodationAddress}
            </Text>
          ) : null}

          {canManageEvents && !isRemoved && overseers && overseers.length > 0 ? (
            <View style={styles.pickerWrap}>
              <Text style={styles.pickerLabel}>
                {t('circuitOverseer.pickLabel')}
              </Text>
              <View style={styles.chips}>
                {overseers.map((c) => {
                  const active =
                    c.firstName === event.coFirstName &&
                    c.lastName === event.coLastName;
                  return (
                    <Pressable
                      key={c.id}
                      disabled={pickM.isPending}
                      onPress={() => pickM.mutate(c)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {c.firstName} {c.lastName}
                        {c.role === 'substitute'
                          ? ` · ${t('circuitOverseer.roleSubstitute')}`
                          : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {pickM.isError ? (
                <Text style={styles.error}>
                  {extractErrorMessage(pickM.error)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {event.address && !isCongress ? (
        <InfoRow label={t('specialEvents.fields.address')} value={event.address} />
      ) : null}
      {event.note ? (
        <InfoRow label={t('specialEvents.fields.note')} value={event.note} />
      ) : null}

      {event.mapUrl && !isCongress ? (
        <LinkButton
          label={t('specialEvents.actions.openMap')}
          url={event.mapUrl}
        />
      ) : null}
      {isCoVisit ? <PastVisits events={allEvents} current={event} today={today} /> : null}
      {event.programUrl && !isCongress ? (
        <LinkButton
          label={t('specialEvents.actions.openProgram')}
          url={event.programUrl}
        />
      ) : null}

      {canManageEvents && (
        <View style={styles.actions}>
          {isRemoved ? (
            <>
              <Pressable
                style={styles.save}
                disabled={restoreM.isPending}
                onPress={() => restoreM.mutate()}
              >
                <Text style={styles.saveText}>
                  {t('specialEvents.actions.restore')}
                </Text>
              </Pressable>
              {restoreM.isError ? (
                <Text style={styles.error}>
                  {eventErrorMessage(restoreM.error, t)}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Pressable
                style={styles.save}
                onPress={() => {
                  setForm(toForm(event));
                  setEditing(true);
                }}
              >
                <Text style={styles.saveText}>
                  {t('specialEvents.actions.edit')}
                </Text>
              </Pressable>
              {!isOver || isAdmin ? (
                <Pressable
                  style={styles.delete}
                  disabled={removeM.isPending}
                  onPress={askRemove}
                >
                  <Text style={styles.deleteText}>
                    {t('specialEvents.actions.delete')}
                  </Text>
                </Pressable>
              ) : null}
              {removeM.isError ? (
                <Text style={styles.error}>
                  {eventErrorMessage(removeM.error, t)}
                </Text>
              ) : null}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <RichText text={value} style={styles.infoValue} />
    </View>
  );
}

function LinkButton({ label, url }: { label: string; url: string }) {
  return (
    <Pressable style={styles.link} onPress={() => Linking.openURL(url)}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f8fafc' },
  error: { color: '#b91c1c' },
  h1: { fontSize: 22, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  date: { fontSize: 15, color: '#0369a1', marginTop: 4 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    color: '#0369a1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    marginTop: 8,
  },
  removedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    marginTop: 8,
  },
  hint: { fontSize: 13, color: '#b45309', marginTop: 8 },
  infoRow: { marginTop: 14 },
  infoLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#475569' },
  infoValue: { fontSize: 16, color: '#0f172a', marginTop: 2 },
  link: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkText: { color: '#0ea5e9', fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  actions: { marginTop: 24, gap: 10 },
  save: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  cancel: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { color: '#64748b', fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  delete: {
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: { color: '#ef4444', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  weekLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  weekLinkTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0e7490',
  },
  weekLinkHint: {
    fontSize: 12,
    fontFamily: 'Manrope_500Medium',
    color: '#0891b2',
    marginTop: 2,
  },
  coBlock: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  coMeta: { fontSize: 14, color: '#475569', marginTop: 6 },
  pickerWrap: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipText: { fontSize: 13, color: '#475569', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  chipTextActive: { color: '#fff' },
});
