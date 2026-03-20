import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';
import upload from '../middleware/upload';
import { extractText } from '../services/textExtractor';
import { extractImagesFromDocument, analyzeArtStyle } from '../services/artStyleExtractor';
import { renderPdfPages } from '../services/pdfPageRenderer';
import { analyzeDesignSpec } from '../services/designSpecAnalyzer';
import { getGeminiApiKey } from '../services/geminiKeys';

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

      const { mimetype, size, path: storagePath } = req.file;
      // Fix multer Latin-1 encoding of non-ASCII filenames (common with Chinese filenames)
      const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

      // Extract text from the uploaded file
      const extractedText = await extractText(storagePath, mimetype);

      const id = uuidv4();
      const pageName: string | null = (req.body?.page_name as string) || null;
      db.prepare(
        'INSERT INTO uploaded_files (id, project_id, original_name, mime_type, file_size, storage_path, extracted_text, page_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, projectId, originalname, mimetype, size, storagePath, extractedText, pageName);

      // Visual analysis for PDF and image files
      const apiKey = getGeminiApiKey();

      let visualAnalysisReady = false;
      let pageCount: number | null = null;

      const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
      const isImage = mimetype.startsWith('image/') &&
        (mimetype.includes('png') || mimetype.includes('jpeg') || mimetype.includes('jpg') || mimetype.includes('webp'));

      if (apiKey && (isPdf || isImage)) {
        try {
          let images: Buffer[] = [];
          if (isPdf) {
            images = await renderPdfPages(storagePath, 6);
            if (images.length > 0) {
              pageCount = images.length;
              db.prepare('UPDATE uploaded_files SET page_count = ? WHERE id = ?').run(pageCount, id);
            }
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

      // Fire-and-forget: Document Analysis Agent (structured analysis)
      if (apiKey && (isPdf || isImage)) {
        db.prepare("UPDATE uploaded_files SET analysis_status = 'pending' WHERE id = ?").run(id);
        import('../services/documentAnalysisAgent').then(({ analyzeDocument }) => {
          analyzeDocument(id, storagePath, mimetype, extractedText).catch(err => {
            console.warn('[upload] Document analysis agent failed:', err.message);
          });
        }).catch(() => {});
      }

      // Fetch art style if just detected
      const artStyle = db.prepare('SELECT detected_style FROM art_style_preferences WHERE project_id = ?').get(projectId) as any;

      // Determine analysis_status for client polling
      const analysisTriggered = !!(apiKey && (isPdf || isImage));
      const analysisStatus = analysisTriggered ? 'pending' : 'not_started';

      return res.status(201).json({
        id,
        originalName: originalname,
        mimeType: mimetype,
        fileSize: size,
        extractedText,
        artStyleDetected: !!(artStyle?.detected_style),
        visualAnalysisReady,
        pageCount,
        page_name: pageName,
        analysis_status: analysisStatus,
      });
    } catch (uploadErr: any) {
      console.error('Upload error:', uploadErr);
      return res.status(500).json({ error: 'Failed to upload file' });
    }
  });
});

// GET /:id/upload/spec-status — returns whether the project has any uploaded files with visual analysis
router.get('/:id/upload/spec-status', (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM uploaded_files WHERE project_id = ? AND visual_analysis IS NOT NULL'
  ).get(projectId) as { cnt: number };
  return res.json({ hasVisualAnalysis: row.cnt > 0 });
});

// POST /:id/upload/:fileId/reanalyze — re-run visual analysis on an existing uploaded file
router.post('/:id/upload/:fileId/reanalyze', async (req: Request, res: Response) => {
  const { id: projectId, fileId } = req.params;
  const file = db.prepare('SELECT * FROM uploaded_files WHERE id = ? AND project_id = ?').get(fileId, projectId) as any;
  if (!file) return res.status(404).json({ error: 'File not found' });

  const apiKey = process.env.GEMINI_API_KEY ||
    (db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any)?.value;
  if (!apiKey) return res.status(400).json({ error: 'No API key configured' });

  try {
    const { mime_type: mimetype, storage_path: storagePath, original_name: originalName } = file;
    const isPdf = mimetype === 'application/pdf' || originalName?.toLowerCase().endsWith('.pdf');
    const isImage = mimetype.startsWith('image/');

    let images: Buffer[] = [];
    if (isPdf) {
      images = await renderPdfPages(storagePath, 6);
    } else if (isImage) {
      const fs = await import('fs');
      images = [fs.readFileSync(storagePath)];
    } else {
      return res.status(400).json({ error: 'File type does not support visual analysis' });
    }

    if (images.length === 0) return res.status(400).json({ error: 'No images could be extracted' });

    const analysisText = await analyzeDesignSpec(images, apiKey);
    if (!analysisText) return res.status(500).json({ error: 'Analysis returned empty' });

    db.prepare(
      "UPDATE uploaded_files SET visual_analysis = ?, visual_analysis_at = datetime('now') WHERE id = ?"
    ).run(analysisText, fileId);

    return res.json({ success: true, visualAnalysis: analysisText });
  } catch (err: any) {
    console.error('[reanalyze] error:', err);
    return res.status(500).json({ error: err.message || 'Analysis failed' });
  }
});

