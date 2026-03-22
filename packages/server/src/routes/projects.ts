import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';
import { requireAuth, requireOwnerOrAdmin } from '../middleware/auth';

const router = Router();

function generateShareToken(): string {
  // Generate a short, URL-safe token
  return uuidv4().replace(/-/g, '').substring(0, 12);
}

// POST /api/projects — create a new project
router.post('/', (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const id = uuidv4();
    const share_token = generateShareToken();
    const now = new Date().toISOString();

    const owner_id = req.user?.id || null;
    const stmt = db.prepare(
      'INSERT INTO projects (id, name, share_token, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(id, name.trim(), share_token, owner_id, now, now);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    return res.status(201).json(project);
  } catch (err: any) {
    console.error('Error creating project:', err);
    return res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET /api/projects — list all projects
router.get('/', (_req: Request, res: Response) => {
  try {
    const projects = db.prepare('SELECT p.*, u.name as owner_name FROM projects p LEFT JOIN users u ON p.owner_id = u.id ORDER BY p.updated_at DESC').all();
    return res.json(projects);
  } catch (err: any) {
    console.error('Error listing projects:', err);
    return res.status(500).json({ error: 'Failed to list projects' });
  }
});

// GET /api/projects/:id — get project with current prototype
router.get('/:id', (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT p.*, u.name as owner_name FROM projects p LEFT JOIN users u ON p.owner_id = u.id WHERE p.id = ?').get(req.params.id) as any;

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const currentPrototype = db.prepare(
      'SELECT * FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(req.params.id) as any;

    return res.json({
      ...project,
      currentHtml: currentPrototype?.html || null,
      currentVersion: currentPrototype?.version || null,
      isMultiPage: !!(currentPrototype?.is_multi_page),
      pages: currentPrototype ? JSON.parse(currentPrototype.pages || '[]') : [],
      arch_data: project.arch_data ? JSON.parse(project.arch_data) : null,
    });
  } catch (err: any) {
    console.error('Error getting project:', err);
    return res.status(500).json({ error: 'Failed to get project' });
  }
});

// PUT /api/projects/:id — update project name
router.put('/:id', requireOwnerOrAdmin, (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
      .run(name.trim(), now, req.params.id);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    return res.json(project);
  } catch (err: any) {
    console.error('Error updating project:', err);
    return res.status(500).json({ error: 'Failed to update project' });
  }
});

// PATCH /api/projects/:id — update project name
router.patch('/:id', requireOwnerOrAdmin, (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    db.prepare("UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?")
      .run(name.trim(), req.params.id);
    return res.json({ success: true, name: name.trim() });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update project' });
  }
});

// PATCH /api/projects/:id/settings — update generation settings
router.patch('/:id/settings', requireOwnerOrAdmin, (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { generation_temperature, seed_prompt } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (generation_temperature !== undefined) {
      const temp = parseFloat(generation_temperature);
      if (isNaN(temp) || temp < 0 || temp > 1) {
        return res.status(400).json({ error: 'generation_temperature must be between 0 and 1' });
      }
      updates.push('generation_temperature = ?');
      values.push(temp);
    }

    if (seed_prompt !== undefined) {
      if (typeof seed_prompt !== 'string') {
        return res.status(400).json({ error: 'seed_prompt must be a string' });
      }
      updates.push('seed_prompt = ?');
      values.push(seed_prompt);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);

    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT generation_temperature, seed_prompt FROM projects WHERE id = ?').get(req.params.id);
    return res.json(updated);
  } catch (err: any) {
    console.error('Error updating generation settings:', err);
    return res.status(500).json({ error: 'Failed to update generation settings' });
  }
});

// DELETE /api/projects/:id — delete project
router.delete('/:id', requireOwnerOrAdmin, (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    return res.status(204).send();
  } catch (err: any) {
    console.error('Error deleting project:', err);
    return res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
