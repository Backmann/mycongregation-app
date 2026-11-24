import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TerritoryGeometry } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useQuery } from '@tanstack/react-query';
import { api, territoriesApi } from '../../lib/api';
import {
  BASE_LABELS,
  clearLayers,
  pairBadges,
  PAIR_NAME_SIZE,
  PHOTO_ATTRIBUTION,
  photoTilesUrl,
} from '../../lib/map-style';
import {
  loadMapLibs,
  MAP_FILES,
  mapFileUrl,
  type MapLibreMap,
} from '../../lib/map-libs';
import { boxOf, TONE_COLOR, type TerritoryTone } from '../../lib/territory-view';
import { beam, boxAround, circle, type LonLat } from '../../lib/way';

export interface MapShape {
  id: string;
  number: string;
  geometry: TerritoryGeometry;
  tone: TerritoryTone | 'mine';
  /** Its own colour over the tone's (the parts of a re-cut, 15 November 2026). */
  color?: string;
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
  /** A ring round it in this colour (15 November 2026: a building to look at). */
  ring?: string;
  /** The one chosen: drawn bigger. */
  chosen?: boolean;
}

/** A street of a part of a division, in that part's colour (13 November 2026). */
export interface MapRoute {
  lines: [number, number][][];
  color: string;
  /** Walked: drawn thinner and lighter, so what is left stands out. */
  walked?: boolean;
  /** The street to walk now: drawn with a halo. */
  strong?: boolean;
  /** Another pair's street: drawn pale and thin. */
  pale?: boolean;
  /** The road from one street to the next: dashed, with arrows the way to go. */
  link?: boolean;
  /** A street for another day (after today's share): drawn fainter. */
  later?: boolean;
  /**
   * The street's name, written along it over the line (R-67): the
   * background's own name may not find room, the pair's street always does.
   */
  name?: string;
  /** The pair's number: a numbered circle on the line, so colour is never the only sign. */
  n?: number;
}

/**
 * The walker on the map (14 November 2026): where he stands, how sure the
 * phone is of it (metres), and where the phone points (0 = north). Drawn
 * on his own screen only.
 */
export interface MapHere {
  at: LonLat;
  accuracy: number | null;
  heading: number | null;
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
/** The ring round the building chosen (15 November 2026). */
const INK_DOT = '#1b2328';

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
  outline,
  fit,
  fitKey,
  here,
  guide,
  onDot,
  photoButton,
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
  /** The territory as a line only, no tint over the streets. */
  outline?: boolean;
  /**
   * Show these points rather than the territory (a pair's own streets, one
   * street, the walker and his next street); framed again whenever
   * `fitKey` changes. Null: the territory, as before.
   */
  fit?: LonLat[] | null;
  fitKey?: string;
  /** The walker: his place, its doubt and where the phone points. */
  here?: MapHere | null;
  /** The way to the next street: a dashed line. */
  guide?: LonLat[] | null;
  /** A dot tapped: its index in `dots`. */
  onDot?: (i: number) => void;
  /** «Фото»: the aerial photograph under the lines (R-67). Left out: on maps of one territory or a division. */
  photoButton?: boolean;
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
      outline={!!outline}
      fit={fit ?? null}
      fitKey={fitKey ?? ''}
      here={here ?? null}
      guide={guide ?? null}
      // A close look only: over the whole congregation the photograph is a blur (zoom < 12).
      photoButton={photoButton ?? !!(focus || (routes && routes.length) || (fit && fit.length) || place)}
      onDot={onDot}
    />
  );
}

function featuresOf(shapes: MapShape[]) {
  return {
    type: 'FeatureCollection',
    features: shapes.map((s) => ({
      type: 'Feature',
      id: s.id,
      properties: { id: s.id, number: s.number, color: s.color ?? TONE_COLOR[s.tone] },
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
    features: dots.map((d0, i) => ({ ...d0, i })).map((d) => ({
      type: 'Feature',
      properties: { color: d.color, walked: !!d.walked, ring: d.ring ?? '', chosen: !!d.chosen, i: d.i },
      geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
    })),
  };
}

function routesOf(routes: MapRoute[]) {
  return {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature',
      properties: {
        color: r.color,
        walked: !!r.walked,
        strong: !!r.strong,
        pale: !!r.pale,
        link: !!r.link,
        later: !!r.later,
        name: r.name ?? '',
      },
      geometry: { type: 'MultiLineString', coordinates: r.lines },
    })),
  };
}

