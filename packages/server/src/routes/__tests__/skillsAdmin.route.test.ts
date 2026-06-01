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
  dataDir = mkdtempSync(join(tmpdir(), 'sg-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token as string;
});
afterEach(() => {
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('GET /api/skills/global', () => {
  it('returns empty list when no global skills exist', async () => {
    const r = await request(app).get('/api/skills/global').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.skills).toEqual([]);
  });

  it('lists global skills after creating one', async () => {
    await request(app).post('/api/skills/global').set(auth())
      .send({ name: 'my-skill', description: 'test skill', body: 'body content' });
    const r = await request(app).get('/api/skills/global').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('my-skill');
  });

  it('does not return builtin skills in global list', async () => {
    const r = await request(app).get('/api/skills/global').set(auth());
    // consult-clarify-first is builtin — should not appear in /global
    expect(r.body.skills.map((s: { name: string }) => s.name)).not.toContain('consult-clarify-first');
  });

  it('401 without auth', async () => {
    const r = await request(app).get('/api/skills/global');
    expect(r.status).toBe(401);
  });
});

describe('POST /api/skills/global', () => {
  it('creates a new global skill and returns 201', async () => {
    const r = await request(app).post('/api/skills/global').set(auth())
      .send({ name: 'new-skill', description: 'a new skill', body: 'skill body here' });
    expect(r.status).toBe(201);
    expect(r.body.ok).toBe(true);
    expect(r.body.name).toBe('new-skill');
  });

  it('GET shows the newly created skill', async () => {
    await request(app).post('/api/skills/global').set(auth())
      .send({ name: 'visible-skill', description: 'visible', body: 'visible body' });
    const r = await request(app).get('/api/skills/global').set(auth());
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('visible-skill');
  });

  it('400 when name is missing', async () => {
    const r = await request(app).post('/api/skills/global').set(auth())
      .send({ description: 'd', body: 'b' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('400 when description is missing', async () => {
    const r = await request(app).post('/api/skills/global').set(auth())
      .send({ name: 'test-skill', body: 'b' });
    expect(r.status).toBe(400);
  });

  it('401 without auth', async () => {
    const r = await request(app).post('/api/skills/global').send({ name: 'x', description: 'd', body: 'b' });
    expect(r.status).toBe(401);
  });
});

describe('DELETE /api/skills/global/:name', () => {
  it('deletes an existing skill and it no longer appears in GET', async () => {
    await request(app).post('/api/skills/global').set(auth())
      .send({ name: 'to-delete', description: 'd', body: 'b' });
    const d = await request(app).delete('/api/skills/global/to-delete').set(auth());
    expect(d.status).toBe(200);
    expect(d.body.ok).toBe(true);
    const r = await request(app).get('/api/skills/global').set(auth());
    expect(r.body.skills.map((s: { name: string }) => s.name)).not.toContain('to-delete');
  });

  it('401 without auth', async () => {
    const r = await request(app).delete('/api/skills/global/some-skill');
    expect(r.status).toBe(401);
  });
});
