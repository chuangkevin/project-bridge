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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pr-'));
  mkdirSync(join(dataDir, 'skills', 'plugins', 'demo'), { recursive: true });
  writeFileSync(join(dataDir, 'skills', 'plugins', 'demo', 'plugin.json'), JSON.stringify({
    name: 'demo', version: '0.1.0', description: 'demo plugin',
  }));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
});
afterEach(() => {
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /api/plugins', () => {
  it('lists installed plugins from data/skills/plugins', async () => {
    const r = await request(app).get('/api/plugins').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.plugins.find((p: { name: string }) => p.name === 'demo')).toBeTruthy();
  });

  it('401 without auth', async () => {
    const r = await request(app).get('/api/plugins');
    expect(r.status).toBe(401);
  });
});
