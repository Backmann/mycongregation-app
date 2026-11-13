import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import {
  extractErrorMessage,
  territoriesApi,
  type DivisionPart,
  type DivisionStreet,
  type TerritoryDivision,
} from '../../../../lib/api';
import { LoadFailure } from '../../../../components/LoadFailure';
import { failsScreen } from '../../../../lib/screen-failure';
import { NoAccess } from '../../../../components/NoAccess';
import { Sheet } from '../../../../components/Sheet';
import { QrCode } from '../../../../components/QrCode';
import {
  TerritoryMap,
  type MapPoint,
  type MapRoute,
} from '../../../../components/territories/TerritoryMap';
import { StreetLine } from '../../../../components/territories/StreetLine';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../../../../components/reports/ReportBits';
import { siteOrigin } from '../../../../lib/territory-view';
import {
  clockOf,
  partColor,
  partDone,
  PARTS_FIRST,
  PARTS_MAX,
  PARTS_MIN,
  routeTo,
  streetsToWalk,
  walkedOf,
} from '../../../../lib/division';

const NC = '#c2410c';

/**
 * A territory divided between groups for today (13 November 2026; mockup
 * «Участок на группы»). Whoever sees the territory today opens it: the
 * first division of the day holds for everyone, each part reaches its
 * group in the app, by a link good today only, or as a QR code held out on
 * the spot; «street walked» is ticked by whoever walks it and seen by all.
 */
