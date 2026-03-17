import { Router, Request, Response } from 'express';
import db from '../db/connection';

const router = Router();

// PATCH /api/projects/:id/prototype/styles — upsert tweaker style tag into current prototype version
router.patch('/:id/prototype/styles', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const { css } = req.body;

    if (typeof css !== 'string') {
      return res.status(400).json({ error: 'css string is required' });
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const version = db.prepare(
      'SELECT id, html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(projectId) as { id: string; html: string } | undefined;

    if (!version) {
      return res.status(404).json({ error: 'No prototype version found' });
    }

    // Upsert <style id="__tweaker__"> before </body>
    const styleTag = `<style id="__tweaker__">\n${css}\n</style>`;
    let updatedHtml = version.html;

    const tweakerRe = /<style\s+id="__tweaker__">[\s\S]*?<\/style>/i;
    if (tweakerRe.test(updatedHtml)) {
      updatedHtml = updatedHtml.replace(tweakerRe, styleTag);
    } else if (/<\/body>/i.test(updatedHtml)) {
      updatedHtml = updatedHtml.replace(/<\/body>/i, `${styleTag}\n</body>`);
    } else {
      updatedHtml += `\n${styleTag}`;
    }

    db.prepare('UPDATE prototype_versions SET html = ? WHERE id = ?').run(updatedHtml, version.id);
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error saving styles:', err);
    return res.status(500).json({ error: 'Failed to save styles' });
  }
});

export default router;
