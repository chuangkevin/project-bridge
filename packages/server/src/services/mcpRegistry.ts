import type { ConnectedMcp, McpServerConfig } from './mcpClient.js';
import { connectMcp, disconnectMcp, callMcpTool } from './mcpClient.js';

let connections = new Map<string, ConnectedMcp>();

export async function initMcpRegistry(configs: McpServerConfig[]): Promise<void> {
  await Promise.allSettled([...connections.values()].map(disconnectMcp));
  connections = new Map();
  for (const config of configs) {
    try {
      const conn = await connectMcp(config);
      connections.set(config.name, conn);
    } catch (err) {
      console.warn(`[mcp] failed to connect ${config.name}: ${(err as Error).message}`);
    }
  }
}

export interface McpListEntry {
  name: string;
  transport: 'stdio' | 'http';
  connected: boolean;
  tools: { name: string; description?: string }[];
}

export function listMcpServers(): McpListEntry[] {
  return [...connections.values()].map(c => ({
    name: c.config.name,
    transport: c.config.transport,
    connected: true,
    tools: c.tools,
  }));
}

export async function callMcp(server: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
  const c = connections.get(server);
  if (!c) throw new Error(`MCP server '${server}' not connected`);
  return callMcpTool(c, tool, args);
}

export async function reconnectMcp(server: string, configs: McpServerConfig[]): Promise<boolean> {
  const config = configs.find(c => c.name === server);
  if (!config) return false;
  const existing = connections.get(server);
  if (existing) await disconnectMcp(existing).catch(() => undefined);
  try {
    connections.set(server, await connectMcp(config));
    return true;
  } catch {
    return false;
  }
}

export function isConnected(server: string): boolean { return connections.has(server); }
