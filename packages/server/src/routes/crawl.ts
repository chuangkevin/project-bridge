/**
 * crawl.ts — URL crawler and design token routes for M1.
 *
 * POST   /api/projects/:id/crawl-website          — crawl a single URL
 * POST   /api/projects/:id/crawl-website/batch    — crawl up to 10 URLs
 * POST   /api/projects/:id/crawl-full-page        — Playwright full-page render + HTML cleanup
 * POST   /api/projects/:id/compile-tokens         — compile design tokens from all sources
 * GET    /api/projects/:id/design-tokens          — get current design tokens
 * PUT    /api/projects/:id/design-tokens          — update / override design tokens
 */
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { getProject } from '../services/projectService.js';
import {
  crawlWebsite,
  aggregateStyles,
  getBrowser,
  getCrawlerContextOptions,
  applyCrawlerStealth,
  looksForbiddenHtml,
  type CrawledStyles,
} from '../services/websiteCrawler.js';
import { compileDesignTokens } from '../services/designTokenCompiler.js';

function upsertSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function buildCrawlRouter(db: Database.Database, _dataDir: string): Router {
  const r = Router({ mergeParams: true });

  // POST /api/projects/:id/crawl-website
  r.post('/crawl-website', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'URL is required' } });
      return;
    }
    try { new URL(url); } catch {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Invalid URL' } });
      return;
    }

    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    try {
      const result = await crawlWebsite(url);

      if (!result.success) {
        res.json({ success: false, error: result.error });
        return;
      }

      // Persist crawled URL list on project
      const row = db.prepare('SELECT crawled_urls FROM projects WHERE id = ?').get(projectId) as any;
      let urls: { url: string; crawledAt: string }[] = [];
      try { urls = JSON.parse(row?.crawled_urls || '[]'); } catch { urls = []; }
      urls = urls.filter(u => u.url !== url);
      urls.push({ url, crawledAt: new Date().toISOString() });
      db.prepare("UPDATE projects SET crawled_urls = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(urls), projectId);

      // Persist raw crawl data for token compilation
      const settingsKey = `crawl_${projectId}_${Buffer.from(url).toString('base64').slice(0, 20)}`;
      upsertSetting(db, settingsKey, JSON.stringify(result));

      res.json({
        success: true,
        styles: {
          colors: result.colors.slice(0, 20),
          typography: result.typography,
          buttons: result.buttons.slice(0, 5),
          inputs: result.inputs.slice(0, 3),
          backgrounds: result.backgrounds,
          borderRadii: result.borderRadii.slice(0, 5),
          shadows: result.shadows.slice(0, 3),
        },
        screenshot: result.screenshot ? `data:image/png;base64,${result.screenshot}` : null,
      });
    } catch (err: any) {
      console.error('[crawl] crawl-website error:', err);
      res.status(500).json({ error: { code: 'CRAWL_FAILED', message: 'Failed to crawl website' } });
    }
  });

  // POST /api/projects/:id/crawl-website/batch
  r.post('/crawl-website/batch', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { urls } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'urls array is required' } });
      return;
    }
    if (urls.length > 10) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Maximum 10 URLs per batch' } });
      return;
    }

    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const results: CrawledStyles[] = [];
    for (const url of urls) {
      try {
        const result = await crawlWebsite(url);
        results.push(result);

        if (result.success) {
          const settingsKey = `crawl_${projectId}_${Buffer.from(url).toString('base64').slice(0, 20)}`;
          upsertSetting(db, settingsKey, JSON.stringify(result));
        }
      } catch {
        results.push({
          url, success: false, error: 'crawl_failed',
          colors: [], typography: { fonts: [], sizes: [], headings: [], body: null },
          buttons: [], inputs: [], backgrounds: [], borderRadii: [], shadows: [],
        });
      }
    }

    const aggregated = aggregateStyles(results);

    // Persist crawled URL list
    const row = db.prepare('SELECT crawled_urls FROM projects WHERE id = ?').get(projectId) as any;
    let savedUrls: { url: string; crawledAt: string }[] = [];
    try { savedUrls = JSON.parse(row?.crawled_urls || '[]'); } catch { savedUrls = []; }
    for (const r of results.filter(r => r.success)) {
      savedUrls = savedUrls.filter(u => u.url !== r.url);
      savedUrls.push({ url: r.url, crawledAt: new Date().toISOString() });
    }
    db.prepare("UPDATE projects SET crawled_urls = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(savedUrls), projectId);

    res.json({
      success: true,
      crawled: results.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      aggregated,
    });
  });

  // POST /api/projects/:id/crawl-full-page
  r.post('/crawl-full-page', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'URL is required' } });
      return;
    }
    let parsedUrl: URL;
    try { parsedUrl = new URL(url); } catch {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Invalid URL' } });
      return;
    }

    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    let context: any = null;
    try {
      const browser = await getBrowser();
      context = await browser.newContext(getCrawlerContextOptions());
      const page = await context.newPage();

      await applyCrawlerStealth(page);

      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

      const initialHtml = await page.content();
      if ((response && response.status() === 403) || looksForbiddenHtml(initialHtml)) {
        await context.close();
        res.status(422).json({ error: { code: 'FORBIDDEN', message: '目標網站拒絕爬取，請改用可公開存取且未阻擋機器瀏覽的頁面。' } });
        return;
      }

      const origin = parsedUrl.origin;

      // 1. Inline external CSS stylesheets
      await page.evaluate(async () => {
        const linkEls = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
        for (const link of linkEls) {
          const href = (link as HTMLLinkElement).href;
          if (!href) continue;
          try {
            const resp = await fetch(href);
            if (resp.ok) {
              const cssText = await resp.text();
              const style = document.createElement('style');
              style.textContent = cssText;
              link.parentNode?.replaceChild(style, link);
            }
          } catch {
            // Skip stylesheets that fail to fetch
          }
        }
      });

      // 2. Remove all <script> and <noscript> tags
      await page.evaluate(() => {
        document.querySelectorAll('script, noscript').forEach(el => el.remove());
      });

      // 3. Remove inline event handlers
      await page.evaluate(() => {
        const eventAttrs = [
          'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover', 'onmouseout', 'onmousemove',
          'onkeydown', 'onkeyup', 'onkeypress', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
          'onload', 'onunload', 'onerror', 'onresize', 'onscroll', 'oninput', 'oncontextmenu',
          'ontouchstart', 'ontouchmove', 'ontouchend', 'onanimationend', 'ontransitionend',
        ];
        document.querySelectorAll('*').forEach(el => {
          eventAttrs.forEach(attr => el.removeAttribute(attr));
        });
      });

      // 4. Convert relative URLs to absolute
      await page.evaluate((baseOrigin: string) => {
        function toAbsolute(relative: string): string {
          try { return new URL(relative, baseOrigin).href; } catch { return relative; }
        }
        document.querySelectorAll('[src]').forEach(el => {
          const src = el.getAttribute('src');
          if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
            el.setAttribute('src', toAbsolute(src));
          }
        });
        document.querySelectorAll('a[href], area[href]').forEach(el => {
          const href = el.getAttribute('href');
          if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('data:')) {
            el.setAttribute('href', toAbsolute(href));
          }
        });
        document.querySelectorAll('[srcset]').forEach(el => {
          const srcset = el.getAttribute('srcset');
          if (srcset) {
            const updated = srcset.split(',').map(entry => {
              const parts = entry.trim().split(/\s+/);
              if (parts[0] && !parts[0].startsWith('data:')) parts[0] = toAbsolute(parts[0]);
              return parts.join(' ');
            }).join(', ');
            el.setAttribute('srcset', updated);
          }
        });
        document.querySelectorAll('[style]').forEach(el => {
          const style = el.getAttribute('style');
          if (style && style.includes('url(')) {
            const updated = style.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_match, quote, urlVal) => {
              if (urlVal.startsWith('data:') || urlVal.startsWith('blob:')) return _match;
              return `url(${quote}${toAbsolute(urlVal)}${quote})`;
            });
            el.setAttribute('style', updated);
          }
        });
        document.querySelectorAll('style').forEach(el => {
          if (el.textContent && el.textContent.includes('url(')) {
            el.textContent = el.textContent.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_match, quote, urlVal) => {
              if (urlVal.startsWith('data:') || urlVal.startsWith('blob:')) return _match;
              return `url(${quote}${toAbsolute(urlVal)}${quote})`;
            });
          }
        });
        document.querySelectorAll('video[poster]').forEach(el => {
          const poster = el.getAttribute('poster');
          if (poster) el.setAttribute('poster', toAbsolute(poster));
        });
      }, origin);

      const html = await page.content();

      // Screenshot (jpeg, quality 60)
      const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 60 });
      const screenshot = `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`;

      await context.close();

      // Also extract design tokens (with timeout)
      const tokenResult = await Promise.race([
        crawlWebsite(url),
        new Promise<{ success: false }>((resolve) => setTimeout(() => resolve({ success: false } as any), 15000)),
      ]);
      const tokens = tokenResult.success ? {
        colors: tokenResult.colors,
        typography: tokenResult.typography,
        buttons: tokenResult.buttons,
        inputs: tokenResult.inputs,
        backgrounds: tokenResult.backgrounds,
        borderRadii: tokenResult.borderRadii,
        shadows: tokenResult.shadows,
      } : null;

      res.json({ url, html, tokens, screenshot });
    } catch (err: any) {
      try { await context?.close(); } catch {}
      console.error('[crawl] crawl-full-page error:', err);
      res.status(500).json({ error: { code: 'CRAWL_FAILED', message: 'Failed to crawl full page' } });
    }
  });

  // POST /api/projects/:id/compile-tokens
  r.post('/compile-tokens', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    try {
      const tokens = await compileDesignTokens(db, projectId);
      res.json({
        success: true,
        tokens,
        sources: {
          images: tokens.source.referenceImages.length,
          specs: tokens.source.specDocuments.length,
          urls: tokens.source.crawledUrls.length,
        },
      });
    } catch (err: any) {
      console.error('[crawl] compile-tokens error:', err);
      res.status(500).json({ error: { code: 'COMPILE_FAILED', message: 'Failed to compile tokens' } });
    }
  });

  // GET /api/projects/:id/design-tokens
  r.get('/design-tokens', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const row = db.prepare('SELECT design_tokens FROM projects WHERE id = ?').get(projectId) as any;
    if (!row) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    if (!row.design_tokens) { res.json({ tokens: null }); return; }
    try {
      res.json({ tokens: JSON.parse(row.design_tokens) });
    } catch {
      res.json({ tokens: null });
    }
  });

  // PUT /api/projects/:id/design-tokens
  r.put('/design-tokens', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { tokens } = req.body;
    if (!tokens) { res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'tokens is required' } }); return; }
    const project = getProject(db, projectId);
    if (!project) { res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } }); return; }
    db.prepare("UPDATE projects SET design_tokens = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(tokens), projectId);
    res.json({ success: true });
  });

  return r;
}
