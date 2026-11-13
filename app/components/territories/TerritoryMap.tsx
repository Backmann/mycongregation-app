import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TerritoryGeometry } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useQuery } from '@tanstack/react-query';
import { territoriesApi } from '../../lib/api';
import {
  loadMapLibs,
  MAP_FILES,
  mapFileUrl,
  type MapLibreMap,
} from '../../lib/map-libs';
import { boxOf, TONE_COLOR, type TerritoryTone } from '../../lib/territory-view';

export interface MapShape {
  id: string;
  number: string;
  geometry: TerritoryGeometry;
  tone: TerritoryTone | 'mine';
}

/** A business of a business territory's list, numbered (13 November 2026). */
export interface MapPoint {
  /** «7», or «10–13» for shops that stand together. */
  label: string;
  lon: number;
  lat: number;
  /** Visited while the territory is out: green. */
  done: boolean;
  /** A colour of its own (a part's number at its start), over the rule above. */
  color?: string;
  /**
   * A mark of a division (13 November 2026): «start» where everyone sets
   * off, «nocall» a «не посещать» address (app only), «here» the walker's
   * own place, which never leaves the phone.
   */
  kind?: 'start' | 'nocall' | 'here';
}

/** A house of a part of a division: a small dot in its part's colour, grey once walked. */
export interface MapDot {
  lon: number;
  lat: number;
  color: string;
  walked?: boolean;
}

/** A street of a part of a division, in that part's colour (13 November 2026). */
export interface MapRoute {
  lines: [number, number][][];
  color: string;
  /** Walked: drawn thinner and lighter, so what is left stands out. */
  walked?: boolean;
}

/** Houses no territory holds, from the checks (13 November 2026). */
export interface MapSpot {
  lon: number;
  lat: number;
  houses: number;
}

const BOUNDARY = '#0e7490';
const SPOT = '#d97706';
const POINT = '#7c3aed';
const POINT_DONE = '#15803d';
// Walked streets and houses: grey, so what is left stands out (green is a part's colour).
const WALKED = '#9ca3af';

/**
 * The territory map (11 November 2026): the congregation's own map file
 * under the territories, coloured by how each stands, the boundary dashed.
 *
 * Web only for now. The phone app has no map library — adding one is a new
 * build — so on Android the screen offers the same page in the browser
 * instead (see the screens that use this).
 */
export function TerritoryMap({
  shapes,
  boundary,
  focus,
  onSelect,
  height,
  file,
  spots,
  place,
  points,
  routes,
  dots,
}: {
  shapes: MapShape[];
  boundary?: TerritoryGeometry | null;
  /** Fit the view to this territory rather than to everything. */
  focus?: string | null;
  onSelect?: (id: string) => void;
  height: number;
  /**
   * Whose map file, and whether it is there — given by a page without login
   * (a shared link), which has no account to ask. Left out, the signed-in
   * user's congregation and the server's answer are used.
   */
  file?: { congregationId: string; ready: boolean };
  /** Places with houses no territory holds, drawn as amber circles. */
  spots?: MapSpot[];
  /** Look at this place closely instead (a spot chosen in the checks). */
  place?: [number, number] | null;
  /** The businesses of a business territory, numbered in walking order. */
  points?: MapPoint[];
  /** The streets of a division, each in its part's colour. */
  routes?: MapRoute[];
  /** The houses of a division, each in its part's colour. */
  dots?: MapDot[];
}) {
  if (Platform.OS !== 'web') return null;
  return (
    <WebMap
      shapes={shapes}
      boundary={boundary ?? null}
      focus={focus ?? null}
      onSelect={onSelect}
      height={height}
      file={file}
      spots={spots ?? EMPTY_SPOTS}
      place={place ?? null}
      points={points ?? EMPTY_POINTS}
      routes={routes ?? EMPTY_ROUTES}
      dots={dots ?? EMPTY_DOTS}
    />
  );
}

function featuresOf(shapes: MapShape[]) {
  return {
    type: 'FeatureCollection',
    features: shapes.map((s) => ({
      type: 'Feature',
      id: s.id,
      properties: { id: s.id, number: s.number, color: TONE_COLOR[s.tone] },
      geometry: s.geometry,
    })),
  };
}

const EMPTY_SPOTS: MapSpot[] = [];
const EMPTY_POINTS: MapPoint[] = [];
const EMPTY_ROUTES: MapRoute[] = [];
const EMPTY_DOTS: MapDot[] = [];

function dotsOf(dots: MapDot[]) {
  return {
    type: 'FeatureCollection',
    features: dots.map((d) => ({
      type: 'Feature',
      properties: { color: d.color, walked: !!d.walked },
      geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
    })),
  };
}

function routesOf(routes: MapRoute[]) {
  return {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature',
      properties: { color: r.color, walked: !!r.walked },
      geometry: { type: 'MultiLineString', coordinates: r.lines },
    })),
  };
}

