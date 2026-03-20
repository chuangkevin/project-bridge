import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { applyPatches, Patch } from '../services/patchApplier';

const router = Router();

// GET /api/projects/:id/prototype/patches — return current version's patches
router.get('/:id/prototype/patches', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const version = db.prepare(
      'SELECT patches FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(projectId) as { patches: string } | undefined;

    if (!version) return res.status(404).json({ error: 'No prototype version found' });

    const patches: Patch[] = JSON.parse(version.patches || '[]');
    return res.json({ patches });
  } catch (err: any) {
    console.error('Error fetching patches:', err);
    return res.status(500).json({ error: 'Failed to fetch patches' });
  }
});

// PATCH /api/projects/:id/prototype/patches — save patches to current version
router.patch('/:id/prototype/patches', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const { patches } = req.body;

    if (!Array.isArray(patches)) {
      return res.status(400).json({ error: 'patches array is required' });
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const version = db.prepare(
      'SELECT id FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(projectId) as { id: string } | undefined;

    if (!version) return res.status(404).json({ error: 'No prototype version found' });

    db.prepare('UPDATE prototype_versions SET patches = ? WHERE id = ?').run(
      JSON.stringify(patches),
      version.id
    );
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);

    return res.json({ success: true, patches });
  } catch (err: any) {
    console.error('Error saving patches:', err);
    return res.status(500).json({ error: 'Failed to save patches' });
  }
});

// POST /api/projects/:id/prototype/patches/apply — apply patches to HTML and return patched HTML
router.post('/:id/prototype/patches/apply', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const version = db.prepare(
      'SELECT html, patches FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(projectId) as { html: string; patches: string } | undefined;

    if (!version) return res.status(404).json({ error: 'No prototype version found' });

    const patches: Patch[] = JSON.parse(version.patches || '[]');
    const patchedHtml = applyPatches(version.html, patches);

    return res.json({ html: patchedHtml });
  } catch (err: any) {
    console.error('Error applying patches:', err);
    return res.status(500).json({ error: 'Failed to apply patches' });
  }
});

export default router;
