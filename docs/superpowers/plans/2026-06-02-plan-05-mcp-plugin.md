# Plan 5 — MCP + Plugin Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Add MCP server connector (stdio + HTTP), plugin.json bundle loader, slash command parser. After this plan, MCP tools are discoverable via `GET /api/mcp`, plugins under `data/skills/plugins/<name>/` register both skills (already loaded by Plan 4 registry) and MCP servers (new), and user prompts with leading `/skill-name` get tagged for Plan 7 to honor.

**Architecture:** `mcpClient.ts` wraps MCP stdio + HTTP transports; `mcpRegistry.ts` is a singleton that connects to all configured servers at startup, exposes `listMcpServers()` + `callMcpTool()`. `pluginLoader.ts` reads `plugin.json` per plugin, registers the plugin's `mcpServers` block into the MCP registry. `slashCommand.ts` parses `/name args` from prompt strings.

**Tech Stack:** `@modelcontextprotocol/sdk` for the MCP client; node:child_process for stdio.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 4.4 (plugin) + § 4.5 (MCP) + § 4.6 (slash command).

**Scope boundary (out of plan):** NO marketplace UI (M2). NO MCP auth flows beyond the SDK basics. NO plugin sandboxing — trust model is "user installed it deliberately". Slash command logic is parsing only; binding to actual skill invocation lives in Plan 7.

---

## File Structure

```
packages/server/src/
  services/
    mcpClient.ts                ← wrap MCP SDK transports (stdio + http)
    mcpRegistry.ts              ← singleton: connect on init, expose list + call
    pluginLoader.ts             ← scan data/skills/plugins/*/plugin.json + register MCP
    slashCommand.ts             ← parse('/skillname rest of message') -> {skill, args}
    __tests__/
      mcpRegistry.test.ts       ← mocked transport
      pluginLoader.test.ts
      slashCommand.test.ts
  routes/
    mcp.ts                      ← GET /api/mcp + POST /:name/reconnect + POST/DELETE/PATCH manage
    plugins.ts                  ← GET /api/plugins + POST install + PATCH enable/disable + DELETE
    __tests__/
      mcp.route.test.ts
      plugins.route.test.ts

data/skills/plugins/             (runtime, not in git)
  <plugin-name>/
    plugin.json
    skills/*.md
```

---

## Task 1: slashCommand parser (TDD)

**Files:**
- Create `packages/server/src/services/slashCommand.ts`
- Create `packages/server/src/services/__tests__/slashCommand.test.ts`

- [ ] **Step 1** — Failing tests:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSlashCommand } from '../slashCommand';

describe('parseSlashCommand', () => {
  it('returns null for non-slash input', () => {
    expect(parseSlashCommand('hello')).toBeNull();
  });

  it('parses /skillname with no args', () => {
    expect(parseSlashCommand('/foo')).toEqual({ skill: 'foo', rest: '' });
  });

  it('parses /skillname with trailing prompt', () => {
    expect(parseSlashCommand('/foo do this')).toEqual({ skill: 'foo', rest: 'do this' });
  });

  it('parses /hpsk:price-doc with colon', () => {
    expect(parseSlashCommand('/hpsk:price-doc 我要做查詢頁')).toEqual({ skill: 'hpsk:price-doc', rest: '我要做查詢頁' });
  });

  it('treats /single-word with hyphens correctly', () => {
    expect(parseSlashCommand('/my-skill arg')).toEqual({ skill: 'my-skill', rest: 'arg' });
  });

  it('returns null when only whitespace after /', () => {
    expect(parseSlashCommand('/  ')).toBeNull();
  });

  it('strips leading newlines/spaces from the input', () => {
    expect(parseSlashCommand('   /foo bar')).toEqual({ skill: 'foo', rest: 'bar' });
  });
});
```

- [ ] **Step 2** — Implement:

```typescript
const SLASH_RE = /^\/([\w:.-]+)(?:\s+([\s\S]*))?$/;

export interface SlashCommand { skill: string; rest: string; }

