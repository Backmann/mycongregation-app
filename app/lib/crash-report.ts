import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * THE JOURNAL OF FAILURES (10 November 2026): a failure on someone's phone
 * used to reach us only if he told us. A screen that falls over
 * (components/ScreenFailure.tsx) and an error nobody caught are now sent to
 * the server's journal, where an administrator reads them on «Сбои».
 *
 * What is sent — and nothing more: which kind (a screen, or uncaught), the
 * platform, the build, the screen as its route pattern («/schedule/[id]»,
 * from the route's file names — never the address with its ids), the role,
 * the error's words and the first lines of where in the code. Mail
 * addresses, ids, phone numbers and long tokens are cut out here, and again
 * on the server. No name, login, congregation, nothing typed or shown.
 *
 * The same failure is sent once per session; a report that cannot be sent is
 * dropped — a journal must never become a failure of its own.
 */

const API = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

let route = '/';
let role: string | null = null;

/** The screen now shown, as its pattern — set by the root layout. */
export function setCrashRoute(pattern: string): void {
  route = pattern || '/';
}

/** The role of whoever is signed in, or null — set by the sign-in. */
export function setCrashRole(r: string | null | undefined): void {
  role = r ?? null;
}

/** The route's pattern from its segments: groups like «(app)» left out. */
export function patternOf(segments: readonly string[]): string {
  return '/' + segments.filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/');
}

export function scrubText(text: string, max: number): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<mail>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .replace(/\+?\d[\d\s/().-]{6,}\d/g, '<num>')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '<token>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

let webBuild: Promise<string | null> | null = null;

/** The build as this device runs it: the update's id on a phone, the commit on the web. */
async function buildOf(): Promise<string | null> {
  if (Platform.OS !== 'web') {
    if (Updates.updateId) return Updates.updateId.slice(0, 8);
    return Constants.expoConfig?.version ? `v${Constants.expoConfig.version}` : null;
  }
  webBuild ??= fetch('/build-info.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { commit?: string } | null) => (j?.commit ? j.commit.slice(0, 12) : null))
    .catch(() => null);
  return webBuild;
}

const sent = new Set<string>();

export async function reportCrash(source: 'screen' | 'uncaught', error: unknown): Promise<void> {
  try {
    if (!API) return;
    const e = error instanceof Error ? error : new Error(String(error));
    const message = scrubText(`${e.name}: ${e.message}`, 300);
    const stack = e.stack ? scrubText(e.stack.split('\n').slice(0, 6).join('\n'), 1500) : undefined;
    const key = `${source}|${route}|${message}`;
    if (sent.has(key)) return;
    sent.add(key);
    const platform = Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android';
    await fetch(`${API}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform,
        source,
        route,
        message,
        stack,
        appCommit: (await buildOf()) ?? undefined,
        role: role ?? undefined,
      }),
    });
  } catch {
    // A journal that cannot be reached is not a failure to report.
  }
}

let installed = false;

/** Errors nobody caught: the browser's two events, and the phone's global handler. */
export function installCrashHandlers(): void {
  if (installed) return;
  installed = true;
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (ev) => void reportCrash('uncaught', ev.error ?? ev.message));
    window.addEventListener('unhandledrejection', (ev) => void reportCrash('uncaught', ev.reason));
    return;
  }
  const g = globalThis as {
    ErrorUtils?: {
      getGlobalHandler: () => (e: unknown, fatal?: boolean) => void;
      setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void;
    };
  };
  const eu = g.ErrorUtils;
  if (!eu) return;
  const previous = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => {
    void reportCrash('uncaught', e);
    previous(e, fatal);
  });
}
