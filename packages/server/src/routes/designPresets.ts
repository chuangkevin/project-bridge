import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { readSetting, writeSetting } from '../services/settings.js';

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
