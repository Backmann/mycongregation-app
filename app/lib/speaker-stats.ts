// Pure derivation of a visiting speaker's rotation profile from the talk-exchange
// journal. Everything here comes from data already loaded on the client
// (no server round-trips): past + future visits relative to today, how often
// and how recently he has been with us, and which of his repertoire talks he
// has not yet given here.

import {
  ExternalCongregation,
  PublicTalk,
  TalkExchange,
  VisitingSpeaker,
} from './api';

/** A single incoming visit by this speaker, with the talk resolved. */
export interface SpeakerVisit {
  id: string;
  date: string; // YYYY-MM-DD
  talkNumber: number | null;
  talkTitle: string | null;
  tentative: boolean;
}

export interface SpeakerStats {
  /** Past visits, most-recent first. */
  pastVisits: SpeakerVisit[];
  /** Today + future visits, soonest first. */
  futureVisits: SpeakerVisit[];
  /** Number of past visits. */
  count: number;
  lastVisit: SpeakerVisit | null;
  nextVisit: SpeakerVisit | null;
  /** Talk numbers he has given here (past or already scheduled). */
  givenTalkNumbers: Set<number>;
  /** Repertoire talks he has NOT yet given here. */
  freshTalkNumbers: number[];
  /** Mean days between consecutive past visits, or null with < 2 visits. */
  avgIntervalDays: number | null;
}

const DAY = 86_400_000;
const day = (iso: string) => iso.slice(0, 10);

