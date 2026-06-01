import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

const router = Router();

// GET /api/projects/:id/component-dependencies — list all dependencies for project
router.get('/:id/component-dependencies', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const deps = db.prepare(
      'SELECT * FROM component_dependencies WHERE project_id = ? ORDER BY created_at ASC'
    ).all(projectId);

    return res.json(deps.map(formatDep));
  } catch (err: any) {
    console.error('Error listing component dependencies:', err);
    return res.status(500).json({ error: 'Failed to list component dependencies' });
  }
});

// POST /api/projects/:id/component-dependencies — create dependency
router.post('/:id/component-dependencies', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { sourceBridgeId, targetBridgeId, trigger, action } = req.body;

    if (!sourceBridgeId || typeof sourceBridgeId !== 'string') {
      return res.status(400).json({ error: 'sourceBridgeId is required' });
    }
    if (!targetBridgeId || typeof targetBridgeId !== 'string') {
      return res.status(400).json({ error: 'targetBridgeId is required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO component_dependencies (id, project_id, source_bridge_id, target_bridge_id, trigger_event, action, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, projectId, sourceBridgeId, targetBridgeId, trigger || 'onClick', action || '', now, now);

    const row = db.prepare('SELECT * FROM component_dependencies WHERE id = ?').get(id);
    return res.status(201).json(formatDep(row));
  } catch (err: any) {
    console.error('Error creating component dependency:', err);
    return res.status(500).json({ error: 'Failed to create component dependency' });
  }
});

// PUT /api/projects/:id/component-dependencies/:depId — update dependency
router.put('/:id/component-dependencies/:depId', (req: Request, res: Response) => {
  try {
    const { id: projectId, depId } = req.params;
    const existing = db.prepare(
      'SELECT * FROM component_dependencies WHERE id = ? AND project_id = ?'
    ).get(depId, projectId) as any;
    if (!existing) return res.status(404).json({ error: 'Dependency not found' });

    const { sourceBridgeId, targetBridgeId, trigger, action } = req.body;
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE component_dependencies SET source_bridge_id = ?, target_bridge_id = ?, trigger_event = ?, action = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      sourceBridgeId || existing.source_bridge_id,
      targetBridgeId || existing.target_bridge_id,
      trigger !== undefined ? trigger : existing.trigger_event,
      action !== undefined ? action : existing.action,
      now,
      depId
    );

    const row = db.prepare('SELECT * FROM component_dependencies WHERE id = ?').get(depId);
    return res.json(formatDep(row));
  } catch (err: any) {
    console.error('Error updating component dependency:', err);
    return res.status(500).json({ error: 'Failed to update component dependency' });
  }
});

// DELETE /api/projects/:id/component-dependencies/:depId — delete dependency
router.delete('/:id/component-dependencies/:depId', (req: Request, res: Response) => {
  try {
    const { id: projectId, depId } = req.params;
    const existing = db.prepare(
      'SELECT * FROM component_dependencies WHERE id = ? AND project_id = ?'
    ).get(depId, projectId);
    if (!existing) return res.status(404).json({ error: 'Dependency not found' });

    db.prepare('DELETE FROM component_dependencies WHERE id = ?').run(depId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting component dependency:', err);
    return res.status(500).json({ error: 'Failed to delete component dependency' });
  }
});

function formatDep(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceBridgeId: row.source_bridge_id,
    targetBridgeId: row.target_bridge_id,
    trigger: row.trigger_event,
    action: row.action,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
