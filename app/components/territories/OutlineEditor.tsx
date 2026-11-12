import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TerritoryGeometry } from '../../lib/api';
import {
  loadDrawLibs,
  loadMapLibs,
  MAP_FILES,
  mapFileUrl,
  type DrawFeature,
  type MapLibreMap,
  type TerraDrawInstance,
} from '../../lib/map-libs';
import {
  distinctHouses,
  followShared,
  housesMoving,
  middleOfRing,
  metres,
  sameGeometry,
  SHARED_M,
  snapToCorners,
  snapToLines,
  type Pt,
  type Ring,
} from '../../lib/outline-edit';
import { boxOf } from '../../lib/territory-view';

export interface EditShape {
  id: string;
  number: string;
  geometry: TerritoryGeometry;
}

/** One territory whose outline differs from the saved one. */
export interface EditedShape {
  id: string;
  geometry: TerritoryGeometry;
  houses: { leaving: number; coming: number } | null;
}

export interface OutlineEditorHandle {
  /** One step back: the last drag, added or removed corner. */
  stepBack: () => void;
  /** Everything as saved. */
  reset: () => void;
}

const MAIN = '#2563eb';
const NEIGHBOUR = '#64748b';
const BOUNDARY = '#0e7490';
/** Within this many screen pixels a corner or a street attracts. */
const CORNER_PX = 10;
const STREET_PX = 14;

type RoadsMap = MapLibreMap & {
  querySourceFeatures: (
    source: string,
    opts: { sourceLayer: string },
  ) => { geometry: { type: string; coordinates: unknown } }[];
  on: (event: string, ...rest: unknown[]) => void;
};

const ringOf = (g: TerritoryGeometry) => (g.coordinates as number[][][])[0] as Ring;
const polygon = (ring: Ring): TerritoryGeometry => ({ type: 'Polygon', coordinates: [ring] });
/** terra-draw refuses more than seven decimals. */
const seven = (ring: Ring): Ring =>
  ring.map((p) => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7]);

/**
 * The map where a boundary is drawn again (12 November 2026, web only).
 *
 * The territory and its neighbours of the same kind lie on the map; the
 * territory is selected, its corners can be dragged, a corner added by
 * dragging the middle of a side, taken away with the right mouse button.
 * A corner shared with a neighbour (within a metre) moves in both, a corner
 * added on a shared side appears in both. A dragged corner is drawn to a
 * nearby corner of a neighbour, then to a nearby street (optional).
 */
export const OutlineEditor = forwardRef<
  OutlineEditorHandle,
  {
    congregationId: string;
    streetsReady: boolean;
    main: EditShape;
    neighbours: EditShape[];
    boundary: TerritoryGeometry | null;
    sharedBorder: boolean;
    snapStreets: boolean;
    height: number;
    onChange: (edited: EditedShape[]) => void;
  }
