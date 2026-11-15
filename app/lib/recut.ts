/**
 * The draft of re-cutting the territories as the screens show it
 * (15 November 2026). Pure — no imports — so the gate can check it
 * (scripts/check-recut.mjs).
 */

export interface RecutProposalLike {
  kind: 'cut' | 'merge';
  state: 'open' | 'applied';
  territories: { held: boolean; meetingOn: string | null }[];
  parts: unknown[];
  lines: unknown[] | null;
  approvedAt: string | null;
  reopenedAt: string | null;
  blocks: string[];
  remarks: { ok: boolean }[];
}

/** How many territories there are now, and how many if the open proposals were all applied. */
export function summaryOf(
  territories: number,
  proposals: RecutProposalLike[],
): { before: number; after: number; cuts: number; parts: number; joins: number; joined: number } {
  let after = territories;
  let cuts = 0;
  let parts = 0;
  let joins = 0;
  let joined = 0;
  for (const p of proposals) {
    if (p.state !== 'open') continue;
    if (p.kind === 'cut') {
      // The lines say how many parts, even when they no longer cut cleanly.
      const n = Math.max(p.parts.length, (p.lines?.length ?? 0) + 1);
      cuts += 1;
      parts += n;
      after += n - 1;
    } else {
      joins += 1;
      joined += p.territories.length;
      after -= p.territories.length - 1;
    }
  }
  return { before: territories, after, cuts, parts, joins, joined };
}

export type RecutFilter = 'all' | 'cut' | 'merge' | 'hands' | 'free';

/** Needs the keeper's hands: the lines no longer cut, or a border moved, or a territory gone. */
export function needsHands(p: RecutProposalLike): boolean {
  return p.blocks.includes('shape') || p.blocks.includes('changed') || p.blocks.includes('gone');
}

/** Every territory of it is free today: nobody holds it, no meeting goes to it. */
export function isFree(p: RecutProposalLike): boolean {
  return p.territories.every((t) => !t.held && !t.meetingOn);
}

export function filterProposals<T extends RecutProposalLike>(list: T[], f: RecutFilter): T[] {
  const open = list.filter((p) => p.state === 'open');
  if (f === 'cut') return open.filter((p) => p.kind === 'cut');
  if (f === 'merge') return open.filter((p) => p.kind === 'merge');
  if (f === 'hands') return open.filter(needsHands);
  if (f === 'free') return open.filter(isFree);
  return open;
}

/** Where the committee's decision stands. */
export function decisionOf(proposals: RecutProposalLike[]): {
  open: number;
  decided: number;
  waiting: number;
  reopened: number;
  remarks: number;
} {
  const open = proposals.filter((p) => p.state === 'open');
  return {
    open: open.length,
    decided: open.filter((p) => p.approvedAt).length,
    waiting: open.filter((p) => !p.approvedAt).length,
    reopened: open.filter((p) => !p.approvedAt && p.reopenedAt).length,
    remarks: open.reduce((n, p) => n + p.remarks.filter((r) => !r.ok).length, 0),
  };
}

/**
 * The colours of the parts on the map: told apart by lightness too, and
 * each part also carries its number on the map.
 */
export const PART_COLORS = ['#c2410c', '#1d4ed8', '#15803d', '#a16207', '#7e22ce', '#0e7490', '#be185d', '#4d7c0f'];

/** The query of the draft, shared by its two screens. */
export const RECUT_KEY = ['territories', 'recut'] as const;

/** «8,5» in Russian and German, «8.5» in English. */
export function km(n: number, lang: string): string {
  const v = Math.round(n * 10) / 10;
  return lang.startsWith('en') ? String(v) : String(v).replace('.', ',');
}

/** Where a territory lies by the measure: «город · 8 мин». */
export function whereOf(
  t: { cls: 'city' | 'far'; driveMinutes: number | null } | undefined,
  tr: (k: string, o?: Record<string, unknown>) => string,
  lang: string,
): string {
  if (!t) return '';
  const far = t.cls === 'far';
  if (t.driveMinutes == null) return tr(far ? 'territories.recut.where.farNoMin' : 'territories.recut.where.cityNoMin');
  return tr(far ? 'territories.recut.where.far' : 'territories.recut.where.city', { min: km(t.driveMinutes, lang) });
}
