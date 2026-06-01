import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';

export interface Artifact {
  id: string;
  projectId: string;
  createdByTurn: string;
  kind: 'vue-sfc' | 'page-graph' | 'design-tokens';
  name: string;
  payloadPath: string;
  metadata: Record<string, unknown> | null;
  supersededBy: string | null;
  createdAt: string;
}

export function useArtifacts(projectId: string | null, kind: Artifact['kind']): {
  artifacts: Artifact[];
  latest: Artifact | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await api<{ artifacts: Artifact[] }>(`/api/projects/${projectId}/artifacts?kind=${kind}`);
      setArtifacts(r.artifacts);
    } finally {
      setLoading(false);
    }
  }, [projectId, kind]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { artifacts, latest: artifacts[0] ?? null, loading, refresh };
}

export async function fetchArtifactPayload<T = unknown>(projectId: string, artifactId: string): Promise<T> {
  const token = localStorage.getItem('db_session_token');
  const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactId}/payload`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('json')) return await res.json() as T;
  return await res.text() as unknown as T;
}
