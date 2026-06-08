import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';
import { createArtifact } from '../../services/artifactService';

vi.mock('../../services/callProvider.js', () => ({
  callProvider: vi.fn(async function* () {
    yield `<artifact kind="vue-sfc" name="home"><template><div>Modified</div></template></artifact>`;
  }),
  frontendDesignSkillBody: vi.fn(() => ''),
}));

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;
let artifactId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'qr-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'TestProject' });
  projectId = p.body.id;

  const turn = appendTurn(app.locals.db, {
    projectId, mode: 'design', userText: 'seed', aiResponse: { text: '' },
  });
  const a = createArtifact(app.locals.db, {
    projectId,
    createdByTurn: turn.id,
    kind: 'vue-sfc',
    name: 'home',
    payload: '<template><div>Hello</div></template>',
    payloadExt: 'vue',
    artifactsRoot: join(dataDir, 'projects', projectId, 'artifacts'),
  });
  artifactId = a.id;
});

afterEach(() => {
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('POST /api/projects/:id/quick-regen', () => {
  it('returns 400 when artifactId is missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ bridgeSelector: '.btn', instruction: 'Make it red' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 when bridgeSelector is missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId, instruction: 'Make it red' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 when instruction is missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId, bridgeSelector: '.btn' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 when instruction is blank', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId, bridgeSelector: '.btn', instruction: '   ' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 for unknown project', async () => {
    const r = await request(app)
      .post('/api/projects/no-such/quick-regen')
      .send({ artifactId, bridgeSelector: '.btn', instruction: 'x' });
    expect(r.status).toBe(404);
  });

  it('returns 404 for unknown artifactId', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId: 'no-such-artifact', bridgeSelector: '.btn', instruction: 'x' });
    expect(r.status).toBe(404);
  });

  it('returns 200 with new artifactId on success', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId, bridgeSelector: '.hero', instruction: '把背景改成深藍色' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(typeof r.body.artifactId).toBe('string');
    expect(r.body.artifactId).not.toBe(artifactId);
  });

  it('new artifactId is different from original', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId, bridgeSelector: '.btn', instruction: 'enlarge' });
    expect(r.status).toBe(200);
    const newId: string = r.body.artifactId;
    const row = app.locals.db.prepare('SELECT id FROM artifacts WHERE id = ?').get(newId);
    expect(row).toBeTruthy();
  });
});
