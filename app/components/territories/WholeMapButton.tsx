import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { extractErrorMessage, type TerritoryRow, type TerritoryBoundary } from '../../lib/api';
import { buildWholeMapHtml, type Geometry } from '../../lib/territory-coverage';
import { exportHtmlAsPdf, openPrintWindow } from '../../lib/pdf';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

/**
 * «Общая карта» (17 November 2026; mockup board 16, S-12: «all territories
 * are usually shown on a general map, the borders and numbers of each
 * clearly seen»): every territory of the kind shown, with the
 * congregation's boundary, on A4 or A3; free and held told apart if asked.
 * Numbers only — no names; it may hang on a wall.
 */
export function WholeMapButton({
  rows,
  boundary,
  style,
  textStyle,
}: {
  rows: TerritoryRow[];
  boundary: TerritoryBoundary | null | undefined;
  style: object;
  textStyle: object;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<'A4' | 'A3'>('A4');
  const [status, setStatus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const print = () => {
    const preopened = openPrintWindow();
    setBusy(true);
    setError(null);
    const title = t('territories.wholeMap.title');
    void exportHtmlAsPdf(
      buildWholeMapHtml(
        rows.map((r) => ({ number: r.number, geometry: r.geometry as Geometry, held: !!r.holder })),
        (boundary?.geometry as Geometry | undefined) ?? null,
        { size, status, title },
        t,
      ),
      { fileName: title, preopenedWindow: preopened },
    )
      .then(() => setOpen(false))
      .catch((e) => {
        preopened?.close();
        setError(extractErrorMessage(e));
      })
      .finally(() => setBusy(false));
  };

  const chip = (on: boolean, label: string, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[s.chip, on && s.chipOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={style} accessibilityRole="button">
        <Ionicons name="grid-outline" size={17} color={BRAND} />
        <Text style={textStyle}>{t('territories.wholeMap.button')}</Text>
      </Pressable>
      {open ? (
        <Sheet
          visible
          title={t('territories.wholeMap.title')}
          subtitle={t('territories.wholeMap.count', { count: rows.length })}
          onClose={() => setOpen(false)}
          closeLabel={t('common.cancel')}
          variant={width >= 900 ? 'centered' : 'bottom'}
          footer={
            <View style={{ gap: 8 }}>
              {error ? <Text style={s.error}>{error}</Text> : null}
              <Pressable
                onPress={print}
                disabled={busy}
                style={[s.go, busy && { opacity: 0.6 }]}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>{t('territories.wholeMap.print')}</Text>}
              </Pressable>
            </View>
          }
        >
          <Text style={s.label}>{t('territories.wholeMap.size')}</Text>
          <View style={s.chips}>
            {chip(size === 'A4', 'A4', () => setSize('A4'))}
            {chip(size === 'A3', 'A3', () => setSize('A3'))}
          </View>
          <Text style={s.label}>{t('territories.wholeMap.show')}</Text>
          <View style={s.chips}>
            {chip(!status, t('territories.wholeMap.plain'), () => setStatus(false))}
            {chip(status, t('territories.wholeMap.status'), () => setStatus(true))}
          </View>
          <Text style={s.hint}>{t('territories.wholeMap.hint')}</Text>
        </Sheet>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK, marginTop: 8, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  chipTextOn: { color: '#fff' },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, lineHeight: 18, marginTop: 12 },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
});
