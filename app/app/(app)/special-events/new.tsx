import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KIND_LOOK, KindKey } from '../../../lib/event-view';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { specialEventsApi } from '../../../lib/api';
import {
  eventErrorMessage,
  invalidateAfterEventChange,
} from '../../../lib/special-event-effects';
import {
  EventFormValue,
  emptyEventForm,
  CIRCUIT_OVERSEER_VISIT_TYPE,
  meetingPayload,
} from '../../../components/SpecialEventForm';
import { EventFormScreen } from '../../../components/EventFormScreen';

export default function NewSpecialEventScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<EventFormValue>(emptyEventForm());
  // The kind first (27 September): what follows depends on it, and a form
  // that asked everything of everyone made the visit and the convention look
  // alike.
  const [picked, setPicked] = useState(false);
  const pick = (kind: (typeof CHOICES)[number]) => {
    const isOther = kind === 'other';
    setForm({
      ...emptyEventForm(),
      type: isOther ? '' : kind,
      title: isOther ? '' : t(`specialEvents.types.${kind}`),
      // A branch representative's day usually changes the meeting rather
      // than cancelling it — the form opens on that answer.
      meetingMode: kind === 'branch_representative_visit' ? 'changed' : 'usual',
    });
    setPicked(true);
  };

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
        ...meetingPayload(form),
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
    // The new event opens — not the list it was made from: that is where
    // the next thing to do with it (the visit schedule, the programme link)
    // is.
    onSuccess: (created) => {
      invalidateAfterEventChange(qc);
      router.replace(`/special-events/${created.id}` as never);
    },
  });

  if (!picked) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.chooseTitle}>{t('specialEvents.create.title')}</Text>
        <Text style={styles.chooseSub}>{t('specialEvents.create.subtitle')}</Text>
        <View style={styles.choices}>
          {CHOICES.map((k, i) => {
            const look = KIND_LOOK[k as KindKey];
            return (
              <Pressable
                key={k}
                onPress={() => pick(k)}
                style={({ pressed }) => [
                  styles.choice,
                  i > 0 && styles.choiceBorder,
                  pressed && { backgroundColor: '#f8fafc' },
                ]}
              >
                <View style={[styles.choiceIcon, { backgroundColor: look.soft }]}>
                  <Ionicons name={look.icon as never} size={20} color={look.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceName}>
                    {k === 'other'
                      ? t('specialEvents.create.other')
                      : t(`specialEvents.types.${k}`)}
                  </Text>
                  <Text style={styles.choiceHint}>
                    {t(`specialEvents.create.hint.${k}`)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </Pressable>
            );
          })}
        </View>
        <Pressable
          style={styles.talkNote}
          onPress={() => router.push('/talk-coordinator/log' as never)}
        >
          <Text style={styles.talkNoteText}>
            {t('specialEvents.create.specialTalk')}{' '}
            <Text style={styles.talkNoteLink}>
              {t('specialEvents.create.openLog')}
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <EventFormScreen
      value={form}
      onChange={setForm}
      isNew
      saving={mutation.isPending}
      errorText={mutation.isError ? eventErrorMessage(mutation.error, t) : null}
      onSave={() => mutation.mutate()}
    />
  );
}

const CHOICES = [
  'circuit_overseer_visit',
  'circuit_assembly',
  'regional_convention',
  'memorial',
  'branch_representative_visit',
  'other',
] as const;

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f8fafc' },
  chooseTitle: {
    fontSize: 24,
    fontFamily: 'Manrope_800ExtraBold',
    fontWeight: '800',
    color: '#0f172a',
  },
  chooseSub: { fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 14 },
  choices: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  choiceBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceName: {
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    color: '#0f172a',
  },
  choiceHint: { fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 18 },
  talkNote: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fdf4ff',
    borderWidth: 1,
    borderColor: '#f5d0fe',
  },
  talkNoteText: { fontSize: 14, color: '#86198f', lineHeight: 20 },
  talkNoteLink: { fontFamily: 'Manrope_700Bold', fontWeight: '700' },
});
