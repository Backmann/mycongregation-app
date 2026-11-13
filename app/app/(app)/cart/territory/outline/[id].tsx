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
import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../../../components/KeyboardScroll';
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
  type EditorTool,
  type OutlineEditorHandle,
  type PreviewShape,
} from '../../../../../components/territories/OutlineEditor';
import { CutPanel, JoinPanel, UndoReshape } from '../../../../../components/territories/ReshapePanels';
import { areaChange, roundGeometry, type Pt } from '../../../../../lib/outline-edit';
import { boxOf } from '../../../../../lib/territory-view';
import { boxWith, holderWillHear, placeOf } from '../../../../../lib/territory-place';
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
  const { id, at } = useLocalSearchParams<{ id: string; at?: string }>();
  const place = placeOf(at);
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
  // The territories this change takes ground from: their «не посещать» may
  // now lie in a neighbour (13 November 2026).
  // The server counts whole per cents; a small move gives less, so the exact
  // change of area drawn here decides too.
  const areaOf = (tid: string) => {
    const e = edited.find((x) => x.id === tid);
    const was = listQ.data?.find((r) => r.id === tid)?.geometry;
    return e && was ? areaChange(was, e.geometry) : 0;
  };
  const giverIds = useMemo(
    () =>
      (report?.territories ?? [])
        .filter((r) => r.leaving > 0 || areaOf(r.id) < -0.01)
        .map((r) => r.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report, edited],
  );
  const giverQs = useQueries({
    queries: giverIds.map((gid) => ({
      queryKey: ['territories', 'detail', gid],
      queryFn: () => territoriesApi.detail(gid),
      enabled: open,
    })),
  });
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // «Не посещать» to move with the save (13 November 2026): address → the
  // territory it now lies in. Nothing moves before the border is saved.
  const [moves, setMoves] = useState<Record<string, string>>({});
  // Step 3 (12 November 2026): cut along a line, join with a neighbour.
  const [tool, setTool] = useState<EditorTool>('points');
  const [line, setLine] = useState<Pt[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewShape[]>([]);
  const [reshaped, setReshaped] = useState<string | null>(null);

  const rows = listQ.data;
  const main = rows?.find((r) => r.id === id) ?? null;
  const neighbours = useMemo(() => {
    if (!rows || !main) return [];
    // Opened from the checks at a gap: the neighbours around it count too.
    const b = boxWith(boxOf([main.geometry]), place);
    if (!b) return [];
    const [[x1, y1], [x2, y2]] = b;
    return rows.filter((r) => {
      if (r.id === main.id || (r.category ?? 'residential') !== (main.category ?? 'residential')) return false;
      const o = boxOf([r.geometry]);
      if (!o) return false;
      const [[a1, b1], [a2, b2]] = o;
      return a1 <= x2 + AROUND * 1.6 && a2 >= x1 - AROUND * 1.6 && b1 <= y2 + AROUND && b2 >= y1 - AROUND;
    });
  }, [rows, main, place?.[0], place?.[1]]);
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
      const ids = new Set(report?.territories.map((x) => x.id) ?? []);
      const noCallMoves = Object.entries(moves)
        .filter(([, to]) => ids.has(to))
        .map(([nid, to]) => ({ id: nid, to }));
      const r = await territoriesApi.saveOutline(main.id, { ...body, noCallMoves });
      setDone(savedWords(r.saved, r.noCallsMoved ?? 0, r.holdersTold ?? []));
      setEdited([]);
      setReport(null);
      setMoves({});
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
      const r = await territoriesApi.undoOutline(main.id);
      setDone(
        [
          t('territories.outline.undone'),
          r.noCallsMoved ? t('territories.outline.noCallsBack', { count: r.noCallsMoved }) : null,
        ]
          .filter(Boolean)
          .join(' '),
      );
      setMoves({});
      setEdited([]);
      setReport(null);
      await refresh();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** What the save did, in one line. */
  const savedWords = (saved: number, movedCount: number, told: string[]) =>
    [
      t('territories.outline.saved', { n: saved }),
      movedCount ? t('territories.outline.noCallsMoved', { count: movedCount }) : null,
      told.length ? t('territories.outline.told', { list: told.join(', ') }) : null,
    ]
      .filter(Boolean)
      .join(' ');

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
  // Each address of a territory that gives ground, with the territories
  // that take ground it could now lie in.
  const takersOf = (gid: string) =>
    (report?.territories ?? [])
      .filter((r) => r.id !== gid && (r.gaining > 0 || areaOf(r.id) > 0.01))
      .map((r) => byId.get(r.id))
      .filter((r): r is TerritoryRow => !!r);
  const noCallRows = giverIds.flatMap((gid, i) => {
    const takers = takersOf(gid);
    if (takers.length === 0) return [];
    return (giverQs[i]?.data?.noCalls ?? []).map((n) => ({ n, from: byId.get(gid)!, takers }));
  });
  const heldLine = (r: TerritoryOutlineReport['territories'][number]) => {
    const holder = byId.get(r.id)?.holder;
    if (!holder || !holderWillHear(r)) return null;
    // A group's territory has no one person to tell; a holder brought over
    // without a card (the import) has no app to tell him.
    if (holder.forGroupName) return t('territories.outline.heldGroup', { group: holder.forGroupName });
    if (!holder.publisherId) return t('territories.outline.heldNoCard', { name: holder.name });
    return t('territories.outline.heldTold', { name: holder.name });
  };

  const pointsPanel = (
    <>
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
                  {r.houses ? (
                    // The server's register: every building, whatever the map shows.
                    <Text style={s.changeText}>
                      {t('territories.outline.housesExact', {
                        leaving: r.houses.leaving,
                        coming: r.houses.coming,
                        before: r.houses.before,
                      })}
                    </Text>
                  ) : h === 'zoom' || h === 'view' ? (
                    <Text style={s.hint}>{t(`territories.outline.houses_${h}`)}</Text>
                  ) : h ? (
                    <Text style={s.changeText}>
                      {t('territories.outline.houses', { leaving: h.leaving, coming: h.coming })}
                    </Text>
                  ) : null}
                  {r.tooMuch ? (
                    <Text style={s.bad}>{t('territories.outline.tooMuch', { number: r.number })}</Text>
                  ) : heldLine(r) ? (
                    <Text style={s.warn}>{heldLine(r)}</Text>
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

      {noCallRows.length > 0 ? (
        <>
          <Text style={s.section}>{t('territories.outline.noCalls')}</Text>
          <View style={[cardStyles.card, s.box]}>
            <Text style={s.help}>{t('territories.outline.noCallsHint')}</Text>
            {noCallRows.map(({ n, from, takers }) => {
              const to = moves[n.id] ?? from.id;
              const pick = (tid: string) =>
                setMoves((cur) => {
                  const next = { ...cur };
                  if (tid === from.id) delete next[n.id];
                  else next[n.id] = tid;
                  return next;
                });
              return (
                <View key={n.id} style={s.nc}>
                  <Text style={s.ncText}>{n.address}</Text>
                  <Text style={s.muted}>{t('territories.outline.noCallNow', { number: from.number })}</Text>
                  <View style={s.ncTo}>
                    {[from, ...takers].map((x) => {
                      const on = to === x.id;
                      const label =
                        x.id === from.id
                          ? t('territories.outline.stays', { number: x.number })
                          : t('territories.outline.moveTo', { number: x.number });
                      return (
                        <Pressable
                          key={x.id}
                          onPress={() => pick(x.id)}
                          style={[s.chip, on && s.chipOn]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={label}
                        >
                          <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

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
    </>
  );

  const tools: { key: EditorTool; label: string }[] = [
    { key: 'points', label: t('territories.reshape.toolPoints') },
    { key: 'cut', label: t('territories.reshape.toolCut') },
    { key: 'join', label: t('territories.reshape.toolJoin') },
  ];
  const panel = (
    <View style={s.panel}>
      <Text style={s.title}>{t('territories.outline.title', { number: main.number })}</Text>
      <View style={s.tools} accessibilityRole="radiogroup">
        {tools.map((x) => {
          // Cutting or joining with corners moved but not saved would mix two changes.
          const locked = x.key !== 'points' && edited.length > 0;
          return (
            <Pressable
              key={x.key}
              onPress={() => {
                setTool(x.key);
                setLine(null);
                setPick(null);
                setPreview([]);
              }}
              disabled={locked}
              style={[s.tool, tool === x.key && s.toolOn, locked && s.goOff]}
              accessibilityRole="radio"
              accessibilityState={{ selected: tool === x.key, disabled: locked }}
            >
              <Text style={[s.toolText, tool === x.key && s.toolTextOn]}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {edited.length > 0 && tool === 'points' ? (
        <Text style={s.hint}>{t('territories.reshape.saveFirst')}</Text>
      ) : null}
      {reshaped ? <Text style={s.okText}>{reshaped}</Text> : null}
      {tool === 'points' ? (
        pointsPanel
      ) : tool === 'cut' ? (
        <>
          <CutPanel
            territory={main}
            line={line}
            noCalls={detailQ.data?.noCalls ?? []}
            onPreview={setPreview}
            onDone={(text) => {
              setReshaped(text);
              setLine(null);
              setTool('points');
            }}
          />
          <UndoReshape territory={main} onDone={(text) => setReshaped(text)} />
        </>
      ) : (
        <>
          <JoinPanel
            territory={main}
            otherId={pick}
            onPreview={setPreview}
            onDone={(text, keptId) => {
              setReshaped(text);
              setPick(null);
              setTool('points');
              if (keptId !== main.id) router.replace(`/cart/territory/outline/${keptId}` as never);
            }}
          />
          <UndoReshape territory={main} onDone={(text) => setReshaped(text)} />
        </>
      )}
      <Pressable onPress={() => router.back()} style={s.undo} accessibilityRole="button">
        <Text style={s.undoText}>{t('territories.outline.back')}</Text>
      </Pressable>
    </View>
  );

  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={[s.content, wide && s.contentWide]}>
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
            tool={tool}
            onLine={setLine}
            onPick={setPick}
            preview={preview}
            around={place}
          />
        ) : (
          <View style={[cardStyles.card, s.box]}>
            <Text style={s.muted}>{t('territories.outline.multi')}</Text>
          </View>
        )}
      </View>
      {panel}
    </KeyboardScroll>
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
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, lineHeight: 16 },
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
  chip: { borderWidth: 1, borderColor: LINE, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipOn: { borderColor: BRAND, backgroundColor: '#ecfeff' },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: MUTED },
  chipTextOn: { fontFamily: 'Manrope_700Bold', color: BRAND },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  goOff: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  undo: { paddingVertical: 8, alignItems: 'center' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tool: { borderWidth: 1, borderColor: LINE, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff' },
  toolOn: { backgroundColor: BRAND, borderColor: BRAND },
  toolText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: BRAND },
  toolTextOn: { color: '#fff' },
  undoText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: BRAND },
});
