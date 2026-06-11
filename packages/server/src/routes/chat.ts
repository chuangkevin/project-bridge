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
import { buildSystemPrompt, parseArtifactsFromResponseWithFallback, type ActiveArtifactContext } from '../services/chatOrchestrator.js';
import { createArtifact, getArtifact, listArtifacts, readArtifactPayload } from '../services/artifactService.js';
import type { ProviderCallMeta } from '../services/callProvider.js';
import { runCouncil } from '../services/councilOrchestrator.js';
import { readSetting } from '../services/settings.js';
import { componentIndexBlock, expandLibComponents } from '../services/componentLibrary.js';
import {
  parseReplicationIntent, detectFirstUrl, imagesFromAttachments,
  crawlForReplication, crawledSourceBlock,
  REPLICATE_CONFIRM_INSTRUCTION, STYLE_ONLY_INSTRUCTION, REFERENCE_ONLY_INSTRUCTION,
  REPLICATION_SPEC_PROMPT,
} from '../services/replication.js';
import { insertIntoPath } from '../services/sfcSurgeon.js';
import { geminiVisionQuery, visionModel } from '../services/provider.js';

/** Build the global-design system prompt block for design mode, or '' when
 *  the project opted out (inherit_global_style = 0) or nothing is configured. */
function globalStyleBlock(db: Database.Database, inherit: boolean): string {
  if (!inherit) return '';
  const description = readSetting(db, 'global_design_description') ?? '';
  const convention = readSetting(db, 'global_design_convention') ?? '';
  const tokens = readSetting(db, 'global_design_tokens') ?? '';
  if (!description && !convention && !tokens) return '';
  const parts = ['## 全域設計風格（必須遵循）'];
  if (description) parts.push(`### 設計方向\n${description}`);
  if (convention) parts.push(`### 設計規範\n${convention}`);
  if (tokens) parts.push(`### CSS Tokens（生成的 UI 必須使用這些變數值）\n${tokens}`);
  return '\n\n' + parts.join('\n\n');
}

const VALID_MODES: TurnMode[] = ['consult', 'architect', 'design'];

