import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import { KeyboardScroll } from '../../../../../components/KeyboardScroll';
import { LoadFailure } from '../../../../../components/LoadFailure';
import { NoAccess } from '../../../../../components/NoAccess';
import {
  LineEditor,
  type LineEditorHandle,
  type LineHome,
  type LinePart,
  type LineTool,
} from '../../../../../components/territories/LineEditor';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../../../../../components/reports/ReportBits';
import { extractErrorMessage, recutApi, territoriesApi, type RecutPreview } from '../../../../../lib/api';
import { useAuth } from '../../../../../lib/auth';
import { failsScreen } from '../../../../../lib/screen-failure';
import { km, PART_COLORS, RECUT_KEY } from '../../../../../lib/recut';
import {
  besideCounts,
  cutOf,
  homesByPart,
  movedShare,
  REOPEN_SHARE,
  type Pt,
} from '../../../../../lib/recut-lines';

const OK = '#047857';
const WARN = '#b45309';
const BAD = '#b91c1c';

/**
 * «Линии разреза» (16 November 2026, step 3b of the draft of re-cutting;
 * boards 3 and 3a of the canvas): the lines of a cut moved on the map, on
 * a computer. While a point is dragged the homes of each part are counted
 * here, as the server would count them (lib/recut-lines.ts); once it is let
 * go the server cuts the parts and walks them (the preview), nothing saved.
 * Beside the map: the parts with homes, walk and the measure, how many homes
 * change part — over a tenth, «no remarks» given before wait for a new look
 * and a decided proposal goes back to the service committee — the homes
 * beside each line, which part keeps the number. A save over a newer one
 * (the assistant saved meanwhile) is refused, not silently replaced.
 */
