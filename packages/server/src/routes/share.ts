import { Router, Request, Response } from 'express';
import db from '../db/connection';

const router = Router();

// GET /api/share/:shareToken — get shared project prototype
router.get('/:shareToken', (req: Request, res: Response) => {
  try {
    const project = db.prepare(
      'SELECT * FROM projects WHERE share_token = ?'
    ).get(req.params.shareToken) as any;

    if (!project) {
      return res.status(404).json({ error: 'Shared project not found' });
    }

    const currentPrototype = db.prepare(
      'SELECT * FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(project.id) as any;

    const annotations = db.prepare(
      'SELECT * FROM annotations WHERE project_id = ? ORDER BY created_at ASC'
    ).all(project.id);

    return res.json({
      name: project.name,
      html: currentPrototype?.html || null,
      annotations,
      isMultiPage: !!(currentPrototype?.is_multi_page),
      pages: currentPrototype ? JSON.parse(currentPrototype.pages || '[]') : [],
    });
  } catch (err: any) {
    console.error('Error getting shared project:', err);
    return res.status(500).json({ error: 'Failed to get shared project' });
  }
});

export default router;
