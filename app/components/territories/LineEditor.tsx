import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TerritoryGeometry } from '../../lib/api';
import {
  loadDrawLibs,
  loadMapLibs,
  MAP_FILES,
  mapFileUrl,
  type MapLibreMap,
  type TerraDrawInstance,
} from '../../lib/map-libs';
import { metres, snapToLines, type Pt } from '../../lib/outline-edit';
import { boxOf } from '../../lib/territory-view';

/** What the mouse does on the map of a cut's lines (16 November 2026). */
export type LineTool = 'points' | 'redraw' | 'add';

/** A home on the map: its place, the colour of its part, moved against the saved lines. */
export interface LineHome {
  p: Pt;
  color: string;
  moved: boolean;
}

/** A part as the server cut it, laid under the lines once a line is let go. */
export interface LinePart {
  geometry: TerritoryGeometry;
  color: string;
  label: string;
}

export interface LineEditorHandle {
  /** One step back: the last drag, added or removed point, line drawn. */
  stepBack: () => void;
  /** Puts these lines on the map as a new step (the lines first proposed, say). */
  setLines: (lines: Pt[][]) => void;
  /** Takes the selected line away. */
  removeSelected: () => void;
}

const OUTLINE = '#0f172a';
const LINE_COLOR = '#b91c1c';
const WAS = '#64748b';
/** Within this many screen pixels a street attracts a dragged point. */
const STREET_PX = 14;
/** A line not touched keeps its saved points: terra-draw holds seven decimals. */
const seven = (line: Pt[]): Pt[] => line.map((p) => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7]);
const same = (a: Pt[], b: Pt[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The map where a cut's lines are moved (16 November 2026, web only; step
 * 3b of the draft of re-cutting). The territory's outline, the lines as
 * they are saved (grey, dashed) and as they are being moved, the homes in
 * the colours of their parts — the screen counts them while a point is
 * dragged — and, once a line is let go, the parts as the server cuts them.
 *
 * A point of a line is dragged; a click on the middle of a stretch adds one;
 * the right mouse button takes one away. «Redraw» replaces the selected
 * line with one drawn anew, «add» draws one more. A dragged point is drawn
 * to a nearby street (optional). Every change is reported as it happens
 * (onMove) and once it is done (onDone).
 */
export const LineEditor = forwardRef<
  LineEditorHandle,
  {
    congregationId: string;
    streetsReady: boolean;
    territory: TerritoryGeometry;
    /** The lines as saved: drawn grey and dashed under the ones being moved. */
    saved: Pt[][];
    /** The lines to start with. */
    lines: Pt[][];
    homes: LineHome[];
    parts: LinePart[];
    tool: LineTool;
    snapStreets: boolean;
    height: number;
    /** The selected line, by its place in the list. */
    onSelect: (index: number | null) => void;
    onMove: (lines: Pt[][]) => void;
    onDone: (lines: Pt[][]) => void;
  }
>(function LineEditor(props, ref) {
  const { t } = useTranslation();
  const host = useRef<View>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const draw = useRef<TerraDrawInstance | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  /** The features of the lines, in the lines' order. */
  const ids = useRef<(string | number)[]>([]);
  /** The lines as they are now; untouched ones keep their saved points. */
  const current = useRef<Pt[][]>(props.lines.map((l) => l.slice()));
  const drawn = useRef<Pt[][]>([]);
  const history = useRef<Pt[][][]>([]);
  const selected = useRef<number | null>(null);
  const streets = useRef<Pt[][]>([]);
  const busy = useRef(false);
  const frame = useRef<number | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opts = useRef(props);
  opts.current = props;

  const lines = () => current.current.map((l) => l.slice());
  const moved = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      opts.current.onMove(lines());
    });
  };
  /** A change is done: one step of history, the parts asked for. */
  const done = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = null;
    const now = lines();
    const last = history.current[history.current.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(now)) return;
    history.current.push(now);
    opts.current.onMove(now);
    opts.current.onDone(now);
  };
  /** A point taken away fires no «finish»: done a moment after the last change. */
  const settleSoon = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(done, 500);
  };

  /** All the lines drawn again from `current` (after a step back or a new set). */
  const redrawAll = () => {
    const d = draw.current;
    if (!d) return;
    busy.current = true;
    try {
      if (ids.current.length) d.removeFeatures(ids.current);
      const added = d.addFeatures(
        current.current.map((l) => ({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: seven(l) },
          properties: { mode: 'linestring' },
        })),
      );
      ids.current = added.map((r) => r.id);
      drawn.current = current.current.map((l) => seven(l));
      d.setMode(opts.current.tool === 'points' ? 'select' : 'linestring');
    } finally {
      busy.current = false;
    }
    selected.current = null;
    opts.current.onSelect(null);
  };

  useImperativeHandle(ref, () => ({
    stepBack: () => {
      if (history.current.length <= 1) return;
      history.current.pop();
      current.current = history.current[history.current.length - 1].map((l) => l.slice());
      redrawAll();
      opts.current.onMove(lines());
      opts.current.onDone(lines());
    },
    setLines: (next) => {
      current.current = next.map((l) => l.slice());
      redrawAll();
      done();
    },
    removeSelected: () => {
      const i = selected.current;
      if (i === null || current.current.length <= 1) return;
      current.current.splice(i, 1);
      redrawAll();
      done();
    },
  }));

  useEffect(() => {
    let gone = false;
    type RoadsMap = MapLibreMap & {
      querySourceFeatures: (
        source: string,
        o: { sourceLayer: string },
      ) => { geometry: { type: string; coordinates: unknown } }[];
    };
    let m: RoadsMap | null = null;
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    void (async () => {
      try {
        const libs = await loadDrawLibs();
        const { maplibregl, basemaps } = await loadMapLibs();
        if (gone) return;
        const origin = window.location.origin;
        const { congregationId, streetsReady, territory } = opts.current;
        const style = {
          version: 8,
          glyphs: origin + MAP_FILES.glyphs,
          sprite: origin + MAP_FILES.sprite,
          sources: streetsReady
            ? {
                protomaps: {
                  type: 'vector',
                  url: `pmtiles://${mapFileUrl(origin, congregationId)}`,
                  attribution:
                    '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
                },
              }
            : {},
          layers: streetsReady
            ? basemaps.layers('protomaps', basemaps.namedFlavor('light'), { lang: 'de' })
            : [{ id: 'background', type: 'background', paint: { 'background-color': '#eef2f3' } }],
        };
        m = new maplibregl.Map({
          container: el,
          style,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          maxZoom: 19,
        }) as RoadsMap;
        m!.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        m!.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        // For the walkthrough script: the map and, below, the drawing.
        Object.defineProperty(el, 'lineMap', { value: m, configurable: true });
        const box = boxOf([territory]);
        if (box) m!.fitBounds(box, { padding: 40, animate: false, maxZoom: 18 });

        const readStreets = () => {
          if (!m || !streetsReady) return;
          const out: Pt[][] = [];
          for (const f of m.querySourceFeatures('protomaps', { sourceLayer: 'roads' })) {
            const g = f.geometry;
            if (g.type === 'LineString') out.push(g.coordinates as Pt[]);
            else if (g.type === 'MultiLineString') out.push(...(g.coordinates as Pt[][]));
          }
          streets.current = out;
        };

        m!.on('load', () => {
          if (gone || !m) return;
          const fc = (features: unknown[]) => ({ type: 'FeatureCollection', features });
          m.addSource('parts', { type: 'geojson', data: fc([]) });
          m.addLayer({
            id: 'parts-fill',
            type: 'fill',
            source: 'parts',
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
          });
          m.addSource('outline', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: territory },
          });
          m.addLayer({
            id: 'outline-line',
            type: 'line',
            source: 'outline',
            paint: { 'line-color': OUTLINE, 'line-width': 3 },
          });
          m.addSource('was', {
            type: 'geojson',
            data: fc(
              opts.current.saved.map((l) => ({
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: l },
              })),
            ),
          });
          m.addLayer({
            id: 'was-line',
            type: 'line',
            source: 'was',
            paint: { 'line-color': WAS, 'line-width': 2, 'line-dasharray': [2, 2] },
          });
          m.addSource('homes', { type: 'geojson', data: fc([]) });
          m.addLayer({
            id: 'homes-dot',
            type: 'circle',
            source: 'homes',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 17, 6],
              // A home that changes part: white with its new part's ring.
              'circle-color': ['case', ['get', 'moved'], '#ffffff', ['get', 'color']],
              'circle-stroke-color': ['get', 'color'],
              'circle-stroke-width': ['case', ['get', 'moved'], 2.5, 0.8],
            },
          });
          m.addLayer({
            id: 'parts-label',
            type: 'symbol',
            source: 'parts',
            layout: {
              'text-field': ['get', 'label'],
              'text-font': [MAP_FILES.labelFont],
              'text-size': 14,
            },
            paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
          });

          const metresPerPx = (lng: number, lat: number) => {
            const a = m!.project([lng, lat]);
            const b = m!.unproject([a.x + 1, a.y]);
            return metres([lng, lat], [b.lng, b.lat]);
          };
          const toCustom = (ev: { lng: number; lat: number }) => {
            if (!opts.current.snapStreets) return undefined;
            return snapToLines([ev.lng, ev.lat], streets.current, STREET_PX * metresPerPx(ev.lng, ev.lat)) ?? undefined;
          };
          const d = new libs.TerraDraw({
            adapter: new libs.Adapter({ map: m, coordinatePrecision: 7 }),
            modes: [
              new libs.TerraDrawLineStringMode({
                snapping: { toCustom },
                styles: { lineStringColor: LINE_COLOR, lineStringWidth: 4 },
              }),
              new libs.TerraDrawSelectMode({
                flags: {
                  linestring: {
                    feature: {
                      draggable: false,
                      coordinates: {
                        draggable: true,
                        midpoints: true,
                        deletable: true,
                        snappable: { toCustom },
                      },
                    },
                  },
                },
                styles: {
                  selectedLineStringColor: LINE_COLOR,
                  selectedLineStringWidth: 5,
                  selectionPointColor: '#ffffff',
                  selectionPointOutlineColor: LINE_COLOR,
                  // As on the border editor: smaller points missed the drag.
                  selectionPointWidth: 8,
                  midPointColor: LINE_COLOR,
                  midPointOutlineColor: '#ffffff',
                  midPointWidth: 5,
                },
              }),
            ],
          });
          d.start();
          draw.current = d;
          mapRef.current = m;
          Object.defineProperty(el, 'lineDraw', { value: d, configurable: true });
          redrawAll();
          history.current = [lines()];
          d.on('select', (id: unknown) => {
            const i = ids.current.indexOf(id as string | number);
            selected.current = i >= 0 ? i : null;
            opts.current.onSelect(selected.current);
          });
          d.on('deselect', () => {
            selected.current = null;
            opts.current.onSelect(null);
          });
          d.on('change', (changed: unknown) => {
            if (busy.current) return;
            let any = false;
            for (const id of changed as (string | number)[]) {
              const i = ids.current.indexOf(id);
              if (i < 0) continue;
              const f = d.getSnapshotFeature(id);
              if (!f || f.geometry.type !== 'LineString') continue;
              const now = f.geometry.coordinates as unknown as Pt[];
              // Untouched (as put on the map): the saved points, not seven decimals.
              current.current[i] = same(now, drawn.current[i]) ? current.current[i] : now.map((p) => [p[0], p[1]] as Pt);
              any = true;
            }
            if (any) {
              moved();
              settleSoon();
            }
          });
          d.on('finish', (id: unknown) => {
            const f = d.getSnapshotFeature(id as string | number);
            if (!f || f.geometry.type !== 'LineString') return;
            const known = ids.current.indexOf(id as string | number);
            if (known >= 0) {
              done();
              return;
            }
            // A line drawn: in place of the selected one, or one more.
            const line = f.geometry.coordinates as unknown as Pt[];
            const tool = opts.current.tool;
            const at = tool === 'redraw' ? selected.current : null;
            if (at !== null) current.current[at] = line;
            else current.current.push(line);
            redrawAll();
            done();
          });
          setLoaded(true);
          readStreets();
        });
        m!.on('idle', readStreets);
      } catch {
        if (!gone) setFailed(true);
      }
    })();
    return () => {
      gone = true;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (settle.current) clearTimeout(settle.current);
      try {
        draw.current?.stop();
      } catch {
        // The map below may already be gone.
      }
      draw.current = null;
      m?.remove();
    };
    // Made once per proposal: the screen gives a new key after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tool chosen beside the map.
  useEffect(() => {
    const d = draw.current;
    if (!loaded || !d) return;
    d.setMode(props.tool === 'points' ? 'select' : 'linestring');
    if (props.tool === 'points' && selected.current !== null) {
      const id = ids.current[selected.current];
      if (id !== undefined) d.selectFeature(id);
    }
  }, [loaded, props.tool]);

  // The homes in their parts' colours.
  useEffect(() => {
    const m = mapRef.current;
    if (!loaded || !m) return;
    m.getSource('homes')?.setData({
      type: 'FeatureCollection',
      features: props.homes.map((h) => ({
        type: 'Feature',
        properties: { color: h.color, moved: h.moved },
        geometry: { type: 'Point', coordinates: h.p },
      })),
    });
  }, [loaded, props.homes]);

  // The parts as the server cut them.
  useEffect(() => {
    const m = mapRef.current;
    if (!loaded || !m) return;
    m.getSource('parts')?.setData({
      type: 'FeatureCollection',
      features: props.parts.map((x) => ({
        type: 'Feature',
        properties: { color: x.color, label: x.label },
        geometry: x.geometry,
      })),
    });
  }, [loaded, props.parts]);

  return (
    <View style={[s.frame, { height: props.height }]}>
      <View ref={host} style={{ width: '100%', height: props.height }} />
      {failed ? (
        <View style={s.cover}>
          <Text style={s.coverText}>{t('territories.outline.failed')}</Text>
        </View>
      ) : null}
    </View>
  );
});

const s = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#eef2f3',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(238,242,243,0.92)',
  },
  coverText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#64748b', textAlign: 'center' },
});
