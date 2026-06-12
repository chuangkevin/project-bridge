import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { readSetting, writeSetting } from '../services/settings.js';
import { crawlWebsite, aggregateStyles } from '../services/websiteCrawler.js';
import { getProvider, defaultModel, withJsonInstruction, extractJsonBody, trackProviderUsage } from '../services/provider.js';
import { frontendDesignSkillBody } from '../services/callProvider.js';

export interface DesignPreset {
  id: string;
  name: string;
  description: string;
  tokens: {
    primaryColor: string;
    fontFamily: string;
    borderRadius: string;
  };
  referenceUrls: string[];
  createdAt: string;
}

const SETTINGS_KEY = 'design_presets';

function loadPresets(db: Database.Database): DesignPreset[] {
  const raw = readSetting(db, SETTINGS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as DesignPreset[]; } catch { return []; }
}

function savePresets(db: Database.Database, presets: DesignPreset[]): void {
  writeSetting(db, SETTINGS_KEY, JSON.stringify(presets));
}

export function buildDesignPresetsRouter(db: Database.Database): Router {
  const r = Router();

  r.get('/', (_req: Request, res: Response) => {
    res.json({ presets: loadPresets(db) });
  });

  r.post('/', (req: Request, res: Response) => {
    const { name, description, tokens, referenceUrls } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 name' } });
      return;
    }
    const preset: DesignPreset = {
      id: uuid(),
      name: name.trim(),
      description: typeof description === 'string' ? description : '',
      tokens: {
        primaryColor: tokens?.primaryColor ?? '#7c5cbf',
        fontFamily: tokens?.fontFamily ?? '',
        borderRadius: tokens?.borderRadius ?? '',
      },
      referenceUrls: Array.isArray(referenceUrls) ? referenceUrls : [],
      createdAt: new Date().toISOString(),
    };
    const presets = loadPresets(db);
    presets.push(preset);
    savePresets(db, presets);
    res.status(201).json(preset);
  });

  r.put('/:id', (req: Request, res: Response) => {
    const presets = loadPresets(db);
    const idx = presets.findIndex(p => p.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '預設不存在' } });
      return;
    }
    const { name, description, tokens, referenceUrls } = req.body ?? {};
    if (name !== undefined) presets[idx].name = String(name).trim();
    if (description !== undefined) presets[idx].description = String(description);
    if (tokens) {
      if (tokens.primaryColor !== undefined) presets[idx].tokens.primaryColor = tokens.primaryColor;
      if (tokens.fontFamily !== undefined) presets[idx].tokens.fontFamily = tokens.fontFamily;
      if (tokens.borderRadius !== undefined) presets[idx].tokens.borderRadius = tokens.borderRadius;
    }
    if (Array.isArray(referenceUrls)) presets[idx].referenceUrls = referenceUrls;
    savePresets(db, presets);
    res.json(presets[idx]);
  });

  r.delete('/:id', (req: Request, res: Response) => {
    const presets = loadPresets(db);
    const next = presets.filter(p => p.id !== req.params.id);
    if (next.length === presets.length) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '預設不存在' } });
      return;
    }
    savePresets(db, next);
    res.json({ ok: true });
  });

  /**
   * Analyze 1-3 reference URLs: crawl real computed styles via Playwright,
   * then ask AI to synthesize a design language description + tokens.
   * v1.5.1 parity: POST /api/design-presets/analyze-url
   */
  r.post('/analyze-url', async (req: Request, res: Response) => {
    const urls: string[] = Array.isArray(req.body?.urls)
      ? req.body.urls.filter((u: unknown) => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 3)
      : [];
    if (urls.length === 0) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要至少一個有效網址（http/https）' } });
      return;
    }

    // 逐條爬 + 每條 60s 上限：三條 heavy 頁面在小 pod 上並發會 CPU 餓死、
    // 全部撞 goto timeout（production 實測 timeout ×3 的根因）。
    const PER_URL_TIMEOUT = 60_000;
    const crawls: Awaited<ReturnType<typeof crawlWebsite>>[] = [];
    for (const url of urls) {
      try {
        crawls.push(await Promise.race([
          crawlWebsite(url),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('crawl timeout')), PER_URL_TIMEOUT)),
        ]));
      } catch (err: any) {
        crawls.push({ url, success: false, error: String(err?.message ?? err), colors: [], typography: { fonts: [], sizes: [], headings: [], body: null }, buttons: [], inputs: [], backgrounds: [], borderRadii: [], shadows: [] });
      }
    }

    const ok = crawls.filter(c => c.success);
    if (ok.length === 0) {
      res.status(502).json({ error: { code: 'CRAWL_FAILED', message: `所有網址爬取失敗：${crawls.map(c => c.error).join('; ')}` } });
      return;
    }

    const agg = aggregateStyles(ok);
    // Full per-site detail (headings, buttons, colors) + aggregate — the art
    // director reads everything the crawler captured, not just the summary.
    const perSiteDetail = ok.map(c => ({
      url: c.url,
      colors: c.colors.slice(0, 20),
      typography: c.typography,
      buttons: c.buttons.slice(0, 10),
      backgrounds: c.backgrounds.slice(0, 10),
      borderRadii: c.borderRadii,
      shadows: c.shadows,
    }));
    const prompt = `Analyze this crawled design system data from ${ok.length} reference website(s) and produce a reusable design style definition in Traditional Chinese.

Aggregated design system:
${JSON.stringify(agg, null, 2).slice(0, 10_000)}

Per-site raw computed styles:
${JSON.stringify(perSiteDetail, null, 2).slice(0, 15_000)}

Return JSON exactly in this shape:
{
  "description": "2-4 句繁體中文，描述這個設計語言的整體風格、氛圍與適用場景",
  "convention": "繁體中文條列式設計規範（主色、輔色、背景、字型、圓角、陰影、按鈕樣式等，每行一條，- 開頭）",
  "tokens": {
    "primaryColor": "#hex（最主要的品牌色，不要選黑白灰）",
    "secondaryColor": "#hex",
    "backgroundColor": "#hex",
    "fontFamily": "主要字型名稱",
    "borderRadius": "如 8px"
  },
  "palette": ["#hex", "..."]  // 5-8 個主要顏色由深到淺
}`;

    try {
      const client = getProvider();
      const exec = await client.generateWithSelection({
        model: defaultModel(),
        systemInstruction: withJsonInstruction(
          'You are an art-director AI agent (美術總監). Apply the following design-quality standards when reading and characterising the reference sites:\n\n'
          + frontendDesignSkillBody()
        ),
        prompt,
        maxOutputTokens: 4096,
      });
      try { trackProviderUsage(exec.selection, 'analyze-url-style', exec.response); } catch { /* non-fatal */ }
      const parsed = JSON.parse(extractJsonBody(exec.response.text));
      res.json({
        description: typeof parsed.description === 'string' ? parsed.description : '',
        convention: typeof parsed.convention === 'string' ? parsed.convention : '',
        tokens: {
          primaryColor: parsed.tokens?.primaryColor ?? '#7c5cbf',
          secondaryColor: parsed.tokens?.secondaryColor ?? '',
          backgroundColor: parsed.tokens?.backgroundColor ?? '',
          fontFamily: parsed.tokens?.fontFamily ?? '',
          borderRadius: parsed.tokens?.borderRadius ?? '',
        },
        palette: Array.isArray(parsed.palette) ? parsed.palette.filter((c: unknown) => typeof c === 'string') : [],
        crawledUrls: ok.map(c => c.url),
        failedUrls: crawls.filter(c => !c.success).map(c => ({ url: c.url, error: c.error })),
      });
    } catch (err: any) {
      res.status(502).json({ error: { code: 'AI_FAILED', message: `AI 分析失敗：${String(err?.message ?? err).slice(0, 200)}` } });
    }
  });

  r.post('/:id/copy', (req: Request, res: Response) => {
    const presets = loadPresets(db);
    const original = presets.find(p => p.id === req.params.id);
    if (!original) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '預設不存在' } });
      return;
    }
    const copy: DesignPreset = {
      ...original,
      id: uuid(),
      name: `${original.name} (複製)`,
      createdAt: new Date().toISOString(),
    };
    presets.push(copy);
    savePresets(db, presets);
    res.status(201).json(copy);
  });

  return r;
}