function pointsOf(points: MapPoint[]) {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      properties: {
        label: p.label,
        done: p.done,
        wide: p.label.length > 2,
        kind: p.kind ?? 'plain',
        ...(p.color ? { color: p.color } : {}),
      },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  };
}

function spotsOf(spots: MapSpot[]) {
  return {
    type: 'FeatureCollection',
    features: spots.map((p) => ({
      type: 'Feature',
      properties: { houses: p.houses },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  };
}

function boundaryOf(g: TerritoryGeometry | null) {
  return {
    type: 'FeatureCollection',
    features: g ? [{ type: 'Feature', properties: {}, geometry: g }] : [],
  };
}

function WebMap({
  shapes,
  boundary,
  focus,
  onSelect,
  height,
  file,
  spots,
  place,
  points,
  routes,
  dots,
}: {
  shapes: MapShape[];
  boundary: TerritoryGeometry | null;
  focus: string | null;
  onSelect?: (id: string) => void;
  height: number;
  file?: { congregationId: string; ready: boolean };
  spots: MapSpot[];
  place: [number, number] | null;
  points: MapPoint[];
  routes: MapRoute[];
  dots: MapDot[];
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const host = useRef<View>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [noStreets, setNoStreets] = useState(false);
  const select = useRef(onSelect);
  select.current = onSelect;
  // Whether the map file is there: until the server's map job has run it is
  // not, and asking for it would only fail. The same answer the door reads.
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
    staleTime: 60 * 1000,
    enabled: !file && !!user,
  });
  const streets = file ? file.ready : accessQ.data?.mapReady;

  const box = useMemo(() => {
    const target = focus ? shapes.filter((s) => s.id === focus) : shapes;
    const geoms = target.map((s) => s.geometry);
    if (!focus && boundary) geoms.push(boundary);
    return boxOf(geoms);
  }, [shapes, boundary, focus]);

  // The map itself, once.
  useEffect(() => {
    let gone = false;
    const congregationId = file?.congregationId ?? user?.congregationId;
    const el = host.current as unknown as HTMLElement | null;
    if (!el || !congregationId || streets === undefined) return;
    void (async () => {
      try {
        const origin = window.location.origin;
        const fileUrl = mapFileUrl(origin, congregationId);
        const { maplibregl, basemaps } = await loadMapLibs();
        if (gone) return;
        setNoStreets(!streets);
        const style = {
          version: 8,
          glyphs: origin + MAP_FILES.glyphs,
          sprite: origin + MAP_FILES.sprite,
          sources: streets
            ? {
                protomaps: {
                  type: 'vector',
                  url: `pmtiles://${fileUrl}`,
                  attribution:
                    '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
                },
              }
            : {},
          layers: streets
            ? basemaps.layers('protomaps', basemaps.namedFlavor('light'), { lang: 'de' })
            : [{ id: 'background', type: 'background', paint: { 'background-color': '#eef2f3' } }],
        };
        const m = new maplibregl.Map({
          container: el,
          style,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          // Many territories are long thin strips: keep a screen of room.
          maxZoom: 18,
        });
        m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        m.on('load', () => {
          if (gone) return;
          m.addSource('boundary', { type: 'geojson', data: boundaryOf(boundary) });
          m.addLayer({
            id: 'boundary-line',
            type: 'line',
            source: 'boundary',
            paint: { 'line-color': BOUNDARY, 'line-width': 2, 'line-dasharray': [3, 2] },
          });
          m.addSource('terr', { type: 'geojson', data: featuresOf(shapes) });
          m.addLayer({
            id: 'terr-fill',
            type: 'fill',
            source: 'terr',
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.28 },
          });
          m.addLayer({
            id: 'terr-line',
            type: 'line',
            source: 'terr',
            paint: { 'line-color': ['get', 'color'], 'line-width': 1.6 },
          });
          m.addLayer({
            id: 'terr-label',
            type: 'symbol',
            source: 'terr',
            layout: {
              'text-field': ['get', 'number'],
              'text-font': [MAP_FILES.labelFont],
              'text-size': 12,
            },
            paint: {
              'text-color': '#0f172a',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.4,
            },
          });
          m.addSource('spots', { type: 'geojson', data: spotsOf(spots) });
          m.addLayer({
            id: 'spots-circle',
            type: 'circle',
            source: 'spots',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['get', 'houses'], 10, 9, 100, 20],
              'circle-color': SPOT,
              'circle-opacity': 0.35,
              'circle-stroke-color': SPOT,
              'circle-stroke-width': 1.5,
            },
          });
          m.addLayer({
            id: 'spots-label',
            type: 'symbol',
            source: 'spots',
            layout: {
              'text-field': ['to-string', ['get', 'houses']],
              'text-font': [MAP_FILES.labelFont],
              'text-size': 11,
            },
            paint: { 'text-color': '#7c2d12', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
          });
          m.addSource('routes', { type: 'geojson', data: routesOf(routes) });
          m.addLayer({
            id: 'routes-line',
            type: 'line',
            source: 'routes',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['case', ['get', 'walked'], WALKED, ['get', 'color']],
              'line-width': ['case', ['get', 'walked'], 4, 6],
              'line-opacity': ['case', ['get', 'walked'], 0.55, 0.9],
            },
          });
          m.addSource('dots', { type: 'geojson', data: dotsOf(dots) });
          m.addLayer({
            id: 'dots-circle',
            type: 'circle',
            source: 'dots',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2, 17, 5],
              'circle-color': ['case', ['get', 'walked'], WALKED, ['get', 'color']],
              'circle-opacity': ['case', ['get', 'walked'], 0.45, 0.95],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 0.8,
            },
          });
          m.addSource('points', { type: 'geojson', data: pointsOf(points) });
          m.addLayer({
            id: 'points-circle',
            type: 'circle',
            source: 'points',
            paint: {
              'circle-radius': [
                'match',
                ['get', 'kind'],
                'start',
                10,
                'here',
                7,
                ['case', ['get', 'wide'], 13, 9],
              ],
              'circle-color': [
                'case',
                ['has', 'color'],
                ['coalesce', ['get', 'color'], POINT],
                ['get', 'done'],
                POINT_DONE,
                POINT,
              ],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': ['match', ['get', 'kind'], 'start', 3.5, 'here', 3, 1.5],
            },
          });
          m.addLayer({
            id: 'points-label',
            type: 'symbol',
            source: 'points',
            layout: {
              'text-field': ['get', 'label'],
              'text-font': [MAP_FILES.labelFont],
              'text-size': 10,
              'text-allow-overlap': true,
            },
            paint: { 'text-color': '#ffffff' },
          });
          m.on('click', 'terr-fill', (e: unknown) => {
            const f = (e as { features?: { properties?: { id?: string } }[] }).features?.[0];
            const id = f?.properties?.id;
            if (id && select.current) select.current(id);
          });
          m.on('mouseenter', 'terr-fill', () => {
            if (select.current) m.getCanvas().style.cursor = 'pointer';
          });
          m.on('mouseleave', 'terr-fill', () => {
            m.getCanvas().style.cursor = '';
          });
          setReady(true);
        });
        m.on('error', (e: unknown) => {
          // A tile that fails is MapLibre's to retry; only a style that
          // never loads leaves the map empty.
          const msg = String((e as { error?: { message?: string } }).error?.message ?? '');
          if (!m.loaded() && /style/i.test(msg)) setFailed(true);
        });
        map.current = m;
      } catch {
        if (!gone) setFailed(true);
      }
    })();
    return () => {
      gone = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
    // The map is made once per screen; data and view follow below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.congregationId, user?.congregationId, streets]);

  // Data that changes after the first drawing.
  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.getSource('terr')?.setData(featuresOf(shapes));
    map.current.getSource('boundary')?.setData(boundaryOf(boundary));
    map.current.getSource('spots')?.setData(spotsOf(spots));
    map.current.getSource('points')?.setData(pointsOf(points));
    map.current.getSource('routes')?.setData(routesOf(routes));
    map.current.getSource('dots')?.setData(dotsOf(dots));
  }, [ready, shapes, boundary, spots, points, routes, dots]);

  // The view: the territory in focus, or everything.
  useEffect(() => {
    if (!ready || !map.current || !box) return;
    if (place) {
      // About 1.2 km across: the spot and the territories around it (a
      // spot is listed up to a few hundred metres from the nearest border).
      map.current.fitBounds(
        [
          [place[0] - 0.009, place[1] - 0.0056],
          [place[0] + 0.009, place[1] + 0.0056],
        ],
        { padding: 28, animate: false, maxZoom: 17 },
      );
      return;
    }
    // Room at the foot for the «no streets yet» note when it is shown.
    const padding = noStreets ? { top: 28, left: 28, right: 28, bottom: 64 } : 28;
    map.current.fitBounds(box, { padding, animate: false, maxZoom: 17 });
  }, [ready, box, noStreets, place?.[0], place?.[1]]);

  return (
    <View style={[s.frame, { height }]}>
      {/* A sized box, not absoluteFill: MapLibre gives its container
          position: relative, which would undo the absolute fill and leave
          the map with no height. */}
      <View ref={host} style={{ width: '100%', height }} />
      {failed ? (
        <View style={s.cover}>
          <Text style={s.coverText}>{t('territories.map.failed')}</Text>
        </View>
      ) : null}
      {noStreets && !failed ? (
        <View style={s.note} pointerEvents="none">
          <Text style={s.noteText}>{t('territories.map.noStreets')}</Text>
        </View>
      ) : null}
    </View>
  );
}

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
  },
  coverText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#64748b', textAlign: 'center' },
  note: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    right: 60,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  noteText: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: '#475569' },
});
