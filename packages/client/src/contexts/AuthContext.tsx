import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface AuthUser {
  id: string;
  name: string;
  role: 'admin' | 'user';
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  hasUsers: boolean | null;
  login: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  setup: (name: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'pb-auth-token';

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

export function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...authHeaders(), ...(init?.headers || {}) };
  return fetch(url, { ...init, headers });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const token = getStoredToken();
      if (!token) {
        setUser(null);
        // Check if system has any users
        const statusRes = await fetch('/api/auth/status');
        if (statusRes.ok) {
          const data = await statusRes.json();
          setHasUsers(data.hasUsers);
        }
        setLoading(false);
        return;
      }

      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setHasUsers(true);
        } else {
          // Token invalid
          localStorage.removeItem(TOKEN_KEY);
          setUser(null);
          const statusRes = await fetch('/api/auth/status');
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            setHasUsers(statusData.hasUsers);
          }
        }
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (userId: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '登入失敗');
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    setHasUsers(true);
  }, []);

  const logout = useCallback(async () => {
    const token = getStoredToken();
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const setup = useCallback(async (name: string) => {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '設定失敗');
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    setHasUsers(true);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, hasUsers, login, logout, setup, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
