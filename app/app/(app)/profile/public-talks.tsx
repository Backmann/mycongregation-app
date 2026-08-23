import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import i18n from '../../../lib/i18n';
import {
  extractErrorMessage,
  PublicTalk,
  publicTalksApi,
} from '../../../lib/api';

export default function PublicTalksScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const query = useQuery({
    queryKey: ['public-talks', { search, includeInactive: showInactive }],
    queryFn: () =>
      publicTalksApi.list({
        search: search.trim() || undefined,
        includeInactive: showInactive,
        limit: 500,
      }),
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['public-talks'] });
    }, [queryClient]),
  );

  /** «Кто и когда» — read from the journal, which has recorded it all along. */
  const lastImportQuery = useQuery({
    queryKey: ['public-talks', 'last-import'],
    queryFn: () => publicTalksApi.lastImport(),
  });
  const lastImport = lastImportQuery.data;

  const talks = query.data?.data ?? [];
  const total = query.data?.total ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#94a3b8" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={t('publicTalks.searchPlaceholder')}
          placeholderTextColor="#cbd5e1"
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#cbd5e1" />
          </Pressable>
        )}
      </View>

      <View style={styles.toolbar}>
        <Pressable
          style={styles.toggleButton}
          onPress={() => setShowInactive((v) => !v)}
        >
          <Ionicons
            name={showInactive ? 'checkbox' : 'square-outline'}
            size={16}
            color={showInactive ? '#0ea5e9' : '#94a3b8'}
          />
          <Text style={styles.toggleText}>
            {t('publicTalks.showRetired')}
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        {/* Two acts, two buttons: loading a catalogue, and striking out the
            talks an instruction says are no longer to be given. */}
        <Pressable
          style={styles.retireButton}
          onPress={() => router.push('/profile/public-talks-retire' as any)}
        >
          <Ionicons name="close-circle-outline" size={16} color="#b45309" />
          <Text style={styles.retireButtonText}>
            {t('publicTalks.retire.button')}
          </Text>
        </Pressable>

        <Pressable
          style={styles.importButton}
          onPress={() => router.push('/profile/public-talks-import' as any)}
        >
          <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
          <Text style={styles.importButtonText}>
            {t('publicTalks.bulkImport')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => query.refetch()}
          />
        }
      >
        {query.isLoading ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : query.error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractErrorMessage(query.error)}
            </Text>
          </View>
        ) : talks.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="megaphone-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>
              {search
                ? t('publicTalks.emptySearch')
                : t('publicTalks.emptyTitle')}
            </Text>
            {!search && (
              <Text style={styles.emptySub}>
                {t('publicTalks.emptyHint', {
                  action: t('publicTalks.bulkImport'),
                })}
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.list}>
            {/* Was «190 talks» — English, written straight into the code, so
                it read the same in every language. */}
            {lastImport ? (
              <Text style={styles.lastImportText}>
                {t('publicTalks.lastImport', {
                  date: new Date(lastImport.at).toLocaleDateString(
                    i18n.language,
                    { day: 'numeric', month: 'long', year: 'numeric' },
                  ),
                  time: new Date(lastImport.at).toLocaleTimeString(
                    i18n.language,
                    { hour: '2-digit', minute: '2-digit' },
                  ),
                  name:
                    lastImport.actorName ?? t('publicTalks.someoneUnknown'),
                })}
              </Text>
            ) : null}
            <Text style={styles.totalText}>
              {search
                ? t('publicTalks.foundCount', { count: total, search })
                : t('publicTalks.totalCount', { count: total })}
            </Text>
            {talks.map((talk) => (
              <TalkRow key={talk.id} talk={talk} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * One talk, as the catalogue sees it: a number and a title.
 *
 * «Last given …» used to sit under the title. It belonged to the schedule, not
 * here — this screen answers «какие речи существуют», and the history of who
 * gave what turned a reference list into a report nobody asked it for.
 */
function TalkRow({ talk }: { talk: PublicTalk }) {
  const { t } = useTranslation();

  return (
    <View style={[styles.row, !talk.isActive && styles.rowInactive]}>
      <View style={styles.numberBadge}>
        <Text style={styles.numberText}>{talk.number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.title, !talk.isActive && styles.titleInactive]}
          numberOfLines={2}
        >
          {talk.title}
        </Text>
        {/* With the date when there is one: «снята» tells the coordinator
            nothing about whether it may still be given this Sunday. */}
        {!talk.isActive && (
          <Text style={styles.retiredLabel}>
            {talk.retiredFrom
              ? t('publicTalks.retiredFrom', {
                  date: new Date(
                    `${talk.retiredFrom}T00:00:00`,
                  ).toLocaleDateString(i18n.language, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }),
                })
              : t('publicTalks.retiredBadge')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  retireButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
    marginRight: 8,
  },
  retireButtonText: {
    fontSize: 13,
    color: '#b45309',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  numberBadgeRetired: { backgroundColor: '#fef3c7' },
  numberTextRetired: { color: '#b45309' },
  lastImportText: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
    lineHeight: 17,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 6,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  toggleText: { fontSize: 13, color: '#64748b' },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
  },
  importButtonText: { color: '#fff', fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},

  empty: { paddingVertical: 64, alignItems: 'center' },
  emptyTitle: {
    fontSize: 16,
    color: '#475569',
    marginTop: 12,
    fontWeight: '500', fontFamily: 'Manrope_500Medium',
  },
  emptySub: { fontSize: 13, color: '#94a3b8', marginTop: 4 },

  list: { backgroundColor: '#fff' },
  totalText: {
    fontSize: 12,
    color: '#64748b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowInactive: { opacity: 0.55 },
  numberBadge: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  numberText: { fontSize: 13, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1' },
  title: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  titleInactive: { textDecorationLine: 'line-through', color: '#64748b' },
  retiredLabel: {
    fontSize: 11,
    color: '#dc2626',
    marginTop: 2,
    fontWeight: '500', fontFamily: 'Manrope_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  hintText: { fontSize: 11 },

  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14 },
});
