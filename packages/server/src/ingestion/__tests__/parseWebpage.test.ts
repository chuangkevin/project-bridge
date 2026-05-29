import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/websiteCrawler', () => ({
  crawlWebsiteRaw: vi.fn(),
}));

import { parseWebpage } from '../parseWebpage';
import { crawlWebsiteRaw } from '../../services/websiteCrawler';

const crawlMock = crawlWebsiteRaw as ReturnType<typeof vi.fn>;

describe('parseWebpage', () => {
  beforeEach(() => {
    crawlMock.mockReset();
  });

  it('returns a successful WebpageIngestion with script/iframe stripped', async () => {
    crawlMock.mockResolvedValueOnce({
      url: 'https://example.com',
      success: true,
      screenshot: 'BASE64SCREENSHOT',
      html: '<html><head><link rel="stylesheet" href="https://cdn.example/app.css"></head><body><img src="https://cdn.example/logo.png"><script src="x.js"></script><iframe src="y"></iframe><p>hello</p></body></html>',
      inlineStylesheets: ['body{color:red;background:url(https://cdn.example/bg.jpg)}'],
    });

    const res = await parseWebpage('https://example.com');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ingestion.type).toBe('webpage');
    expect(res.ingestion.url).toBe('https://example.com');
    expect(res.ingestion.dom).not.toMatch(/<script/i);
    expect(res.ingestion.dom).not.toMatch(/<iframe/i);
    expect(res.ingestion.dom).toContain('<p>hello</p>');
    expect(res.ingestion.screenshot).toBe('BASE64SCREENSHOT');
  });

  it('extracts external asset URLs (img src, stylesheet href, css url())', async () => {
    crawlMock.mockResolvedValueOnce({
      url: 'https://example.com',
      success: true,
      screenshot: '',
      html: '<html><head><link rel="stylesheet" href="https://cdn.example/app.css"></head><body><img src="https://cdn.example/logo.png"></body></html>',
      inlineStylesheets: ['body{background:url(https://cdn.example/bg.jpg)}'],
    });
    const res = await parseWebpage('https://example.com');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.assets).toEqual(expect.arrayContaining([
      'https://cdn.example/app.css',
      'https://cdn.example/logo.png',
      'https://cdn.example/bg.jpg',
    ]));
  });

  it('returns ok=false when crawler reports timeout', async () => {
    crawlMock.mockResolvedValueOnce({ url: 'https://x', success: false, error: 'timeout', html: '', inlineStylesheets: [] });
    const res = await parseWebpage('https://x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('crawl_timeout');
  });

  it('returns ok=false when crawler reports forbidden', async () => {
    crawlMock.mockResolvedValueOnce({ url: 'https://x', success: false, error: 'forbidden', html: '', inlineStylesheets: [] });
    const res = await parseWebpage('https://x');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('crawl_forbidden');
  });

  it('returns ok=false when crawler reports invalid_url', async () => {
    crawlMock.mockResolvedValueOnce({ url: 'bad', success: false, error: 'invalid_url', html: '', inlineStylesheets: [] });
    const res = await parseWebpage('bad');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('invalid_url');
  });

  it('handles srcset attribute', async () => {
    crawlMock.mockResolvedValueOnce({
      url: 'https://e.com',
      success: true,
      screenshot: '',
      html: '<html><body><picture><source srcset="https://cdn.example/2x.png 2x, https://cdn.example/3x.png 3x"></picture></body></html>',
      inlineStylesheets: [],
    });
    const res = await parseWebpage('https://e.com');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.assets).toEqual(expect.arrayContaining(['https://cdn.example/2x.png', 'https://cdn.example/3x.png']));
  });
});
