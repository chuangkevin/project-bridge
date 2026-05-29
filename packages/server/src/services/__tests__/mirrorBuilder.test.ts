import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../ingestion/parseWebpage', () => ({
  parseWebpage: vi.fn(),
}));

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

import { buildMirror } from '../mirrorBuilder';
import { parseWebpage } from '../../ingestion/parseWebpage';
import { loadMirrorMeta, mirrorBaseDir } from '../../storage/mirrorStore';

const parseMock = parseWebpage as ReturnType<typeof vi.fn>;

describe('buildMirror', () => {
  beforeEach(() => { fetchMock.mockReset(); parseMock.mockReset(); });

  it('crawls, downloads assets, rewrites URLs, writes meta', async () => {
    parseMock.mockResolvedValueOnce({
      ok: true,
      ingestion: {
        type: 'webpage', url: 'https://e.com',
        dom: '<html><body><img src="https://cdn.example/logo.png"><link rel="stylesheet" href="https://cdn.example/app.css"></body></html>',
        screenshot: Buffer.from('PNG').toString('base64'),
      },
      assets: ['https://cdn.example/logo.png', 'https://cdn.example/app.css'],
    });
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array(Buffer.from(`bytes:${url}`)).buffer,
    }));

    const baseDir = mkdtempSync(join(tmpdir(), 'mirrorbuilder-'));
    const res = await buildMirror({ projectId: 'p1', artifactId: 'ar_1', url: 'https://e.com', baseDir });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.meta.kind).toBe('mirror');
    expect(res.meta.id).toBe('ar_1');
    expect(res.meta.sourceUrl).toBe('https://e.com');
    expect(res.meta.warnings).toEqual([]);
    const html = readFileSync(join(mirrorBaseDir('p1', 'ar_1', baseDir), 'page.html'), 'utf8');
    expect(html).toContain('assets/');
    expect(html).not.toContain('https://cdn.example/logo.png');
    expect(loadMirrorMeta('p1', 'ar_1', { baseDir })?.id).toBe('ar_1');
  });

  it('on parseWebpage failure, returns ok=false with reason and does NOT write any files', async () => {
    parseMock.mockResolvedValueOnce({ ok: false, reason: 'crawl_timeout', detail: 'timeout' });
    const baseDir = mkdtempSync(join(tmpdir(), 'mirrorbuilder-'));
    const res = await buildMirror({ projectId: 'p1', artifactId: 'ar_2', url: 'https://e.com', baseDir });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('crawl_timeout');
    expect(existsSync(mirrorBaseDir('p1', 'ar_2', baseDir))).toBe(false);
  });

  it('asset 404 → warning recorded, mirror still built', async () => {
    parseMock.mockResolvedValueOnce({
      ok: true,
      ingestion: { type: 'webpage', url: 'https://e.com', dom: '<img src="https://cdn.example/missing.png">', screenshot: Buffer.from('PNG').toString('base64') },
      assets: ['https://cdn.example/missing.png'],
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    const baseDir = mkdtempSync(join(tmpdir(), 'mirrorbuilder-'));
    const res = await buildMirror({ projectId: 'p1', artifactId: 'ar_3', url: 'https://e.com', baseDir });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.meta.warnings.some(w => w.code === 'asset_404')).toBe(true);
  });

  it('asset network error → asset_error warning', async () => {
    parseMock.mockResolvedValueOnce({
      ok: true,
      ingestion: { type: 'webpage', url: 'https://e.com', dom: '<img src="https://cdn.example/x.png">', screenshot: '' },
      assets: ['https://cdn.example/x.png'],
    });
    fetchMock.mockRejectedValueOnce(new Error('network failure'));
    const baseDir = mkdtempSync(join(tmpdir(), 'mirrorbuilder-'));
    const res = await buildMirror({ projectId: 'p1', artifactId: 'ar_4', url: 'https://e.com', baseDir });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.meta.warnings.some(w => w.code === 'asset_error')).toBe(true);
  });

  it('empty assets list → mirror still built (just HTML/CSS/screenshot)', async () => {
    parseMock.mockResolvedValueOnce({
      ok: true,
      ingestion: { type: 'webpage', url: 'https://e.com', dom: '<html><body><p>x</p></body></html>', screenshot: '' },
      assets: [],
    });
    const baseDir = mkdtempSync(join(tmpdir(), 'mirrorbuilder-'));
    const res = await buildMirror({ projectId: 'p1', artifactId: 'ar_5', url: 'https://e.com', baseDir });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
