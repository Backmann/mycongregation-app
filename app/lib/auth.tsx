import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { storage } from './storage';
import {
  authApi,
  AuthUser,
  TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  storeAuthTokens,
  clearAuthTokens,
  mayHaveSession,
  setOnAuthFailure,
  setOnReachability,
  pushApi,
} from './api';
import { AppState, Platform } from 'react-native';
import { sessionVerdict } from './session-verdict';
import { detachWebPush } from './web-push';
import { rememberedPushToken, rememberPushToken } from './push-token-store';
import { adoptLanguage } from './i18n';
import { beginWelcome, forgetWelcome, restoreWelcome } from './welcome';

/**
 * A device where nobody chose a language takes the account's. Where somebody
 * did choose, the choice stands — and is handed to the account, so that the
 * letters and notifications it sends arrive in the language the person reads
 * the app in. Best effort: a sign-in never waits on it or fails for it.
 */
async function settleLanguage(authUser: AuthUser): Promise<void> {
  try {
    const used = await adoptLanguage(authUser.uiLanguage);
    if (authUser.uiLanguage && used !== authUser.uiLanguage) {
      await authApi.setUiLanguage(used);
    }
  } catch {
    // The screen language is already right; the account catches up next time.
  }
}

/** Best effort, and never a reason for signing out to fail. */
async function detachThisDevice(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await detachWebPush();
      return;
    }
    const token = rememberedPushToken();
    if (token) await pushApi.unregister(token);
    rememberPushToken(null);
  } catch {
    // The server prunes dead tokens on its own; the sign-out goes ahead.
  }
}

/**
 * Who was signed in here last — remembered so the app can be OPENED when the
 * server cannot be reached.
 *
 * It grants nothing: every request is still judged by the server, and what
 * is kept is what «Профиль» shows anyway. It is what lets a brother open the
 * programme in a hall with no signal instead of being shown «Войти» — and it
 * is forgotten the moment he signs out or the server refuses the session.
 */
const USER_KEY = 'mycongregation.user';

async function rememberUser(user: AuthUser): Promise<void> {
  try {
    await storage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // The app still works; it just cannot be opened without the server.
  }
}

async function recallUser(): Promise<AuthUser | null> {
  try {
    const raw = await storage.getItem(USER_KEY);
    const user = raw ? (JSON.parse(raw) as AuthUser) : null;
    return user && typeof user.id === 'string' ? user : null;
  } catch {
    return null;
  }
}

