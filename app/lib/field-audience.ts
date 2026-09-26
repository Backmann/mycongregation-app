import type { FieldServiceMeeting } from './api';

/**
 * WHO A FIELD-SERVICE MEETING IS FOR — one rule, for every screen that draws
 * such meetings (26 September).
 *
 * Four screens draw them (the «Встречи для проповеди» page, the planning
 * section, Home and the Programme feed), and each once decided on its own:
 * the feed called every meeting without a group «Общая встреча», although a
 * combined meeting of the whole congregation is a separate flag (isGeneral),
 * and it never showed a service overseer's visit at all. On a Saturday with
 * a visit to one group at 10:00 and an ordinary meeting at 10:30 it read as
 * two meetings for everybody, and nobody could tell which one was theirs.
 *
 * The kinds:
 *  - `visit`   — the service overseer visits THIS group; for that group only.
 *                On that day the group goes to the visit and nowhere else
 *                (Lionel, 26 September).
 *  - `group`   — a group's own meeting.
 *  - `general` — the combined meeting of the whole congregation.
 *  - `open`    — a meeting that belongs to no one group: anybody comes.
 *
 * Pure: no translations, no React — scripts/check-field-audience.mjs runs it.
 */
export type FieldAudience = 'visit' | 'group' | 'general' | 'open';

export function audienceOf(m: FieldServiceMeeting): FieldAudience {
  // The database refuses a visit without a group; the guard keeps a stray
  // row from being called a visit to nobody.
  if (m.serviceOverseerVisit && m.serviceGroupId) return 'visit';
  if (m.serviceGroupId) return 'group';
  if (m.isGeneral) return 'general';
  return 'open';
}

/**
 * The person conducts the meeting, or goes to it as the service overseer or
 * his assistant. The overseer and assistant are stored on a visit only; on
 * any other meeting those two fields are empty.
 */
export function isOnMeeting(m: FieldServiceMeeting, me: string | null): boolean {
  return (
    !!me &&
    (m.conductorPublisherId === me ||
      m.serviceOverseerPublisherId === me ||
      m.serviceOverseerAssistantId === me)
  );
}

/**
 * The one line a list row adds under a meeting for this viewer, or null:
 * the viewer's group is on a visit that day, or the visit is another
 * group's. Pure — the caller translates the kind.
 */
export type FieldNote =
  | { kind: 'notForYourGroup' }
  | { kind: 'awayOnVisit'; groupId: string }
  | { kind: 'onlyFor'; groupId: string }
  | null;

/** The note for one place — the same wording decision for every screen. */
export function noteForPlace(p: FieldPlace, myGroupId: string | null): FieldNote {
  if (p.notForMyGroupToday) return { kind: 'notForYourGroup' };
  if (p.awayOnVisitTo) return { kind: 'awayOnVisit', groupId: p.awayOnVisitTo };
  // «Только для группы …» tells someone else's member to stay away; the
  // overseer and his assistant are going, and it is not said to them.
  if (p.audience === 'visit' && !p.own && !p.mine && !!myGroupId) {
    return { kind: 'onlyFor', groupId: p.meeting.serviceGroupId as string };
  }
  return null;
}

export function fieldNotes(
  meetings: FieldServiceMeeting[],
  myGroupId: string | null,
  me: string | null,
): Map<string, FieldNote> {
  const byDay = new Map<string, FieldServiceMeeting[]>();
  for (const m of meetings) {
    const k = `${m.weekStartDate}|${m.dayOfWeek}`;
    byDay.set(k, [...(byDay.get(k) ?? []), m]);
  }
  const out = new Map<string, FieldNote>();
  for (const day of byDay.values()) {
    const a = arrangeFieldDay(day, myGroupId, me);
    for (const p of [...a.shown, ...a.others]) {
      out.set(p.meeting.id, noteForPlace(p, myGroupId));
    }
  }
  return out;
}

export interface FieldPlace {
  meeting: FieldServiceMeeting;
  audience: FieldAudience;
  /** The meeting is the viewer's own group's (a visit to it included). */
  own: boolean;
  /**
   * The viewer's group is on a visit that day and this is another meeting:
   * it is not for them this time.
   */
  notForMyGroupToday: boolean;
  /** The viewer conducts it, or is the overseer or his assistant on it. */
  mine: boolean;
  /**
   * The viewer goes that day to a visit to ANOTHER group (as the overseer,
   * his assistant or its conductor), so this meeting — his own group's or
   * an open one — is not his: the group visited, by id.
   */
  awayOnVisitTo: string | null;
}

export interface FieldDayArrangement {
  /** What the viewer needs to see, in time order. */
  shown: FieldPlace[];
  /** Other groups' meetings, folded away («ещё N встреч других групп»). */
  others: FieldPlace[];
  /** The viewer's own group has a visit that day. */
  myGroupOnVisit: boolean;
}

/**
 * One day's field-service meetings as a given person should read them.
 *
 * Without a group of one's own (an unlinked account, or a card with no
 * group) nothing is folded away: there is no «other group» to speak of.
 * A meeting the person conducts, or goes to as the service overseer or his
 * assistant, is always shown — he visits groups that are not his.
 */
export function arrangeFieldDay(
  meetings: FieldServiceMeeting[],
  myGroupId: string | null,
  me: string | null,
): FieldDayArrangement {
  const sorted = [...meetings].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const visited = new Set(
    sorted.filter((m) => audienceOf(m) === 'visit').map((m) => m.serviceGroupId as string),
  );
  const myGroupOnVisit = !!myGroupId && visited.has(myGroupId);
  // The overseer and his assistant belong to a group of their own; on the
  // day they visit another one, their group's meeting and the open ones are
  // not theirs either.
  const myVisit =
    sorted.find((m) => audienceOf(m) === 'visit' && isOnMeeting(m, me)) ?? null;
  const places: FieldPlace[] = sorted.map((m) => {
    const audience = audienceOf(m);
    const own = !!myGroupId && m.serviceGroupId === myGroupId;
    return {
      meeting: m,
      audience,
      own,
      // Only a meeting the group would otherwise have gone to: an open or
      // combined one, or another of its own. Another group's meeting was
      // never theirs, and saying «ваша группа на посещении» under it read as
      // if it had been.
      notForMyGroupToday:
        myGroupOnVisit &&
        !(audience === 'visit' && own) &&
        (own || audience === 'open' || audience === 'general'),
      mine: isOnMeeting(m, me),
      awayOnVisitTo:
        myVisit &&
        myVisit.id !== m.id &&
        myVisit.serviceGroupId !== myGroupId &&
        (own || audience === 'open' || audience === 'general')
          ? (myVisit.serviceGroupId as string)
          : null,
    };
  });
  if (!myGroupId) return { shown: places, others: [], myGroupOnVisit: false };
  const isOthers = (p: FieldPlace) =>
    !p.own && !p.mine && (p.audience === 'group' || p.audience === 'visit');
  return {
    shown: places.filter((p) => !isOthers(p)),
    others: places.filter(isOthers),
    myGroupOnVisit,
  };
}
