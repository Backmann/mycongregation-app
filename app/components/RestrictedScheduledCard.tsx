import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { publicTalksApi, RestrictedUse } from '../lib/api';

/**
 * Talks no longer given that are still promised (28 September).
 *
 * The Android pass found «Едет 25 октября в Unna-Russisch, речь №87» while
 * №87 is withdrawn from 1 September, and no screen said a word. This card
 * stands where the coordinator decides about talks — the retire screen —
 * and says which promises to talk over. It changes nothing: arranging
 * another talk is a conversation with the speaker.
 */
export function useRestrictedScheduled(enabled = true) {
  return useQuery({
    queryKey: ['public-talks', 'restricted-scheduled'],
    queryFn: () => publicTalksApi.restrictedScheduled(),
    enabled,
    staleTime: 60_000,
  });
}

export function restrictionWords(
  u: RestrictedUse,
  t: (k: string, o?: Record<string, unknown>) => string,
  lang: string,
): string {
  const day = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(lang, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const r = u.restriction;
  if (r.state === 'removed') return t('publicTalks.retiredPlain');
  if (r.state === 'paused')
    return t('publicTalks.pausedBetween', {
      from: day(r.from),
      until: day(r.until),
    });
  return t('publicTalks.retiredFrom', { date: day(r.from) });
}

export function RestrictedScheduledCard() {
  const { t, i18n } = useTranslation();
  const q = useRestrictedScheduled();
  const list = q.data ?? [];
  if (list.length === 0) return null;
  const day = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  const who = (u: RestrictedUse) =>
    u.source === 'outgoing'
      ? u.publisherName
        ? t('publicTalks.restrictedScheduled.outgoing', {
            name: u.publisherName,
            date: day(u.meetingDate),
            where: u.hostCongregationName ?? '—',
          })
        : t('publicTalks.restrictedScheduled.outgoingNoName', {
            date: day(u.meetingDate),
            where: u.hostCongregationName ?? '—',
          })
      : u.source === 'incoming'
        ? t('publicTalks.restrictedScheduled.incoming', {
            date: day(u.meetingDate),
            name:
              [u.speakerName, u.speakerCongregation]
                .filter(Boolean)
                .join(', ') || '—',
          })
        : t('publicTalks.restrictedScheduled.programme', {
            date: day(u.meetingDate),
          });

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="warning-outline" size={18} color="#b45309" />
        <Text style={styles.title}>
          {t('publicTalks.restrictedScheduled.title', { count: list.length })}
        </Text>
      </View>
      <Text style={styles.hint}>{t('publicTalks.restrictedScheduled.hint')}</Text>
      {list.map((u) => (
        <View
          key={`${u.source}-${u.meetingDate}-${u.publicTalkId}`}
          style={styles.row}
        >
          <Text style={styles.who}>{who(u)}</Text>
          <Text style={styles.talk}>
            №{u.talkNumber}. {u.talkTitle}
          </Text>
          <Text style={styles.why}>{restrictionWords(u, t, i18n.language)}</Text>
        </View>
      ))}
      <Pressable
        onPress={() => router.push('/talk-coordinator/log' as never)}
        hitSlop={6}
        style={styles.link}
      >
        <Text style={styles.linkText}>
          {t('publicTalks.restrictedScheduled.openLog')} →
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fbbf24',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#92400e',
  },
  hint: { fontSize: 13, color: '#92400e', marginTop: 6, lineHeight: 18 },
  row: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#fde68a',
  },
  who: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  talk: { fontSize: 13, color: '#334155', marginTop: 2 },
  why: { fontSize: 12.5, color: '#b45309', marginTop: 2 },
  link: { marginTop: 12 },
  linkText: { fontSize: 13.5, color: '#0369a1', fontWeight: '600' },
});
