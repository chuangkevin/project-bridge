import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';
import upload from '../middleware/upload';
import { extractText } from '../services/textExtractor';

const router = Router();

// POST /api/projects/:id/upload — upload a file and extract text
router.post('/:id/upload', (req: Request, res: Response, next: NextFunction) => {
  // Check project exists before processing upload
  const projectId = req.params.id;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  upload.single('file')(req, res, async (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      // fileFilter errors
      return res.status(400).json({ error: err.message || 'File upload error' });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const { originalname, mimetype, size, path: storagePath } = req.file;

      // Extract text from the uploaded file
      const extractedText = await extractText(storagePath, mimetype);

      const id = uuidv4();
      db.prepare(
        'INSERT INTO uploaded_files (id, project_id, original_name, mime_type, file_size, storage_path, extracted_text) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, projectId, originalname, mimetype, size, storagePath, extractedText);

      return res.status(201).json({
        id,
        originalName: originalname,
        mimeType: mimetype,
        fileSize: size,
        extractedText,
      });
    } catch (uploadErr: any) {
      console.error('Upload error:', uploadErr);
      return res.status(500).json({ error: 'Failed to upload file' });
    }
  });
});

export default router;
