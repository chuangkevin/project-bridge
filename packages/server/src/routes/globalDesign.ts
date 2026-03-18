import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import db from '../db/connection';
import upload from '../middleware/upload';

const router = Router();

function getGeminiApiKey(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any;
  return setting?.value || null;
}

function formatProfile(row: any, effectiveConvention?: string) {
  return {
    id: row.id,
    description: row.description,
    referenceAnalysis: row.reference_analysis,
    tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
    updatedAt: row.updated_at,
    design_convention: effectiveConvention !== undefined ? effectiveConvention : (row.design_convention || ''),
  };
}

// GET /api/global-design
router.get('/', (req: Request, res: Response) => {
  try {
    const row = db.prepare("SELECT * FROM global_design_profile WHERE id = 'global'").get() as any;
    if (!row) {
      return res.json({ profile: null });
    }
    const conventionFromDb = row?.design_convention || '';
    let effectiveConvention = conventionFromDb;
    if (!effectiveConvention) {
      const filePath = path.resolve(__dirname, '../../../../docs/colorConvention.md');
      if (fs.existsSync(filePath)) {
        effectiveConvention = fs.readFileSync(filePath, 'utf-8');
      }
    }
    return res.json({ profile: formatProfile(row, effectiveConvention) });
  } catch (err: any) {
    console.error('Error getting global design:', err);
    return res.status(500).json({ error: 'Failed to get global design' });
  }
});

// PUT /api/global-design
router.put('/', (req: Request, res: Response) => {
  try {
    const { description, referenceAnalysis, tokens, design_convention } = req.body;

    const existing = db.prepare("SELECT * FROM global_design_profile WHERE id = 'global'").get() as any;

    if (existing) {
      const newDescription = description !== undefined ? description : existing.description;
      const newReferenceAnalysis = referenceAnalysis !== undefined ? referenceAnalysis : existing.reference_analysis;
      const newTokens = tokens !== undefined
        ? (typeof tokens === 'object' ? JSON.stringify(tokens) : tokens)
        : existing.tokens;
      const newDesignConvention = design_convention !== undefined ? design_convention : (existing.design_convention || '');

      db.prepare(
        "UPDATE global_design_profile SET description = ?, reference_analysis = ?, tokens = ?, design_convention = ?, updated_at = datetime('now') WHERE id = 'global'"
      ).run(newDescription, newReferenceAnalysis, newTokens, newDesignConvention);
    } else {
      const newDescription = description !== undefined ? description : '';
      const newReferenceAnalysis = referenceAnalysis !== undefined ? referenceAnalysis : '';
      const newTokens = tokens !== undefined
        ? (typeof tokens === 'object' ? JSON.stringify(tokens) : tokens)
        : '{}';
      const newDesignConvention = design_convention !== undefined ? design_convention : '';

      db.prepare(
        "INSERT INTO global_design_profile (id, description, reference_analysis, tokens, design_convention) VALUES ('global', ?, ?, ?, ?)"
      ).run(newDescription, newReferenceAnalysis, newTokens, newDesignConvention);
    }

    const saved = db.prepare("SELECT * FROM global_design_profile WHERE id = 'global'").get() as any;
    return res.json({ profile: formatProfile(saved) });
  } catch (err: any) {
    console.error('Error saving global design:', err);
    return res.status(500).json({ error: 'Failed to save global design' });
  }
});

// POST /api/global-design/reset-convention
router.post('/reset-convention', (_req, res) => {
  const filePath = path.resolve(__dirname, '../../../../docs/colorConvention.md');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  const content = fs.readFileSync(filePath, 'utf-8');
  return res.json({ content });
});

// POST /api/global-design/summarize-direction
router.post('/summarize-direction', async (req: Request, res: Response) => {
  try {
    const { analyses } = req.body;
    if (!Array.isArray(analyses) || analyses.length === 0) {
      return res.status(400).json({ error: 'analyses array is required' });
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key not configured.' });
    }

    const combined = analyses.map((a: string, i: number) => `參考圖 ${i + 1}:\n${a}`).join('\n\n---\n\n');

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
    console.error('Error summarizing global design direction:', err);
    return res.status(500).json({ error: 'Could not summarize design direction' });
  }
});

// POST /api/global-design/analyze-reference
router.post('/analyze-reference', (req: Request, res: Response, next: NextFunction) => {
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

      fs.unlink(storagePath, (unlinkErr) => {
        if (unlinkErr) console.error('Failed to delete temp file:', unlinkErr);
      });

      return res.json({ analysis });
    } catch (err: any) {
      console.error('Error analyzing reference image for global design:', err);
      if (filePath) {
        fs.unlink(filePath, () => {});
      }
      return res.status(500).json({ error: 'Could not analyze image' });
    }
  });
});

export default router;
