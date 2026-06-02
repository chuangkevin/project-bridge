import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface GlobalSkill {
  name: string;
  description: string;
  layer?: string;
  metadata?: Record<string, unknown>;
}

export interface ExportedSkill {
  filename: string;
  name: string;
  description: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface BatchImportResult {
  added: number;
  updated: number;
  skipped: Array<{ name: string; reason: string }>;
}

export function useSkillsAdmin() {
  const [skills, setSkills] = useState<GlobalSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ skills: GlobalSkill[] }>('/api/skills/global');
      setSkills(r.skills);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const createSingle = useCallback(async (input: { name: string; description: string; body: string; metadata?: Record<string, unknown> }) => {
    await api('/api/skills/global', { method: 'POST', body: JSON.stringify(input) });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (name: string) => {
    await api(`/api/skills/global/${encodeURIComponent(name)}`, { method: 'DELETE' });
    await refresh();
  }, [refresh]);

  const exportAll = useCallback(async (): Promise<{ skills: ExportedSkill[]; exportedAt: string }> => {
    return await api<{ skills: ExportedSkill[]; exportedAt: string }>('/api/skills/global/export');
  }, []);

  const importBatch = useCallback(async (skillsToImport: Array<{ name: string; description?: string; body: string; metadata?: Record<string, unknown> }>): Promise<BatchImportResult> => {
    const r = await api<{ ok: true } & BatchImportResult>('/api/skills/global/batch', {
      method: 'POST',
      body: JSON.stringify({ skills: skillsToImport }),
    });
    await refresh();
    return { added: r.added, updated: r.updated, skipped: r.skipped };
  }, [refresh]);

  return { skills, loading, error, refresh, createSingle, remove, exportAll, importBatch };
}
