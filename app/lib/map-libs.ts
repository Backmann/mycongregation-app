/**
 * The map libraries, on the web only (11 November 2026).
 *
 * MapLibre, the PMTiles reader and the Protomaps style are files in the
 * site itself (public/map), loaded the first time a map is drawn — not
 * npm packages: package.json feeds the Expo fingerprint, and a new
 * dependency there would stop over-the-air updates reaching the phones.
 * Nothing is fetched from anyone else's server: the libraries, the fonts,
 * the icons and the map file all come from mycongregation.org.
 *
 * The file names carry their version because the site keeps every .js and
 * .css for a year («immutable»): a new version must be a new name.
 */

export const MAP_FILES = {
  maplibre: '/map/maplibre-gl-5.24.0.js',
  maplibreCss: '/map/maplibre-gl-5.24.0.css',
  pmtiles: '/map/pmtiles-4.5.0.js',
  basemaps: '/map/basemaps-5.7.2.js',
  glyphs: '/map/fonts/{fontstack}/{range}.pbf',
  sprite: '/map/sprites/v4/light',
  /** A font stack the fonts folder holds (glyph ranges for Latin and Cyrillic). */
  labelFont: 'Noto Sans Medium',
} as const;

/** The congregation's map file, cut by the server's «Territory map» job. */
export function mapFileUrl(origin: string, congregationId: string): string {
  return `${origin}/app/maps/${congregationId}.pmtiles`;
}

/* The three globals the files define; only what is used here is typed. */
export interface MapLibreGlobal {
  Map: new (options: Record<string, unknown>) => MapLibreMap;
  addProtocol: (name: string, load: unknown) => void;
  AttributionControl: new (options?: Record<string, unknown>) => unknown;
  NavigationControl: new (options?: Record<string, unknown>) => unknown;
}

export interface MapLibreMap {
  on: (event: string, ...rest: unknown[]) => void;
  once: (event: string, cb: () => void) => void;
  addSource: (id: string, source: Record<string, unknown>) => void;
  getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
  addLayer: (layer: Record<string, unknown>) => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options?: Record<string, unknown>,
  ) => void;
  addControl: (control: unknown, position?: string) => void;
  getCanvas: () => HTMLCanvasElement;
  unproject: (point: [number, number]) => { lng: number; lat: number };
  resize: () => void;
  remove: () => void;
  loaded: () => boolean;
  isStyleLoaded: () => boolean | void;
}

interface PmtilesGlobal {
  Protocol: new () => { tile: unknown };
}

interface BasemapsGlobal {
  layers: (
    source: string,
    flavor: unknown,
    options?: { lang?: string },
  ) => Record<string, unknown>[];
  namedFlavor: (name: string) => unknown;
}

export interface MapLibs {
  maplibregl: MapLibreGlobal;
  basemaps: BasemapsGlobal;
}

let loading: Promise<MapLibs> | null = null;

function addScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`map file ${src} did not load`));
    document.head.appendChild(el);
  });
}

function addStyle(href: string): void {
  if (document.querySelector(`link[data-map="${href}"]`)) return;
  const el = document.createElement('link');
  el.rel = 'stylesheet';
  el.href = href;
  el.setAttribute('data-map', href);
  document.head.appendChild(el);
}

/** Loads the files once per page; later callers share the same promise. */
export function loadMapLibs(): Promise<MapLibs> {
  if (loading) return loading;
  loading = (async () => {
    addStyle(MAP_FILES.maplibreCss);
    await Promise.all([
      addScript(MAP_FILES.maplibre),
      addScript(MAP_FILES.pmtiles),
      addScript(MAP_FILES.basemaps),
    ]);
    const w = window as unknown as {
      maplibregl: MapLibreGlobal;
      pmtiles: PmtilesGlobal;
      basemaps: BasemapsGlobal;
    };
    const protocol = new w.pmtiles.Protocol();
    w.maplibregl.addProtocol('pmtiles', protocol.tile);
    return { maplibregl: w.maplibregl, basemaps: w.basemaps };
  })();
  // A failed load may be tried again (a dropped connection, not a bug).
  loading.catch(() => {
    loading = null;
  });
  return loading;
}
