import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServerConfig } from './mcpClient.js';

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  skills?: string;
  mcpServers?: Record<string, McpServerEntry>;
}

type McpServerEntry =
  | { transport?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { transport: 'http'; url: string };

export interface LoadedPlugin {
  manifest: PluginManifest;
  dir: string;
  mcpServers: McpServerConfig[];
}

export function loadPlugins(pluginsRoot: string): LoadedPlugin[] {
  if (!existsSync(pluginsRoot)) return [];
  const out: LoadedPlugin[] = [];
  for (const entry of readdirSync(pluginsRoot)) {
    const dir = join(pluginsRoot, entry);
    const manifestPath = join(dir, 'plugin.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const raw = readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(raw) as PluginManifest;
      if (typeof manifest.name !== 'string') continue;
      const mcpServers: McpServerConfig[] = [];
      if (manifest.mcpServers) {
        for (const [name, cfg] of Object.entries(manifest.mcpServers)) {
          if ('url' in cfg) {
            mcpServers.push({ name, url: (cfg as { url: string }).url, transport: 'http' });
          } else {
            const c = cfg as { command: string; args?: string[]; env?: Record<string, string> };
            mcpServers.push({ name, command: c.command, args: c.args, env: c.env, transport: 'stdio' });
          }
        }
      }
      out.push({ manifest, dir, mcpServers });
    } catch {
      // skip malformed
    }
  }
  return out;
}
