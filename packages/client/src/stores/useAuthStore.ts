/**
 * Auth store (M1 anonymous mode).
 *
 * There is no per-user login. The store tracks two independent concepts:
 *
 *   1. `userIdentity` — a purely client-side display name, persisted in
 *      localStorage. Lets the user put a name on the chat bubble; never
 *      sent to the server.
 *   2. `adminToken` — issued by POST /api/auth/verify after the operator
 *      enters the shared admin password. Stored in sessionStorage so it
 *      dies with the tab. Used as a Bearer header by `apiAdmin()` for
 *      admin-only Settings mutations.
 *
 * No hydrate against the server: anonymous projects don't need a server
 * round-trip on page load, and admin status is implied by token presence.
 */

import { create } from 'zustand';
import { api, apiAdmin, getAdminToken, setAdminToken } from '../lib/api';

const USER_NAME_KEY = 'designbridge.user_name';

interface State {
  userIdentity: string;
  adminToken: string | null;
  adminStatus: 'unknown' | 'unset' | 'set';
  setUserIdentity: (name: string) => void;
  refreshAdminStatus: () => Promise<void>;
  setupAdmin: (password: string) => Promise<void>;
  verifyAdmin: (password: string) => Promise<void>;
  changeAdmin: (oldPassword: string, newPassword: string) => Promise<void>;
  clearAdmin: () => Promise<void>;
}

export const useAuthStore = create<State>((set, get) => ({
  userIdentity: localStorage.getItem(USER_NAME_KEY) ?? '',
  adminToken: getAdminToken(),
  adminStatus: 'unknown',

  setUserIdentity: (name: string) => {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(USER_NAME_KEY, trimmed);
    else localStorage.removeItem(USER_NAME_KEY);
    set({ userIdentity: trimmed });
  },

  refreshAdminStatus: async () => {
    try {
      const r = await api<{ hasAdminPassword: boolean }>('/api/auth/status');
      set({ adminStatus: r.hasAdminPassword ? 'set' : 'unset' });
    } catch {
      set({ adminStatus: 'unknown' });
    }
  },

  setupAdmin: async (password: string) => {
    const r = await api<{ ok: boolean; token: string }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    setAdminToken(r.token);
    set({ adminToken: r.token, adminStatus: 'set' });
  },

  verifyAdmin: async (password: string) => {
    const r = await api<{ ok: boolean; token: string }>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    setAdminToken(r.token);
    set({ adminToken: r.token, adminStatus: 'set' });
  },

  changeAdmin: async (oldPassword: string, newPassword: string) => {
    await apiAdmin('/api/auth/change', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    // After a password change, force a re-verify so the next admin action picks
    // up a fresh token. The old token stays valid until expiry server-side.
    await get().verifyAdmin(newPassword);
  },

  clearAdmin: async () => {
    try { await apiAdmin('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setAdminToken(null);
    set({ adminToken: null });
  },
}));
