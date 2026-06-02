/**
 * websiteCrawler.service.test.ts — unit tests for crawlWebsite() and aggregateStyles().
 * Playwright is mocked using vi.hoisted().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock playwright using vi.hoisted so references are available at hoist time ─
const { mockPage, mockContext, mockBrowser } = vi.hoisted(() => {
  const mockPage: any = {
    addInitScript: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue({ status: () => 200 }),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue('<html><body><h1>Test</h1></body></html>'),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('png-data')),
    evaluate: vi.fn().mockResolvedValue({
      colors: [{ value: '#3b82f6', count: 15 }, { value: '#ffffff', count: 100 }],
      fonts: [{ value: 'Arial', count: 20 }],
      sizes: [{ value: '16px', count: 30 }, { value: '14px', count: 25 }],
      headings: [{ tag: 'h1', fontFamily: 'Arial', fontSize: '32px', fontWeight: '700', color: '#1f2937', lineHeight: '1.3' }],
      bodyStyle: { fontFamily: 'Arial', fontSize: '16px', fontWeight: '400', color: '#374151', lineHeight: '1.6' },
      buttons: [{ backgroundColor: '#3b82f6', color: '#fff', fontSize: '14px', padding: '8px 16px', borderRadius: '6px', fontWeight: '500' }],
      inputs: [{ height: '40px', padding: '8px', borderRadius: '6px', borderWidth: '1px', fontSize: '14px' }],
      backgrounds: [{ element: 'body', color: '#f9fafb' }],
      borderRadii: [{ value: '6px', count: 20 }],
      shadows: [{ value: '0 1px 3px rgba(0,0,0,0.1)', count: 5 }],
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

import { crawlWebsite, aggregateStyles, looksForbiddenHtml } from '../websiteCrawler.js';

// ─── looksForbiddenHtml ───────────────────────────────────────────────────────

describe('looksForbiddenHtml', () => {
  it('returns true for 403 forbidden title', () => {
    expect(looksForbiddenHtml('<title>403 Forbidden</title>')).toBe(true);
  });
  it('returns true for access denied', () => {
    expect(looksForbiddenHtml('<body>Access Denied</body>')).toBe(true);
  });
  it('returns false for normal page', () => {
    expect(looksForbiddenHtml('<html><body><h1>Hello</h1></body></html>')).toBe(false);
  });
});

// ─── crawlWebsite ─────────────────────────────────────────────────────────────

describe('crawlWebsite', () => {
  beforeEach(() => {
    mockPage.goto.mockResolvedValue({ status: () => 200 });
    mockPage.content.mockResolvedValue('<html><body><h1>Test</h1></body></html>');
    mockBrowser.isConnected.mockReturnValue(true);
    mockBrowser.newContext.mockResolvedValue(mockContext);
  });

  it('returns error result for invalid URL', async () => {
    const result = await crawlWebsite('not-a-url');
    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_url');
    expect(result.colors).toEqual([]);
  });

  it('returns CrawledStyles shape on success', async () => {
    const result = await crawlWebsite('https://example.com');

    expect(result.success).toBe(true);
    expect(result.url).toBe('https://example.com');
    expect(Array.isArray(result.colors)).toBe(true);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.typography).toBeDefined();
    expect(Array.isArray(result.typography.fonts)).toBe(true);
    expect(Array.isArray(result.typography.headings)).toBe(true);
    expect(Array.isArray(result.buttons)).toBe(true);
    expect(Array.isArray(result.inputs)).toBe(true);
    expect(Array.isArray(result.borderRadii)).toBe(true);
    expect(Array.isArray(result.shadows)).toBe(true);
    expect(typeof result.screenshot).toBe('string');
  });

  it('returns forbidden error when page returns 403', async () => {
    mockPage.goto.mockResolvedValueOnce({ status: () => 403 });
    const result = await crawlWebsite('https://blocked.com');
    expect(result.success).toBe(false);
    expect(result.error).toBe('forbidden');
  });

  it('returns timeout error on timeout', async () => {
    mockPage.goto.mockRejectedValueOnce(new Error('Timeout exceeded: 20000ms'));
    const result = await crawlWebsite('https://slow.com');
    expect(result.success).toBe(false);
    expect(result.error).toBe('timeout');
  });
});

// ─── aggregateStyles ─────────────────────────────────────────────────────────

describe('aggregateStyles', () => {
  it('returns empty aggregation for all failed results', () => {
    const result = aggregateStyles([
      {
        url: 'https://a.com', success: false, error: 'timeout',
        colors: [], typography: { fonts: [], sizes: [], headings: [], body: null },
        buttons: [], inputs: [], backgrounds: [], borderRadii: [], shadows: [],
      },
    ]);
    expect(result.urls).toEqual([]);
    expect(result.colors).toEqual([]);
    expect(result.typography.primaryFont).toBe('sans-serif');
    expect(result.typography.secondaryFont).toBeNull();
  });

  it('merges colors and fonts across multiple successful results', () => {
    const base = {
      success: true as const,
      colors: [{ value: '#3b82f6', count: 10 }],
      typography: {
        fonts: [{ value: 'Arial', count: 20 }],
        sizes: [{ value: '16px', count: 5 }],
        headings: [] as any[],
        body: null,
      },
      buttons: [],
      inputs: [],
      backgrounds: [],
      borderRadii: [],
      shadows: [],
    };
    const result = aggregateStyles([
      { url: 'https://a.com', ...base },
      { url: 'https://b.com', ...base, colors: [{ value: '#ef4444', count: 5 }] },
    ]);
    expect(result.urls).toHaveLength(2);
    expect(result.colors.some((c) => c.value === '#3b82f6')).toBe(true);
    expect(result.typography.primaryFont).toBe('Arial');
    expect(result.crawledAt).toBeDefined();
  });
});
