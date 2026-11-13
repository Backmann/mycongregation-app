import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { territoriesApi } from '../../lib/api';
import { TerritoryMap } from '../../components/territories/TerritoryMap';
import { formatDayShort, routeLink } from '../../lib/territory-view';
import { BRAND, INK, MUTED } from '../../components/reports/ReportBits';

/**
 * One territory's map behind a link without login (11 November 2026): for
 * a holder without the app, the partner he walks with, and the phone app,
 * which opens its maps here until it has a map of its own.
 *
 * The outline, the street map and the day it is due — nothing else: no
 * «не беспокоить», no names. A link that does not work says only that.
 */
export default function SharedTerritoryScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t, i18n } = useTranslation();
  const { height } = useWindowDimensions();
  const q = useQuery({
    queryKey: ['territory-link', token],
    queryFn: () => territoriesApi.shared(token!),
    enabled: !!token,
    retry: false,
  });

  if (q.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (q.error || !q.data) {
    return (
      <View style={s.center}>
        <Ionicons name="link-outline" size={30} color="#94a3b8" />
        <Text style={s.goneTitle}>{t('territories.link.gone')}</Text>
        <Text style={s.goneText}>{t('territories.link.goneHint')}</Text>
      </View>
    );
  }
  const d = q.data;
  const route = routeLink(d.geometry);
  return (
    <View style={s.screen}>
      {Platform.OS === 'web' ? (
        <TerritoryMap
          shapes={[{ id: 'shared', number: d.number, geometry: d.geometry, tone: 'mine' }]}
          focus="shared"
          height={Math.max(320, height)}
          file={{ congregationId: d.congregationId, ready: d.mapReady }}
        />
      ) : null}
      <View style={s.card}>
        <View style={{ flex: 1 }}>
          <Text style={s.number}>
            {d.number}
            {d.locality ? <Text style={s.locality}> · {d.locality}</Text> : null}
          </Text>
          {d.dueOn ? (
            <Text style={s.due}>
              {t('territories.link.due', { date: formatDayShort(d.dueOn, i18n.language) })}
            </Text>
          ) : null}
          {d.noCalls ? (
            <Text style={s.noCalls}>{t('territories.link.noCalls', { count: d.noCalls })}</Text>
          ) : null}
        </View>
        {route ? (
          <Pressable onPress={() => void Linking.openURL(route)} style={s.route} accessibilityRole="link">
            <Ionicons name="navigate-outline" size={16} color="#fff" />
            <Text style={s.routeText}>{t('territories.route')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#eef2f3' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8, backgroundColor: '#f3f5f7' },
  noCalls: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#c2410c', marginTop: 2 },
  goneTitle: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: INK, textAlign: 'center' },
  goneText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: MUTED, textAlign: 'center', maxWidth: 360 },
  card: {
    position: 'absolute',
    left: 12,
    // Room on the right for the map's zoom buttons.
    right: 56,
    top: 12,
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  number: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: INK },
  locality: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: MUTED },
  due: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: MUTED, marginTop: 2 },
  route: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  routeText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#fff' },
});
