import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { v4 as uuidv4 } from 'uuid';
import { syncArchFromMappings } from '../services/archSync';

const router = Router();

// GET /api/projects/:id/page-mappings
router.get('/:id/page-mappings', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const mappings = db.prepare(
      'SELECT * FROM page_element_mappings WHERE project_id = ? ORDER BY page_name, bridge_id'
    ).all(projectId);

    return res.json({ mappings });
  } catch (err: any) {
    console.error('Error fetching page mappings:', err);
    return res.status(500).json({ error: 'Failed to fetch page mappings' });
  }
});

// PUT /api/projects/:id/page-mappings
router.put('/:id/page-mappings', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const { bridgeId, pageName, navigationTarget, archComponentId } = req.body;

    if (!bridgeId || !pageName) {
      return res.status(400).json({ error: 'bridgeId and pageName are required' });
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Get current prototype HTML
    const version = db.prepare(
      'SELECT id, html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(projectId) as { id: string; html: string } | undefined;

    if (!version) return res.status(404).json({ error: 'No prototype version found' });

    if (navigationTarget === null || navigationTarget === undefined || navigationTarget === '') {
      // Remove mapping
      db.prepare(
        'DELETE FROM page_element_mappings WHERE project_id = ? AND bridge_id = ?'
      ).run(projectId, bridgeId);

      // Remove onclick from HTML
      const updatedHtml = removeOnclickForBridgeId(version.html, bridgeId);
      db.prepare('UPDATE prototype_versions SET html = ? WHERE id = ?').run(updatedHtml, version.id);
    } else {
      // Upsert mapping
      db.prepare(`
        INSERT INTO page_element_mappings (id, project_id, bridge_id, page_name, navigation_target, arch_component_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, bridge_id) DO UPDATE SET
          navigation_target = excluded.navigation_target,
          arch_component_id = excluded.arch_component_id,
          updated_at = datetime('now')
      `).run(uuidv4(), projectId, bridgeId, pageName, navigationTarget, archComponentId || null);

      // Update onclick in HTML
      const updatedHtml = setOnclickForBridgeId(version.html, bridgeId, navigationTarget);
      db.prepare('UPDATE prototype_versions SET html = ? WHERE id = ?').run(updatedHtml, version.id);
    }

    // Sync architecture
    syncArchFromMappings(projectId as string);

    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);

    // Return updated mappings
    const mappings = db.prepare(
      'SELECT * FROM page_element_mappings WHERE project_id = ? ORDER BY page_name, bridge_id'
    ).all(projectId);

    return res.json({ success: true, mappings });
  } catch (err: any) {
    console.error('Error saving page mapping:', err);
    return res.status(500).json({ error: 'Failed to save page mapping' });
  }
});

/**
 * Set or update onclick="showPage('target')" for an element with given bridge_id.
 */
function setOnclickForBridgeId(html: string, bridgeId: string, target: string): string {
  const escapedId = bridgeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the element tag with this bridge id
  const regex = new RegExp(`(<[^>]*data-bridge-id="${escapedId}"[^>]*)>`, 'g');

  return html.replace(regex, (match, tagContent) => {
    // Remove existing onclick with showPage
    let cleaned = tagContent.replace(/\s*onclick\s*=\s*"[^"]*showPage\([^)]*\)[^"]*"/gi, '');
    cleaned = cleaned.replace(/\s*onclick\s*=\s*'[^']*showPage\([^)]*\)[^']*'/gi, '');
    return `${cleaned} onclick="showPage('${target}')">`;
  });
}

/**
 * Remove onclick showPage from an element with given bridge_id.
 */
function removeOnclickForBridgeId(html: string, bridgeId: string): string {
  const escapedId = bridgeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(<[^>]*data-bridge-id="${escapedId}"[^>]*)>`, 'g');

  return html.replace(regex, (match, tagContent) => {
    let cleaned = tagContent.replace(/\s*onclick\s*=\s*"[^"]*showPage\([^)]*\)[^"]*"/gi, '');
    cleaned = cleaned.replace(/\s*onclick\s*=\s*'[^']*showPage\([^)]*\)[^']*'/gi, '');
    return `${cleaned}>`;
  });
}

export default router;
