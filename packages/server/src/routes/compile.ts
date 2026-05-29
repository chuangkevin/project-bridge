import { Router, type Request, type Response } from 'express';
import type { SemanticUIAst } from '@designbridge/ast';
import * as compileService from '../services/compile';
import { listArtifacts, loadArtifact } from '../storage/artifactStore';
import { loadMirrorMeta } from '../storage/mirrorStore';
import { buildMirror } from '../services/mirrorBuilder';
import { parseWebpage } from '../ingestion/parseWebpage';
import { parseScreenshot } from '../ingestion/parseScreenshot';
import { ingestionCache } from '../services/ingestionCache';
import { extractTheme } from '../services/themeExtractor';
import { identifySite } from '../services/visionIdentifySite';

/** POST /:id/compile — cold start from a text requirement OR mirror-mode URL. */
export async function compileHandler(req: Request, res: Response): Promise<void> {
  const mode: string = req.body?.mode ?? 'pure-text';
  const artifactId: string = typeof req.body?.artifactId === 'string' && req.body.artifactId.trim()
    ? req.body.artifactId.trim() : 'artifact';

  if (mode === 'mirror') {
    const source = req.body?.source;
    if (source?.kind === 'image' && typeof source.mimeType === 'string' && typeof source.base64 === 'string') {
      const idr = await identifySite({ mimeType: source.mimeType, base64: source.base64 });
      if (!idr.ok) {
        res.json({ ok: false, reason: idr.reason === 'vision_unavailable' ? 'vision_unavailable' : 'unidentified_screenshot' });
        return;
      }
      try {
        const result = await buildMirror({ projectId: req.params.id as string, artifactId, url: idr.url });
        if (!result.ok) { res.json({ ok: false, reason: result.reason, detail: result.detail }); return; }
        res.json({ ok: true, artifact: result.meta });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
      return;
    }
    if (!source || source.kind !== 'url' || typeof source.payload !== 'string') {
      res.status(400).json({ error: 'mirror mode requires source.kind="url" and source.payload (string)' });
      return;
    }
    try {
      const result = await buildMirror({ projectId: req.params.id as string, artifactId, url: source.payload });
      if (!result.ok) { res.json({ ok: false, reason: result.reason, detail: result.detail }); return; }
      res.json({ ok: true, artifact: result.meta });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
    return;
  }

  if (mode === 'ast' && req.body?.source?.kind === 'image') {
    const source = req.body.source;
    if (typeof source.mimeType !== 'string' || typeof source.base64 !== 'string') {
      res.status(400).json({ error: 'ast+image mode requires source.mimeType and source.base64' });
      return;
    }
    const ps = await parseScreenshot({ mimeType: source.mimeType, base64: source.base64 });
    if (!ps.ok) { res.json({ ok: false, reason: ps.reason, detail: ps.detail }); return; }
    try {
      const result = await compileService.compileFromIngestion(ps.ingestion, { artifactId, projectId: req.params.id as string });
      res.json({ ok: true, ...result });
    } catch (err) {
      res.json({ ok: false, reason: 'ast_repair_exhausted', detail: (err as Error).message });
    }
    return;
  }

  if (mode === 'ast' && req.body?.source?.kind === 'url') {
    const projectId = req.params.id as string;
    const url = req.body.source.payload as string;
    if (typeof url !== 'string' || !url) {
      res.status(400).json({ error: 'ast+url mode requires source.payload (string)' });
      return;
    }
    let cached = ingestionCache.get(projectId, url);
    if (!cached) {
      const parsed = await parseWebpage(url);
      if (!parsed.ok) { res.json({ ok: false, reason: parsed.reason, detail: parsed.detail }); return; }
      ingestionCache.set(projectId, url, parsed.ingestion, { assets: parsed.assets });
      cached = { ingestion: parsed.ingestion, assets: parsed.assets };
    }
    try {
      const result = await compileService.compileFromIngestion(cached.ingestion, { artifactId, projectId });
      const themeProposal = extractTheme({ dom: cached.ingestion.dom, css: '', sourceUrl: url });
      res.json({ ok: true, ...result, themeProposal });
    } catch (err) {
      res.json({ ok: false, reason: 'ast_repair_exhausted', detail: (err as Error).message });
    }
    return;
  }

  // pure-text mode
  const requirement = req.body?.requirement;
  if (typeof requirement !== 'string' || requirement.trim().length === 0) {
    res.status(400).json({ error: 'requirement (non-empty string) is required' });
    return;
  }
  try {
    const result = await compileService.compileFromInput(
      { kind: 'requirement', text: requirement },
      { artifactId, projectId: req.params.id as string },
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

/** POST /:id/compile/mutate — apply an NL edit to an existing AST. */
export async function mutateHandler(req: Request, res: Response): Promise<void> {
  const ast = req.body?.ast as SemanticUIAst | undefined;
  const instruction = req.body?.instruction;
  if (!ast || typeof ast !== 'object' || typeof instruction !== 'string' || instruction.trim().length === 0) {
    res.status(400).json({ error: 'ast (object) and instruction (non-empty string) are required' });
    return;
  }
  try {
    const result = await compileService.compileMutation(ast, instruction, { projectId: req.params.id as string });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

/** GET /:id/artifacts — list persisted artifact entries (AST + Mirror) for a project. */
export function listArtifactsHandler(req: Request, res: Response): void {
  res.json({ artifacts: listArtifacts(req.params.id as string) });
}

/** GET /:id/artifacts/:artifactId — load a single persisted artifact (AST or Mirror metadata). */
export function loadArtifactHandler(req: Request, res: Response): void {
  const projectId = req.params.id as string;
  const artifactId = req.params.artifactId as string;
  const ast = loadArtifact(projectId, artifactId);
  if (ast) { res.json({ kind: 'ast', ast }); return; }
  const mirror = loadMirrorMeta(projectId, artifactId);
  if (mirror) { res.json({ kind: 'mirror', mirror }); return; }
  res.status(404).json({ error: 'artifact not found' });
}

const router = Router();
router.post('/:id/compile', compileHandler);
router.post('/:id/compile/mutate', mutateHandler);
router.get('/:id/artifacts', listArtifactsHandler);
router.get('/:id/artifacts/:artifactId', loadArtifactHandler);
export default router;
