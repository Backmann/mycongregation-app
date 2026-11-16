/**
 * Where to go after signing in (16 November 2026): a page of the app opened
 * by its address — say a proposal opened from the phone in its browser —
 * comes back there instead of to Home. Only a path of this site: never
 * another site, never the sign-in pages themselves. Pure — the gate checks
 * it (scripts/check-return-path.mjs).
 */
export function returnPath(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string' || v.length > 300) return null;
  // One leading slash; no "//host", no "/\host", no scheme, no control characters.
  if (!/^\/[A-Za-z0-9\-._~%/()]*(\?[A-Za-z0-9\-._~%=&]*)?$/.test(v)) return null;
  if (v.startsWith('//')) return null;
  const path = v.split('?')[0];
  if (path === '/' || path === '/home') return null;
  if (/^\/(login|forgot-password|reset-password|invite)(\/|$)/.test(path)) return null;
  return v;
}
