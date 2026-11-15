import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../../../components/KeyboardScroll';
import {
  extractErrorMessage,
  territoriesApi,
  type TerritoryHomes,
  type TerritoryHouse,
} from '../../../../../lib/api';
import { failsScreen } from '../../../../../lib/screen-failure';
import { LoadFailure } from '../../../../../components/LoadFailure';
import { NoAccess } from '../../../../../components/NoAccess';
import { Sheet } from '../../../../../components/Sheet';
import { UndoBar } from '../../../../../components/UndoBar';
import { confirm } from '../../../../../components/ConfirmHost';
import { TerritoryMap, type MapDot } from '../../../../../components/territories/TerritoryMap';
import {
  byStreet,
  filterHomes,
  HOME_COLORS,
  nextToLookAt,
  stateOf,
  toLookAt,
  type HomeFilter,
} from '../../../../../lib/homes';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../../../../../components/reports/ReportBits';

const AMBER_INK = '#7a4300';
const AMBER_BG = '#fdf1df';

/**
 * «Дома участка» (15 November 2026): the buildings of a territory — what the
 * land register says each one is, and the keepers' own word where the map
 * is wrong: a home, not a home, or back to the rule. A correction of the
 * map, about buildings only: no note, nothing about people. On a map, or
 * as a list by street (a shed of a few metres is hard to hit with a finger).
 */
