import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestionCache } from '../ingestionCache';
import type { WebpageIngestion } from '@designbridge/ast';

describe('ingestionCache', () => {
  beforeEach(() => { ingestionCache.clear(); });

  it('returns undefined on miss', () => {
    expect(ingestionCache.get('p1', 'https://e.com')).toBeUndefined();
  });

  it('round-trips set/get', () => {
    const ing: WebpageIngestion = { type: 'webpage', url: 'https://e.com', dom: '<x/>' };
    ingestionCache.set('p1', 'https://e.com', ing, { assets: ['a', 'b'] });
    const got = ingestionCache.get('p1', 'https://e.com');
    expect(got?.ingestion).toEqual(ing);
    expect(got?.assets).toEqual(['a', 'b']);
  });

  it('expires after TTL', () => {
    vi.useFakeTimers();
    const ing: WebpageIngestion = { type: 'webpage', url: 'https://e.com', dom: '<x/>' };
    ingestionCache.set('p1', 'https://e.com', ing, { assets: [] });
    vi.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
    expect(ingestionCache.get('p1', 'https://e.com')).toBeUndefined();
    vi.useRealTimers();
  });

  it('keys by (projectId, url) tuple — different projects do not see each other', () => {
    const ing: WebpageIngestion = { type: 'webpage', url: 'https://e.com', dom: '<x/>' };
    ingestionCache.set('p1', 'https://e.com', ing, { assets: [] });
    expect(ingestionCache.get('p2', 'https://e.com')).toBeUndefined();
  });
});
