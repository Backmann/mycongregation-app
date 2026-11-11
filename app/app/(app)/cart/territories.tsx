import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../components/KeyboardScroll';
import { territoriesApi, type TerritoryRow } from '../../../lib/api';
import { failsScreen } from '../../../lib/screen-failure';
import { LoadFailure } from '../../../components/LoadFailure';
import { NoAccess } from '../../../components/NoAccess';
import { TerritoryImport } from '../../../components/territories/TerritoryImport';
import { TerritoryMap, type MapShape } from '../../../components/territories/TerritoryMap';
import { AssignSheet } from '../../../components/territories/AssignSheet';
import { SegmentedControl } from '../../../components/SegmentedControl';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../../../components/reports/ReportBits';
import { formatDateISO } from '../../../lib/dates';
import {
  formatDayShort,
  TONE_COLOR,
  toneOf,
  type TerritoryTone,
} from '../../../lib/territory-view';

type Filter = 'attention' | 'held' | 'free' | 'all';

/**
 * «Участки» (11 November 2026; mockup «Все участки»).
 *
 * Who is let in is the server's answer (territories/access): the territory
 * servant, his assistant and administrators always; the service committee
 * once the brought-over records are confirmed. Until then the keepers see
 * the import; afterwards the map, the four counts and the list — first
 * what needs attention: held past four months, and free for more than a
 * year (give those out first).
 */