export function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  const m = trimmed.match(SLASH_RE);
  if (!m) return null;
  return { skill: m[1]!, rest: (m[2] ?? '').trim() };
}
```

- [ ] **Step 3** — Tests pass (7 new)

- [ ] **Step 4** — Commit: `feat(server): add slash command parser (/skill-name args) (Plan 5 Task 1)`

---

## Task 2: MCP client + registry

**Files:**
- Create `packages/server/src/services/mcpClient.ts`
- Create `packages/server/src/services/mcpRegistry.ts`
- Create `packages/server/src/services/__tests__/mcpRegistry.test.ts`

This task uses `@modelcontextprotocol/sdk` (install) but MOCKS transports in tests.

- [ ] **Step 1** — Add `@modelcontextprotocol/sdk: ^1.0.0` to `packages/server/package.json`. `pnpm install`. If the version isn't right, check legacy's package.json for the exact version: `grep modelcontextprotocol legacy/packages/server/package.json`.

- [ ] **Step 2** — Implement `mcpClient.ts`:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// If HTTP support is needed:
// import { HttpClientTransport } from '@modelcontextprotocol/sdk/client/http.js';

export type McpServerConfig =
  | { name: string; command: string; args?: string[]; env?: Record<string, string>; transport: 'stdio' }
  | { name: string; url: string; transport: 'http' };

export interface McpToolDescriptor { name: string; description?: string; }

export interface ConnectedMcp {
  config: McpServerConfig;
  client: Client;
  tools: McpToolDescriptor[];
}

export async function connectMcp(config: McpServerConfig): Promise<ConnectedMcp> {
  const client = new Client({ name: 'designbridge', version: '2.0.0' }, { capabilities: {} });
  if (config.transport === 'stdio') {
    const transport = new StdioClientTransport({ command: config.command, args: config.args, env: config.env });
    await client.connect(transport);
  } else {
    throw new Error('HTTP transport not yet wired in M1');
  }
  const toolList = await client.listTools();
  return { config, client, tools: toolList.tools.map(t => ({ name: t.name, description: t.description })) };
}

export async function disconnectMcp(c: ConnectedMcp): Promise<void> {
  await c.client.close();
}

export async function callMcpTool(c: ConnectedMcp, name: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await c.client.callTool({ name, arguments: args });
  return r;
}
```

- [ ] **Step 3** — Implement `mcpRegistry.ts`:

```typescript
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
```

- [ ] **Step 4** — Tests with mocked SDK:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SDK before importing the registry
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [{ name: 'tool-a', description: 'an a' }] }),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(),
}));

import { initMcpRegistry, listMcpServers, callMcp, isConnected } from '../mcpRegistry';

beforeEach(async () => { await initMcpRegistry([]); });

