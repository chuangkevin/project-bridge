import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { exportToFramework, Framework } from '../services/codeExporter';

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

  try {
    const response = await fetch('https://api.to.design/html', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeyRow.value}`,
      },
      body: JSON.stringify({
        html: proto.html,
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

export default router;
