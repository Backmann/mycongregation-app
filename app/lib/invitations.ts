/**
 * EVENTS FOR THE INVITED ONLY (10 November 2026) — the same list as the
 * server's special-events/invitations.ts.
 *
 * The Kingdom Ministry School for elders, the same for ministerial
 * servants, and the special meeting with the pioneers of the circuit. The
 * server sends such an event only to the invited and to those who keep the
 * events; the app says for whom it is, and — for those who plan — marks the
 * invited busy on its days (GET /special-events/busy).
 */
export type Invitees = 'elders' | 'servants' | 'pioneers';

export const INVITE_ONLY_TYPES: Record<string, Invitees> = {
  kingdom_ministry_school_elders: 'elders',
  kingdom_ministry_school_servants: 'servants',
  pioneer_special_meeting: 'pioneers',
};

export function inviteesOf(type: string | null | undefined): Invitees | null {
  return (type && INVITE_ONLY_TYPES[type]) || null;
}
