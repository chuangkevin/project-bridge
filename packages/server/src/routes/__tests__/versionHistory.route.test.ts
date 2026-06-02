import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';
import { createArtifact } from '../../services/artifactService';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;
let turnId: string;

const artifactsRoot = () => join(dataDir, 'projects', projectId, 'artifacts');

function makeSfc(name: string, content: string) {
  return createArtifact(app.locals.db, {
    projectId,
    createdByTurn: turnId,
    kind: 'vue-sfc',
    name,
    payload: content,
    payloadExt: 'vue',
    artifactsRoot: artifactsRoot(),
  });
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'vh-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'VersionProject' });
  projectId = p.body.id;
  turnId = appendTurn(app.locals.db, {
    projectId, mode: 'design', userText: 'generate', aiResponse: { text: '' },
  }).id;
});

afterEach(() => {
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /api/projects/:id/artifacts/:artifactId/versions', () => {
  it('single artifact returns array of length 1', async () => {
    const a = makeSfc('home-page', '<template><div>v1</div></template>');
    const r = await request(app)
      .get(`/api/projects/${projectId}/artifacts/${a.id}/versions`);
    expect(r.status).toBe(200);
    expect(r.body.versions).toHaveLength(1);
    expect(r.body.versions[0].id).toBe(a.id);
  });

  it('returns chain of 2 when artifact was superseded once', async () => {
    // v1 superseded by v2
    const v1 = makeSfc('home-page', '<template><div>v1</div></template>');
    const v2 = makeSfc('home-page', '<template><div>v2</div></template>');

    // v1 should now have supersededBy = v2.id
    const r = await request(app)
      .get(`/api/projects/${projectId}/artifacts/${v2.id}/versions`);
    expect(r.status).toBe(200);
    const { versions } = r.body as { versions: Array<{ id: string }> };
    expect(versions).toHaveLength(2);
    // Oldest (v1) should be first
    expect(versions[0].id).toBe(v1.id);
    expect(versions[1].id).toBe(v2.id);
  });

  it('returns chain of 3 for 3-generation history', async () => {
    const v1 = makeSfc('home-page', '<template><div>v1</div></template>');
    const v2 = makeSfc('home-page', '<template><div>v2</div></template>');
    const v3 = makeSfc('home-page', '<template><div>v3</div></template>');

    const r = await request(app)
      .get(`/api/projects/${projectId}/artifacts/${v3.id}/versions`);
    expect(r.status).toBe(200);
    const { versions } = r.body as { versions: Array<{ id: string }> };
    expect(versions).toHaveLength(3);
    expect(versions[0].id).toBe(v1.id);
    expect(versions[1].id).toBe(v2.id);
    expect(versions[2].id).toBe(v3.id);
  });

  it('different page names do not mix chains', async () => {
    makeSfc('home-page', '<template><div>home v1</div></template>');
    makeSfc('home-page', '<template><div>home v2</div></template>');
    const about = makeSfc('about-page', '<template><div>about v1</div></template>');

    const r = await request(app)
      .get(`/api/projects/${projectId}/artifacts/${about.id}/versions`);
    expect(r.status).toBe(200);
    expect(r.body.versions).toHaveLength(1);
    expect(r.body.versions[0].id).toBe(about.id);
  });

  it('404 for unknown project', async () => {
    const a = makeSfc('home-page', '<template><div/></template>');
    const r = await request(app)
      .get(`/api/projects/no-such/artifacts/${a.id}/versions`);
    expect(r.status).toBe(404);
  });

  it('404 for unknown artifact', async () => {
    const r = await request(app)
      .get(`/api/projects/${projectId}/artifacts/no-such-id/versions`);
    expect(r.status).toBe(404);
  });
});
