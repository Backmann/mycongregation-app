import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { coFolderApi } from '../../lib/co-folder';
import { useMayOpen } from '../../lib/useMayOpen';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

const AMBER = '#b45309';

/**
 * The folder for the circuit overseer on the visit's page (S-61, 17
 * November 2026): how far it is, by role, the S-62 and the day it is due.
 * The coordinator, the secretary and the service overseer see the whole of
 * it; another elder only section 1; nobody else sees the card at all — the
 * server decides, a refusal draws nothing.
 */
export function VisitFolderCard({ eventId }: { eventId: string }) {
  const { t, i18n } = useTranslation();
  const mayOpen = useMayOpen();
  const q = useQuery({
    queryKey: ['co-folder', eventId],
    queryFn: () => coFolderApi.get(eventId),
    enabled: mayOpen('/special-events/folder/[id]'),
    retry: false,
  });
  const f = q.data;
  if (!f) return null;
  const day = (iso: string) => dayjs(iso).locale(i18n.language).format('dd, D MMM');
  const pct = f.total ? Math.round((f.ready / f.total) * 100) : 0;
  const left =
    f.daysLeft > 0 ? t('coFolder.daysLeft', { count: f.daysLeft }) : f.daysLeft === 0 ? t('coFolder.dueToday') : t('coFolder.duePassed');
  return (
    <View style={s.card}>
      <Text style={s.kick}>{t('coFolder.kicker')}</Text>
      {f.access.full ? (
        <>
          <View style={s.top}>
            <Text style={s.big}>{pct}%</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{t('coFolder.ofShort', { ready: f.ready, total: f.total })}</Text>
              <Text style={s.sub}>
                {f.handedOver
                  ? t('coFolder.visitCard.handedOver', { date: day(f.handedOver.at.slice(0, 10)) })
                  : `${t('coFolder.dueLabel')} ${day(f.dueOn)} · ${left}`}
              </Text>
            </View>
          </View>
          <View style={s.bar}>
            <View style={[s.fill, { width: `${pct}%` }]} />
          </View>
          {f.byRole.map((r) => (
            <View key={r.role} style={s.row}>
              <Text style={s.role}>
                {t(`coFolder.roleShort.${r.role}`)}
                {f.access.roles.includes(r.role) ? ` · ${t('coFolder.you')}` : ''}
              </Text>
              <Text style={[s.count, r.ready < r.total && { color: AMBER }]}>
                {t('coFolder.ofShort', { ready: r.ready, total: r.total })}
              </Text>
            </View>
          ))}
          <View style={s.row}>
            <Ionicons
              name={f.s62.sentAt ? 'checkmark-circle' : 'time-outline'}
              size={16}
              color={f.s62.sentAt ? '#047857' : AMBER}
            />
            <Text style={[s.sub, { flex: 1 }]}>
              {f.s62.sentAt
                ? t('coFolder.visitCard.s62Done', { date: day(f.s62.sentAt.slice(0, 10)), due: day(f.s62.dueOn) })
                : t('coFolder.visitCard.s62Open', { due: day(f.s62.dueOn) })}
            </Text>
          </View>
        </>
      ) : (
        <Text style={s.sub}>
          {t('coFolder.othersSeeText', {
            ready: f.byRole[0]?.ready ?? 0,
            total: f.byRole[0]?.total ?? 0,
          })}
        </Text>
      )}
      <Pressable
        onPress={() => router.push(`/special-events/folder/${eventId}` as never)}
        style={({ pressed }) => [s.open, pressed && { opacity: 0.8 }]}
        accessibilityRole="link"
      >
        <Text style={s.openText}>{t('coFolder.open')}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 16, gap: 10, marginTop: 14 },
  kick: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11.5, letterSpacing: 0.9, color: BRAND, textTransform: 'uppercase' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  big: { fontFamily: 'Manrope_800ExtraBold', fontSize: 28, color: BRAND },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: INK },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, lineHeight: 18 },
  bar: { height: 8, backgroundColor: '#e8eef1', borderRadius: 999, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: BRAND, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  role: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK },
  count: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: BRAND },
  open: { backgroundColor: BRAND, borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  openText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5, color: '#fff' },
});
