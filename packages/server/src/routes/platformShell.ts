import { Router, Request, Response } from 'express';
import db from '../db/connection';

const router = Router();

function ensurePlaceholder(html: string): string {
  if (html.includes('{CONTENT}')) return html;
  // Auto-insert before </body>
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, '<main>{CONTENT}</main>\n</body>');
  }
  return html + '\n<main>{CONTENT}</main>';
}

// GET /api/projects/:id/platform-shell
router.get('/:id/platform-shell', (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const row = db.prepare('SELECT * FROM platform_shells WHERE project_id = ?').get(req.params.id) as any;
    return res.json({ shell: row ? { projectId: row.project_id, shellHtml: row.shell_html, updatedAt: row.updated_at } : null });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to get platform shell' });
  }
});

// PUT /api/projects/:id/platform-shell
router.put('/:id/platform-shell', (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    let { shellHtml } = req.body;
    if (typeof shellHtml !== 'string') return res.status(400).json({ error: 'shellHtml is required' });

    shellHtml = ensurePlaceholder(shellHtml.trim());

    db.prepare(`
      INSERT INTO platform_shells (project_id, shell_html, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(project_id) DO UPDATE SET shell_html = excluded.shell_html, updated_at = excluded.updated_at
    `).run(req.params.id, shellHtml);

    const row = db.prepare('SELECT * FROM platform_shells WHERE project_id = ?').get(req.params.id) as any;
    return res.json({ shell: { projectId: row.project_id, shellHtml: row.shell_html, updatedAt: row.updated_at } });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save platform shell' });
  }
});

// POST /api/projects/:id/platform-shell/extract
router.post('/:id/platform-shell/extract', (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const version = db.prepare(
      'SELECT html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(req.params.id) as { html: string } | undefined;

    if (!version) return res.status(404).json({ error: 'No prototype version found' });

    // Extract shell: remove <main> content, insert {CONTENT} placeholder
    let shell = version.html;

    // Replace <main>...</main> content with {CONTENT}
    shell = shell.replace(/<main[^>]*>[\s\S]*?<\/main>/i, '<main>{CONTENT}</main>');

    // If no <main> found, try to remove large content blocks and add placeholder before </body>
    if (!shell.includes('{CONTENT}')) {
      shell = ensurePlaceholder(shell);
    }

    const shellHtml = ensurePlaceholder(shell);

    db.prepare(`
      INSERT INTO platform_shells (project_id, shell_html, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(project_id) DO UPDATE SET shell_html = excluded.shell_html, updated_at = excluded.updated_at
    `).run(req.params.id, shellHtml);

    const row = db.prepare('SELECT * FROM platform_shells WHERE project_id = ?').get(req.params.id) as any;
    return res.json({ shell: { projectId: row.project_id, shellHtml: row.shell_html, updatedAt: row.updated_at } });
  } catch (err: any) {
    console.error('Extract shell error:', err);
    return res.status(500).json({ error: 'Failed to extract shell' });
  }
});

export default router;
