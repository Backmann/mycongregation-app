import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LoadFailure } from '../../../components/LoadFailure';
import { QK_INBOX } from '../../../components/InboxBell';
import { meApi } from '../../../lib/api';
import type { InboxItem } from '../../../lib/api';
import { daysAgo, isUnread } from '../../../lib/inbox';
import { routeForNotification } from '../../../lib/push-notifications';

/**
 * «Мои уведомления» — everything the app has told this person lately.
 *
 * A notification used to be the only carrier of what it said. Swiped away,
 * missed, sent to a phone without Google services or to an iPhone that opens
 * the site from Safari — and nothing anywhere showed it had been sent. The
 * server has kept every one of them all along; this screen is the door.
 *
 * What was new when the screen was opened STAYS marked while it is open: the
 * list is told «прочитано» at once, but the reader has to be able to see
 * which lines they came for.
 */
export default function InboxScreen() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QK_INBOX,
    queryFn: () => meApi.inbox(),
    staleTime: 0,
  });

  // What «new» meant on arrival — kept for this visit.
  const seenOnArrival = useRef<string | null | undefined>(undefined);
  const told = useRef(false);
  useEffect(() => {
    if (!query.data || told.current) return;
    told.current = true;
    seenOnArrival.current = query.data.seenAt;
    void meApi
      .inboxSeen()
      .then(() => {
        // The bell on «Главная» reads the same answer: put the new moment in
        // it rather than fetching sixty lines again to move one date.
        queryClient.setQueryData(QK_INBOX, (old: typeof query.data) =>
          old ? { ...old, seenAt: new Date().toISOString() } : old,
        );
      })
      // Not read on the server, then: the dot stays, which is the truth.
      .catch(() => undefined);
  }, [query.data, queryClient]);

  if (query.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (query.error || !query.data) {
    return (
      <View style={styles.container}>
        <LoadFailure error={query.error} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const items = query.data.items;
  const seenAt =
    seenOnArrival.current === undefined ? query.data.seenAt : seenOnArrival.current;
  const someMissed = items.some((i) => !i.delivered);

  const dayLabel = (item: InboxItem): string => {
    const n = daysAgo(item.at);
    if (n === 0) return t('inbox.today');
    if (n === 1) return t('inbox.yesterday');
    return new Date(item.at).toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };
  const time = (item: InboxItem) =>
    new Date(item.at).toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });

  // Days in the order the list arrives in — newest first.
  const days: { label: string; rows: InboxItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item);
    const last = days[days.length - 1];
    if (last && last.label === label) last.rows.push(item);
    else days.push({ label, rows: [item] });
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
        />
      }
    >
      <View style={styles.frame}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={30} color="#94a3b8" />
            <Text style={styles.emptyTitle}>{t('inbox.emptyTitle')}</Text>
            <Text style={styles.emptyHint}>{t('inbox.emptyHint')}</Text>
          </View>
        ) : null}

        {/* Said once, at the top: why some lines carry a mark, and where it
            is put right. Without it «не дошло» reads as the app's fault and
            nothing to be done. */}
        {someMissed ? (
          <Pressable
            style={({ pressed }) => [styles.missed, pressed && styles.pressed]}
            onPress={() => router.push('/profile/notifications' as never)}
            accessibilityRole="link"
          >
            <Ionicons name="alert-circle-outline" size={18} color="#92400e" />
            <View style={{ flex: 1 }}>
              <Text style={styles.missedText}>{t('inbox.missedNote')}</Text>
              <Text style={styles.missedLink}>{t('inbox.missedLink')}</Text>
            </View>
          </Pressable>
        ) : null}

        {days.map((day) => (
          <View key={day.label} style={styles.day}>
            <Text style={styles.dayLabel} accessibilityRole="header">
              {day.label}
            </Text>
            <View style={styles.card}>
              {day.rows.map((item, i) => {
                const route = routeForNotification(
                  item.data as Parameters<typeof routeForNotification>[0],
                );
                const fresh = isUnread(item, seenAt);
                const body = (
                  <>
                    <View style={styles.dotCol}>
                      {fresh ? <View style={styles.dot} /> : null}
                    </View>
                    <View style={styles.rowText}>
                      <Text style={[styles.title, fresh && styles.titleFresh]}>
                        {item.title}
                      </Text>
                      {item.body ? (
                        <Text style={styles.body}>{item.body}</Text>
                      ) : null}
                      <Text style={styles.meta}>
                        {time(item)}
                        {item.delivered ? '' : ` · ${t('inbox.notDelivered')}`}
                      </Text>
                    </View>
                    {route ? (
                      <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
                    ) : null}
                  </>
                );
                const rowStyle = [styles.row, i > 0 && styles.rowDivider];
                return route ? (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [...rowStyle, pressed && styles.pressed]}
                    onPress={() =>
                      router.push({
                        pathname: route.path as never,
                        params: route.params,
                      })
                    }
                    accessibilityRole="link"
                  >
                    {body}
                  </Pressable>
                ) : (
                  <View key={item.id} style={rowStyle}>
                    {body}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {items.length > 0 ? (
          <Text style={styles.foot}>{t('inbox.foot')}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40, alignItems: 'center' },
  frame: { width: '100%', maxWidth: 640 },
  day: { marginTop: 14 },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingRight: 12,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  dotCol: { width: 26, alignItems: 'center', alignSelf: 'flex-start', paddingTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0e7490' },
  rowText: { flex: 1 },
  title: { fontSize: 15, lineHeight: 20, color: '#334155' },
  titleFresh: {
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  body: { marginTop: 2, fontSize: 14, lineHeight: 20, color: '#475569' },
  meta: { marginTop: 4, fontSize: 12, color: '#94a3b8' },
  missed: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 12,
  },
  missedText: { fontSize: 13.5, lineHeight: 19, color: '#92400e' },
  missedLink: {
    marginTop: 4,
    fontSize: 13.5,
    color: '#0369a1',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  empty: { alignItems: 'center', gap: 6, marginTop: 60, paddingHorizontal: 24 },
  emptyTitle: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  emptyHint: { fontSize: 13.5, lineHeight: 19, color: '#64748b', textAlign: 'center' },
  foot: {
    marginTop: 18,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#94a3b8',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  pressed: { opacity: 0.7 },
});
