import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { announcementsApi, meApi } from '../../lib/api';
import { firstLine } from '../../lib/announcements';
import { parseISODate } from '../../lib/dates';
import { useMayOpen } from '../../lib/useMayOpen';
import { ANN } from './ReadList';

/** Shown from this many days before the meeting. */
const SHOWN_DAYS_AHEAD = 7;

/**
 * «Объявления · 3» on the chairman's home screen (R-01): the announcements of
 * the meeting he chairs, to read ahead; a tap opens the list.
 *
 * Asked only by whoever holds a chairman's part in his own assignments — the
 * same list home already loads — so nobody else sends a request at all. A
 * meeting with nothing to announce shows nothing.
 */
export function AnnouncementsHomeCard() {
  const { t, i18n } = useTranslation();
  const mine = useQuery({ queryKey: ['me', 'assignments'], queryFn: () => meApi.assignments(), retry: false });
  const chairs = (mine.data?.items ?? []).some(
    (it) => it.kind === 'meeting' && (it.partKey === 'midweek_chairman' || it.partKey === 'weekend_chairman'),
  );
  const q = useQuery({
    queryKey: ['announcements', 'mine'],
    queryFn: () => announcementsApi.mine(),
    enabled: chairs,
    retry: false,
    staleTime: 60 * 1000,
  });
  const today = new Date();
  const soon = (q.data ?? []).filter((m) => {
    if (!m.date || !m.items.length) return false;
    const days = (parseISODate(m.date).getTime() - new Date(today.toDateString()).getTime()) / 86_400_000;
    return days <= SHOWN_DAYS_AHEAD;
  });
  if (!soon.length) return null;
  return (
    <View style={{ gap: 10 }}>
      {soon.map((m) => {
        const day = parseISODate(m.date!).toLocaleDateString(i18n.language, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
        const letters = m.items.filter((a) => a.isLetter).length;
        return (
          <Pressable
            key={`${m.weekStartDate}-${m.kind}`}
            style={s.card}
            onPress={() =>
              router.push(`/announcements/meeting?week=${m.weekStartDate}&kind=${m.kind}` as never)
            }
            accessibilityRole="button"
          >
            <View style={s.icon}>
              <Ionicons name="megaphone-outline" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.title}>{t('announcements.home.title', { count: m.items.length })}</Text>
              <Text style={s.sub}>
                {[t(`announcements.home.where.${m.kind}`, { day }), letters ? t('announcements.home.letters', { count: letters }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text style={s.first} numberOfLines={1}>
                {m.items[0].isLetter ? firstLine(m.items[0].text) : m.items[0].text}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * «Объявления: подсказок 3 · устарело 1» for the writers (announcements R-09):
 * shown only when there is something to decide this week or next — a
 * suggestion not yet added or let go, or a taken text whose event changed.
 * Nothing to decide, no line. Built first in step 2 because the section was
 * not yet used two days after it went live (26 November 2026).
 */
export function AnnouncementsWriterLine() {
  const { t } = useTranslation();
  const mayOpen = useMayOpen();
  const writer = mayOpen('/announcements');
  const q = useQuery({
    queryKey: ['announcements', 'suggestions', 'summary'],
    queryFn: () => announcementsApi.suggestionSummary(),
    enabled: writer,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const d = q.data;
  if (!writer || !d || (!d.suggestions && !d.stale)) return null;
  const parts = [
    d.suggestions ? t('announcements.home.suggestions', { n: d.suggestions }) : null,
    d.stale ? t('announcements.home.stale', { n: d.stale }) : null,
  ].filter(Boolean);
  return (
    <Pressable style={w.card} onPress={() => router.push('/announcements' as never)} accessibilityRole="button">
      <View style={w.icon}>
        <Ionicons name="megaphone-outline" size={22} color={ANN.fg} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={w.title}>{t('announcements.home.writerTitle')}</Text>
        <Text style={w.sub}>{parts.join(' · ')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#64748b" />
    </Pressable>
  );
}

const w = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: ANN.bg,
    marginBottom: 12,
  },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: ANN.bg, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#0f172a' },
  sub: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: ANN.fg },
});

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: ANN.fg,
    marginBottom: 12,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: '#fff' },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#dbeafe' },
  first: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#e0ecfa' },
});
