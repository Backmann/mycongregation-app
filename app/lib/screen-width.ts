/**
 * HOW WIDE A SCREEN IS ALLOWED TO GROW (22 October 2026).
 *
 * The walk through every screen on an iPad and a laptop found at least four
 * widths: some screens ran edge to edge, some stood in a 720 column, some in
 * 640, some in 695 — two screens both called «Ответственные» differed. Lionel
 * approved one rule, from the mockup «Ширина экранов: iPad и компьютер»:
 *
 *   OVERVIEW — the tabs' own pages and the screens that show a month or a
 *              table: up to 1120, laid out in columns by the screen itself;
 *   READING  — every list, card, form and setting: up to 760;
 *   FULL     — conduct mode, whose stage view is the whole window.
 *
 * Applied by components/ScreenGate.tsx around every screen of every stack,
 * centred, on a window of 768 and wider; a phone is never touched. A screen
 * not named here is READING: a new screen is narrow until somebody decides
 * it needs the room.
 */
export const OVERVIEW_WIDTH = 1120;
export const READING_WIDTH = 760;
/** Narrower windows keep every screen as it was. */
export const WIDE_FROM = 768;
/** From here the tabs become a side menu (components/SideNav.tsx). */
export const SIDE_NAV_FROM = 1024;

const OVERVIEW = new Set<string>([
  '/home',
  '/schedule',
  '/schedule/edit',
  '/publishers',
  '/cart',
  '/cart/field-service',
  '/service-reports/group',
  '/service-reports/summary',
  '/service-reports/attendance',
  '/service-reports/annual',
  '/talk-coordinator/log',
  // A list beside the chosen item's detail: two panes need the room.
  '/publishers/duties',
  '/publishers/cleaning',
  '/special-events',
  '/publishers/list',
  // A table of the duties with the picker beside it (27 October 2026).
  '/publishers/responsibilities',
  // The publisher's card in two columns on its own (28 October 2026).
  '/publishers/[id]',
  // The groups beside the chosen group; a group in two columns (28 October).
  '/service-groups',
  '/service-groups/[id]',
  // Eight weeks of absences across, the cards in two columns; the form's
  // two months side by side (28 October 2026).
  '/absences',
  '/absences/new',
  '/absences/[id]',
  // The weeks ahead beside the bank of topics (28 October 2026).
  '/local-needs',
  // The person and his year beside his months (28 October 2026).
  '/service-reports/publisher-history',
  // What is now beside the history by service years (29 October 2026).
  '/cart/auxiliary-pioneers',
]);

/** The tabs' own first screens: the side menu is their way back. */
export const TAB_ROOTS = new Set<string>(['/home', '/schedule', '/publishers', '/cart', '/profile']);

const FULL = new Set<string>(['/schedule/conduct']);

/** The widest the screen at `route` may be; null — the whole window. */
export function screenMaxWidth(route: string): number | null {
  if (FULL.has(route)) return null;
  return OVERVIEW.has(route) ? OVERVIEW_WIDTH : READING_WIDTH;
}
