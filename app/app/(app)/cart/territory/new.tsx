import { useEffect, useMemo, useState } from 'react';
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
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../../components/KeyboardScroll';
import {
  extractErrorMessage,
  territoriesApi,
  type TerritoryCategory,
  type TerritoryGeometry,
  type TerritoryNewCheck,
} from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { failsScreen } from '../../../../lib/screen-failure';
import { LoadFailure } from '../../../../components/LoadFailure';
import { NoAccess } from '../../../../components/NoAccess';
import { OutlineEditor } from '../../../../components/territories/OutlineEditor';
import { roundGeometry } from '../../../../lib/outline-edit';
import { boxOf } from '../../../../lib/territory-view';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../../../../components/reports/ReportBits';

type Kind = 'city' | 'suburb' | 'village';
const KINDS: Kind[] = ['city', 'suburb', 'village'];
/** Territories this far round the starting one are on the map (~1.5 km). */
const AROUND = 0.02;

/**
 * «Новый участок» (12 November 2026, mockup «Новый участок»): drawn on the
 * map point by point, the points drawn to neighbours and streets; beside it
 * what it holds — houses, houses no territory holds yet, overlaps — and the
 * card: kind, number (the next free one like its neighbours'), place.
 * Opened from a territory («рядом») or from the list.
 */
