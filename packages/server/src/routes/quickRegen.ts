import { Router, type Request, type Response } from 'express';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { getProject } from '../services/projectService.js';
import { getArtifact, readArtifactPayload, createArtifact } from '../services/artifactService.js';
import { appendTurn } from '../services/turnService.js';
import { callProvider } from '../services/callProvider.js';
import { parseArtifactsFromResponseWithFallback } from '../services/chatOrchestrator.js';

export function buildQuickRegenRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });

  /**
   * POST /api/projects/:id/quick-regen
   * Body: { artifactId: string, bridgeSelector: string, instruction: string }
   * Modifies a specific element in a Vue SFC based on CSS selector and instruction.
   */
  r.post('/quick-regen', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { artifactId, bridgeSelector, instruction } = req.body ?? {};
    if (typeof artifactId !== 'string' || !artifactId) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 artifactId' } });
      return;
    }
    if (typeof bridgeSelector !== 'string' || !bridgeSelector) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 bridgeSelector' } });
      return;
    }
    if (typeof instruction !== 'string' || !instruction.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 instruction' } });
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

    const prompt = `Modify this Vue SFC. Find the element matching CSS selector '${bridgeSelector}' or description '${instruction.trim()}'. Apply the requested change. Output ONLY the complete modified SFC wrapped in: <artifact kind='vue-sfc' name='${artifact.name}'> ... </artifact>

Original source:
${originalSource}`;

    try {
      let fullText = '';
      for await (const tok of callProvider({ mode: 'design', prompt, streaming: false })) {
        fullText += tok;
      }

      const artifactBlocks = parseArtifactsFromResponseWithFallback(fullText);
      if (artifactBlocks.length === 0) {
        res.status(500).json({ error: { code: 'NO_ARTIFACT', message: 'AI 未產生修改結果' } });
        return;
      }

      const artifactsRoot = join(dataDir, 'projects', projectId, 'artifacts');
      const turn = appendTurn(db, {
        projectId,
        mode: 'design',
        userText: `[quick-regen] ${artifact.name} · ${bridgeSelector} · ${instruction.trim()}`,
        aiResponse: { text: '[quick regen]' },
      });

      const block = { ...artifactBlocks[0], name: artifact.name };
      const newArtifact = createArtifact(db, {
        projectId, createdByTurn: turn.id,
        kind: 'vue-sfc', name: block.name,
        payload: block.payload, payloadExt: 'vue',
        artifactsRoot,
      });

      res.json({ ok: true, artifactId: newArtifact.id, name: newArtifact.name });
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
      console.error('[quick-regen] failure:', fullMessage);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: fullMessage } });
    }
  });

  return r;
}
