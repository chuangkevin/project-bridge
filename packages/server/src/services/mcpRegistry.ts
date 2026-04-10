import { randomUUID } from 'crypto';
import db from '../db/connection';

export type McpTransport = 'http';
export type McpScope = 'consultant';

export interface McpServerRecord {
  id: string;
  name: string;
  transport: McpTransport;
  endpoint: string;
  enabled: boolean;
  scope: McpScope;
  allowedTools: string[];
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

const MCP_SETTINGS_KEY = 'mcp_servers';

function parseServers(raw: string | null | undefined): McpServerRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => normalizeRecord(item))
      .filter((item): item is McpServerRecord => !!item);
  } catch {
    return [];
  }
}

function normalizeRecord(item: any): McpServerRecord | null {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.endpoint !== 'string') return null;
  return {
    id: item.id,
    name: item.name,
    transport: 'http',
    endpoint: item.endpoint,
    enabled: item.enabled !== false,
    scope: 'consultant',
    allowedTools: Array.isArray(item.allowedTools) ? item.allowedTools.filter((tool: unknown) => typeof tool === 'string') : [],
    timeoutMs: typeof item.timeoutMs === 'number' && item.timeoutMs >= 1000 ? item.timeoutMs : 15000,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
  };
}

function saveServers(servers: McpServerRecord[]): void {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(MCP_SETTINGS_KEY, JSON.stringify(servers));
}

export function listMcpServers(): McpServerRecord[] {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(MCP_SETTINGS_KEY) as { value?: string } | undefined;
  return parseServers(row?.value).sort((a, b) => a.name.localeCompare(b.name));
}

export function getMcpServer(id: string): McpServerRecord | null {
  return listMcpServers().find(server => server.id === id) || null;
}

export function listEnabledMcpServers(scope: McpScope = 'consultant'): McpServerRecord[] {
  return listMcpServers().filter(server => server.enabled && server.scope === scope);
}

export function upsertMcpServer(input: {
  id?: string;
  name: string;
  endpoint: string;
  enabled?: boolean;
  allowedTools?: string[];
  timeoutMs?: number;
}): McpServerRecord {
  const servers = listMcpServers();
  const now = new Date().toISOString();
  const normalized: McpServerRecord = {
    id: input.id || randomUUID(),
    name: input.name.trim(),
    transport: 'http',
    endpoint: input.endpoint.trim(),
    enabled: input.enabled !== false,
    scope: 'consultant',
    allowedTools: (input.allowedTools || []).map(tool => tool.trim()).filter(Boolean),
    timeoutMs: input.timeoutMs && input.timeoutMs >= 1000 ? input.timeoutMs : 15000,
    createdAt: now,
    updatedAt: now,
  };

  const existingIndex = servers.findIndex(server => server.id === normalized.id);
  if (existingIndex >= 0) {
    normalized.createdAt = servers[existingIndex].createdAt;
    servers[existingIndex] = { ...normalized, updatedAt: now };
    saveServers(servers);
    return servers[existingIndex];
  }

  servers.push(normalized);
  saveServers(servers);
  return normalized;
}

export function deleteMcpServer(id: string): boolean {
  const servers = listMcpServers();
  const next = servers.filter(server => server.id !== id);
  if (next.length === servers.length) return false;
  saveServers(next);
  return true;
}
