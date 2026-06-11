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

describe('POST /api/projects/:id/quick-regen — element track', () => {
  const RICH_SFC = `<template>
  <div class="page">
    <header><h1>標題</h1></header>
    <section class="hero">
      <button class="btn">舊按鈕</button>
    </section>
  </div>
</template>
<script>export default {}</script>`;

  let richArtifactId: string;

  beforeEach(() => {
    const turn = appendTurn(app.locals.db, {
      projectId, mode: 'design', userText: 'seed2', aiResponse: { text: '' },
    });
    const a = createArtifact(app.locals.db, {
      projectId, createdByTurn: turn.id, kind: 'vue-sfc', name: 'rich',
      payload: RICH_SFC, payloadExt: 'vue',
      artifactsRoot: join(dataDir, 'projects', projectId, 'artifacts'),
    });
    richArtifactId = a.id;
  });

  it('valid elementPath splices only the subtree (track=element)', async () => {
    const { callProvider } = await import('../../services/callProvider.js');
    (callProvider as ReturnType<typeof vi.fn>).mockImplementationOnce(async function* () {
      yield '```html\n<button class="btn rounded-full">新按鈕</button>\n```';
    });

    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId: richArtifactId, bridgeSelector: '.btn', instruction: '改圓角', elementPath: [0, 1, 0] });

    expect(r.status).toBe(200);
    expect(r.body.track).toBe('element');

    const { readFileSync } = await import('node:fs');
    const row = app.locals.db.prepare('SELECT payload_path FROM artifacts WHERE id = ?').get(r.body.artifactId) as { payload_path: string };
    const payload = readFileSync(join(dataDir, row.payload_path), 'utf8');
    expect(payload).toContain('新按鈕');
    expect(payload).not.toContain('舊按鈕');
    // Everything outside the button is byte-identical
    expect(payload).toContain('<header><h1>標題</h1></header>');
    expect(payload.startsWith('<template>\n  <div class="page">')).toBe(true);
  });

  it('invalid AI snippet downgrades to page track with reason', async () => {
    const { callProvider } = await import('../../services/callProvider.js');
    (callProvider as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async function* () {
        yield '抱歉我講個故事而不是輸出元素';
      })
      .mockImplementationOnce(async function* () {
        yield `<artifact kind="vue-sfc" name="rich"><template><div>整頁重生</div></template></artifact>`;
      });

    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId: richArtifactId, bridgeSelector: '.btn', instruction: 'x', elementPath: [0, 1, 0] });

    expect(r.status).toBe(200);
    expect(r.body.track).toBe('page');
    expect(r.body.downgraded).toBe(true);
    expect(typeof r.body.downgradeReason).toBe('string');
  });

  it('unlocatable elementPath downgrades to page track', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId: richArtifactId, bridgeSelector: '.btn', instruction: 'x', elementPath: [9, 9, 9] });
    expect(r.status).toBe(200);
    expect(r.body.track).toBe('page');
    expect(r.body.downgraded).toBe(true);
  });
});
