import * as cheerio from 'cheerio';
import { crawlWebsiteRaw } from '../services/websiteCrawler';
import type { WebpageIngestion } from '@designbridge/ast';

export type ParseWebpageReason = 'crawl_timeout' | 'crawl_forbidden' | 'invalid_url' | 'crawl_unknown';

export type ParseWebpageResult =
  | { ok: true; ingestion: WebpageIngestion; assets: string[] }
  | { ok: false; reason: ParseWebpageReason; detail?: string };

const RX_CSS_URL = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;

function reasonFromError(err?: string): ParseWebpageReason {
  if (err === 'timeout') return 'crawl_timeout';
  if (err === 'forbidden') return 'crawl_forbidden';
  if (err === 'invalid_url') return 'invalid_url';
  return 'crawl_unknown';
}

function extractCssUrls(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(RX_CSS_URL)) {
    const u = m[1];
    if (u && /^https?:/i.test(u)) out.push(u);
  }
  return out;
}

export async function parseWebpage(url: string): Promise<ParseWebpageResult> {
  const raw = await crawlWebsiteRaw(url);
  if (!raw.success) return { ok: false, reason: reasonFromError(raw.error), detail: raw.error };

  const $ = cheerio.load(raw.html);
  $('script, iframe, noscript').remove();

  const assets = new Set<string>();
  $('img[src]').each((_, el) => {
    const s = $(el).attr('src');
    if (s && /^https?:/i.test(s)) assets.add(s);
  });
  $('link[rel="stylesheet"][href]').each((_, el) => {
    const s = $(el).attr('href');
    if (s && /^https?:/i.test(s)) assets.add(s);
  });
  $('source[srcset], img[srcset]').each((_, el) => {
    const ss = $(el).attr('srcset') ?? '';
    for (const part of ss.split(',')) {
      const u = part.trim().split(/\s+/)[0];
      if (u && /^https?:/i.test(u)) assets.add(u);
    }
  });
  for (const sheet of raw.inlineStylesheets) {
    for (const u of extractCssUrls(sheet)) assets.add(u);
  }

  const dom = $.html();

  return {
    ok: true,
    ingestion: { type: 'webpage', url: raw.url, dom, screenshot: raw.screenshot },
    assets: [...assets],
  };
}
