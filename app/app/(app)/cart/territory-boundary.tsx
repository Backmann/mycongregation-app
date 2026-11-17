import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../components/KeyboardScroll';
import { LoadFailure } from '../../../components/LoadFailure';
import { NoAccess } from '../../../components/NoAccess';
import { DateField } from '../../../components/DateField';
import { TerritoryMap } from '../../../components/territories/TerritoryMap';
import { extractErrorMessage, territoriesApi } from '../../../lib/api';
import { failsScreen } from '../../../lib/screen-failure';
import { formatDayShort } from '../../../lib/territory-view';
import { readBoundaryKml } from '../../../lib/territory-import';
import { boundaryFromGeoJson, type Geometry } from '../../../lib/territory-coverage';
import { BRAND, INK, LINE, MUTED } from '../../../components/reports/ReportBits';

/**
 * «Граница собрания» (17 November 2026; mockup board 17). The boundary is
 * the branch's («Назначение территории собрания», S-54): in the app it is
 * never drawn or edited — only replaced by a new file from the branch
 * (Lionel, 17 November 2026), with the date of its S-54, after seeing which
 * territories would fall outside. The old boundary stays in the history.
 * For the keepers (the territory servant, his assistant, the service
 * overseer) and administrators.
 */
export default function TerritoryBoundaryScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    throwOnError: failsScreen,
  });
  const keeps = !!accessQ.data?.keeps && !!accessQ.data?.verified;
  const q = useQuery({
    queryKey: ['territories', 'boundary'],
    queryFn: () => territoriesApi.boundary(),
    enabled: keeps,
    throwOnError: failsScreen,
  });
  const [s54, setS54] = useState('');
  const [file, setFile] = useState<{ name: string; geometry: Geometry } | null>(null);
  const [newS54, setNewS54] = useState('');
  const [outside, setOutside] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setS54(q.data?.s54On ?? '');
  }, [q.data?.s54On]);

  const done = () => void qc.invalidateQueries({ queryKey: ['territories'] });
  const saveS54 = useMutation({
    mutationFn: () => territoriesApi.setS54(s54),
    onSuccess: done,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const replace = useMutation({
    mutationFn: () => territoriesApi.replaceBoundary(file!.geometry, newS54),
    onSuccess: () => {
      setFile(null);
      setOutside(null);
      setNewS54('');
      done();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const pick = async () => {
    setError(null);
    setOutside(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true });
      if (r.canceled) return;
      const asset = r.assets?.[0];
      if (!asset) return;
      const web = (asset as unknown as { file?: Blob }).file;
      const text = web ? await web.text() : await (await fetch(asset.uri)).text();
      const geometry = /<kml|<coordinates>/i.test(text)
        ? (readBoundaryKml(text).geometry as Geometry)
        : boundaryFromGeoJson(text);
      if (!geometry) throw new Error(t('territories.boundary.noArea'));
      setFile({ name: asset.name, geometry });
      setOutside((await territoriesApi.previewBoundary(geometry)).outside);
    } catch (e) {
      setError(t('territories.import.fileUnreadable', { reason: extractErrorMessage(e) }));
    }
  };

  if (accessQ.isLoading || (keeps && q.isLoading)) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (accessQ.error) return <LoadFailure error={accessQ.error} onRetry={() => accessQ.refetch()} />;
  if (!keeps) return <NoAccess />;
  if (q.error) return <LoadFailure error={q.error} onRetry={() => q.refetch()} />;
  const b = q.data;

  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.kicker}>{t('territories.boundary.now')}</Text>
        <Text style={s.title}>
          {b?.s54On
            ? t('territories.boundary.byS54', { date: formatDayShort(b.s54On, lang) })
            : t('territories.boundary.noBasis')}
        </Text>
        {b && Platform.OS === 'web' ? (
          <View style={{ marginTop: 10 }}>
            <TerritoryMap shapes={[]} boundary={b.geometry} height={240} />
          </View>
        ) : null}
        <Text style={s.small}>{t('territories.boundary.rule')}</Text>
        {b ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            <DateField label={t('territories.boundary.s54Date')} value={s54} onChange={setS54} />
            {s54 && s54 !== (b.s54On ?? '') ? (
              <Pressable
                onPress={() => saveS54.mutate()}
                disabled={saveS54.isPending}
                style={({ pressed }) => [s.second, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
              >
                <Text style={s.secondText}>{t('territories.boundary.saveS54')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={s.card}>
        <Text style={s.kicker}>{t('territories.boundary.newTitle')}</Text>
        <Text style={s.text}>{t('territories.boundary.newHint')}</Text>
        <Pressable
          onPress={() => void pick()}
          style={({ pressed }) => [s.second, { marginTop: 10 }, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={s.secondText}>
            {file ? file.name : t('territories.boundary.pick')}
          </Text>
        </Pressable>
        {file && outside ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            <Text style={[s.text, outside.length > 0 && s.warn]}>
              {outside.length
                ? t('territories.boundary.outside', { count: outside.length, list: outside.join(', ') })
                : t('territories.boundary.allInside')}
            </Text>
            <DateField label={t('territories.boundary.s54Date')} value={newS54} onChange={setNewS54} />
            <Pressable
              onPress={() => replace.mutate()}
              disabled={!newS54 || replace.isPending}
              style={({ pressed }) => [s.go, (!newS54 || replace.isPending) && s.goOff, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              {replace.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.goText}>{t('territories.boundary.replace')}</Text>
              )}
            </Pressable>
            <Text style={s.small}>{t('territories.boundary.history')}</Text>
          </View>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>
    </KeyboardScroll>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 14 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11.5, letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase' },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: INK, marginTop: 4 },
  text: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: INK, lineHeight: 19, marginTop: 4 },
  warn: { color: '#b45309' },
  small: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, lineHeight: 17, marginTop: 8 },
  second: { borderWidth: 1, borderColor: BRAND, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' },
  secondText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BRAND },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goOff: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 8 },
});
