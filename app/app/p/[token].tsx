import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage, territoriesApi, type SharedPart } from '../../lib/api';
import {
  TerritoryMap,
  type MapDot,
  type MapPoint,
  type MapRoute,
} from '../../components/territories/TerritoryMap';
import { StreetLine } from '../../components/territories/StreetLine';
import { Sheet } from '../../components/Sheet';
import {
  clockOf,
  partAcross,
  partColor,
  partDone,
  routeTo,
  streetsToTake,
  walkedOf,
  walkingOrder,
  withTicks,
  type PartLike,
} from '../../lib/division';
import { useStreetTicks } from '../../lib/useStreetTicks';
import { useHere } from '../../lib/useHere';
import { BRAND, INK, LINE, MUTED } from '../../components/reports/ReportBits';

const HERE = '#2563eb';

/**
 * One part of a territory divided between groups, behind a link without
 * login (13 November 2026): for a group at the meeting place, opened from a
 * QR code or a message. Its streets to tick as they are walked (every group
 * sees the ticks), the way there, and how many «не посещать» addresses lie
 * on them — never which: the conductor names them. Good on that day only.
 *
 * «Пары на участке» (13 November 2026): the streets in walking order,
 * numbered on the map too; each house a dot of the part's colour; the common
 * start; «вы здесь» on a tap, never sent anywhere; ticks kept on the phone
 * without a connection; a pair done early takes a street of a pair that has
 * not started.
 */
export default function SharedPartScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['territory-part', token];
  const q = useQuery({
    queryKey: key,
    queryFn: () => territoriesApi.sharedPart(token!),
    enabled: !!token,
    retry: false,
    refetchInterval: 60 * 1000,
  });
  const saved = (d: SharedPart) => qc.setQueryData(key, d);
  const ticks = useStreetTicks<SharedPart>(
    token ? `part:${token}` : null,
    (k, walked) => territoriesApi.markSharedPart(token!, k, walked),
    saved,
  );
  const take = useMutation({
    mutationFn: (k: string) => territoriesApi.takeSharedStreet(token!, k),
    onSuccess: saved,
  });
  const here = useHere();

  const d = q.data;
  const color = d ? partColor(d.part.n) : BRAND;
  const streets = useMemo(() => (d ? withTicks(d.part.streets, ticks.queue) : []), [d, ticks.queue]);
  const routes = useMemo<MapRoute[]>(
    () => streets.map((x) => ({ lines: x.lines, color, walked: !!x.walkedAt })),
    [streets, color],
  );
  const dots = useMemo<MapDot[]>(
    () =>
      streets.flatMap((x) =>
        (x.dots ?? []).map(([lon, lat]) => ({ lon, lat, color, walked: !!x.walkedAt })),
      ),
    [streets, color],
  );
  const points = useMemo<MapPoint[]>(() => {
    if (!d) return [];
    const out: MapPoint[] = [];
    // The common start of «pairs near»; else where this part begins.
    const start = d.start ?? d.part.start;
    if (start) out.push({ label: '', lon: start[0], lat: start[1], done: false, color: INK, kind: 'start' });
    for (const x of walkingOrder(streets)) {
      const line = x.lines[0];
      const mid = line?.[Math.floor(line.length / 2)];
      if (mid && !x.walkedAt) out.push({ label: String(x.step), lon: mid[0], lat: mid[1], done: false, color });
    }
    if (here.here) out.push({ label: '', lon: here.here[0], lat: here.here[1], done: false, color: HERE, kind: 'here' });
    return out;
  }, [d, streets, color, here.here]);

  if (q.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (q.error || !d) {
    return (
      <View style={s.center}>
        <Ionicons name="link-outline" size={30} color="#94a3b8" />
        <Text style={s.goneTitle}>{t('territories.part.gone')}</Text>
        <Text style={s.goneText}>{t('territories.part.goneHint')}</Text>
      </View>
    );
  }
  return (
    <Part
      d={d}
      streets={streets}
      routes={routes}
      dots={dots}
      points={points}
      ticks={ticks}
      take={take}
      here={here}
    />
  );
}