export default function NewTerritoryScreen() {
  const { near } = useLocalSearchParams<{ near?: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { width, height } = useWindowDimensions();
  const wide = width >= 1000;
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    throwOnError: failsScreen,
  });
  const a = accessQ.data;
  const open = !!a?.keeps && !!a?.verified && Platform.OS === 'web';
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

  const [category, setCategory] = useState<TerritoryCategory>('residential');
  const [drawn, setDrawn] = useState<TerritoryGeometry | null>(null);
  const [check, setCheck] = useState<TerritoryNewCheck | null>(null);
  const [number, setNumber] = useState('');
  const [locality, setLocality] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const rows = listQ.data;
  const start = rows?.find((r) => r.id === near) ?? null;
  const shown = useMemo(() => {
    if (!rows) return [];
    const same = rows.filter((r) => (r.category ?? 'residential') === category);
    if (!start) return same;
    const b = boxOf([start.geometry]);
    if (!b) return same;
    const [[x1, y1], [x2, y2]] = b;
    return same.filter((r) => {
      const o = boxOf([r.geometry]);
      if (!o) return false;
      const [[a1, b1], [a2, b2]] = o;
      return a1 <= x2 + AROUND * 1.6 && a2 >= x1 - AROUND * 1.6 && b1 <= y2 + AROUND && b2 >= y1 - AROUND;
    });
  }, [rows, start, category]);

  // The number and the place suggested from the territory it starts beside.
  useEffect(() => {
    if (!open) return;
    // Business territories are numbered «Д-1, Д-2…» (decision of 12 November 2026).
    // cyrillic-ok: the owner's numbering of business territories
    const like = start?.number ?? (category === 'business' ? 'Д-0' : rows?.[0]?.number ?? '');
    if (!like) return;
    territoriesApi
      .nextNumber(like)
      .then((r) => setNumber(r.number))
      .catch(() => undefined);
    if (start) {
      setLocality(start.locality ?? '');
      setKind(start.kind);
    }
  }, [open, start?.id, category, rows?.length]);

  // What it holds, a moment after the last point.
  useEffect(() => {
    setCheck(null);
    if (!drawn) return;
    let gone = false;
    const timer = setTimeout(() => {
      territoriesApi
        .newCheck(roundGeometry(drawn), category)
        .then((c) => {
          if (!gone) {
            setCheck(c);
            setError(null);
          }
        })
        .catch((e) => !gone && setError(extractErrorMessage(e)));
    }, 400);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [drawn, category]);

  const create = async () => {
    if (!drawn) return;
    setBusy(true);
    setError(null);
    try {
      const r = await territoriesApi.create({
        number: number.trim(),
        locality: locality.trim() || null,
        kind,
        category,
        geometry: roundGeometry(drawn),
      });
      await qc.invalidateQueries({ queryKey: ['territories'] });
      router.replace(`/cart/territory/${r.id}` as never);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={s.center}>
        <Text style={s.muted}>{t('territories.outline.webOnly')}</Text>
      </View>
    );
  }
  if (accessQ.isLoading || (open && listQ.isLoading)) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (accessQ.error) return <LoadFailure error={accessQ.error} onRetry={() => accessQ.refetch()} />;
  if (!a || !open || !user) return <NoAccess />;
  if (listQ.error || !rows) return <LoadFailure error={listQ.error} onRetry={() => listQ.refetch()} />;

  const ready = !!drawn && !!check && check.overlaps.length === 0 && !!number.trim() && !busy;
  const mapHeight = wide ? Math.max(480, height - 120) : 440;

  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={[s.content, wide && s.contentWide]}>
      <Stack.Screen options={{ title: t('territories.create.title') }} />
      <View style={wide ? s.mapWide : undefined}>
        <OutlineEditor
          key={`${category}:${round}:${shown.length}`}
          congregationId={user.congregationId}
          streetsReady={!!a.mapReady}
          main={null}
          neighbours={shown.map((r) => ({ id: r.id, number: r.number, geometry: r.geometry }))}
          boundary={boundaryQ.data?.geometry ?? null}
          sharedBorder
          snapStreets
          height={mapHeight}
          tool="draw"
          onChange={() => undefined}
          onDrawn={setDrawn}
        />
      </View>
      <View style={s.panel}>
        <Text style={s.title}>{t('territories.create.title')}</Text>
        <Text style={s.help}>{t('territories.create.help')}</Text>
        <View style={[cardStyles.card, s.box]}>
          <Text style={s.label}>{t('territories.create.category')}</Text>
          <View style={s.chips}>
            {(['residential', 'business'] as TerritoryCategory[]).map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  setCategory(c);
                  setDrawn(null);
                }}
                style={[s.chip, category === c && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: category === c }}
              >
                <Text style={[s.chipText, category === c && s.chipTextOn]}>{t(`territories.category.one.${c}`)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.label}>{t('territories.card.number')}</Text>
          <TextInput
            value={number}
            onChangeText={setNumber}
            style={s.input}
            maxLength={40}
            autoCapitalize="none"
            accessibilityLabel={t('territories.card.number')}
          />
          <Text style={s.label}>{t('territories.card.locality')}</Text>
          <TextInput
            value={locality}
            onChangeText={setLocality}
            style={s.input}
            maxLength={120}
            accessibilityLabel={t('territories.card.locality')}
          />
          <Text style={s.label}>{t('territories.card.kind')}</Text>
          <View style={s.chips}>
            {KINDS.map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(kind === k ? null : k)}
                style={[s.chip, kind === k && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: kind === k }}
              >
                <Text style={[s.chipText, kind === k && s.chipTextOn]}>{t(`territories.card.kinds.${k}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={[cardStyles.card, s.box]}>
          {!drawn ? (
            <Text style={s.muted}>{t('territories.create.notYet')}</Text>
          ) : !check ? (
            error ? null : <ActivityIndicator color={BRAND} />
          ) : (
            <>
              {check.houses !== null ? (
                <Text style={s.text}>
                  {t('territories.create.houses', { houses: check.houses, free: check.freeHouses ?? 0 })}
                </Text>
              ) : null}
              {check.overlaps.length > 0 ? (
                <Text style={s.bad}>{t('territories.create.overlaps', { numbers: check.overlaps.join(', ') })}</Text>
              ) : (
                <Text style={s.ok}>{t('territories.create.noOverlap')}</Text>
              )}
              {check.outsideBoundary > 0 ? (
                <Text style={s.warn}>{t('territories.outline.outside', { share: check.outsideBoundary })}</Text>
              ) : null}
            </>
          )}
        </View>
        {error ? <Text style={s.bad}>{error}</Text> : null}
        <Pressable
          onPress={() => void create()}
          disabled={!ready}
          style={[s.go, !ready && s.off]}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>{t('territories.create.go')}</Text>}
        </Pressable>
        <Pressable
          onPress={() => {
            setDrawn(null);
            setRound((r) => r + 1);
          }}
          style={s.link}
          accessibilityRole="button"
        >
          <Text style={s.linkText}>{t('territories.create.again')}</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={s.link} accessibilityRole="button">
          <Text style={s.linkText}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </KeyboardScroll>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 40, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
  contentWide: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: 1600 },
  mapWide: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 380, gap: 10 },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: INK },
  help: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, lineHeight: 18 },
  box: { marginBottom: 0, gap: 8 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: INK,
    backgroundColor: '#fff',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: LINE, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  chipTextOn: { color: '#fff' },
  muted: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, lineHeight: 18 },
  text: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: INK, lineHeight: 18 },
  ok: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#047857' },
  warn: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#b45309', lineHeight: 17 },
  bad: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: '#b91c1c', lineHeight: 17 },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  off: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  link: { paddingVertical: 8, alignItems: 'center' },
  linkText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: BRAND },
});
