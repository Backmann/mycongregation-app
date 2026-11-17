import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../../../components/KeyboardScroll';
import { territoriesApi } from '../../../../../lib/api';
import { failsScreen } from '../../../../../lib/screen-failure';
import { LoadFailure } from '../../../../../components/LoadFailure';
import { NoAccess } from '../../../../../components/NoAccess';
import { HistoryFeed } from '../../../../../components/territories/HistoryFeed';
import { BRAND } from '../../../../../components/reports/ReportBits';

/**
 * «Журнал участка» (17 November 2026; mockup board 5): everything that
 * happened to one territory in the year the journal keeps — given out,
 * handed on, worked, corrected, its boundary. For those who see the whole
 * section; read-only.
 */
export default function TerritoryJournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    throwOnError: failsScreen,
  });
  const open = !!accessQ.data?.seesAll && !!accessQ.data?.verified;
  const q = useQuery({
    queryKey: ['territories', 'detail', id],
    queryFn: () => territoriesApi.detail(id!),
    enabled: open && !!id,
    throwOnError: failsScreen,
  });
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
  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={s.content}>
      <Stack.Screen options={{ title: t('territories.history.journalTitle', { number: q.data.number }) }} />
      <HistoryFeed territoryId={q.data.id} filters={['given', 'fixes', 'territory']} />
    </KeyboardScroll>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