function Part({
  d,
  streets,
  routes,
  dots,
  points,
  ticks,
  take,
  here,
}: {
  d: SharedPart;
  streets: (SharedPart['part']['streets'][number] & { pending: boolean })[];
  routes: MapRoute[];
  dots: MapDot[];
  points: MapPoint[];
  ticks: ReturnType<typeof useStreetTicks<SharedPart>>;
  take: { mutate: (key: string) => void; isPending: boolean; error: unknown };
  here: ReturnType<typeof useHere>;
}) {
  const { t } = useTranslation();
  const [taking, setTaking] = useState(false);
  const color = partColor(d.part.n);
  const part = { ...d.part, streets };
  const w = walkedOf([part]);
  const route = routeTo(d.start ?? d.part.start);
  // The other pairs as parts, for «across the road» and «take a street».
  const others: (PartLike & { untouched: boolean })[] = (d.others ?? []).map((o) => ({
    n: o.n,
    untouched: o.untouched,
    houses: 0,
    streets: o.streets.map((x) => ({
      ...x,
      from: null,
      to: null,
      piece: 1,
      pieces: 1,
      walkedAt: null,
    })),
  }));
  const all: PartLike[] = [part, ...others];
  const toTake = partDone(part) ? streetsToTake(others, d.part.n) : [];
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      {Platform.OS === 'web' ? (
        <TerritoryMap
          shapes={[{ id: 'part', number: d.number, geometry: d.geometry, tone: 'mine' }]}
          focus="part"
          height={340}
          file={{ congregationId: d.congregationId, ready: d.mapReady }}
          routes={routes}
          dots={dots}
          points={points}
        />
      ) : null}
      {here.available ? (
        <View style={s.hereRow}>
          <Pressable onPress={here.toggle} style={[s.hereBtn, here.on && s.hereOn]} accessibilityRole="button">
            <Ionicons name="locate-outline" size={15} color={here.on ? '#fff' : HERE} />
            <Text style={[s.hereText, here.on && { color: '#fff' }]}>{t('territories.division.whereAmI.button')}</Text>
          </Pressable>
          <Text style={s.hereNote}>
            {here.failed ? t('territories.division.whereAmI.failed') : t('territories.division.whereAmI.private')}
          </Text>
        </View>
      ) : null}
      <View style={[s.card, { borderLeftColor: color }]}>
        <Text style={s.kicker}>{t('territories.part.today')}</Text>
        <Text style={s.title}>
          {d.number}
          {d.locality ? <Text style={s.locality}> · {d.locality}</Text> : null}
        </Text>
        <Text style={[s.partLine, { color }]}>
          {t('territories.part.which', { n: d.part.n, count: d.parts })} ·{' '}
          {t('territories.division.houses', { count: d.part.houses })}
        </Text>
        <Text style={s.sub}>
          {partDone(part)
            ? t('territories.division.partDone')
            : t('territories.division.streetsWalked', { walked: w.streetsWalked, count: w.streets })}
        </Text>
        {d.noCalls > 0 ? (
          <View style={s.nc}>
            <Ionicons name="hand-left-outline" size={15} color="#c2410c" />
            <Text style={s.ncText}>{t('territories.part.noCalls', { count: d.noCalls })}</Text>
          </View>
        ) : null}
      </View>

      <View style={s.card}>
        <Text style={s.h}>{t('territories.part.streets')}</Text>
        {walkingOrder(streets).map((x) => (
          <Pressable
            key={x.key}
            onPress={() => void ticks.tick(x.key, !x.walkedAt)}
            disabled={ticks.busy}
            style={s.street}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!x.walkedAt }}
          >
            <Text style={[s.step, { color: x.walkedAt ? MUTED : color }]}>{x.step}</Text>
            <View style={[s.box, x.walkedAt && s.boxOn, x.pending && ticks.stuck && s.boxPending]}>
              {x.walkedAt ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <StreetLine street={x} across={partAcross(all, d.part.n, x)} pending={x.pending && ticks.stuck} />
            </View>
            {x.walkedAt && !x.pending ? <Text style={s.walkedAt}>{clockOf(x.walkedAt)}</Text> : null}
          </Pressable>
        ))}
        <Text style={s.hint}>{t('territories.part.tapHint')}</Text>
        {ticks.stuck && ticks.queue.length > 0 ? (
          <View style={s.offline}>
            <Ionicons name="cloud-offline-outline" size={16} color="#92400e" />
            <Text style={s.offlineText}>{t('territories.division.waiting', { count: ticks.queue.length })}</Text>
          </View>
        ) : null}
        {ticks.error ? <Text style={s.error}>{ticks.error}</Text> : null}
      </View>

      {toTake.length > 0 ? (
        <Pressable
          onPress={() => setTaking(true)}
          style={({ pressed }) => [s.takeBtn, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={17} color={BRAND} />
          <Text style={s.takeText}>{t('territories.division.take')}</Text>
        </Pressable>
      ) : null}

      {route ? (
        <Pressable
          onPress={() => void Linking.openURL(route)}
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.8 }]}
          accessibilityRole="link"
        >
          <Ionicons name="navigate-outline" size={17} color="#fff" />
          <Text style={s.ctaText}>{t('territories.part.route')}</Text>
        </Pressable>
      ) : null}

      <Sheet
        visible={taking}
        title={t('territories.division.takeTitle')}
        subtitle={<Text style={s.hint}>{t('territories.division.takeHint')}</Text>}
        onClose={() => setTaking(false)}
        variant="bottom"
      >
        <View style={{ gap: 8, paddingBottom: 8 }}>
          {toTake.map(({ from, street }) => (
            <Pressable
              key={street.key}
              disabled={take.isPending}
              onPress={() => {
                take.mutate(street.key);
                setTaking(false);
              }}
              style={[s.takeRow, { borderLeftColor: partColor(from) }]}
              accessibilityRole="button"
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <StreetLine street={street} />
              </View>
              <Text style={[s.takeFrom, { color: partColor(from) }]}>{t('territories.division.part', { n: from })}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>
      {take.error ? <Text style={s.error}>{extractErrorMessage(take.error)}</Text> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 12, paddingBottom: 40, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8, backgroundColor: '#f3f5f7' },
  goneTitle: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: INK, textAlign: 'center' },
  goneText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: MUTED, textAlign: 'center', maxWidth: 360 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 5,
    borderLeftColor: '#fff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase' },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 22, color: INK, marginTop: 2 },
  locality: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: MUTED },
  partLine: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, marginTop: 4 },
  sub: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: MUTED, marginTop: 2 },
  nc: { flexDirection: 'row', gap: 8, backgroundColor: '#fff4ed', borderRadius: 12, padding: 10, marginTop: 10 },
  ncText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#c2410c', lineHeight: 17 },
  h: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: INK, marginBottom: 4 },
  street: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: LINE },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  walkedAt: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#15803d' },
  step: { width: 18, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold', fontSize: 14 },
  boxPending: { backgroundColor: '#d97706', borderColor: '#d97706' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', borderRadius: 12, padding: 10, marginTop: 8 },
  offlineText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#92400e' },
  hereRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  hereBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, borderColor: HERE, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  hereOn: { backgroundColor: HERE },
  hereText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: HERE },
  hereNote: { flex: 1, minWidth: 160, fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: MUTED },
  takeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: BRAND, borderRadius: 16, paddingVertical: 12, backgroundColor: '#fff' },
  takeText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: BRAND },
  takeRow: { borderLeftWidth: 5, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  takeFrom: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13 },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 8, lineHeight: 16 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 6 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND, borderRadius: 16, paddingVertical: 14 },
  ctaText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
});
