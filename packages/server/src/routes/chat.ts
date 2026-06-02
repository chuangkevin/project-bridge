import { Router, type Request, type Response } from 'express';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { getProject } from '../services/projectService.js';
import { buildMemorySnapshot } from '../services/memorySnapshot.js';
import { listSkills, readSkill, getSystemPromptSkillList } from '../services/skillRegistry.js';
import { parseSlashCommand } from '../services/slashCommand.js';
import { callProvider } from '../services/callProvider.js';
import { startSseKeepalive, stopSseKeepalive } from '../utils/sseKeepalive.js';
import { appendTurn, type TurnMode } from '../services/turnService.js';
import { addFact } from '../services/factService.js';
import { parseFactsFromResponse } from '../services/factExtractor.js';
import { getAttachment, type Attachment } from '../services/ingestionService.js';
import { buildSystemPrompt, parseArtifactsFromResponseWithFallback } from '../services/chatOrchestrator.js';
import { createArtifact } from '../services/artifactService.js';
import { runCouncil } from '../services/councilOrchestrator.js';

const VALID_MODES: TurnMode[] = ['consult', 'architect', 'design'];

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function buildChatRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });

  r.post('/', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { mode, text, attachmentIds, council: councilFlag } = req.body ?? {};
    if (!(VALID_MODES as string[]).includes(mode)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'mode 必須是 consult/architect/design' } });
      return;
    }
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 text' } });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const keepalive = startSseKeepalive(res, 15_000);

    try {
      sse(res, 'phase', { phase: 'loading_memory' });
      const snapshot = buildMemorySnapshot(db, projectId, {});

      // Skills
      const slashCmd = parseSlashCommand(text.trim());
      const forcedSkill = slashCmd ? readSkill(slashCmd.skill, { projectId }) : null;
      const skillDescriptions = getSystemPromptSkillList({ projectId });
      const allSkillNames = listSkills({ projectId }).map(s => s.name);
      sse(res, 'phase', { phase: 'selecting_skills', skills: allSkillNames });

      // Attachments
      const attachments: Attachment[] = [];
      if (Array.isArray(attachmentIds)) {
        for (const aid of attachmentIds) {
          const a = getAttachment(db, String(aid));
          if (a && a.projectId === projectId) attachments.push(a);
        }
      }

      // Compose system prompt
      const userSystem = buildSystemPrompt({
        mode, memorySnapshot: snapshot, skillDescriptions,
        forcedSkillBody: forcedSkill?.body,
        attachments: attachments.map(a => ({ kind: a.kind, parsedText: a.parsedText, originalName: a.originalName })),
      });

      sse(res, 'phase', { phase: 'thinking' });

      // Council mode — only available in consult mode per Plan 12 boundary
      const useCouncil = mode === 'consult' && councilFlag === true;

      if (useCouncil) {
        sse(res, 'phase', { phase: 'council_start' });
        const cleanText = slashCmd ? slashCmd.rest : text.trim();
        const gen = runCouncil({ baseSystemPrompt: userSystem, userText: cleanText, mode, projectId });
        let stepResult: IteratorResult<unknown, { transcripts: Record<string, string>; finalAnswer: string }>;
        while (true) {
          stepResult = await gen.next() as IteratorResult<unknown, { transcripts: Record<string, string>; finalAnswer: string }>;
          if (stepResult.done) break;
          const ev = stepResult.value as { kind: string; persona: string; text?: string };
          if (ev.kind === 'persona_start') {
            sse(res, 'phase', { phase: `council_${ev.persona}`, persona: ev.persona });
          } else if (ev.kind === 'persona_token') {
            sse(res, 'council_token', { persona: ev.persona, text: ev.text });
          } else if (ev.kind === 'persona_end') {
            sse(res, 'phase', { phase: `council_${ev.persona}_done`, persona: ev.persona });
          }
        }

        const { transcripts, finalAnswer } = stepResult!.value;
        const answerText = stripThinking(finalAnswer);
        const thinkingText = ['pm', 'designer', 'engineer']
          .map(p => `### ${p.toUpperCase()}\n${stripThinking(transcripts[p] ?? '')}`)
          .join('\n\n');

        const turn = appendTurn(db, {
          projectId,
          mode: mode as TurnMode,
          userText: text.trim(),
          aiResponse: { text: answerText, thinking: thinkingText },
          skillsUsed: ['council-pm', 'council-designer', 'council-engineer', 'council-moderator'],
        });

        sse(res, 'done', { turnId: turn.id });
        return; // cleanup handled by finally block
      }

      // Stream from provider (non-council path)
      let inThinkingBlock = false;
      let buffer = '';
      let fullText = '';

      const cleanText = slashCmd ? slashCmd.rest : text.trim();
      for await (const tok of callProvider({ mode, prompt: cleanText, systemInstruction: userSystem, streaming: true })) {
        fullText += tok;
        buffer += tok;
        // Detect <thinking>...</thinking> blocks and route tokens accordingly
        while (true) {
          if (!inThinkingBlock) {
            const openIdx = buffer.indexOf('<thinking>');
            if (openIdx === -1) {
              // Emit as 'token' but hold back the last 10 chars in case it's a partial '<thinking>'
              if (buffer.length > 10) {
                const emit = buffer.slice(0, buffer.length - 10);
                if (emit) sse(res, 'token', { text: emit });
                buffer = buffer.slice(buffer.length - 10);
              }
              break;
            }
            // Emit text before the open tag as 'token'
            if (openIdx > 0) sse(res, 'token', { text: buffer.slice(0, openIdx) });
            buffer = buffer.slice(openIdx + '<thinking>'.length);
            inThinkingBlock = true;
            // Note: phase 'thinking' was already emitted at start. The block can be detected mid-stream too.
          } else {
            const closeIdx = buffer.indexOf('</thinking>');
            if (closeIdx === -1) {
              // Emit as thinking_token, hold back last 11 chars
              if (buffer.length > 11) {
                const emit = buffer.slice(0, buffer.length - 11);
                if (emit) sse(res, 'thinking_token', { text: emit });
                buffer = buffer.slice(buffer.length - 11);
              }
              break;
            }
            // Emit text before the close as thinking_token
            if (closeIdx > 0) sse(res, 'thinking_token', { text: buffer.slice(0, closeIdx) });
            buffer = buffer.slice(closeIdx + '</thinking>'.length);
            inThinkingBlock = false;
            sse(res, 'phase', { phase: 'answering' });
          }
        }
      }
      // Flush any remaining buffer
      if (buffer) {
        if (inThinkingBlock) sse(res, 'thinking_token', { text: buffer });
        else sse(res, 'token', { text: buffer });
      }

      // Extract facts + persist turn
      const thinkingText = extractTagText(fullText, 'thinking');
      const answerText = stripTagText(fullText, 'thinking')
        .replace(/<facts>[\s\S]*?<\/facts>/g, '')
        .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
        .trim();
      const facts = parseFactsFromResponse(fullText);

      const turn = appendTurn(db, {
        projectId,
        mode: mode as TurnMode,
        userText: text.trim(),
        aiResponse: { text: answerText, thinking: thinkingText || undefined },
        skillsUsed: forcedSkill ? [forcedSkill.name] : undefined,
      });
      for (const f of facts) addFact(db, { projectId, turnId: turn.id, kind: f.kind, text: f.text });

      // Persist artifacts found in the response (fallback extracts ```vue/```html blocks)
      const artifactBlocks = parseArtifactsFromResponseWithFallback(fullText);
      const artifactsRoot = join(dataDir, 'projects', projectId, 'artifacts');
      for (const block of artifactBlocks) {
        const ext = block.kind === 'vue-sfc' ? 'vue' : 'json';
        const a = createArtifact(db, {
          projectId, createdByTurn: turn.id,
          kind: block.kind, name: block.name,
          payload: block.payload, payloadExt: ext,
          artifactsRoot,
        });
        sse(res, 'artifact', { id: a.id, kind: a.kind, name: a.name });
      }

      sse(res, 'done', { turnId: turn.id });
    } catch (err) {
      // Node's fetch wraps low-level errors as TypeError('fetch failed') with
      // the actual reason in err.cause. Surface the full chain so the UI shows
      // ECONNREFUSED / ENOTFOUND / 404 etc instead of generic "fetch failed".
      const parts: string[] = [];
      let cur: unknown = err;
      while (cur instanceof Error) {
        parts.push(cur.message);
        const code = (cur as Error & { code?: string }).code;
        if (code) parts.push(`(${code})`);
        cur = (cur as Error & { cause?: unknown }).cause;
      }
      const fullMessage = parts.join(' › ') || String(err);
      console.error('[chat] provider failure:', fullMessage, err);
      sse(res, 'error', { code: 'INTERNAL_ERROR', message: fullMessage });
    } finally {
      stopSseKeepalive(keepalive);
      res.end();
    }
  });

  return r;
}

function stripThinking(text: string): string {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

function extractTagText(s: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return s.match(re)?.[1]?.trim() ?? '';
}

function stripTagText(s: string, tag: string): string {
  const re = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return s.replace(re, '');
}
