/**
 * mcpHttpRegistry.ts — DB-backed CRUD for HTTP MCP server records.
 *
 * Stored as a JSON blob in `settings.mcp_servers` (single row). This is the
 * "user-configurable" set, distinct from the plugin-loaded stdio MCPs in
 * services/mcpRegistry.ts which are loaded from plugin manifests.
 *
 * Ported from the legacy implementation; kept compatible with the legacy
 * blob shape so an upgrade preserves user-configured servers.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { readSetting, writeSetting } from './settings.js';

export type McpScope = 'consultant';

export interface McpHttpServerRecord {
  id: string;
  name: string;
  transport: 'http';
  endpoint: string;
  enabled: boolean;
  scope: McpScope;
  useRecommendedTools: boolean;
  allowedTools: string[];
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

const MCP_SETTINGS_KEY = 'mcp_servers';
const RECOMMENDED_TOOLS_BY_SERVER: Record<string, string[]> = {
  'mssql-mcp': ['get-table-schema', 'list-all-tables'],
};

export function getRecommendedTools(name: string): string[] {
  return RECOMMENDED_TOOLS_BY_SERVER[name.trim().toLowerCase()] ?? [];
}

export function mcpSupportsRecommendedTools(name: string): boolean {
  return getRecommendedTools(name).length > 0;
}

function parseBlob(raw: string | null | undefined): McpHttpServerRecord[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalize).filter((x): x is McpHttpServerRecord => x !== null);
  } catch {
    return [];
  }
}

function normalize(item: unknown): McpHttpServerRecord | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.endpoint !== 'string') return null;
  const explicit = Array.isArray(o.allowedTools) ? o.allowedTools.filter((t): t is string => typeof t === 'string') : [];
  const useRecommendedTools = o.useRecommendedTools === true;
  return {
    id: o.id,
    name: o.name,
    transport: 'http',
    endpoint: o.endpoint,
    enabled: o.enabled !== false,
    scope: 'consultant',
    useRecommendedTools,
    allowedTools: useRecommendedTools ? getRecommendedTools(o.name) : explicit,
    timeoutMs: typeof o.timeoutMs === 'number' && o.timeoutMs >= 1000 ? o.timeoutMs : 15000,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
  };
}

function saveAll(db: Database.Database, servers: McpHttpServerRecord[]): void {
  writeSetting(db, MCP_SETTINGS_KEY, JSON.stringify(servers));
}

export function listMcpHttpServers(db: Database.Database): McpHttpServerRecord[] {
  return parseBlob(readSetting(db, MCP_SETTINGS_KEY)).sort((a, b) => a.name.localeCompare(b.name));
}

export function getMcpHttpServer(db: Database.Database, id: string): McpHttpServerRecord | null {
  return listMcpHttpServers(db).find(s => s.id === id) ?? null;
}

export interface UpsertMcpHttpInput {
  id?: string;
  name: string;
  endpoint: string;
  enabled?: boolean;
  useRecommendedTools?: boolean;
  allowedTools?: string[];
  timeoutMs?: number;
}

export function upsertMcpHttpServer(db: Database.Database, input: UpsertMcpHttpInput): McpHttpServerRecord {
  const servers = listMcpHttpServers(db);
  const now = new Date().toISOString();
  const explicit = (input.allowedTools ?? []).map(t => t.trim()).filter(Boolean);
  const recommended = input.useRecommendedTools === true && mcpSupportsRecommendedTools(input.name);
  const record: McpHttpServerRecord = {
    id: input.id ?? randomUUID(),
    name: input.name.trim(),
    transport: 'http',
    endpoint: input.endpoint.trim(),
    enabled: input.enabled !== false,
    scope: 'consultant',
    useRecommendedTools: recommended,
    allowedTools: recommended ? getRecommendedTools(input.name) : explicit,
    timeoutMs: input.timeoutMs && input.timeoutMs >= 1000 ? input.timeoutMs : 15000,
    createdAt: now,
    updatedAt: now,
  };
  const idx = servers.findIndex(s => s.id === record.id);
  if (idx >= 0) {
    record.createdAt = servers[idx].createdAt;
    servers[idx] = record;
  } else {
    servers.push(record);
  }
  saveAll(db, servers);
  return record;
}

export function deleteMcpHttpServer(db: Database.Database, id: string): boolean {
  const servers = listMcpHttpServers(db);
  const next = servers.filter(s => s.id !== id);
  if (next.length === servers.length) return false;
  saveAll(db, next);
  return true;
}
