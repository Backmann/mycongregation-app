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
  const places: FieldPlace[] = sorted.map((m) => {
    const audience = audienceOf(m);
    const own = !!myGroupId && m.serviceGroupId === myGroupId;
    return {
      meeting: m,
      audience,
      own,
      notForMyGroupToday: myGroupOnVisit && !(audience === 'visit' && own),
      mine:
        !!me &&
        (m.conductorPublisherId === me ||
          m.serviceOverseerPublisherId === me ||
          m.serviceOverseerAssistantId === me),
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
