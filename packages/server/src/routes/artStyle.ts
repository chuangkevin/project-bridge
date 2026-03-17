import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

const router = Router();

// GET /api/projects/:id/art-style
router.get('/:id/art-style', (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const pref = db.prepare('SELECT * FROM art_style_preferences WHERE project_id = ?').get(req.params.id) as any;

    return res.json({
      detectedStyle: pref?.detected_style || '',
      applyStyle: !!(pref?.apply_style),
    });
  } catch (err: any) {
    console.error('Error getting art style:', err);
    return res.status(500).json({ error: 'Failed to get art style' });
  }
});

// PUT /api/projects/:id/art-style
router.put('/:id/art-style', (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { applyStyle } = req.body;
    if (typeof applyStyle !== 'boolean') {
      return res.status(400).json({ error: 'applyStyle (boolean) is required' });
    }

    const existing = db.prepare('SELECT id FROM art_style_preferences WHERE project_id = ?').get(req.params.id) as any;

    if (existing) {
      db.prepare("UPDATE art_style_preferences SET apply_style = ?, updated_at = datetime('now') WHERE project_id = ?")
        .run(applyStyle ? 1 : 0, req.params.id);
    } else {
      db.prepare('INSERT INTO art_style_preferences (id, project_id, detected_style, apply_style) VALUES (?, ?, ?, ?)')
        .run(uuidv4(), req.params.id, '', applyStyle ? 1 : 0);
    }

    const pref = db.prepare('SELECT * FROM art_style_preferences WHERE project_id = ?').get(req.params.id) as any;
    return res.json({
      detectedStyle: pref?.detected_style || '',
      applyStyle: !!(pref?.apply_style),
    });
  } catch (err: any) {
    console.error('Error updating art style:', err);
    return res.status(500).json({ error: 'Failed to update art style' });
  }
});

export default router;
