import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import {
  router,
  useGlobalSearchParams,
  useNavigationContainerRef,
  usePathname,
  useRootNavigationState,
  useSegments,
} from 'expo-router';
import {
  isTabRoot,
  navHistory,
  planBack,
  recordNav,
  setNavHistory,
  tabOf,
  type NavEntry,
} from '../lib/nav-history';

/**
 * The screen side of lib/nav-history.ts: it writes down every place the
 * person stands, carries out «back», and gives Android's own back button the
 * same meaning as the arrow in the header.
 */

type NavState = { type?: string; index?: number; key?: string; routes?: { name: string; state?: NavState }[] };

/** The stack of the section on screen: how many screens it holds, and its key. */
function focusedStack(root: NavState | undefined): { depth: number; key: string | null } {
  let state: NavState | undefined = root;
  let found = { depth: 1, key: null as string | null };
  while (state && state.routes && state.routes.length > 0) {
    const route = state.routes[state.index ?? state.routes.length - 1];
    if (state.type === 'stack') found = { depth: state.routes.length, key: state.key ?? null };
    if (!route?.state) break;
    state = route.state;
  }
  return found;
}

let rootState: NavState | undefined;
let container: { dispatch: (action: object) => void } | null = null;

/**
 * Going back across sections takes two moves — close the screen, then open
 * the other section — and the first lands for a moment on the screen below.
 * That moment is not a place the person went: it is not written down.
 */
let landing: { path: string; until: number } | null = null;

/** How long a screen stands before it counts as a place the person went. */
const SETTLE_MS = 250;

/** Sections hidden from the bar open from one section each (app/(app)/_layout PARENT_TAB). */
export function backFallback(path: string, parentTab: Record<string, string>): string {
  const tab = tabOf(path);
  if (!isTabRoot(path)) return `/${tab}`;
  return parentTab[tab] ? `/${parentTab[tab]}` : '';
}

/**
 * The navigation state as it is NOW, with every section's own stack in it.
 *
 * What useRootNavigationState gives at render holds the tab navigator and no
 * more: the sections' stacks are not in it (seen on the stand, 21 October
 * 2026, by logging both). So the «stack» measured there was always the root's
 * — depth 1 — and a screen opened from another section was never closed when
 * the person went back: the section's tab then reopened on it. The container
 * knows the whole state.
 */
function liveRoot(): NavState | undefined {
  const c = container as unknown as { getRootState?: () => NavState } | null;
  return c?.getRootState?.() ?? rootState;
}

type TabsState = NavState & { routes?: { name: string; state?: NavState & { routes?: { name: string }[] } }[] };

/** The tab navigator's state, wherever it sits under the root. */
function tabsState(state: NavState | undefined): TabsState | undefined {
  let s: NavState | undefined = state;
  while (s) {
    if (s.type === 'tab') return s as TabsState;
    const r = s.routes?.[s.index ?? 0];
    s = r?.state;
  }
  return undefined;
}

/**
 * A section opens at its first screen (the tab pressed again, or a section
 * whose top screen was opened from elsewhere): its stack is popped to the top,
 * or — when it holds one screen that is not its first, as after «Не готовы N
 * встреч» on Главная — that screen is replaced by the first one (21 October
 * 2026: «я не смог вернуться в раздел программы»).
 */
export function sectionToRoot(tab: string): void {
  const tabs = tabsState(liveRoot());
  const nested = tabs?.routes?.find((r) => r.name === tab)?.state;
  if (!nested?.key || !nested.routes?.length || !container) return;
  if (nested.routes.length > 1) {
    container.dispatch({ type: 'POP_TO_TOP', target: nested.key });
  } else if (nested.routes[0].name !== 'index') {
    container.dispatch({ type: 'RESET', payload: { index: 0, routes: [{ name: 'index' }] }, target: nested.key });
  }
}

/**
 * One step back. Returns false when there is nowhere to go — on Android the
 * system then does what it does from the first screen (leaves the app).
 */
