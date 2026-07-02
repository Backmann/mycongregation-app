import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage, specialEventsApi } from '../../../lib/api';
import {
  SpecialEventForm,
  EventFormValue,
  emptyEventForm,
  CIRCUIT_OVERSEER_VISIT_TYPE,
} from '../../../components/SpecialEventForm';

export default function NewSpecialEventScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<EventFormValue>(emptyEventForm());

  const mutation = useMutation({
    mutationFn: () =>
      specialEventsApi.create({
        title: form.title.trim(),
        type: form.type.trim() || undefined,
        date: form.date.trim(),
        endDate: form.endDate.trim() || undefined,
        time: form.time.trim() || undefined,
        timeEnd: form.timeEnd.trim() || undefined,
        address: form.address.trim() || undefined,
        mapUrl: form.mapUrl.trim() || undefined,
        programUrl: form.programUrl.trim() || undefined,
        note: form.note.trim() || undefined,
        replacesMeeting: form.replacesMeeting,
        coFirstName: form.coFirstName.trim() || undefined,
        coLastName: form.coLastName.trim() || undefined,
        coWifeName: form.coWifeName.trim() || undefined,
        coRole:
          form.type.trim() === CIRCUIT_OVERSEER_VISIT_TYPE
            ? form.coRole
            : undefined,
        coAccommodationAddress: form.coAccommodationAddress.trim() || undefined,
        coMidweekDow:
          form.type.trim() === CIRCUIT_OVERSEER_VISIT_TYPE
            ? form.coMidweekDow
            : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['special-events'] });
      router.back();
    },
  });

  const canSave =
    form.title.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.date.trim());

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SpecialEventForm value={form} onChange={setForm} />
      {mutation.isError && (
        <Text style={styles.error}>{extractErrorMessage(mutation.error)}</Text>
      )}
      <Pressable
        style={[styles.save, (!canSave || mutation.isPending) && styles.disabled]}
        disabled={!canSave || mutation.isPending}
        onPress={() => mutation.mutate()}
      >
        {mutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveText}>{t('specialEvents.actions.save')}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f8fafc' },
  error: { color: '#b91c1c', marginBottom: 12 },
  save: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