/** Join an optional prompt block with section spacing. */
function prefixed(block: string): string {
  return block ? '\n\n' + block : '';
}

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

      // Active artifact source — design mode modifications must see the real
      // current design, not just an artifact id (design-generation-context spec).
      let activeArtifact: ActiveArtifactContext | undefined;
      if (mode === 'design') {
        const requestedArtifactId = typeof req.body?.activeArtifactId === 'string' ? req.body.activeArtifactId : undefined;
        const candidate = requestedArtifactId
          ? getArtifact(db, requestedArtifactId)
          : listArtifacts(db, projectId, { kind: 'vue-sfc' })[0] ?? null;
        if (candidate && candidate.projectId === projectId && candidate.kind === 'vue-sfc') {
          try {
            activeArtifact = { id: candidate.id, name: candidate.name, source: readArtifactPayload(dataDir, candidate) };
          } catch (e) {
            console.warn(`[chat] failed to read active artifact ${candidate.id} payload:`, (e as Error).message);
          }
        }
      }

      // Compose system prompt. Design mode appends global style when the project inherits it.
      let userSystem = buildSystemPrompt({
        mode, memorySnapshot: snapshot, skillDescriptions,
        forcedSkillBody: forcedSkill?.body,
        attachments: attachments.map(a => ({ kind: a.kind, parsedText: a.parsedText, originalName: a.originalName })),
        activeArtifact,
      }) + (mode === 'design' ? globalStyleBlock(db, project.inheritGlobalStyle) : '')
        + (mode === 'design' ? prefixed(componentIndexBlock(db, projectId)) : '');

      // ── Replication intake (design-replication spec) ─────────────────────
      const replicationIntent = parseReplicationIntent(req.body?.replicationIntent);
      const replicationImages = mode === 'design' ? imagesFromAttachments(dataDir, attachments) : [];
      const replicationUrl = mode === 'design' ? detectFirstUrl(text) : null;
      const hasReplicationMedia = replicationImages.length > 0 || !!replicationUrl;
      if (mode === 'design' && hasReplicationMedia && !replicationIntent) {
        userSystem += prefixed(REPLICATE_CONFIRM_INSTRUCTION); // 雙保險：UI 選項被忽略時 AI 先確認
      } else if (mode === 'design' && replicationIntent?.intent === 'style-only') {
        userSystem += prefixed(STYLE_ONLY_INSTRUCTION);
      } else if (mode === 'design' && replicationIntent?.intent === 'reference') {
        userSystem += prefixed(REFERENCE_ONLY_INSTRUCTION);
      }

      // Verbatim expansion of <lib-component name="..."/> placeholders before
      // persisting any vue-sfc artifact (component-library spec). Unknown names
      // surface as explicit SSE errors — never silently guessed.
      const expandComponents = (kind: string, payload: string): string => {
        if (kind !== 'vue-sfc' || mode !== 'design') return payload;
        try {
          const result = expandLibComponents(db, projectId, payload);
          for (const name of result.unknown) {
            sse(res, 'error', { code: 'UNKNOWN_COMPONENT', message: `元件「${name}」不存在於元件庫，該位置已以警告區塊代替` });
          }
          return result.payload;
        } catch (e) {
          console.warn('[chat] component expansion failed:', (e as Error).message);
          return payload;
        }
      };

      // ── 照抄 branch (design-replication spec) ─────────────────────────────
      if (mode === 'design' && replicationIntent?.intent === 'replicate' && hasReplicationMedia) {
        sse(res, 'phase', { phase: 'thinking', message: '照抄模式：整理來源素材…' });

        let sourceBlock = '';
        if (replicationUrl) {
          sse(res, 'phase', { phase: 'thinking', message: `爬取目標頁面：${replicationUrl}` });
          try {
            const crawled = await crawlForReplication(replicationUrl);
            sourceBlock = crawledSourceBlock(crawled);
          } catch (e) {
            const msg = (e as Error).message;
            if (replicationImages.length === 0) throw new Error(`照抄來源爬取失敗：${msg}`);
            sse(res, 'error', { code: 'CRAWL_FAILED', message: `網址爬取失敗（${msg}），改以圖片為唯一來源繼續照抄` });
          }
        }

        const cleanText = slashCmd ? slashCmd.rest : text.trim();
        const basePrompt = cleanText + (sourceBlock ? '\n\n' + sourceBlock : '');
        const elementDestination = replicationIntent.destination === 'element'
          && replicationIntent.elementPath && activeArtifact ? replicationIntent.elementPath : null;
        const elementOverride = elementDestination
          ? '\n\nOUTPUT FORMAT OVERRIDE: output ONLY the replicated content as ONE single root element inside one ```html code fence. NO <artifact> tag, NO <script>, NO full page.'
          : '';

        let replicateMeta: ProviderCallMeta | null = null;
        const runReplicate = async (withImages: boolean, visionSpec: string | null): Promise<string> => {
          let full = '';
          for await (const tok of callProvider({
            mode: 'replicate',
            prompt: basePrompt + (visionSpec ? `\n\n## 視覺規格（由圖片分析產生，照此重建）\n${visionSpec}` : ''),
            systemInstruction: userSystem + elementOverride,
            // Non-streaming when images ride along → a mid-call failure can
            // fall back to the vision-spec path without half-streamed tokens.
            streaming: !withImages,
            ...(withImages ? { model: visionModel(), images: replicationImages } : {}),
            onMeta: (m) => { replicateMeta = m; sse(res, 'meta', m); },
          })) {
            full += tok;
            if (!withImages) sse(res, 'token', { text: tok });
          }
          if (withImages) sse(res, 'token', { text: full });
          return full;
        };

        let replicateFullText: string;
        if (replicationImages.length > 0) {
          try {
            replicateFullText = await runReplicate(true, null);
          } catch (e) {
            // OpenCode/model rejected image parts → deterministic Gemini vision
            // spec, then text-only replicate. Never silent (SSE tells the user).
            sse(res, 'phase', { phase: 'thinking', message: '圖片直送失敗，改用視覺規格路徑重建（Gemini 分析圖片 → 文字規格）…' });
            const spec = await geminiVisionQuery(REPLICATION_SPEC_PROMPT, replicationImages.map(i => ({ mimeType: i.mimeType, data: i.data })), { maxOutputTokens: 3000 });
            if (!spec) throw e;
            replicateFullText = await runReplicate(false, spec);
          }
        } else {
          replicateFullText = await runReplicate(false, null);
        }

        const answerText = replicateFullText
          .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
          .replace(/```[\s\S]*?```/g, '')
          .trim();
        const turn = appendTurn(db, {
          projectId, mode: 'design' as TurnMode,
          userText: text.trim(),
          aiResponse: { text: answerText || '[照抄完成]' },
          modelUsed: formatModelUsed(replicateMeta),
        });

        const artifactsRoot = join(dataDir, 'projects', projectId, 'artifacts');
        if (elementDestination && activeArtifact) {
          const { extractElementSnippet } = await import('./quickRegen.js');
          const snippet = extractElementSnippet(replicateFullText);
          const inserted = insertIntoPath(activeArtifact.source, elementDestination, snippet);
          if (inserted.ok) {
            const a = createArtifact(db, {
              projectId, createdByTurn: turn.id, kind: 'vue-sfc', name: activeArtifact.name,
              payload: inserted.sfc, payloadExt: 'vue', artifactsRoot,
            });
            sse(res, 'artifact', { id: a.id, kind: a.kind, name: a.name });
          } else {
            sse(res, 'error', { code: 'INSERT_FAILED', message: `照抄結果插入選定區域失敗：${inserted.reason}` });
          }
        } else {
          const artifactBlocks = parseArtifactsFromResponseWithFallback(replicateFullText);
          for (const block of artifactBlocks) {
            const ext = block.kind === 'vue-sfc' ? 'vue' : 'json';
            const payload = expandComponents(block.kind, block.payload);
            const a = createArtifact(db, { projectId, createdByTurn: turn.id, kind: block.kind, name: block.name, payload, payloadExt: ext, artifactsRoot });
            sse(res, 'artifact', { id: a.id, kind: a.kind, name: a.name });
          }
        }
        sse(res, 'done', { turnId: turn.id });
        return;
      }

      sse(res, 'phase', { phase: 'thinking' });

      // Council mode — available in consult and design modes
      const useCouncil = (mode === 'consult' || mode === 'design') && councilFlag === true;

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

        function cleanAnswerText(raw: string, m: string): string {
          let t = stripThinking(raw)
            .replace(/<facts>[\s\S]*?<\/facts>/gi, '')
            .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
            .trim();
          if (m === 'design') {
            t = t.replace(/```[\s\S]*?```/g, '').trim();
          }
          return t;
        }

        const answerText = cleanAnswerText(finalAnswer, mode);
        const thinkingText = ['pm', 'designer', 'engineer']
          .map(p => `### ${p.toUpperCase()}\n${cleanAnswerText(transcripts[p] ?? '', mode)}`)
          .join('\n\n');

        // In design mode: after council discussion, generate the actual Vue SFC artifact
        if (mode === 'design') {
          // Clear signal to the client: council done, now generating design
          sse(res, 'phase', { phase: 'thinking', message: '合議完成，正在生成設計…' });
          await new Promise(r => setTimeout(r, 300)); // brief pause so UI shows the transition
          sse(res, 'phase', { phase: 'answering' });
          // Truncate transcripts to avoid context length errors.
          // Engineer may have output code — strip it and cap at 500 chars each.
          const trunc = (s: string, max = 500) =>
            s.replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
             .replace(/```[\s\S]*?```/g, '[code omitted]')
             .trim()
             .slice(0, max);
          const councilContext = `Team discussion summary:\n- PM: ${trunc(transcripts.pm)}\n- Designer: ${trunc(transcripts.designer)}\n- Engineer: ${trunc(transcripts.engineer)}\n- Conclusion: ${trunc(finalAnswer, 800)}\n\nNow generate the Vue + Tailwind design.`;
          let designFullText = '';
          let designMeta: ProviderCallMeta | null = null;
          for await (const tok of callProvider({
            mode: 'design', prompt: text.trim(), systemInstruction: userSystem + '\n\n' + councilContext, streaming: true,
            onMeta: (m) => { designMeta = m; sse(res, 'meta', m); },
          })) {
            designFullText += tok;
            sse(res, 'token', { text: tok });
          }
          const designAnswer = cleanAnswerText(designFullText, 'design');
          const turn = appendTurn(db, {
            projectId, mode: 'design' as TurnMode,
            userText: text.trim(),
            aiResponse: { text: answerText, thinking: thinkingText },
            skillsUsed: ['council-pm', 'council-designer', 'council-engineer', 'council-moderator'],
            modelUsed: formatModelUsed(designMeta),
          });
          const facts = parseFactsFromResponse(designFullText);
          for (const f of facts) addFact(db, { projectId, turnId: turn.id, kind: f.kind, text: f.text });
          const artifactBlocks = parseArtifactsFromResponseWithFallback(designFullText);
          const artifactsRoot = join(dataDir, 'projects', projectId, 'artifacts');
          for (const block of artifactBlocks) {
            const ext = block.kind === 'vue-sfc' ? 'vue' : 'json';
            const payload = expandComponents(block.kind, block.payload);
            const a = createArtifact(db, { projectId, createdByTurn: turn.id, kind: block.kind, name: block.name, payload, payloadExt: ext, artifactsRoot });
            sse(res, 'artifact', { id: a.id, kind: a.kind, name: a.name });
          }
          sse(res, 'done', { turnId: turn.id });
          return;
        }

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
      let callMeta: ProviderCallMeta | null = null;
      for await (const tok of callProvider({
        mode, prompt: cleanText, systemInstruction: userSystem, streaming: true,
        onMeta: (m) => { callMeta = m; sse(res, 'meta', m); },
      })) {
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
      let answerText = stripTagText(fullText, 'thinking')
        .replace(/<facts>[\s\S]*?<\/facts>/g, '')
        .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
        .trim();
      // In design mode the AI sometimes wraps code in markdown code blocks
      // outside of <artifact> tags. Strip those from the displayed answer
      // so the chat bubble stays clean; the code is already in the artifact.
      if (mode === 'design') {
        // Strip ALL code blocks — code belongs in the artifact, not the chat bubble
        answerText = answerText.replace(/```[\s\S]*?```/g, '').trim();
      }
      const facts = parseFactsFromResponse(fullText);

      const turn = appendTurn(db, {
        projectId,
        mode: mode as TurnMode,
        userText: text.trim(),
        aiResponse: { text: answerText, thinking: thinkingText || undefined },
        skillsUsed: forcedSkill ? [forcedSkill.name] : undefined,
        modelUsed: formatModelUsed(callMeta),
      });
      for (const f of facts) addFact(db, { projectId, turnId: turn.id, kind: f.kind, text: f.text });

      // Persist artifacts found in the response (fallback extracts ```vue/```html blocks)
      const artifactBlocks = parseArtifactsFromResponseWithFallback(fullText);
      const artifactsRoot = join(dataDir, 'projects', projectId, 'artifacts');
      for (const block of artifactBlocks) {
        const ext = block.kind === 'vue-sfc' ? 'vue' : 'json';
        const payload = expandComponents(block.kind, block.payload);
        const a = createArtifact(db, {
          projectId, createdByTurn: turn.id,
          kind: block.kind, name: block.name,
          payload, payloadExt: ext,
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

/** "provider/model" label persisted into turns.model_used; cross-model
 *  fallback is marked inline so historical turns stay self-explanatory. */
function formatModelUsed(meta: ProviderCallMeta | null): string | undefined {
  if (!meta) return undefined;
  return `${meta.provider}/${meta.model}${meta.fallback ? ' (fallback)' : ''}`;
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
