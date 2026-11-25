import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ReadList } from '../../../components/announcements/ReadList';
import { NoAccess } from '../../../components/NoAccess';
import { LoadFailure } from '../../../components/LoadFailure';
import { announcementsApi, type AnnouncementKind } from '../../../lib/api';
import { formatDateISO, parseISODate } from '../../../lib/dates';
import { failsScreen } from '../../../lib/screen-failure';

const capital = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/**
 * ONE MEETING'S ANNOUNCEMENTS, for its chairman to read ahead (R-01) — opened
 * from his home screen. The same list the conduct mode shows at the closing
 * words. Whether he may read it is the server's answer.
 */
export default function AnnouncementMeetingScreen() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ week?: string; kind?: string }>();
  const week = typeof params.week === 'string' ? params.week : '';
  const kind: AnnouncementKind = params.kind === 'weekend' ? 'weekend' : 'midweek';
  const q = useQuery({
    throwOnError: failsScreen,
    queryKey: ['announcements', 'meeting', week, kind],
    queryFn: () => announcementsApi.meeting(week, kind),
    enabled: !!week,
    retry: false,
  });
  if (!week) return <NoAccess />;
  // A refusal is drawn as «not yours», anything else with a way to try again.
  if (q.error) return <LoadFailure error={q.error} onRetry={() => void q.refetch()} />;
  const date = q.data?.date ?? null;
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.frame}>
        <Text style={s.lbl}>{t(`announcements.kind.${kind}`)}</Text>
        <Text style={s.title}>
          {date ? capital(parseISODate(date).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })) : ''}
        </Text>
        <Text style={s.sub}>{t(`announcements.read.where.${kind}`)}</Text>
        <View style={{ height: 8 }} />
        {/* Ticked off at the meeting itself; read ahead, it is only read. */}
        <ReadList week={week} kind={kind} size="large" tick={!!date && date === formatDateISO(new Date())} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f5f8' },
  content: { padding: 16, paddingBottom: 48 },
  frame: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 4 },
  lbl: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#475569' },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 26, color: '#0f172a', letterSpacing: -0.4 },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#475569' },
});