describe('mcpRegistry', () => {
  it('listMcpServers empty initially', () => {
    expect(listMcpServers()).toEqual([]);
  });

  it('init connects + listMcpServers reflects them', async () => {
    await initMcpRegistry([{ name: 'a', command: 'echo', transport: 'stdio' }]);
    const list = listMcpServers();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('a');
    expect(list[0].tools).toEqual([{ name: 'tool-a', description: 'an a' }]);
  });

  it('isConnected true for connected server', async () => {
    await initMcpRegistry([{ name: 'a', command: 'echo', transport: 'stdio' }]);
    expect(isConnected('a')).toBe(true);
    expect(isConnected('nope')).toBe(false);
  });

  it('callMcp delegates to client.callTool', async () => {
    await initMcpRegistry([{ name: 'a', command: 'echo', transport: 'stdio' }]);
    const r = await callMcp('a', 'tool-a', { foo: 'bar' });
    expect(r).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('callMcp throws when server not connected', async () => {
    await expect(callMcp('missing', 'x', {})).rejects.toThrow();
  });
});
```

- [ ] **Step 5** — Tests pass (5 new)

- [ ] **Step 6** — Commit: `feat(server): add MCP client + registry (stdio transport, mocked tests) (Plan 5 Task 2)`

---

## Task 3: pluginLoader

**Files:**
- Create `packages/server/src/services/pluginLoader.ts`
- Create `packages/server/src/services/__tests__/pluginLoader.test.ts`

Plugin layout:

```
data/skills/plugins/
  <plugin-name>/
    plugin.json     ← { name, version, description, skills: "./skills", mcpServers: { ... } }
    skills/*.md
```

`pluginLoader` reads all plugin.json files, returns aggregated MCP server config array (skills already loaded by Plan 4 registry).

- [ ] **Step 1** — Failing tests:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlugins } from '../pluginLoader';

let baseDir: string;
let pluginsDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'pl-'));
  pluginsDir = join(baseDir, 'plugins');
  mkdirSync(pluginsDir, { recursive: true });
});
afterEach(() => { rmSync(baseDir, { recursive: true, force: true }); });

describe('loadPlugins', () => {
  it('returns empty list when no plugins', () => {
    expect(loadPlugins(pluginsDir)).toEqual([]);
  });

  it('reads plugin.json from each plugin dir', () => {
    mkdirSync(join(pluginsDir, 'a'));
    writeFileSync(join(pluginsDir, 'a', 'plugin.json'), JSON.stringify({
      name: 'a', version: '1.0.0', description: 'Plugin A',
    }));
    const r = loadPlugins(pluginsDir);
    expect(r).toHaveLength(1);
    expect(r[0].manifest.name).toBe('a');
  });

  it('aggregates mcpServers across plugins', () => {
    mkdirSync(join(pluginsDir, 'a'));
    mkdirSync(join(pluginsDir, 'b'));
    writeFileSync(join(pluginsDir, 'a', 'plugin.json'), JSON.stringify({
      name: 'a', version: '1.0.0',
      mcpServers: { svrA: { transport: 'stdio', command: 'echo' } },
    }));
    writeFileSync(join(pluginsDir, 'b', 'plugin.json'), JSON.stringify({
      name: 'b', version: '1.0.0',
      mcpServers: { svrB: { transport: 'stdio', command: 'cat' } },
    }));
    const r = loadPlugins(pluginsDir);
    const allMcp = r.flatMap(p => p.mcpServers);
    expect(allMcp.map(s => s.name).sort()).toEqual(['svrA', 'svrB']);
  });

  it('silently skips plugin with malformed plugin.json', () => {
    mkdirSync(join(pluginsDir, 'bad'));
    writeFileSync(join(pluginsDir, 'bad', 'plugin.json'), '{{ not json');
    expect(loadPlugins(pluginsDir)).toEqual([]);
  });
});
```

- [ ] **Step 2** — Implement:

```typescript
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
            mcpServers.push({ name, url: cfg.url, transport: 'http' });
          } else {
            mcpServers.push({ name, command: cfg.command, args: cfg.args, env: cfg.env, transport: 'stdio' });
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
```

- [ ] **Step 3** — Tests pass (4 new)

- [ ] **Step 4** — Commit: `feat(server): add pluginLoader (plugin.json bundle reader) (Plan 5 Task 3)`

---

## Task 4: REST routes + wire into createApp

**Files:**
- Create `packages/server/src/routes/mcp.ts`
- Create `packages/server/src/routes/plugins.ts`
- Create `packages/server/src/routes/__tests__/mcp.route.test.ts`
- Create `packages/server/src/routes/__tests__/plugins.route.test.ts`
- Modify `packages/server/src/index.ts`

Tests use the same mocks set up in Task 2 (the SDK mock).

- [ ] **Step 1** — Implement `routes/mcp.ts`:

```typescript
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listMcpServers } from '../services/mcpRegistry.js';

export function buildMcpRouter(): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/', (_req: Request, res: Response) => {
    res.json({ servers: listMcpServers() });
  });

  return r;
}
```

(POST/PATCH/DELETE/reconnect endpoints deferred to Plan 14 settings UI — registry init happens at app startup for M1.)

- [ ] **Step 2** — Implement `routes/plugins.ts`:

```typescript
import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { loadPlugins } from '../services/pluginLoader.js';
import type { Dependencies } from '../types/deps.js';

export function buildPluginsRouter(pluginsDir: string): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/', (_req: Request, res: Response) => {
    const plugins = loadPlugins(pluginsDir).map(p => ({
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description,
      skillCount: p.manifest.skills ? 1 : 0, // count later if needed
      mcpServers: p.mcpServers.map(s => ({ name: s.name, transport: s.transport })),
    }));
    res.json({ plugins });
  });

  return r;
}
```

(POST install / PATCH enable / DELETE deferred to M2.)

- [ ] **Step 3** — Wire into `index.ts`:

```typescript
import { buildMcpRouter } from './routes/mcp.js';
import { buildPluginsRouter } from './routes/plugins.js';
import { loadPlugins } from './services/pluginLoader.js';
import { initMcpRegistry } from './services/mcpRegistry.js';

// inside createApp, after initSkillRegistry:
const pluginsRoot = join(deps.dataDir, 'skills', 'plugins');
const plugins = loadPlugins(pluginsRoot);
const allMcpServers = plugins.flatMap(p => p.mcpServers);
// Async, but createApp is sync — fire and forget; failures are logged
void initMcpRegistry(allMcpServers);

// after skill routers:
app.use('/api/mcp', buildMcpRouter());
app.use('/api/plugins', buildPluginsRouter(pluginsRoot));
```

- [ ] **Step 4** — Tests:

```typescript
// mcp.route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: vi.fn() }));

import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string; let app: ReturnType<typeof createApp>; let token: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'mr-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('GET /api/mcp', () => {
  it('returns empty servers list when no plugins', async () => {
    const r = await request(app).get('/api/mcp').set('Authorization', `Bearer ${token}`);
    expect(r.body.servers).toEqual([]);
  });

  it('401 without auth', async () => {
    const r = await request(app).get('/api/mcp');
    expect(r.status).toBe(401);
  });
});
```

```typescript
// plugins.route.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: vi.fn() }));

import { vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string; let app: ReturnType<typeof createApp>; let token: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pr-'));
  mkdirSync(join(dataDir, 'skills', 'plugins', 'demo'), { recursive: true });
  writeFileSync(join(dataDir, 'skills', 'plugins', 'demo', 'plugin.json'), JSON.stringify({
    name: 'demo', version: '0.1.0', description: 'demo plugin'
  }));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('GET /api/plugins', () => {
  it('lists installed plugins from data/skills/plugins', async () => {
    const r = await request(app).get('/api/plugins').set('Authorization', `Bearer ${token}`);
    expect(r.body.plugins.find((p: { name: string }) => p.name === 'demo')).toBeTruthy();
  });
});
```

- [ ] **Step 5** — Tests pass

- [ ] **Step 6** — Commit: `feat(server): add /api/mcp + /api/plugins routes + wire registry on startup (Plan 5 Task 4)`

---

## Task 5: Verify + push

- Total tests: 105 + 7 + 5 + 4 + 3 = 124
- All 4 builds green
- Push

Commit message if any final fix needed: ad-hoc.

---

## Acceptance Criteria

- [ ] slashCommand parser handles `/skill-name args`, `/hpsk:price-doc 中文`, edge cases
- [ ] mcpRegistry connects via mocked stdio; lists tools; calls tool; reports connection state
- [ ] pluginLoader reads plugin.json from each plugin dir, aggregates mcpServers, skips malformed
- [ ] `GET /api/mcp` returns connected server list with tools
- [ ] `GET /api/plugins` returns installed plugin manifests
- [ ] Plugin MCP servers initialized on `createApp` startup (best-effort, failures logged)
- [ ] All builds + tests + push clean

---

## Risks / Notes

1. `@modelcontextprotocol/sdk` package layout changes between versions; if the import paths in `mcpClient.ts` don't match the installed version, adjust per the actual SDK.
2. MCP `initMcpRegistry` is fire-and-forget in `createApp` (which is sync). If a plugin's MCP server is slow to connect, the first `GET /api/mcp` might return an empty list. Acceptable for M1 — Plan 14 can add a "connection status" polling endpoint.
3. Plugin sandboxing: NONE. A malicious `plugin.json` could spawn arbitrary stdio commands. Trust model is "user installed it". Plan 14+ may add restricted-execution mode.
4. Slash command parsing is pure — Plan 7 chat endpoint detects the prefix, calls `parseSlashCommand`, and forces `readSkill(name)` into the system prompt before invoking the AI.

---

**Plan end. 5 Tasks. After this plan: Plan 6 (Ingestion) and Plan 7 (Chat SSE) can compose skills + MCP + memory + slash commands into the full AI invocation.**