export function performBack(fallback: string | null): boolean {
  const stack = focusedStack(liveRoot());
  const plan = planBack({
    history: navHistory(),
    stackDepth: stack.depth,
    fallback: fallback || null,
  });
  switch (plan.kind) {
    case 'pop':
      router.dismiss();
      return true;
    case 'popTo':
      router.dismissTo(plan.href as never);
      return true;
    case 'leave': {
      const cur = navHistory()[navHistory().length - 1];
      const target = plan.href.split('?')[0];
      // The step being taken back is off the list now; what the person sees
      // between the two moves is not put on it.
      setNavHistory(navHistory().slice(0, -1));
      landing = { path: target, until: Date.now() + 1500 };
      // To the other section first, then the screen left behind is closed in
      // ITS stack — by the stack's key, not «whatever is on screen», which by
      // then is the other section. Done the other way round, the pop landed
      // and the second move was lost (the stand, 19 October 2026).
      router.navigate(plan.href as never);
      if (plan.pop && stack.key && container) {
        const key = stack.key;
        const c = container;
        setTimeout(() => c.dispatch({ type: 'POP', payload: { count: 1 }, target: key }), 0);
      } else if (!plan.pop && stack.depth === 1 && stack.key && container && cur && !isTabRoot(cur.path)) {
        // The screen left behind is the ONLY one in its section's stack (it
        // was opened from another section, and the section's first screen was
        // never under it). Nothing to pop — so the section's first screen
        // takes its place, and the tab opens on it next time (21 October 2026:
        // back from «Составление программы» to «Собрание», then «Программа»
        // showed «Составление программы» again).
        const key = stack.key;
        const c = container;
        setTimeout(
          () => c.dispatch({ type: 'RESET', payload: { index: 0, routes: [{ name: 'index' }] }, target: key }),
          0,
        );
      }
      return true;
    }
    case 'none':
      return false;
  }
}

/**
 * «Back» from a screen's own code — after saving, deleting, «Отмена»: the
 * same step as the header's arrow, and where there is nowhere to step, the
 * screen's section.
 */
export function goBack(fallback: string): void {
  if (!performBack(fallback)) router.replace(fallback as never);
}

/** Mounted once, inside the signed-in app. */
export function NavHistoryTracker({ parentTab }: { parentTab: Record<string, string> }) {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();
  const state = useRootNavigationState() as unknown as NavState | undefined;
  rootState = state;
  const ref = useNavigationContainerRef();
  container = ref as unknown as { dispatch: (action: object) => void };

  // The query, without the values that are the route's own segments ([id]).
  const dynamic = new Set(
    (segments as string[]).filter((s) => /^\[.+\]$/.test(s)).map((s) => s.replace(/^\[\.{0,3}|\]$/g, '')),
  );
  const query = Object.entries(params)
    .filter(([k, v]) => !dynamic.has(k) && v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : String(v))}`)
    .sort()
    .join('&');

  // Written down once the screen has stood for a moment. Opening a screen
  // of another section passes through that section's first screen on the
  // way («/publishers», then «/publishers/duties-meeting»); that passing
  // frame is no place the person stood, and back must not stop at it.
  useEffect(() => {
    if (!pathname) return;
    const entry: NavEntry = { path: pathname, query };
    const id = setTimeout(() => {
      if (landing) {
        if (Date.now() > landing.until) landing = null;
        else if (pathname !== landing.path) return;
        else landing = null;
      }
      recordNav(entry);
    }, SETTLE_MS);
    return () => clearTimeout(id);
  }, [pathname, query]);

  // Android's own back button means what the header's arrow means.
  const parentRef = useRef(parentTab);
  parentRef.current = parentTab;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const cur = navHistory()[navHistory().length - 1];
      return performBack(cur ? backFallback(cur.path, parentRef.current) : null);
    });
    return () => sub.remove();
  }, []);

  return null;
}
