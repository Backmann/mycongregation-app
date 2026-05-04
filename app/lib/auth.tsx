import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { storage } from './storage';
import { authApi, AuthUser, TOKEN_KEY } from './api';

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

  // On mount: try to load current user from existing token
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
        // Token invalid/expired
        await storage.removeItem(TOKEN_KEY);
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { accessToken, user: authUser } = await authApi.login(
      email,
      password,
    );
    await storage.setItem(TOKEN_KEY, accessToken);
    setUser(authUser);
  }, []);

  const signOut = useCallback(async () => {
    await storage.removeItem(TOKEN_KEY);
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