export default function DivisionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['territories', 'division', id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => territoriesApi.division(id!),
    enabled: !!id,
    retry: false,
    throwOnError: failsScreen,
    // Other groups tick their streets: keep the picture fresh on the spot.
    refetchInterval: 60 * 1000,
  });
  const [count, setCount] = useState(PARTS_FIRST);
  const [again, setAgain] = useState(false);
  const [moving, setMoving] = useState<DivisionStreet | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = (d: TerritoryDivision) => {
    qc.setQueryData(key, d);
    setError(null);
  };
  const divide = useMutation({
    mutationFn: (redo: boolean) => territoriesApi.divide(id!, count, redo),
    onSuccess: (d) => {
      done(d);
      setAgain(false);
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const mark = useMutation({
    mutationFn: (v: { key: string; walked: boolean }) =>
      territoriesApi.markStreet(q.data!.split!.id, v.key, v.walked),
    onSuccess: done,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const move = useMutation({
    mutationFn: (v: { key: string; to: number }) =>
      territoriesApi.moveStreet(q.data!.split!.id, v.key, v.to),
    onSuccess: (d) => {
      done(d);
      setMoving(null);
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const d = q.data;
  const routes = useMemo<MapRoute[]>(
    () =>
      d?.split?.parts.flatMap((p) =>
        p.streets.map((x) => ({ lines: x.lines, color: partColor(p.n), walked: !!x.walkedAt })),
      ) ?? [],
    [d],
  );
  const starts = useMemo<MapPoint[]>(
    () =>
      d?.split?.parts
        .filter((p) => p.start)
        .map((p) => ({
          label: String(p.n),
          lon: p.start![0],
          lat: p.start![1],
          done: partDone(p),
          color: partColor(p.n),
        })) ?? [],
    [d],
  );

  if (q.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (q.error instanceof AxiosError && q.error.response?.status === 403) return <NoAccess />;
  if (q.error || !d) {
    // «Not given out» and the like: the server's words, not a crash screen.
    if (q.error instanceof AxiosError && q.error.response?.status === 409) {
      return (
        <View style={s.center}>
          <Text style={s.muted}>{extractErrorMessage(q.error)}</Text>
        </View>
      );
    }
    return <LoadFailure error={q.error} onRetry={() => q.refetch()} />;
  }

  const split = d.split;
  const left = d.houses - d.walked;
  const choosing = !split || again;
  const busy = divide.isPending || mark.isPending || move.isPending;

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: t('territories.division.title', { number: d.number }) }} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={[cardStyles.card, s.card]}>
          <Text style={s.kicker}>{d.locality ?? t('territories.division.kicker')}</Text>
          <Text style={s.number}>{d.number}</Text>
          <Text style={s.progressText}>
            {t('territories.division.walked', { walked: d.walked, count: d.houses })}
            {d.lastWalkedAt ? ` · ${t('territories.division.lastAt', { time: clockOf(d.lastWalkedAt) })}` : ''}
          </Text>
          <View style={s.bar}>
            <View style={[s.barFill, { width: `${d.houses ? Math.round((d.walked / d.houses) * 100) : 0}%` }]} />
          </View>
        </View>

        {Platform.OS === 'web' && split ? (
          <TerritoryMap
            shapes={[{ id: 'division', number: d.number, geometry: d.geometry, tone: 'mine' }]}
            focus="division"
            height={320}
            routes={routes}
            points={starts}
          />
        ) : null}

        {choosing ? (
          <View style={[cardStyles.card, s.card]}>
            <Text style={s.h}>{t('territories.division.how')}</Text>
            <View style={s.seg}>
              {Array.from({ length: PARTS_MAX - PARTS_MIN + 1 }, (_, i) => PARTS_MIN + i).map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setCount(n)}
                  style={[s.segItem, count === n && s.segOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: count === n }}
                >
                  <Text style={[s.segText, count === n && s.segTextOn]}>{n}</Text>
                </Pressable>
              ))}
            </View>
            {d.walked > 0 ? (
              <Text style={s.hint}>{t('territories.division.restHint', { count: left })}</Text>
            ) : null}
            <Text style={s.hint}>{t('territories.division.firstHolds')}</Text>
            {error ? <Text style={s.error}>{error}</Text> : null}
            <Pressable
              onPress={() => divide.mutate(!!split)}
              disabled={busy || (d.walked > 0 && left <= 0)}
              style={({ pressed }) => [s.cta, (busy || pressed) && { opacity: 0.75 }]}
              accessibilityRole="button"
            >
              {divide.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.ctaText}>
                  {d.walked > 0
                    ? t('territories.division.divideRest', { count })
                    : t('territories.division.divide', { count })}
                </Text>
              )}
            </Pressable>
            {again ? (
              <Pressable onPress={() => setAgain(false)} style={s.second} accessibilityRole="button">
                <Text style={s.secondText}>{t('common.cancel')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {split && !again ? (
          <>
            {error ? <Text style={s.error}>{error}</Text> : null}
            {split.parts.map((p) => (
              <PartCard
                key={p.n}
                part={p}
                number={d.number}
                divisionId={split.id}
                mayMove={d.mayRedo && split.parts.length > 1}
                busy={busy}
                onMark={(k, w) => mark.mutate({ key: k, walked: w })}
                onMove={(x) => setMoving(x)}
              />
            ))}
            {split.leftOut > 0 ? (
              <Text style={s.hint}>{t('territories.division.leftOut', { count: split.leftOut })}</Text>
            ) : null}
            {walkedOf(split.parts).streetsWalked === walkedOf(split.parts).streets ? (
              <Text style={s.allDone}>{t('territories.division.allWalked')}</Text>
            ) : null}
            {d.mayRedo ? (
              <Pressable
                onPress={() => {
                  setCount(Math.min(PARTS_MAX, Math.max(PARTS_MIN, split.parts.length)));
                  setAgain(true);
                  setError(null);
                }}
                style={s.ghost}
                accessibilityRole="button"
              >
                <Ionicons name="cut-outline" size={17} color={INK} />
                <Text style={s.ghostText}>
                  {d.walked > 0 ? t('territories.division.againRest') : t('territories.division.again')}
                </Text>
              </Pressable>
            ) : (
              <Text style={s.hint}>{t('territories.division.againWho')}</Text>
            )}
          </>
        ) : null}
      </ScrollView>

      <Sheet
        visible={!!moving}
        title={t('territories.division.moveTitle')}
        subtitle={moving ? <StreetLine street={moving} /> : undefined}
        onClose={() => setMoving(null)}
        variant="bottom"
      >
        <View style={{ gap: 8, paddingBottom: 8 }}>
          {split?.parts.map((p) => {
            const here = p.streets.some((x) => x.key === moving?.key);
            return (
              <Pressable
                key={p.n}
                disabled={here || move.isPending}
                onPress={() => moving && move.mutate({ key: moving.key, to: p.n })}
                style={[s.moveTo, { borderLeftColor: partColor(p.n) }, here && { opacity: 0.45 }]}
                accessibilityRole="button"
              >
                <Text style={s.partTitle}>{t('territories.division.part', { n: p.n })}</Text>
                <Text style={s.partHouses}>
                  {here ? t('territories.division.here') : t('territories.division.houses', { count: p.houses })}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}

function PartCard({
  part,
  number,
  divisionId,
  mayMove,
  busy,
  onMark,
  onMove,
}: {
  part: DivisionPart;
  number: string;
  divisionId: string;
  mayMove: boolean;
  busy: boolean;
  onMark: (key: string, walked: boolean) => void;
  onMove: (s: DivisionStreet) => void;
}) {
  const { t } = useTranslation();
  const [qr, setQr] = useState<string | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const color = partColor(part.n);
  const w = walkedOf([part]);
  const route = routeTo(part.start);

  const link = useMutation({
    mutationFn: () => territoriesApi.partLink(divisionId, part.n),
  });
  const urlOf = async () => `${siteOrigin()}${(await link.mutateAsync()).path}`;
  const send = async () => {
    try {
      const url = await urlOf();
      const text = t('territories.division.linkMessage', { number, n: part.n, url });
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'share' in navigator) {
        await (navigator as Navigator & { share: (d: { text: string }) => Promise<void> }).share({ text });
      } else if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        await Share.share({ message: text });
      }
      setLinkNote(t('territories.division.linkReady'));
    } catch (e) {
      // Closed without sending is no failure; a refusal is.
      if (e instanceof AxiosError) setLinkNote(extractErrorMessage(e));
    }
  };
  const showQr = async () => {
    if (qr) {
      setQr(null);
      return;
    }
    try {
      setQr(await urlOf());
    } catch (e) {
      setLinkNote(extractErrorMessage(e));
    }
  };

  return (
    <View style={[cardStyles.card, s.part, { borderLeftColor: color }]}>
      <View style={s.partHead}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.partTitle}>{t('territories.division.part', { n: part.n })}</Text>
        <Text style={[s.partHouses, { color }]}>{t('territories.division.houses', { count: part.houses })}</Text>
      </View>
      <Text style={s.partSub}>
        {partDone(part)
          ? t('territories.division.partDone')
          : t('territories.division.streetsWalked', { walked: w.streetsWalked, count: w.streets })}
      </Text>

      <View style={{ marginTop: 6 }}>
        {streetsToWalk(part.streets).map((x) => (
          <View key={x.key} style={s.street}>
            <Pressable
              onPress={() => onMark(x.key, !x.walkedAt)}
              disabled={busy}
              style={[s.box, x.walkedAt && s.boxOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!x.walkedAt }}
              accessibilityLabel={x.name}
              hitSlop={8}
            >
              {x.walkedAt ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </Pressable>
            <Pressable
              style={{ flex: 1, minWidth: 0 }}
              onPress={mayMove ? () => onMove(x) : undefined}
              disabled={!mayMove}
              accessibilityRole={mayMove ? 'button' : undefined}
            >
              <StreetLine street={x} />
            </Pressable>
            {x.walkedAt ? <Text style={s.walkedAt}>{clockOf(x.walkedAt)}</Text> : null}
          </View>
        ))}
      </View>

      {part.noCalls && part.noCalls.length > 0 ? (
        <View style={s.nc}>
          <Text style={s.ncHead}>
            {t('territories.division.noCalls', { count: part.noCalls.length })}
          </Text>
          {part.noCalls.map((c) => (
            <Text key={c.id} style={s.ncText}>
              {c.address}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={s.partActions}>
        <Pressable onPress={() => void send()} style={s.chip} accessibilityRole="button">
          <Ionicons name="share-outline" size={15} color={BRAND} />
          <Text style={s.chipText}>{t('territories.division.link')}</Text>
        </Pressable>
        <Pressable onPress={() => void showQr()} style={[s.chip, qr && s.chipOn]} accessibilityRole="button">
          <Ionicons name="qr-code-outline" size={15} color={qr ? '#fff' : BRAND} />
          <Text style={[s.chipText, qr && { color: '#fff' }]}>{t('territories.division.qr')}</Text>
        </Pressable>
        {route ? (
          <Pressable onPress={() => void Linking.openURL(route)} style={s.chip} accessibilityRole="link">
            <Ionicons name="navigate-outline" size={15} color={BRAND} />
            <Text style={s.chipText}>{t('territories.division.route')}</Text>
          </Pressable>
        ) : null}
        {link.isPending ? <ActivityIndicator color={BRAND} /> : null}
      </View>
      {linkNote ? <Text style={s.hint}>{linkNote}</Text> : null}
      {qr ? (
        <View style={s.qr}>
          <QrCode value={qr} size={220} />
          <Text style={s.qrHint}>{t('territories.division.qrHint', { n: part.n })}</Text>
        </View>
      ) : null}
      {part.noCalls && part.noCalls.length > 0 ? (
        <Text style={s.ncLink}>{t('territories.division.noCallsByLink')}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: MUTED, textAlign: 'center' },
  card: { marginBottom: 0 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase' },
  number: { fontFamily: 'Manrope_800ExtraBold', fontSize: 24, color: INK, marginTop: 2 },
  progressText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: MUTED, marginTop: 4 },
  bar: { height: 8, borderRadius: 4, backgroundColor: LINE, overflow: 'hidden', marginTop: 8 },
  barFill: { height: '100%', backgroundColor: '#16a34a', borderRadius: 4 },
  h: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK },
  seg: { flexDirection: 'row', gap: 6, marginTop: 10 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff' },
  segOn: { backgroundColor: INK, borderColor: INK },
  segText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: MUTED },
  segTextOn: { color: '#fff' },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 8, lineHeight: 17 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 8 },
  cta: { backgroundColor: BRAND, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  ctaText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  second: { paddingVertical: 10, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: LINE, marginTop: 8 },
  secondText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  part: { marginBottom: 0, borderLeftWidth: 5 },
  partHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  partTitle: { flex: 1, fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK },
  partHouses: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: MUTED },
  partSub: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: MUTED, marginTop: 2 },
  street: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: LINE },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  walkedAt: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#15803d' },
  nc: { backgroundColor: '#fff4ed', borderRadius: 12, padding: 10, marginTop: 8, gap: 2 },
  ncHead: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: NC },
  ncText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK, marginLeft: 4 },
  ncLink: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: NC, marginTop: 6 },
  partActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#ecfeff' },
  chipOn: { backgroundColor: BRAND },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND },
  qr: { alignItems: 'center', gap: 8, marginTop: 12 },
  qrHint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 320 },
  allDone: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#15803d', textAlign: 'center' },
  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: LINE, borderRadius: 14, paddingVertical: 12, backgroundColor: '#fff' },
  ghostText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK },
  moveTo: { borderLeftWidth: 5, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, padding: 12, flexDirection: 'row', alignItems: 'center' },
});
