/**
 * crawl.route.test.ts — Plan 19 crawl routes tests.
 *
 * Playwright is mocked with vi.hoisted() so tests run without a real browser.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mock playwright using vi.hoisted ─────────────────────────────────────────
const { mockPage, mockContext, mockBrowser } = vi.hoisted(() => {
  const mockPage: any = {
    addInitScript: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue({ status: () => 200 }),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue('<html><body><h1>Test</h1></body></html>'),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('screenshot-bytes')),
    evaluate: vi.fn().mockResolvedValue({
      colors: [{ value: '#3b82f6', count: 10 }],
      fonts: [{ value: 'Arial', count: 20 }],
      sizes: [{ value: '16px', count: 30 }],
      headings: [],
      bodyStyle: null,
      buttons: [],
      inputs: [],
      backgrounds: [],
      borderRadii: [],
      shadows: [],
    }),
  };
  const mockContext: any = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockBrowser: any = {
    isConnected: vi.fn().mockReturnValue(true),
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { mockPage, mockContext, mockBrowser };
});

vi.mock('playwright', () => ({
  chromium: { launch: vi.fn().mockResolvedValue(mockBrowser) },
}));

import { createApp } from '../../index.js';

// ─── Test setup ──────────────────────────────────────────────────────────────

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;

beforeEach(async () => {
  // Reset mocks to default state for each test
  mockPage.goto.mockResolvedValue({ status: () => 200 });
  mockPage.content.mockResolvedValue('<html><body><h1>Test</h1></body></html>');
  mockBrowser.isConnected.mockReturnValue(true);
  mockBrowser.newContext.mockResolvedValue(mockContext);

  dataDir = mkdtempSync(join(tmpdir(), 'crawl-test-'));
  app = createApp({ dataDir });
  const p = await request(app).post('/api/projects').send({ name: 'CrawlTestProject' });
  projectId = p.body.id;
});

afterEach(() => {
  app.locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

// ─── crawl-website ────────────────────────────────────────────────────────────

describe('POST /api/projects/:id/crawl-website', () => {
  it('returns 400 when url is missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/crawl-website`)
      .send({});
    expect(r.status).toBe(400);
  });

  it('returns 400 when url is malformed', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/crawl-website`)
      .send({ url: 'not-a-url' });
    expect(r.status).toBe(400);
  });

  it('returns 404 for unknown project', async () => {
    const r = await request(app)
      .post('/api/projects/unknown-id/crawl-website')
      .send({ url: 'https://example.com' });
    expect(r.status).toBe(404);
  });

  it('calls crawler and returns CrawledStyles shape on success', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/crawl-website`)
      .send({ url: 'https://example.com' });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.styles).toBeDefined();
    expect(Array.isArray(r.body.styles.colors)).toBe(true);
    expect(Array.isArray(r.body.styles.typography.fonts)).toBe(true);
    if (r.body.screenshot !== null) {
      expect(r.body.screenshot).toMatch(/^data:image\//);
    }
  });

  it('persists crawled url to project crawled_urls', async () => {
    await request(app)
      .post(`/api/projects/${projectId}/crawl-website`)
      .send({ url: 'https://example.com' });

    const row = app.locals.db.prepare('SELECT crawled_urls FROM projects WHERE id = ?').get(projectId) as any;
    const urls = JSON.parse(row.crawled_urls || '[]');
    expect(urls.some((u: any) => u.url === 'https://example.com')).toBe(true);
  });
});

// ─── crawl-website/batch ─────────────────────────────────────────────────────

describe('POST /api/projects/:id/crawl-website/batch', () => {
  it('returns 400 when urls is not an array', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/crawl-website/batch`)
      .send({ urls: 'https://example.com' });
    expect(r.status).toBe(400);
  });

  it('returns 400 when more than 10 urls provided', async () => {
    const urls = Array.from({ length: 11 }, (_, i) => `https://example${i}.com`);
    const r = await request(app)
      .post(`/api/projects/${projectId}/crawl-website/batch`)
      .send({ urls });
    expect(r.status).toBe(400);
  });

  it('returns aggregated results for valid batch', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/crawl-website/batch`)
      .send({ urls: ['https://example.com', 'https://test.com'] });

    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(typeof r.body.crawled).toBe('number');
    expect(r.body.aggregated).toBeDefined();
  });
});

// ─── design-tokens ────────────────────────────────────────────────────────────

describe('GET /api/projects/:id/design-tokens', () => {
  it('returns tokens: null when none compiled yet', async () => {
    const r = await request(app)
      .get(`/api/projects/${projectId}/design-tokens`);
    expect(r.status).toBe(200);
    expect(r.body.tokens).toBeNull();
  });

  it('returns 404 for unknown project', async () => {
    const r = await request(app).get('/api/projects/bad-id/design-tokens');
    expect(r.status).toBe(404);
  });
});

describe('PUT /api/projects/:id/design-tokens', () => {
  it('saves tokens and retrieves them', async () => {
    const tokens = { colors: { primary: '#ff0000' }, manualOverrides: {} };
    const put = await request(app)
      .put(`/api/projects/${projectId}/design-tokens`)
      .send({ tokens });
    expect(put.status).toBe(200);
    expect(put.body.success).toBe(true);

    const get = await request(app).get(`/api/projects/${projectId}/design-tokens`);
    expect(get.status).toBe(200);
    expect(get.body.tokens?.colors?.primary).toBe('#ff0000');
  });

  it('returns 400 when tokens missing', async () => {
    const r = await request(app)
      .put(`/api/projects/${projectId}/design-tokens`)
      .send({});
    expect(r.status).toBe(400);
  });
});
