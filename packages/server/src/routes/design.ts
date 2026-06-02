import { Router, type Request, type Response } from 'express';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { getProject } from '../services/projectService.js';
import { getArtifact, readArtifactPayload, createArtifact } from '../services/artifactService.js';
import { appendTurn } from '../services/turnService.js';
import { callProvider } from '../services/callProvider.js';
import { parseArtifactsFromResponseWithFallback } from '../services/chatOrchestrator.js';
import { scoreArtifact } from '../services/qualityScorer.js';

export function buildDesignRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });

  /**
   * POST /api/projects/:id/generate-variants
   * Body: { artifactId: string, instruction?: string }
   * Generates 2 visual variants of an existing vue-sfc artifact.
   */
  r.post('/generate-variants', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { artifactId, instruction } = req.body ?? {};
    if (typeof artifactId !== 'string' || !artifactId) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 artifactId' } });
      return;
    }

    const artifact = getArtifact(db, artifactId);
    if (!artifact || artifact.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '產物不存在' } });
      return;
    }

    let originalSource: string;
    try {
      originalSource = readArtifactPayload(dataDir, artifact);
    } catch (err) {
      res.status(500).json({ error: { code: 'PAYLOAD_READ_FAILED', message: (err as Error).message } });
      return;
    }

    const originalName = artifact.name;
    const extraInstruction = typeof instruction === 'string' && instruction.trim()
      ? `Additional guidance: ${instruction.trim()}`
      : '';

    const prompt = `Generate 2 distinct visual variants of this Vue SFC page. Keep the same functionality, but vary the design (colors, layout, typography, style). Output as 2 separate <artifact> blocks named '${originalName}-v1' and '${originalName}-v2'.
${extraInstruction}

Original source:
${originalSource}`;

    try {
      let fullText = '';
      for await (const tok of callProvider({ mode: 'design', prompt, streaming: false })) {
        fullText += tok;
      }

      const artifactBlocks = parseArtifactsFromResponseWithFallback(fullText);
      if (artifactBlocks.length === 0) {
        res.status(500).json({ error: { code: 'NO_VARIANTS', message: 'AI 未產生變體' } });
        return;
      }

      const artifactsRoot = join(dataDir, 'projects', projectId, 'artifacts');
      // Create a synthetic turn for the variant generation
      const turn = appendTurn(db, {
        projectId,
        mode: 'design',
        userText: `[generate-variants] ${originalName}`,
        aiResponse: { text: '[variant generation]' },
      });

      const variantNames: string[] = [];
      // Only take the first 2 blocks; rename them with -v1 / -v2 suffix if needed
      const suffix = ['-v1', '-v2'];
      const variants = artifactBlocks.slice(0, 2).map((block, i) => ({
        ...block,
        name: block.name.endsWith(suffix[i]) ? block.name : `${originalName}${suffix[i]}`,
      }));

      const createdVariants: Array<{ id: string; name: string }> = [];
      for (const variant of variants) {
        const a = createArtifact(db, {
          projectId, createdByTurn: turn.id,
          kind: 'vue-sfc', name: variant.name,
          payload: variant.payload, payloadExt: 'vue',
          artifactsRoot,
        });
        createdVariants.push({ id: a.id, name: a.name });
        variantNames.push(a.name);
      }

      res.json({ variants: createdVariants });
    } catch (err) {
      const parts: string[] = [];
      let cur: unknown = err;
      while (cur instanceof Error) {
        parts.push(cur.message);
        const code = (cur as Error & { code?: string }).code;
        if (code) parts.push(`(${code})`);
        cur = (cur as Error & { cause?: unknown }).cause;
      }
      const fullMessage = parts.join(' › ') || String(err);
      console.error('[design] generate-variants failure:', fullMessage);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: fullMessage } });
    }
  });

  /**
   * POST /api/projects/:id/regenerate-page
   * Body: { artifactId: string, instruction: string }
   * Regenerates a single page with a modification instruction.
   */
  r.post('/regenerate-page', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { artifactId, instruction } = req.body ?? {};
    if (typeof artifactId !== 'string' || !artifactId) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 artifactId' } });
      return;
    }

    const artifact = getArtifact(db, artifactId);
    if (!artifact || artifact.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '產物不存在' } });
      return;
    }

    let originalSource: string;
    try {
      originalSource = readArtifactPayload(dataDir, artifact);
    } catch (err) {
      res.status(500).json({ error: { code: 'PAYLOAD_READ_FAILED', message: (err as Error).message } });
      return;
    }

    const originalName = artifact.name;
    const modInstruction = typeof instruction === 'string' && instruction.trim()
      ? instruction.trim()
      : '重新設計，保持相同功能但更新視覺風格';

    const prompt = `Modify this Vue SFC page. Instruction: "${modInstruction}"

Output the result as a single <artifact kind="vue-sfc" name="${originalName}"> block. Keep the same page name.

Original source:
${originalSource}`;

    try {
      let fullText = '';
      for await (const tok of callProvider({ mode: 'design', prompt, streaming: false })) {
        fullText += tok;
      }

      const artifactBlocks = parseArtifactsFromResponseWithFallback(fullText);
      if (artifactBlocks.length === 0) {
        res.status(500).json({ error: { code: 'NO_ARTIFACT', message: 'AI 未產生頁面' } });
        return;
      }

      const artifactsRoot = join(dataDir, 'projects', projectId, 'artifacts');
      const turn = appendTurn(db, {
        projectId,
        mode: 'design',
        userText: `[regenerate-page] ${originalName}: ${modInstruction}`,
        aiResponse: { text: '[page regeneration]' },
      });

      // Use the first artifact block, enforce the original page name
      const block = { ...artifactBlocks[0], name: originalName };
      const a = createArtifact(db, {
        projectId, createdByTurn: turn.id,
        kind: 'vue-sfc', name: block.name,
        payload: block.payload, payloadExt: 'vue',
        artifactsRoot,
      });

      res.json({ artifact: { id: a.id, name: a.name } });
    } catch (err) {
      const parts: string[] = [];
      let cur: unknown = err;
      while (cur instanceof Error) {
        parts.push(cur.message);
        const code = (cur as Error & { code?: string }).code;
        if (code) parts.push(`(${code})`);
        cur = (cur as Error & { cause?: unknown }).cause;
      }
      const fullMessage = parts.join(' › ') || String(err);
      console.error('[design] regenerate-page failure:', fullMessage);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: fullMessage } });
    }
  });

  /**
   * POST /api/projects/:id/quality-score
   * Body: { artifactId: string }
   * Returns AI quality score for the given vue-sfc artifact.
   */
  r.post('/quality-score', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { artifactId } = req.body ?? {};
    if (typeof artifactId !== 'string' || !artifactId) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 artifactId' } });
      return;
    }

    const artifact = getArtifact(db, artifactId);
    if (!artifact || artifact.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '產物不存在' } });
      return;
    }

    let payload: string;
    try {
      payload = readArtifactPayload(dataDir, artifact);
    } catch (err) {
      res.status(500).json({ error: { code: 'PAYLOAD_READ_FAILED', message: (err as Error).message } });
      return;
    }

    const score = await scoreArtifact(payload);
    res.json({ score });
  });

  return r;
}
