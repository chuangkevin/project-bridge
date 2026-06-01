import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

export function useSetting(key: string): {
  value: string | null;
  present: boolean;
  loading: boolean;
  save: (v: string) => Promise<void>;
  remove: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [value, setValue] = useState<string | null>(null);
  const [present, setPresent] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ value: string | null; present: boolean }>(`/api/settings/${encodeURIComponent(key)}`);
      setValue(r.value);
      setPresent(r.present);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (v: string) => {
    await api(`/api/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value: v }) });
    await refresh();
  }, [key, refresh]);

  const remove = useCallback(async () => {
    await api(`/api/settings/${encodeURIComponent(key)}`, { method: 'DELETE' });
    await refresh();
  }, [key, refresh]);

  return { value, present, loading, save, remove, refresh };
}
