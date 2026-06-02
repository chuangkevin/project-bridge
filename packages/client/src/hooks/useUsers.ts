import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  is_active: number;
  created_at: string;
}

export type UsersState =
  | { kind: 'loading' }
  | { kind: 'forbidden'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; users: AdminUser[] };

export function useUsers() {
  const [state, setState] = useState<UsersState>({ kind: 'loading' });

  const refresh = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await api<{ users: AdminUser[] }>('/api/users');
      setState({ kind: 'ok', users: r.users });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setState({ kind: 'forbidden', message: '需要管理員權限' });
      } else {
        setState({ kind: 'error', message: (e as Error).message });
      }
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const create = useCallback(async (input: { name: string; email: string; password: string }) => {
    await api('/api/users', { method: 'POST', body: JSON.stringify(input) });
    await refresh();
  }, [refresh]);

  const disable = useCallback(async (id: string) => {
    await api(`/api/users/${encodeURIComponent(id)}/disable`, { method: 'PATCH' });
    await refresh();
  }, [refresh]);

  const enable = useCallback(async (id: string) => {
    await api(`/api/users/${encodeURIComponent(id)}/enable`, { method: 'PATCH' });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await api(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
  }, [refresh]);

  const transferAdmin = useCallback(async (targetUserId: string) => {
    await api('/api/users/transfer-admin', { method: 'POST', body: JSON.stringify({ targetUserId }) });
    await refresh();
  }, [refresh]);

  return { state, refresh, create, disable, enable, remove, transferAdmin };
}
