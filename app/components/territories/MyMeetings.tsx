import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage, territoriesApi, type MyServiceMeeting } from '../../lib/api';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../reports/ReportBits';

/** «сб, 14 нояб.» */
export function meetingDay(date: string, lang: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(lang, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * «Встречи, которые вы ведёте» (11 November 2026): the conductor of a
 * meeting for field service sends it to a territory of his own or his
 * group's. Those the meeting is for then see that territory, with its
 * «не беспокоить» addresses, the day before and on the day. Drawn only
 * when he conducts one in the next two weeks.
 */
export function MyMeetings() {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ['territories', 'my-meetings'],
    queryFn: () => territoriesApi.myMeetings(),
  });
  const meetings = q.data ?? [];
  if (meetings.length === 0) return null;
  return (
    <View style={[cardStyles.card, s.card]}>
      <Text style={s.title}>{t('territories.meetings.title')}</Text>
      <Text style={s.hint}>{t('territories.meetings.hint')}</Text>
      {meetings.map((m) => (
        <Meeting key={m.id} m={m} lang={i18n.language} />
      ))}
    </View>
  );
}

function Meeting({ m, lang }: { m: MyServiceMeeting; lang: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const set = useMutation({
    mutationFn: (territoryId: string | null) => territoriesApi.setMeetingTerritory(m.id, territoryId),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['territories'] });
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  return (
    <View style={s.meeting}>
      <View style={s.head}>
        <Ionicons name="people-outline" size={16} color={MUTED} />
        <Text style={s.when}>
          {meetingDay(m.date, lang)} · {m.startTime}
          <Text style={s.where}> · {m.address}</Text>
        </Text>
        {set.isPending ? <ActivityIndicator color={BRAND} /> : null}
      </View>
      <View style={s.chips}>
        <Chip
          label={t('territories.meetings.none')}
          on={!m.territoryId}
          onPress={() => set.mutate(null)}
        />
        {m.options.map((o) => (
          <Chip
            key={o.territoryId}
            label={o.number}
            on={m.territoryId === o.territoryId}
            onPress={() => set.mutate(o.territoryId)}
          />
        ))}
      </View>
      {m.dropped ? (
        <View style={s.dropped}>
          <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
          <Text style={s.droppedText}>{t('territories.meetings.dropped', { number: m.dropped.number })}</Text>
        </View>
      ) : null}
      {m.options.length === 0 ? <Text style={s.hint}>{t('territories.meetings.noOptions')}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, on && s.chipOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { marginBottom: 0, gap: 4 },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: INK },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED },
  meeting: { borderTopWidth: 1, borderTopColor: LINE, paddingTop: 10, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  when: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  where: { fontFamily: 'Manrope_500Medium', color: MUTED },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  chipTextOn: { color: '#fff' },
  dropped: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: '#fffbeb', borderRadius: 10, padding: 8, marginTop: 8 },
  droppedText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: '#92400e', lineHeight: 17 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 4 },
});
