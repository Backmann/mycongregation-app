import { useEffect, useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage, territoriesApi, type SharedPart } from '../../lib/api';
import {
  TerritoryMap,
  type MapDot,
  type MapHere,
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
import { metres, nearestOn, roundDistance, streetNow, wayTo, type LonLat } from '../../lib/way';
import { useStreetTicks } from '../../lib/useStreetTicks';
import { useHere } from '../../lib/useHere';
import { BRAND, INK, LINE, MUTED } from '../../components/reports/ReportBits';

const HERE = '#2563eb';
/** Nearer the start than this, one is there: no «get there first». */
const AT_START_M = 300;
/** Nearer one's own streets than this, one is there too. */
const AT_STREETS_M = 100;
/** Moved this far since the map was last framed: frame it again. */
const REFRAME_M = 150;

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
 *
 * «Куда идти» (14 November 2026; mockup «Страница пары»): the map shows the
 * pair's own streets, not the whole territory, the other pairs pale; one
 * card says what is now — first the way to the start, then the street to
 * walk, with «Пройдено» at hand; with «Вы здесь» an arrow and the metres to
 * that street, the phone's beam on the map, and the map keeps the walker
 * and his street in view. A street of the list is shown on the map by a
 * tap. None of the walker's place leaves the phone.
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
  const streets = useMemo(() => (d ? withTicks(d.part.streets, ticks.queue) : []), [d, ticks.queue]);

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
  return <Part d={d} streets={streets} ticks={ticks} take={take} here={here} />;
}

type Street = SharedPart['part']['streets'][number] & { pending: boolean };

/** «90 м», «1,2 км» in the reader's language. */
function useDistance() {
  const { t, i18n } = useTranslation();
  return (m: number) => {
    const r = roundDistance(m);
    const n = i18n.language.startsWith('en') ? String(r.n) : String(r.n).replace('.', ',');
    return t(r.unit === 'km' ? 'territories.part.way.km' : 'territories.part.way.metres', { n });
  };
}

