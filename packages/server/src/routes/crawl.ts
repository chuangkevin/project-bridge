import { Router, Request, Response } from 'express';
import { crawlWebsite, aggregateStyles, CrawledStyles } from '../services/websiteCrawler';
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

export default router;