>(function OutlineEditor(props, ref) {
  const { t } = useTranslation();
  const host = useRef<View>(null);
  const [failed, setFailed] = useState(false);
  const draw = useRef<TerraDrawInstance | null>(null);
  const history = useRef<Map<string, Ring>[]>([]);
  const saved = useRef(new Map<string, Ring>());
  const current = useRef(new Map<string, Ring>());
  const houses = useRef<Pt[]>([]);
  const streets = useRef<Pt[][]>([]);
  const busy = useRef(false);
  const selected = useRef<string>(props.main.id);
  const opts = useRef(props);
  opts.current = props;

  const report = () => {
    const out: EditedShape[] = [];
    for (const [id, ring] of current.current) {
      const before = saved.current.get(id);
      if (!before) continue;
      const g = polygon(ring);
      const was = polygon(before);
      if (sameGeometry(g, was)) continue;
      out.push({
        id,
        geometry: g,
        houses: houses.current.length ? housesMoving(was, g, houses.current) : null,
      });
    }
    opts.current.onChange(out);
  };

  const put = (rings: Map<string, Ring>) => {
    const d = draw.current;
    if (!d) return;
    busy.current = true;
    try {
      for (const [id, ring] of rings) {
        const now = current.current.get(id);
        if (now && JSON.stringify(now) === JSON.stringify(ring)) continue;
        d.updateFeatureGeometry(id, polygon(seven(ring)));
        current.current.set(id, ring);
      }
    } finally {
      busy.current = false;
    }
    report();
  };

  useImperativeHandle(ref, () => ({
    stepBack: () => {
      if (history.current.length <= 1) return;
      history.current.pop();
      put(new Map(history.current[history.current.length - 1]));
    },
    reset: () => {
      history.current = [new Map(saved.current)];
      put(new Map(saved.current));
    },
  }));

  useEffect(() => {
    let gone = false;
    let m: RoadsMap | null = null;
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    void (async () => {
      try {
        const libs = await loadDrawLibs();
        const { maplibregl, basemaps } = await loadMapLibs();
        if (gone) return;
        const origin = window.location.origin;
        const { congregationId, streetsReady, main, neighbours, boundary } = opts.current;
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
        m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        // For the walkthrough script: where a corner is on the screen.
        Object.defineProperty(el, 'outlineMap', { value: m, configurable: true });
        const box = boxOf([main.geometry]);
        if (box) m.fitBounds(box, { padding: 60, animate: false, maxZoom: 18 });

        // Houses and streets of the tiles in view, read again as the view moves.
        const readTiles = () => {
          if (!m || !streetsReady) return;
          const pts: Pt[] = [];
          for (const f of m.querySourceFeatures('protomaps', { sourceLayer: 'buildings' })) {
            const g = f.geometry;
            const ring =
              g.type === 'Polygon'
                ? (g.coordinates as number[][][])[0]
                : g.type === 'MultiPolygon'
                  ? (g.coordinates as number[][][][])[0]?.[0]
                  : null;
            const mid = ring ? middleOfRing(ring) : null;
            if (mid) pts.push(mid);
          }
          houses.current = distinctHouses(pts);
          const lines: Pt[][] = [];
          for (const f of m.querySourceFeatures('protomaps', { sourceLayer: 'roads' })) {
            const g = f.geometry;
            if (g.type === 'LineString') lines.push(g.coordinates as Pt[]);
            else if (g.type === 'MultiLineString') lines.push(...(g.coordinates as Pt[][]));
          }
          streets.current = lines;
        };

        m.on('load', () => {
          if (gone || !m) return;
          m.addSource('boundary', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: boundary ? [{ type: 'Feature', properties: {}, geometry: boundary }] : [],
            },
          });
          m.addLayer({
            id: 'boundary-line',
            type: 'line',
            source: 'boundary',
            paint: { 'line-color': BOUNDARY, 'line-width': 2, 'line-dasharray': [3, 2] },
          });
          const shapes = [main, ...neighbours];
          m.addSource('labels', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: shapes.map((s) => ({
                type: 'Feature',
                properties: { number: s.number },
                geometry: s.geometry,
              })),
            },
          });
          m.addLayer({
            id: 'labels',
            type: 'symbol',
            source: 'labels',
            layout: {
              'text-field': ['get', 'number'],
              'text-font': [MAP_FILES.labelFont],
              'text-size': 13,
            },
            paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
          });

          // How many metres a few screen pixels span here and now.
          const metresPerPx = (lng: number, lat: number) => {
            const a = m!.project([lng, lat]);
            const b = m!.unproject([a.x + 1, a.y]);
            return metres([lng, lat], [b.lng, b.lat]);
          };
          const toCustom = (ev: { lng: number; lat: number }) => {
            const p: Pt = [ev.lng, ev.lat];
            const mpp = metresPerPx(ev.lng, ev.lat);
            // Corners the selected one already shares follow it on their
            // own; drawn to them, the dragged corner would stick where it was.
            const own = current.current.get(selected.current) ?? [];
            const corners: Pt[] = [];
            for (const [id, ring] of current.current) {
              if (id === selected.current) continue;
              for (const q of ring) {
                if (!own.some((o) => metres(o, q) < SHARED_M)) corners.push(q);
              }
            }
            const c = snapToCorners(p, corners, CORNER_PX * mpp);
            if (c) return c;
            if (!opts.current.snapStreets) return undefined;
            return snapToLines(p, streets.current, STREET_PX * mpp) ?? undefined;
          };

          const isMain = (f: { id?: unknown }) => f.id === main.id;
          const d = new libs.TerraDraw({
            adapter: new libs.Adapter({ map: m, coordinatePrecision: 7 }),
            modes: [
              new libs.TerraDrawPolygonMode({
                styles: {
                  fillColor: (f: { id?: unknown }) => (isMain(f) ? MAIN : NEIGHBOUR),
                  fillOpacity: (f: { id?: unknown }) => (isMain(f) ? 0.22 : 0.1),
                  outlineColor: (f: { id?: unknown }) => (isMain(f) ? MAIN : NEIGHBOUR),
                  outlineWidth: (f: { id?: unknown }) => (isMain(f) ? 3 : 2),
                },
              }),
              new libs.TerraDrawSelectMode({
                flags: {
                  polygon: {
                    feature: {
                      draggable: false,
                      validation: (f: unknown) => libs.ValidateNotSelfIntersecting(f),
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
                  selectedPolygonColor: MAIN,
                  selectedPolygonOutlineColor: MAIN,
                  selectedPolygonFillOpacity: 0.22,
                  selectionPointColor: '#ffffff',
                  selectionPointOutlineColor: MAIN,
                  selectionPointWidth: 6,
                  midPointColor: MAIN,
                  midPointOutlineColor: '#ffffff',
                  midPointWidth: 4,
                },
              }),
            ],
          });
          d.start();
          d.setMode('select');
          const editable = shapes.filter(
            (s) =>
              s.geometry.type === 'Polygon' && (s.geometry.coordinates as number[][][]).length === 1,
          );
          const added = d.addFeatures(
            editable.map((s) => ({
              type: 'Feature',
              id: s.id,
              geometry: polygon(seven(ringOf(s.geometry))),
              properties: { mode: 'polygon' },
            })),
          );
          if (added.some((r) => !r.valid && r.id === main.id)) {
            setFailed(true);
            return;
          }
          for (const s of editable) {
            const f = d.getSnapshotFeature(s.id);
            if (!f) continue;
            const ring = f.geometry.coordinates[0] as Ring;
            saved.current.set(s.id, ringOf(s.geometry));
            current.current.set(s.id, ring);
          }
          history.current = [new Map(current.current)];
          d.on('select', (id: unknown) => {
            selected.current = String(id);
          });
          d.on('change', (ids: unknown) => {
            if (busy.current) return;
            for (const id of ids as (string | number)[]) {
              const key = String(id);
              const f: DrawFeature | undefined = d.getSnapshotFeature(id);
              const before = current.current.get(key);
              if (!f || f.geometry.type !== 'Polygon' || !before) continue;
              const after = f.geometry.coordinates[0] as Ring;
              current.current.set(key, after);
              if (!opts.current.sharedBorder) continue;
              const follow = new Map<string, Ring>();
              for (const [oid, ring] of current.current) {
                if (oid === key) continue;
                const moved = followShared(before, after, ring);
                if (moved) follow.set(oid, moved);
              }
              if (follow.size === 0) continue;
              busy.current = true;
              try {
                for (const [oid, ring] of follow) {
                  d.updateFeatureGeometry(oid, polygon(seven(ring)));
                  current.current.set(oid, ring);
                }
              } finally {
                busy.current = false;
              }
            }
          });
          d.on('finish', () => {
            history.current.push(new Map(current.current));
            report();
          });
          d.selectFeature(main.id);
          draw.current = d;
          readTiles();
        });
        m.on('idle', readTiles);
      } catch {
        if (!gone) setFailed(true);
      }
    })();
    return () => {
      gone = true;
      try {
        draw.current?.stop();
      } catch {
        // The map below may already be gone.
      }
      draw.current = null;
      m?.remove();
    };
    // Made once per set of shapes: the screen gives a new key after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