export default function TerritoriesScreen() {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    throwOnError: failsScreen,
  });
  const a = accessQ.data;
  const open = !!a?.seesAll && !!a?.verified;
  const listQ = useQuery({
    queryKey: ['territories', 'list'],
    queryFn: () => territoriesApi.list(),
    enabled: open,
    throwOnError: failsScreen,
  });
  const boundaryQ = useQuery({
    queryKey: ['territories', 'boundary'],
    queryFn: () => territoriesApi.boundary(),
    enabled: open,
  });
  const today = formatDateISO(new Date());
  const [filter, setFilter] = useState<Filter>('attention');
  const [query, setQuery] = useState('');
  const [giving, setGiving] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      (listQ.data ?? []).map((r) => ({ row: r, tone: toneOf(r, today) as TerritoryTone })),
    [listQ.data, today],
  );
  const counts = useMemo(() => {
    const n = (tone: TerritoryTone) => rows.filter((r) => r.tone === tone).length;
    return {
      total: rows.length,
      held: n('held') + n('overdue'),
      overdue: n('overdue'),
      idle: n('idle'),
    };
  }, [rows]);
  const shapes: MapShape[] = useMemo(
    () => rows.map(({ row, tone }) => ({ id: row.id, number: row.number, geometry: row.geometry, tone })),
    [rows],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = (r: TerritoryRow) =>
      !needle ||
      r.number.toLowerCase().includes(needle) ||
      (r.locality ?? '').toLowerCase().includes(needle) ||
      (r.holder?.name ?? '').toLowerCase().includes(needle);
    const list = rows.filter(({ row }) => match(row));
    if (filter === 'held') return list.filter((r) => r.tone === 'held' || r.tone === 'overdue');
    if (filter === 'free') return list.filter((r) => r.tone === 'idle' || r.tone === 'free');
    if (filter === 'attention') {
      const overdue = list
        .filter((r) => r.tone === 'overdue')
        .sort((x, y) => x.row.holder!.assignedOn.localeCompare(y.row.holder!.assignedOn));
      const idle = list
        .filter((r) => r.tone === 'idle')
        .sort((x, y) => (x.row.lastCompletedOn ?? '').localeCompare(y.row.lastCompletedOn ?? ''));
      return [...overdue, ...idle];
    }
    return list;
  }, [rows, filter, query]);

  if (accessQ.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (accessQ.error) return <LoadFailure error={accessQ.error} onRetry={() => accessQ.refetch()} />;
  if (!a || !a.seesAll) return <NoAccess />;

  const mine = a.mine.filter((m) => m.mine);

  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={s.content}>
      <View style={s.head}>
        <Text style={s.kicker}>{t('territories.kicker')}</Text>
        <Text style={s.sub}>
          {a.verified
            ? t('territories.verifiedSince', {
                date: a.verifiedAt ? formatDayShort(a.verifiedAt.slice(0, 10), i18n.language) : '',
              })
            : t('territories.notVerified')}
        </Text>
      </View>

      {!a.verified ? (
        a.keeps ? (
          <TerritoryImport onDone={() => accessQ.refetch()} />
        ) : (
          <NoAccess />
        )
      ) : listQ.isLoading ? (
        <ActivityIndicator color={BRAND} />
      ) : listQ.error ? (
        <LoadFailure error={listQ.error} onRetry={() => listQ.refetch()} />
      ) : (
        <>
          {mine.length > 0 ? (
            <Pressable
              onPress={() => router.push('/cart/my-territories' as never)}
              style={s.mineBanner}
              accessibilityRole="button"
            >
              <Ionicons name="map-outline" size={18} color={BRAND} />
              <Text style={s.mineText}>
                {t('territories.overview.mine', { list: mine.map((m) => m.number).join(', ') })}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={MUTED} />
            </Pressable>
          ) : null}

          {Platform.OS === 'web' ? (
            <>
              <TerritoryMap
                shapes={shapes}
                boundary={boundaryQ.data?.geometry ?? null}
                onSelect={(id) => router.push(`/cart/territory/${id}` as never)}
                height={wide ? 440 : 300}
              />
              <View style={s.legend}>
                {(['held', 'overdue', 'idle', 'free'] as TerritoryTone[]).map((tone) => (
                  <View key={tone} style={s.legendItem}>
                    <View style={[s.legendDot, { backgroundColor: TONE_COLOR[tone] }]} />
                    <Text style={s.legendText}>{t(`territories.tone.${tone}`)}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <View style={s.tiles}>
            <Tile value={counts.total} label={t('territories.tiles.total')} />
            <Tile value={counts.held} label={t('territories.tiles.held')} tone={TONE_COLOR.held} />
            <Tile value={counts.overdue} label={t('territories.tiles.overdue')} tone={TONE_COLOR.overdue} />
            <Tile value={counts.idle} label={t('territories.tiles.idle')} tone={TONE_COLOR.idle} />
          </View>

          <SegmentedControl<Filter>
            segments={[
              { key: 'attention', label: t('territories.filter.attention') },
              { key: 'held', label: t('territories.filter.held') },
              { key: 'free', label: t('territories.filter.free') },
              { key: 'all', label: t('territories.filter.all') },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <View style={s.search}>
            <Ionicons name="search" size={16} color={MUTED} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('territories.overview.search')}
              placeholderTextColor="#94a3b8"
              style={s.searchInput}
            />
          </View>

          <View style={[cardStyles.card, s.listCard]}>
            {shown.map(({ row, tone }) => (
              <Row
                key={row.id}
                row={row}
                tone={tone}
                today={today}
                lang={i18n.language}
                onGive={a.keeps && !row.holder ? () => setGiving(row.id) : undefined}
              />
            ))}
            {shown.length === 0 ? (
              <Text style={s.empty}>
                {filter === 'attention' ? t('territories.overview.nothingDue') : t('territories.overview.none')}
              </Text>
            ) : null}
          </View>
          {Platform.OS !== 'web' ? <Text style={s.next}>{t('territories.overview.mapOnWeb')}</Text> : null}
        </>
      )}
      {giving ? <AssignSheet territoryId={giving} visible onClose={() => setGiving(null)} /> : null}
    </KeyboardScroll>
  );
}

function Tile({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <View style={s.tile}>
      <Text style={[s.tileValue, tone ? { color: tone } : null]}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

function Row({
  row,
  tone,
  today,
  lang,
  onGive,
}: {
  row: TerritoryRow;
  tone: TerritoryTone;
  today: string;
  lang: string;
  onGive?: () => void;
}) {
  const { t } = useTranslation();
  const h = row.holder;
  return (
    <Pressable
      onPress={() => router.push(`/cart/territory/${row.id}` as never)}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
      accessibilityRole="button"
    >
      <View style={[s.bar, { backgroundColor: TONE_COLOR[tone] }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.number}>
          {row.number}
          {row.locality ? <Text style={s.locality}> · {row.locality}</Text> : null}
        </Text>
        <Text style={s.meta}>
          {h
            ? t('territories.row.held', {
                name: h.forGroupName ? `${h.forGroupName} · ${h.name}` : h.name,
                date: formatDayShort(h.assignedOn, lang),
              })
            : row.lastCompletedOn
              ? t('territories.row.free', { date: formatDayShort(row.lastCompletedOn, lang) })
              : t('territories.row.freeNever')}
        </Text>
      </View>
      {h?.dueOn ? (
        <Text style={[s.due, h.dueOn < today && { color: TONE_COLOR.overdue }]}>
          {t('territories.row.due', { date: formatDayShort(h.dueOn, lang) })}
        </Text>
      ) : onGive ? (
        <Pressable onPress={onGive} style={s.give} accessibilityRole="button" hitSlop={6}>
          <Text style={s.giveText}>{t('territories.overview.give')}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 40, maxWidth: 960, width: '100%', alignSelf: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: {},
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11.5, letterSpacing: 1, color: '#15803d', textTransform: 'uppercase' },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: MUTED, marginTop: 4 },
  mineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ecfeff',
    borderColor: '#a5f3fc',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  mineText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: -4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: 140, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: LINE, padding: 12 },
  tileValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 24, color: INK },
  tileLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: MUTED, marginTop: 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontFamily: 'Manrope_500Medium', fontSize: 14, color: INK },
  listCard: { paddingVertical: 6, marginBottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pressed: { opacity: 0.6 },
  bar: { width: 5, alignSelf: 'stretch', borderRadius: 3 },
  number: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: INK },
  locality: { fontFamily: 'Manrope_500Medium', color: MUTED },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
  due: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: MUTED },
  give: { borderWidth: 1, borderColor: BRAND, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  giveText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: BRAND },
  empty: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, paddingVertical: 12, textAlign: 'center' },
  next: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, textAlign: 'center' },
});
