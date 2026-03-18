import { Router, Request, Response } from 'express';
import fs from 'fs';
import sharp from 'sharp';
import db from '../db/connection';

const router = Router();

// GET /api/projects/:id/architecture
router.get('/:id/architecture', (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT arch_data FROM projects WHERE id = ?').get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Project not found' });
    return res.json({ arch_data: row.arch_data ? JSON.parse(row.arch_data) : null });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to get architecture' });
  }
});

// PATCH /api/projects/:id/architecture
router.patch('/:id/architecture', (req: Request, res: Response) => {
  try {
    const { arch_data } = req.body;
    if (!arch_data) return res.status(400).json({ error: 'arch_data required' });
    const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Project not found' });
    db.prepare('UPDATE projects SET arch_data = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(arch_data),
      new Date().toISOString(),
      req.params.id
    );
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to save architecture' });
  }
});

// GET /api/projects/:id/files/:fileId/thumbnail
router.get('/:id/files/:fileId/thumbnail', async (req: Request, res: Response) => {
  try {
    const file = db.prepare('SELECT * FROM uploaded_files WHERE id = ? AND project_id = ?')
      .get(req.params.fileId, req.params.id) as any;
    if (!file) return res.status(404).json({ error: 'File not found' });

    let imageBuffer: Buffer;

    if (file.mime_type === 'application/pdf') {
      try {
        const { renderPdfPages } = await import('../services/pdfPageRenderer');
        const pages = await renderPdfPages(file.storage_path, 1);
        if (!pages || !pages.length) return res.status(422).json({ error: 'Could not render PDF' });
        imageBuffer = pages[0];
      } catch {
        return res.status(422).json({ error: 'PDF rendering failed' });
      }
    } else {
      if (!fs.existsSync(file.storage_path)) return res.status(404).json({ error: 'File not found on disk' });
      imageBuffer = fs.readFileSync(file.storage_path);
    }

    const thumbnail = await sharp(imageBuffer)
      .resize(320, 180, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(thumbnail);
  } catch (err: any) {
    console.error('Thumbnail error:', err);
    return res.status(500).json({ error: 'Failed to generate thumbnail' });
  }
});

export default router;