async function forgetUser(): Promise<void> {
  try {
    await storage.removeItem(USER_KEY);
  } catch {
    // Nothing to forget, then.
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  /**
   * The server could not be reached when the session was last checked. With
   * a `user` it means «opened from memory, not yet confirmed»; without one,
   * «nobody remembered here and nobody can be asked» — which is not the same
   * as signed out, and must not be drawn as «Войти».
   */
  unreachable: boolean;
  /** Ask the server again, now. */
  retryConnection: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  adoptSession: (
    accessToken: string,
    refreshToken: string | undefined,
    user: AuthUser,
    /** What the server said about this entry — see lib/welcome.ts. */
    entry?: { firstSignIn?: boolean },
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  /** Whether anybody is signed in right now — read by the failure callback. */
  const signedInRef = useRef(false);
  useEffect(() => {
    signedInRef.current = user !== null;
  }, [user]);
  const queryClient = useQueryClient();

  /**
   * Forget everything the previous person was shown.
   *
   * The query cache lives as long as the page (or the app process), and no
   * key names the person it belongs to. Until 30 September nothing emptied
   * it, so whoever signed in next on the same device was served the last
   * person's answers — «Мои назначения» of an administrator, the full list of
   * people — without a single request, for as long as `staleTime` allowed.
   *
   * So the cache is emptied every time the person changes: on the way out,
   * when the session dies under us, and on the way in (the way in covers a
   * session that ended without passing through here). Running fetches are
   * cancelled first, so an answer for the old person cannot land after.
   */
  const forgetCache = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);

  // Register a callback so the api response interceptor can clear UI state
  // and redirect to /login when refresh also fails (both tokens dead).
  //
  // ONLY for somebody who was signed in. On the web every visitor is asked
  // «is there a session?» at start (the cookie cannot be seen, so we try),
  // and for a visitor who has none that question ends in this very callback.
  // It then threw him to the sign-in screen from wherever he had arrived —
  // and where an invited person arrives is the link in the letter. Since the
  // cookie switch of 21 July, every invitation and every password link
  // opened in a browser — which is every iPhone — landed on «Войти», asking
  // for a password that did not exist yet (found 7 October 2026, on the
  // stand: /invite, /reset-password and /forgot-password all ended at
  // /login). A visitor who was never in has nothing to be thrown out of.
  useEffect(() => {
    setOnAuthFailure(() => {
      // The server has refused the session: nobody is remembered here any
      // more, signed in on screen or not.
      void forgetUser();
      setUnreachable(false);
      if (!signedInRef.current) return;
      void forgetCache();
      setUser(null);
      router.replace('/(auth)/login');
    });
    // Said by the renewal of the session, the one place that knows.
    setOnReachability((reached) => setUnreachable(!reached));
    return () => {
      setOnAuthFailure(null);
      setOnReachability(null);
    };
  }, [forgetCache]);

  // On mount: work out whether there is still a session.
  //
  // On a device a token is sitting in secure storage, so its absence means
  // nobody is signed in. On the web there is deliberately nothing stored: the
  // refresh token is in an httpOnly cookie we cannot see and the access token
  // died with the last page. So we simply ask — the request carries the cookie
  // if the browser still has one, and a 401 means there is no session. This is
  // the round trip that the cookie switch costs us, and it is why the app
  // shows a moment of loading after a reload.
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await storage.getItem(TOKEN_KEY);
      if (!token && !mayHaveSession()) {
        if (alive) setIsLoading(false);
        return;
      }
      // WHOEVER WAS SIGNED IN HERE LAST IS LET IN AT ONCE, from memory, and
      // the server is asked alongside. Waiting for its answer first meant a
      // spinner for as long as a bad connection cared to take — up to half a
      // minute of retries — before the person saw anything at all. The
      // memory grants nothing: every request is still judged by the server,
      // and its refusal signs the person out a moment later (below, and in
      // the api interceptor).
      const remembered = await recallUser();
      if (remembered && alive) {
        await restoreWelcome(remembered.id);
        setUser(remembered);
        setIsLoading(false);
      }
      try {
        const me = await authApi.me();
        if (alive) {
          await restoreWelcome(me.id);
          await rememberUser(me);
          setUser(me);
          void settleLanguage(me);
        }
      } catch (error) {
        if (sessionVerdict(error) === 'refused') {
          // Nothing usable: no cookie, or the server ended the session.
          await clearAuthTokens();
          await forgetUser();
          if (alive) setUser(null);
        } else if (alive) {
          // THE SERVER COULD NOT BE ASKED. Until 7 October 2026 this branch
          // did not exist: any failure here wiped the keys, so opening the
          // app in a hall with no signal — or in the half-minute the server
          // restarts after an update — signed the person out, on a phone for
          // good. The keys stay, the person stays (if anybody is remembered),
          // and the server is asked again as soon as it answers.
          setUnreachable(true);
        }
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const {
      accessToken,
      refreshToken,
      user: authUser,
      firstSignIn,
    } = await authApi.login(email, password);
    await storeAuthTokens(accessToken, refreshToken);
    await forgetCache();
    forgetWelcome();
    if (firstSignIn) await beginWelcome(authUser.id);
    else await restoreWelcome(authUser.id);
    await rememberUser(authUser);
    setUnreachable(false);
    setUser(authUser);
    void settleLanguage(authUser);
  }, [forgetCache]);

  /**
   * While the server cannot be reached it is asked again — every quarter of
   * a minute, the moment the app comes back to the front, and when the
   * person presses «Повторить». Its first answer confirms a session opened
   * from memory and loads afresh everything that failed in the meantime.
   */
  const confirm = useCallback(async () => {
    try {
      const me = await authApi.me();
      await rememberUser(me);
      setUser(me);
      setUnreachable(false);
      void settleLanguage(me);
      // Whatever was asked for while there was no connection is asked again;
      // nobody should have to pull every screen down by hand.
      void queryClient.invalidateQueries();
    } catch (error) {
      if (sessionVerdict(error) === 'refused') {
        // The interceptor has signed a remembered person out already; this
        // covers the start where nobody was remembered at all.
        await clearAuthTokens();
        await forgetUser();
        setUnreachable(false);
        }
      // Still unreachable: ask again later.
    }
  }, [queryClient]);
  useEffect(() => {
    if (!unreachable) return;
    const timer = setInterval(() => void confirm(), 15_000);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void confirm();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [unreachable, confirm]);
  const retryConnection = useCallback(() => void confirm(), [confirm]);

  /**
   * Take up a session the server handed over outside the sign-in form.
   *
   * Today that is the invitation: the password screen finishes and the person
   * is already inside. Deliberately the same two steps signIn takes — store
   * the tokens, remember the user — so there is one way a session begins and
   * not two that drift apart.
   */
  const adoptSession = useCallback(
    async (
      accessToken: string,
      refreshToken: string | undefined,
      authUser: AuthUser,
      entry?: { firstSignIn?: boolean },
    ) => {
      await storeAuthTokens(accessToken, refreshToken);
      await forgetCache();
      forgetWelcome();
      if (entry?.firstSignIn) await beginWelcome(authUser.id);
      else await restoreWelcome(authUser.id);
      await rememberUser(authUser);
      setUnreachable(false);
      setUser(authUser);
      void settleLanguage(authUser);
    },
    [forgetCache],
  );

  const signOut = useCallback(async () => {
    // Tell the server first, so the session stops existing there too — a
    // token cleared only on this device would stay usable for its full life.
    // In cookie mode there is nothing to read here: the browser sends the
    // cookie and the server clears it, so the call is made unconditionally.
    // This device stops receiving for the person who is leaving — while the
    // session can still say so. Nothing did this before, and on a shared
    // phone or tablet his notifications went on arriving for the next person.
    await detachThisDevice();
    const refreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken || mayHaveSession()) {
      await authApi.logout(refreshToken ?? undefined);
    }
    await clearAuthTokens();
    await forgetUser();
    await forgetCache();
    forgetWelcome();
    setUnreachable(false);
    setUser(null);
  }, [forgetCache]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        unreachable,
        retryConnection,
        signIn,
        adoptSession,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
