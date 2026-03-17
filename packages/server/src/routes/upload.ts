import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';
import upload from '../middleware/upload';
import { extractText } from '../services/textExtractor';
import { extractImagesFromDocument, analyzeArtStyle } from '../services/artStyleExtractor';
import { renderPdfPages } from '../services/pdfPageRenderer';
import { analyzeDesignSpec } from '../services/designSpecAnalyzer';

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

      // Visual analysis for PDF and image files
      const apiKey = process.env.OPENAI_API_KEY ||
        (db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get() as any)?.value;

      let visualAnalysisReady = false;

      const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
      const isImage = mimetype.startsWith('image/') &&
        (mimetype.includes('png') || mimetype.includes('jpeg') || mimetype.includes('jpg') || mimetype.includes('webp'));

      if (apiKey && (isPdf || isImage)) {
        try {
          let images: Buffer[] = [];
          if (isPdf) {
            images = await renderPdfPages(storagePath, 6);
          } else if (isImage) {
            const fs = await import('fs');
            images = [fs.readFileSync(storagePath)];
          }
          if (images.length > 0) {
            const analysisText = await analyzeDesignSpec(images, apiKey);
            if (analysisText) {
              db.prepare(
                "UPDATE uploaded_files SET visual_analysis = ?, visual_analysis_at = datetime('now') WHERE id = ?"
              ).run(analysisText, id);
              visualAnalysisReady = true;
            }
          }
        } catch (analysisErr) {
          console.warn('[upload] Visual analysis failed (non-fatal):', (analysisErr as any).message);
        }
      }

      // Art style detection for PPTX/DOCX
      const isPptxOrDocx = mimetype.includes('presentationml') || mimetype.includes('wordprocessingml') ||
        originalname.toLowerCase().endsWith('.pptx') || originalname.toLowerCase().endsWith('.docx');

      if (isPptxOrDocx) {
        if (apiKey) {
          try {
            const images = await extractImagesFromDocument(storagePath, mimetype);
            if (images.length > 0) {
              const styleText = await analyzeArtStyle(images, apiKey);
              if (styleText) {
                const existing = db.prepare('SELECT id FROM art_style_preferences WHERE project_id = ?').get(projectId) as any;
                if (existing) {
                  db.prepare('UPDATE art_style_preferences SET detected_style = ?, updated_at = datetime(\'now\') WHERE project_id = ?')
                    .run(styleText, projectId);
                } else {
                  db.prepare('INSERT INTO art_style_preferences (id, project_id, detected_style) VALUES (?, ?, ?)')
                    .run(uuidv4(), projectId, styleText);
                }
              }
            }
          } catch (artErr) {
            console.error('Art style extraction error:', artErr);
            // non-fatal, continue
          }
        }
      }

      // Fetch art style if just detected
      const artStyle = db.prepare('SELECT detected_style FROM art_style_preferences WHERE project_id = ?').get(projectId) as any;

      return res.status(201).json({
        id,
        originalName: originalname,
        mimeType: mimetype,
        fileSize: size,
        extractedText,
        artStyleDetected: !!(artStyle?.detected_style),
        visualAnalysisReady,
      });
    } catch (uploadErr: any) {
      console.error('Upload error:', uploadErr);
      return res.status(500).json({ error: 'Failed to upload file' });
    }
  });
});

export default router;
