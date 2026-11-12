import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  extractErrorMessage,
  territoriesApi,
  type TerritoryOutlineBody,
  type TerritoryOutlineReport,
  type TerritoryRow,
} from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';
import { failsScreen } from '../../../../../lib/screen-failure';
import { LoadFailure } from '../../../../../components/LoadFailure';
import { NoAccess } from '../../../../../components/NoAccess';
import { confirm } from '../../../../../components/ConfirmHost';
import {
  OutlineEditor,
  type EditedShape,
  type OutlineEditorHandle,
} from '../../../../../components/territories/OutlineEditor';
import { areaChange, roundGeometry } from '../../../../../lib/outline-edit';
import { boxOf } from '../../../../../lib/territory-view';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../../../../../components/reports/ReportBits';

/** Neighbours are looked for this far round the territory (degrees, ~300 m). */
const AROUND = 0.004;

/**
 * «Граница участка» (12 November 2026): the boundary drawn again on the map,
 * on a computer. Beside the map: what the change does — how much ground and
 * how many houses go to which neighbour, whether one of them is held,
 * overlaps — then saving, and putting back what was there before the last
 * save. The «не посещать» addresses of the territory can be moved to a
 * neighbour that took the ground.
 */
export default function OutlineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
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
  const detailQ = useQuery({
    queryKey: ['territories', 'detail', id],
    queryFn: () => territoriesApi.detail(id!),
    enabled: open && !!id,
  });
  const boundaryQ = useQuery({
    queryKey: ['territories', 'boundary'],
    queryFn: () => territoriesApi.boundary(),
    enabled: open,
  });

  const editor = useRef<OutlineEditorHandle>(null);
  const [shared, setShared] = useState(true);
  const [snap, setSnap] = useState(true);
  const [edited, setEdited] = useState<EditedShape[]>([]);
  const [report, setReport] = useState<TerritoryOutlineReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<string, string>>({});

  const rows = listQ.data;
  const main = rows?.find((r) => r.id === id) ?? null;
  const neighbours = useMemo(() => {
    if (!rows || !main) return [];
    const b = boxOf([main.geometry]);
    if (!b) return [];
    const [[x1, y1], [x2, y2]] = b;
    return rows.filter((r) => {
      if (r.id === main.id || (r.category ?? 'residential') !== (main.category ?? 'residential')) return false;
      const o = boxOf([r.geometry]);
      if (!o) return false;
      const [[a1, b1], [a2, b2]] = o;
      return a1 <= x2 + AROUND * 1.6 && a2 >= x1 - AROUND * 1.6 && b1 <= y2 + AROUND && b2 >= y1 - AROUND;
    });
  }, [rows, main]);
  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.id, r])), [rows]);
  // A new map after each save: the outlines and their stamps are new.
  const version = useMemo(
    () => [main, ...neighbours].map((r) => `${r?.id}:${r?.updatedAt ?? ''}`).join('|'),
    [main, neighbours],
  );

  const bodyOf = (list: EditedShape[]): TerritoryOutlineBody | null => {
    if (!main || list.length === 0) return null;
    const mine = list.find((e) => e.id === main.id);
    return {
      geometry: roundGeometry(mine ? mine.geometry : main.geometry),
      updatedAt: main.updatedAt ?? '',
      neighbours: list
        .filter((e) => e.id !== main.id)
        .map((e) => ({
          id: e.id,
          geometry: roundGeometry(e.geometry),
          updatedAt: byId.get(e.id)?.updatedAt ?? '',
        })),
    };
  };

  // What the change does, asked a moment after the last drag.
  useEffect(() => {
    if (edited.length > 0) setDone(null);
    const body = bodyOf(edited);
    if (!body || !main) {
      setReport(null);
      return;
    }
    let gone = false;
    setChecking(true);
    const timer = setTimeout(() => {
      territoriesApi
        .checkOutline(main.id, body)
        .then((r) => {
          if (!gone) {
            setReport(r);
            setError(null);
          }
        })
        .catch((e) => {
          if (!gone) setError(extractErrorMessage(e));
        })
        .finally(() => {
          if (!gone) setChecking(false);
        });
    }, 450);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edited]);

  const blocked = !!report && (report.overlaps.length > 0 || report.territories.some((r) => r.tooMuch));
  const canSave = edited.length > 0 && !!report && !blocked && !checking && !busy;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['territories'] });
  };

  const save = async () => {
    const body = bodyOf(edited);
    if (!body || !main) return;
    setBusy(true);
    setError(null);
    try {
      const r = await territoriesApi.saveOutline(main.id, body);
      setDone(t('territories.outline.saved', { n: r.saved }));
      setEdited([]);
      setReport(null);
      await refresh();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const undoSaved = async () => {
    if (!main) return;
    const ok = await confirm({
      title: t('territories.outline.undoTitle'),
      body: t('territories.outline.undoBody'),
      confirmLabel: t('territories.outline.undo'),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await territoriesApi.undoOutline(main.id);
      setDone(t('territories.outline.undone'));
      setEdited([]);
      setReport(null);
      await refresh();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const moveNoCall = async (noCallId: string, to: TerritoryRow) => {
    setError(null);
    try {
      await territoriesApi.editNoCall(noCallId, { territoryId: to.id });
      setMoved((m) => ({ ...m, [noCallId]: to.number }));
      await qc.invalidateQueries({ queryKey: ['territories', 'detail'] });
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={s.center}>
        <Text style={s.muted}>{t('territories.outline.webOnly')}</Text>
      </View>
    );
  }
  if (accessQ.isLoading || (open && (listQ.isLoading || detailQ.isLoading))) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (accessQ.error) return <LoadFailure error={accessQ.error} onRetry={() => accessQ.refetch()} />;
  if (!a || !open) return <NoAccess />;
  if (listQ.error || !rows) return <LoadFailure error={listQ.error} onRetry={() => listQ.refetch()} />;
  if (!main || !user) return <NoAccess />;

  const editable =
    main.geometry.type === 'Polygon' && (main.geometry.coordinates as number[][][]).length === 1;
  const mapHeight = wide ? Math.max(480, height - 120) : 440;
  const housesOf = (tid: string) => edited.find((e) => e.id === tid)?.houses ?? null;
  // The area exactly (the server's shares are counted on a grid, whole per cent).
  const areaLine = (tid: string) => {
    const e = edited.find((x) => x.id === tid);
    const was = byId.get(tid)?.geometry;
    const v = e && was ? areaChange(was, e.geometry) : 0;
    const shown = Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toLocaleString(i18n.language, { maximumFractionDigits: 1 })}`;
    return t('territories.outline.area', { change: shown });
  };
  const takers = report
    ? report.territories.filter((r) => r.id !== main.id && r.gaining > 0).map((r) => byId.get(r.id)!)
    : [];
  const noCalls = (detailQ.data?.noCalls ?? []).filter((n) => !moved[n.id]);

  const panel = (
    <View style={s.panel}>
      <Text style={s.title}>{t('territories.outline.title', { number: main.number })}</Text>
      <Text style={s.help}>{t('territories.outline.help')}</Text>

      <View style={[cardStyles.card, s.box]}>
        <Row label={t('territories.outline.shared')} value={shared} onChange={setShared} />
        <Row label={t('territories.outline.snap')} value={snap} onChange={setSnap} />
        <View style={s.steps}>
          <Small icon="arrow-undo-outline" label={t('territories.outline.stepBack')} onPress={() => editor.current?.stepBack()} />
          <Small icon="refresh-outline" label={t('territories.outline.reset')} onPress={() => editor.current?.reset()} />
        </View>
      </View>

      <Text style={s.section}>{t('territories.outline.changes')}</Text>
      <View style={[cardStyles.card, s.box]}>
        {edited.length === 0 ? (
          <Text style={s.muted}>{done ?? t('territories.outline.nothing')}</Text>
        ) : !report ? (
          <ActivityIndicator color={BRAND} />
        ) : (
          <>
            {report.territories.map((r) => {
              const h = housesOf(r.id);
              return (
                <View key={r.id} style={s.change}>
                  <View style={s.changeHead}>
                    <Text style={s.changeNumber}>{r.number}</Text>
                    {r.held ? <Text style={s.held}>{t('territories.outline.held')}</Text> : null}
                  </View>
                  <Text style={s.changeText}>{areaLine(r.id)}</Text>
                  {r.leaving > 0 || r.gaining > 0 ? (
                    <Text style={s.changeText}>
                      {t('territories.outline.share', { leaving: r.leaving, gaining: r.gaining })}
                    </Text>
                  ) : null}
                  {h ? (
                    <Text style={s.changeText}>
                      {t('territories.outline.houses', { leaving: h.leaving, coming: h.coming })}
                    </Text>
                  ) : null}
                  {r.tooMuch ? (
                    <Text style={s.bad}>{t('territories.outline.tooMuch', { number: r.number })}</Text>
                  ) : r.held && r.leaving > 0 ? (
                    <Text style={s.warn}>{t('territories.outline.heldHint')}</Text>
                  ) : null}
                  {r.outsideBoundary > 0 ? (
                    <Text style={s.warn}>
                      {t('territories.outline.outside', { share: r.outsideBoundary })}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {report.overlaps.map(([x, y]) => (
              <Text key={`${x}-${y}`} style={s.bad}>
                {t('territories.outline.overlap', { a: x, b: y })}
              </Text>
            ))}
          </>
        )}
      </View>

      {takers.length > 0 && noCalls.length > 0 ? (
        <>
          <Text style={s.section}>{t('territories.outline.noCalls')}</Text>
          <View style={[cardStyles.card, s.box]}>
            <Text style={s.help}>{t('territories.outline.noCallsHint')}</Text>
            {noCalls.map((n) => (
              <View key={n.id} style={s.nc}>
                <Text style={s.ncText}>{n.address}</Text>
                <View style={s.ncTo}>
                  {takers.map((to) => (
                    <Pressable
                      key={to.id}
                      onPress={() => void moveNoCall(n.id, to)}
                      style={s.chip}
                      accessibilityRole="button"
                      accessibilityLabel={t('territories.outline.moveTo', { number: to.number })}
                    >
                      <Text style={s.chipText}>{t('territories.outline.moveTo', { number: to.number })}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
      {Object.entries(moved).map(([nid, number]) => (
        <Text key={nid} style={s.okText}>
          {t('territories.outline.moved', { number })}
        </Text>
      ))}

      {error ? <Text style={s.bad}>{error}</Text> : null}
      <Pressable
        onPress={() => void save()}
        disabled={!canSave}
        style={[s.go, !canSave && s.goOff]}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>{t('territories.outline.save')}</Text>}
      </Pressable>
      <Pressable onPress={() => void undoSaved()} disabled={busy} style={s.undo} accessibilityRole="button">
        <Text style={s.undoText}>{t('territories.outline.undo')}</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} style={s.undo} accessibilityRole="button">
        <Text style={s.undoText}>{t('territories.outline.back')}</Text>
      </Pressable>
    </View>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, wide && s.contentWide]}>
      <Stack.Screen options={{ title: t('territories.outline.title', { number: main.number }) }} />
      <View style={wide ? s.mapWide : undefined}>
        {editable ? (
          <OutlineEditor
            key={version}
            ref={editor}
            congregationId={user.congregationId}
            streetsReady={!!a.mapReady}
            main={main}
            neighbours={neighbours}
            boundary={boundaryQ.data?.geometry ?? null}
            sharedBorder={shared}
            snapStreets={snap}
            height={mapHeight}
            onChange={setEdited}
          />
        ) : (
          <View style={[cardStyles.card, s.box]}>
            <Text style={s.muted}>{t('territories.outline.multi')}</Text>
          </View>
        )}
      </View>
      {panel}
    </ScrollView>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.row}>
      <Text style={s.rowText}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

function Small({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.small} accessibilityRole="button">
      <Ionicons name={icon} size={15} color={BRAND} />
      <Text style={s.smallText}>{label}</Text>
    </Pressable>
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  small: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  smallText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: BRAND },
  section: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: MUTED,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  muted: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, lineHeight: 18 },
  change: { gap: 2, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  changeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  changeNumber: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5, color: INK },
  held: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  changeText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: INK },
  warn: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#b45309', lineHeight: 17 },
  bad: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: '#b91c1c', lineHeight: 17 },
  okText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#047857' },
  nc: { gap: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  ncText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK },
  ncTo: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: BRAND, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: BRAND },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  goOff: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  undo: { paddingVertical: 8, alignItems: 'center' },
  undoText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: BRAND },
});
