import { create } from 'zustand';
import { api, getToken, setToken } from '../lib/api';
import { closeSocket } from '../lib/socket';

interface User { id: string; name: string; email: string; }

interface State {
  user: User | null;
  loading: boolean;
  setup: (input: { name: string; email: string; password: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<State>((set) => ({
  user: null,
  loading: true,
  setup: async (input) => {
    const r = await api<{ token: string; user: User }>('/api/auth/setup', { method: 'POST', body: JSON.stringify(input) });
    setToken(r.token);
    set({ user: r.user, loading: false });
  },
  login: async (email, password) => {
    const r = await api<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setToken(r.token);
    set({ user: r.user, loading: false });
  },
  logout: async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setToken(null);
    closeSocket();
    set({ user: null, loading: false });
  },
  hydrate: async () => {
    if (!getToken()) { set({ user: null, loading: false }); return; }
    try {
      const user = await api<User>('/api/auth/me');
      set({ user, loading: false });
    } catch {
      setToken(null);
      set({ user: null, loading: false });
    }
  },
}));
