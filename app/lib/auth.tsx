import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { router } from 'expo-router';
import { storage } from './storage';
import {
  authApi,
  AuthUser,
  TOKEN_KEY,
  storeAuthTokens,
  clearAuthTokens,
  setOnAuthFailure,
} from './api';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Register a callback so the api response interceptor can clear UI state
  // and redirect to /login when refresh also fails (both tokens dead).
  useEffect(() => {
    setOnAuthFailure(() => {
      setUser(null);
      router.replace('/(auth)/login');
    });
    return () => {
      setOnAuthFailure(null);
    };
  }, []);

  // On mount: try to load current user from existing token.
  // If access-token is expired, the interceptor will auto-refresh transparently.
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await storage.getItem(TOKEN_KEY);
      if (!token) {
        if (alive) setIsLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        if (alive) setUser(me);
      } catch {
        // Both access AND refresh failed (interceptor already cleared tokens
        // and called onAuthFailure, but be defensive).
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
    setUser(authUser);
  }, []);

  const signOut = useCallback(async () => {
    await clearAuthTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
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
