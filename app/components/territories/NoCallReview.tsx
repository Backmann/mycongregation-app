import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { confirm } from '../ConfirmHost';
import { extractErrorMessage, territoriesApi, type TerritoryNoCallReview } from '../../lib/api';
import { formatDateISO } from '../../lib/dates';
import { formatDayShort } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../reports/ReportBits';

/**
 * «Адреса «не посещать» на пересмотр» (12 November 2026, mockup «Пересмотр»):
 * two years after an address was noted, the territory servant or the service
 * committee keep it two more years or remove it. Nothing goes by itself:
 * without a decision the address stays and so does this card.
 */
export function NoCallReview() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const today = formatDateISO(new Date());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['territories', 'no-call-review'],
    queryFn: () => territoriesApi.noCallsReview(),
  });
  const rows = q.data ?? [];
  if (rows.length === 0) return null;

  const act = async (n: TerritoryNoCallReview, how: 'keep' | 'remove') => {
    if (how === 'remove') {
      const ok = await confirm({
        title: t('territories.noCall.removeTitle'),
        body: t('territories.noCall.removeBody', { address: n.address }),
        confirmLabel: t('territories.noCall.remove'),
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(n.id);
    setError(null);
    try {
      if (how === 'keep') await territoriesApi.keepNoCall(n.id);
      else await territoriesApi.removeNoCall(n.id);
      await qc.invalidateQueries({ queryKey: ['territories'] });
      await qc.invalidateQueries({ queryKey: ['me', 'pending'] });
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[cardStyles.card, s.card]}>
      <Text style={s.kicker}>{t('territories.noCall.reviewKicker')}</Text>
      <Text style={s.title}>{t('territories.noCall.reviewTitle', { count: rows.length })}</Text>
      <Text style={s.lead}>{t('territories.noCall.reviewLead')}</Text>
      {rows.map((n) => {
        const late = n.reviewOn <= today;
        return (
          <View key={n.id} style={s.row}>
            <Pressable
              onPress={() => router.push(`/cart/territory/${n.territoryId}` as never)}
              accessibilityRole="link"
            >
              <Text style={s.address}>
                <Text style={s.tag}>{n.number}</Text>
                {'  '}
                {n.address}
                {n.surname ? ` · ${t('territories.noCall.onDoor', { surname: n.surname })}` : ''}
              </Text>
            </Pressable>
            <Text style={[s.meta, late && s.late]}>
              {t('territories.noCall.noted', { date: formatDayShort(n.notedOn, i18n.language) })}
              {' · '}
              {t('territories.noCall.reviewBy', { date: formatDayShort(n.reviewOn, i18n.language) })}
            </Text>
            <View style={s.pair}>
              <Pressable
                onPress={() => void act(n, 'keep')}
                disabled={busy !== null}
                style={[s.btn, s.btnPrimary]}
                accessibilityRole="button"
              >
                <Text style={[s.btnText, { color: '#fff' }]}>{t('territories.noCall.keep')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void act(n, 'remove')}
                disabled={busy !== null}
                style={s.btn}
                accessibilityRole="button"
              >
                <Text style={s.btnText}>{t('territories.noCall.remove')}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Text style={s.small}>{t('territories.noCall.reviewRule')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderLeftWidth: 4, borderLeftColor: '#c2410c', gap: 2 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.6, color: '#c2410c', textTransform: 'uppercase' },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK, marginTop: 2 },
  lead: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginBottom: 4 },
  row: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingVertical: 10 },
  tag: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#334155', backgroundColor: '#f1f5f9' },
  address: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 2 },
  late: { color: '#b45309', fontFamily: 'Manrope_700Bold' },
  pair: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  btn: { borderWidth: 1, borderColor: LINE, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#fff' },
  btnPrimary: { backgroundColor: BRAND, borderColor: BRAND },
  btnText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 6 },
  small: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: '#94a3b8', marginTop: 6 },
});
