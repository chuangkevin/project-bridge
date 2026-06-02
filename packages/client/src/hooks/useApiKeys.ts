import { useCallback, useEffect, useState } from 'react';
import { apiAdmin as api } from '../lib/api';

export interface ApiKeyInfo {
  suffix: string;
  fromEnv: boolean;
  today: { calls: number; tokens: number };
  total: { calls: number; tokens: number };
}

export interface BatchAddResult {
  added: number;
  skipped: number;
  totalLines: number;
}

export function useApiKeys() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ keys: ApiKeyInfo[] }>('/api/settings/api-keys');
      setKeys(r.keys);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const add = useCallback(async (apiKey: string) => {
    await api('/api/settings/api-keys', { method: 'POST', body: JSON.stringify({ apiKey }) });
    await refresh();
  }, [refresh]);

  const addBatch = useCallback(async (text: string): Promise<BatchAddResult> => {
    const r = await api<{ ok: true } & BatchAddResult>('/api/settings/api-keys/batch', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    await refresh();
    return { added: r.added, skipped: r.skipped, totalLines: r.totalLines };
  }, [refresh]);

  const remove = useCallback(async (suffix: string) => {
    await api(`/api/settings/api-keys/${encodeURIComponent(suffix)}`, { method: 'DELETE' });
    await refresh();
  }, [refresh]);

  return { keys, loading, error, refresh, add, addBatch, remove };
}
