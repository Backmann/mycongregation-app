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
  pushApi,
} from './api';
import { Platform } from 'react-native';
import { detachWebPush } from './web-push';
import { rememberedPushToken, rememberPushToken } from './push-token-store';

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

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  adoptSession: (
    accessToken: string,
    refreshToken: string | undefined,
    user: AuthUser,
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
      if (!signedInRef.current) return;
      void forgetCache();
      setUser(null);
      router.replace('/(auth)/login');
    });
    return () => {
      setOnAuthFailure(null);
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
      try {
        const me = await authApi.me();
        if (alive) setUser(me);
      } catch {
        // Nothing usable: no cookie, or both it and the access token are dead.
        await clearAuthTokens();
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
    } = await authApi.login(email, password);
    await storeAuthTokens(accessToken, refreshToken);
    await forgetCache();
    setUser(authUser);
  }, [forgetCache]);

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
    ) => {
      await storeAuthTokens(accessToken, refreshToken);
      await forgetCache();
      setUser(authUser);
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
    await forgetCache();
    setUser(null);
  }, [forgetCache]);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, adoptSession, signOut }}>
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