// GET /:id/upload/:fileId/analysis-status — poll analysis agent progress
router.get('/:id/upload/:fileId/analysis-status', (req: Request, res: Response) => {
  const file = db.prepare(
    'SELECT analysis_status, analysis_result FROM uploaded_files WHERE id = ? AND project_id = ?'
  ).get(req.params.fileId, req.params.id) as any;
  if (!file) return res.status(404).json({ error: 'File not found' });
  return res.json({
    status: file.analysis_status || 'not_started',
    result: file.analysis_result ? JSON.parse(file.analysis_result) : null,
  });
});

// PATCH /:id/upload/:fileId/label — set component label and/or intent for uploaded file
router.patch('/:id/upload/:fileId/label', (req: Request, res: Response) => {
  const { id: projectId, fileId } = req.params;
  const { label, intent } = req.body;
  const file = db.prepare('SELECT id FROM uploaded_files WHERE id = ? AND project_id = ?').get(fileId, projectId);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const validIntents = ['design-spec', 'data-spec', 'brand-guide', 'reference'];

  if (typeof label === 'string') {
    db.prepare('UPDATE uploaded_files SET component_label = ? WHERE id = ?').run(label || null, fileId);
  }
  if (intent !== undefined) {
    const intentValue = (intent && validIntents.includes(intent)) ? intent : null;
    db.prepare('UPDATE uploaded_files SET intent = ? WHERE id = ?').run(intentValue, fileId);
  }
  // At least one field must be provided
  if (typeof label !== 'string' && intent === undefined) {
    return res.status(400).json({ error: 'label or intent required' });
  }
  return res.json({ success: true });
});

// GET /:id/analysis-summary — aggregate analysis results for architecture import
router.get('/:id/analysis-summary', (req: Request, res: Response) => {
  const { id: projectId } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const files = db.prepare(
    "SELECT analysis_result FROM uploaded_files WHERE project_id = ? AND analysis_status = 'done' AND analysis_result IS NOT NULL"
  ).all(projectId) as { analysis_result: string }[];

  if (files.length === 0) {
    return res.json({ pages: [], globalRules: [], documentTypes: [] });
  }

  // Merge pages by name across all analysis results
  const pageMap = new Map<string, {
    name: string;
    viewport: string;
    components: string[];
    navigationTo: string[];
    businessRules: string[];
    interactions: string[];
    dataFields: string[];
    layout?: string;
  }>();
  const globalRulesSet = new Set<string>();
  const documentTypes = new Set<string>();

  for (const file of files) {
    try {
      const result = JSON.parse(file.analysis_result);
      if (result.documentType) documentTypes.add(result.documentType);
      if (Array.isArray(result.globalRules)) {
        result.globalRules.forEach((r: string) => globalRulesSet.add(r));
      }
      if (Array.isArray(result.pages)) {
        for (const page of result.pages) {
          const existing = pageMap.get(page.name);
          if (existing) {
            // Merge: union components, navigationTo, businessRules
            const compSet = new Set([...existing.components, ...(page.components || [])]);
            existing.components = Array.from(compSet);
            const navSet = new Set([...existing.navigationTo, ...(page.navigationTo || [])]);
            existing.navigationTo = Array.from(navSet);
            const rulesSet = new Set([...existing.businessRules, ...(page.businessRules || [])]);
            existing.businessRules = Array.from(rulesSet);
            const interSet = new Set([...existing.interactions, ...(page.interactions || [])]);
            existing.interactions = Array.from(interSet);
            const fieldSet = new Set([...existing.dataFields, ...(page.dataFields || [])]);
            existing.dataFields = Array.from(fieldSet);
          } else {
            pageMap.set(page.name, {
              name: page.name,
              viewport: page.viewport || 'desktop',
              components: page.components || [],
              navigationTo: page.navigationTo || [],
              businessRules: page.businessRules || [],
              interactions: page.interactions || [],
              dataFields: page.dataFields || [],
              layout: page.layout,
            });
          }
        }
      }
    } catch {
      // Skip malformed JSON
    }
  }

  return res.json({
    pages: Array.from(pageMap.values()),
    globalRules: Array.from(globalRulesSet),
    documentTypes: Array.from(documentTypes),
  });
});

export default router;
