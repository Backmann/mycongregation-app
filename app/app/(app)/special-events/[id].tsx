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
import dayjs from 'dayjs';
import {
  extractErrorMessage,
  SpecialEvent,
  specialEventsApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import {
  SpecialEventForm,
  EventFormValue,
} from '../../../components/SpecialEventForm';

function toForm(e: SpecialEvent): EventFormValue {
  return {
    title: e.title ?? '',
    type: e.type ?? '',
    date: e.date ?? '',
    endDate: e.endDate ?? '',
    time: e.time ?? '',
    address: e.address ?? '',
    mapUrl: e.mapUrl ?? '',
    programUrl: e.programUrl ?? '',
    note: e.note ?? '',
    replacesMeeting: !!e.replacesMeeting,
    coFirstName: e.coFirstName ?? '',
    coLastName: e.coLastName ?? '',
    coWifeName: e.coWifeName ?? '',
  };
}

export default function SpecialEventDetailScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { canManageEvents } = usePermissions();
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
        title: form!.title.trim(),
        type: form!.type.trim() || undefined,
        date: form!.date.trim(),
        endDate: form!.endDate.trim() || undefined,
        time: form!.time.trim() || undefined,
        address: form!.address.trim() || undefined,
        mapUrl: form!.mapUrl.trim() || undefined,
        programUrl: form!.programUrl.trim() || undefined,
        note: form!.note.trim() || undefined,
        replacesMeeting: form!.replacesMeeting,
        coFirstName: form!.coFirstName.trim() || undefined,
        coLastName: form!.coLastName.trim() || undefined,
        coWifeName: form!.coWifeName.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['special-events'] });
      setEditing(false);
    },
  });

  const removeM = useMutation({
    mutationFn: () => specialEventsApi.remove(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['special-events'] });
      router.back();
    },
  });

  const restoreM = useMutation({
    mutationFn: () => specialEventsApi.restore(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['special-events'] });
    },
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

  if (editing && form) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <SpecialEventForm value={form} onChange={setForm} />
        {updateM.isError && (
          <Text style={styles.error}>{extractErrorMessage(updateM.error)}</Text>
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

  const startLabel = dayjs(`${event.date}T00:00:00`)
    .toDate()
    .toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const endLabel = event.endDate
    ? dayjs(`${event.endDate}T00:00:00`)
        .toDate()
        .toLocaleDateString(i18n.language, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
    : null;
  const typeLabel = event.type
    ? t(`specialEvents.types.${event.type}`, event.type)
    : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>{event.title}</Text>
      <Text style={styles.date}>
        {startLabel}
        {endLabel ? ` – ${endLabel}` : ''}
        {event.time ? ` · ${event.time}` : ''}
      </Text>
      {typeLabel ? <Text style={styles.badge}>{typeLabel}</Text> : null}
      {isRemoved ? (
        <Text style={styles.removedBadge}>{t('common.showRemoved')}</Text>
      ) : null}
      {event.replacesMeeting ? (
        <Text style={styles.hint}>{t('specialEvents.replacesMeetingHint')}</Text>
      ) : null}

      {event.address ? (
        <InfoRow label={t('specialEvents.fields.address')} value={event.address} />
      ) : null}
      {event.note ? (
        <InfoRow label={t('specialEvents.fields.note')} value={event.note} />
      ) : null}

      {event.mapUrl ? (
        <LinkButton
          label={t('specialEvents.actions.openMap')}
          url={event.mapUrl}
        />
      ) : null}
      {event.programUrl ? (
        <LinkButton
          label={t('specialEvents.actions.openProgram')}
          url={event.programUrl}
        />
      ) : null}

      {canManageEvents && (
        <View style={styles.actions}>
          {isRemoved ? (
            <Pressable
              style={styles.save}
              disabled={restoreM.isPending}
              onPress={() => restoreM.mutate()}
            >
              <Text style={styles.saveText}>
                {t('specialEvents.actions.restore')}
              </Text>
            </Pressable>
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
              <Pressable
                style={styles.delete}
                disabled={removeM.isPending}
                onPress={() => removeM.mutate()}
              >
                <Text style={styles.deleteText}>
                  {t('specialEvents.actions.delete')}
                </Text>
              </Pressable>
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
      <Text style={styles.infoValue}>{value}</Text>
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
  h1: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
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
  infoLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
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
  linkText: { color: '#0ea5e9', fontSize: 15, fontWeight: '600' },
  actions: { marginTop: 24, gap: 10 },
  save: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancel: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { color: '#64748b', fontSize: 15, fontWeight: '600' },
  delete: {
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
});
