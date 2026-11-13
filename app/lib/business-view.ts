/**
 * How a business territory's list is shown (13 November 2026). Pure: no
 * imports, so the gate can check it (scripts/check-business-view.mjs).
 */

export interface Spot {
  id: string;
  lon: number | null;
  lat: number | null;
}

/** About one building: shops closer than this stand together. */
export const TOGETHER_METRES = 30;

function metres(a: Spot, b: Spot): number {
  const kx = 111320 * Math.cos(((a.lat as number) * Math.PI) / 180);
  return Math.hypot(((a.lon as number) - (b.lon as number)) * kx, ((a.lat as number) - (b.lat as number)) * 110540);
}

/**
 * The list as rows: a business alone, or several that stand together (a
 * shopping centre, a row of shops in one house) as one row to open — so
 * thirty shops of one mall are not thirty rows and thirty dots in one
 * place. Each row stands where its first member stands in the walking
 * order; a member never shows twice. Places without a point stand alone.
 */
export function rowsOf<T extends Spot>(items: T[], within = TOGETHER_METRES): (T | T[])[] {
  const parent = items.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < items.length; i++) {
    if (items[i].lon === null || items[i].lat === null) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].lon === null || items[j].lat === null) continue;
      if (metres(items[i], items[j]) <= within) parent[root(j)] = root(i);
    }
  }
  const members = new Map<number, T[]>();
  items.forEach((it, i) => {
    const r = root(i);
    members.set(r, [...(members.get(r) ?? []), it]);
  });
  const shown = new Set<number>();
  const out: (T | T[])[] = [];
  items.forEach((it, i) => {
    const r = root(i);
    if (shown.has(r)) return;
    shown.add(r);
    const group = members.get(r)!;
    out.push(group.length > 1 ? group : it);
  });
  return out;
}

/** «Зашли: 13 из 41» and how many wait for another time. */
export function progressOf(items: { visit: { state: string } | null }[]): {
  visited: number;
  later: number;
  total: number;
} {
  return {
    visited: items.filter((i) => i.visit?.state === 'visited').length,
    later: items.filter((i) => i.visit?.state === 'later').length,
    total: items.length,
  };
}
