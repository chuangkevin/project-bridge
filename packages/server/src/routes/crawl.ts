import { Router, Request, Response } from 'express';
import { crawlWebsite, aggregateStyles, CrawledStyles, getBrowser } from '../services/websiteCrawler';
import { compileDesignTokens } from '../services/designTokenCompiler';
import db from '../db/connection';

const router = Router();

// POST /api/projects/:projectId/crawl-website
router.post('/:projectId/crawl-website', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Verify project exists
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const result = await crawlWebsite(url);

    if (!result.success) {
      return res.json({ success: false, error: result.error });
    }

    // Save crawled URL to project's crawled_urls (JSON array in DB)
    const existing = db.prepare('SELECT crawled_urls FROM projects WHERE id = ?').get(projectId) as any;
    let urls: { url: string; crawledAt: string }[] = [];
    try { urls = JSON.parse(existing?.crawled_urls || '[]'); } catch { urls = []; }

    // Add or replace this URL
    urls = urls.filter(u => u.url !== url);
    urls.push({ url, crawledAt: new Date().toISOString() });

    db.prepare('UPDATE projects SET crawled_urls = ? WHERE id = ?').run(JSON.stringify(urls), projectId);

    // Save raw crawl data for later token compilation
    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run(`crawl_${projectId}_${Buffer.from(url).toString('base64').slice(0, 20)}`, JSON.stringify(result));

    return res.json({
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
    console.error('Crawl error:', err);
    return res.status(500).json({ error: 'Failed to crawl website' });
  }
});

// POST /api/projects/:projectId/crawl-website/batch
router.post('/:projectId/crawl-website/batch', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { urls } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array is required' });
  }

  if (urls.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 URLs per batch' });
  }

  const results: CrawledStyles[] = [];
  for (const url of urls) {
    try {
      const result = await crawlWebsite(url);
      results.push(result);
    } catch {
      results.push({ url, success: false, error: 'crawl_failed', colors: [], typography: { fonts: [], sizes: [], headings: [], body: null }, buttons: [], inputs: [], backgrounds: [], borderRadii: [], shadows: [] });
    }
  }

  const aggregated = aggregateStyles(results);

  // Save aggregated to project
  const existing = db.prepare('SELECT crawled_urls FROM projects WHERE id = ?').get(projectId) as any;
  let savedUrls: { url: string; crawledAt: string }[] = [];
  try { savedUrls = JSON.parse(existing?.crawled_urls || '[]'); } catch { savedUrls = []; }

  for (const r of results.filter(r => r.success)) {
    savedUrls = savedUrls.filter(u => u.url !== r.url);
    savedUrls.push({ url: r.url, crawledAt: new Date().toISOString() });
  }
  db.prepare('UPDATE projects SET crawled_urls = ? WHERE id = ?').run(JSON.stringify(savedUrls), projectId);

  return res.json({
    success: true,
    crawled: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    aggregated,
  });
});

// POST /api/projects/:projectId/crawl-full-page
router.post('/:projectId/crawl-full-page', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Verify project exists
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const browser = await getBrowser();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

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

    // 2. Remove all <script> tags and <noscript> tags
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
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        eventAttrs.forEach(attr => el.removeAttribute(attr));
      });
    });

    // 4. Convert relative URLs to absolute for images/assets and CSS url() references
    await page.evaluate((baseOrigin: string) => {
      // Helper: resolve relative URL
      function toAbsolute(relative: string): string {
        try {
          return new URL(relative, baseOrigin).href;
        } catch {
          return relative;
        }
      }

      // Fix src attributes (img, source, video, audio, iframe)
      document.querySelectorAll('[src]').forEach(el => {
        const src = el.getAttribute('src');
        if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
          el.setAttribute('src', toAbsolute(src));
        }
      });

      // Fix href attributes on non-stylesheet links (a, area)
      document.querySelectorAll('a[href], area[href]').forEach(el => {
        const href = el.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('data:')) {
          el.setAttribute('href', toAbsolute(href));
        }
      });

      // Fix srcset attributes
      document.querySelectorAll('[srcset]').forEach(el => {
        const srcset = el.getAttribute('srcset');
        if (srcset) {
          const updated = srcset.split(',').map(entry => {
            const parts = entry.trim().split(/\s+/);
            if (parts[0] && !parts[0].startsWith('data:')) {
              parts[0] = toAbsolute(parts[0]);
            }
            return parts.join(' ');
          }).join(', ');
          el.setAttribute('srcset', updated);
        }
      });

      // Fix url() in inline styles
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

      // Fix url() in <style> blocks
      document.querySelectorAll('style').forEach(el => {
        if (el.textContent && el.textContent.includes('url(')) {
          el.textContent = el.textContent.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_match, quote, urlVal) => {
            if (urlVal.startsWith('data:') || urlVal.startsWith('blob:')) return _match;
            return `url(${quote}${toAbsolute(urlVal)}${quote})`;
          });
        }
      });

      // Fix poster attribute on video elements
      document.querySelectorAll('video[poster]').forEach(el => {
        const poster = el.getAttribute('poster');
        if (poster) el.setAttribute('poster', toAbsolute(poster));
      });
    }, origin);

    // 5. Get cleaned HTML
    const html = await page.content();

    // 6. Take screenshot (jpeg, quality 60)
    const screenshotBuffer = await page.screenshot({
      fullPage: false,
      type: 'jpeg',
      quality: 60,
    });
    const screenshot = `data:image/jpeg;base64,${screenshotBuffer.toString('base64')}`;

    await context.close();

    // 7. Also crawl for design tokens using existing function
    const tokenResult = await crawlWebsite(url);
    const tokens = tokenResult.success ? {
      colors: tokenResult.colors,
      typography: tokenResult.typography,
      buttons: tokenResult.buttons,
      inputs: tokenResult.inputs,
      backgrounds: tokenResult.backgrounds,
      borderRadii: tokenResult.borderRadii,
      shadows: tokenResult.shadows,
    } : null;

    return res.json({
      url,
      html,
      tokens,
      screenshot,
    });
  } catch (err: any) {
    console.error('Full-page crawl error:', err);
    return res.status(500).json({ error: 'Failed to crawl full page' });
  }
});

// POST /api/projects/:projectId/compile-tokens
router.post('/:projectId/compile-tokens', async (req: Request, res: Response) => {
  const { projectId } = req.params;

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const tokens = await compileDesignTokens(projectId as string);

    // Count sources
    const sources = {
      images: tokens.source.referenceImages.length,
      specs: tokens.source.specDocuments.length,
      urls: tokens.source.crawledUrls.length,
    };

    return res.json({ success: true, tokens, sources });
  } catch (err: any) {
    console.error('Token compilation error:', err);
    return res.status(500).json({ error: 'Failed to compile tokens' });
  }
});

// GET /api/projects/:projectId/design-tokens
router.get('/:projectId/design-tokens', (req: Request, res: Response) => {
  const { projectId } = req.params;
  const project = db.prepare('SELECT design_tokens FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.design_tokens) return res.json({ tokens: null });
  try {
    return res.json({ tokens: JSON.parse(project.design_tokens) });
  } catch {
    return res.json({ tokens: null });
  }
});

// PUT /api/projects/:projectId/design-tokens
router.put('/:projectId/design-tokens', (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { tokens } = req.body;
  if (!tokens) return res.status(400).json({ error: 'tokens is required' });

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  db.prepare('UPDATE projects SET design_tokens = ? WHERE id = ?').run(JSON.stringify(tokens), projectId);
  return res.json({ success: true });
});

export default router;
