import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SpecialEvent, specialEventsApi } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useAuth } from '../../../lib/auth';

function eventDateLabel(e: SpecialEvent, loc: string): string {
  const start = new Date(`${e.date}T00:00:00`);
  if (!e.endDate) {
    return start.toLocaleDateString(loc, { day: 'numeric', month: 'long' });
  }
  const end = new Date(`${e.endDate}T00:00:00`);
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}\u2013${end.toLocaleDateString(loc, {
      day: 'numeric',
      month: 'long',
    })}`;
  }
  return `${start.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
  })} \u2013 ${end.toLocaleDateString(loc, { day: 'numeric', month: 'long' })}`;
}

type Tile = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  show: boolean;
};

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { canManageAbsences } = usePermissions();
  const canSeeDirectory =
    user?.role === 'admin' ||
    user?.role === 'elder' ||
    user?.canViewPrivateData === true;

  const { data: events, isLoading } = useQuery({
    queryKey: ['special-events', 'home'],
    queryFn: () => specialEventsApi.list(),
  });
  const upcoming = (events ?? []).slice(0, 3);

  const tiles: Tile[] = [
    { key: 'schedule', label: t('home.actions.schedule'), icon: 'calendar', href: '/schedule', show: true },
    { key: 'report', label: t('home.actions.report'), icon: 'document-text', href: '/service-reports', show: true },
    { key: 'events', label: t('home.actions.events'), icon: 'megaphone', href: '/special-events', show: true },
    { key: 'absences', label: t('home.actions.absences'), icon: 'airplane', href: '/absences', show: canManageAbsences },
    { key: 'publishers', label: t('home.actions.publishers'), icon: 'people', href: '/publishers', show: canSeeDirectory },
    { key: 'profile', label: t('home.actions.profile'), icon: 'person-circle', href: '/profile', show: true },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('home.upcomingEvents')}</Text>
        <Pressable onPress={() => router.push('/special-events' as any)} hitSlop={8}>
          <Text style={styles.link}>{t('home.allEvents')}</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        {isLoading ? (
          <ActivityIndicator style={{ paddingVertical: 16 }} />
        ) : upcoming.length === 0 ? (
          <Text style={styles.muted}>{t('home.noEvents')}</Text>
        ) : (
          upcoming.map((e, idx) => (
            <Pressable
              key={e.id}
              style={[styles.eventRow, idx > 0 && styles.eventRowBorder]}
              onPress={() => router.push(`/special-events/${e.id}` as any)}
            >
              <Ionicons
                name="megaphone-outline"
                size={18}
                color="#0ea5e9"
                style={{ marginRight: 10 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTitle} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={styles.eventDate}>
                  {eventDateLabel(e, i18n.language)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </Pressable>
          ))
        )}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 24, marginBottom: 12 }]}>
        {t('home.quickActions')}
      </Text>
      <View style={styles.tiles}>
        {tiles
          .filter((x) => x.show)
          .map((x) => (
            <Pressable
              key={x.key}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={() => router.push(x.href as any)}
            >
              <Ionicons name={x.icon} size={26} color="#0ea5e9" />
              <Text style={styles.tileLabel}>{x.label}</Text>
            </Pressable>
          ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  link: { fontSize: 14, color: '#0ea5e9', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  muted: { color: '#94a3b8', textAlign: 'center', paddingVertical: 20 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  eventRowBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  eventTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  eventDate: { fontSize: 13, color: '#0369a1', marginTop: 2 },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  tile: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 8,
  },
  tilePressed: { backgroundColor: '#f1f5f9' },
  tileLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
});