function badgesOf(routes: MapRoute[]) {
  return {
    type: 'FeatureCollection',
    features: pairBadges(routes).map((b) => ({
      type: 'Feature',
      properties: { n: String(b.n), color: b.color, pale: b.pale, walked: b.walked },
      geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
    })),
  };
}


const HERE_BLUE = '#2563eb';

function hereOf(h: MapHere | null) {
  if (!h) return { type: 'FeatureCollection', features: [] };
  const features: unknown[] = [];
  if (h.accuracy && h.accuracy > 5)
    features.push({
      type: 'Feature',
      properties: { part: 'doubt' },
      geometry: { type: 'Polygon', coordinates: [circle(h.at, Math.min(h.accuracy, 150))] },
    });
  if (h.heading !== null)
    features.push({
      type: 'Feature',
      properties: { part: 'beam' },
      geometry: { type: 'Polygon', coordinates: [beam(h.at, h.heading)] },
    });
  return { type: 'FeatureCollection', features };
}

function hereDotOf(h: MapHere | null) {
  return {
    type: 'FeatureCollection',
    features: h ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: h.at } }] : [],
  };
}

function guideOf(g: LonLat[] | null) {
  return {
    type: 'FeatureCollection',
    features: g && g.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: g } }] : [],
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
  outline,
  fit,
  fitKey,
  here,
  guide,
  onDot,
  photoButton,
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
  outline: boolean;
  fit: LonLat[] | null;
  fitKey: string;
  here: MapHere | null;
  guide: LonLat[] | null;
  onDot?: (i: number) => void;
  photoButton: boolean;
}) {
  const { t } = useTranslation();
  const [photo, setPhoto] = useState(false);
  const { user } = useAuth();
  const host = useRef<View>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [noStreets, setNoStreets] = useState(false);
  const select = useRef(onSelect);
  select.current = onSelect;
  const dot = useRef(onDot);
  dot.current = onDot;
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
            ? clearLayers(basemaps)
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
        // North stays up (R-67): two fingers that pinch must not turn the map
        // by accident — an older walker would lose which way is which.
        m.touchZoomRotate?.disableRotation();
        m.touchPitch?.disable();
        m.keyboard?.disableRotation();
        m.on('load', () => {
          if (gone) return;
          if (streets) {
            // The aerial photograph (R-67), hidden until «Фото»: over the
            // background's ground and roads, under every line and label.
            m.addSource('photo', {
              type: 'raster',
              tiles: [photoTilesUrl(String(api.defaults.baseURL ?? ''))],
              tileSize: 512,
              minzoom: 12,
              maxzoom: 19,
              attribution: PHOTO_ATTRIBUTION,
            });
            m.addLayer({
              id: 'photo',
              type: 'raster',
              source: 'photo',
              layout: { visibility: 'none' },
              paint: { 'raster-saturation': -0.2, 'raster-brightness-max': 0.9 },
            });
          }
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
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': outline ? 0 : 0.28 },
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
          // The street to walk now: a wide soft halo under it.
          // The roads between streets: dashed, under the streets, arrows on them.
          m.addLayer({
            id: 'links-line',
            type: 'line',
            source: 'routes',
            filter: ['==', ['get', 'link'], true],
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
            paint: {
              'line-color': ['case', ['get', 'walked'], WALKED, ['get', 'color']],
              'line-width': 3,
              'line-opacity': ['case', ['any', ['get', 'walked'], ['get', 'later']], 0.35, 0.85],
              'line-dasharray': [2, 1.5],
            },
          });
          m.addLayer({
            id: 'links-arrows',
            type: 'symbol',
            source: 'routes',
            filter: ['all', ['==', ['get', 'link'], true], ['!', ['get', 'walked']]],
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': 70,
              'text-field': '›',
              'text-font': [MAP_FILES.labelFont],
              'text-size': 20,
              'text-keep-upright': false,
              'text-allow-overlap': true,
            },
            paint: {
              'text-color': ['get', 'color'],
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.5,
              'text-opacity': ['case', ['get', 'later'], 0.4, 1],
            },
          });
          m.addLayer({
            id: 'routes-halo',
            type: 'line',
            source: 'routes',
            filter: ['==', ['get', 'strong'], true],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 18, 'line-opacity': 0.22 },
          });
          m.addLayer({
            id: 'routes-line',
            type: 'line',
            source: 'routes',
            filter: ['!=', ['get', 'link'], true],
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': ['case', ['get', 'walked'], WALKED, ['get', 'color']],
              'line-width': ['case', ['get', 'pale'], 3, ['get', 'walked'], 4, ['get', 'strong'], 8, 6],
              'line-opacity': ['case', ['get', 'pale'], 0.35, ['get', 'walked'], 0.55, ['get', 'later'], 0.45, 0.9],
            },
          });
          m.addSource('guide', { type: 'geojson', data: guideOf(guide) });
          m.addLayer({
            id: 'guide-line',
            type: 'line',
            source: 'guide',
            layout: { 'line-cap': 'round' },
            paint: { 'line-color': HERE_BLUE, 'line-width': 3, 'line-dasharray': [1.5, 1.5] },
          });
          m.addSource('dots', { type: 'geojson', data: dotsOf(dots) });
          m.addLayer({
            id: 'dots-circle',
            type: 'circle',
            source: 'dots',
            paint: {
              // A zoom curve must be the whole expression (MapLibre refuses
              // it inside '*', and then no later layer is added either).
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                13,
                ['case', ['get', 'chosen'], 3.6, 2],
                17,
                ['case', ['get', 'chosen'], 9, 5],
                19,
                ['case', ['get', 'chosen'], 14, 8],
              ],
              'circle-color': ['case', ['get', 'walked'], WALKED, ['get', 'color']],
              'circle-opacity': ['case', ['get', 'walked'], 0.45, 0.95],
              'circle-stroke-color': ['case', ['!=', ['get', 'ring'], ''], ['get', 'ring'], ['get', 'chosen'], INK_DOT, '#ffffff'],
              'circle-stroke-width': ['case', ['!=', ['get', 'ring'], ''], 2.5, ['get', 'chosen'], 2.5, 0.8],
            },
          });
          m.addSource('here', { type: 'geojson', data: hereOf(here) });
          m.addLayer({
            id: 'here-fill',
            type: 'fill',
            source: 'here',
            paint: {
              'fill-color': HERE_BLUE,
              'fill-opacity': ['match', ['get', 'part'], 'beam', 0.3, 0.1],
            },
          });
          // The pairs' street names, over their lines (R-67).
          m.addLayer({
            id: 'routes-names',
            type: 'symbol',
            source: 'routes',
            filter: ['all', ['!=', ['get', 'link'], true], ['!=', ['get', 'pale'], true], ['!=', ['get', 'name'], '']],
            layout: {
              'symbol-placement': 'line',
              'text-field': ['get', 'name'],
              'text-font': [MAP_FILES.labelFont],
              'text-size': ['interpolate', ['linear'], ['zoom'], ...PAIR_NAME_SIZE.flat()],
              'symbol-spacing': 260,
              'text-max-angle': 35,
              'text-padding': 4,
            },
            paint: {
              'text-color': ['case', ['get', 'walked'], '#6b7280', '#111827'],
              'text-halo-color': '#ffffff',
              'text-halo-width': 2.6,
            },
          });
          // The pair's number on its lines: never colour alone (R-67).
          m.addSource('badges', { type: 'geojson', data: badgesOf(routes) });
          m.addLayer({
            id: 'badges-circle',
            type: 'circle',
            source: 'badges',
            minzoom: 13.5,
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 9, 17, 12],
              // Grey for walked or another pair's, dark enough for its white figure (4.8:1).
              'circle-color': ['case', ['any', ['get', 'pale'], ['get', 'walked']], '#6b7280', ['get', 'color']],
              'circle-opacity': ['case', ['get', 'pale'], 0.55, 1],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2.5,
            },
          });
          m.addLayer({
            id: 'badges-label',
            type: 'symbol',
            source: 'badges',
            minzoom: 13.5,
            layout: {
              'text-field': ['get', 'n'],
              'text-font': [MAP_FILES.labelFont],
              'text-size': ['interpolate', ['linear'], ['zoom'], 14, 12, 17, 15],
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            },
            paint: { 'text-color': '#ffffff' },
          });
          // The background's names and house numbers over every line, under ours.
          for (const id of BASE_LABELS) if (m.getLayer?.(id)) m.moveLayer?.(id, 'routes-names');
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
                ['case', ['get', 'wide'], 15, 11],
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
              'text-size': 12,
              'text-allow-overlap': true,
              // A numbered circle never pushes a street's name off the map.
              'text-ignore-placement': true,
            },
            paint: { 'text-color': '#ffffff' },
          });
          m.addSource('here-dot', { type: 'geojson', data: hereDotOf(here) });
          m.addLayer({
            id: 'here-dot',
            type: 'circle',
            source: 'here-dot',
            paint: {
              'circle-radius': 8,
              'circle-color': HERE_BLUE,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 3,
            },
          });
          // A building tapped (15 November 2026): a wide ring round each dot,
          // unseen, so that a finger finds it.
          m.addLayer({
            id: 'dots-hit',
            type: 'circle',
            source: 'dots',
            paint: { 'circle-radius': 14, 'circle-opacity': 0 },
          });
          m.on('click', 'dots-hit', (e: unknown) => {
            const f = (e as { features?: { properties?: { i?: number } }[] }).features?.[0];
            const i = f?.properties?.i;
            if (typeof i === 'number' && dot.current) dot.current(i);
          });
          m.on('mouseenter', 'dots-hit', () => {
            if (dot.current) m.getCanvas().style.cursor = 'pointer';
          });
          m.on('mouseleave', 'dots-hit', () => {
            m.getCanvas().style.cursor = '';
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
    map.current.getSource('badges')?.setData(badgesOf(routes));
    map.current.getSource('dots')?.setData(dotsOf(dots));
    map.current.getSource('guide')?.setData(guideOf(guide));
    map.current.getSource('here')?.setData(hereOf(here));
    map.current.getSource('here-dot')?.setData(hereDotOf(here));
  }, [ready, shapes, boundary, spots, points, routes, dots, guide, here]);

  // «Фото» / «Карта» (R-67).
  useEffect(() => {
    if (!ready || !map.current?.getLayer?.('photo')) return;
    map.current.setLayoutProperty?.('photo', 'visibility', photo ? 'visible' : 'none');
  }, [ready, photo]);

  // The view of chosen points (a pair's streets, one street, the walker and
  // his next street), framed again only when the caller says what changed.
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    if (!ready || !map.current) return;
    const b = fitRef.current ? boxAround(fitRef.current) : null;
    if (!b) return;
    map.current.fitBounds(b, { padding: 36, animate: true, duration: 600, maxZoom: 17.5 });
  }, [ready, fitKey]);

  // The view: the territory in focus, or everything.
  useEffect(() => {
    if (!ready || !map.current || !box) return;
    if (fitRef.current && fitRef.current.length) return;
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
      {photoButton && ready && !noStreets && !failed ? (
        <Pressable
          onPress={() => setPhoto((v) => !v)}
          style={[s.photoBtn, photo && s.photoOn]}
          accessibilityRole="button"
          accessibilityState={{ selected: photo }}
        >
          <Text style={[s.photoText, photo && s.photoTextOn]}>
            {photo ? t('territories.map.plan') : t('territories.map.photo')}
          </Text>
        </Pressable>
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
  // 48 px: a finger, even a shaky one, finds it (R-67).
  // Bottom left: the top holds a screen's own notes («Ваши улицы · 3») and «+ / −».
  photoBtn: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  photoOn: { backgroundColor: '#111827' },
  photoText: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#111827' },
  photoTextOn: { color: '#ffffff' },
});
