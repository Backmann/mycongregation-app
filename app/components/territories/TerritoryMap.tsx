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

const BOUNDARY = '#0e7490';

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
}: {
  shapes: MapShape[];
  boundary?: TerritoryGeometry | null;
  /** Fit the view to this territory rather than to everything. */
  focus?: string | null;
  onSelect?: (id: string) => void;
  height: number;
}) {
  if (Platform.OS !== 'web') return null;
  return (
    <WebMap
      shapes={shapes}
      boundary={boundary ?? null}
      focus={focus ?? null}
      onSelect={onSelect}
      height={height}
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
}: {
  shapes: MapShape[];
  boundary: TerritoryGeometry | null;
  focus: string | null;
  onSelect?: (id: string) => void;
  height: number;
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
  });
  const streets = accessQ.data?.mapReady;

  const box = useMemo(() => {
    const target = focus ? shapes.filter((s) => s.id === focus) : shapes;
    const geoms = target.map((s) => s.geometry);
    if (!focus && boundary) geoms.push(boundary);
    return boxOf(geoms);
  }, [shapes, boundary, focus]);

  // The map itself, once.
  useEffect(() => {
    let gone = false;
    const congregationId = user?.congregationId;
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
  }, [user?.congregationId, streets]);

  // Data that changes after the first drawing.
  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.getSource('terr')?.setData(featuresOf(shapes));
    map.current.getSource('boundary')?.setData(boundaryOf(boundary));
  }, [ready, shapes, boundary]);

  // The view: the territory in focus, or everything.
  useEffect(() => {
    if (!ready || !map.current || !box) return;
    // Room at the foot for the «no streets yet» note when it is shown.
    const padding = noStreets ? { top: 28, left: 28, right: 28, bottom: 64 } : 28;
    map.current.fitBounds(box, { padding, animate: false, maxZoom: 17 });
  }, [ready, box, noStreets]);

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
