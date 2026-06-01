import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';

export interface Turn {
  id: string;
  projectId: string;
  mode: 'consult' | 'architect' | 'design';
  userText: string;
  aiResponse: { text: string; thinking?: string };
  skillsUsed?: string[];
  createdAt: string;
}

export function useTurns(projectId: string | null): {
  turns: Turn[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await api<{ turns: Turn[] }>(`/api/projects/${projectId}/turns`);
      setTurns(r.turns);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { turns, loading, refresh };
}
