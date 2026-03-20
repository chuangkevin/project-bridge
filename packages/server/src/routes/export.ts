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

export default router;
