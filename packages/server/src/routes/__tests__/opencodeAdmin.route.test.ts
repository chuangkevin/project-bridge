import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'oa-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token as string;
});

afterEach(() => {
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('GET /api/settings/opencode', () => {
  it('returns empty defaults when nothing is configured', async () => {
    const r = await request(app).get('/api/settings/opencode').set(auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.servers)).toBe(true);
    expect(r.body.textModel).toBe('');
    expect(r.body.visionModel).toBe('');
  });

  it('401 without auth', async () => {
    const r = await request(app).get('/api/settings/opencode');
    expect(r.status).toBe(401);
  });
});

describe('POST /api/settings/opencode (save)', () => {
  it('saves servers array + model selections', async () => {
    const r = await request(app).post('/api/settings/opencode').set(auth()).send({
      servers: ['https://opencode-a.example.com', 'https://opencode-b.example.com'],
      textModel: 'opencode/code',
      visionModel: 'opencode/code-vision',
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);

    const g = await request(app).get('/api/settings/opencode').set(auth());
    expect(g.body.servers).toEqual(['https://opencode-a.example.com', 'https://opencode-b.example.com']);
    expect(g.body.textModel).toBe('opencode/code');
    expect(g.body.visionModel).toBe('opencode/code-vision');
  });

  it('400 when servers is not an array', async () => {
    const r = await request(app).post('/api/settings/opencode').set(auth()).send({ servers: 'not-an-array' });
    expect(r.status).toBe(400);
  });

  it('400 when textModel is not a string', async () => {
    const r = await request(app).post('/api/settings/opencode').set(auth()).send({ textModel: 123 });
    expect(r.status).toBe(400);
  });
});

describe('POST /api/settings/opencode/test', () => {
  it('returns ok:false with empty servers message when nothing configured', async () => {
    const r = await request(app).post('/api/settings/opencode/test').set(auth()).send({});
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBeTruthy();
  });

  it('returns per-server results when servers are configured (unreachable hosts → ok:false)', async () => {
    // Use clearly unreachable URLs so we exercise the per-server result shape
    // without making a real network call to a third-party service.
    await request(app).post('/api/settings/opencode').set(auth()).send({
      servers: ['http://127.0.0.1:1/fake'],
    });
    const r = await request(app).post('/api/settings/opencode/test').set(auth()).send({});
    expect(r.status).toBe(200);
    expect(r.body.results).toHaveLength(1);
    expect(r.body.results[0].ok).toBe(false);
    expect(r.body.results[0].label).toBe('server-1');
    expect(typeof r.body.results[0].elapsedMs).toBe('number');
  }, 15000);
});

describe('GET /api/settings/opencode/models', () => {
  it('returns empty models array when no servers configured', async () => {
    const r = await request(app).get('/api/settings/opencode/models').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.models).toEqual([]);
  });
});
