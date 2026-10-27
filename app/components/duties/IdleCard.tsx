import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { absencesApi, dutiesApi } from '../../lib/api';
import { useAllPublishers } from '../../lib/useAllPublishers';
import { dutyPool, freeAt, idleInMonth, shortName } from '../../lib/duty-load';
import { formatDateISO } from '../../lib/dates';
import { FONT } from '../../lib/typography';

/**
 * «Не задействованы в ноябре» on a phone — the month table's answer, without
 * the table (Lionel, 27 October 2026). Shown only when there is somebody.
 */
export function IdleCard() {
  const { t } = useTranslation();
  const today = formatDateISO(new Date());
  const month = today.slice(0, 7);
  const q = useQuery({ queryKey: ['duties', 'month', month], queryFn: () => dutiesApi.month(month) });
  const peopleQ = useAllPublishers();
  if (!q.data || !peopleQ.data) return null;
  const idle = idleInMonth(q.data, dutyPool(peopleQ.data.data));
  if (idle.length === 0) return null;
  return (
    <View style={styles.card} testID="idle-card">
      <Text style={styles.title}>{t('dutiesMonth.idleCard', { count: idle.length })}</Text>
      <Text style={styles.hint}>{t('dutiesMonth.idleHint')}</Text>
      <Names names={idle.map((p) => shortName(p))} />
    </View>
  );
}

/**
 * «Ещё не задействованы на этой встрече» under one meeting's sheet: nobody
 * with a part or a place at it, nobody away that day.
 */
export function FreeAtMeeting({ weekStartISO, eventType }: { weekStartISO: string; eventType: 'midweek' | 'weekend' }) {
  const { t } = useTranslation();
  // The meeting may fall in the month after its Monday; both are asked.
  const months = [...new Set([weekStartISO.slice(0, 7), plusDays(weekStartISO, 6).slice(0, 7)])];
  const a = useQuery({ queryKey: ['duties', 'month', months[0]], queryFn: () => dutiesApi.month(months[0]) });
  const b = useQuery({
    queryKey: ['duties', 'month', months[1] ?? months[0]],
    queryFn: () => dutiesApi.month(months[1] ?? months[0]),
    enabled: months.length > 1,
  });
  const peopleQ = useAllPublishers();
  const absQ = useQuery({ queryKey: ['absences', 'week-warn'], queryFn: () => absencesApi.list(), staleTime: 5 * 60 * 1000 });
  const meeting = [...(a.data?.meetings ?? []), ...(b.data?.meetings ?? [])].find(
    (m) => m.weekStartDate === weekStartISO && m.eventType === eventType && m.held,
  );
  if (!meeting || !peopleQ.data) return null;
  const free = freeAt(meeting, dutyPool(peopleQ.data.data), absQ.data);
  return (
    <View style={[styles.card, styles.freeCard]} testID="free-at-meeting">
      <Text style={[styles.title, styles.freeTitle]}>{t('dutiesMonth.freeHere', { count: free.length })}</Text>
      {free.length > 0 ? <Names names={free.map((p) => shortName(p))} green /> : null}
    </View>
  );
}

function Names({ names, green }: { names: string[]; green?: boolean }) {
  return (
    <View style={styles.names}>
      {names.map((n, i) => (
        <View key={i} style={[styles.chip, green && styles.chipGreen]}>
          <Text style={[styles.chipText, green && styles.chipTextGreen]}>{n}</Text>
        </View>
      ))}
    </View>
  );
}

function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return formatDateISO(d);
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fde68a', borderRadius: 14, padding: 12, margin: 12, marginBottom: 4, gap: 4 },
  freeCard: { borderColor: '#bbf7d0', margin: 0, marginBottom: 10 },
  title: { fontFamily: FONT.extrabold, fontSize: 14, color: '#b45309' },
  freeTitle: { color: '#047857' },
  hint: { fontFamily: FONT.regular, fontSize: 12.5, color: '#64748b', lineHeight: 18 },
  names: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#fef3c7' },
  chipGreen: { backgroundColor: '#dcfce7' },
  chipText: { fontFamily: FONT.bold, fontSize: 12.5, color: '#b45309' },
  chipTextGreen: { color: '#047857' },
});
