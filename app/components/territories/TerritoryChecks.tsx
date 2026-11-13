import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import type { TerritoryChecks, TerritoryGaps, TerritoryRow } from '../../lib/api';
import { formatDayShort } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

/** A neighbour farther than this is not offered to take the houses in. */
export const NEIGHBOUR_REACH_M = 300;

/**
 * A territory this much past the boundary is a fault. Less is the slack of
 * two lines drawn by hand along the same road (live: three territories at
 * 1–4%), listed in the window but not worth an alarm on the page.
 */
export const OUTSIDE_FAULT_SHARE = 10;

type Spot = TerritoryGaps['spots'][number];

/**
 * What the checks found, in one line on the territories page (13 November
 * 2026; mockup «Проверка участков»). Keepers only.
 *
 * Overlaps and territories reaching well past the boundary are faults:
 * amber.
 * Houses no residential territory holds are a matter to look at — farms may
 * be outside on purpose — so alone they make a quiet grey line. Nothing
 * found: no line at all.
 */
export function ChecksLine({
  checks,
  gaps,
  onOpen,
}: {
  checks: TerritoryChecks | undefined;
  gaps: TerritoryGaps | undefined;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const overlaps = checks?.overlapping.length ?? 0;
  const outside = checks?.outsideBoundary.length ?? 0;
  const houses = gaps?.houses ?? 0;
  if (!overlaps && !outside && !houses) return null;
  const faults =
    overlaps > 0 || (checks?.outsideBoundary ?? []).some((o) => o.share >= OUTSIDE_FAULT_SHARE);
  const parts = [
    overlaps ? t('territories.checks.overlaps', { count: overlaps }) : null,
    outside ? t('territories.checks.outside', { count: outside }) : null,
    houses ? t('territories.checks.houses', { count: houses }) : null,
  ].filter(Boolean);
  return (
    <Pressable
      onPress={onOpen}
      style={[s.line, faults ? s.lineWarn : s.lineQuiet]}
      accessibilityRole="button"
    >
      <Ionicons
        name={faults ? 'alert-circle-outline' : 'home-outline'}
        size={18}
        color={faults ? WARN : MUTED}
      />
      <View style={{ flex: 1 }}>
        <Text style={s.lineTitle}>{t('territories.checks.line', { list: parts.join(' · ') })}</Text>
        {houses > 0 ? <Text style={s.lineHint}>{t('territories.checks.lineHint')}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={MUTED} />
    </Pressable>
  );
}

/** The window behind the line: each finding with what to do about it. */
export function ChecksSheet({
  visible,
  onClose,
  checks,
  gaps,
  rows,
  onShowOnMap,
}: {
  visible: boolean;
  onClose: () => void;
  checks: TerritoryChecks | undefined;
  gaps: TerritoryGaps | undefined;
  rows: TerritoryRow[];
  /** Web: close the window and look at the spot on the page's map. */
  onShowOnMap?: (spot: Spot) => void;
}) {
  const { t, i18n } = useTranslation();
  const web = Platform.OS === 'web';
  const wide = useWindowDimensions().width >= 900;
  const idOf = (number: string) => rows.find((r) => r.number === number)?.id ?? null;
  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };
  const outline = (number: string) => {
    const id = idOf(number);
    if (!web || !id) return null;
    return (
      <Pressable
        onPress={() => go(`/cart/territory/outline/${id}`)}
        style={s.btn}
        accessibilityRole="button"
      >
        <Text style={s.btnText}>{t('territories.checks.outline', { number })}</Text>
      </Pressable>
    );
  };
  const overlapping = checks?.overlapping ?? [];
  const outside = checks?.outsideBoundary ?? [];
  const spots = gaps?.spots ?? [];
  const inSpots = spots.reduce((n, p) => n + p.houses, 0);
  const scattered = Math.max(0, (gaps?.houses ?? 0) - inSpots);
  const more = (gaps?.spotCount ?? spots.length) - spots.length;

  return (
    <Sheet
      visible={visible}
      title={t('territories.checks.title')}
      subtitle={
        gaps?.builtAt
          ? t('territories.checks.register', {
              date: formatDayShort(gaps.builtAt.slice(0, 10), i18n.language),
            })
          : undefined
      }
      onClose={onClose}
      variant={wide ? 'centered' : 'bottom'}
    >
      {!web ? <Text style={s.note}>{t('territories.checks.computer')}</Text> : null}

      {overlapping.length > 0 ? (
        <View style={s.section}>
          <Text style={s.head}>{t('territories.checks.overlapTitle', { count: overlapping.length })}</Text>
          {overlapping.map(([a, b]) => (
            <View key={`${a}/${b}`} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.main}>{`${a} / ${b}`}</Text>
                <Text style={s.meta}>{t('territories.checks.overlapMeta')}</Text>
              </View>
              {outline(a)}
            </View>
          ))}
        </View>
      ) : null}

      {outside.length > 0 ? (
        <View style={s.section}>
          <Text style={s.head}>{t('territories.checks.outsideTitle', { count: outside.length })}</Text>
          {outside.map((o) => (
            <View key={o.number} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.main}>{o.number}</Text>
                <Text style={s.meta}>
                  {t(
                    o.share >= OUTSIDE_FAULT_SHARE
                      ? 'territories.checks.outsideMeta'
                      : 'territories.checks.outsideSlack',
                    { share: o.share },
                  )}
                </Text>
              </View>
              {outline(o.number)}
            </View>
          ))}
        </View>
      ) : null}

      {gaps && gaps.houses > 0 ? (
        <View style={s.section}>
          <Text style={s.head}>{t('territories.checks.housesTitle', { count: gaps.houses })}</Text>
          {gaps.inBusiness > 0 ? (
            <Text style={s.meta}>{t('territories.checks.inBusinessAll', { count: gaps.inBusiness })}</Text>
          ) : null}
          {spots.map((p) => {
            const reach = !!p.nearId && p.nearMetres !== null && p.nearMetres <= NEIGHBOUR_REACH_M;
            const at = `${p.lon},${p.lat}`;
            return (
              <View key={at} style={s.spot}>
                <Text style={s.main}>{t('territories.checks.spotHouses', { count: p.houses })}</Text>
                <Text style={s.meta}>
                  {p.near
                    ? t('territories.checks.spotNear', { number: p.near, metres: p.nearMetres ?? 0 })
                    : t('territories.checks.spotAlone')}
                  {p.inBusiness > 0
                    ? ` · ${t('territories.checks.spotBusiness', { count: p.inBusiness })}`
                    : ''}
                </Text>
                {web ? (
                  <View style={s.actions}>
                    {onShowOnMap ? (
                      <Pressable onPress={() => onShowOnMap(p)} style={s.btn} accessibilityRole="button">
                        <Text style={s.btnText}>{t('territories.checks.onMap')}</Text>
                      </Pressable>
                    ) : null}
                    {reach ? (
                      <Pressable
                        onPress={() => go(`/cart/territory/outline/${p.nearId}?at=${at}`)}
                        style={s.btn}
                        accessibilityRole="button"
                      >
                        <Text style={s.btnText}>{t('territories.checks.addTo', { number: p.near })}</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() =>
                        go(`/cart/territory/new?at=${at}${p.nearId ? `&near=${p.nearId}` : ''}`)
                      }
                      style={[s.btn, s.btnSolid]}
                      accessibilityRole="button"
                    >
                      <Text style={[s.btnText, s.btnSolidText]}>{t('territories.checks.create')}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
          {more > 0 ? <Text style={s.note}>{t('territories.checks.more', { shown: spots.length, total: more + spots.length })}</Text> : null}
          {scattered > 0 ? (
            <Text style={s.note}>{t('territories.checks.scattered', { count: scattered })}</Text>
          ) : null}
          <Text style={s.note}>{t('territories.checks.registerNote')}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const WARN = '#b45309';

const s = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  lineWarn: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  lineQuiet: { backgroundColor: '#f8fafc', borderColor: LINE },
  lineTitle: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK },
  lineHint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 1 },
  section: { marginTop: 8, marginBottom: 12, gap: 2 },
  head: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  spot: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: LINE, gap: 2 },
  main: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  btn: {
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 9,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  btnText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: BRAND },
  btnSolid: { backgroundColor: BRAND },
  btnSolidText: { color: '#fff' },
  note: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 12.5,
    color: MUTED,
    lineHeight: 18,
    backgroundColor: '#f8fafc',
    borderRadius: 9,
    padding: 9,
    marginTop: 8,
  },
});
