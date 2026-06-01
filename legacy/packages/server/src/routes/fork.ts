import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';
import { requireAuth } from '../middleware/auth';

const router = Router();

// POST /api/projects/:id/fork
router.post('/:id/fork', requireAuth, (req: Request, res: Response) => {
  try {
    const sourceId = req.params.id;

    // Check source project exists
    const sourceProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(sourceId) as any;
    if (!sourceProject) {
      return res.status(404).json({ error: 'Source project not found' });
    }

    // Check user is not forking their own project
    if (sourceProject.owner_id === req.user!.id) {
      return res.status(400).json({ error: 'Cannot fork your own project' });
    }

    const newProjectId = uuidv4();
    const newName = `${sourceProject.name} (fork)`;
    const shareToken = uuidv4().replace(/-/g, '').substring(0, 12);
    const now = new Date().toISOString();

    // Create new project (copy relevant fields from source)
    db.prepare(`
      INSERT INTO projects (id, name, share_token, owner_id, arch_data, crawled_urls, design_tokens, generation_temperature, seed_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newProjectId,
      newName,
      shareToken,
      req.user!.id,
      sourceProject.arch_data,
      sourceProject.crawled_urls,
      sourceProject.design_tokens,
      sourceProject.generation_temperature,
      sourceProject.seed_prompt,
      now,
      now
    );

    // Copy current prototype_version (is_current = 1)
    const currentVersion = db.prepare(
      'SELECT * FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(sourceId) as any;

    if (currentVersion) {
      db.prepare(`
        INSERT INTO prototype_versions (id, project_id, html, version, is_current, is_multi_page, pages, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `).run(
        uuidv4(),
        newProjectId,
        currentVersion.html,
        currentVersion.version,
        currentVersion.is_multi_page,
        currentVersion.pages,
        now
      );
    }

    // Copy page_element_mappings
    const mappings = db.prepare(
      'SELECT * FROM page_element_mappings WHERE project_id = ?'
    ).all(sourceId) as any[];

    const insertMapping = db.prepare(`
      INSERT INTO page_element_mappings (id, project_id, bridge_id, page_name, navigation_target, arch_component_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const mapping of mappings) {
      insertMapping.run(
        uuidv4(),
        newProjectId,
        mapping.bridge_id,
        mapping.page_name,
        mapping.navigation_target,
        mapping.arch_component_id,
        now,
        now
      );
    }

    return res.status(201).json({ id: newProjectId, name: newName });
  } catch (err: any) {
    console.error('Error forking project:', err);
    return res.status(500).json({ error: 'Failed to fork project' });
  }
});

export default router;
