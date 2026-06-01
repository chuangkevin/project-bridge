import { Router, type Request, type Response } from 'express';
import express from 'express';
import { saveTheme, loadTheme, type ThemeFile } from '../storage/themeStore';
import { mergeTheme, type ThemeMergeChoice } from '../services/themeMerger';
import type { ThemeProposal } from '../services/themeExtractor';

export interface ThemeRouterOpts { baseDir?: string; }

export function createThemeRouter(opts: ThemeRouterOpts = {}): Router {
  const router = Router();

  router.get('/:id/theme', (req: Request, res: Response) => {
    res.json({ theme: loadTheme(req.params.id as string, { baseDir: opts.baseDir }) });
  });

  router.put('/:id/theme', express.json(), (req: Request, res: Response) => {
    const theme = req.body?.theme as ThemeFile | undefined;
    if (!theme || typeof theme !== 'object') {
      res.status(400).json({ error: 'theme (object) required' });
      return;
    }
    saveTheme(req.params.id as string, theme, { baseDir: opts.baseDir });
    res.json({ ok: true });
  });

  router.post('/:id/theme/merge', express.json(), (req: Request, res: Response) => {
    const proposal = req.body?.proposal as ThemeProposal | undefined;
    const choice = req.body?.choice as ThemeMergeChoice | undefined;
    if (!proposal || !choice) {
      res.status(400).json({ error: 'proposal + choice required' });
      return;
    }
    const current = loadTheme(req.params.id as string, { baseDir: opts.baseDir });
    const merged = mergeTheme(current, proposal, choice);
    saveTheme(req.params.id as string, merged, { baseDir: opts.baseDir });
    res.json({ ok: true, theme: merged });
  });

  return router;
}

export default createThemeRouter();
