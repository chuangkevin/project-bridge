import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

const router = Router();

// ─── Auth middleware (same pattern as settings.ts) ────────────
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // 1. Check admin password token
  if (token) {
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'admin_session_token'").get() as { value: string } | undefined;
    const expiry = db.prepare("SELECT value FROM settings WHERE key = 'admin_session_expiry'").get() as { value: string } | undefined;
    if (stored?.value === token && expiry?.value && new Date(expiry.value) > new Date()) {
      next();
      return;
    }
  }

  // 2. Check X-Admin-Token header
  const adminToken = req.headers['x-admin-token'] as string | undefined;
  if (adminToken) {
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'admin_session_token'").get() as { value: string } | undefined;
    const expiry = db.prepare("SELECT value FROM settings WHERE key = 'admin_session_expiry'").get() as { value: string } | undefined;
    if (stored?.value === adminToken && expiry?.value && new Date(expiry.value) > new Date()) {
      next();
      return;
    }
  }

  // 3. Session-based auth: admin role (from authMiddleware)
  const user = (req as any).user;
  if (user?.role === 'admin') {
    next();
    return;
  }

  // 4. Fallback: fresh install (no users), allow access
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number } | undefined)?.count ?? 0;
  if (userCount === 0) {
    next();
    return;
  }

  res.status(401).json({ error: '需要管理員權限' });
}

// ─── POST /api/design-presets/analyze-url ──────────────────
// MUST be before /:id routes to prevent Express treating "analyze-url" as an id
router.post('/analyze-url', requireAdmin, async (req: Request, res: Response) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array required' });
  }
  try {
    const { analyzeUrlStyles } = require('../services/urlStyleAnalyzer');
    const result = await analyzeUrlStyles(urls);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/design-presets ───────────────────────────────
router.get('/', (_req: Request, res: Response) => {
  try {
    const presets = db.prepare('SELECT * FROM design_presets ORDER BY is_default DESC, name ASC').all();
    res.json(presets);
  } catch (err: any) {
    console.error('Error listing design presets:', err);
    res.status(500).json({ error: 'Failed to list presets' });
  }
});

// ─── POST /api/design-presets ──────────────────────────────
router.post('/', requireAdmin, (req: Request, res: Response) => {
  try {
    const { name, description, tokens, reference_urls, reference_analysis, design_convention, is_default } = req.body;
    const id = uuidv4();
    db.prepare(`INSERT INTO design_presets (id, name, description, tokens, reference_urls, reference_analysis, design_convention, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      name || '新風格',
      description || '',
      typeof tokens === 'string' ? tokens : JSON.stringify(tokens || {}),
      typeof reference_urls === 'string' ? reference_urls : JSON.stringify(reference_urls || []),
      reference_analysis || '',
      design_convention || '',
      is_default ? 1 : 0
    );
    const preset = db.prepare('SELECT * FROM design_presets WHERE id = ?').get(id);
    res.status(201).json(preset);
  } catch (err: any) {
    console.error('Error creating design preset:', err);
    res.status(500).json({ error: 'Failed to create preset' });
  }
});

// ─── PUT /api/design-presets/:id ───────────────────────────
router.put('/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM design_presets WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const fields = ['name', 'description', 'tokens', 'reference_urls', 'reference_analysis', 'design_convention', 'is_default'];
    const updates: string[] = [];
    const values: any[] = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        let val = req.body[f];
        if ((f === 'tokens' || f === 'reference_urls') && typeof val !== 'string') val = JSON.stringify(val);
        if (f === 'is_default') val = val ? 1 : 0;
        updates.push(`${f} = ?`);
        values.push(val);
      }
    }
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE design_presets SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    const updated = db.prepare('SELECT * FROM design_presets WHERE id = ?').get(id);
    res.json(updated);
  } catch (err: any) {
    console.error('Error updating design preset:', err);
    res.status(500).json({ error: 'Failed to update preset' });
  }
});

// ─── DELETE /api/design-presets/:id ────────────────────────
router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  try {
    const preset = db.prepare('SELECT * FROM design_presets WHERE id = ?').get(req.params.id) as any;
    if (!preset) return res.status(404).json({ error: 'Not found' });
    if (preset.is_default) return res.status(400).json({ error: '無法刪除預設風格' });
    db.prepare('DELETE FROM design_presets WHERE id = ?').run(req.params.id);
    // Also clear any project bindings to this preset
    db.prepare('UPDATE projects SET design_preset_id = NULL WHERE design_preset_id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting design preset:', err);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

// ─── POST /api/design-presets/:id/copy ─────────────────────
router.post('/:id/copy', requireAdmin, (req: Request, res: Response) => {
  try {
    const original = db.prepare('SELECT * FROM design_presets WHERE id = ?').get(req.params.id) as any;
    if (!original) return res.status(404).json({ error: 'Not found' });
    const id = uuidv4();
    db.prepare(`INSERT INTO design_presets (id, name, description, tokens, reference_urls, reference_analysis, design_convention, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)`).run(
      id,
      original.name + ' 副本',
      original.description,
      original.tokens,
      original.reference_urls,
      original.reference_analysis,
      original.design_convention
    );
    const copy = db.prepare('SELECT * FROM design_presets WHERE id = ?').get(id);
    res.status(201).json(copy);
  } catch (err: any) {
    console.error('Error copying design preset:', err);
    res.status(500).json({ error: 'Failed to copy preset' });
  }
});

export default router;
