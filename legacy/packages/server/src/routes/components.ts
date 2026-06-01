import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { chromium, Browser } from 'playwright';
import db from '../db/connection';
import { renderThumbnail, sanitizeHtml, scopeCss } from '../services/componentLibrary';

// ═══════════════════════════════════════════════════════════════
//  Component Library CRUD — mounted at /api/components
// ═══════════════════════════════════════════════════════════════
const componentsRouter = Router();

// ─── GET /api/components ──────────────────────────────────────
// List components with optional category/search/pagination
componentsRouter.get('/', (req: Request, res: Response) => {
  try {
    const { category, search, page = '1', limit = '20' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    let where = '1=1';
    const params: any[] = [];

    if (category) {
      where += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      where += ' AND (name LIKE ? OR tags LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term);
    }

    const total = (db.prepare(`SELECT COUNT(*) as count FROM components WHERE ${where}`).get(...params) as any).count;
    const items = db.prepare(
      `SELECT * FROM components WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limitNum, offset);

    res.json({ items, total, page: pageNum, limit: limitNum });
  } catch (err: any) {
    console.error('Error listing components:', err);
    res.status(500).json({ error: 'Failed to list components' });
  }
});

// ─── GET /api/components/:id ──────────────────────────────────
componentsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const component = db.prepare('SELECT * FROM components WHERE id = ?').get(req.params.id);
    if (!component) return res.status(404).json({ error: 'Component not found' });

    const versions = db.prepare(
      'SELECT * FROM component_versions WHERE component_id = ? ORDER BY version DESC'
    ).all(req.params.id);

    res.json({ ...component as any, versions });
  } catch (err: any) {
    console.error('Error getting component:', err);
    res.status(500).json({ error: 'Failed to get component' });
  }
});

// ─── POST /api/components ─────────────────────────────────────
componentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, category, html, css = '', tags } = req.body;
    if (!name || !html) {
      return res.status(400).json({ error: 'name and html are required' });
    }

    const id = uuidv4();
    const versionId = uuidv4();
    const tagsJson = typeof tags === 'string' ? tags : JSON.stringify(tags || []);

    let thumbnail: string | null = null;
    try {
      thumbnail = await renderThumbnail(html, css);
    } catch (e: any) {
      console.warn('Thumbnail generation failed:', e.message);
    }

    db.prepare(`INSERT INTO components (id, name, category, html, css, thumbnail, tags, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(id, name, category || 'other', html, css, thumbnail, tagsJson);

    db.prepare(`INSERT INTO component_versions (id, component_id, version, html, css, thumbnail)
      VALUES (?, ?, 1, ?, ?, ?)`).run(versionId, id, html, css, thumbnail);

    const component = db.prepare('SELECT * FROM components WHERE id = ?').get(id);
    res.status(201).json(component);
  } catch (err: any) {
    console.error('Error creating component:', err);
    res.status(500).json({ error: 'Failed to create component' });
  }
});

// ─── PUT /api/components/:id ──────────────────────────────────
componentsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM components WHERE id = ?').get(id) as any;
    if (!existing) return res.status(404).json({ error: 'Component not found' });

    const { name, category, html, css, tags } = req.body;
    const htmlChanged = html !== undefined && html !== existing.html;
    const cssChanged = css !== undefined && css !== existing.css;
    const contentChanged = htmlChanged || cssChanged;

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (category !== undefined) { updates.push('category = ?'); values.push(category); }
    if (html !== undefined) { updates.push('html = ?'); values.push(html); }
    if (css !== undefined) { updates.push('css = ?'); values.push(css); }
    if (tags !== undefined) {
      updates.push('tags = ?');
      values.push(typeof tags === 'string' ? tags : JSON.stringify(tags));
    }

    if (contentChanged) {
      const newVersion = existing.version + 1;

      // Save old version to component_versions
      const versionId = uuidv4();
      db.prepare(`INSERT INTO component_versions (id, component_id, version, html, css, thumbnail)
        VALUES (?, ?, ?, ?, ?, ?)`).run(versionId, id, existing.version, existing.html, existing.css, existing.thumbnail);

      // Generate new thumbnail
      const newHtml = html ?? existing.html;
      const newCss = css ?? existing.css;
      let thumbnail: string | null = null;
      try {
        thumbnail = await renderThumbnail(newHtml, newCss);
      } catch (e: any) {
        console.warn('Thumbnail generation failed:', e.message);
      }

      updates.push('version = ?');
      values.push(newVersion);
      updates.push('thumbnail = ?');
      values.push(thumbnail);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE components SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM components WHERE id = ?').get(id);
    res.json(updated);
  } catch (err: any) {
    console.error('Error updating component:', err);
    res.status(500).json({ error: 'Failed to update component' });
  }
});

// ─── DELETE /api/components/:id ───────────────────────────────
componentsRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT id FROM components WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Component not found' });

    db.prepare('DELETE FROM components WHERE id = ?').run(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    console.error('Error deleting component:', err);
    res.status(500).json({ error: 'Failed to delete component' });
  }
});

