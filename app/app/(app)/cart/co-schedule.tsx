import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { specialEventsApi, type SpecialEvent } from '../../../lib/api';
import { CIRCUIT_OVERSEER_VISIT_TYPE } from '../../../components/SpecialEventForm';
import { usePermissions } from '../../../lib/permissions';
import { formatDateISO, startOfWeekMonday } from '../../../lib/dates';

// 2024-01-01 is a Monday, so this anchors ISO weekday 1..7 (Mon..Sun) to a real
// date we can localize without hard-coding weekday names in three languages.
const WEEKDAY_ANCHOR = [
  '2024-01-01',
  '2024-01-02',
  '2024-01-03',
  '2024-01-04',
  '2024-01-05',
  '2024-01-06',
  '2024-01-07',
];

function pickVisit(events: SpecialEvent[]): SpecialEvent | null {
  const visits = events
    .filter((e) => e.type === CIRCUIT_OVERSEER_VISIT_TYPE)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (visits.length === 0) return null;
  const today = formatDateISO(new Date());
  const active = visits.find(
    (e) => e.date <= today && (e.endDate ?? e.date) >= today,
  );
  if (active) return active;
  const upcoming = visits.find((e) => e.date >= today);
  if (upcoming) return upcoming;
  return visits[visits.length - 1];
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

export default function CoScheduleScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { canViewCoSchedule } = usePermissions();
  const loc = i18n.language;

  const { data: events, isLoading } = useQuery({
    queryKey: ['special-events', 'co-schedule'],
    queryFn: () => specialEventsApi.list({ all: true }),
    enabled: canViewCoSchedule,
  });

  if (!canViewCoSchedule) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('coVisit.noAccess')}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  const visit = events ? pickVisit(events) : null;

  if (!visit) {
    return (
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={40} color="#94a3b8" />
        <Text style={styles.muted}>{t('coVisit.noVisit')}</Text>
      </View>
    );
  }

  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(loc, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

  const weekdayName = (dow: number | null) => {
    const d = dow && dow >= 1 && dow <= 7 ? dow : 2;
    return new Date(`${WEEKDAY_ANCHOR[d - 1]}T00:00:00`).toLocaleDateString(
      loc,
      { weekday: 'long' },
    );
  };

  const coName = [visit.coFirstName, visit.coLastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const period =
    visit.endDate && visit.endDate !== visit.date
      ? `${fmt(visit.date)} — ${fmt(visit.endDate)}`
      : fmt(visit.date);
  const weekMonday = formatDateISO(
    startOfWeekMonday(new Date(`${visit.date}T00:00:00`)),
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{coName || t('coVisit.overseer')}</Text>
        {visit.coWifeName ? (
          <Kv label={t('coVisit.wife')} value={visit.coWifeName} />
        ) : null}
        <Kv label={t('coVisit.period')} value={period} />
        <Kv
          label={t('coVisit.midweekDay')}
          value={weekdayName(visit.coMidweekDow)}
        />
      </View>

      <Pressable
        style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}
        onPress={() => router.push(`/schedule?week=${weekMonday}` as never)}
      >
        <Ionicons name="calendar-outline" size={20} color="#0ea5e9" />
        <Text style={styles.linkText}>{t('coVisit.openMeetingProgram')}</Text>
        <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, gap: 12 },
  center: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  muted: { fontSize: 15, color: '#64748b', textAlign: 'center' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  kvLabel: { fontSize: 14, color: '#64748b' },
  kvValue: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  pressed: { opacity: 0.6 },
  linkText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#0f172a' },
});
