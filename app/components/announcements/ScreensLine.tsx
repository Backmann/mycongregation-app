import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { announcementsApi } from '../../lib/api';
import { parseISODate } from '../../lib/dates';
import { reportSuccess } from '../../lib/error-bus';
import { RULE } from './ReadList';

/**
 * The overseer's task «Программа районного конгресса на экранах»
 * (announcements R-05): where the chairman's item stands — on his list, not
 * yet (the app puts it three weeks ahead), or taken off — and the one thing
 * the overseer may do with it: take it off, or put it back.
 */
export function ScreensLine({ date }: { date: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['announcements', 'screens', date],
    queryFn: () => announcementsApi.screens(date),
    retry: false,
  });
  const done = () => void qc.invalidateQueries({ queryKey: ['announcements'] });
  const remove = useMutation({
    mutationFn: () => announcementsApi.screensRemove(date),
    onSuccess: () => reportSuccess(t('announcements.screens.removed')),
    onSettled: done,
  });
  const restore = useMutation({
    mutationFn: () => announcementsApi.screensRestore(date),
    onSuccess: () => reportSuccess(t('announcements.screens.restored')),
    onSettled: done,
  });
  const s = q.data;
  if (!s || s.state === 'none') return null;
  const day = s.meetingDate
    ? parseISODate(s.meetingDate).toLocaleDateString(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : '';
  return (
    <View style={st.box}>
      <View style={st.head}>
        <Ionicons name="tv-outline" size={18} color={RULE.fg} />
        <Text style={st.title}>{t('announcements.screens.title', { day })}</Text>
      </View>
      <Text style={st.text}>
        {s.state === 'placed'
          ? s.read
            ? t('announcements.screens.read')
            : t('announcements.screens.placed')
          : s.state === 'later'
            ? t('announcements.screens.later')
            : s.state === 'off'
              ? t('announcements.screens.off')
              : t('announcements.screens.isRemoved')}
      </Text>
      <Text style={st.text}>{t('announcements.screens.yours')}</Text>
      {s.state === 'removed' ? (
        <Pressable
          style={st.btn}
          disabled={restore.isPending}
          onPress={() => restore.mutate()}
          accessibilityRole="button"
        >
          <Text style={st.btnText}>{t('announcements.screens.restore')}</Text>
        </Pressable>
      ) : s.state !== 'off' && !s.read ? (
        <Pressable
          style={st.btnOff}
          disabled={remove.isPending}
          onPress={() => remove.mutate()}
          accessibilityRole="button"
        >
          <Text style={st.btnOffText}>{t('announcements.screens.remove')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: RULE.ground, borderWidth: 1, borderColor: RULE.edge },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#0f172a' },
  text: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20, color: '#334155' },
  btn: { alignSelf: 'flex-start', minHeight: 44, borderRadius: 12, backgroundColor: RULE.fg, paddingHorizontal: 14, justifyContent: 'center' },
  btnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
  btnOff: { alignSelf: 'flex-start', minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: RULE.fg, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: '#fff' },
  btnOffText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: RULE.fg },
});
