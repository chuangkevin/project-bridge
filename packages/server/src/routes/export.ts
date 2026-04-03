import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { exportToFramework, Framework } from '../services/codeExporter';
import { parseHtmlToFigma } from '../services/figmaExport';

const router = Router();

// POST /api/projects/:id/export-code
router.post('/:id/export-code', async (req: Request, res: Response) => {
  const projectId = req.params.id as string;
  const { framework } = req.body;

  const validFrameworks: Framework[] = ['react', 'vue3', 'nextjs', 'nuxt3', 'html'];
  if (!framework || !validFrameworks.includes(framework)) {
    return res.status(400).json({ error: `Invalid framework. Choose: ${validFrameworks.join(', ')}` });
  }

  const project = db.prepare('SELECT id, design_tokens FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const version = db.prepare(
    'SELECT html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
  ).get(projectId) as { html: string } | undefined;
  if (!version) return res.status(404).json({ error: 'No prototype found' });

  let designTokens = null;
  try { designTokens = project.design_tokens ? JSON.parse(project.design_tokens) : null; } catch {}

  const bindings = db.prepare(
    'SELECT * FROM api_bindings WHERE project_id = ?'
  ).all(projectId) as any[];

  try {
    const result = await exportToFramework(
      version.html,
      framework as Framework,
      designTokens,
      bindings || [],
      projectId,
    );

    // Return as JSON (client can generate zip or download individual files)
    return res.json({
      framework,
      files: result.files,
      totalFiles: result.files.length,
    });
  } catch (err: any) {
    console.error('Export error:', err);
    return res.status(500).json({ error: 'Export failed: ' + (err.message || '').slice(0, 200) });
  }
});

// POST /api/projects/:id/export/figma — export prototype to Figma via code.to.design API
router.post('/:id/export/figma', async (req: Request, res: Response) => {
  const projectId = req.params.id as string;
  const { viewport = 'desktop' } = req.body;

  // Get current prototype HTML
  const proto = db.prepare(
    'SELECT html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
  ).get(projectId) as { html: string } | undefined;
  if (!proto?.html) return res.status(404).json({ error: 'No prototype found' });

  // Get code.to.design API key
  const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'code_to_design_api_key'").get() as { value: string } | undefined;
  if (!apiKeyRow?.value) return res.status(400).json({ error: 'code.to.design API key not configured' });

  const widthMap: Record<string, number> = { desktop: 1440, tablet: 768, mobile: 390 };
  const width = widthMap[viewport] || 1440;

  // Pre-process HTML: wrap elements with data-component-ref in Figma component hints
  let processedHtml = proto.html;
  const componentRefRegex = /data-component-ref="([^"]+)"/g;
  const refIds = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = componentRefRegex.exec(proto.html)) !== null) {
    refIds.add(match[1]);
  }

  if (refIds.size > 0) {
    // Look up component metadata for each ref
    const refIdsArr = [...refIds];
    const refPlaceholders = refIdsArr.map(() => '?').join(',');
    const refComponents = db.prepare(
      `SELECT id, name, category FROM components WHERE id IN (${refPlaceholders})`
    ).all(...refIdsArr) as { id: string; name: string; category: string }[];

    // For each component ref found, wrap the element with a figma component hint
    for (const comp of refComponents) {
      const escapedId = comp.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const tagRegex = new RegExp(
        `(<[^>]*data-component-ref="${escapedId}"[^>]*>)`,
        'g'
      );
      processedHtml = processedHtml.replace(
        tagRegex,
        `<div data-figma-component="${comp.category}/${comp.name}">$1`
      );
      // Note: closing </div> for wrapper won't perfectly match in all cases,
      // but code.to.design uses the attribute as a hint, so partial wrapping is acceptable
    }
  }

  try {
    const response = await fetch('https://api.to.design/html', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeyRow.value}`,
      },
      body: JSON.stringify({
        html: processedHtml,
        width,
        clip: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: `code.to.design error: ${err}` });
    }

    const data = await response.json();
    return res.json({ clipboardData: data });
  } catch (err: any) {
    console.error('Figma export error:', err);
    return res.status(500).json({ error: 'Failed to call code.to.design API' });
  }
});

// POST /api/projects/:id/export/figma-components — export component library elements to Figma
router.post('/:id/export/figma-components', async (req: Request, res: Response) => {
  const projectId = req.params.id as string;
  const { componentIds, viewport = 'desktop' } = req.body;

  if (!Array.isArray(componentIds) || componentIds.length === 0) {
    return res.status(400).json({ error: 'componentIds array is required' });
  }

  if (componentIds.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 components per export' });
  }

  // Get code.to.design API key
  const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'code_to_design_api_key'").get() as { value: string } | undefined;
  if (!apiKeyRow?.value) return res.status(400).json({ error: 'code.to.design API key not configured' });

  // Fetch selected components from DB
  const placeholders = componentIds.map(() => '?').join(',');
  const components = db.prepare(
    `SELECT id, name, category, html, css FROM components WHERE id IN (${placeholders})`
  ).all(...componentIds) as { id: string; name: string; category: string; html: string; css: string }[];

  if (components.length === 0) {
    return res.status(404).json({ error: 'No components found' });
  }

  const widthMap: Record<string, number> = { desktop: 1440, tablet: 768, mobile: 390 };
  const width = widthMap[viewport] || 1440;

  // Build an HTML page with all selected components laid out side-by-side
  const componentBlocks = components.map(c => {
    const categoryName = c.category || 'other';
    const wrappedHtml = c.html.replace(
      /^(<\w+)/,
      `$1 data-component-ref="${c.id}"`
    );
    return `
      <div data-figma-component="${categoryName}/${c.name}" style="flex: 0 0 auto; padding: 20px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="font-size: 11px; color: #64748b; margin-bottom: 8px; font-family: sans-serif;">${categoryName} / ${c.name}</div>
        ${wrappedHtml}
      </div>`;
  }).join('\n');

  const allCss = components.map(c => c.css || '').filter(Boolean).join('\n');

  const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #f1f5f9; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.components-grid { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
${allCss}
</style></head><body>
<div class="components-grid">
${componentBlocks}
</div>
</body></html>`;

  try {
    const response = await fetch('https://api.to.design/html', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeyRow.value}`,
      },
      body: JSON.stringify({
        html: fullHtml,
        width,
        clip: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: `code.to.design error: ${err}` });
    }

    const data = await response.json();
    return res.json({
      clipboardData: data,
      exportedCount: components.length,
      componentNames: components.map(c => `${c.category}/${c.name}`),
    });
  } catch (err: any) {
    console.error('Figma component export error:', err);
    return res.status(500).json({ error: 'Failed to call code.to.design API' });
  }
});

// POST /api/projects/:id/export-figma — generate Figma Plugin API compatible JSON from prototype HTML
router.post('/:id/export-figma', async (req: Request, res: Response) => {
  const projectId = req.params.id as string;

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const version = db.prepare(
    'SELECT html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
  ).get(projectId) as { html: string } | undefined;
  if (!version?.html) return res.status(400).json({ error: 'No prototype found for this project' });

  try {
    const figmaDoc = parseHtmlToFigma(version.html);
    return res.json(figmaDoc);
  } catch (err: any) {
    console.error('Figma JSON export error:', err);
    return res.status(500).json({ error: 'Failed to generate Figma JSON: ' + (err.message || '').slice(0, 200) });
  }
});

export default router;