export default function RecutLinesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const qc = useQueryClient();
  const { width, height } = useWindowDimensions();
  const wide = width >= 1000;
  const web = Platform.OS === 'web';
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    throwOnError: failsScreen,
    enabled: web,
  });
  const viewQ = useQuery({
    queryKey: RECUT_KEY,
    queryFn: () => recutApi.view(),
    throwOnError: failsScreen,
    enabled: web,
  });
  const view = viewQ.data;
  const p = view?.proposals.find((x) => x.id === id && x.state === 'open' && x.kind === 'cut') ?? null;
  const territory = p?.territories[0] ?? null;
  const territoryId = territory?.id ?? '';
  const homesQ = useQuery({
    queryKey: ['territories', 'homes', territoryId],
    queryFn: () => territoriesApi.homes(territoryId),
    enabled: web && !!territoryId && !!view?.canEdit,
  });

  const editor = useRef<LineEditorHandle>(null);
  const [version, setVersion] = useState(0);
  const [tool, setTool] = useState<LineTool>('points');
  const [snap, setSnap] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [lines, setLines] = useState<Pt[][] | null>(null);
  const [keep, setKeep] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ key: string; data: RecutPreview } | null>(null);
  const [previewError, setPreviewError] = useState<{ key: string; text: string } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  /**
   * The version the editor started from, fixed: the view underneath is
   * looked at again while walks are worked out, and a save must not take
   * on a newer version someone else saved meanwhile.
   */
  const [base, setBase] = useState<string | undefined>(undefined);
  const ask = useRef<AbortController | null>(null);

  const saved = useMemo(() => (p?.lines ?? []) as Pt[][], [p?.lines]);
  // The lines start as saved; a new version (a save, the saved ones loaded) starts again.
  useEffect(() => {
    if (p) {
      setLines(saved.map((l) => l.slice()));
      setBase(p.updatedAt);
      setKeep(p.keep);
      setPreview(null);
      setPreviewError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, version]);

  const homes = useMemo<Pt[]>(
    () => (homesQ.data?.houses ?? []).filter((h) => h.home).map((h) => [h.lon, h.lat] as Pt),
    [homesQ.data],
  );
  const geometry = territory?.geometry ?? null;
  const savedCut = useMemo(() => (geometry ? cutOf(geometry, saved) : null), [geometry, saved]);
  const cut = useMemo(() => (geometry && lines ? cutOf(geometry, lines) : null), [geometry, lines]);
  const counts = useMemo(() => (cut ? homesByPart(cut, homes) : []), [cut, homes]);
  // Without homes, another number of parts still counts as all (as the save judges it).
  const moved = useMemo(
    () => (savedCut && cut ? movedShare(savedCut, cut, homes) : 0),
    [savedCut, cut, homes],
  );
  const beside = useMemo(
    () => (geometry && lines ? besideCounts(geometry, lines, homes) : []),
    [geometry, lines, homes],
  );
  const mapHomes = useMemo<LineHome[]>(() => {
    if (!cut || !savedCut) return [];
    const sameParts = cut.parts === savedCut.parts;
    return homes.map((h) => {
      const now = cut.partOf(h);
      const was = savedCut.partOf(h);
      return {
        p: h,
        color: now >= 0 ? PART_COLORS[now % PART_COLORS.length] : '#94a3b8',
        moved: sameParts && was >= 0 && now !== was,
      };
    });
  }, [cut, savedCut, homes]);

  const key = lines ? JSON.stringify(lines) : '';
  const shown = preview && preview.key === key ? preview.data : null;
  const shownError = previewError && previewError.key === key ? previewError.text : null;
  const mapParts = useMemo<LinePart[]>(
    () =>
      (shown?.parts ?? []).map((x, i) => ({
        geometry: x.geometry,
        color: PART_COLORS[i % PART_COLORS.length],
        label: `${i + 1} · ${x.number}`,
      })),
    [shown],
  );

  /** The server's cut of the lines let go: parts, walks, numbers. */
  const askServer = (next: Pt[][]) => {
    if (!geometry || !id) return;
    const k = JSON.stringify(next);
    const c = cutOf(geometry, next);
    if (c.problem) return;
    ask.current?.abort();
    const ctl = new AbortController();
    ask.current = ctl;
    setAsking(k);
    recutApi
      .preview(id, next, ctl.signal)
      .then((data) => {
        setPreview({ key: k, data });
        setPreviewError(null);
        setKeep((was) => (was === null || was >= data.parts.length ? data.keep : was));
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setPreviewError({ key: k, text: extractErrorMessage(e) });
      })
      .finally(() => {
        if (ask.current === ctl) setAsking(null);
      });
  };
  // The saved lines' own parts, so their walks are shown before any move —
  // at the start and again once the saved lines are loaded.
  useEffect(() => {
    if (p && geometry) askServer(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, version, !!geometry]);
  useEffect(() => () => ask.current?.abort(), []);

  const save = useMutation({
    // `over`: the version to save over — the newer one, when the keeper chose
    // to keep his lines after someone else saved.
    mutationFn: (over?: string) => {
      const nParts = shown?.parts.length ?? 0;
      return recutApi.update(id ?? '', {
        kind: 'cut',
        territoryIds: p?.territories.map((x) => x.id) ?? [],
        lines: (lines ?? []).map((points) => ({ points })),
        keep: Math.min(keep ?? 0, Math.max(0, nParts - 1)),
        numbers: shown?.numbers ?? [],
        queue: p?.queue ?? 1,
        ...((over ?? base) ? { baseUpdatedAt: over ?? base } : {}),
      });
    },
    onSuccess: (v) => {
      qc.setQueryData(RECUT_KEY, v);
      router.back();
    },
    onError: (e) => {
      const code = e instanceof AxiosError ? (e.response?.data as { code?: string } | undefined)?.code : undefined;
      setStale(code === 'TERRITORY_RECUT_STALE');
      setError(extractErrorMessage(e));
    },
  });

  if (!web) {
    return (
      <View style={s.center}>
        <Text style={s.muted}>{t('territories.recut.lines.webOnly')}</Text>
      </View>
    );
  }
  if (accessQ.isLoading || viewQ.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (viewQ.error || !view) return <LoadFailure error={viewQ.error} onRetry={() => viewQ.refetch()} />;
  if (!view.canEdit || !user) return <NoAccess />;
  if (!p || !territory || !geometry) {
    return (
      <View style={s.center}>
        <Stack.Screen options={{ title: t('territories.recut.title') }} />
        <Text style={s.muted}>{t('territories.recut.proposal.notFound')}</Text>
      </View>
    );
  }
  if (homesQ.error) return <LoadFailure error={homesQ.error} onRetry={() => homesQ.refetch()} />;

  const tv = view.territories.find((x) => x.id === territory.id);
  const far = tv?.cls === 'far';
  const maxKm = far ? view.measure.remoteMaxKm : view.measure.cityMaxKm;
  const targetKm = far ? view.measure.remoteTargetKm : view.measure.cityTargetKm;
  // Beside the panel, the tools above it: what the window leaves.
  const mapHeight = wide ? Math.max(460, height - 260) : 440;
  const problem = cut?.problem ?? null;
  const decided = !!p.approvedAt;
  const much = moved > REOPEN_SHARE;
  const movedHomes = Math.round(moved * homes.length);
  const suggested = (p.suggestedLines ?? null) as Pt[][] | null;
  const atSuggested = !suggested || JSON.stringify(suggested) === key;
  const changed = key !== JSON.stringify(saved) || (keep ?? p.keep) !== p.keep;
  // Only lines the server has cut: its numbers and its check of the parts.
  const canSave = changed && !problem && !shownError && !!shown && !save.isPending && !!lines?.length;
  const nParts = cut && !problem ? cut.parts : 0;
  const keepAt = Math.min(keep ?? p.keep, Math.max(0, nParts - 1));
  // While the server has not cut these lines yet: the numbers as saved.
  const numberOf = (i: number) => {
    if (i === keepAt) return territory.number;
    const others = shown?.numbers ?? p.numbers ?? [];
    return others[i < keepAt ? i : i - 1] ?? '…';
  };
  const verdict = (w: number) =>
    w > maxKm
      ? { text: t('territories.recut.lines.over', { km: km(maxKm, lang) }), color: BAD }
      : w < view.measure.minKm
        ? { text: t('territories.recut.lines.under', { km: km(view.measure.minKm, lang) }), color: WARN }
        : { text: t('territories.recut.lines.fits'), color: OK };

  const toolButton = (k: LineTool, label: string, disabled = false) => (
    <Pressable
      key={k}
      onPress={() => setTool(k)}
      disabled={disabled}
      style={[s.tool, tool === k && s.toolOn, disabled && s.off]}
      accessibilityRole="button"
      accessibilityState={{ selected: tool === k, disabled }}
    >
      <Text style={[s.toolText, tool === k && s.toolTextOn]}>{label}</Text>
    </Pressable>
  );
  const small = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={disabled}
      style={[s.tool, disabled && s.off]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={s.toolText}>{label}</Text>
    </Pressable>
  );

  const problemText = problem
    ? t(`territories.recut.lines.problem.${problem.why}`, { n: problem.line + 1 })
    : null;

  const panel = (
    <View style={wide ? s.panel : { gap: 12 }}>
      <View style={[cardStyles.card, s.box]}>
        <Text style={s.section}>{t('territories.recut.lines.parts')}</Text>
        {problemText ? <Text style={s.bad}>{problemText}</Text> : null}
        {!problem && counts.length
          ? counts.map((n, i) => {
              const x = shown?.parts[i];
              const w = x?.walkKm ?? null;
              const v = w !== null ? verdict(w) : null;
              return (
                <View key={i} style={s.partRow}>
                  <View style={[s.swatch, { backgroundColor: PART_COLORS[i % PART_COLORS.length] }]} />
                  <Text style={s.partName} numberOfLines={1}>
                    {`${i + 1} · ${x?.number ?? numberOf(i)}`}
                  </Text>
                  <Text style={s.partFig}>{t('territories.recut.lines.homes', { count: n })}</Text>
                  <Text style={[s.partFig, s.partKm]}>
                    {w !== null ? t('territories.recut.proposal.km', { km: km(w, lang) }) : asking === key ? '…' : '—'}
                  </Text>
                  {v ? <Text style={[s.verdict, { color: v.color }]}>{v.text}</Text> : null}
                </View>
              );
            })
          : null}
        <Text style={s.hint}>
          {asking === key
            ? t('territories.recut.lines.walking')
            : t('territories.recut.lines.measure', { target: km(targetKm, lang), max: km(maxKm, lang) })}
        </Text>
        {shownError ? <Text style={s.bad}>{shownError}</Text> : null}
        {nParts > 1 ? (
          <View style={{ gap: 6, marginTop: 4 }}>
            <Text style={s.label}>{t('territories.recut.lines.keeps', { number: territory.number })}</Text>
            <View style={s.chips}>
              {Array.from({ length: nParts }, (_, i) => (
                <Pressable
                  key={i}
                  onPress={() => setKeep(i)}
                  style={[s.chip, keepAt === i && s.chipOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: keepAt === i }}
                >
                  <Text style={[s.chipText, keepAt === i && s.chipTextOn]}>
                    {t('territories.recut.lines.part', { n: i + 1 })}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <View style={[cardStyles.card, s.box]}>
        <Text style={s.section}>{t('territories.recut.lines.moving')}</Text>
        <Text style={s.big}>
          {t('territories.recut.lines.movedHomes', {
            moved: movedHomes,
            all: homes.length,
            share: Math.round(moved * 100),
          })}
        </Text>
        <View style={s.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={[s.barFill, { width: `${Math.min(100, Math.round(moved * 100))}%`, backgroundColor: much ? WARN : BRAND }]} />
          <View style={s.barMark} />
        </View>
        <Text style={much ? s.warn : s.hint}>
          {much
            ? decided
              ? t('territories.recut.lines.reopens')
              : t('territories.recut.lines.staleMarks')
            : t('territories.recut.lines.small')}
        </Text>
      </View>

      <View style={[cardStyles.card, s.box]}>
        <Text style={s.section}>{t('territories.recut.lines.besideTitle')}</Text>
        {beside.map((n, i) => (
          <Text key={i} style={[s.row, selected === i && s.rowOn]}>
            {t('territories.recut.lines.beside', { n: i + 1, count: n })}
          </Text>
        ))}
        <Text style={s.hint}>{t('territories.recut.lines.besideHint')}</Text>
      </View>

      {error ? (
        <View style={[cardStyles.card, s.box]}>
          <Text style={s.bad}>{error}</Text>
          {stale ? (
            <View style={s.tools}>
              <Pressable
                onPress={async () => {
                  setError(null);
                  setStale(false);
                  await qc.invalidateQueries({ queryKey: RECUT_KEY });
                  setVersion((v) => v + 1);
                }}
                style={s.tool}
                accessibilityRole="button"
              >
                <Text style={s.toolText}>{t('territories.recut.lines.loadSaved')}</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setError(null);
                  setStale(false);
                  // The newer version read now; the keeper's lines stay as drawn.
                  const v = await recutApi.view();
                  const now = v.proposals.find((x) => x.id === id)?.updatedAt;
                  setBase(now);
                  save.mutate(now);
                }}
                style={s.tool}
                accessibilityRole="button"
              >
                <Text style={s.toolText}>{t('territories.recut.lines.saveOver')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={() => save.mutate(undefined)}
        disabled={!canSave}
        style={[s.go, !canSave && s.off]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave }}
      >
        {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>{t('territories.recut.lines.save')}</Text>}
      </Pressable>
      <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button">
        <Text style={s.backText}>{t('territories.recut.lines.cancel')}</Text>
      </Pressable>
    </View>
  );

  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={[s.content, wide && s.contentWide]}>
      <Stack.Screen options={{ title: t('territories.recut.lines.title', { number: territory.number }) }} />
      <View style={wide ? s.mapWide : { gap: 10 }}>
        <View style={s.tools}>
          {toolButton('points', t('territories.recut.lines.toolPoints'))}
          {toolButton('redraw', t('territories.recut.lines.toolRedraw'), selected === null)}
          {toolButton('add', t('territories.recut.lines.toolAdd'), (lines?.length ?? 0) >= 7)}
          {small(t('territories.recut.lines.remove'), () => editor.current?.removeSelected(), selected === null || (lines?.length ?? 0) <= 1)}
          {small(t('territories.recut.lines.stepBack'), () => editor.current?.stepBack())}
          {small(t('territories.recut.lines.suggested'), () => suggested && editor.current?.setLines(suggested), atSuggested)}
          <View style={s.snap}>
            <Switch value={snap} onValueChange={setSnap} accessibilityLabel={t('territories.recut.lines.snap')} />
            <Text style={s.toolText}>{t('territories.recut.lines.snap')}</Text>
          </View>
        </View>
        {lines && homesQ.data ? (
          <LineEditor
            key={`${p.id}:${version}`}
            ref={editor}
            congregationId={user.congregationId}
            streetsReady={!!accessQ.data?.mapReady}
            territory={geometry}
            saved={saved}
            lines={lines}
            homes={mapHomes}
            parts={mapParts}
            tool={tool}
            snapStreets={snap}
            height={mapHeight}
            onSelect={setSelected}
            onMove={setLines}
            onDone={(next) => {
              setLines(next);
              setTool('points');
              askServer(next);
            }}
          />
        ) : (
          <View style={[s.center, { height: mapHeight }]}>
            <ActivityIndicator color={BRAND} />
          </View>
        )}
        <Text style={s.hint}>{t('territories.recut.lines.how')}</Text>
      </View>
      {panel}
    </KeyboardScroll>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 40, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
  contentWide: { flexDirection: 'row', alignItems: 'flex-start', maxWidth: 1600 },
  mapWide: { flex: 1, minWidth: 0, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 360, gap: 12 },
  box: { marginBottom: 0, gap: 8 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tool: {
    minHeight: 40,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  toolOn: { backgroundColor: BRAND, borderColor: BRAND },
  toolText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND },
  toolTextOn: { color: '#fff' },
  off: { opacity: 0.45 },
  snap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 4 },
  section: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 12,
    letterSpacing: 0.6,
    color: MUTED,
    textTransform: 'uppercase',
  },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  partName: { flex: 1, minWidth: 90, fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK },
  partFig: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK },
  partKm: { minWidth: 60, textAlign: 'right' },
  verdict: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  label: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: LINE, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: BRAND, backgroundColor: '#ecfeff' },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: MUTED },
  chipTextOn: { fontFamily: 'Manrope_700Bold', color: BRAND },
  big: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: INK },
  bar: { height: 10, borderRadius: 999, backgroundColor: '#e2e8f0', overflow: 'visible' },
  barFill: { height: 10, borderRadius: 999 },
  barMark: { position: 'absolute', left: '10%', top: -4, width: 2, height: 18, backgroundColor: INK },
  row: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK },
  rowOn: { color: BRAND },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, lineHeight: 18 },
  muted: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: MUTED, lineHeight: 19, textAlign: 'center' },
  warn: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: WARN, lineHeight: 18 },
  bad: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BAD, lineHeight: 18 },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  back: { alignItems: 'center', paddingVertical: 10 },
  backText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BRAND },
});