function Part({
  d,
  streets,
  ticks,
  take,
  here,
}: {
  d: SharedPart;
  streets: Street[];
  ticks: ReturnType<typeof useStreetTicks<SharedPart>>;
  take: { mutate: (key: string) => void; isPending: boolean; error: unknown };
  here: ReturnType<typeof useHere>;
}) {
  const { t } = useTranslation();
  const distanceText = useDistance();
  const [taking, setTaking] = useState(false);
  // What the map shows: «mine» (the pair's streets), «all» (the territory),
  // or one street picked from the list.
  const [view, setView] = useState<'mine' | 'all' | string>('mine');
  const router = useRouter();
  const color = partColor(d.part.n);
  const part = { ...d.part, streets };
  const w = walkedOf([part]);
  const start = d.start ?? d.part.start;
  const route = routeTo(start);
  const ordered = walkingOrder(streets);
  const at = here.here as LonLat | null;
  const now = streetNow(ordered, at);
  const nowKey = now ? now.key : null;
  const nowStep = now ? now.step : 0;
  const way = now && at ? wayTo(at, now.lines) : null;
  const fromStart = start && at ? metres(at, start) : null;
  const ownLines = streets.flatMap((x) => x.lines) as LonLat[][];
  const nearOwn = at ? (nearestOn(at, ownLines)?.m ?? Infinity) <= AT_STREETS_M : false;
  // Before anything is walked, and neither at the start nor on one's own
  // streets yet: get there first.
  const first =
    w.streetsWalked === 0 && !!start && (fromStart === null || (fromStart > AT_START_M && !nearOwn));
  // Where the map was last framed round the walker: framed again once he
  // has gone REFRAME_M from there, not on every step.
  const [anchor, setAnchor] = useState<LonLat | null>(null);
  const atLon = at ? at[0] : null;
  const atLat = at ? at[1] : null;
  useEffect(() => {
    if (atLon === null || atLat === null) {
      setAnchor(null);
      return;
    }
    setAnchor((was) => (was && metres(was, [atLon, atLat]) <= REFRAME_M ? was : [atLon, atLat]));
  }, [atLon, atLat]);

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

  // Kept the same between two readings of the compass: the map is not
  // handed thousands of houses again for a turn of the phone.
  const routes: MapRoute[] = useMemo(() => [
    ...(d.others ?? []).flatMap((o) =>
      o.streets
        .filter((x) => x.lines && x.lines.length)
        .map((x) => ({ lines: x.lines ?? [], color: partColor(o.n), pale: true })),
    ),
    ...streets.map((x) => ({
      lines: x.lines,
      color,
      walked: !!x.walkedAt,
      strong: x.key === nowKey && !first,
    })),
  ], [d.others, streets, color, nowKey, first]);
  const dots: MapDot[] = useMemo(
    () =>
      streets.flatMap((x) => (x.dots ?? []).map(([lon, lat]) => ({ lon, lat, color, walked: !!x.walkedAt }))),
    [streets, color],
  );
  const points: MapPoint[] = useMemo(() => {
    const out: MapPoint[] = [];
    if (start) out.push({ label: '', lon: start[0], lat: start[1], done: false, color: INK, kind: 'start' });
    for (const x of walkingOrder(streets)) {
      const line = x.lines[0];
      const mid = line?.[Math.floor(line.length / 2)];
      if (mid && !x.walkedAt) out.push({ label: String(x.step), lon: mid[0], lat: mid[1], done: false, color });
    }
    return out;
  }, [start, streets, color]);
  const mapHere: MapHere | null = at ? { at, accuracy: here.accuracy, heading: here.heading } : null;
  const guide: LonLat[] | null = way && at && way.m > 15 && !first ? [at, way.to] : null;

  // What to frame. With «Вы здесь» on, the walker and his street — framed
  // again only when the street changes or he first appears, never on every
  // step, so a hand moving the map is not fought.
  const own: LonLat[] = streets.flatMap((x) => x.lines.flat() as LonLat[]);
  const picked = streets.find((x) => x.key === view);
  let fit: LonLat[] | null = null;
  let fitKey = view;
  if (picked) fit = picked.lines.flat() as LonLat[];
  else if (view === 'mine') {
    const where = anchor ? `${anchor[0].toFixed(5)},${anchor[1].toFixed(5)}` : '';
    if (at && first && start) {
      // On the way: oneself and the start.
      fit = [at, start];
      fitKey = `way:${where}`;
    } else if (at && now) {
      fit = [at, ...(now.lines.flat() as LonLat[])];
      fitKey = `here:${nowKey}:${where}`;
    } else fit = start ? [start, ...own] : own;
  }
  const toNextText = way && now ? t('territories.part.way.toNext', { n: nowStep, dist: distanceText(way.m) }) : null;
  // The arrow: the way to the street against where the phone points, else
  // against the map's north.
  const arrow = way ? (here.heading !== null ? way.bearing - here.heading : way.bearing) : null;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
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

      {Platform.OS === 'web' ? (
        <View>
          <TerritoryMap
            shapes={[{ id: 'part', number: d.number, geometry: d.geometry, tone: 'mine' }]}
            focus="part"
            height={360}
            file={{ congregationId: d.congregationId, ready: d.mapReady }}
            routes={routes}
            dots={dots}
            points={points}
            outline
            fit={fit}
            fitKey={fitKey}
            here={mapHere}
            guide={guide}
          />
          <View style={s.mapPill} pointerEvents="none">
            <Text style={s.mapPillText}>
              {toNextText ?? t('territories.part.way.yours', { count: streets.length })}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={s.mapRow}>
        {here.available ? (
          <Pressable onPress={here.toggle} style={[s.chip, s.hereBtn, here.on && s.hereOn]} accessibilityRole="button">
            <Ionicons name="locate-outline" size={15} color={here.on ? '#fff' : HERE} />
            <Text style={[s.chipText, { color: here.on ? '#fff' : HERE }]}>{t('territories.division.whereAmI.button')}</Text>
          </Pressable>
        ) : null}
        {Platform.OS === 'web' ? (
          <Pressable
            onPress={() => setView(view === 'all' ? 'mine' : 'all')}
            style={s.chip}
            accessibilityRole="button"
          >
            <Ionicons name={view === 'all' ? 'contract-outline' : 'expand-outline'} size={15} color={INK} />
            <Text style={s.chipText}>{t(view === 'all' ? 'territories.part.way.mine' : 'territories.part.way.whole')}</Text>
          </Pressable>
        ) : null}
      </View>
      {here.available ? (
        <Text style={s.hereNote}>
          {here.failed
            ? t('territories.division.whereAmI.failed')
            : here.on && here.heading !== null
              ? `${t('territories.part.way.beam')} ${t('territories.division.whereAmI.private')}`
              : t('territories.division.whereAmI.private')}
        </Text>
      ) : null}

      {/* What is now: the way to the start, then the street to walk. */}
      {first ? (
        <View style={[s.now, { borderLeftColor: INK }]}>
          <Text style={[s.nowKick, { color: INK }]}>{t('territories.part.way.first')}</Text>
          <Text style={s.nowTitle}>{t('territories.part.way.getThere')}</Text>
          {fromStart !== null ? (
            <Text style={s.nowSub}>{t('territories.part.way.startAway', { dist: distanceText(fromStart) })}</Text>
          ) : null}
          {route ? (
            <Pressable
              onPress={() => void Linking.openURL(route)}
              style={({ pressed }) => [s.cta, s.ctaDark, pressed && { opacity: 0.8 }]}
              accessibilityRole="link"
            >
              <Ionicons name="navigate-outline" size={17} color="#fff" />
              <Text style={s.ctaText}>{t('territories.part.way.route')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : now ? (
        <View style={[s.now, { borderLeftColor: color, backgroundColor: '#f0fdfa' }]}>
          <Text style={[s.nowKick, { color }]}>
            {t('territories.part.way.now', { n: nowStep, count: streets.length })}
          </Text>
          <View style={s.nowRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <StreetLine street={now} across={partAcross(all, d.part.n, now)} pending={now.pending && ticks.stuck} />
              {way ? (
                <Text style={[s.nowSub, { color: HERE }]}>
                  {way.m <= 25 ? t('territories.part.way.onIt') : t('territories.part.way.away', { dist: distanceText(way.m) })}
                </Text>
              ) : null}
            </View>
            {arrow !== null && way && way.m > 25 ? (
              <View style={s.arrow} accessibilityLabel={toNextText ?? undefined}>
                <View style={{ transform: [{ rotate: `${Math.round(arrow)}deg` }] }}>
                  <Ionicons name="arrow-up" size={30} color="#fff" />
                </View>
              </View>
            ) : null}
          </View>
          {arrow !== null && way && way.m > 25 ? (
            <Text style={s.arrowNote}>
              {t(here.heading !== null ? 'territories.part.way.arrowPhone' : 'territories.part.way.arrowMap')}
            </Text>
          ) : null}
          <View style={s.nowBtns}>
            <Pressable
              onPress={() => void ticks.tick(now.key, true)}
              style={({ pressed }) => [s.cta, { backgroundColor: color, flex: 1 }, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={s.ctaText}>{t('territories.part.way.done')}</Text>
            </Pressable>
            {Platform.OS === 'web' ? (
              <Pressable
                onPress={() => setView(nowKey ?? 'mine')}
                style={({ pressed }) => [s.ghost, { borderColor: color }, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
              >
                <Ionicons name="map-outline" size={16} color={color} />
                <Text style={[s.ghostText, { color }]}>{t('territories.part.way.show')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={[s.now, { borderLeftColor: '#16a34a', backgroundColor: '#f0fdf4' }]}>
          <Text style={[s.nowTitle, { color: '#15803d' }]}>{t('territories.part.way.allDone')}</Text>
        </View>
      )}

      <Text
        style={s.sources}
        onPress={() => router.push('/legal?doc=sources' as never)}
        accessibilityRole="link"
      >
        {t('territories.division.sources')}
      </Text>

      <View style={s.card}>
        <Text style={s.h}>{t('territories.part.streets')}</Text>
        {ordered.map((x) => {
          const isNow = x.key === nowKey && !first;
          const shown = view === x.key;
          return (
            <View key={x.key} style={[s.street, isNow && s.streetNow, shown && s.streetShown]}>
              <Text style={[s.step, { color: x.walkedAt ? MUTED : color }]}>{x.step}</Text>
              <Pressable
                onPress={() => void ticks.tick(x.key, !x.walkedAt)}
                disabled={ticks.busy}
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!x.walkedAt }}
                accessibilityLabel={x.name}
              >
                <View style={[s.box, x.walkedAt && s.boxOn, x.pending && ticks.stuck && s.boxPending]}>
                  {x.walkedAt ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </View>
              </Pressable>
              <Pressable
                onPress={() => setView(shown ? 'mine' : x.key)}
                style={{ flex: 1, minWidth: 0 }}
                accessibilityRole="button"
                accessibilityHint={t('territories.part.way.show')}
              >
                <StreetLine street={x} across={partAcross(all, d.part.n, x)} pending={x.pending && ticks.stuck} />
                {isNow ? <Text style={[s.nextTag, { color }]}>{t('territories.part.way.next')}</Text> : null}
              </Pressable>
              {x.walkedAt && !x.pending ? <Text style={s.walkedAt}>{clockOf(x.walkedAt)}</Text> : null}
            </View>
          );
        })}
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

      {route && !first ? (
        <Pressable
          onPress={() => void Linking.openURL(route)}
          style={({ pressed }) => [s.ghostWide, pressed && { opacity: 0.8 }]}
          accessibilityRole="link"
        >
          <Ionicons name="navigate-outline" size={16} color={BRAND} />
          <Text style={s.takeText}>{t('territories.part.way.route')}</Text>
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
  mapPill: {
    position: 'absolute',
    left: 10,
    top: 10,
    right: 56,
    alignItems: 'flex-start',
  },
  mapPillText: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 12.5,
    color: INK,
    overflow: 'hidden',
  },
  mapRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK },
  hereBtn: { borderColor: HERE },
  hereOn: { backgroundColor: HERE },
  hereNote: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: MUTED, marginTop: -4 },
  now: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderLeftWidth: 5,
    gap: 4,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  nowKick: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  nowTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: INK },
  nowSub: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: MUTED, marginTop: 2 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nowBtns: { flexDirection: 'row', gap: 8, marginTop: 8 },
  arrow: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: HERE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowNote: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: MUTED },
  h: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: INK, marginBottom: 4 },
  street: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    borderTopWidth: 1,
    borderTopColor: LINE,
    borderRadius: 10,
  },
  streetNow: { backgroundColor: '#f0fdfa' },
  streetShown: { backgroundColor: '#eff6ff' },
  nextTag: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  walkedAt: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#15803d' },
  step: { width: 18, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold', fontSize: 14 },
  boxPending: { backgroundColor: '#d97706', borderColor: '#d97706' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', borderRadius: 12, padding: 10, marginTop: 8 },
  offlineText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#92400e' },
  sources: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: BRAND, textDecorationLine: 'underline' },
  takeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: BRAND, borderRadius: 16, paddingVertical: 12, backgroundColor: '#fff' },
  takeText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: BRAND },
  takeRow: { borderLeftWidth: 5, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  takeFrom: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13 },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 8, lineHeight: 16 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 6 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND, borderRadius: 14, paddingVertical: 13, marginTop: 6 },
  ctaDark: { backgroundColor: INK },
  ctaText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, marginTop: 6, backgroundColor: '#fff' },
  ghostText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14 },
  ghostWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: BRAND, borderRadius: 16, paddingVertical: 12, backgroundColor: '#fff' },
});
