import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../db/connection';
import upload from '../middleware/upload';

const router = Router();

function getGeminiApiKey(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any;
  return setting?.value || null;
}

function formatProfile(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    description: row.description,
    referenceAnalysis: row.reference_analysis,
    tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
    inheritGlobal: row.inherit_global === 1 ? true : (row.inherit_global === 0 ? false : true),
    supplement: row.supplement || '',
    updatedAt: row.updated_at,
  };
}

// GET /api/projects/:id/design — get design profile
router.get('/:id/design', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const row = db.prepare('SELECT * FROM design_profiles WHERE project_id = ?').get(projectId) as any;
    if (!row) {
      return res.json({ profile: null });
    }

    return res.json({ profile: formatProfile(row) });
  } catch (err: any) {
    console.error('Error getting design profile:', err);
    return res.status(500).json({ error: 'Failed to get design profile' });
  }
});

// PUT /api/projects/:id/design — upsert design profile
router.put('/:id/design', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { description, referenceAnalysis, tokens, inheritGlobal, supplement } = req.body;

    const existing = db.prepare('SELECT * FROM design_profiles WHERE project_id = ?').get(projectId) as any;

    if (existing) {
      const newDescription = description !== undefined ? description : existing.description;
      const newReferenceAnalysis = referenceAnalysis !== undefined ? referenceAnalysis : existing.reference_analysis;
      const newTokens = tokens !== undefined
        ? (typeof tokens === 'object' ? JSON.stringify(tokens) : tokens)
        : existing.tokens;
      const newInheritGlobal = inheritGlobal !== undefined ? (inheritGlobal ? 1 : 0) : existing.inherit_global;
      const newSupplement = supplement !== undefined ? supplement : existing.supplement;

      db.prepare(
        "UPDATE design_profiles SET description = ?, reference_analysis = ?, tokens = ?, inherit_global = ?, supplement = ?, updated_at = datetime('now') WHERE project_id = ?"
      ).run(newDescription, newReferenceAnalysis, newTokens, newInheritGlobal, newSupplement, projectId);
    } else {
      const id = uuidv4();
      const newDescription = description !== undefined ? description : '';
      const newReferenceAnalysis = referenceAnalysis !== undefined ? referenceAnalysis : '';
      const newTokens = tokens !== undefined
        ? (typeof tokens === 'object' ? JSON.stringify(tokens) : tokens)
        : '{}';
      const newInheritGlobal = inheritGlobal !== undefined ? (inheritGlobal ? 1 : 0) : 1;
      const newSupplement = supplement !== undefined ? supplement : '';

      db.prepare(
        "INSERT INTO design_profiles (id, project_id, description, reference_analysis, tokens, inherit_global, supplement) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(id, projectId, newDescription, newReferenceAnalysis, newTokens, newInheritGlobal, newSupplement);
    }

    const saved = db.prepare('SELECT * FROM design_profiles WHERE project_id = ?').get(projectId) as any;
    return res.json({ profile: formatProfile(saved) });
  } catch (err: any) {
    console.error('Error upserting design profile:', err);
    return res.status(500).json({ error: 'Failed to save design profile' });
  }
});

// POST /api/projects/:id/design/summarize-direction — summarize analyses into Chinese design direction
router.post('/:id/design/summarize-direction', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { analyses } = req.body;
    if (!Array.isArray(analyses) || analyses.length === 0) {
      return res.status(400).json({ error: 'analyses array is required' });
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key not configured.' });
    }

    const combined = analyses.map((a, i) => `參考圖 ${i + 1}:\n${a}`).join('\n\n---\n\n');

    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: '你是一位設計顧問。根據提供的視覺參考圖分析，用繁體中文寫出 2-4 句精簡的設計方向描述，涵蓋：整體風格、主色調、排版感受、元件風格。語氣簡潔專業，像在給設計師的 brief。',
      generationConfig: { maxOutputTokens: 300, temperature: 0.3 },
    });
    const result = await model.generateContent(`以下是視覺參考圖的分析結果，請總結成設計方向：\n\n${combined}`);
    const direction = result.response.text().trim() || '';
    return res.json({ direction });
  } catch (err: any) {
    console.error('Error summarizing design direction:', err);
    return res.status(500).json({ error: 'Could not summarize design direction' });
  }
});

// POST /api/projects/:id/design/analyze-reference — analyze image via Vision API
router.post('/:id/design/analyze-reference', (req: Request, res: Response, next: NextFunction) => {
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
      return res.status(400).json({ error: err.message || 'File upload error' });
    }

    const filePath = req.file?.path;

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        return res.status(400).json({ error: 'Gemini API key not configured.' });
      }

      const { path: storagePath, mimetype } = req.file;

      // Enforce 10MB limit for vision
      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image must be 10MB or less' });
      }

      const base64data = fs.readFileSync(storagePath).toString('base64');

      const genai = new GoogleGenerativeAI(apiKey);
      const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent([
        { inlineData: { mimeType: mimetype, data: base64data } },
        { text: 'Analyze this design reference image and describe in detail: 1) Color palette (list main colors with hex codes if visible), 2) Typography style (serif/sans-serif/mono, weight, size impression), 3) Spacing density (compact/normal/spacious), 4) Border radius style (sharp: 0-2px / medium: 4-8px / rounded: 12px+), 5) Shadow style (flat/subtle/prominent), 6) Overall aesthetic (minimalist/modern/playful/corporate/colorful/dark/light/etc.), 7) Any other distinctive design characteristics. Be specific and actionable so an AI can reproduce this style.' },
      ]);
      const analysis = result.response.text() || '';

      // Delete temp file after analysis
      fs.unlink(storagePath, (unlinkErr) => {
        if (unlinkErr) console.error('Failed to delete temp file:', unlinkErr);
      });

      return res.json({ analysis });
    } catch (err: any) {
      console.error('Error analyzing reference image:', err);
      // Clean up temp file on error
      if (filePath) {
        fs.unlink(filePath, () => {});
      }
      return res.status(500).json({ error: 'Could not analyze image' });
    }
  });
});

export default router;
