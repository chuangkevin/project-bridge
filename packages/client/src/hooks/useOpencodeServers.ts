import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface OpencodeConfig {
  servers: string[];
  textModel: string;
  visionModel: string;
  hasPassword: boolean;
}

export interface OpencodeTestResult {
  label: string;
  url: string;
  ok: boolean;
  status: number;
  elapsedMs: number;
  error: string | null;
}

export interface OpencodeModel { id: string; name: string; provider: string; }

export function useOpencodeServers() {
  const [config, setConfig] = useState<OpencodeConfig>({ servers: [], textModel: '', visionModel: '', hasPassword: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<OpencodeConfig>('/api/settings/opencode');
      setConfig(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (next: Partial<{ servers: string[]; textModel: string; visionModel: string }>) => {
    await api('/api/settings/opencode', { method: 'POST', body: JSON.stringify(next) });
    await refresh();
  }, [refresh]);

  const test = useCallback(async (): Promise<{ ok: boolean; results: OpencodeTestResult[]; error?: string }> => {
    return await api<{ ok: boolean; results: OpencodeTestResult[]; error?: string }>('/api/settings/opencode/test', { method: 'POST', body: JSON.stringify({}) });
  }, []);

  const fetchModels = useCallback(async (): Promise<OpencodeModel[]> => {
    const r = await api<{ models: OpencodeModel[] }>('/api/settings/opencode/models');
    return r.models;
  }, []);

  return { config, loading, error, refresh, save, test, fetchModels };
}
