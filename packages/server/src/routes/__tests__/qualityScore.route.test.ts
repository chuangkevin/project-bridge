import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';
import { createArtifact } from '../../services/artifactService';
import * as qualityScorer from '../../services/qualityScorer';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;
let turnId: string;
let artifactId: string;

const MOCK_SCORE: qualityScorer.QualityScore = {
  overall: 85,
  design: 88,
  responsive: 82,
  consistency: 86,
  accessibility: 80,
  summary: '整體設計品質良好，視覺層次清晰',
};

beforeEach(async () => {
  vi.restoreAllMocks();
  // Mock scoreArtifact to avoid real AI calls
  vi.spyOn(qualityScorer, 'scoreArtifact').mockResolvedValue(MOCK_SCORE);

  dataDir = mkdtempSync(join(tmpdir(), 'qs-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'QSProject' });
  projectId = p.body.id;
  turnId = appendTurn(app.locals.db, {
    projectId, mode: 'design', userText: 'generate', aiResponse: { text: '' },
  }).id;
  const a = createArtifact(app.locals.db, {
    projectId,
    createdByTurn: turnId,
    kind: 'vue-sfc',
    name: 'home-page',
    payload: '<template><div>test</div></template>',
    payloadExt: 'vue',
    artifactsRoot: join(dataDir, 'projects', projectId, 'artifacts'),
  });
  artifactId = a.id;
});

afterEach(() => {
  vi.restoreAllMocks();
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('POST /api/projects/:id/quality-score', () => {
  it('returns score object with expected shape', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quality-score`)
      .send({ artifactId });
    expect(r.status).toBe(200);
    const { score } = r.body as { score: qualityScorer.QualityScore };
    expect(typeof score.overall).toBe('number');
    expect(typeof score.design).toBe('number');
    expect(typeof score.responsive).toBe('number');
    expect(typeof score.consistency).toBe('number');
    expect(typeof score.accessibility).toBe('number');
    expect(typeof score.summary).toBe('string');
    expect(score.overall).toBe(85);
    expect(score.summary).toBe('整體設計品質良好，視覺層次清晰');
  });

  it('calls scoreArtifact with the SFC source', async () => {
    await request(app)
      .post(`/api/projects/${projectId}/quality-score`)
      .send({ artifactId });
    expect(qualityScorer.scoreArtifact).toHaveBeenCalledWith(
      expect.stringContaining('<template>')
    );
  });

  it('400 when artifactId is missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quality-score`)
      .send({});
    expect(r.status).toBe(400);
  });

  it('404 for unknown project', async () => {
    const r = await request(app)
      .post('/api/projects/no-such/quality-score')
      .send({ artifactId });
    expect(r.status).toBe(404);
  });

  it('404 for unknown artifact', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quality-score`)
      .send({ artifactId: 'no-such-artifact' });
    expect(r.status).toBe(404);
  });
});
