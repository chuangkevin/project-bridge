import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { readSetting, writeSetting } from '../services/settings.js';

export function buildGlobalDesignRouter(db: Database.Database): Router {
  const r = Router();

  r.get('/', (_req: Request, res: Response) => {
    const tokens = readSetting(db, 'global_design_tokens') ?? '';
    const convention = readSetting(db, 'global_design_convention') ?? '';
    const description = readSetting(db, 'global_design_description') ?? '';
    res.json({ tokens, convention, description });
  });

  r.put('/', (req: Request, res: Response) => {
    const { tokens, convention, description } = req.body ?? {};
    if (typeof tokens === 'string') writeSetting(db, 'global_design_tokens', tokens);
    if (typeof convention === 'string') writeSetting(db, 'global_design_convention', convention);
    if (typeof description === 'string') writeSetting(db, 'global_design_description', description);
    res.json({ ok: true });
  });

  r.post('/reset-convention', (_req: Request, res: Response) => {
    writeSetting(db, 'global_design_convention', '');
    res.json({ ok: true });
  });

  return r;
}