export default function HomesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    throwOnError: failsScreen,
  });
  const keeps = !!accessQ.data?.keeps;
  const detailQ = useQuery({
    queryKey: ['territories', 'detail', id],
    queryFn: () => territoriesApi.detail(id!),
    enabled: keeps && !!id,
  });
  const homesQ = useQuery({
    queryKey: ['territories', 'homes', id],
    queryFn: () => territoriesApi.homes(id!),
    enabled: keeps && !!id,
  });
  const [view, setView] = useState<'map' | 'list'>('map');
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [undo, setUndo] = useState<{
    message: string;
    back: { lon: number; lat: number; home: boolean | null };
  } | null>(null);

  const data = homesQ.data;
  const houses = data?.houses ?? [];
  const shown = useMemo(() => byStreet(filterHomes(houses, filter)), [houses, filter]);
  const house = houses.find((h) => h.key === chosen) ?? null;
  const counts = {
    all: houses.length,
    unsure: houses.filter(toLookAt).length,
    not: houses.filter((h) => !h.home).length,
    marked: houses.filter((h) => h.mark !== null).length,
  };
  const dots: MapDot[] = useMemo(
    () =>
      shown.map((h) => {
        const c = HOME_COLORS[stateOf(h)];
        return { lon: h.lon, lat: h.lat, color: c.fill, ring: c.ring || undefined, chosen: h.key === chosen };
      }),
    [shown, chosen],
  );

  if (accessQ.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={BRAND} />;
  if (!keeps) return <NoAccess />;
  if (homesQ.isError) return <LoadFailure error={homesQ.error} onRetry={() => void homesQ.refetch()} />;
  if (!data || !detailQ.data) return <ActivityIndicator style={{ marginTop: 40 }} color={BRAND} />;
  const d = detailQ.data;

  const nameOf = (h: TerritoryHouse) => h.label ?? t('territories.homes.noNumber');
  const whereOf = (h: TerritoryHouse) =>
    [
      h.label ? null : h.near ? t('territories.homes.nearOf', { label: h.near.label, m: h.near.m }) : null,
      t('territories.homes.area', { m: h.areaM2 }),
    ]
      .filter(Boolean)
      .join(' · ');

  const mark = async (h: TerritoryHouse, home: boolean | null) => {
    if (home === true && h.pieceOf !== null && !h.home) {
      const yes = await confirm({
        title: t('territories.homes.pieceConfirmTitle'),
        body: t('territories.homes.pieceConfirmBody', { label: h.pieceOf || nameOf(h) }),
        confirmLabel: t('territories.homes.pieceConfirmYes'),
      });
      if (!yes) return;
    }
    setBusy(true);
    setFailed(null);
    try {
      const next: TerritoryHomes = await territoriesApi.markHome(id!, { lon: h.lon, lat: h.lat, home });
      qc.setQueryData(['territories', 'homes', id], next);
      void qc.invalidateQueries({ queryKey: ['territories', 'list'] });
      const word = home === null ? 'doneRule' : home ? 'doneHome' : 'doneNot';
      setUndo({
        message: t(`territories.homes.${word}`, { label: nameOf(h) }),
        back: { lon: h.lon, lat: h.lat, home: h.mark },
      });
    } catch (e) {
      setFailed(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    const n = nextToLookAt(houses, chosen);
    setChosen(n?.key ?? null);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t('territories.homes.screenTitle', { number: d.number }) }} />
      <KeyboardScroll contentContainerStyle={s.page}>
        {Platform.OS !== 'web' ? <Text style={s.note}>{t('territories.homes.onlyWeb')}</Text> : null}
        <View style={s.toggle} accessibilityRole="tablist">
          {(['map', 'list'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              style={[s.toggleBtn, view === v && s.toggleOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === v }}
            >
              <Text style={[s.toggleText, view === v && s.toggleTextOn]}>
                {t(v === 'map' ? 'territories.homes.viewMap' : 'territories.homes.viewList')}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.chips}>
          {(['all', 'unsure', 'not', 'marked'] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={[s.chip, filter === f && (f === 'unsure' ? s.chipAmber : s.chipOn)]}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === f }}
            >
              <Text style={[s.chipText, filter === f && (f === 'unsure' ? s.chipAmberText : s.chipOnText)]}>
                {t(`territories.homes.filter.${f}`, { n: counts[f] })}
              </Text>
            </Pressable>
          ))}
        </View>

        {houses.length === 0 ? <Text style={s.note}>{t('territories.homes.empty')}</Text> : null}

        {view === 'map' ? (
          <>
            <TerritoryMap
              shapes={[{ id: d.id, number: d.number, geometry: d.geometry, tone: 'mine' }]}
              focus={d.id}
              outline
              height={420}
              dots={dots}
              onDot={(i) => setChosen(shown[i]?.key ?? null)}
            />
            <View style={s.legend}>
              {(['home', 'not', 'unsure', 'piece'] as const).map((k) => (
                <View key={k} style={s.legendItem}>
                  <View
                    style={[
                      s.swatch,
                      { backgroundColor: HOME_COLORS[k].fill },
                      HOME_COLORS[k].ring ? { borderWidth: 2, borderColor: HOME_COLORS[k].ring } : null,
                    ]}
                  />
                  <Text style={s.legendText}>{t(`territories.homes.legend.${k}`)}</Text>
                </View>
              ))}
            </View>
            <Text style={s.note}>{t('territories.homes.hint')}</Text>
          </>
        ) : (
          <>
            <Text style={s.note}>{t('territories.homes.orderNote')}</Text>
            <View style={[cardStyles.card, { padding: 0 }]}>
              {shown.map((h, i) => (
                <Pressable
                  key={h.key}
                  onPress={() => setChosen(h.key)}
                  style={[s.row, i > 0 && s.rowLine]}
                  accessibilityRole="button"
                >
                  <View
                    style={[
                      s.swatch,
                      { backgroundColor: HOME_COLORS[stateOf(h)].fill },
                      HOME_COLORS[stateOf(h)].ring ? { borderWidth: 2, borderColor: HOME_COLORS[stateOf(h)].ring } : null,
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>
                      {h.label ?? (h.near ? t('territories.homes.nearOf', { label: h.near.label, m: h.near.m }) : t('territories.homes.noNumber'))}
                    </Text>
                    <Text style={s.rowSub}>
                      {(h.official ? t('territories.homes.rowCadastre', { w: h.official }) : t('territories.homes.rowUnknown')) +
                        ' · ' +
                        t(h.home ? 'territories.homes.rowNowHome' : 'territories.homes.rowNowNot')}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {data.gone.length > 0 && (filter === 'all' || filter === 'marked') ? (
          <View style={[cardStyles.card, { gap: 8 }]}>
            {data.gone.map((g) => (
              <View key={`${g.lon},${g.lat}`} style={{ gap: 6 }}>
                <Text style={s.goneText}>{t('territories.homes.goneTitle')}</Text>
                <Pressable
                  onPress={() =>
                    void (async () => {
                      setBusy(true);
                      try {
                        const next = await territoriesApi.markHome(id!, { lon: g.lon, lat: g.lat, home: null });
                        qc.setQueryData(['territories', 'homes', id], next);
                      } catch (e) {
                        setFailed(extractErrorMessage(e));
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                  style={s.smallBtn}
                  accessibilityRole="button"
                  disabled={busy}
                >
                  <Text style={s.smallBtnText}>{t('territories.homes.goneDrop')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {counts.unsure > 0 ? (
          <Pressable onPress={goNext} style={s.next} accessibilityRole="button">
            <Text style={s.nextText}>{t('territories.homes.next')}</Text>
          </Pressable>
        ) : (
          <Text style={s.note}>{t('territories.homes.noneLeft')}</Text>
        )}
      </KeyboardScroll>

      {house ? (
        <Sheet
          visible
          variant="bottom"
          title={nameOf(house)}
          subtitle={whereOf(house)}
          onClose={() => setChosen(null)}
        >
          <View style={{ gap: 12 }}>
            <View style={s.says}>
              <Text style={s.saysLabel}>{t('territories.homes.cadastreSays')}</Text>
              <Text style={s.saysWord}>{house.official ?? t('territories.homes.cadastreUnknown')}</Text>
              {house.use ? (
                <Text style={s.saysText}>{t(`territories.homes.means.${house.use}`)}</Text>
              ) : null}
              <Text style={[s.saysText, { color: INK, fontFamily: 'Manrope_600SemiBold' }]}>
                {t(house.home ? 'territories.homes.nowHome' : 'territories.homes.nowNot')}
              </Text>
              {house.mark !== null ? (
                <Text style={s.saysText}>
                  {t('territories.homes.markedNote', {
                    what: t(house.byRule ? 'territories.homes.ruleHome' : 'territories.homes.ruleNot'),
                  })}
                </Text>
              ) : null}
            </View>
            {house.pieceOf !== null && !house.home ? (
              <Text style={s.piece}>{t('territories.homes.pieceNote', { label: house.pieceOf || '—' })}</Text>
            ) : null}
            <Text style={s.question}>{t('territories.homes.question')}</Text>
            {(
              [
                [true, 'setHome'],
                [false, 'setNot'],
                [null, 'setRule'],
              ] as const
            ).map(([v, key]) => {
              const on = house.mark === v;
              return (
                <Pressable
                  key={key}
                  onPress={() => void mark(house, v)}
                  disabled={busy || on}
                  style={[s.choice, on && s.choiceOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: busy }}
                >
                  {v !== null ? (
                    <View
                      style={[s.swatch, { backgroundColor: v ? HOME_COLORS.home.fill : HOME_COLORS.not.fill }]}
                    />
                  ) : null}
                  <Text style={[s.choiceText, on && { fontFamily: 'Manrope_700Bold' }]}>{t(`territories.homes.${key}`)}</Text>
                </Pressable>
              );
            })}
            {failed ? <Text style={s.error}>{failed}</Text> : null}
            <Text style={s.foot}>{t('territories.homes.footnote')}</Text>
            {counts.unsure > 0 ? (
              <Pressable onPress={goNext} style={s.next} accessibilityRole="button">
                <Text style={s.nextText}>{t('territories.homes.next')}</Text>
              </Pressable>
            ) : null}
          </View>
        </Sheet>
      ) : null}

      {/* Under an open sheet the strip could not be reached: there the
          sheet's own buttons undo; the strip shows once it is closed. */}
      <UndoBar
        visible={!!undo && !house}
        message={undo?.message ?? ''}
        icon="arrow-undo-outline"
        onDismiss={() => setUndo(null)}
        onUndo={async () => {
          if (!undo) return;
          const next = await territoriesApi.markHome(id!, undo.back);
          qc.setQueryData(['territories', 'homes', id], next);
          setUndo(null);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 12, maxWidth: 900, width: '100%', alignSelf: 'center' },
  note: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, lineHeight: 19 },
  toggle: { flexDirection: 'row' },
  toggleBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BRAND,
  },
  toggleOn: { backgroundColor: BRAND },
  toggleText: { fontFamily: 'Manrope_600SemiBold', color: BRAND, fontSize: 14 },
  toggleTextOn: { color: '#ffffff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LINE,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  chipOn: { borderColor: BRAND, borderWidth: 2, backgroundColor: '#e8f0f2' },
  chipAmber: { borderColor: '#b45f06', borderWidth: 2, backgroundColor: AMBER_BG },
  chipText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: INK },
  chipOnText: { color: BRAND, fontFamily: 'Manrope_600SemiBold' },
  chipAmberText: { color: AMBER_INK, fontFamily: 'Manrope_600SemiBold' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: INK },
  swatch: { width: 16, height: 14, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  rowLine: { borderTopWidth: 1, borderTopColor: LINE },
  rowTitle: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: INK },
  rowSub: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, marginTop: 2 },
  goneText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#8a3b12' },
  smallBtn: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: LINE,
    justifyContent: 'center',
  },
  smallBtnText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: INK },
  next: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: AMBER_BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  nextText: { fontFamily: 'Manrope_600SemiBold', color: AMBER_INK, fontSize: 15 },
  says: { backgroundColor: '#f3f5f6', borderRadius: 10, padding: 12, gap: 6 },
  saysLabel: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED },
  saysWord: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: INK },
  saysText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, lineHeight: 19 },
  piece: { fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    color: BRAND,
    backgroundColor: '#e8f0f2',
    borderRadius: 10,
    padding: 10,
    lineHeight: 19,
  },
  question: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  choice: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  choiceOn: { borderColor: INK, borderWidth: 2, backgroundColor: '#f3f5f6' },
  choiceText: { fontFamily: 'Manrope_500Medium', fontSize: 15, color: INK },
  error: { fontFamily: 'Manrope_500Medium', color: '#b91c1c', fontSize: 14 },
  foot: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, lineHeight: 18 },
});
