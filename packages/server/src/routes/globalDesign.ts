import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import OpenAI from 'openai';
import db from '../db/connection';
import upload from '../middleware/upload';

const router = Router();

function getOpenAIApiKey(): string | null {
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get() as any;
  return setting?.value || null;
}

function formatProfile(row: any) {
  return {
    id: row.id,
    description: row.description,
    referenceAnalysis: row.reference_analysis,
    tokens: typeof row.tokens === 'string' ? JSON.parse(row.tokens) : row.tokens,
    updatedAt: row.updated_at,
  };
}

// GET /api/global-design
router.get('/', (req: Request, res: Response) => {
  try {
    const row = db.prepare("SELECT * FROM global_design_profile WHERE id = 'global'").get() as any;
    if (!row) {
      return res.json({ profile: null });
    }
    return res.json({ profile: formatProfile(row) });
  } catch (err: any) {
    console.error('Error getting global design:', err);
    return res.status(500).json({ error: 'Failed to get global design' });
  }
});

// PUT /api/global-design
router.put('/', (req: Request, res: Response) => {
  try {
    const { description, referenceAnalysis, tokens } = req.body;

    const existing = db.prepare("SELECT * FROM global_design_profile WHERE id = 'global'").get() as any;

    if (existing) {
      const newDescription = description !== undefined ? description : existing.description;
      const newReferenceAnalysis = referenceAnalysis !== undefined ? referenceAnalysis : existing.reference_analysis;
      const newTokens = tokens !== undefined
        ? (typeof tokens === 'object' ? JSON.stringify(tokens) : tokens)
        : existing.tokens;

      db.prepare(
        "UPDATE global_design_profile SET description = ?, reference_analysis = ?, tokens = ?, updated_at = datetime('now') WHERE id = 'global'"
      ).run(newDescription, newReferenceAnalysis, newTokens);
    } else {
      const newDescription = description !== undefined ? description : '';
      const newReferenceAnalysis = referenceAnalysis !== undefined ? referenceAnalysis : '';
      const newTokens = tokens !== undefined
        ? (typeof tokens === 'object' ? JSON.stringify(tokens) : tokens)
        : '{}';

      db.prepare(
        "INSERT INTO global_design_profile (id, description, reference_analysis, tokens) VALUES ('global', ?, ?, ?)"
      ).run(newDescription, newReferenceAnalysis, newTokens);
    }

    const saved = db.prepare("SELECT * FROM global_design_profile WHERE id = 'global'").get() as any;
    return res.json({ profile: formatProfile(saved) });
  } catch (err: any) {
    console.error('Error saving global design:', err);
    return res.status(500).json({ error: 'Failed to save global design' });
  }
});

// POST /api/global-design/summarize-direction
router.post('/summarize-direction', async (req: Request, res: Response) => {
  try {
    const { analyses } = req.body;
    if (!Array.isArray(analyses) || analyses.length === 0) {
      return res.status(400).json({ error: 'analyses array is required' });
    }

    const apiKey = getOpenAIApiKey();
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured.' });
    }

    const openai = new OpenAI({ apiKey });
    const combined = analyses.map((a: string, i: number) => `參考圖 ${i + 1}:\n${a}`).join('\n\n---\n\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '你是一位設計顧問。根據提供的視覺參考圖分析，用繁體中文寫出 2-4 句精簡的設計方向描述，涵蓋：整體風格、主色調、排版感受、元件風格。語氣簡潔專業，像在給設計師的 brief。',
        },
        {
          role: 'user',
          content: `以下是視覺參考圖的分析結果，請總結成設計方向：\n\n${combined}`,
        },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    const direction = response.choices[0]?.message?.content?.trim() || '';
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

      const apiKey = getOpenAIApiKey();
      if (!apiKey) {
        return res.status(400).json({ error: 'OpenAI API key not configured.' });
      }

      const { path: storagePath, mimetype } = req.file;

      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image must be 10MB or less' });
      }

      const base64data = fs.readFileSync(storagePath).toString('base64');
      const openai = new OpenAI({ apiKey });

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimetype};base64,${base64data}`,
                  detail: 'low',
                },
              },
              {
                type: 'text',
                text: 'Analyze this design reference image and describe in detail: 1) Color palette (list main colors with hex codes if visible), 2) Typography style (serif/sans-serif/mono, weight, size impression), 3) Spacing density (compact/normal/spacious), 4) Border radius style (sharp: 0-2px / medium: 4-8px / rounded: 12px+), 5) Shadow style (flat/subtle/prominent), 6) Overall aesthetic (minimalist/modern/playful/corporate/colorful/dark/light/etc.), 7) Any other distinctive design characteristics. Be specific and actionable so an AI can reproduce this style.',
              },
            ],
          },
        ],
      });

      const analysis = response.choices[0]?.message?.content || '';

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
