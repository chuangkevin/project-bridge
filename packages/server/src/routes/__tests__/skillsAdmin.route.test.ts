import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'sg-'));
  app = createApp({ dataDir });
});
afterEach(() => {
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /api/skills/global (M1 anonymous)', () => {
  it('returns empty list when no global skills exist', async () => {
    const r = await request(app).get('/api/skills/global');
    expect(r.status).toBe(200);
    expect(r.body.skills).toEqual([]);
  });

  it('lists global skills after creating one', async () => {
    await request(app).post('/api/skills/global')
      .send({ name: 'my-skill', description: 'test skill', body: 'body content' });
    const r = await request(app).get('/api/skills/global');
    expect(r.status).toBe(200);
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('my-skill');
  });

  it('does not return builtin skills in global list', async () => {
    const r = await request(app).get('/api/skills/global');
    // consult-clarify-first is builtin — should not appear in /global
    expect(r.body.skills.map((s: { name: string }) => s.name)).not.toContain('consult-clarify-first');
  });
});

describe('POST /api/skills/global (M1 anonymous)', () => {
  it('creates a new global skill and returns 201', async () => {
    const r = await request(app).post('/api/skills/global')
      .send({ name: 'new-skill', description: 'a new skill', body: 'skill body here' });
    expect(r.status).toBe(201);
    expect(r.body.ok).toBe(true);
    expect(r.body.name).toBe('new-skill');
  });

  it('GET shows the newly created skill', async () => {
    await request(app).post('/api/skills/global')
      .send({ name: 'visible-skill', description: 'visible', body: 'visible body' });
    const r = await request(app).get('/api/skills/global');
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('visible-skill');
  });

  it('400 when name is missing', async () => {
    const r = await request(app).post('/api/skills/global')
      .send({ description: 'd', body: 'b' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('400 when description is missing', async () => {
    const r = await request(app).post('/api/skills/global')
      .send({ name: 'test-skill', body: 'b' });
    expect(r.status).toBe(400);
  });
});

describe('DELETE /api/skills/global/:name (M1 anonymous)', () => {
  it('deletes an existing skill and it no longer appears in GET', async () => {
    await request(app).post('/api/skills/global')
      .send({ name: 'to-delete', description: 'd', body: 'b' });
    const d = await request(app).delete('/api/skills/global/to-delete');
    expect(d.status).toBe(200);
    expect(d.body.ok).toBe(true);
    const r = await request(app).get('/api/skills/global');
    expect(r.body.skills.map((s: { name: string }) => s.name)).not.toContain('to-delete');
  });
});
