import { Router, type Request, type Response } from 'express';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { getProject } from '../services/projectService.js';
import { buildMemorySnapshot } from '../services/memorySnapshot.js';
import { readSkill, getSystemPromptSkillList } from '../services/skillRegistry.js';
import { parseSlashCommand } from '../services/slashCommand.js';
import { callProvider } from '../services/callProvider.js';
import { startSseKeepalive, stopSseKeepalive } from '../utils/sseKeepalive.js';
import { appendTurn, type TurnMode } from '../services/turnService.js';
import { addFact } from '../services/factService.js';
import { parseFactsFromResponse } from '../services/factExtractor.js';
import { getAttachment, type Attachment } from '../services/ingestionService.js';
import { buildSystemPrompt, parseArtifactsFromResponseWithFallback, parseChoicesFromResponse, stripChoicesBlock, type ActiveArtifactContext } from '../services/chatOrchestrator.js';
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
import { selectSkills } from '../services/skillSelector.js';

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
      sse(res, 'phase', { phase: 'selecting_skills', skills: [] });

      // 早退：設計模式貼了網址但沒選意圖 — 不丟給 AI（design prompt 強制出
      // artifact，模型會把「問題」畫成一張 wireframe）。確定性回問 + 可點選項，
      // 零 AI 呼叫、不燒 selector。chips 點下去的句型由後面的意圖推斷接住。
      if (mode === 'design' && !parseReplicationIntent(req.body?.replicationIntent)) {
        const earlyUrl = detectFirstUrl(text);
        const impliedIntent = /^照抄|^只取|^只當參考/.test(text.trim());
        if (earlyUrl && !impliedIntent) {
          const q = `你貼了 ${earlyUrl} — 要怎麼用？點下面的選項就直接開工。`;
          const confirmChoices = [
            `照抄 ${earlyUrl} 做成可互動 wireframe`,
            `只取 ${earlyUrl} 的風格，做新的設計`,
            `只當參考，先跟我討論`,
          ];
          sse(res, 'token', { text: q });
          sse(res, 'choices', { choices: confirmChoices });
          const turn = appendTurn(db, {
            projectId, mode: 'design' as TurnMode,
            userText: text.trim(),
            aiResponse: { text: q, choices: confirmChoices },
          });
          sse(res, 'done', { turnId: turn.id });
          return;
        }
      }

      // Domain-skill auto-selection (domain-skill-selection spec): skipped when
      // a slash command forces a skill; failure falls back to no injection.
      let autoSkills: { selected: string[]; block: string } = { selected: [], block: '' };
      if (!forcedSkill && (mode === 'design' || mode === 'consult')) {
        autoSkills = await selectSkills({ userText: text.trim(), projectId });
        if (autoSkills.selected.length > 0) {
          sse(res, 'phase', { phase: 'selecting_skills', skills: autoSkills.selected });
        }
      }

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
        + (mode === 'design' ? prefixed(componentIndexBlock(db, projectId)) : '')
        + prefixed(autoSkills.block);

      // ── Replication intake (design-replication spec) ─────────────────────
      // 顧問與設計分頁都吃得到照抄：顧問選了照抄會自動轉設計分頁。
      const replicationEligible = mode === 'design' || mode === 'consult';
      let replicationIntent = parseReplicationIntent(req.body?.replicationIntent);
      const replicationImages = replicationEligible ? imagesFromAttachments(dataDir, attachments) : [];
      const replicationUrl = replicationEligible ? detectFirstUrl(text) : null;
      const hasReplicationMedia = replicationImages.length > 0 || !!replicationUrl;

      // 確認選項 chips 送回來的是純文字 — 從句型推回意圖，讓「點了就開工」成立。
      if (!replicationIntent && replicationEligible && replicationUrl) {
        const t = text.trim();
        if (/^照抄/.test(t)) replicationIntent = { intent: 'replicate', destination: 'new' };
        else if (/^只取/.test(t)) replicationIntent = { intent: 'style-only', destination: 'new' };
        else if (/^只當參考/.test(t)) replicationIntent = { intent: 'reference', destination: 'new' };
      }

      if (mode === 'design' && replicationImages.length > 0 && !replicationIntent) {
        userSystem += prefixed(REPLICATE_CONFIRM_INSTRUCTION); // 圖片附件且未選意圖：AI 先口頭確認
      } else if (mode === 'design' && replicationIntent?.intent === 'style-only') {
        userSystem += prefixed(STYLE_ONLY_INSTRUCTION);
      } else if (mode === 'design' && replicationIntent?.intent === 'reference') {
        userSystem += prefixed(REFERENCE_ONLY_INSTRUCTION);
      }

      // Verbatim expansion of <lib-component name="..."/> placeholders before
      // persisting any vue-sfc artifact (component-library spec). Unknown names
      // surface as explicit SSE errors — never silently guessed.
      const expandComponents = (kind: string, payload: string, effectiveMode: string = mode): string => {
        if (kind !== 'vue-sfc' || effectiveMode !== 'design') return payload;
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
      if (replicationEligible && replicationIntent?.intent === 'replicate' && hasReplicationMedia) {
        if (mode === 'consult') sse(res, 'mode_handoff', { to: 'design' }); // 顧問選照抄 → 自動跳設計分頁
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
          skillsUsed: autoSkills.selected.length > 0 ? autoSkills.selected : undefined,
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
          let t = stripChoicesBlock(stripThinking(raw)
            .replace(/<facts>[\s\S]*?<\/facts>/gi, '')
            .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
            .replace(/<handoff>[\s\S]*?<\/handoff>/gi, '')
            .trim());
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

        // Surface the conclusion IMMEDIATELY as the answer — without this the
        // moderator text only lives in the council accordion until the next
        // turns refresh, which reads as「討論完卻沒有回答」.
        if (answerText) sse(res, 'token', { text: answerText });

        // Quick-reply chips: the moderator may offer clickable options so the
        // user never has to type an enumerable answer by hand.
        const councilChoices = parseChoicesFromResponse(finalAnswer);
        if (councilChoices.length > 0) sse(res, 'choices', { choices: councilChoices });

        const turn = appendTurn(db, {
          projectId,
          mode: mode as TurnMode,
          userText: text.trim(),
          aiResponse: { text: answerText, thinking: thinkingText, ...(councilChoices.length > 0 ? { choices: councilChoices } : {}) },
          skillsUsed: ['council-pm', 'council-designer', 'council-engineer', 'council-moderator'],
        });

        // ── Mode handoff: moderator 宣告動工 → 直接轉設計模式生成，不要只是嘴上說會做。
        const wantsHandoff = /<handoff>\s*design\s*<\/handoff>/i.test(finalAnswer);
        if (mode === 'consult' && wantsHandoff) {
          sse(res, 'mode_handoff', { to: 'design' });
          sse(res, 'phase', { phase: 'answering', message: '已轉入設計模式，正在生成 wireframe…' });

          const designSystem = userSystem
            + globalStyleBlock(db, project.inheritGlobalStyle)
            + prefixed(componentIndexBlock(db, projectId));
          const truncCtx = (s2: string, max = 500) =>
            s2.replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
              .replace(/```[\s\S]*?```/g, '[code omitted]')
              .trim()
              .slice(0, max);
          const handoffContext = `Team discussion summary:
- PM: ${truncCtx(transcripts.pm)}
- Designer: ${truncCtx(transcripts.designer)}
- Engineer: ${truncCtx(transcripts.engineer)}
- Conclusion: ${truncCtx(finalAnswer, 800)}

Now generate the Vue + Tailwind interactive wireframe.`;

          // 「我想要這個 <網址>」的視覺以該站為準：有 URL 就先爬、走 replicate
          // 模式忠實重建 — 不爬就生成等於憑空想像（使用者已抱怨過產出不像原站）。
          let handoffMode: 'design' | 'replicate' = 'design';
          let handoffSourceBlock = '';
          if (replicationUrl) {
            sse(res, 'phase', { phase: 'thinking', message: `爬取參考網站：${replicationUrl}` });
            try {
              const crawled = await crawlForReplication(replicationUrl);
              handoffSourceBlock = '\n\n' + crawledSourceBlock(crawled);
              handoffMode = 'replicate';
            } catch (e) {
              sse(res, 'error', { code: 'CRAWL_FAILED', message: `參考網站爬取失敗（${(e as Error).message}），改以描述生成 — 視覺可能與原站不同` });
            }
          }

          let designFullText = '';
          let handoffMeta: ProviderCallMeta | null = null;
          for await (const tok of callProvider({
            mode: handoffMode, prompt: text.trim() + handoffSourceBlock, systemInstruction: `${designSystem}\n\n${handoffContext}`, streaming: true,
            onMeta: (m) => { handoffMeta = m; sse(res, 'meta', m); },
          })) {
            designFullText += tok;
            sse(res, 'token', { text: tok });
          }

          const designTurn = appendTurn(db, {
            projectId, mode: 'design' as TurnMode,
            userText: `[自動轉入設計] ${text.trim()}`,
            aiResponse: { text: cleanAnswerText(designFullText, 'design') || '[wireframe 已生成]' },
            skillsUsed: autoSkills.selected.length > 0 ? autoSkills.selected : undefined,
            modelUsed: formatModelUsed(handoffMeta),
          });
          const designFacts = parseFactsFromResponse(designFullText);
          for (const f of designFacts) addFact(db, { projectId, turnId: designTurn.id, kind: f.kind, text: f.text });
          const handoffBlocks = parseArtifactsFromResponseWithFallback(designFullText);
          const handoffRoot = join(dataDir, 'projects', projectId, 'artifacts');
          for (const block of handoffBlocks) {
            const ext = block.kind === 'vue-sfc' ? 'vue' : 'json';
            const payload = expandComponents(block.kind, block.payload, 'design');
            const a = createArtifact(db, { projectId, createdByTurn: designTurn.id, kind: block.kind, name: block.name, payload, payloadExt: ext, artifactsRoot: handoffRoot });
            sse(res, 'artifact', { id: a.id, kind: a.kind, name: a.name });
          }
          sse(res, 'done', { turnId: designTurn.id });
          return;
        }

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
      const choices = parseChoicesFromResponse(fullText);
      let answerText = stripChoicesBlock(stripTagText(fullText, 'thinking')
        .replace(/<facts>[\s\S]*?<\/facts>/g, '')
        .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
        .trim());
      if (choices.length > 0) sse(res, 'choices', { choices });
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
        aiResponse: { text: answerText, thinking: thinkingText || undefined, ...(choices.length > 0 ? { choices } : {}) },
        skillsUsed: forcedSkill ? [forcedSkill.name] : (autoSkills.selected.length > 0 ? autoSkills.selected : undefined),
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
