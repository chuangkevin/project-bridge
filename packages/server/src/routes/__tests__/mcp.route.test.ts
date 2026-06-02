import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: vi.fn() }));

import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { setupAdmin, asAdmin } from './_helpers';

let dataDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'mr-'));
  app = createApp({ dataDir });
});
afterEach(() => {
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /api/mcp (M1 anonymous)', () => {
  it('returns empty servers list when no plugins (no auth needed)', async () => {
    const r = await request(app).get('/api/mcp');
    expect(r.status).toBe(200);
    expect(r.body.servers).toEqual([]);
  });

  it('GET /api/mcp/servers is open in M1', async () => {
    const r = await request(app).get('/api/mcp/servers');
    expect(r.status).toBe(200);
    expect(r.body.servers).toEqual([]);
  });

  it('POST /api/mcp/servers creates a server (no auth required)', async () => {
    const r = await request(app).post('/api/mcp/servers').send({ name: 'x', endpoint: 'https://x.com' });
    expect(r.status).toBe(201);
  });
});
