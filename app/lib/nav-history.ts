/**
 * «НАЗАД» ВЕДЁТ ТУДА, ОТКУДА ПРИШЛИ (19 October 2026).
 *
 * The app is a row of tabs, each with its own stack of screens; sections such
 * as «События» or «Задачи» are tabs of their own, hidden from the bar. Many
 * doors lead from one tab into another — the home screen alone opens screens
 * of eight other sections. Three things went wrong, all reported by brothers
 * («уходят назад по стрелке — и начинаются настоящие глюки»):
 *
 * 1. The header's back went to the screen's LOGICAL parent, not to where the
 *    person had come from: an event opened from the home screen went back to
 *    the Programme.
 * 2. It went there with a NAVIGATE, which in React Navigation 7 pushes a new
 *    copy of the parent on top of the stack unless it is the screen on top.
 *    The stack grew — [Главная, Уведомления, Главная] — so the home screen
 *    showed a second, native back arrow («Go back»), and that arrow led back
 *    into the notifications: a loop.
 * 3. A screen opened from another tab stayed on that tab's stack after the
 *    person left it. Tapping the tab later showed it instead of the section.
 *
 * So the app keeps its own short history of where the person has been, and
 * back — the header's, and Android's own button — goes one step back in it:
 * within a section it closes the screen; from a screen opened from another
 * section it closes that screen and returns to the section it came from.
 * The screen's logical parent is only the answer when there is no history
 * (the app opened straight on it, from a notification say).
 *
 * Pure apart from the module's own list, so scripts/check-nav-history.mjs can
 * pin the decisions. The screen side is components/NavHistory.tsx.
 */

/** One place the person stood: its path and its query. */
export interface NavEntry {
  /** «/schedule/conduct», «/service-groups/12» — what usePathname says. */
  path: string;
  /** The query, without the route's own segments: «week=2026-10-19&kind=weekend». */
  query: string;
}

const MAX = 60;

/** The section a path belongs to: «/schedule/edit» → «schedule». */
export function tabOf(path: string): string {
  return path.replace(/^\/+/, '').split(/[/?]/)[0] ?? '';
}

/** Whether a path is its section's first screen: «/schedule», «/home». */
export function isTabRoot(path: string): boolean {
  return path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).length <= 1;
}

export function hrefOf(e: NavEntry): string {
  return e.query ? `${e.path}?${e.query}` : e.path;
}

const same = (a: NavEntry | undefined, b: NavEntry | undefined) =>
  !!a && !!b && a.path === b.path && a.query === b.query;

/**
 * The next history after the person stands on `e`. Standing again where he
 * stood one step ago is a step back (the system's own back, the browser's,
 * or ours): that step is taken off, not added.
 */
export function stepped(history: NavEntry[], e: NavEntry): NavEntry[] {
  const last = history[history.length - 1];
  if (same(last, e)) return history;
  // The same screen with other words in its query (a filter, a week) is
  // still the same place: it replaces the step, it does not add one.
  if (last && last.path === e.path) return [...history.slice(0, -1), e];
  const before = history[history.length - 2];
  if (same(before, e) || (before && before.path === e.path)) return history.slice(0, -1);
  const next = [...history, e];
  return next.length > MAX ? next.slice(next.length - MAX) : next;
}

export type BackPlan =
  /** Close the screen on top of this section's stack. */
  | { kind: 'pop' }
  /** Close it (if it is not the section's first screen) and go to `href` in another section. */
  | { kind: 'leave'; pop: boolean; href: string }
  /** In this section, go back to `href` — closing everything above it. */
  | { kind: 'popTo'; href: string }
  /** Nothing to go back to: let the system do what it does (Android leaves the app). */
  | { kind: 'none' };

/**
 * What back does from the screen on top.
 *
 * - `history` — where the person has been, the current screen last;
 * - `stackDepth` — how many screens the current section's stack holds;
 * - `fallback` — the screen's logical parent, for when there is no history.
 */
export function planBack(input: {
  history: NavEntry[];
  stackDepth: number;
  fallback: string | null;
}): BackPlan {
  const { history, stackDepth, fallback } = input;
  const cur = history[history.length - 1];
  const prev = history[history.length - 2];
  if (!cur) return fallback ? { kind: 'popTo', href: fallback } : { kind: 'none' };
  const curTab = tabOf(cur.path);
  if (prev) {
    if (tabOf(prev.path) === curTab) {
      return stackDepth > 1 ? { kind: 'pop' } : { kind: 'popTo', href: hrefOf(prev) };
    }
    return { kind: 'leave', pop: stackDepth > 1 && !isTabRoot(cur.path), href: hrefOf(prev) };
  }
  // No history: the app opened on this screen.
  if (fallback && fallback !== cur.path) {
    return tabOf(fallback) === curTab
      ? stackDepth > 1
        ? { kind: 'pop' }
        : { kind: 'popTo', href: fallback }
      : { kind: 'leave', pop: stackDepth > 1 && !isTabRoot(cur.path), href: fallback };
  }
  return stackDepth > 1 ? { kind: 'pop' } : { kind: 'none' };
}

/**
 * A section whose screen on top was opened from ANOTHER section: when the
 * person comes back to it through the tab bar, it opens at its first screen
 * (problem 3 above). Its own deeper screens, opened inside it, are kept.
 */
export function foreignAfter(prevForeign: ReadonlySet<string>, history: NavEntry[]): Set<string> {
  const out = new Set(prevForeign);
  const cur = history[history.length - 1];
  const prev = history[history.length - 2];
  if (!cur) return out;
  const tab = tabOf(cur.path);
  if (isTabRoot(cur.path)) out.delete(tab);
  else if (prev && tabOf(prev.path) !== tab) out.add(tab);
  return out;
}

// --- the module's own state (components/NavHistory.tsx keeps it) ---------

let history: NavEntry[] = [];
let foreign = new Set<string>();

export function recordNav(e: NavEntry): void {
  history = stepped(history, e);
  foreign = foreignAfter(foreign, history);
}

export function navHistory(): NavEntry[] {
  return history;
}

/** Taken back by components/NavHistory performBack, which knows the step it undoes. */
export function setNavHistory(next: NavEntry[]): void {
  history = next;
}

export function isForeign(tab: string): boolean {
  return foreign.has(tab);
}

export function clearForeign(tab: string): void {
  foreign.delete(tab);
}

/** After a sign-out: nobody's history carries over. */
export function resetNav(): void {
  history = [];
  foreign = new Set();
}
