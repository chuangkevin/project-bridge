import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';

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
  requireAuth: () => Promise<AuthUser | null>; // show picker if not logged in
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

// ─── User Picker Modal ───────────────────────────────────────────────────────

interface UserPickerModalProps {
  onPick: (userId: string) => void;
  onCancel: () => void;
}

function UserPickerModal({ onPick, onCancel }: UserPickerModalProps) {
  const [users, setUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);

  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setUsers(data.filter((u: any) => u.is_active !== false));
        setHasUsers(data.length > 0);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const endpoint = !hasUsers ? '/api/auth/setup' : '/api/users';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || '建立失敗');
      // If setup, token is already in response
      if (data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
        onPick(data.user.id);
      } else {
        onPick(data.id);
      }
    } finally {
      setCreating(false);
    }
  };

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  };
  const modal: React.CSSProperties = {
    background: '#fff', borderRadius: 12, padding: '28px 32px', minWidth: 320,
    maxWidth: 420, width: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
  };
  const btn: React.CSSProperties = {
    width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none',
    background: '#8E6FA7', color: '#fff', fontSize: 15, cursor: 'pointer',
    marginBottom: 8, textAlign: 'left',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid #D5D5D5',
    borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
  };

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#333' }}>請選擇使用者</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#666' }}>這個操作需要識別身分</p>

        {loading ? (
          <p style={{ color: '#999', fontSize: 14 }}>載入中…</p>
        ) : users.length > 0 ? (
          <>
            {users.map(u => (
              <button key={u.id} style={btn} onClick={() => onPick(u.id)}>
                {u.name}
                {u.role === 'admin' && <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.7 }}>管理員</span>}
              </button>
            ))}
            <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #eee' }} />
          </>
        ) : null}

        <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>
          {!hasUsers ? '建立第一個管理員帳號' : '建立新使用者'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={inputStyle} placeholder="輸入名稱" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          <button onClick={handleCreate} disabled={creating || !newName.trim()}
            style={{ ...btn, width: 'auto', marginBottom: 0, padding: '8px 16px', background: creating ? '#ccc' : '#8E6FA7' }}>
            建立
          </button>
        </div>
        <button onClick={onCancel}
          style={{ marginTop: 12, background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 13 }}>
          取消（以匿名繼續）
        </button>
      </div>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const resolvePickerRef = useRef<((u: AuthUser | null) => void) | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const token = getStoredToken();
      if (!token) {
        setUser(null);
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
          localStorage.removeItem(TOKEN_KEY);
          setUser(null);
          const statusRes = await fetch('/api/auth/status');
          if (statusRes.ok) {
            const d = await statusRes.json();
            setHasUsers(d.hasUsers);
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

  useEffect(() => { refreshUser(); }, [refreshUser]);

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

  // Call this before any action that needs identity.
  // Returns the logged-in user (existing or just picked), or null if cancelled.
  const requireAuth = useCallback((): Promise<AuthUser | null> => {
    return new Promise(resolve => {
      const token = getStoredToken();
      if (token && user) {
        resolve(user);
        return;
      }
      // Show picker
      resolvePickerRef.current = resolve;
      setShowPicker(true);
    });
  }, [user]);

  const handlePickerPick = useCallback(async (userId: string) => {
    setShowPicker(false);
    try {
      await login(userId);
      // After login, user state updates asynchronously — read from API directly
      const res = await fetch('/api/auth/me', { headers: authHeaders() });
      const data = await res.json();
      const loggedInUser = data.user as AuthUser;
      setUser(loggedInUser);
      resolvePickerRef.current?.(loggedInUser);
    } catch {
      resolvePickerRef.current?.(null);
    }
    resolvePickerRef.current = null;
  }, [login]);

  const handlePickerCancel = useCallback(() => {
    setShowPicker(false);
    resolvePickerRef.current?.(null);
    resolvePickerRef.current = null;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, hasUsers, login, logout, setup, refreshUser, requireAuth }}>
      {children}
      {showPicker && (
        <UserPickerModal onPick={handlePickerPick} onCancel={handlePickerCancel} />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
