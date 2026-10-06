import type { Permissions } from './permissions';

/**
 * Who each screen is for — every screen of the app, in one place.
 *
 * Until 6 October a screen was closed only if somebody had remembered to close
 * it. The doors were right: nobody was offered a screen that was not theirs.
 * But an address is a way in too, and typed by hand it opened the
 * administrator's «Ответственные», the forms for a new publisher, a new group
 * and a new event, the elders' tasks (as an empty list — a refusal drawn as
 * «nothing here») and more, to anybody signed in. Nothing could be changed
 * there, the server refused; they were simply rooms with the door off.
 *
 * The screens that WERE closed each said so in words of their own — eleven
 * ways of saying «not yours».
 *
 * Now: one table, one check where a screen is about to be drawn
 * (components/ScreenGate), one way of saying no (components/NoAccess). A
 * screen that is not in this table fails scripts/check-screen-access.mjs, so a
 * new screen cannot be added without deciding who it is for.
 *
 * The key is the screen's file under app/(app), as expo-router names it.
 */
export type AccessRule =
  /** Anybody signed in. */
  | 'all'
  /**
   * The screen answers for itself: it forwards to another address, or only the
   * server can tell (a card that is open to its own group, a report open to
   * whoever oversees that group). Its refusal is the server's, drawn by
   * LoadFailure with the same NoAccess.
   */
  | 'self'
  | 'admin'
  | 'elders'
  | 'editsProgramme'
  | 'importsProgramme'
  | 'events'
  | 'publisherCards'
  | 'publicTalks'
  | 'localNeeds'
  | 'pioneerSchool'
  | 'coSchedule'
  | 'auxPioneers'
  | 'summary'
  | 'annual'
  | 'attendance'
  | 'duties'
  | 'backups';

/** What the account itself carries, beside the permissions. */
export interface AccessUser {
  canManageBackups?: boolean;
}

export const ACCESS_RULES: Record<
  AccessRule,
  (perms: Permissions, user: AccessUser | null) => boolean
> = {
  all: () => true,
  self: () => true,
  admin: (p) => p.isAdmin,
  elders: (p) => p.isAdmin || p.isElder,
  editsProgramme: (p) => p.canEditMidweekSchedule || p.canEditWeekendSchedule,
  importsProgramme: (p) =>
    p.canImportMidweekSchedule || p.canImportWeekendSchedule,
  events: (p) => p.canManageEvents,
  publisherCards: (p) => p.canEditPublishers,
  publicTalks: (p) => p.canCoordinatePublicTalks,
  localNeeds: (p) => p.canViewLocalNeeds,
  pioneerSchool: (p) => p.canViewPioneerSchool,
  coSchedule: (p) => p.canViewCoSchedule,
  auxPioneers: (p) => p.canManageAuxiliaryPioneers,
  summary: (p) => p.canViewServiceSummary,
  annual: (p) => p.canManageServiceSummary,
  attendance: (p) => p.canViewAttendance,
  duties: (p) => p.canEditDuties || p.isElder || p.isAdmin,
  backups: (_p, user) => user?.canManageBackups === true,
};

