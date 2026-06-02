import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export interface McpHttpServer {
  id: string;
  name: string;
  transport: 'http';
  endpoint: string;
  enabled: boolean;
  scope: string;
  useRecommendedTools: boolean;
  allowedTools: string[];
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface McpTestResult {
  ok: boolean;
  serverInfo?: { name?: string; version?: string };
  protocolVersion?: string;
  error?: string;
}

export interface McpToolInfo {
  name: string;
  description?: string;
}

export interface McpUpsertInput {
  id?: string;
  name: string;
  endpoint: string;
  enabled?: boolean;
  useRecommendedTools?: boolean;
  allowedTools?: string[];
  timeoutMs?: number;
}

export function useMcpServers() {
  const [servers, setServers] = useState<McpHttpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ servers: McpHttpServer[] }>('/api/mcp/servers');
      setServers(r.servers);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const create = useCallback(async (input: McpUpsertInput) => {
    await api('/api/mcp/servers', { method: 'POST', body: JSON.stringify(input) });
    await refresh();
  }, [refresh]);

  const update = useCallback(async (id: string, input: McpUpsertInput) => {
    await api(`/api/mcp/servers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await api(`/api/mcp/servers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
  }, [refresh]);

  const test = useCallback(async (id: string): Promise<McpTestResult> => {
    return await api<McpTestResult>(`/api/mcp/servers/${encodeURIComponent(id)}/test`, { method: 'POST', body: JSON.stringify({}) });
  }, []);

  const listTools = useCallback(async (id: string): Promise<McpToolInfo[]> => {
    const r = await api<{ tools: McpToolInfo[] }>(`/api/mcp/servers/${encodeURIComponent(id)}/tools`);
    return r.tools;
  }, []);

  return { servers, loading, error, refresh, create, update, remove, test, listTools };
}
