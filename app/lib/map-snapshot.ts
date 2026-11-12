/**
 * A territory's map as a picture for printing (12 November 2026), drawn by
 * the same MapLibre and the same map file as the screen — on the web only.
 *
 * The map is made off-screen at the print size, the territory outlined
 * heavily and everything outside it under a pale veil so it stands out on
 * a black-and-white printer, the neighbours thin with their numbers. Once
 * every tile is in, the canvas becomes a PNG and the street names inside
 * the territory are read from the same tiles.
 */
import type { TerritoryGeometry } from './api';
import { loadMapLibs, MAP_FILES, mapFileUrl, type MapLibreMap } from './map-libs';
import { boxOf } from './territory-view';
import { streetsInside } from './territory-sheet';

const RATIO = 2;
const WAIT_MS = 25_000;

export interface SnapshotInput {
  congregationId: string;
  mapReady: boolean;
  geometry: TerritoryGeometry;
  neighbours: { number: string; geometry: TerritoryGeometry }[];
  /** The picture's size in device pixels (print dots). */
  wPx: number;
  hPx: number;
}

export interface Snapshot {
  png: string;
  streets: string[];
  /** Metres one picture pixel spans across the middle, for the scale bar. */
  metresPerPx: number;
}

type RoadsMap = MapLibreMap & {
  querySourceFeatures: (
    source: string,
    opts: { sourceLayer: string },
  ) => { properties?: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }[];
};

/**
 * The street names inside a territory, from the road tiles the map has
 * loaded — so the territory must be in view. Also offered when a
 * «не посещать» address is typed (12 November 2026).
 */
export function streetNamesIn(map: MapLibreMap, geometry: TerritoryGeometry): string[] {
  const roads = (map as RoadsMap)
    .querySourceFeatures('protomaps', { sourceLayer: 'roads' })
    .map((f) => ({
      name: (f.properties?.['name:de'] ?? f.properties?.name) as string | undefined,
      lines: (f.geometry.type === 'MultiLineString'
        ? f.geometry.coordinates
        : f.geometry.type === 'LineString'
          ? [f.geometry.coordinates]
          : []) as [number, number][][],
    }));
  return streetsInside(roads, geometry);
}

/** A rectangle round the world with the territory cut out: the veil. */
function veilOf(g: TerritoryGeometry) {
  const outer: [number, number][] = [
    [-179, -85],
    [179, -85],
    [179, 85],
    [-179, 85],
    [-179, -85],
  ];
  const polys = (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) as [
    number,
    number,
  ][][][];
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [outer, ...polys.map((p) => p[0])] },
  };
}

export async function snapshotTerritory(input: SnapshotInput): Promise<Snapshot> {
  const { maplibregl, basemaps } = await loadMapLibs();
  const origin = window.location.origin;
  const fileUrl = mapFileUrl(origin, input.congregationId);
  const box = boxOf([input.geometry]);
  if (!box) throw new Error('territory has no shape');

  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${Math.round(
    input.wPx / RATIO,
  )}px;height:${Math.round(input.hPx / RATIO)}px;`;
  document.body.appendChild(host);

  const map = new maplibregl.Map({
    container: host,
    style: {
      version: 8,
      glyphs: origin + MAP_FILES.glyphs,
      sprite: origin + MAP_FILES.sprite,
      sources: input.mapReady
        ? { protomaps: { type: 'vector', url: `pmtiles://${fileUrl}` } }
        : {},
      layers: input.mapReady
        ? basemaps.layers('protomaps', basemaps.namedFlavor('light'), { lang: 'de' })
        : [{ id: 'background', type: 'background', paint: { 'background-color': '#f1f5f9' } }],
    },
    interactive: false,
    preserveDrawingBuffer: true,
    pixelRatio: RATIO,
    attributionControl: false,
    fadeDuration: 0,
    bounds: box,
    fitBoundsOptions: { padding: 24 },
  }) as RoadsMap;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('map did not finish loading')), WAIT_MS);
      map.on('error', () => {
        /* a missing tile is not the end of the picture */
      });
      map.on('load', () => {
        map.addSource('veil', { type: 'geojson', data: veilOf(input.geometry) });
        map.addLayer({
          id: 'veil',
          type: 'fill',
          source: 'veil',
          paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.55 },
        });
        map.addSource('neighbours', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: input.neighbours.map((n) => ({
              type: 'Feature',
              properties: { number: n.number },
              geometry: n.geometry,
            })),
          },
        });
        map.addLayer({
          id: 'neighbours-line',
          type: 'line',
          source: 'neighbours',
          paint: { 'line-color': '#64748b', 'line-width': 1, 'line-dasharray': [2, 2] },
        });
        map.addLayer({
          id: 'neighbours-label',
          type: 'symbol',
          source: 'neighbours',
          layout: { 'text-field': ['get', 'number'], 'text-font': [MAP_FILES.labelFont], 'text-size': 11 },
          paint: { 'text-color': '#475569', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
        });
        map.addSource('own', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: input.geometry },
        });
        map.addLayer({
          id: 'own-line',
          type: 'line',
          source: 'own',
          paint: { 'line-color': '#0f172a', 'line-width': 3.5 },
        });
        map.once('idle', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    });

    const png = map.getCanvas().toDataURL('image/png');
    // Across the middle of the picture, in metres (haversine).
    const canvas = map.getCanvas();
    const cssW = canvas.width / RATIO;
    const midY = canvas.height / RATIO / 2;
    const a = map.unproject([0, midY]);
    const b = map.unproject([cssW, midY]);
    const metresPerPx = metresBetween(a, b) / canvas.width;
    const streets = input.mapReady ? streetNamesIn(map, input.geometry) : [];
    return { png, streets, metresPerPx };
  } finally {
    map.remove();
    host.remove();
  }
}

function metresBetween(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * The street names inside a territory, for the «не посещать» address field
 * (12 November 2026). The map on the territory's screen is too small: at its
 * zoom the tiles carry few names. So, as for the printed sheet, an off-screen
 * map is drawn close enough for every street, read, and thrown away.
 */
export async function streetsOfTerritory(input: {
  congregationId: string;
  geometry: TerritoryGeometry;
}): Promise<string[]> {
  const { maplibregl, basemaps } = await loadMapLibs();
  const origin = window.location.origin;
  const box = boxOf([input.geometry]);
  if (!box) return [];
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1400px;height:1400px;';
  document.body.appendChild(host);
  const map = new maplibregl.Map({
    container: host,
    style: {
      version: 8,
      glyphs: origin + MAP_FILES.glyphs,
      sprite: origin + MAP_FILES.sprite,
      sources: {
        protomaps: { type: 'vector', url: `pmtiles://${mapFileUrl(origin, input.congregationId)}` },
      },
      layers: basemaps.layers('protomaps', basemaps.namedFlavor('light'), { lang: 'de' }),
    },
    interactive: false,
    pixelRatio: 1,
    attributionControl: false,
    fadeDuration: 0,
    bounds: box,
    fitBoundsOptions: { padding: 20 },
  }) as MapLibreMap;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('map did not finish loading')), WAIT_MS);
      map.on('error', () => {
        /* a missing tile still leaves the others */
      });
      map.once('idle', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return streetNamesIn(map, input.geometry);
  } finally {
    map.remove();
    host.remove();
  }
}

