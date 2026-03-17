import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

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

    const stmt = db.prepare(
      'INSERT INTO projects (id, name, share_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(id, name.trim(), share_token, now, now);

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
    const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
    return res.json(projects);
  } catch (err: any) {
    console.error('Error listing projects:', err);
    return res.status(500).json({ error: 'Failed to list projects' });
  }
});

// GET /api/projects/:id — get project with current prototype
router.get('/:id', (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;

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
    });
  } catch (err: any) {
    console.error('Error getting project:', err);
    return res.status(500).json({ error: 'Failed to get project' });
  }
});

// PUT /api/projects/:id — update project name
router.put('/:id', (req: Request, res: Response) => {
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
router.patch('/:id', (req: Request, res: Response) => {
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

// DELETE /api/projects/:id — delete project
router.delete('/:id', (req: Request, res: Response) => {
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
