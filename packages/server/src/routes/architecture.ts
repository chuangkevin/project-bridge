import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import db from '../db/connection';
import { getGeminiApiKey } from '../services/geminiKeys';

const uploadDir = path.resolve(__dirname, '../../data/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const archUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}.png`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs are allowed'));
    }
  },
});

const router = Router();

// POST /api/projects/:id/architecture/upload — lightweight image upload (no OCR)
router.post('/:id/architecture/upload', (req: Request, res: Response) => {
  const projectId = req.params.id;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  archUpload.single('file')(req, res, async (err: any) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload error' });
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { mimetype, size, path: storagePath, originalname } = req.file;
    // Use provided page_name or default to '__arch__' sentinel so these are excluded from global design spec injection
    const pageName: string = (req.body?.page_name as string) || '__arch__';
    const id = uuidv4();

    db.prepare(
      'INSERT INTO uploaded_files (id, project_id, original_name, mime_type, file_size, storage_path, extracted_text, page_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, originalname, mimetype, size, storagePath, '', pageName);

    // Respond immediately, then trigger visual analysis in background
    res.json({ id, mimeType: mimetype });

    // Async document analysis agent (non-blocking — replaces old visual-only analysis)
    setImmediate(async () => {
      try {
        db.prepare("UPDATE uploaded_files SET analysis_status = 'pending' WHERE id = ?").run(id);
        const { analyzeDocument } = await import('../services/documentAnalysisAgent');
        await analyzeDocument(id, storagePath, mimetype, '');
      } catch (e) {
        console.error('[arch upload] document analysis failed:', e);
      }
    });
  });
});

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

// ─── Architecture Versioning ─────────────────────────

// GET /api/projects/:id/architecture/versions
router.get('/:id/architecture/versions', (req: Request, res: Response) => {
  const projectId = req.params.id;
  const versions = db.prepare(
    'SELECT id, version, description, created_at FROM architecture_versions WHERE project_id = ? ORDER BY version DESC LIMIT 50'
  ).all(projectId);
  return res.json({ versions });
});

// POST /api/projects/:id/architecture/versions — save a new version
router.post('/:id/architecture/versions', (req: Request, res: Response) => {
  const projectId = req.params.id;
  const { description } = req.body;

  // Get current arch_data
  const project = db.prepare('SELECT arch_data FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.arch_data) return res.status(400).json({ error: 'No architecture data to save' });

  // Auto-increment version
  const maxRow = db.prepare(
    'SELECT MAX(version) as maxV FROM architecture_versions WHERE project_id = ?'
  ).get(projectId) as any;
  const newVersion = (maxRow?.maxV || 0) + 1;

  const id = uuidv4();
  db.prepare(
    'INSERT INTO architecture_versions (id, project_id, version, arch_data, description) VALUES (?, ?, ?, ?, ?)'
  ).run(id, projectId, newVersion, project.arch_data, description || `Version ${newVersion}`);

  // Auto-prune: keep only last 50
  db.prepare(
    'DELETE FROM architecture_versions WHERE project_id = ? AND version NOT IN (SELECT version FROM architecture_versions WHERE project_id = ? ORDER BY version DESC LIMIT 50)'
  ).run(projectId, projectId);

  return res.json({ id, version: newVersion });
});

// POST /api/projects/:id/architecture/versions/:versionId/restore
router.post('/:id/architecture/versions/:versionId/restore', (req: Request, res: Response) => {
  const { id: projectId, versionId } = req.params;

  // Get the version to restore
  const version = db.prepare(
    'SELECT arch_data FROM architecture_versions WHERE id = ? AND project_id = ?'
  ).get(versionId, projectId) as any;
  if (!version) return res.status(404).json({ error: 'Version not found' });

  // Safety snapshot: save current state before restoring
  const project = db.prepare('SELECT arch_data FROM projects WHERE id = ?').get(projectId) as any;
  if (project?.arch_data) {
    const maxRow = db.prepare(
      'SELECT MAX(version) as maxV FROM architecture_versions WHERE project_id = ?'
    ).get(projectId) as any;
    const safetyVersion = (maxRow?.maxV || 0) + 1;
    db.prepare(
      'INSERT INTO architecture_versions (id, project_id, version, arch_data, description) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), projectId, safetyVersion, project.arch_data, '還原前自動備份');
  }

  // Restore
  db.prepare('UPDATE projects SET arch_data = ? WHERE id = ?').run(version.arch_data, projectId);

  return res.json({ success: true, arch_data: JSON.parse(version.arch_data) });
});

export default router;
