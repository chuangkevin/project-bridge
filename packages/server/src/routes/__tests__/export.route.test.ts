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

const SFC_SOURCE = `<template>
  <div class="p-4">
    <h1 class="text-2xl font-bold">首頁</h1>
    <p class="text-gray-600">歡迎來到首頁</p>
  </div>
</template>
<style scoped>
/* minimal */
</style>`;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ex-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'ExportProject' });
  projectId = p.body.id;
  turnId = appendTurn(app.locals.db, {
    projectId, mode: 'design', userText: 'generate', aiResponse: { text: '' },
  }).id;
});

afterEach(() => {
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function makeSfcArtifact(name = 'home-page') {
  return createArtifact(app.locals.db, {
    projectId,
    createdByTurn: turnId,
    kind: 'vue-sfc',
    name,
    payload: SFC_SOURCE,
    payloadExt: 'vue',
    artifactsRoot: join(dataDir, 'projects', projectId, 'artifacts'),
  });
}

describe('POST /api/projects/:id/export', () => {
  it('returns empty files array when no vue-sfc artifacts exist', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ framework: 'vue3' });
    expect(r.status).toBe(200);
    expect(r.body.files).toEqual([]);
  });

  it('vue3 framework returns array of .vue files', async () => {
    makeSfcArtifact('home-page');
    const r = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ framework: 'vue3' });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.files)).toBe(true);
    expect(r.body.files).toHaveLength(1);
    expect(r.body.files[0].filename).toBe('HomePage.vue');
    expect(r.body.files[0].content).toContain('<template>');
  });

  it('html framework returns .html files with Tailwind CDN', async () => {
    makeSfcArtifact('about-page');
    const r = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ framework: 'html' });
    expect(r.status).toBe(200);
    expect(r.body.files).toHaveLength(1);
    expect(r.body.files[0].filename).toBe('AboutPage.html');
    expect(r.body.files[0].content).toContain('tailwindcss.com');
    expect(r.body.files[0].content).toContain('<!DOCTYPE html>');
  });

  it('react framework returns .jsx files', async () => {
    makeSfcArtifact('contact-page');
    const r = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ framework: 'react' });
    expect(r.status).toBe(200);
    expect(r.body.files).toHaveLength(1);
    expect(r.body.files[0].filename).toBe('ContactPage.jsx');
    expect(r.body.files[0].content).toContain('export default function ContactPage');
    expect(r.body.files[0].content).toContain('className=');
  });

  it('zip framework returns binary content with Content-Disposition header', async () => {
    makeSfcArtifact('home-page');
    const r = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ framework: 'zip' })
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('gzip');
    expect(r.headers['content-disposition']).toContain('design-export.tar.gz');
    // gzip magic bytes: 1f 8b
    const body = r.body as Buffer;
    expect(body[0]).toBe(0x1f);
    expect(body[1]).toBe(0x8b);
  });

  it('defaults to vue3 for unknown framework', async () => {
    makeSfcArtifact('home-page');
    const r = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ framework: 'svelte' });
    expect(r.status).toBe(200);
    expect(r.body.files[0].filename).toMatch(/\.vue$/);
  });

  it('only exports active (non-superseded) artifacts', async () => {
    const a1 = makeSfcArtifact('home-page');
    // Create a second artifact that supersedes the first
    createArtifact(app.locals.db, {
      projectId,
      createdByTurn: turnId,
      kind: 'vue-sfc',
      name: 'home-page',
      payload: SFC_SOURCE + '\n<!-- v2 -->',
      payloadExt: 'vue',
      artifactsRoot: join(dataDir, 'projects', projectId, 'artifacts'),
    });
    const r = await request(app)
      .post(`/api/projects/${projectId}/export`)
      .send({ framework: 'vue3' });
    expect(r.status).toBe(200);
    // Only 1 active (non-superseded) artifact
    expect(r.body.files).toHaveLength(1);
    expect(r.body.files[0].content).toContain('v2');
    void a1; // suppress unused warning
  });

  it('404 for unknown project', async () => {
    const r = await request(app)
      .post('/api/projects/no-such/export')
      .send({ framework: 'vue3' });
    expect(r.status).toBe(404);
  });
});
