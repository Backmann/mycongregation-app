import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  extractErrorMessage,
  territoriesApi,
  type TerritoryHistoryFilter,
  type TerritoryHistoryItem,
} from '../../lib/api';
import { dayHeading, historyLine } from '../../lib/territory-history';
import { formatDayShort } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

const PAGE = 30;

/**
 * What happened to the territories (17 November 2026; mockup boards 5 and
 * 6): «Что происходит» on the desk — every territory, the number on the left
 * opening its card — and one territory's journal. Newest first, under
 * «Сегодня», «Вчера» or the day; who did it and when on each line.
 */
export function HistoryFeed({
  territoryId,
  filters,
}: {
  /** One territory's journal; absent — the whole section. */
  territoryId?: string;
  filters: TerritoryHistoryFilter[];
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [filter, setFilter] = useState<TerritoryHistoryFilter | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['territories', 'history', territoryId ?? 'all', filter ?? 'all'],
    queryFn: ({ pageParam }) =>
      territoriesApi.history({
        ...(territoryId ? { territoryId } : {}),
        ...(filter ? { filter } : {}),
        ...(pageParam ? { before: pageParam } : {}),
        limit: PAGE,
      }),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const date = (iso: string) => formatDayShort(iso, lang);
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  const now = new Date();

  const groups: { heading: string; items: TerritoryHistoryItem[] }[] = [];
  for (const it of items) {
    const heading = dayHeading(it.at, now, t, date);
    const last = groups[groups.length - 1];
    if (last?.heading === heading) last.items.push(it);
    else groups.push({ heading, items: [it] });
  }

  return (
    <View>
      <View style={s.chips}>
        {[null, ...filters].map((f) => {
          const on = filter === f;
          return (
            <Pressable
              key={f ?? 'all'}
              onPress={() => setFilter(f)}
              style={[s.chip, on && s.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.chipText, on && s.chipTextOn]}>
                {t(`territories.history.filter.${f ?? 'all'}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={BRAND} style={{ marginVertical: 24 }} />
      ) : q.error ? (
        <Text style={s.error}>{extractErrorMessage(q.error)}</Text>
      ) : items.length === 0 ? (
        <Text style={s.muted}>
          {filter ? t('territories.history.emptyFilter') : t('territories.history.empty')}
        </Text>
      ) : (
        groups.map((g) => (
          <View key={g.heading}>
            <Text style={s.day}>{g.heading}</Text>
            <View style={s.card}>
              {g.items.map((it) => {
                const l = historyLine(it, t, date);
                const by = it.actor
                  ? t('territories.history.by', { name: it.actor, time: time(it.at) })
                  : t('territories.history.byNobody', { time: time(it.at) });
                const open = !territoryId && !!it.territoryId;
                return (
                  <Pressable
                    key={it.id}
                    disabled={!open}
                    onPress={() => router.push(`/cart/territory/${it.territoryId}` as never)}
                    style={({ pressed }) => [s.row, pressed && open && { opacity: 0.6 }]}
                    accessibilityRole={open ? 'link' : undefined}
                  >
                    {!territoryId ? (
                      <Text style={s.number}>{it.number ?? '—'}</Text>
                    ) : null}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.title}>{l.title}</Text>
                      {l.meta ? <Text style={s.meta}>{l.meta}</Text> : null}
                      <Text style={s.by}>{by}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))
      )}

      {q.hasNextPage ? (
        <Pressable
          onPress={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
          style={s.more}
          accessibilityRole="button"
        >
          {q.isFetchingNextPage ? (
            <ActivityIndicator color={BRAND} />
          ) : (
            <Text style={s.moreText}>{t('territories.history.more')}</Text>
          )}
        </Pressable>
      ) : null}
      <Text style={s.kept}>{t('territories.history.kept')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff' },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  chipTextOn: { color: '#fff' },
  day: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: MUTED,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: LINE, paddingHorizontal: 14 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  number: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 13,
    color: BRAND,
    width: 76,
    paddingTop: 1,
  },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK, lineHeight: 19 },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: INK, marginTop: 2, lineHeight: 17 },
  by: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 3 },
  more: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 18, marginTop: 10 },
  moreText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: BRAND },
  muted: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: MUTED, marginVertical: 14 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginVertical: 14 },
  kept: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: '#94a3b8', marginTop: 12, lineHeight: 16 },
});