// ─── POST /api/components/extract ─────────────────────────────
// Create a component from raw HTML/CSS with sanitization + scoping
componentsRouter.post('/extract', async (req: Request, res: Response) => {
  try {
    const { html, css = '', name, category, tags, source_project_id } = req.body;
    if (!html || !name) {
      return res.status(400).json({ error: 'html and name are required' });
    }

    const id = uuidv4();
    const versionId = uuidv4();
    const cleanHtml = sanitizeHtml(html);
    const scopedCss = scopeCss(css, id);
    const tagsJson = typeof tags === 'string' ? tags : JSON.stringify(tags || []);

    let thumbnail: string | null = null;
    try {
      thumbnail = await renderThumbnail(cleanHtml, scopedCss);
    } catch (e: any) {
      console.warn('Thumbnail generation failed:', e.message);
    }

    db.prepare(`INSERT INTO components (id, name, category, html, css, thumbnail, tags, source_project_id, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(
      id, name, category || 'other', cleanHtml, scopedCss, thumbnail, tagsJson, source_project_id || null
    );

    db.prepare(`INSERT INTO component_versions (id, component_id, version, html, css, thumbnail)
      VALUES (?, ?, 1, ?, ?, ?)`).run(versionId, id, cleanHtml, scopedCss, thumbnail);

    const component = db.prepare('SELECT * FROM components WHERE id = ?').get(id);
    res.status(201).json(component);
  } catch (err: any) {
    console.error('Error extracting component:', err);
    res.status(500).json({ error: 'Failed to extract component' });
  }
});

// ─── POST /api/components/crawl-extract ───────────────────────
// Open URL in Playwright, extract components by semantic selectors
let crawlBrowser: Browser | null = null;
async function getCrawlBrowser(): Promise<Browser> {
  if (!crawlBrowser || !crawlBrowser.isConnected()) {
    crawlBrowser = await chromium.launch({ headless: true });
  }
  return crawlBrowser;
}

interface ExtractedComponent {
  category: string;
  html: string;
  css: string;
  selector: string;
  tagName: string;
  textPreview: string;
}

componentsRouter.post('/crawl-extract', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }

    // Validate URL
    try { new URL(url); } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const browser = await getCrawlBrowser();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

    // Category selectors mapping
    const categorySelectors: Record<string, string[]> = {
      navigation: ['nav', '[role="navigation"]', '.navbar', 'header nav'],
      card: ['.card', 'article', '.listing-item'],
      button: ['button', '.btn', '[role="button"]'],
      form: ['form', '.search-bar'],
      hero: ['.hero', '.banner'],
      footer: ['footer'],
      modal: ['.modal', '[role="dialog"]'],
      table: ['table', '[role="grid"]'],
    };

    // Extract components from the page (string evaluate to avoid TS checking browser globals)
    const extracted: ExtractedComponent[] = await page.evaluate(`((catSelectors) => {
      const results = [];
      const seen = new Set();

      function getStructureKey(el) {
        const children = Array.from(el.children).map(c => c.tagName.toLowerCase()).join(',');
        return el.tagName.toLowerCase() + '[' + children + ']';
      }

      function getRelevantStyles(el) {
        const cs = getComputedStyle(el);
        const props = [
          'display', 'position', 'width', 'height', 'max-width', 'min-height',
          'padding', 'margin', 'background-color', 'color', 'font-family', 'font-size',
          'font-weight', 'line-height', 'border', 'border-radius', 'box-shadow',
          'flex-direction', 'align-items', 'justify-content', 'gap', 'grid-template-columns',
          'text-align', 'text-decoration', 'overflow'
        ];
        const styles = {};
        for (const p of props) {
          const val = cs.getPropertyValue(p);
          if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px') {
            styles[p] = val;
          }
        }
        return styles;
      }

      function stylesToCss(selector, styles) {
        const entries = Object.entries(styles);
        if (entries.length === 0) return '';
        return selector + ' {\\n' + entries.map(([k, v]) => '  ' + k + ': ' + v + ';').join('\\n') + '\\n}';
      }

      for (const [category, selectors] of Object.entries(catSelectors)) {
        for (const sel of selectors) {
          let elements;
          try {
            elements = Array.from(document.querySelectorAll(sel));
          } catch (e) {
            continue;
          }

          for (const el of elements) {
            const structKey = category + ':' + getStructureKey(el);
            if (seen.has(structKey)) continue;
            seen.add(structKey);

            const outerHTML = el.outerHTML;
            if (outerHTML.length < 20) continue;
            if (outerHTML.length > 50000) continue;

            const styles = getRelevantStyles(el);
            const className = '.extracted-' + category + '-' + results.length;
            const css = stylesToCss(className, styles);

            let childCss = '';
            Array.from(el.children).slice(0, 10).forEach((child, i) => {
              const childStyles = getRelevantStyles(child);
              childCss += stylesToCss(className + ' > :nth-child(' + (i + 1) + ')', childStyles);
            });

            results.push({
              category: category,
              html: outerHTML,
              css: css + '\\n' + childCss,
              selector: sel,
              tagName: el.tagName.toLowerCase(),
              textPreview: (el.textContent || '').trim().slice(0, 100),
            });
          }
        }
      }

      return results;
    })(${JSON.stringify(categorySelectors)})`);

    await context.close();

    // Generate thumbnails for each extracted component (limit to first 20)
    const previews = [];
    for (const comp of extracted.slice(0, 20)) {
      let thumbnail: string | null = null;
      try {
        thumbnail = await renderThumbnail(sanitizeHtml(comp.html), comp.css);
      } catch {
        // Thumbnail generation is best-effort
      }
      previews.push({
        ...comp,
        html: sanitizeHtml(comp.html),
        thumbnail,
      });
    }

    res.json({ url, components: previews, total: extracted.length });
  } catch (err: any) {
    console.error('Error crawl-extracting components:', err);
    if (err.message?.includes('timeout') || err.message?.includes('Timeout')) {
      return res.status(504).json({ error: 'Page load timed out' });
    }
    res.status(500).json({ error: 'Failed to crawl and extract components' });
  }
});

// ─── POST /api/components/crawl-extract/batch ────────────────
// Batch crawl multiple URLs with cross-page deduplication
componentsRouter.post('/crawl-extract/batch', async (req: Request, res: Response) => {
  try {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'urls array is required' });
    }
    if (urls.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 URLs per batch' });
    }

    // Validate all URLs upfront
    for (const url of urls) {
      try { new URL(url); } catch {
        return res.status(400).json({ error: `Invalid URL: ${url}` });
      }
    }

    const browser = await getCrawlBrowser();

    // Category selectors mapping (same as single crawl)
    const categorySelectors: Record<string, string[]> = {
      navigation: ['nav', '[role="navigation"]', '.navbar', 'header nav'],
      card: ['.card', 'article', '.listing-item'],
      button: ['button', '.btn', '[role="button"]'],
      form: ['form', '.search-bar'],
      hero: ['.hero', '.banner'],
      footer: ['footer'],
      modal: ['.modal', '[role="dialog"]'],
      table: ['table', '[role="grid"]'],
    };

    const extractionScript = `((catSelectors) => {
      const results = [];
      const seen = new Set();

      function getStructureKey(el) {
        const children = Array.from(el.children).map(c => c.tagName.toLowerCase()).join(',');
        return el.tagName.toLowerCase() + '[' + children + ']';
      }

      function getRelevantStyles(el) {
        const cs = getComputedStyle(el);
        const props = [
          'display', 'position', 'width', 'height', 'max-width', 'min-height',
          'padding', 'margin', 'background-color', 'color', 'font-family', 'font-size',
          'font-weight', 'line-height', 'border', 'border-radius', 'box-shadow',
          'flex-direction', 'align-items', 'justify-content', 'gap', 'grid-template-columns',
          'text-align', 'text-decoration', 'overflow'
        ];
        const styles = {};
        for (const p of props) {
          const val = cs.getPropertyValue(p);
          if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px') {
            styles[p] = val;
          }
        }
        return styles;
      }

      function stylesToCss(selector, styles) {
        const entries = Object.entries(styles);
        if (entries.length === 0) return '';
        return selector + ' {\\n' + entries.map(([k, v]) => '  ' + k + ': ' + v + ';').join('\\n') + '\\n}';
      }

      for (const [category, selectors] of Object.entries(catSelectors)) {
        for (const sel of selectors) {
          let elements;
          try {
            elements = Array.from(document.querySelectorAll(sel));
          } catch (e) {
            continue;
          }

          for (const el of elements) {
            const structKey = category + ':' + getStructureKey(el);
            if (seen.has(structKey)) continue;
            seen.add(structKey);

            const outerHTML = el.outerHTML;
            if (outerHTML.length < 20) continue;
            if (outerHTML.length > 50000) continue;

            const styles = getRelevantStyles(el);
            const className = '.extracted-' + category + '-' + results.length;
            const css = stylesToCss(className, styles);

            let childCss = '';
            Array.from(el.children).slice(0, 10).forEach((child, i) => {
              const childStyles = getRelevantStyles(child);
              childCss += stylesToCss(className + ' > :nth-child(' + (i + 1) + ')', childStyles);
            });

            results.push({
              category: category,
              html: outerHTML,
              css: css + '\\n' + childCss,
              selector: sel,
              tagName: el.tagName.toLowerCase(),
              textPreview: (el.textContent || '').trim().slice(0, 100),
            });
          }
        }
      }

      return results;
    })`;

    // Crawl each URL sequentially (to limit resource usage)
    const perUrlResults: { url: string; components: ExtractedComponent[] }[] = [];
    for (const url of urls) {
      try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        const extracted: ExtractedComponent[] = await page.evaluate(
          `${extractionScript}(${JSON.stringify(categorySelectors)})`
        );
        await context.close();

        perUrlResults.push({ url, components: extracted });
      } catch (crawlErr: any) {
        // Record empty result for failed URLs instead of aborting entire batch
        console.warn(`Batch crawl failed for ${url}:`, crawlErr.message);
        perUrlResults.push({ url, components: [] });
      }
    }

    // ── Cross-page deduplication ──────────────────────────────
    // Normalize HTML structure for comparison: strip text content,
    // collapse whitespace, lowercase tags
    function normalizeStructure(html: string): string {
      return html
        .replace(/>([^<]+)</g, '><')    // strip text between tags
        .replace(/\s+/g, ' ')           // collapse whitespace
        .replace(/<([a-z0-9]+)/gi, (_, tag) => `<${tag.toLowerCase()}`)  // lowercase tags
        .replace(/\s*(class|id|style|href|src|alt|title|data-[a-z-]+)="[^"]*"/gi, '') // strip attributes
        .trim();
    }

    // Compute similarity ratio between two normalized strings (Dice coefficient on bigrams)
    function structuralSimilarity(a: string, b: string): number {
      if (a === b) return 1;
      if (a.length < 2 || b.length < 2) return 0;

      const bigramsA = new Map<string, number>();
      for (let i = 0; i < a.length - 1; i++) {
        const bg = a.substring(i, i + 2);
        bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
      }

      let matches = 0;
      for (let i = 0; i < b.length - 1; i++) {
        const bg = b.substring(i, i + 2);
        const count = bigramsA.get(bg) || 0;
        if (count > 0) {
          matches++;
          bigramsA.set(bg, count - 1);
        }
      }

      return (2 * matches) / ((a.length - 1) + (b.length - 1));
    }

    // Build a global list with source URL, then deduplicate
    interface TaggedComponent extends ExtractedComponent {
      sourceUrl: string;
      deduplicated?: boolean;
      originalUrl?: string;
    }

    const allComponents: TaggedComponent[] = [];
    for (const result of perUrlResults) {
      for (const comp of result.components) {
        allComponents.push({ ...comp, sourceUrl: result.url });
      }
    }

    const totalBeforeDedup = allComponents.length;
    const kept: TaggedComponent[] = [];
    const keptNorms: { norm: string; tag: string; category: string }[] = [];

    for (const comp of allComponents) {
      const norm = normalizeStructure(comp.html);
      let isDuplicate = false;

      for (let i = 0; i < keptNorms.length; i++) {
        // Only compare components with same tag + category
        if (keptNorms[i].tag === comp.tagName && keptNorms[i].category === comp.category) {
          const sim = structuralSimilarity(norm, keptNorms[i].norm);
          if (sim > 0.8) {
            isDuplicate = true;
            // Mark as duplicate referencing the original
            kept.push({
              ...comp,
              deduplicated: true,
              originalUrl: kept[i].sourceUrl,
            });
            break;
          }
        }
      }

      if (!isDuplicate) {
        kept.push(comp);
        keptNorms.push({ norm, tag: comp.tagName, category: comp.category });
      }
    }

    // Filter out deduplicated items from final results
    const uniqueComponents = kept.filter(c => !c.deduplicated);
    const duplicatesRemoved = totalBeforeDedup - uniqueComponents.length;

    // Generate thumbnails and sanitize HTML (limit to 20 per URL)
    const results: { url: string; components: any[] }[] = [];
    for (const result of perUrlResults) {
      const urlComponents = uniqueComponents
        .filter(c => c.sourceUrl === result.url)
        .slice(0, 20);

      const previews = [];
      for (const comp of urlComponents) {
        let thumbnail: string | null = null;
        try {
          thumbnail = await renderThumbnail(sanitizeHtml(comp.html), comp.css);
        } catch {
          // Thumbnail generation is best-effort
        }
        previews.push({
          category: comp.category,
          html: sanitizeHtml(comp.html),
          css: comp.css,
          selector: comp.selector,
          tagName: comp.tagName,
          textPreview: comp.textPreview,
          thumbnail,
        });
      }
      results.push({ url: result.url, components: previews });
    }

    res.json({
      results,
      dedupedTotal: uniqueComponents.length,
      duplicatesRemoved,
    });
  } catch (err: any) {
    console.error('Error batch crawl-extracting components:', err);
    res.status(500).json({ error: 'Failed to batch crawl and extract components' });
  }
});

// ═══════════════════════════════════════════════════════════════
//  Project-Component Bindings — mounted at /api/projects
// ═══════════════════════════════════════════════════════════════
const projectComponentsRouter = Router();

// ─── GET /api/projects/:id/components ─────────────────────────
projectComponentsRouter.get('/:id/components', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const components = db.prepare(`
      SELECT c.*, pcb.bound_at
      FROM components c
      JOIN project_component_bindings pcb ON pcb.component_id = c.id
      WHERE pcb.project_id = ?
      ORDER BY pcb.bound_at DESC
    `).all(id);

    res.json(components);
  } catch (err: any) {
    console.error('Error getting project components:', err);
    res.status(500).json({ error: 'Failed to get project components' });
  }
});

// ─── POST /api/projects/:id/components/bind ───────────────────
projectComponentsRouter.post('/:id/components/bind', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { componentId } = req.body;
    if (!componentId) return res.status(400).json({ error: 'componentId is required' });

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const component = db.prepare('SELECT id FROM components WHERE id = ?').get(componentId);
    if (!component) return res.status(404).json({ error: 'Component not found' });

    const bindingId = uuidv4();
    try {
      db.prepare(`INSERT INTO project_component_bindings (id, project_id, component_id)
        VALUES (?, ?, ?)`).run(bindingId, id, componentId);
    } catch (e: any) {
      // UNIQUE constraint violation — already bound, that's fine
      if (e.message?.includes('UNIQUE constraint')) {
        return res.json({ success: true, message: 'Already bound' });
      }
      throw e;
    }

    res.status(201).json({ success: true, bindingId });
  } catch (err: any) {
    console.error('Error binding component to project:', err);
    res.status(500).json({ error: 'Failed to bind component' });
  }
});

// ─── DELETE /api/projects/:id/components/:componentId ─────────
projectComponentsRouter.delete('/:id/components/:componentId', (req: Request, res: Response) => {
  try {
    const { id, componentId } = req.params;
    const result = db.prepare(
      'DELETE FROM project_component_bindings WHERE project_id = ? AND component_id = ?'
    ).run(id, componentId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Binding not found' });
    }

    res.status(204).send();
  } catch (err: any) {
    console.error('Error unbinding component from project:', err);
    res.status(500).json({ error: 'Failed to unbind component' });
  }
});

export default componentsRouter;
export { projectComponentsRouter };
