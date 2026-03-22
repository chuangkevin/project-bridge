import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

const router = Router();

// POST /api/projects/:id/annotations — create annotation
router.post('/:id/annotations', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const { bridgeId, label, content, specData, positionX, positionY } = req.body;

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!bridgeId || typeof bridgeId !== 'string') {
      return res.status(400).json({ error: 'bridgeId is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      'INSERT INTO annotations (id, project_id, bridge_id, label, position_x, position_y, content, spec_data, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      projectId,
      bridgeId,
      label || '',
      positionX ?? null,
      positionY ?? null,
      content || '',
      typeof specData === 'object' ? JSON.stringify(specData) : (specData || '{}'),
      req.user?.id || null,
      now,
      now
    );

    const annotation = db.prepare('SELECT * FROM annotations WHERE id = ?').get(id);
    return res.status(201).json(annotation);
  } catch (err: any) {
    console.error('Error creating annotation:', err);
    return res.status(500).json({ error: 'Failed to create annotation' });
  }
});

// GET /api/projects/:id/annotations — list annotations for project
router.get('/:id/annotations', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const annotations = db.prepare(
      'SELECT a.*, u.name as user_name FROM annotations a LEFT JOIN users u ON a.user_id = u.id WHERE a.project_id = ? ORDER BY a.created_at ASC'
    ).all(projectId);

    return res.json(annotations);
  } catch (err: any) {
    console.error('Error listing annotations:', err);
    return res.status(500).json({ error: 'Failed to list annotations' });
  }
});

// PUT /api/projects/:id/annotations/:aid — update annotation
router.put('/:id/annotations/:aid', (req: Request, res: Response) => {
  try {
    const { aid } = req.params;
    const { label, content, specData, positionX, positionY } = req.body;

    const existing = db.prepare('SELECT * FROM annotations WHERE id = ? AND project_id = ?').get(aid, req.params.id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    const now = new Date().toISOString();
    db.prepare(
      'UPDATE annotations SET label = ?, content = ?, spec_data = ?, position_x = ?, position_y = ?, updated_at = ? WHERE id = ?'
    ).run(
      label !== undefined ? label : existing.label,
      content !== undefined ? content : existing.content,
      specData !== undefined
        ? (typeof specData === 'object' ? JSON.stringify(specData) : specData)
        : existing.spec_data,
      positionX !== undefined ? positionX : existing.position_x,
      positionY !== undefined ? positionY : existing.position_y,
      now,
      aid
    );

    const updated = db.prepare('SELECT * FROM annotations WHERE id = ?').get(aid);
    return res.json(updated);
  } catch (err: any) {
    console.error('Error updating annotation:', err);
    return res.status(500).json({ error: 'Failed to update annotation' });
  }
});

// DELETE /api/projects/:id/annotations/:aid — delete annotation
router.delete('/:id/annotations/:aid', (req: Request, res: Response) => {
  try {
    const { aid } = req.params;

    const existing = db.prepare('SELECT id, user_id FROM annotations WHERE id = ? AND project_id = ?').get(aid, req.params.id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    if (req.user && existing.user_id && req.user.id !== existing.user_id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: only the annotation author or an admin can delete' });
    }

    db.prepare('DELETE FROM annotations WHERE id = ?').run(aid);
    return res.status(204).send();
  } catch (err: any) {
    console.error('Error deleting annotation:', err);
    return res.status(500).json({ error: 'Failed to delete annotation' });
  }
});

export default router;