export const SCREEN_ACCESS: Record<string, AccessRule> = {
  // ── Главная ──────────────────────────────────────────────────────────
  '/home': 'all',
  '/home/my-assignments': 'all',

  // ── Программа ────────────────────────────────────────────────────────
  '/schedule': 'all',
  // Turns away by itself, to the same week of the feed (lib/permissions
  // canOpenProgrammeEditor, scripts/check-programme-editor-door.mjs).
  '/schedule/edit': 'self',
  '/schedule/new': 'self', // old address → /schedule/edit
  '/schedule/feed': 'self', // old address → /schedule
  // For the chairman of that very meeting and the administrator; which
  // meeting — only the screen knows.
  '/schedule/conduct': 'self',
  // One part of the programme, opened to be changed; read-only or refused by
  // what the part is — the screen and the server know.
  '/schedule/[id]': 'self',
  '/schedule/rules': 'editsProgramme',
  '/schedule/import': 'importsProgramme',
  '/special-events': 'all',
  '/special-events/[id]': 'all',
  '/special-events/new': 'events',
  '/local-needs': 'localNeeds',

  // ── Собрание ─────────────────────────────────────────────────────────
  '/publishers': 'all',
  '/publishers/list': 'all',
  // A card is open to the elders and to the person's own group — the server
  // says which.
  '/publishers/[id]': 'self',
  '/publishers/new': 'publisherCards',
  '/service-groups': 'all',
  '/service-groups/[id]': 'self',
  '/service-groups/new': 'admin',
  '/absences': 'all',
  '/absences/[id]': 'all',
  '/absences/new': 'all',
  // Two screens under one name (6 October): who carries which duty is read
  // by everybody; assigning, and «who appointed him and when», is the
  // administrator's.
  '/publishers/responsibilities-list': 'all',
  '/publishers/responsibilities': 'admin',
  '/publishers/duties': 'duties',
  '/publishers/duties-meeting': 'duties',
  '/publishers/cleaning': 'all',
  '/publishers/cleaning-week': 'all',
  '/cleaning/guide': 'all',
  '/publishers/meeting-settings': 'admin',
  '/publishers/admin-users': 'admin',
  '/publishers/journal': 'admin',
  '/publishers/backups': 'backups',
  '/publishers/public-talks': 'elders',
  '/publishers/public-talks-import': 'elders',
  '/publishers/songs-import': 'elders',
  '/publishers/public-talks-retire': 'publicTalks',
  // Readable by everybody by the owner's decision of 24 September.
  '/publishers/circuit-overseer': 'all',
  '/talk-coordinator': 'publicTalks',
  '/talk-coordinator/speakers': 'publicTalks',
  '/talk-coordinator/speaker-profile/[id]': 'publicTalks',
  '/talk-coordinator/our-speakers': 'publicTalks',
  '/talk-coordinator/our-speaker-profile/[id]': 'publicTalks',
  '/talk-coordinator/congregations': 'publicTalks',
  '/talk-coordinator/congregation-profile/[id]': 'publicTalks',
  '/talk-coordinator/log': 'publicTalks',
  '/tasks': 'elders',
  '/tasks/agenda': 'elders',
  '/tasks/archive': 'elders',
  '/pioneer-school': 'pioneerSchool',
  '/pioneer-school/[id]': 'pioneerSchool',
  '/pioneer-school/helpers': 'pioneerSchool',

  // ── Служение ─────────────────────────────────────────────────────────
  '/cart': 'all',
  '/cart/field-service': 'all',
  '/cart/witnessing': 'all',
  '/cart/locations': 'all',
  '/cart/co-schedule': 'coSchedule',
  // Readable by everybody: the owner's decision of 24 September.
  '/cart/service-overseer': 'all',
  // Two screens under one name (6 October). Everybody is told who serves
  // THIS month — names and nothing else. The working list — hours, terms,
  // other months, the journal — is for those who keep it, and the server
  // gives it to nobody else.
  '/cart/auxiliary-pioneers-month': 'all',
  '/cart/auxiliary-pioneers': 'auxPioneers',
  '/service-reports': 'all',
  '/service-reports/new': 'all',
  // Whoever oversees a group reads that group's reports — the server knows.
  '/service-reports/group': 'self',
  '/service-reports/summary': 'summary',
  '/service-reports/annual': 'annual',
  '/service-reports/attendance': 'attendance',
  '/service-reports/activity': 'elders',
  // One report's history and one publisher's history, by number: the server
  // decides, as for the cards.
  '/service-reports/audit-log': 'self',
  '/service-reports/publisher-history': 'self',
  '/service-reports/pioneer-year-review': 'elders',

  // ── Профиль ──────────────────────────────────────────────────────────
  '/profile': 'all',
  '/profile/my-tasks': 'all',
  '/profile/contacts': 'all',
  '/profile/notifications': 'all',
  '/profile/change-password': 'all',
  '/profile/delete-account': 'all',
  '/profile/notification-reach': 'self', // forwards whoever is not an admin
  // Old addresses from before the Congregation tab: each forwards to the
  // screen above, and that one is checked.
  '/profile/admin-users': 'self',
  '/profile/backups': 'self',
  '/profile/circuit-overseer': 'self',
  '/profile/halls': 'self',
  '/profile/journal': 'self',
  '/profile/meeting-settings': 'self',
  '/profile/public-talks': 'self',
  '/profile/public-talks-import': 'self',
  '/profile/public-talks-retire': 'self',
  '/profile/responsibilities': 'self',
  '/profile/songs-import': 'self',
};

/**
 * May this person stand on this screen? A screen the table does not know is
 * let through — the check in the gate keeps that from happening, and a
 * mistake there must not lock anybody out of a screen.
 */
export function screenAllowed(
  route: string,
  perms: Permissions,
  user: AccessUser | null,
): boolean {
  const rule = SCREEN_ACCESS[route];
  return rule === undefined ? true : ACCESS_RULES[rule](perms, user);
}

/** A stack's folder and a screen's name in it → the screen's key above. */
export function routeOf(base: string, name: string): string {
  if (name === 'index') return base;
  return `${base}/${name.replace(/\/index$/, '')}`;
}
