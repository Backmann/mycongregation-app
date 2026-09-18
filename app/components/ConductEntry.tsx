import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { meApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateISO, startOfWeekMonday } from '../lib/dates';

/**
 * THE DOOR INTO CONDUCT MODE — an offer, not a route anyone has to take.
 *
 * Not every chairman will want a screen counting his minutes; plenty will
 * simply read the programme as they always have. So this stays a quiet
 * secondary button rather than anything that announces itself, it is never
 * made more prominent for somebody who has not used it, and conduct mode is
 * never opened in anybody's place.
 *
 * IT DECIDES FOR ITSELF WHETHER TO APPEAR. The screen that hosts it passes the
 * week and who is chairing it, and nothing else — no visibility flags, no
 * permission checks copied into the caller. That is deliberate: the schedule
 * is about to be rebuilt into a feed of days, and this button then moves onto
 * the midweek day's row. When it does, the move is one line at the call site
 * and nothing here changes.
 *
 * WHO SEES IT: the chairman named in that week's programme, and an admin. Past
 * weeks show nothing — a meeting that has been held cannot be conducted.
 *
 * There is NO time window on purpose. A chairman may well open the run sheet
 * the night before to see where the evening is tight, and a button that
 * appears an hour before the meeting would have to be worked out from the
 * device's clock rather than the congregation's — a quiet untruth for the sake
 * of hiding something harmless.
 */
export function ConductEntry({
  week,
  chairmanPublisherId,
}: {
  /** Monday of the week, 'YYYY-MM-DD'. */
  week: string;
  /** Who is chairing this midweek meeting, if anybody is yet. */
  chairmanPublisherId: string | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Same key conduct mode uses, so this costs no request of its own.
  const { data } = useQuery({
    queryKey: ['me-publisher'],
    queryFn: () => meApi.publisher(),
  });

  const myPublisherId = data?.publisher?.id ?? null;
  const isChairman = !!chairmanPublisherId && chairmanPublisherId === myPublisherId;
  const isAdmin = user?.role === 'admin';
  if (!isChairman && !isAdmin) return null;

  // Both sides are 'YYYY-MM-DD', which compares correctly as text.
  const thisWeek = formatDateISO(startOfWeekMonday(new Date()));
  if (week < thisWeek) return null;

  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push(`/schedule/conduct?week=${week}` as any)}
      accessibilityRole="button"
    >
      <Ionicons name="play-circle-outline" size={18} color="#0369a1" />
      <Text style={styles.label}>{t('conduct.open')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  label: { color: '#0369a1', fontSize: 14, fontWeight: '600' },
});
