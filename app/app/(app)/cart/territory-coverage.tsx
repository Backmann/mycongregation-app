import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../components/KeyboardScroll';
import { LoadFailure } from '../../../components/LoadFailure';
import { NoAccess } from '../../../components/NoAccess';
import { extractErrorMessage, meetingSettingsApi, territoriesApi } from '../../../lib/api';
import { failsScreen } from '../../../lib/screen-failure';
import { formatDayShort } from '../../../lib/territory-view';
import { buildLongUnworkedHtml } from '../../../lib/territory-coverage';
import { exportHtmlAsPdf, openPrintWindow } from '../../../lib/pdf';
import { BRAND, INK, LINE, MUTED } from '../../../components/reports/ReportBits';

/**
 * «Не обработаны 2 года и дольше» (17 November 2026; mockup board 15): the
 * territories the elders talk over with the circuit overseer. For the
 * service committee and the keepers; preliminary while the records are
 * young — the days before the app came over from earlier records. The file
 * for the visit is a separate file (Lionel, 17 November 2026).
 */
export default function TerritoryCoverageScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    throwOnError: failsScreen,
  });
  const open = !!accessQ.data?.seesAll && !!accessQ.data?.verified;
  const q = useQuery({
    queryKey: ['territories', 'coverage', 'long'],
    queryFn: () => territoriesApi.longUnworked(),
    enabled: open,
    throwOnError: failsScreen,
  });
  const congQ = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
    enabled: open,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (accessQ.isLoading || (open && q.isLoading)) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (accessQ.error) return <LoadFailure error={accessQ.error} onRetry={() => accessQ.refetch()} />;
  if (!open) return <NoAccess />;
  if (q.error || !q.data) return <LoadFailure error={q.error} onRetry={() => q.refetch()} />;
  const data = q.data;
  const day = (iso: string) => formatDayShort(iso, lang);

  const download = () => {
    const preopened = openPrintWindow();
    setBusy(true);
    setError(null);
    void exportHtmlAsPdf(
      buildLongUnworkedHtml(data, congQ.data?.congregation?.name ?? '', t, day),
      { fileName: t('territories.coverage.fileTitle'), preopenedWindow: preopened },
    )
      .catch((e) => {
        preopened?.close();
        setError(extractErrorMessage(e));
      })
      .finally(() => setBusy(false));
  };

  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={s.content}>
      <View style={[s.card, s.note]}>
        <Text style={s.kicker}>{t('territories.coverage.preliminaryTitle')}</Text>
        <Text style={s.noteText}>
          {data.recordsFrom
            ? t('territories.coverage.preliminary', { date: day(data.recordsFrom) })
            : t('territories.coverage.preliminaryNoDate')}
        </Text>
      </View>
      <View style={s.card}>
        <Text style={s.kicker}>{t('territories.coverage.longCount', { count: data.items.length })}</Text>
        {data.items.length === 0 ? (
          <Text style={s.muted}>{t('territories.coverage.noneLong')}</Text>
        ) : (
          data.items.map((i) => (
            <Pressable
              key={i.territoryId}
              onPress={() => router.push(`/cart/territory/${i.territoryId}` as never)}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
              accessibilityRole="link"
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.number}>
                  {i.number}
                  {i.locality ? <Text style={s.locality}> · {i.locality}</Text> : null}
                </Text>
                <Text style={s.meta}>
                  {i.lastWorkedOn
                    ? t('territories.coverage.lastWorked', { date: day(i.lastWorkedOn) })
                    : t('territories.coverage.never')}
                  {' · '}
                  {i.heldSince
                    ? t('territories.coverage.heldSince', { date: day(i.heldSince) })
                    : t('territories.coverage.free')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={MUTED} />
            </Pressable>
          ))
        )}
      </View>
      {(data.noRecord ?? 0) > 0 ? (
        <Text style={s.small}>{t('territories.coverage.noRecordHint', { count: data.noRecord })}</Text>
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable
        onPress={download}
        disabled={busy}
        style={({ pressed }) => [s.go, (busy || pressed) && { opacity: 0.7 }]}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.goText}>{t('territories.coverage.download')}</Text>
        )}
      </Pressable>
      <Text style={s.small}>{t('territories.coverage.fileHint')}</Text>
    </KeyboardScroll>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 14 },
  note: { backgroundColor: '#fffbeb', borderColor: '#fde68a', gap: 4 },
  noteText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: '#92400e', lineHeight: 19 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11.5, letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  number: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: INK },
  locality: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: MUTED },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: INK, marginTop: 2 },
  muted: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: MUTED, paddingVertical: 10 },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  small: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, lineHeight: 17 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
});
