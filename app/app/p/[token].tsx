import { useMemo } from 'react';
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
import { TerritoryMap, type MapPoint, type MapRoute } from '../../components/territories/TerritoryMap';
import { StreetLine } from '../../components/territories/StreetLine';
import { clockOf, partColor, partDone, routeTo, streetsToWalk, walkedOf } from '../../lib/division';
import { BRAND, INK, LINE, MUTED } from '../../components/reports/ReportBits';

/**
 * One part of a territory divided between groups, behind a link without
 * login (13 November 2026): for a group at the meeting place, opened from a
 * QR code or a message. Its streets to tick as they are walked (every group
 * sees the ticks), the way there, and how many «не посещать» addresses lie
 * on them — never which: the conductor names them. Good on that day only.
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
  const mark = useMutation({
    mutationFn: (v: { key: string; walked: boolean }) =>
      territoriesApi.markSharedPart(token!, v.key, v.walked),
    onSuccess: (d) => qc.setQueryData(key, d),
  });

  const d = q.data;
  const color = d ? partColor(d.part.n) : BRAND;
  const routes = useMemo<MapRoute[]>(
    () => d?.part.streets.map((x) => ({ lines: x.lines, color, walked: !!x.walkedAt })) ?? [],
    [d, color],
  );
  const start = useMemo<MapPoint[]>(
    () =>
      d?.part.start
        ? [{ label: String(d.part.n), lon: d.part.start[0], lat: d.part.start[1], done: false, color }]
        : [],
    [d, color],
  );

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
  return <Part d={d} routes={routes} start={start} mark={mark} />;
}

function Part({
  d,
  routes,
  start,
  mark,
}: {
  d: SharedPart;
  routes: MapRoute[];
  start: MapPoint[];
  mark: { mutate: (v: { key: string; walked: boolean }) => void; isPending: boolean; error: unknown };
}) {
  const { t } = useTranslation();
  const color = partColor(d.part.n);
  const w = walkedOf([d.part]);
  const route = routeTo(d.part.start);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      {Platform.OS === 'web' ? (
        <TerritoryMap
          shapes={[{ id: 'part', number: d.number, geometry: d.geometry, tone: 'mine' }]}
          focus="part"
          height={340}
          file={{ congregationId: d.congregationId, ready: d.mapReady }}
          routes={routes}
          points={start}
        />
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
          {partDone(d.part)
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
        {streetsToWalk(d.part.streets).map((x) => (
          <Pressable
            key={x.key}
            onPress={() => mark.mutate({ key: x.key, walked: !x.walkedAt })}
            disabled={mark.isPending}
            style={s.street}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!x.walkedAt }}
          >
            <View style={[s.box, x.walkedAt && s.boxOn]}>
              {x.walkedAt ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <StreetLine street={x} />
            </View>
            {x.walkedAt ? <Text style={s.walkedAt}>{clockOf(x.walkedAt)}</Text> : null}
          </Pressable>
        ))}
        <Text style={s.hint}>{t('territories.part.tapHint')}</Text>
        {mark.error ? <Text style={s.error}>{extractErrorMessage(mark.error)}</Text> : null}
      </View>

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
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 8, lineHeight: 16 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 6 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BRAND, borderRadius: 16, paddingVertical: 14 },
  ctaText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
});
