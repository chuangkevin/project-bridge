import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index.js';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ingest-rt-'));
  app = createApp({ dataDir });

  const setup = await request(app)
    .post('/api/auth/setup')
    .send({ name: 'Alice', email: 'alice@example.com', password: 'password12345' });
  token = setup.body.token;

  const proj = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Project' });
  projectId = proj.body.id;
});

afterEach(() => {
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('POST /api/projects/:id/ingest', () => {
  it('uploads a text/plain file and returns 201 with attachment record', async () => {
    const content = Buffer.from('Hello, this is a plain text file');
    const r = await request(app)
      .post(`/api/projects/${projectId}/ingest`)
      .set(auth())
      .attach('files', content, { filename: 'notes.txt', contentType: 'text/plain' });

    expect(r.status).toBe(201);
    expect(r.body.attachments).toHaveLength(1);
    const att = r.body.attachments[0];
    expect(att.originalName).toBe('notes.txt');
    expect(att.mimeType).toBe('text/plain');
    expect(att.sizeBytes).toBe(content.length);
    expect(att.id).toBeTruthy();
    expect(att.projectId).toBe(projectId);
  });

  it('uploads a url (mocked fetch) and returns 201 with url-snapshot attachment', async () => {
    const fakeHtml = '<html><body><h1>Test Page</h1><p>Some content</p></body></html>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      text: async () => fakeHtml,
      ok: true,
      status: 200,
    } as unknown as Response);

    const r = await request(app)
      .post(`/api/projects/${projectId}/ingest`)
      .set(auth())
      .send({ url: 'https://example.com/page' });

    expect(r.status).toBe(201);
    expect(r.body.attachments).toHaveLength(1);
    const att = r.body.attachments[0];
    expect(att.kind).toBe('url-snapshot');
    expect(att.originalName).toBe('https://example.com/page');
    expect(att.parsedText).toContain('Test Page');
  });

  it('returns 400 when no files and no url are provided', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/ingest`)
      .set(auth())
      .send({});

    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 401 without auth', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/ingest`)
      .attach('files', Buffer.from('x'), { filename: 'f.txt', contentType: 'text/plain' });

    expect(r.status).toBe(401);
  });

  it('returns 404 for unknown project', async () => {
    const r = await request(app)
      .post('/api/projects/no-such-project/ingest')
      .set(auth())
      .attach('files', Buffer.from('x'), { filename: 'f.txt', contentType: 'text/plain' });

    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/projects/:id/ingest', () => {
  it('returns empty list initially', async () => {
    const r = await request(app)
      .get(`/api/projects/${projectId}/ingest`)
      .set(auth());

    expect(r.status).toBe(200);
    expect(r.body.attachments).toEqual([]);
  });

  it('lists attachments after upload', async () => {
    // Upload one file
    await request(app)
      .post(`/api/projects/${projectId}/ingest`)
      .set(auth())
      .attach('files', Buffer.from('data'), { filename: 'img.png', contentType: 'image/png' });

    const r = await request(app)
      .get(`/api/projects/${projectId}/ingest`)
      .set(auth());

    expect(r.status).toBe(200);
    expect(r.body.attachments).toHaveLength(1);
    expect(r.body.attachments[0].originalName).toBe('img.png');
  });

  it('returns 401 without auth', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/ingest`);
    expect(r.status).toBe(401);
  });

  it('returns 404 for unknown project', async () => {
    const r = await request(app)
      .get('/api/projects/no-such-project/ingest')
      .set(auth());

    expect(r.status).toBe(404);
  });
});
