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
  remarks: { ok: boolean; mine?: boolean; stale?: boolean }[];
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

/** A territory as the figures know it. */
export interface WalkLike {
  id: string;
  walkKm: number | null;
}
export interface ProposalWalkLike {
  kind: 'cut' | 'merge';
  state: 'open' | 'applied';
  queue: number;
  territories: { id: string }[];
  parts: { walkKm: number | null }[];
}

/**
 * The walk now and after: a cut — the territory's walk, then its longest
 * part; a join — the territories together, then the one they make. Null
 * where a figure is not in yet.
 */
export function walkNowAfter(
  p: ProposalWalkLike,
  byId: Map<string, WalkLike>,
): { now: number | null; after: number | null } {
  const nows = p.territories.map((t) => byId.get(t.id)?.walkKm ?? null);
  const now = nows.some((x) => x === null)
    ? null
    : nows.reduce<number>((n, x) => n + (x as number), 0);
  const parts = p.parts.map((x) => x.walkKm);
  const after =
    parts.length === 0 || parts.some((x) => x === null) ? null : Math.max(...(parts as number[]));
  return { now, after };
}

/**
 * What the service committee may still decide, one queue at a time
 * (17 November 2026: «вводить очередями» — the joins first, the cuts once
 * the joins have been seen to work). Only queues with something undecided.
 */
export function undecidedQueues(
  list: { kind: 'cut' | 'merge'; state: 'open' | 'applied'; queue: number; approvedAt: string | null }[],
): { queue: number; count: number; cuts: number; joins: number }[] {
  const by = new Map<number, { queue: number; count: number; cuts: number; joins: number }>();
  for (const p of list) {
    if (p.state !== 'open' || p.approvedAt) continue;
    const q = by.get(p.queue) ?? { queue: p.queue, count: 0, cuts: 0, joins: 0 };
    q.count += 1;
    if (p.kind === 'cut') q.cuts += 1;
    else q.joins += 1;
    by.set(p.queue, q);
  }
  return [...by.values()].sort((a, b) => a.queue - b.queue);
}

/** The open proposals by their round: how many cuts and joins in each. */
export function queuesOf(
  list: ProposalWalkLike[],
): { queue: number; cuts: number; joins: number }[] {
  const by = new Map<number, { queue: number; cuts: number; joins: number }>();
  for (const p of list) {
    if (p.state !== 'open') continue;
    const q = by.get(p.queue) ?? { queue: p.queue, cuts: 0, joins: 0 };
    if (p.kind === 'cut') q.cuts += 1;
    else q.joins += 1;
    by.set(p.queue, q);
  }
  return [...by.values()].sort((a, b) => a.queue - b.queue);
}

/**
 * The longest walk of all the territories now, and if all were taken: the
 * territories in no proposal as they are, the rest as their parts. After is
 * null while a part's walk is not in yet.
 */
export function longestWalk(
  territories: WalkLike[],
  list: ProposalWalkLike[],
): { now: number | null; after: number | null } {
  const known = territories.filter((t) => t.walkKm !== null).map((t) => t.walkKm as number);
  if (known.length === 0) return { now: null, after: null };
  const now = Math.max(...known);
  const open = list.filter((p) => p.state === 'open');
  const inside = new Set(open.flatMap((p) => p.territories.map((t) => t.id)));
  const rest = territories.filter((t) => !inside.has(t.id) && t.walkKm !== null).map((t) => t.walkKm as number);
  const parts = open.flatMap((p) => p.parts.map((x) => x.walkKm));
  if (parts.some((x) => x === null)) return { now, after: null };
  return { now, after: Math.max(0, ...rest, ...(parts as number[])) };
}

/** Territories whose number has the words searched for, any case, spaces ignored. */
export function searchTerritories<T extends { number: string }>(list: T[], q: string): T[] {
  const n = q.replace(/\s+/g, '').toLowerCase();
  return list.filter((t) => t.number.replace(/\s+/g, '').toLowerCase().includes(n));
}

/**
 * My own mark on a proposal (16 November 2026, review one by one): none yet,
 * "no remarks", a remark in words, or a mark given before the parts last
 * changed much — that one asks to be looked at again.
 */
export type MyMark = 'none' | 'ok' | 'remark' | 'stale';

export function myMarkOf(p: RecutProposalLike): MyMark {
  const r = p.remarks.find((x) => x.mine);
  if (!r) return 'none';
  if (r.stale) return 'stale';
  return r.ok ? 'ok' : 'remark';
}

/** Looked at by me: a mark that still stands. */
export function reviewedByMe(p: RecutProposalLike): boolean {
  const m = myMarkOf(p);
  return m === 'ok' || m === 'remark';
}

/**
 * The order of going through: the open proposals as the list shows them
 * (round, then when made). How many I have marked, and which to open next.
 */
export function reviewOf<T extends RecutProposalLike & { id: string }>(
  list: T[],
): { done: number; total: number; next: T | null } {
  const open = list.filter((p) => p.state === 'open');
  const done = open.filter(reviewedByMe).length;
  return { done, total: open.length, next: open.find((p) => !reviewedByMe(p)) ?? null };
}

/**
 * Where one proposal stands in the going-through: its place (from 1), the
 * one before and after, and the next one not yet marked after it — round
 * the end to the start; null when all are marked.
 */
export function reviewStep<T extends RecutProposalLike & { id: string }>(
  list: T[],
  id: string,
): { place: number; total: number; prev: T | null; next: T | null; nextToMark: T | null } | null {
  const open = list.filter((p) => p.state === 'open');
  const i = open.findIndex((p) => p.id === id);
  if (i < 0) return null;
  let nextToMark: T | null = null;
  for (let k = 1; k < open.length; k++) {
    const q = open[(i + k) % open.length];
    if (!reviewedByMe(q)) {
      nextToMark = q;
      break;
    }
  }
  return {
    place: i + 1,
    total: open.length,
    prev: i > 0 ? open[i - 1] : null,
    next: i < open.length - 1 ? open[i + 1] : null,
    nextToMark,
  };
}