export function computeSpeakerStats(
  speaker: Pick<VisitingSpeaker, 'id' | 'talkNumbers'>,
  entries: TalkExchange[],
  talkById: Map<string, PublicTalk>,
  todayISO: string,
): SpeakerStats {
  const today = day(todayISO);
  const visits: SpeakerVisit[] = [];
  for (const e of entries) {
    if (e.direction !== 'incoming' || e.visitingSpeakerId !== speaker.id) continue;
    const talk = e.publicTalkId ? talkById.get(e.publicTalkId) ?? null : null;
    visits.push({
      id: e.id,
      date: day(e.date),
      talkNumber: talk?.number ?? null,
      talkTitle: talk?.title ?? null,
      tentative: e.status === 'tentative',
    });
  }

  const pastVisits = visits
    .filter((v) => v.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const futureVisits = visits
    .filter((v) => v.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const givenTalkNumbers = new Set<number>();
  for (const v of visits) if (v.talkNumber != null) givenTalkNumbers.add(v.talkNumber);
  const freshTalkNumbers = (speaker.talkNumbers ?? []).filter(
    (n) => !givenTalkNumbers.has(n),
  );

  let avgIntervalDays: number | null = null;
  if (pastVisits.length >= 2) {
    const asc = [...pastVisits].reverse(); // chronological
    let sum = 0;
    for (let i = 1; i < asc.length; i++) {
      sum +=
        (new Date(`${asc[i].date}T00:00:00`).getTime() -
          new Date(`${asc[i - 1].date}T00:00:00`).getTime()) /
        DAY;
    }
    avgIntervalDays = Math.round(sum / (asc.length - 1));
  }

  return {
    pastVisits,
    futureVisits,
    count: pastVisits.length,
    lastVisit: pastVisits[0] ?? null,
    nextVisit: futureVisits[0] ?? null,
    givenTalkNumbers,
    freshTalkNumbers,
    avgIntervalDays,
  };
}

/** Recently visited = last visit within `withinDays` (default ~2 months). */
export function visitedRecently(
  stats: SpeakerStats,
  todayISO: string,
  withinDays = 61,
): boolean {
  if (!stats.lastVisit) return false;
  const diff =
    (new Date(`${day(todayISO)}T00:00:00`).getTime() -
      new Date(`${stats.lastVisit.date}T00:00:00`).getTime()) /
    DAY;
  return diff <= withinDays;
}

// ---------------------------------------------------------------------------
// Outgoing: one of our publishers giving talks in other congregations.
// Mirrors the incoming logic but keyed on publisherId, resolving the host
// congregation he visits and deriving his repertoire from what he has given.
// ---------------------------------------------------------------------------

/** A single outgoing trip by one of our brothers, talk + host resolved. */
export interface OutgoingVisit {
  id: string;
  date: string; // YYYY-MM-DD
  talkNumber: number | null;
  talkTitle: string | null;
  hostCongregationId: string | null;
  hostCongregation: string | null;
  tentative: boolean;
}

/** A talk in the brother's derived repertoire (from his trip history). */
export interface OutgoingRepertoireItem {
  talkNumber: number;
  title: string | null;
  count: number;
  lastDate: string; // YYYY-MM-DD
}

export interface OutgoingStats {
  pastVisits: OutgoingVisit[]; // most-recent first
  futureVisits: OutgoingVisit[]; // soonest first
  count: number; // past trips
  lastVisit: OutgoingVisit | null;
  nextVisit: OutgoingVisit | null;
  /** Talks he has given, most-given first (then most-recent). */
  repertoire: OutgoingRepertoireItem[];
  /** Distinct host congregations he has visited (past). */
  distinctCongregations: number;
  avgIntervalDays: number | null;
}

export function computeOutgoingStats(
  publisherId: string,
  entries: TalkExchange[],
  talkById: Map<string, PublicTalk>,
  congById: Map<string, ExternalCongregation>,
  todayISO: string,
): OutgoingStats {
  const today = day(todayISO);
  const visits: OutgoingVisit[] = [];
  for (const e of entries) {
    if (e.direction !== 'outgoing' || e.publisherId !== publisherId) continue;
    const talk = e.publicTalkId ? talkById.get(e.publicTalkId) ?? null : null;
    const cong = e.hostCongregationId
      ? congById.get(e.hostCongregationId) ?? null
      : null;
    visits.push({
      id: e.id,
      date: day(e.date),
      talkNumber: talk?.number ?? null,
      talkTitle: talk?.title ?? null,
      hostCongregationId: e.hostCongregationId ?? null,
      hostCongregation: cong?.name ?? null,
      tentative: e.status === 'tentative',
    });
  }

  const pastVisits = visits
    .filter((v) => v.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const futureVisits = visits
    .filter((v) => v.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Repertoire derived from every trip with a resolved talk number.
  const repMap = new Map<number, OutgoingRepertoireItem>();
  for (const v of visits) {
    if (v.talkNumber == null) continue;
    const cur = repMap.get(v.talkNumber);
    if (cur) {
      cur.count += 1;
      if (v.date > cur.lastDate) cur.lastDate = v.date;
      if (!cur.title && v.talkTitle) cur.title = v.talkTitle;
    } else {
      repMap.set(v.talkNumber, {
        talkNumber: v.talkNumber,
        title: v.talkTitle,
        count: 1,
        lastDate: v.date,
      });
    }
  }
  const repertoire = [...repMap.values()].sort(
    (a, b) =>
      b.count - a.count ||
      b.lastDate.localeCompare(a.lastDate) ||
      a.talkNumber - b.talkNumber,
  );

  const distinctCongregations = new Set(
    pastVisits
      .map((v) => v.hostCongregationId)
      .filter((x): x is string => !!x),
  ).size;

  let avgIntervalDays: number | null = null;
  if (pastVisits.length >= 2) {
    const asc = [...pastVisits].reverse();
    let sum = 0;
    for (let i = 1; i < asc.length; i++) {
      sum +=
        (new Date(`${asc[i].date}T00:00:00`).getTime() -
          new Date(`${asc[i - 1].date}T00:00:00`).getTime()) /
        DAY;
    }
    avgIntervalDays = Math.round(sum / (asc.length - 1));
  }

  return {
    pastVisits,
    futureVisits,
    count: pastVisits.length,
    lastVisit: pastVisits[0] ?? null,
    nextVisit: futureVisits[0] ?? null,
    repertoire,
    distinctCongregations,
    avgIntervalDays,
  };
}

/** Recently went out = last trip within `withinDays` (default ~2 months). */
export function wentOutRecently(
  stats: OutgoingStats,
  todayISO: string,
  withinDays = 61,
): boolean {
  if (!stats.lastVisit) return false;
  const diff =
    (new Date(`${day(todayISO)}T00:00:00`).getTime() -
      new Date(`${stats.lastVisit.date}T00:00:00`).getTime()) /
    DAY;
  return diff <= withinDays;
}

