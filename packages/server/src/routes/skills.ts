import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';
import { requireAdmin } from '../middleware/auth';

const router = Router();

interface AgentSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: number;
  scope: 'global' | 'project';
  project_id: string | null;
  created_by: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

// GET /api/skills — list all global skills + optionally project-scoped
router.get('/', (req: Request, res: Response) => {
  try {
    const { project_id } = req.query;
    let skills: AgentSkill[];
    if (project_id) {
      skills = db.prepare(
        "SELECT * FROM agent_skills WHERE scope = 'global' OR (scope = 'project' AND project_id = ?) ORDER BY order_index ASC, created_at ASC"
      ).all(project_id) as AgentSkill[];
    } else {
      skills = db.prepare(
        "SELECT * FROM agent_skills ORDER BY order_index ASC, created_at ASC"
      ).all() as AgentSkill[];
    }
    return res.json(skills);
  } catch (err: any) {
    console.error('Error listing skills:', err);
    return res.status(500).json({ error: 'Failed to list skills' });
  }
});

// GET /api/skills/:id — get single skill
router.get('/:id', (req: Request, res: Response) => {
  try {
    const skill = db.prepare('SELECT * FROM agent_skills WHERE id = ?').get(req.params.id);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    return res.json(skill);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to get skill' });
  }
});

// POST /api/skills — create skill (admin only)
router.post('/', requireAdmin, (req: Request, res: Response) => {
  try {
    const { name, description, content, scope, project_id } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }
    const validScope = scope === 'project' ? 'project' : 'global';
    if (validScope === 'project' && !project_id) {
      return res.status(400).json({ error: 'project_id is required for project-scoped skills' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM agent_skills').get() as { m: number | null };

    db.prepare(
      'INSERT INTO agent_skills (id, name, description, content, scope, project_id, created_by, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name.trim(), (description || '').trim(), content.trim(), validScope, validScope === 'project' ? project_id : null, req.user?.id || null, (maxOrder.m ?? -1) + 1, now, now);

    const skill = db.prepare('SELECT * FROM agent_skills WHERE id = ?').get(id);
    return res.status(201).json(skill);
  } catch (err: any) {
    console.error('Error creating skill:', err);
    return res.status(500).json({ error: 'Failed to create skill' });
  }
});

// PUT /api/skills/:id — update skill (admin only)
router.put('/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM agent_skills WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Skill not found' });

    const { name, description, content, enabled, scope, project_id, order_index } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description.trim()); }
    if (content !== undefined) { updates.push('content = ?'); values.push(content.trim()); }
    if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0); }
    if (scope !== undefined) { updates.push('scope = ?'); values.push(scope === 'project' ? 'project' : 'global'); }
    if (project_id !== undefined) { updates.push('project_id = ?'); values.push(project_id || null); }
    if (order_index !== undefined) { updates.push('order_index = ?'); values.push(order_index); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(req.params.id);

    db.prepare(`UPDATE agent_skills SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const skill = db.prepare('SELECT * FROM agent_skills WHERE id = ?').get(req.params.id);
    return res.json(skill);
  } catch (err: any) {
    console.error('Error updating skill:', err);
    return res.status(500).json({ error: 'Failed to update skill' });
  }
});

// DELETE /api/skills/:id — delete skill (admin only)
router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const existing = db.prepare('SELECT * FROM agent_skills WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Skill not found' });
    db.prepare('DELETE FROM agent_skills WHERE id = ?').run(req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting skill:', err);
    return res.status(500).json({ error: 'Failed to delete skill' });
  }
});

// PATCH /api/skills/:id/toggle — toggle enabled (admin only)
router.patch('/:id/toggle', requireAdmin, (req: Request, res: Response) => {
  try {
    const skill = db.prepare('SELECT * FROM agent_skills WHERE id = ?').get(req.params.id) as AgentSkill | undefined;
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    const newEnabled = skill.enabled ? 0 : 1;
    db.prepare('UPDATE agent_skills SET enabled = ?, updated_at = ? WHERE id = ?').run(newEnabled, new Date().toISOString(), req.params.id);
    return res.json({ ...skill, enabled: newEnabled });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to toggle skill' });
  }
});

/**
 * Get active skills for injection into AI prompt.
 * Returns enabled global skills + enabled project-scoped skills for the given project.
 */
export function getActiveSkills(projectId: string): AgentSkill[] {
  return db.prepare(
    "SELECT * FROM agent_skills WHERE enabled = 1 AND (scope = 'global' OR (scope = 'project' AND project_id = ?)) ORDER BY order_index ASC"
  ).all(projectId) as AgentSkill[];
}

export default router;
