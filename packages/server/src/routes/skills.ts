import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

// Accept both new session auth AND legacy admin password token
function requireSkillAdmin(req: Request, res: Response, next: NextFunction): void {
  // 1. New session auth
  if (req.user?.role === 'admin') { next(); return; }

  // 2. Legacy admin token from settings table
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'admin_session_token'").get() as { value: string } | undefined;
    const expiry = db.prepare("SELECT value FROM settings WHERE key = 'admin_session_expiry'").get() as { value: string } | undefined;
    if (stored?.value === token && expiry?.value && new Date(expiry.value) > new Date()) {
      next(); return;
    }
  }

  res.status(401).json({ error: '需要管理員權限' });
}

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
  source_path: string | null;
  depends_on: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Recalculate depends_on for ALL skills by scanning each skill's content
 * for mentions of other skill names (case-insensitive, excluding self).
 */
function recalculateReferences(): void {
  const allSkills = db.prepare('SELECT id, name, content FROM agent_skills').all() as { id: string; name: string; content: string }[];
  const allNames = allSkills.map(s => s.name);

  for (const skill of allSkills) {
    const refs = allNames.filter(name =>
      name !== skill.name && skill.content.toLowerCase().includes(name.toLowerCase())
    );
    db.prepare('UPDATE agent_skills SET depends_on = ? WHERE id = ?')
      .run(JSON.stringify(refs), skill.id);
  }
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

// GET /api/skills/graph — return full reference graph (adjacency list)
router.get('/graph', (req: Request, res: Response) => {
  try {
    const allSkills = db.prepare('SELECT id, name, depends_on FROM agent_skills').all() as { id: string; name: string; depends_on: string | null }[];
    const nodes = allSkills.map(s => ({ id: s.id, name: s.name }));
    const nameToId = new Map(allSkills.map(s => [s.name, s.id]));
    const edges: { from: string; to: string }[] = [];
    for (const skill of allSkills) {
      const deps: string[] = skill.depends_on ? JSON.parse(skill.depends_on) : [];
      for (const dep of deps) {
        const targetId = nameToId.get(dep);
        if (targetId) {
          edges.push({ from: skill.id, to: targetId });
        }
      }
    }
    return res.json({ nodes, edges });
  } catch (err: any) {
    console.error('Error building skill graph:', err);
    return res.status(500).json({ error: 'Failed to build skill graph' });
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

// GET /api/skills/:id/references — return outgoing and incoming references
router.get('/:id/references', (req: Request, res: Response) => {
  try {
    const skill = db.prepare('SELECT id, name, depends_on FROM agent_skills WHERE id = ?').get(req.params.id) as { id: string; name: string; depends_on: string | null } | undefined;
    if (!skill) return res.status(404).json({ error: 'Skill not found' });

    const outgoing: string[] = skill.depends_on ? JSON.parse(skill.depends_on) : [];

    // Find all skills whose depends_on contains this skill's name
    const allSkills = db.prepare('SELECT name, depends_on FROM agent_skills WHERE id != ?').all(skill.id) as { name: string; depends_on: string | null }[];
    const incoming: string[] = [];
    for (const other of allSkills) {
      const deps: string[] = other.depends_on ? JSON.parse(other.depends_on) : [];
      if (deps.includes(skill.name)) {
        incoming.push(other.name);
      }
    }

    return res.json({ outgoing, incoming });
  } catch (err: any) {
    console.error('Error getting skill references:', err);
    return res.status(500).json({ error: 'Failed to get skill references' });
  }
});

// POST /api/skills — create skill (admin only)
router.post('/', requireSkillAdmin, (req: Request, res: Response) => {
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

// POST /api/skills/batch — batch import skills from parsed SKILL.md files
router.post('/batch', requireSkillAdmin, (req: Request, res: Response) => {
  try {
    const { skills: skillsArr } = req.body as { skills: { name: string; description: string; content: string; source_path?: string; depends?: string[] }[] };
    if (!Array.isArray(skillsArr) || skillsArr.length === 0) {
      return res.status(400).json({ error: 'skills array is required' });
    }
    const now = new Date().toISOString();
    const maxOrder = db.prepare('SELECT MAX(order_index) as m FROM agent_skills').get() as { m: number | null };
    let orderIdx = (maxOrder.m ?? -1) + 1;
    let imported = 0;
    let updated = 0;
    for (const s of skillsArr) {
      if (!s.name || !s.content) continue;
      const sourcePath = s.source_path || null;
      // Upsert: if skill with same name exists, update it
      const existing = db.prepare('SELECT id FROM agent_skills WHERE name = ?').get(s.name) as { id: string } | undefined;
      if (existing) {
        db.prepare('UPDATE agent_skills SET description = ?, content = ?, source_path = ?, updated_at = ? WHERE id = ?')
          .run((s.description || '').trim(), s.content.trim(), sourcePath, now, existing.id);
        updated++;
      } else {
        const id = uuidv4();
        db.prepare(
          'INSERT INTO agent_skills (id, name, description, content, scope, source_path, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, s.name.trim(), (s.description || '').trim(), s.content.trim(), 'global', sourcePath, orderIdx++, now, now);
        imported++;
      }
    }
    // Recalculate references for ALL skills after batch import
    recalculateReferences();
    const allSkills = db.prepare('SELECT * FROM agent_skills ORDER BY order_index ASC').all();
    return res.json({ skills: allSkills, imported, updated });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to batch import skills' });
  }
});

// POST /api/skills/batch-action — batch enable/disable/delete (admin only)
router.post('/batch-action', requireSkillAdmin, (req: Request, res: Response) => {
  try {
    const { ids, action } = req.body as { ids: string[]; action: 'enable' | 'disable' | 'delete' };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    if (!['enable', 'disable', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'action must be enable, disable, or delete' });
    }

    const placeholders = ids.map(() => '?').join(',');
    const now = new Date().toISOString();

    if (action === 'enable') {
      db.prepare(`UPDATE agent_skills SET enabled = 1, updated_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
    } else if (action === 'disable') {
      db.prepare(`UPDATE agent_skills SET enabled = 0, updated_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
    } else if (action === 'delete') {
      db.prepare(`DELETE FROM agent_skills WHERE id IN (${placeholders})`).run(...ids);
    }

    const allSkills = db.prepare('SELECT * FROM agent_skills ORDER BY order_index ASC, created_at ASC').all();
    return res.json({ skills: allSkills });
  } catch (err: any) {
    console.error('Error performing batch action:', err);
    return res.status(500).json({ error: 'Failed to perform batch action' });
  }
});

// PUT /api/skills/:id — update skill (admin only)
router.put('/:id', requireSkillAdmin, (req: Request, res: Response) => {
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
router.delete('/:id', requireSkillAdmin, (req: Request, res: Response) => {
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
router.patch('/:id/toggle', requireSkillAdmin, (req: Request, res: Response) => {
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
