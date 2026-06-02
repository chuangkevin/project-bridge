import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'sx-'));
  app = createApp({ dataDir });
});

afterEach(() => {
  (app.locals as Record<string, unknown> & { db?: { close(): void } }).db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /api/skills/global/export (M1 anonymous)', () => {
  it('returns empty list when no global skills exist', async () => {
    const r = await request(app).get('/api/skills/global/export');
    expect(r.status).toBe(200);
    expect(r.body.skills).toEqual([]);
    expect(typeof r.body.exportedAt).toBe('string');
  });

  it('returns previously created global skills with frontmatter + body', async () => {
    await request(app).post('/api/skills/global')
      .send({ name: 'demo-skill', description: 'demo', body: 'demo body line' });
    const r = await request(app).get('/api/skills/global/export');
    expect(r.status).toBe(200);
    const skill = r.body.skills.find((s: { name: string }) => s.name === 'demo-skill');
    expect(skill).toBeTruthy();
    expect(skill.description).toBe('demo');
    expect(skill.body).toContain('demo body line');
  });
});

describe('POST /api/skills/global/batch (M1 anonymous)', () => {
  it('upserts multiple skills and reports added/updated counts', async () => {
    const r = await request(app).post('/api/skills/global/batch').send({
      skills: [
        { name: 'alpha', description: 'a', body: 'a body' },
        { name: 'beta', description: 'b', body: 'b body' },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body.added).toBe(2);
    expect(r.body.updated).toBe(0);

    // second import with one new + one existing → 1 added, 1 updated
    const r2 = await request(app).post('/api/skills/global/batch').send({
      skills: [
        { name: 'alpha', description: 'a v2', body: 'a body v2' },
        { name: 'gamma', description: 'g', body: 'g body' },
      ],
    });
    expect(r2.body.added).toBe(1);
    expect(r2.body.updated).toBe(1);
  });

  it('skips skills with invalid names', async () => {
    const r = await request(app).post('/api/skills/global/batch').send({
      skills: [
        { name: 'Valid-Name', description: 'no', body: '' }, // uppercase rejected
        { name: 'ok-name', description: 'yes', body: '' },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body.added).toBe(1);
    expect(r.body.skipped).toHaveLength(1);
  });

  it('400 when body is missing skills array', async () => {
    const r = await request(app).post('/api/skills/global/batch').send({});
    expect(r.status).toBe(400);
  });

  it('imported skills appear in subsequent /global/export response', async () => {
    await request(app).post('/api/skills/global/batch').send({
      skills: [{ name: 'roundtrip', description: 'rt', body: 'rt body' }],
    });
    const exp = await request(app).get('/api/skills/global/export');
    expect(exp.body.skills.map((s: { name: string }) => s.name)).toContain('roundtrip');
  });
});
