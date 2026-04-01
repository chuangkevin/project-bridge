import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import db from '../db/connection';
import { classifyIntent } from '../services/intentClassifier';
import { extractImagesFromDocument, analyzeArtStyle } from '../services/artStyleExtractor';
import { analyzePageStructure } from '../services/pageStructureAnalyzer';
import { getGeminiApiKey, getGeminiApiKeyExcluding, getGeminiModel, getKeyCount, trackUsage, markKeyBad } from '../services/geminiKeys';
import { sanitizeGeneratedHtml, injectConventionColors } from '../services/htmlSanitizer';
import { validatePrototype, logValidation } from '../services/prototypeValidator';
import { validateDesignSystem, autoFixDesignViolations } from '../services/designSystemValidator';
import { generateParallel, getLessons } from '../services/parallelGenerator';
import { assemblePrototype, fixNavigation } from '../services/htmlAssembler';
import { buildLocalPlan } from '../services/masterAgent';
import { planAndReview } from '../services/plannerAgent';
import { checkSkillConflicts } from '../services/skillConflictChecker';
import { getActiveSkills } from './skills';
import { scorePrototype } from '../services/qualityScorer';
import { generationQueue } from '../services/generationQueue';

const router = Router();

/** Fire-and-forget quality scoring for a prototype version */
function triggerQualityScoring(versionId: string, html: string, apiKey: string) {
  // Skip quality scoring when keys are scarce
  const keyCount = getKeyCount();
  if (keyCount < 10) return;
  setImmediate(async () => {
    try {
      const score = await scorePrototype(html, apiKey);
      db.prepare('UPDATE prototype_versions SET quality_score = ? WHERE id = ?')
        .run(JSON.stringify(score), versionId);
      console.log(`[quality] Scored version ${versionId}: overall=${score.overall}`);
    } catch (e: any) {
      console.warn('[quality] Scoring failed:', e.message);
    }
  });
}

const systemPrompt = fs.readFileSync(
  path.resolve(__dirname, '../prompts/system.txt'),
  'utf-8'
);

const qaSystemPromptBase = `你是一位資深產品架構師和 UI/UX 顧問，擅長分析業務邏輯、系統架構和使用者流程。

角色定位：
- 你正在協助使用者規劃和確認一個軟體產品的需求
- 你能根據上傳的文件、設計稿和對話歷史提供深度分析
- 你回答時要有結構（用條列、表格、流程圖描述）
- 繁體中文回答

你可以幫忙的事情：
1. 業務邏輯確認（「這個功能的流程應該是什麼？」「使用者角色有哪些？」）
2. 系統架構討論（「需要哪些頁面？」「資料流怎麼走？」）
3. 需求釐清（「這個規格書裡面有哪些功能？」「有沒有矛盾的地方？」）
4. 設計評審（「這個設計稿的 UX 問題在哪？」「有沒有遺漏的狀態？」）
5. 技術可行性（「這個功能用什麼技術實作？」「有沒有更好的方案？」）

回答風格：
- 直接、有深度、不講廢話
- 有不確定的地方會明確標示「⚠️ 需確認」
- 會主動指出使用者可能沒想到的問題
- 適時用表格比較方案優劣`;

// getGeminiApiKey is now imported from ../services/geminiKeys

/** Format structured analysis result into a compact prompt block */
function formatAnalysisForPrompt(analysis: any, fileName: string): string {
  let block = `=== DOCUMENT ANALYSIS: ${fileName} (${analysis.documentType}) ===\n`;
  block += `Summary: ${analysis.summary}\n\n`;

  for (const page of (analysis.pages || [])) {
    const vp = page.viewport === 'mobile' ? ' [MOBILE]' : page.viewport === 'desktop' ? ' [DESKTOP]' : '';
    block += `--- Page: ${page.name}${vp} ---\n`;
    if (page.components?.length) block += `Components: ${page.components.join(', ')}\n`;
    if (page.layout) block += `Layout: ${page.layout}\n`;
    if (page.interactions?.length) block += `Interactions:\n${page.interactions.map((i: string) => `  - ${i}`).join('\n')}\n`;
    if (page.dataFields?.length) block += `Data Fields: ${page.dataFields.join(', ')}\n`;
    if (page.businessRules?.length) block += `Business Rules:\n${page.businessRules.map((r: string) => `  - ${r}`).join('\n')}\n`;
    if (page.navigationTo?.length) block += `Navigation → ${page.navigationTo.join(', ')}\n`;
    block += '\n';
  }

  if (analysis.globalStyles) {
    const gs = analysis.globalStyles;
    block += `Global Styles: primary=${gs.primaryColor}, secondary=${gs.secondaryColor}, bg=${gs.backgroundColor}\n`;
  }
  if (analysis.globalRules?.length) {
    block += `Global Rules:\n${analysis.globalRules.map((r: string) => `  - ${r}`).join('\n')}\n`;
  }

  // Skills output — enriched understanding for better generation
  if (analysis.explore) {
    const e = analysis.explore;
    block += `\n--- DEEP UNDERSTANDING (from explore skill) ---\n`;
    block += `Domain: ${e.domain}\n`;
    if (e.userPersonas?.length) block += `Users: ${e.userPersonas.join('; ')}\n`;
    if (e.coreUserFlow) block += `Core Flow: ${e.coreUserFlow}\n`;
    if (e.edgeCases?.length) block += `Edge Cases to Handle:\n${e.edgeCases.map((c: string) => `  - ${c}`).join('\n')}\n`;
    if (e.architectureDiagram) block += `Architecture:\n${e.architectureDiagram}\n`;
  }

  if (analysis.designProposal) {
    const dp = analysis.designProposal;
    block += `\n--- DESIGN DIRECTION (from design proposal skill) ---\n`;
    if (dp.designDirection) block += `Direction: ${dp.designDirection}\n`;
    if (dp.layoutStrategy) block += `Layout: ${dp.layoutStrategy}\n`;
    if (dp.componentPatterns?.length) {
      block += `Patterns:\n${dp.componentPatterns.map((p: any) => `  - ${p.pattern}: ${p.usage}`).join('\n')}\n`;
    }
    if (dp.interactionDesign?.length) {
      block += `Interactions:\n${dp.interactionDesign.map((i: any) => `  - ${i.element}: ${i.behavior}`).join('\n')}\n`;
    }
    if (dp.microCopyGuidelines?.length) {
      block += `Micro-copy:\n${dp.microCopyGuidelines.map((m: string) => `  - ${m}`).join('\n')}\n`;
    }
  }

  if (analysis.uxReview?.issues?.length) {
    const critical = analysis.uxReview.issues.filter((i: any) => i.severity === 'critical');
    if (critical.length > 0) {
      block += `\n--- UX FIXES REQUIRED ---\n`;
      for (const issue of critical) {
        block += `  ⚠ [${issue.page}] ${issue.issue} → ${issue.suggestion}\n`;
      }
    }
  }

  // Input constraints extracted from analysis
  if (analysis.inputConstraints?.length) {
    block += `\nInput Constraints (from spec):\n`;
    for (const c of analysis.inputConstraints) {
      block += `  - field: ${c.field}, type: ${c.type || 'text'}`;
      if (c.min !== undefined) block += `, min: ${c.min}`;
      if (c.max !== undefined) block += `, max: ${c.max}`;
      if (c.pattern) block += `, pattern: ${c.pattern}`;
      if (c.required) block += `, required`;
      block += '\n';
    }
  }

  // Business context from company skills
  if (analysis.businessContext) {
    const bc = analysis.businessContext;
    if (bc.businessRules?.length || bc.internalTerms?.length || bc.dataFlows?.length) {
      block += `\n--- INTERNAL BUSINESS CONTEXT ---\n`;
      if (bc.matchedSkills?.length) block += `Related systems: ${bc.matchedSkills.join(', ')}\n`;
      if (bc.businessRules?.length) {
        block += `Business rules (internal):\n${bc.businessRules.map((r: string) => `  - ${r}`).join('\n')}\n`;
      }
      if (bc.internalTerms?.length) {
        block += `Internal terms:\n${bc.internalTerms.map((t: any) => `  - ${t.term}: ${t.explanation}`).join('\n')}\n`;
      }
      if (bc.dataFlows?.length) {
        block += `Data flows:\n${bc.dataFlows.map((d: string) => `  - ${d}`).join('\n')}\n`;
      }
      if (bc.implementationNotes?.length) {
        block += `Implementation notes:\n${bc.implementationNotes.map((n: string) => `  - ${n}`).join('\n')}\n`;
      }
    }
  }

  block += `=== END DOCUMENT ANALYSIS ===`;
  return block;
}

/** Return a role preamble string based on file intent */
function getIntentPreamble(intent: string | null | undefined): string {
  switch (intent) {
    case 'design-spec':
      return 'This file is a DESIGN SPECIFICATION — use it for layout, components, and visual structure.\n';
    case 'data-spec':
      return 'This file is a DATA SPECIFICATION — use it for data fields, validation rules, and business logic.\n';
    case 'brand-guide':
      return 'This file is a BRAND GUIDE — use it for colors, typography, and visual identity.\n';
    case 'reference':
      return 'This file is a REFERENCE SCREENSHOT — use it for visual inspiration only.\n';
    default:
      return '';
  }
}

function formatGeminiError(err: any): string {
  const msg: string = err?.message || '';
  if (msg.includes('API_KEY_INVALID') || msg.includes('401')) return 'Gemini API 金鑰無效，請至設定頁面重新輸入。';
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) return 'Gemini API 請求過於頻繁，請稍後再試。';
  if (msg.includes('503') || msg.includes('unavailable')) return 'Gemini 服務暫時不可用，請稍後再試。';
  return msg || 'Gemini API 發生錯誤，請稍後再試。';
}

// POST /api/projects/:id/chat — SSE chat with AI
router.post('/:id/chat', async (req: Request, res: Response) => {
  // Track this generation request in the queue
  const queueProjectId = req.params.id as string;
  const queueUserId = (req as any).user?.id || null;
  const queueTask = generationQueue.enqueue(queueProjectId, queueUserId);
  // Immediately dequeue to mark as processing (informational queue)
  generationQueue.dequeue();

  try {
    const projectId = req.params.id;
    const { message, fileIds, forceRegenerate, chatOnly } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Force chatOnly for consultant-mode projects (server-side, not dependent on client state)
    const effectiveChatOnly = chatOnly || project.mode === 'consultant';

    // Read arch_data for architecture block injection
    const archDataRaw = (project as any).arch_data;
    const archData = archDataRaw ? JSON.parse(archDataRaw) : null;

    // Read generation settings
    const generationTemperature: number = (project as any).generation_temperature ?? 0.3;
    const seedPrompt: string = ((project as any).seed_prompt || '').trim();

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key not configured. Set GEMINI_API_KEY env var or configure in settings.' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Fetch platform shell (needed for intent classification)
    const shellRow = db.prepare('SELECT shell_html FROM platform_shells WHERE project_id = ?').get(projectId) as { shell_html: string } | undefined;
    const shellHtml = shellRow?.shell_html || null;
    const hasShell = !!shellHtml;

    // isObviousGenerate: detect if user wants to CREATE something new (not just ask a question)
    // We rely on AI classifyIntent for the main classification, but this flag determines
    // whether to DOWNGRADE full-page→micro-adjust when prototype exists.
    // chatOnly mode — force question intent, skip generation entirely
    if (effectiveChatOnly) {
      console.log('[chat] chatOnly mode — forcing question intent', project.mode === 'consultant' ? '(consultant project)' : '(client toggle)');
    }

    // If user is clearly requesting a new thing, DON'T downgrade.
    const trimmed = message.trim().toLowerCase();
    const hasGenerateKeywords = /我要|我想要|請做|幫我做|生成|建立|做一個|設計|create|make|build|generate|給我|產生|做出/i.test(trimmed);
    const hasModificationKeywords = /加上|改成|調整|刪掉|拿掉|換成|移到|加個|加一個|修改|移除|替換|插入/i.test(trimmed);
    const hasTypeKeywords = /網站|網頁|頁面|系統|平台|app|應用|介面|dashboard|後台|前台|landing/i.test(trimmed);
    const isObviousGenerate = hasGenerateKeywords && hasTypeKeywords;

    // Check if prototype already exists
    const currentPrototype = db.prepare(
      'SELECT html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(projectId) as { html: string } | undefined;

    // Server-side forceRegenerate detection: explicit redesign intent in message
    const impliedForceRegenerate = /重新設計|完全重做|全部重做|請重新生成|重新生成|redesign|rebuild|start over/i.test(message);
    const effectiveForceRegenerate = forceRegenerate || impliedForceRegenerate;

    // Gate isObviousGenerate: only when no prototype exists OR forceRegenerate
    const gatedObviousGenerate = isObviousGenerate && (!currentPrototype || effectiveForceRegenerate);

    // Direct element-adjust routing when targetBridgeId is present
    const { targetBridgeId, targetHtml } = req.body;
    if (targetBridgeId && currentPrototype) {
      // will be handled by element-adjust path later
    }

    // Classify intent — skip AI call if obvious generate (saves 1 API call)
    let intent: string;
    if (effectiveChatOnly) {
      intent = 'question';
    } else if (targetBridgeId && currentPrototype) {
      intent = 'element-adjust';
    } else if (isObviousGenerate) {
      intent = hasShell ? 'in-shell' : 'full-page';
    } else if (gatedObviousGenerate) {
      intent = hasShell ? 'in-shell' : 'full-page';
    } else {
      intent = await classifyIntent(message.trim(), apiKey, hasShell);
    }

    // Detect requests for missing/new pages — force full-page generation
    const isPageRequest = /沒有.*頁|缺少.*頁|加入.*頁|新增.*頁|多.*頁面|少了.*頁|要有.*頁|要.*頁面|需要.*頁|增加.*頁|missing.*page|add.*page|need.*page|請生成.*多|生成.*頁面/i.test(message);

    // Override: attached files with design/redesign intent → full-page (not component)
    const hasFiles = fileIds && fileIds.length > 0;
    const hasDesignIntent = /設計|redesign|重新|重做|做出|產生|生成/i.test(message);
    if (hasFiles && hasDesignIntent && intent === 'component') {
      intent = 'full-page';
      console.log('[chat] Override: component → full-page (has files + design intent)');
    }

    // When user requests pages, force full-page intent regardless of existing prototype
    if (isPageRequest) {
      intent = 'full-page';
    } else if (currentPrototype && !effectiveForceRegenerate && (intent === 'full-page' || intent === 'in-shell')) {
      // If modification keywords detected on existing prototype, force micro-adjust
      if (hasModificationKeywords) {
        intent = 'micro-adjust';
      } else if (isObviousGenerate) {
        intent = 'full-page';
        // Don't downgrade — user explicitly wants to generate something new
      } else {
        intent = 'micro-adjust';
      }
    }

    // Load conversation history (last 20 messages)
    const history = db.prepare(
      'SELECT role, content FROM conversations WHERE project_id = ? ORDER BY created_at ASC LIMIT 20'
    ).all(projectId) as { role: string; content: string }[];

    // Build user message, prepending file content if fileIds provided
    let userContent = message.trim();
    if (Array.isArray(fileIds) && fileIds.length > 0) {
      const placeholders = fileIds.map(() => '?').join(',');
      const files = db.prepare(
        `SELECT original_name, extracted_text, intent FROM uploaded_files WHERE id IN (${placeholders}) AND project_id = ?`
      ).all(...fileIds, projectId) as { original_name: string; extracted_text: string | null; intent: string | null }[];

      if (files.length > 0) {
        const fileParts = files.map(f => {
          const preamble = getIntentPreamble(f.intent);
          return `${preamble}--- ${f.original_name} ---\n${f.extracted_text || '[No text extracted]'}\n--- end ---`;
        }).join('\n');
        userContent = `[Attached files]\n${fileParts}\n\n${userContent}`;
      }
    } else {
      // Auto-inject project uploaded files even if not explicitly attached
      // Skip injection when intent is 'component' or when the message does not explicitly
      // reference uploaded files (keywords: 依照, 根據, 規格, spec, 設計稿).
      const messageReferencesFiles = /依照|根據|規格|spec|設計稿/i.test(message.trim());
      const shouldInjectFiles = intent !== 'component' && messageReferencesFiles;

      if (shouldInjectFiles) {
        // Priority: analysis_result (structured) > extracted_text (raw)
        const projectFiles = db.prepare(
          `SELECT original_name, extracted_text, analysis_result, analysis_status, file_size, intent FROM uploaded_files
           WHERE project_id = ? AND (extracted_text IS NOT NULL AND LENGTH(extracted_text) > 100 OR analysis_result IS NOT NULL)
           ORDER BY created_at DESC`
        ).all(projectId) as { original_name: string; extracted_text: string; analysis_result: string | null; analysis_status: string | null; file_size: number; intent: string | null }[];
        const seenSizes = new Set<number>();
        const uniqueFiles = projectFiles.filter(f => {
          if (seenSizes.has(f.file_size)) return false;
          seenSizes.add(f.file_size);
          return true;
        }).slice(0, 1);
        if (uniqueFiles.length > 0) {
          const fileParts = uniqueFiles.map(f => {
            let name = f.original_name;
            try { const fixed = Buffer.from(name, 'latin1').toString('utf8'); if (/[\u4e00-\u9fff]/.test(fixed)) name = fixed; } catch { /* keep original */ }

            const preamble = getIntentPreamble(f.intent);

            // Use structured analysis if available
            if (f.analysis_result) {
              try {
                const analysis = JSON.parse(f.analysis_result);
                return preamble + formatAnalysisForPrompt(analysis, name);
              } catch { /* fall through to raw text */ }
            }
            return `${preamble}--- ${name} ---\n${f.extracted_text.slice(0, 4000)}\n--- end ---`;
          }).join('\n');
          userContent = `[Project design specs (auto-loaded from uploaded files)]\n${fileParts}\n\n${userContent}`;
        }
      }
    }

    // Prepend seed prompt if configured
    if (seedPrompt) {
      userContent = `[Generation Seed]\n${seedPrompt}\n\n${userContent}`;
    }

    let fullResponse = '';

    // Load design convention early (needed by micro-adjust and generate paths)
    const globalRowForConventionEarly = db.prepare("SELECT design_convention FROM global_design_profile WHERE id = 'global'").get() as any;
    let designConvention = globalRowForConventionEarly?.design_convention || '';
    if (!designConvention) {
      const colorConventionPath = path.resolve(__dirname, '../../data/color-convention.txt');
      try { designConvention = fs.readFileSync(colorConventionPath, 'utf-8'); } catch {}
    }

    // Check if project has a design preset (overrides global convention)
    const projectForPreset = db.prepare('SELECT design_preset_id FROM projects WHERE id = ?').get(projectId) as any;
    if (projectForPreset?.design_preset_id) {
      const preset = db.prepare('SELECT * FROM design_presets WHERE id = ?').get(projectForPreset.design_preset_id) as any;
      if (preset?.design_convention) {
        designConvention = preset.design_convention;
        console.log('[chat] Using design preset:', preset.name);
      }
    }

    // ─── MICRO-ADJUST PATH ─────────────────────────
    if (intent === 'micro-adjust' && currentPrototype) {

      // Check if there's a pasted image → vision-micro-adjust flow
      let hasImageAttachment = false;
      let imageFilePath: string | null = null;
      let imageMimeType: string | null = null;
      if (Array.isArray(fileIds) && fileIds.length > 0) {
        const imgFile = db.prepare(
          `SELECT storage_path, mime_type FROM uploaded_files WHERE id IN (${fileIds.map(() => '?').join(',')}) AND mime_type LIKE 'image/%' LIMIT 1`
        ).get(...fileIds) as any;
        if (imgFile) {
          hasImageAttachment = true;
          imageFilePath = imgFile.storage_path;
          imageMimeType = imgFile.mime_type;
        }
      }

      // Save user message
      const userMsgId = uuidv4();
      db.prepare('INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)').run(userMsgId, projectId, 'user', userContent, 'user');

      // ─── VISION MICRO-ADJUST (image + text) ─────
      if (hasImageAttachment && imageFilePath) {
        const { findElementByBridgeId, replaceElementByBridgeId, fuzzyMatchElement } = await import('../services/elementMatcher');
        const visionPrompt = fs.readFileSync(path.resolve(__dirname, '../prompts/vision-micro-adjust.txt'), 'utf-8');

        try {
          const imageBuffer = fs.readFileSync(imageFilePath);
          const imageBase64 = imageBuffer.toString('base64');

          // Truncate HTML for vision context (keep under 20K chars)
          let truncatedHtml = currentPrototype.html;
          if (truncatedHtml.length > 20000) {
            // Strip large style blocks first
            truncatedHtml = truncatedHtml.replace(/<style[^>]*>[\s\S]{500,}<\/style>/gi, '<style>/* truncated */</style>');
            if (truncatedHtml.length > 20000) truncatedHtml = truncatedHtml.slice(0, 20000) + '\n<!-- truncated -->';
          }

          const genai = new GoogleGenerativeAI(apiKey);
          const model = genai.getGenerativeModel({
            model: getGeminiModel(),
            systemInstruction: visionPrompt,
            generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json', temperature: generationTemperature },
          });

          const result = await model.generateContent([
            { inlineData: { mimeType: imageMimeType || 'image/png', data: imageBase64 } },
            { text: `使用者指示: ${userContent}\n\n目前的 prototype HTML:\n${truncatedHtml}` },
          ]);

          try { trackUsage(apiKey, getGeminiModel(), 'vision-micro-adjust', result.response.usageMetadata); } catch {}

          let responseText = result.response.text().trim();
          // Strip markdown fences
          const fenceMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) responseText = fenceMatch[1].trim();

          let visionResult: { bridgeId: string | null; reasoning: string; componentHtml: string | null };
          try {
            visionResult = JSON.parse(responseText);
          } catch {
            // Failed to parse — fall through to text-only micro-adjust
            visionResult = { bridgeId: null, reasoning: 'JSON parse failed', componentHtml: null };
          }

          if (visionResult.bridgeId && visionResult.componentHtml) {
            // Verify bridgeId exists
            let targetId = visionResult.bridgeId;
            const exactMatch = findElementByBridgeId(currentPrototype.html, targetId);
            if (!exactMatch.found) {
              // Fuzzy fallback
              const fuzzyId = fuzzyMatchElement(currentPrototype.html, {
                textContent: visionResult.reasoning,
              });
              if (fuzzyId) targetId = fuzzyId;
            }

            if (findElementByBridgeId(currentPrototype.html, targetId).found) {
              // Replace component
              let newHtml = replaceElementByBridgeId(currentPrototype.html, targetId, visionResult.componentHtml);
              newHtml = sanitizeGeneratedHtml(newHtml, newHtml.includes('data-page='));
              { const { html: autoFixedHtml, fixes } = autoFixDesignViolations(newHtml); newHtml = autoFixedHtml; if (fixes.length > 0) console.log('[design-validator] Auto-fixes applied:', fixes); }
              if (designConvention) newHtml = injectConventionColors(newHtml, designConvention);

              // Save version
              const assistantMsgId = uuidv4();
              db.prepare('INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)').run(assistantMsgId, projectId, 'assistant', `[Vision micro-adjust: ${visionResult.reasoning}]`, 'micro-adjust');

              const maxVersion = db.prepare('SELECT MAX(version) as maxV FROM prototype_versions WHERE project_id = ?').get(projectId) as any;
              const newVersion = (maxVersion?.maxV || 0) + 1;
              db.prepare('UPDATE prototype_versions SET is_current = 0 WHERE project_id = ?').run(projectId);
              const versionId = uuidv4();
              const pageMatches = [...newHtml.matchAll(/data-page="([^"]+)"/g)].map(m => m[1]);
              db.prepare('INSERT INTO prototype_versions (id, project_id, conversation_id, html, version, is_current, is_multi_page, pages) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(versionId, projectId, assistantMsgId, newHtml, newVersion, pageMatches.length > 1 ? 1 : 0, JSON.stringify(pageMatches));
              db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
              triggerQualityScoring(versionId, newHtml, apiKey);

              res.write(`data: ${JSON.stringify({ content: `✓ 已修改元件 (${targetId}): ${visionResult.reasoning}` })}\n\n`);
              res.write(`data: ${JSON.stringify({ done: true, html: newHtml, messageType: 'micro-adjust', intent: 'micro-adjust', isMultiPage: pageMatches.length > 1, pages: pageMatches })}\n\n`);
              res.end();
              return;
            }
          }
          // Fall through to text-only micro-adjust if vision failed
        } catch (err: any) {
          console.warn('[vision-micro-adjust] Failed, falling back to text:', err.message);
          // Fall through to text-only micro-adjust
        }
      }

      // ─── TEXT-ONLY MICRO-ADJUST ─────
      res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'analyzing', message: '分析需求中...' })}\n\n`);
      const microPrompt = fs.readFileSync(path.resolve(__dirname, '../prompts/micro-adjust.txt'), 'utf-8');

      // Micro-adjust with auto-retry on 429
      let maKey = apiKey;
      let maRetries = 0;
      while (maRetries <= 2) {
        try {
          const genai = new GoogleGenerativeAI(maKey);
          const model = genai.getGenerativeModel({
            model: getGeminiModel(),
            systemInstruction: microPrompt,
            generationConfig: { maxOutputTokens: 32768, temperature: generationTemperature },
          });

          // Truncate HTML if too large (>200K chars) to avoid API limits
          const protoHtml = currentPrototype.html.length > 200000
            ? currentPrototype.html.slice(0, 200000) + '\n<!-- [truncated] -->'
            : currentPrototype.html;

          const result = await model.generateContentStream(
            `使用者要求: ${userContent}\n\n以下是目前的完整 HTML prototype:\n${protoHtml}`
          );

          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              fullResponse += text;
              res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
            }
          }
          try { const resp = await result.response; trackUsage(maKey, getGeminiModel(), 'micro-adjust', resp.usageMetadata); } catch {}
          break;
        } catch (err: any) {
          const msg = err?.message || '';
          const isRateLimit = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429') || msg.includes('Too Many Requests');
          if (isRateLimit && maRetries < 2) {
            const altKey = getGeminiApiKeyExcluding(maKey);
            if (altKey) {
              console.warn(`[micro-adjust] 429 on key ...${maKey.slice(-4)}, retrying with ...${altKey.slice(-4)}`);
              maKey = altKey;
              maRetries++;
              continue;
            }
          }
          console.error('Micro-adjust error:', err);
          res.write(`data: ${JSON.stringify({ error: formatGeminiError(err) })}\n\n`);
          res.end();
          return;
        }
      }

      // Extract HTML
      let html = fullResponse.trim();
      const fenceMatch = html.match(/```(?:html)?\s*([\s\S]*?)```/i);
      if (fenceMatch) html = fenceMatch[1].trim();
      const startIdx = html.search(/<!doctype html|<html[\s>]/i);
      if (startIdx > 0) html = html.slice(startIdx);
      const endIdx = html.lastIndexOf('</html>');
      if (endIdx !== -1) html = html.slice(0, endIdx + '</html>'.length);

      html = sanitizeGeneratedHtml(html, html.includes('data-page='));
      {
        const { html: autoFixedHtml, fixes } = autoFixDesignViolations(html);
        html = autoFixedHtml;
        if (fixes.length > 0) console.log('[design-validator] Auto-fixes applied:', fixes);
        const designValidation = validateDesignSystem(html);
        if (designValidation.violations.length > 0) {
          res.write(`data: ${JSON.stringify({ type: 'design-validation', score: designValidation.score, violations: designValidation.violations.length, fixes: fixes.length })}\n\n`);
        }
      }
      if (designConvention) html = injectConventionColors(html, designConvention);

      // Save as new version
      const assistantMsgId = uuidv4();
      db.prepare('INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)').run(assistantMsgId, projectId, 'assistant', html, 'micro-adjust');

      const isFullHtml = html.toLowerCase().includes('<!doctype html') || html.toLowerCase().includes('<html');
      if (isFullHtml) {
        const maxVersion = db.prepare('SELECT MAX(version) as maxV FROM prototype_versions WHERE project_id = ?').get(projectId) as any;
        const newVersion = (maxVersion?.maxV || 0) + 1;
        db.prepare('UPDATE prototype_versions SET is_current = 0 WHERE project_id = ?').run(projectId);
        const versionId = uuidv4();
        // Detect pages
        const pageMatches = [...html.matchAll(/data-page="([^"]+)"/g)].map(m => m[1]);
        const isMulti = pageMatches.length > 1;
        db.prepare('INSERT INTO prototype_versions (id, project_id, conversation_id, html, version, is_current, is_multi_page, pages) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(versionId, projectId, assistantMsgId, html, newVersion, isMulti ? 1 : 0, JSON.stringify(pageMatches));
        db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
        triggerQualityScoring(versionId, html, apiKey);

        res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'done' })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true, html, messageType: 'micro-adjust', intent: 'micro-adjust', isMultiPage: isMulti, pages: pageMatches })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'done' })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true, html: null, messageType: 'micro-adjust', intent: 'micro-adjust' })}\n\n`);
      }
      res.end();
      return;
    }

    // ─── ELEMENT-ADJUST PATH ─────────────────────────
    if (intent === 'element-adjust' && currentPrototype) {
      const { findElementByBridgeId, replaceElementByBridgeId } = await import('../services/elementMatcher');

      // Parse targetBridgeId and instruction from userContent
      // Expected format from intent classifier: "[bridge-id:xxx] actual instruction"
      const bridgeIdMatch = userContent.match(/\[bridge-id:([^\]]+)\]\s*/);
      const targetBridgeId = bridgeIdMatch ? bridgeIdMatch[1].trim() : null;
      const instruction = bridgeIdMatch ? userContent.replace(bridgeIdMatch[0], '').trim() : userContent;

      if (!targetBridgeId) {
        res.write(`data: ${JSON.stringify({ error: '缺少目標元素 ID (data-bridge-id)' })}\n\n`);
        res.end();
        return;
      }

      // Find the target element in current prototype
      const elementResult = findElementByBridgeId(currentPrototype.html, targetBridgeId);
      if (!elementResult.found || !elementResult.outerHtml) {
        res.write(`data: ${JSON.stringify({ error: `找不到元素: ${targetBridgeId}` })}\n\n`);
        res.end();
        return;
      }

      // Save user message
      const userMsgId = uuidv4();
      db.prepare('INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)').run(userMsgId, projectId, 'user', userContent, 'user');

      res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'analyzing', message: '修改元素中...' })}\n\n`);

      // Load and fill prompt
      const elementPrompt = fs.readFileSync(path.resolve(__dirname, '../prompts/element-adjust.txt'), 'utf-8')
        .replace('{targetHtml}', elementResult.outerHtml)
        .replace('{instruction}', instruction);

      // Call Gemini with auto-retry on 429
      let eaKey = apiKey;
      let eaRetries = 0;
      let modifiedElement = '';
      while (eaRetries <= 2) {
        try {
          const genai = new GoogleGenerativeAI(eaKey);
          const model = genai.getGenerativeModel({
            model: getGeminiModel(),
            systemInstruction: elementPrompt,
            generationConfig: { maxOutputTokens: 8192, temperature: generationTemperature },
          });

          const result = await model.generateContent(instruction);
          try { trackUsage(eaKey, getGeminiModel(), 'element-adjust', result.response.usageMetadata); } catch {}

          modifiedElement = result.response.text().trim();
          // Strip markdown fences if present
          const fenceMatch = modifiedElement.match(/```(?:html)?\s*([\s\S]*?)```/i);
          if (fenceMatch) modifiedElement = fenceMatch[1].trim();
          break;
        } catch (err: any) {
          const msg = err?.message || '';
          const isRateLimit = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429') || msg.includes('Too Many Requests');
          if (isRateLimit && eaRetries < 2) {
            const altKey = getGeminiApiKeyExcluding(eaKey);
            if (altKey) {
              console.warn(`[element-adjust] 429 on key ...${eaKey.slice(-4)}, retrying with ...${altKey.slice(-4)}`);
              eaKey = altKey;
              eaRetries++;
              continue;
            }
          }
          console.error('Element-adjust error:', err);
          res.write(`data: ${JSON.stringify({ error: formatGeminiError(err) })}\n\n`);
          res.end();
          return;
        }
      }

      if (!modifiedElement) {
        res.write(`data: ${JSON.stringify({ error: 'AI 未回傳修改結果' })}\n\n`);
        res.end();
        return;
      }

      // Replace element in full prototype HTML
      let newHtml = replaceElementByBridgeId(currentPrototype.html, targetBridgeId, modifiedElement);
      newHtml = sanitizeGeneratedHtml(newHtml, newHtml.includes('data-page='));
      { const { html: autoFixedHtml, fixes } = autoFixDesignViolations(newHtml); newHtml = autoFixedHtml; if (fixes.length > 0) console.log('[design-validator] Auto-fixes applied:', fixes); }
      if (designConvention) newHtml = injectConventionColors(newHtml, designConvention);

      // Save as new version
      const assistantMsgId = uuidv4();
      db.prepare('INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)').run(assistantMsgId, projectId, 'assistant', `[Element-adjust: ${targetBridgeId}] ${instruction}`, 'element-adjust');

      const maxVersion = db.prepare('SELECT MAX(version) as maxV FROM prototype_versions WHERE project_id = ?').get(projectId) as any;
      const newVersion = (maxVersion?.maxV || 0) + 1;
      db.prepare('UPDATE prototype_versions SET is_current = 0 WHERE project_id = ?').run(projectId);
      const versionId = uuidv4();
      const pageMatches = [...newHtml.matchAll(/data-page="([^"]+)"/g)].map(m => m[1]);
      const isMulti = pageMatches.length > 1;
      db.prepare('INSERT INTO prototype_versions (id, project_id, conversation_id, html, version, is_current, is_multi_page, pages) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(versionId, projectId, assistantMsgId, newHtml, newVersion, isMulti ? 1 : 0, JSON.stringify(pageMatches));
      db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
      triggerQualityScoring(versionId, newHtml, apiKey);

      res.write(`data: ${JSON.stringify({ content: `✓ 已修改元素 (${targetBridgeId})` })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'done' })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, html: newHtml, messageType: 'element-adjust', intent: 'element-adjust', isMultiPage: isMulti, pages: pageMatches })}\n\n`);
      res.end();
      return;
    }

    if (intent === 'question') {
      // Q&A path — rich context with skills + docs
      res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'analyzing', message: '思考中...' })}\n\n`);

      // Build rich system prompt with project context
      let richQaPrompt = qaSystemPromptBase;

      // Inject active skills as knowledge base
      const qaSkills = getActiveSkills(projectId as string);
      if (qaSkills.length > 0) {
        richQaPrompt += '\n\n=== 專案知識庫 ===\n';
        richQaPrompt += qaSkills.slice(0, 8).map(s => `【${s.name}】${s.content.slice(0, 600)}`).join('\n\n');
        richQaPrompt += '\n===';
      }

      // Inject uploaded document analysis
      const qaSpecRows = (db.prepare(
        'SELECT original_name, analysis_result FROM uploaded_files WHERE project_id = ? AND analysis_result IS NOT NULL'
      ).all(projectId) as any[]);
      if (qaSpecRows.length > 0) {
        richQaPrompt += '\n\n=== 上傳的文件分析 ===\n';
        for (const doc of qaSpecRows) {
          try {
            const analysis = JSON.parse(doc.analysis_result as string);
            const pages = (analysis.pages || []).map((p: any) => p.name || p).join('、');
            richQaPrompt += `文件「${doc.original_name}」：${pages}\n`;
          } catch {}
        }
        richQaPrompt += '===';
      }

      // Inject design direction
      if (designConvention) {
        richQaPrompt += `\n\n=== 設計方向 ===\n${designConvention.slice(0, 500)}\n===`;
      }

      let qaKey = apiKey;
      let qaRetries = 0;
      while (qaRetries <= 4) {
        try {
          const genai = new GoogleGenerativeAI(qaKey);
          const model = genai.getGenerativeModel({
            model: getGeminiModel(),
            systemInstruction: richQaPrompt,
            generationConfig: { maxOutputTokens: 4096, temperature: generationTemperature },
          });
          const chatSession = model.startChat({
            history: history.slice(0, -0).map(h => ({
              role: h.role === 'assistant' ? 'model' as const : 'user' as const,
              parts: [{ text: h.content }],
            })),
          });
          // Auto-continue loop: if response was truncated (MAX_TOKENS), keep going
          let continuePrompt = userContent;
          for (let continueTurn = 0; continueTurn < 5; continueTurn++) {
            const result = await chatSession.sendMessageStream(continuePrompt);
            for await (const chunk of result.stream) {
              const text = chunk.text();
              if (text) {
                fullResponse += text;
                res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
              }
            }
            // Check if response was truncated
            let finishReason = 'STOP';
            try {
              const resp = await result.response;
              trackUsage(qaKey, getGeminiModel(), 'chat-qa', resp.usageMetadata);
              finishReason = resp.candidates?.[0]?.finishReason || 'STOP';
            } catch {}

            if (finishReason === 'MAX_TOKENS') {
              console.log(`[chat-qa] Response truncated (MAX_TOKENS), auto-continuing turn ${continueTurn + 2}...`);
              continuePrompt = '請繼續，從你剛才斷掉的地方接著說。不要重複已經說過的內容。';
            } else {
              break; // response complete
            }
          }
          break;
        } catch (err: any) {
          const msg = err?.message || '';
          const isRateLimit = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429') || msg.includes('Too Many Requests');
          if (isRateLimit && qaRetries < 4) {
            const altKey = getGeminiApiKeyExcluding(qaKey);
            if (altKey) { qaKey = altKey; }
            qaRetries++;
            // Wait before retry — let rate limit cool down
            await new Promise(resolve => setTimeout(resolve, 3000));
            console.log(`[chat-qa] 429, retrying ${qaRetries}/4 with key ...${qaKey.slice(-4)}`);
            continue;
          }
          console.error('Gemini QA error:', err);
          res.write(`data: ${JSON.stringify({ error: formatGeminiError(err) })}\n\n`);
          res.end();
          return;
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'done' })}\n\n`);

      // Save user message with type 'user'
      const userMsgId = uuidv4();
      db.prepare(
        'INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)'
      ).run(userMsgId, projectId, 'user', userContent, 'user');

      // Save assistant Q&A response with type 'answer'
      const assistantMsgId = uuidv4();
      db.prepare(
        'INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)'
      ).run(assistantMsgId, projectId, 'assistant', fullResponse, 'answer');

      res.write(`data: ${JSON.stringify({ done: true, html: null, messageType: 'answer' })}\n\n`);
      res.end();
      return;
    }

    // Generate path (full-page | in-shell | component)
    // Auto-trigger visual analysis on any PDF/image files that are missing it (fire-and-forget)
    // This ensures analysis is available on the next generation even if not yet done
    {
      const missingAnalysis = db.prepare(
        `SELECT id, storage_path, mime_type, original_name, file_size FROM uploaded_files
         WHERE project_id = ? AND visual_analysis IS NULL
         AND (mime_type LIKE '%pdf%' OR mime_type LIKE 'image/%' OR original_name LIKE '%.pdf')
         ORDER BY created_at DESC`
      ).all(projectId) as { id: string; storage_path: string; mime_type: string; original_name: string; file_size: number }[];

      if (missingAnalysis.length > 0) {
        const apiKey2 = getGeminiApiKey();
        if (apiKey2) {
          // Fire-and-forget: trigger analysis in background, don't await
          import('../services/pdfPageRenderer').then(async ({ renderPdfPages }) => {
            const { analyzeDesignSpec } = await import('../services/designSpecAnalyzer');
            // Deduplicate by file_size — same PDF uploaded multiple times
            const seen = new Set<number>();
            for (const f of missingAnalysis) {
              if (seen.has(f.file_size)) continue;
              seen.add(f.file_size);
              try {
                const isPdf = f.mime_type.includes('pdf') || f.original_name.toLowerCase().endsWith('.pdf');
                const isImage = f.mime_type.startsWith('image/');
                let images: Buffer[] = [];
                if (isPdf) images = await renderPdfPages(f.storage_path, 6);
                else if (isImage) { const fs2 = await import('fs'); images = [(fs2 as any).readFileSync(f.storage_path)]; }
                if (images.length > 0) {
                  const analysis = await analyzeDesignSpec(images, apiKey2);
                  if (analysis) {
                    db.prepare("UPDATE uploaded_files SET visual_analysis = ?, visual_analysis_at = datetime('now') WHERE id = ?")
                      .run(analysis, f.id);
                    console.log(`[chat] Background visual analysis done for ${f.id}`);
                  }
                }
              } catch (e: any) { console.warn('[chat] bg analysis failed:', e.message); }
            }
          }).catch(() => {});
        }
      }
    }

    // Build effective system prompt with composed design injection
    // First, load design spec analysis — inject BEFORE base system prompt so it overrides defaults
    // Scope: if user explicitly attached fileIds, use only those; otherwise use only the MOST RECENT file.
    // This prevents old uploaded files from previous sessions from polluting new generations.
    let specRowsEarly: { original_name: string; visual_analysis: string; analysis_result: string | null; component_label: string | null; file_size: number; intent: string | null }[];
    if (Array.isArray(fileIds) && fileIds.length > 0) {
      const placeholders = fileIds.map(() => '?').join(',');
      specRowsEarly = db.prepare(
        `SELECT original_name, visual_analysis, analysis_result, component_label, file_size, intent FROM uploaded_files
         WHERE id IN (${placeholders}) AND project_id = ? AND (visual_analysis IS NOT NULL OR analysis_result IS NOT NULL)`
      ).all(...fileIds, projectId) as typeof specRowsEarly;
    } else {
      // Auto: only the single most recently uploaded file with analysis
      // Skip if arch_data has per-page refs — those are already injected via architectureBlock
      const archHasPerPageRefs = archData?.type === 'page' && !archData.aiDecidePages &&
        archData.nodes?.some((n: any) => n.referenceFileId);
      if (archHasPerPageRefs) {
        specRowsEarly = [];
      } else {
        specRowsEarly = db.prepare(
          `SELECT original_name, visual_analysis, analysis_result, component_label, file_size, intent FROM uploaded_files
           WHERE project_id = ? AND (visual_analysis IS NOT NULL OR analysis_result IS NOT NULL) AND (page_name IS NULL OR page_name != '__arch__')
           ORDER BY created_at DESC LIMIT 1`
        ).all(projectId) as typeof specRowsEarly;
      }
    }

    let designSpecPrefix = '';
    if (specRowsEarly.length > 0) {
      designSpecPrefix = '╔══════════════════════════════════════════════════════╗\n';
      designSpecPrefix += '║  DESIGN SPEC — THIS OVERRIDES ALL DEFAULTS BELOW    ║\n';
      designSpecPrefix += '╚══════════════════════════════════════════════════════╝\n';
      designSpecPrefix += 'Uploaded design spec files have been analyzed. You MUST follow the LAYOUT, component structure, and spacing from these specs.\n';
      designSpecPrefix += 'NOTE: Use the design preset/convention colors (CSS variables) — use the spec for structure/layout.\n\n';
      for (const row of specRowsEarly) {
        let name = row.original_name;
        try { const fixed = Buffer.from(name, 'latin1').toString('utf8'); if (/[\u4e00-\u9fff]/.test(fixed)) name = fixed; } catch { /* keep */ }

        const intentPreamble = getIntentPreamble(row.intent);

        // Prefer structured analysis_result over raw visual_analysis
        if (row.analysis_result) {
          try {
            const analysis = JSON.parse(row.analysis_result);
            designSpecPrefix += intentPreamble + formatAnalysisForPrompt(analysis, name) + '\n\n';
            continue;
          } catch { /* fall through */ }
        }
        // Fallback to raw visual_analysis
        if (row.visual_analysis) {
          const analysis = row.visual_analysis.length > 3000 ? row.visual_analysis.slice(0, 3000) + '…' : row.visual_analysis;
          designSpecPrefix += `${intentPreamble}--- Spec: ${name}${row.component_label ? ` [${row.component_label}]` : ''} ---\n${analysis}\n\n`;
        }
      }
      designSpecPrefix += '══════════════════════════════════════════════════════\n\n';
    }

    // Build architecture block
    let architectureBlock = '';
    if (archData) {
      if (archData.type === 'component') {
        architectureBlock = `\n\n=== COMPONENT ARCHITECTURE ===\nType: 元件\nName: ${archData.nodes[0]?.name || '元件'}\n`;
        if (archData.nodes[0]?.interactions?.length) {
          architectureBlock += 'Interactions:\n';
          for (const i of archData.nodes[0].interactions) {
            architectureBlock += `  ${i.label} → ${i.outcome}\n`;
          }
        }
        if (archData.nodes[0]?.states?.length) {
          architectureBlock += `States: ${archData.nodes[0].states.join(', ')}\n`;
        }
        architectureBlock += '================================';
      } else if (archData.type === 'page') {
        const nodeNames = archData.nodes.map((n: any) => n.name);
        if (archData.aiDecidePages || nodeNames.length === 0) {
          architectureBlock = '\n\n=== APP ARCHITECTURE ===\nType: 多頁面網站\nPages: [to be determined by you — generate a sensible set of pages]\n================================';
        } else {
          const navLines = archData.edges.map((e: any) => {
            const src = archData.nodes.find((n: any) => n.id === e.source)?.name || e.source;
            const tgt = archData.nodes.find((n: any) => n.id === e.target)?.name || e.target;
            return `  ${src} → ${tgt}${e.label ? ` (${e.label})` : ''}`;
          });
          const pageDescriptions = archData.nodes.map((n: any) =>
            n.viewport ? `${n.name} (${n.viewport === 'mobile' ? '手機版' : '電腦版'})` : n.name
          );
          architectureBlock = `\n\n=== APP ARCHITECTURE ===\nType: 多頁面網站\nPages: ${pageDescriptions.join(', ')}\n`;
          if (navLines.length) {
            architectureBlock += `Navigation edges (define which page leads to which):\n${navLines.join('\n')}\n`;

            // Convert edges to per-page navigation requirements
            const outgoingEdges: Record<string, string[]> = {};
            for (const e of archData.edges) {
              const src = archData.nodes.find((n: any) => n.id === e.source)?.name;
              const tgt = archData.nodes.find((n: any) => n.id === e.target)?.name;
              if (src && tgt) {
                if (!outgoingEdges[src]) outgoingEdges[src] = [];
                outgoingEdges[src].push(tgt);
              }
            }
            // Check if any node has components defined
            const hasComponents = archData.nodes.some((n: any) => n.components && n.components.length > 0);

            if (hasComponents) {
              // Component-level navigation (upgraded format)
              architectureBlock += `\nComponent-level navigation (MUST implement EXACTLY — do NOT invent links not listed here):\n`;
              for (const node of archData.nodes) {
                if (node.components && node.components.length > 0) {
                  architectureBlock += `\nPage "${node.name}" components:\n`;
                  for (const comp of node.components) {
                    let line = `  - ${comp.name} [${comp.type}]`;
                    if (comp.description) line += `: ${comp.description}`;
                    if (comp.navigationTo) line += ` → onclick showPage('${comp.navigationTo}')`;
                    if (comp.constraints && comp.constraints.type) {
                      line += ` | 限制: type=${comp.constraints.type}`;
                      if (comp.constraints.min != null) line += `, min=${comp.constraints.min}`;
                      if (comp.constraints.max != null) line += `, max=${comp.constraints.max}`;
                      if (comp.constraints.required) line += `, required`;
                    }
                    architectureBlock += line + '\n';
                    // Multi-state components
                    if (comp.states && comp.states.length > 0) {
                      for (const state of comp.states) {
                        architectureBlock += `      選「${state.value}」→ showPage('${state.targetPage}')\n`;
                      }
                    }
                  }
                }
              }
              architectureBlock += `Pages with NO component navigation should use page-level edges above.\n`;
            } else {
              // Legacy page-level navigation
              architectureBlock += `\nPage navigation requirements (MUST implement exactly — do NOT invent links not listed here):\n`;
              for (const [pageName, targets] of Object.entries(outgoingEdges)) {
                architectureBlock += `- Page "${pageName}": clickable elements (cards, buttons, links) MUST call showPage('${targets[0]}')${targets.length > 1 ? ` or showPage('${targets.slice(1).join("' / showPage('")}')` : ''} as appropriate\n`;
              }
            }
            architectureBlock += `Pages with NO outgoing edges should have a back/home button that returns to the first page.\n`;
          }

          // Per-page design specs (check visual_analysis, analysis_result, or both)
          const perPageSpecs: string[] = [];
          for (const node of archData.nodes) {
            if (node.referenceFileId) {
              const fileRow = db.prepare('SELECT visual_analysis, analysis_result FROM uploaded_files WHERE id = ?').get(node.referenceFileId) as any;
              const specContent = fileRow?.visual_analysis || (fileRow?.analysis_result ? (() => {
                try { const ar = JSON.parse(fileRow.analysis_result); return ar.summary || JSON.stringify(ar.pages || ar, null, 2); } catch { return fileRow.analysis_result; }
              })() : null);
              if (specContent) {
                const viewportLabel = node.viewport ? ` [${node.viewport === 'mobile' ? '手機版' : '電腦版'}]` : '';
                const mobileHint = node.viewport === 'mobile' ? ' MOBILE LAYOUT — must be single column, touch-friendly, max-width 480px' : node.viewport === 'desktop' ? ' DESKTOP LAYOUT' : '';
                perPageSpecs.push(`  [${node.name}]${viewportLabel}${mobileHint} <<< DESIGN SPEC FOR ${node.name} — implement exactly this layout >>>\n${specContent.slice(0, 4000)}\n  <<< END DESIGN SPEC FOR ${node.name} >>>`);
              }
            }
          }
          if (perPageSpecs.length) {
            architectureBlock += `Per-page design specs:\n${perPageSpecs.join('\n')}\n`;
          }
          architectureBlock += '================================';
        }
      }
    }

    let effectiveSystemPrompt = designSpecPrefix + architectureBlock + systemPrompt;

    // Build INPUT CONSTRAINTS block from element_constraints table and analysis_result inputConstraints
    let constraintsBlock = '';
    {
      const elementConstraints = db.prepare(
        'SELECT * FROM element_constraints WHERE project_id = ?'
      ).all(projectId) as any[];

      // Also check analysis_result for inputConstraints
      let analysisConstraints: any[] = [];
      for (const row of specRowsEarly) {
        if ((row as any).analysis_result) {
          try {
            const analysis = JSON.parse((row as any).analysis_result);
            if (analysis.inputConstraints && Array.isArray(analysis.inputConstraints)) {
              analysisConstraints = analysisConstraints.concat(analysis.inputConstraints);
            }
          } catch { /* skip */ }
        }
      }

      if (elementConstraints.length > 0 || analysisConstraints.length > 0) {
        constraintsBlock = '\n\n=== INPUT CONSTRAINTS ===\n';
        constraintsBlock += 'When generating HTML form elements, add data-constraint-* attributes as specified below.\n';
        constraintsBlock += 'For each constrained element, add the appropriate attributes: data-constraint-type, data-constraint-min, data-constraint-max, data-constraint-pattern, data-constraint-required.\n\n';

        for (const c of elementConstraints) {
          constraintsBlock += `Element [data-bridge-id="${c.bridge_id}"]: type=${c.constraint_type}`;
          if (c.min !== null) constraintsBlock += `, min=${c.min}`;
          if (c.max !== null) constraintsBlock += `, max=${c.max}`;
          if (c.pattern) constraintsBlock += `, pattern=${c.pattern}`;
          if (c.required) constraintsBlock += `, required=true`;
          if (c.error_message) constraintsBlock += `, error="${c.error_message}"`;
          constraintsBlock += '\n';
        }

        for (const c of analysisConstraints) {
          constraintsBlock += `Field "${c.field}": type=${c.type || 'text'}`;
          if (c.min !== undefined) constraintsBlock += `, min=${c.min}`;
          if (c.max !== undefined) constraintsBlock += `, max=${c.max}`;
          if (c.pattern) constraintsBlock += `, pattern=${c.pattern}`;
          if (c.required) constraintsBlock += `, required=true`;
          constraintsBlock += '\n';
        }

        constraintsBlock += '=== END INPUT CONSTRAINTS ===\n';
        effectiveSystemPrompt += constraintsBlock;
      }
    }

    // designConvention already loaded earlier (before micro-adjust path)
    if (designConvention) {
      effectiveSystemPrompt += `\n\n=== DESIGN SYSTEM ===\n${designConvention.slice(0, 5000)}\n
CRITICAL: ALL colors must use CSS variables (var(--primary), var(--bg), var(--surface), etc.)
NEVER hardcode hex color values — the design tokens are defined in :root CSS variables.
===`;
    }

    // Fetch global design
    const globalRow = db.prepare("SELECT * FROM global_design_profile WHERE id = 'global'").get() as any;

    // Fetch project design
    const designRow = db.prepare('SELECT * FROM design_profiles WHERE project_id = ?').get(projectId) as any;
    const inheritGlobal = designRow ? designRow.inherit_global !== 0 : true;
    let supplement = designRow?.supplement || '';

    // Inject global design block
    if (inheritGlobal && globalRow) {
      let globalTokens: Record<string, any> = {};
      try { globalTokens = JSON.parse(globalRow.tokens || '{}'); } catch { /* ignore */ }
      const hasGlobalDesc = globalRow.description?.trim().length > 0;
      const hasGlobalAnalysis = globalRow.reference_analysis?.trim().length > 0;
      const hasGlobalTokens = Object.keys(globalTokens).length > 0;

      if (hasGlobalDesc || hasGlobalAnalysis || hasGlobalTokens) {
        let globalBlock = '\n\n=== GLOBAL DESIGN (Brand Style) ===\n';
        if (hasGlobalDesc) globalBlock += `Design Direction: ${globalRow.description}\n`;
        if (hasGlobalAnalysis) globalBlock += `Visual Reference Analysis:\n${(globalRow.reference_analysis as string).slice(0, 1000)}\n`;
        if (hasGlobalTokens) {
          globalBlock += 'Design Tokens:\n';
          if (globalTokens.primaryColor) globalBlock += `- Primary Color: ${globalTokens.primaryColor}\n`;
          if (globalTokens.secondaryColor) globalBlock += `- Secondary Color: ${globalTokens.secondaryColor}\n`;
          if (globalTokens.fontFamily) globalBlock += `- Font Family: ${globalTokens.fontFamily}\n`;
          if (globalTokens.borderRadius !== undefined) globalBlock += `- Border Radius: ${globalTokens.borderRadius}px\n`;
          if (globalTokens.spacing) globalBlock += `- Spacing: ${globalTokens.spacing}\n`;
          if (globalTokens.shadowStyle) globalBlock += `- Shadow: ${globalTokens.shadowStyle}\n`;
        }
        globalBlock += 'PROJECT DESIGN tokens override conflicting GLOBAL DESIGN tokens.\n';
        globalBlock += '====================================';
        effectiveSystemPrompt += globalBlock;
      }
    }

    // Inject project design block
    if (designRow) {
      const hasDescription = designRow.description?.trim().length > 0;
      const hasReferenceAnalysis = designRow.reference_analysis?.trim().length > 0;
      let tokens: Record<string, any> = {};
      try { tokens = JSON.parse(designRow.tokens || '{}'); } catch { /* ignore */ }
      const hasTokens = Object.keys(tokens).length > 0;

      if (hasDescription || hasReferenceAnalysis || hasTokens) {
        let profileBlock = '\n\n=== PROJECT DESIGN ===\n';
        if (hasDescription) profileBlock += `Design Direction: ${designRow.description}\n`;
        if (hasReferenceAnalysis) profileBlock += `Visual Reference Analysis:\n${(designRow.reference_analysis as string).slice(0, 1000)}\n`;
        if (hasTokens) {
          profileBlock += 'Design Tokens:\n';
          if (tokens.primaryColor) profileBlock += `- Primary Color: ${tokens.primaryColor}\n`;
          if (tokens.secondaryColor) profileBlock += `- Secondary Color: ${tokens.secondaryColor}\n`;
          if (tokens.fontFamily) profileBlock += `- Font Family: ${tokens.fontFamily}\n`;
          if (tokens.borderRadius !== undefined) profileBlock += `- Border Radius: ${tokens.borderRadius}px\n`;
          if (tokens.spacing) profileBlock += `- Spacing: ${tokens.spacing}\n`;
          if (tokens.shadowStyle) profileBlock += `- Shadow: ${tokens.shadowStyle}\n`;
        }
        profileBlock += 'IMPORTANT: You MUST strictly follow this design profile. Use the exact colors, typography, spacing, and visual style described above.\n';
        profileBlock += '======================';
        effectiveSystemPrompt += profileBlock;
      }
    }

    // Inject supplement block
    if (supplement.trim().length > 0) {
      effectiveSystemPrompt += `\n\n=== PROJECT SUPPLEMENT ===\n${supplement}\nPROJECT SUPPLEMENT takes priority for any conflicting attributes.\n===========================`;
    }

    // Inject agent skills — only project-scoped skills, not global ones
    // Global skills (e.g. HPSkills) are for developer tools, not AI generation
    const activeSkills = getActiveSkills(projectId as string)
      .filter(s => s.scope === 'project');
    if (activeSkills.length > 0) {
      const skillsBlock = activeSkills
        .slice(0, 5) // limit to 5 skills max
        .map(s => `### ${s.name}\n${s.content}`)
        .join('\n\n');
      effectiveSystemPrompt += `\n\n=== AGENT SKILLS ===\nFollow these additional instructions when generating:\n\n${skillsBlock}\n====================`;
    }

    // Design spec analysis reminder (already injected at top — this just reinforces at end)
    if (specRowsEarly.length > 0) {
      effectiveSystemPrompt += '\n\n[REMINDER: Design spec was injected at the top. Follow the spec LAYOUT and component patterns. Use the design preset CSS variables for colors.]';
    }

    // Art style injection
    const artStyle = db.prepare('SELECT * FROM art_style_preferences WHERE project_id = ?').get(projectId) as any;
    if (artStyle && artStyle.apply_style && artStyle.detected_style) {
      effectiveSystemPrompt += `\n\n=== ART STYLE ===\nApply this visual art style to your generated UI:\n${artStyle.detected_style}\nNote: If a Design Profile is also active, Design Profile color tokens take precedence over conflicting art style attributes.\n=================`;
    }

    // Platform context injection based on intent
    if (intent === 'in-shell' && shellHtml) {
      const shellPreview = shellHtml.slice(0, 3000);
      effectiveSystemPrompt += `\n\n=== PLATFORM SHELL CONTEXT ===\nThis is an ENTERPRISE PLATFORM. You are designing a NEW SUB-PAGE or FEATURE PAGE to be embedded within the existing platform shell below.\n\nExisting shell structure (may be truncated):\n${shellPreview}\n\nCRITICAL INSTRUCTIONS:\n- Output ONLY the content that goes inside <main>...</main>\n- Do NOT output <!DOCTYPE html>, <html>, <head>, <nav>, <aside>, <header>, <footer>\n- Your output will be inserted into the platform shell automatically\n- Match the visual style, colors, and component patterns visible in the shell\n=============================`;
    } else if (intent === 'component') {
      effectiveSystemPrompt += `\n\n=== COMPONENT MODE ===\nYou are designing an ISOLATED UI COMPONENT (not a full page).\n\nCRITICAL INSTRUCTIONS:\n- Output ONLY the component HTML and its scoped CSS in a <style> tag\n- Do NOT output <!DOCTYPE html>, <html>, <head>, <body>, <nav>, <header>, <footer>\n- The component will be previewed on a light gray background\n- Include all necessary CSS within a single <style> tag at the top of your output\n- Make the component visually complete and production-ready\n=====================`;
    }

    // Preserve existing page structure when regenerating
    const existingProto = db.prepare(
      'SELECT html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(projectId) as { html: string } | undefined;
    const existingPages: string[] = [];
    if (existingProto?.html) {
      const pageMatches = existingProto.html.matchAll(/data-page="([^"]+)"/g);
      const seen = new Set<string>();
      for (const m of pageMatches) {
        const name = m[1];
        // Filter out corrupted/garbage page names (JS artifacts, template strings, etc.)
        const isGarbage = /['"+\[\]\\]|target|\bpage\b/.test(name) || name.length > 30;
        if (!seen.has(name) && !isGarbage) { seen.add(name); existingPages.push(name); }
      }
    }

    // Multi-page detection — use arch_data nodes if available, else run AI page structure analysis
    let finalPages: string[];
    let isMultiPage: boolean;

    // Page detection — NO API calls. Use architecture data or existing pages.
    // AI analysis (later) will override if it detects better pages.
    if (archData && archData.type === 'page' && !archData.aiDecidePages && archData.nodes.length > 0) {
      finalPages = archData.nodes.map((n: any) => n.name);
      isMultiPage = finalPages.length > 1;
    } else if (intent === 'component') {
      finalPages = [];
      isMultiPage = false;
    } else if (existingPages.length > 1 && !isPageRequest && !effectiveForceRegenerate) {
      finalPages = existingPages;
      isMultiPage = true;
    } else {
      // Will be set by keyword override or AI analysis below
      finalPages = [];
      isMultiPage = false;
    }

    // Track accumulated thinking from AI analysis (for metadata)
    let aiThinkingText = '';

    // Load lessons for this project (used by planAndReview + buildLocalPlan)
    const projectLessons = getLessons(projectId as string);
    if (projectLessons.length > 0) {
      console.log('[chat] Loaded', projectLessons.length, 'lessons for project');
    }

    // === PLAN + REVIEW (replaces keyword matching + AI analysis) ===
    console.log('[chat] Pre-analysis check: finalPages=', finalPages.length, 'intent=', intent);
    if (finalPages.length <= 1 && (intent === 'full-page' || intent === 'in-shell')) {
      res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'analyzing', message: '分析需求中...' })}\n\n`);

      // Heartbeat during planning (3 agents discussion can take 30-60s)
      const planHeartbeat = setInterval(() => {
        try { res.write(`: heartbeat\n\n`); } catch { clearInterval(planHeartbeat); }
      }, 10000);

      try {
        // Pass active skills to planning agents
        const planSkills = getActiveSkills(projectId as string).map(s => ({
          name: s.name, description: s.description || '', content: s.content,
        }));
        // Add document analysis results to user message for planning agents
        const earlyDesignRow = db.prepare('SELECT description, tokens, inherit_global FROM design_profiles WHERE project_id = ?').get(projectId) as any;
        let planUserMsg = userContent;

        // Inject uploaded document analysis so agents know about design specs
        const docsWithAnalysis = specRowsEarly.filter((r: any) => r.analysis_result);
        if (docsWithAnalysis.length > 0) {
          planUserMsg += '\n\n【上傳的設計文件分析】';
          for (const doc of docsWithAnalysis) {
            try {
              const analysis = JSON.parse(doc.analysis_result as string);
              const pageSummary = (analysis.pages || []).map((p: any) => {
                const name = p.name || p;
                const components = (p.components || []).join('、');
                return `  • ${name}${components ? `：${components}` : ''}`;
              }).join('\n');
              planUserMsg += `\n文件「${doc.original_name}」(${doc.intent})：\n${pageSummary}`;
              if (analysis.shared?.components?.length) {
                planUserMsg += `\n  共用元件：${analysis.shared.components.join('、')}`;
              }
            } catch { /* skip */ }
          }
        }

        if (earlyDesignRow?.description) {
          planUserMsg += `\n\n【設計方向】${earlyDesignRow.description}`;
          try {
            const t = JSON.parse(earlyDesignRow.tokens || '{}');
            if (t.primaryColor) planUserMsg += `\n主色：${t.primaryColor}`;
          } catch {}
        }
        const plan = await planAndReview(planUserMsg, (text) => {
          res.write(`data: ${JSON.stringify({ type: 'thinking', content: text })}\n\n`);
          aiThinkingText += text;
        }, planSkills, history, projectLessons);
        clearInterval(planHeartbeat);

        finalPages = plan.pages.map(p => p.name);
        isMultiPage = finalPages.length >= 2;

        // Store plan constraints in supplement for sub-agents
        if (plan.constraints.length > 0) {
          supplement += '\n\n=== 設計約束 ===\n' + plan.constraints.join('\n');
        }

        // Store navigation map for sub-agents
        const navMap = plan.navigation.map(n => `${n.from} → ${n.to}（${n.trigger}）`).join('\n');
        if (navMap) {
          supplement += '\n\n=== 導航流程 ===\n' + navMap;
        }

        console.log('[chat] Plan+Review pages:', finalPages);
      } catch (e: any) {
        clearInterval(planHeartbeat);
        console.warn('[chat] Plan+Review failed:', e.message?.slice(0, 60));
        // Last resort fallback
        finalPages = ['首頁', '列表瀏覽', '詳情頁面', '操作功能', '個人帳戶'];
        isMultiPage = true;
      }

      // === SKILL CONFLICT DETECTION ===
      // Check for conflicts between user requirements and Skill business rules
      const conflictSkills = getActiveSkills(projectId as string).map(s => ({
        name: s.name, description: s.description || '', content: s.content,
      }));
      if (conflictSkills.length > 0) {
        try {
          res.write(`data: ${JSON.stringify({ type: 'thinking', content: '\n\n🔍 檢查業務規則衝突...\n' })}\n\n`);
          const conflictReport = await checkSkillConflicts(
            userContent, finalPages, supplement ? [supplement] : [], conflictSkills,
          );
          if (conflictReport.conflicts.length > 0) {
            res.write(`data: ${JSON.stringify({ type: 'conflict-report', conflicts: conflictReport.conflicts })}\n\n`);
            const criticalCount = conflictReport.conflicts.filter(c => c.severity === 'critical').length;
            if (criticalCount > 0) {
              res.write(`data: ${JSON.stringify({ type: 'conflict-pause', message: `發現 ${criticalCount} 個關鍵衝突，30 秒後自動繼續生成` })}\n\n`);
              // Wait briefly but don't actually block — auto-continue
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
        } catch (e: any) {
          console.warn('[chat] Skill conflict check failed:', e.message?.slice(0, 60));
        }
      }
    }

    // Read project design profile BEFORE parallel path
    const projDesign = db.prepare('SELECT * FROM design_profiles WHERE project_id = ?').get(projectId) as any;
    const projInheritGlobal = projDesign ? projDesign.inherit_global !== 0 : true;
    if (projDesign && (!projInheritGlobal || projDesign.tokens)) {
      // Override designConvention with project-specific design
      let projTokens: any = {};
      try { projTokens = JSON.parse(projDesign.tokens || '{}'); } catch {}
      designConvention = `PROJECT DESIGN (override global):
Design Direction: ${projDesign.description || ''}
Primary Color: ${projTokens.primaryColor || '#3b82f6'}
Secondary Color: ${projTokens.secondaryColor || '#64748b'}
Font: ${projTokens.fontFamily || 'system'}
Border Radius: ${projTokens.borderRadius || 8}px
Shadow: ${projTokens.shadowStyle || '輕柔'}
IMPORTANT: Follow the project design direction. All colors must use CSS var() references.`;
      console.log('[chat] Using project design:', projDesign.description);
    }

    // Also check design preset tokens (supplements or overrides projDesign)
    if (projectForPreset?.design_preset_id) {
      const presetForTokens = db.prepare('SELECT * FROM design_presets WHERE id = ?').get(projectForPreset.design_preset_id) as any;
      if (presetForTokens?.tokens) {
        let presetTokens: any = {};
        try { presetTokens = JSON.parse(presetForTokens.tokens); } catch {}
        if (presetTokens.primaryColor) {
          designConvention = `PROJECT DESIGN (override global):
Design Direction: ${presetForTokens.description || presetForTokens.name || ''}
Primary Color: ${presetTokens.primaryColor || '#3b82f6'}
Secondary Color: ${presetTokens.secondaryColor || '#64748b'}
Background Color: ${presetTokens.backgroundColor || '#f9fafb'}
Font: ${presetTokens.fontFamily || 'system'}
Border Radius: ${presetTokens.borderRadius || 8}px
Shadow: ${presetTokens.shadowStyle || '輕柔'}
IMPORTANT: Follow the project design direction. All colors must use CSS var() references.`;
          console.log('[chat] Using design preset tokens:', presetForTokens.name);
        }
      }
    }

    // === PARALLEL GENERATION PATH ===
    // If 2+ pages, use parallel pipeline for speed
    const hasAnalysisData = specRowsEarly.some((r: any) => r.analysis_result);
    if (isMultiPage && finalPages.length >= 2) {
      // Build analysis data — ALWAYS use finalPages from plan as the page list
      // (analysis_result from spec rows may have different/fewer pages than what the plan decided)
      let analysisData: any = {
        pages: finalPages.map(p => ({ name: p, description: p, components: [] })),
        shared: { components: [], styles: {} },
      };
      // Merge supplementary data from spec analysis if available
      for (const row of specRowsEarly) {
        if (row.analysis_result) {
          try {
            const parsed = JSON.parse(row.analysis_result);
            if (parsed.shared) analysisData.shared = parsed.shared;
            // Merge component info for matching pages
            for (const ap of (parsed.pages || [])) {
              const match = analysisData.pages.find((p: any) => p.name === (ap.name || ap));
              if (match && ap.components) match.components = ap.components;
              if (match && ap.description) match.description = ap.description;
            }
            break;
          } catch { /* skip */ }
        }
      }

      {
        res.write(`data: ${JSON.stringify({ phase: 'planning', message: '規劃頁面架構...' })}\n\n`);

        // SSE heartbeat — keep connection alive during long parallel generation
        const heartbeat = setInterval(() => {
          try { res.write(`: heartbeat\n\n`); } catch { clearInterval(heartbeat); }
        }, 15000); // every 15 seconds

        try {
          const parallelResult = await generateParallel(
            projectId as string,
            analysisData,
            architectureBlock || '',
            designConvention,
            userContent,
            (event) => {
              res.write(`data: ${JSON.stringify(event)}\n\n`);
            },
            projectLessons,
          );

          // Save user message
          const userMsgId = uuidv4();
          db.prepare(
            'INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)'
          ).run(userMsgId, projectId, 'user', userContent, 'user');

          clearInterval(heartbeat);
          // Build summary for parallel result
          const parallelPages = parallelResult.pages;
          const parallelSummary = `我已經為您建立了「${userContent.slice(0, 30)}」的原型，包含 ${parallelPages.length} 個頁面。\n此原型採用 HTML、CSS 與 JavaScript 構建，支持頁面間導覽切換。\n\n包含頁面：\n${parallelPages.map((p: string) => `• ${p}`).join('\n')}`;
          const parallelThinking = aiThinkingText || `分析需求：「${userContent.slice(0, 100)}」\n偵測到 ${parallelPages.length} 個頁面：${parallelPages.join('、')}`;
          const parallelMeta = JSON.stringify({ summary: parallelSummary, pages: parallelPages, thinking: parallelThinking });

          // Save assistant response with metadata
          const assistantMsgId = uuidv4();
          db.prepare(
            'INSERT INTO conversations (id, project_id, role, content, message_type, metadata) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(assistantMsgId, projectId, 'assistant', parallelResult.html, 'generate', parallelMeta);

          // Validate
          {
            const conventionPrimary = designConvention.match(/#([89a-fA-F][0-9a-fA-F]{5})/)?.[0] || null;
            const validationResult = validatePrototype(parallelResult.html, analysisData, conventionPrimary, true);
            logValidation(validationResult, projectId as string);
          }

          // Save prototype version
          const maxVersion = db.prepare(
            'SELECT MAX(version) as maxV FROM prototype_versions WHERE project_id = ?'
          ).get(projectId) as any;
          const newVersion = (maxVersion?.maxV || 0) + 1;

          db.prepare('UPDATE prototype_versions SET is_current = 0 WHERE project_id = ?').run(projectId);

          const versionId = uuidv4();
          db.prepare(
            'INSERT INTO prototype_versions (id, project_id, conversation_id, html, version, is_current, is_multi_page, pages) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
          ).run(versionId, projectId, assistantMsgId, parallelResult.html, newVersion, 1, JSON.stringify(parallelResult.pages));

          db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
          triggerQualityScoring(versionId, parallelResult.html, apiKey);

          // Send pages event + done with summary
          res.write(`data: ${JSON.stringify({ type: 'pages', pages: parallelPages })}\n\n`);
          res.write(`data: ${JSON.stringify({
            done: true,
            html: parallelResult.html,
            messageType: 'generate',
            intent,
            isMultiPage: true,
            pages: parallelPages,
            summary: parallelSummary,
            pageCount: parallelPages.length,
          })}\n\n`);
          res.end();
          return;
        } catch (err: any) {
          clearInterval(heartbeat);
          console.error('[parallel] Pipeline failed, retrying once:', err.message);
          // Retry once with a different key
          try {
            const retryResult = await generateParallel(
              projectId as string, analysisData, architectureBlock || '',
              designConvention, userContent,
              (event) => { res.write(`data: ${JSON.stringify(event)}\n\n`); },
              projectLessons,
            );
            // Success on retry — save and return (same logic as above)
            db.prepare('INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), projectId, 'user', userContent, 'user');
            const retryMsgId = uuidv4();
            db.prepare('INSERT INTO conversations (id, project_id, role, content, message_type, metadata) VALUES (?, ?, ?, ?, ?, NULL)').run(retryMsgId, projectId, 'assistant', retryResult.html, 'generate');
            db.prepare('UPDATE prototype_versions SET is_current = 0 WHERE project_id = ?').run(projectId);
            const retryVersionId = uuidv4();
            const retryVersion = ((db.prepare('SELECT MAX(version) as v FROM prototype_versions WHERE project_id = ?').get(projectId) as any)?.v || 0) + 1;
            db.prepare('INSERT INTO prototype_versions (id, project_id, conversation_id, html, version, is_current, is_multi_page, pages) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(retryVersionId, projectId, retryMsgId, retryResult.html, retryVersion, 1, JSON.stringify(retryResult.pages));
            db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
            triggerQualityScoring(retryVersionId, retryResult.html, apiKey);
            res.write(`data: ${JSON.stringify({ done: true, html: retryResult.html, messageType: 'generate', intent, isMultiPage: true, pages: retryResult.pages })}\n\n`);
            res.end();
            return;
          } catch (retryErr: any) {
            console.error('[parallel] Retry also failed:', retryErr.message);
            res.write(`data: ${JSON.stringify({ error: '多頁面生成失敗，請稍後重試: ' + retryErr.message?.slice(0, 100) })}\n\n`);
            res.end();
            return;
          }
        }
      }
    }

    if (isMultiPage) {
      // Generate the EXACT HTML skeleton the AI must follow
      const pageTemplate = finalPages.map((p, i) =>
        `<div class="page" id="page-${p}" data-page="${p}" style="display:${i === 0 ? 'block' : 'none'};">
  <!-- ${p} 的完整內容放這裡 — 必須包含真實 UI 元件、文字、資料 -->
</div>`
      ).join('\n');

      const navTemplate = finalPages.map(p =>
        `<a href="#" class="nav-link" data-nav="${p}" onclick="showPage('${p}');return false;">${p}</a>`
      ).join('\n  ');

      effectiveSystemPrompt += `\n\n=== MULTI-PAGE STRUCTURE (MANDATORY) ===

你必須生成一個包含 ${finalPages.length} 個頁面的 HTML 文件。

每個頁面是一個 <div class="page"> 容器。第一個頁面顯示，其他隱藏。
導覽列的每個連結用 onclick="showPage('頁面名')" 切換。

你的 HTML 必須包含以下結構（請填入每個頁面的完整內容）：

<nav>
  ${navTemplate}
</nav>

${pageTemplate}

<script>
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  var el = document.getElementById('page-' + name);
  if (el) el.style.display = 'block';
  document.querySelectorAll('[data-nav]').forEach(l => l.classList.toggle('active', l.dataset.nav === name));
}
document.addEventListener('DOMContentLoaded', function() { showPage('${finalPages[0]}'); });
</script>

⚠️ 每個 page div 裡面必須有完整的 UI 內容（至少 30 行 HTML）。
⚠️ 絕不可以只寫 placeholder 或 "即將推出" — 每個頁面都要有真正的 UI 元件。
⚠️ 所有按鈕、連結都要用 showPage() 做頁面導航。
============================`;
    }

    // Build messages for generation
    // Strip HTML from assistant history to avoid token explosion
    const trimmedHistory = history.slice(-10).map(h => ({
      role: h.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{
        text: h.role === 'assistant' && h.content.trim().startsWith('<')
          ? '[前一次生成的原型 HTML — 已省略以節省 tokens]'
          : h.content.length > 800 ? h.content.slice(0, 800) + '…' : h.content,
      }],
    }));

    // accumulatedThinking was already set by AI analysis above (before parallel check)
    let accumulatedThinking = '';

    // Step 2: Emit processing steps
    res.write(`data: ${JSON.stringify({ type: 'thinking', content: '\n\n' })}\n\n`);

    // Report what's being loaded
    const steps: string[] = [];
    if (designSpecPrefix) steps.push('📋 載入設計規格');
    if (architectureBlock) steps.push('🏗️ 載入架構圖配置');
    if (designConvention) steps.push('🎨 載入設計風格 (Design Convention)');
    if (supplement.trim()) steps.push('📎 載入專案補充說明');
    if (activeSkills.length > 0) steps.push(`🔧 注入 ${activeSkills.length} 個專案技能`);
    if (isMultiPage) steps.push(`📄 多頁面模式：${finalPages.join('、')}`);
    if (steps.length > 0) {
      res.write(`data: ${JSON.stringify({ type: 'thinking', content: '--- 準備生成 ---\n' + steps.join('\n') + '\n' })}\n\n`);
    }

    // Send page list event
    if (finalPages.length > 0) {
      res.write(`data: ${JSON.stringify({ type: 'pages', pages: finalPages })}\n\n`);
    }

    // Send active skills info
    if (activeSkills.length > 0) {
      res.write(`data: ${JSON.stringify({ type: 'skills', skills: activeSkills.map(s => s.name) })}\n\n`);
    }

    // ── Phase 2: Actual generation ──
    res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'generating', message: '生成程式碼...' })}\n\n`);

    let currentKey = apiKey;
    let retries = 0;
    const maxRetries = 2;
    while (retries <= maxRetries) {
      try {
        const genai = new GoogleGenerativeAI(currentKey);
        const model = genai.getGenerativeModel({
          model: getGeminiModel(),
          systemInstruction: effectiveSystemPrompt,
          generationConfig: { maxOutputTokens: 65536, temperature: generationTemperature },
        });
        const chatSession = model.startChat({ history: trimmedHistory });
        const result = await chatSession.sendMessageStream(userContent);

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            fullResponse += text;
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          }
        }
        try { const resp = await result.response; trackUsage(currentKey, getGeminiModel(), 'chat-generate', resp.usageMetadata); } catch {}
        break; // success
      } catch (err: any) {
        const msg = err?.message || '';
        const isRateLimit = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429') || msg.includes('Too Many Requests');
        if (isRateLimit && retries < maxRetries) {
          const altKey = getGeminiApiKeyExcluding(currentKey);
          if (altKey) {
            console.warn(`[chat] 429 on key ...${currentKey.slice(-4)}, retrying with ...${altKey.slice(-4)} (attempt ${retries + 1})`);
            currentKey = altKey;
            retries++;
            continue;
          }
        }
        console.error('Gemini API error:', err);
        res.write(`data: ${JSON.stringify({ error: formatGeminiError(err) })}\n\n`);
        res.end();
        return;
      }
    }

    // Emit done phase before the done event
    res.write(`data: ${JSON.stringify({ type: 'phase', phase: 'done' })}\n\n`);

    // Save user message
    const userMsgId = uuidv4();
    db.prepare(
      'INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)'
    ).run(userMsgId, projectId, 'user', userContent, 'user');

    // Determine message_type label based on intent
    const generateMessageType = intent === 'component' ? 'component' : intent === 'in-shell' ? 'in-shell' : 'generate';

    // Save assistant response (metadata will be updated after summary is generated)
    const assistantMsgId = uuidv4();
    db.prepare(
      'INSERT INTO conversations (id, project_id, role, content, message_type, metadata) VALUES (?, ?, ?, ?, ?, NULL)'
    ).run(assistantMsgId, projectId, 'assistant', fullResponse, generateMessageType);

    // Extract raw AI output — strip markdown fences and trailing commentary
    const rawAiOutput = (() => {
      const raw = fullResponse.trim();
      const fenceMatch = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
      if (fenceMatch) return fenceMatch[1].trim();
      const startIdx = raw.search(/<!doctype html|<html[\s>]/i);
      if (startIdx === -1) return raw;
      const endIdx = raw.lastIndexOf('</html>');
      if (endIdx !== -1) return raw.slice(startIdx, endIdx + '</html>'.length);
      return raw.slice(startIdx);
    })();

    // Compose final HTML based on intent
    let html: string;
    if (intent === 'component') {
      // Wrap component fragment in minimal preview HTML
      html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>body{display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:32px 24px;background:#f8fafc;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden;max-width:100%;}</style></head><body>${rawAiOutput}</body></html>`;
    } else if (intent === 'in-shell' && shellHtml) {
      // Compose in-shell: replace {CONTENT} with AI output
      // If AI mistakenly returned full HTML, extract <main> content first
      let content = rawAiOutput;
      const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      if (mainMatch) content = mainMatch[1].trim();
      else if (content.toLowerCase().includes('<!doctype')) {
        // Full page returned — strip outer shell, keep body content
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) content = bodyMatch[1].trim();
      }
      html = shellHtml.replace('{CONTENT}', content);
      // Inject base target
      if (html.toLowerCase().includes('<head>')) {
        html = html.replace(/<head>/i, '<head><base target="_blank">');
      } else if (html.toLowerCase().includes('<head ')) {
        html = html.replace(/(<head[^>]*>)/i, '$1<base target="_blank">');
      }
    } else {
      // full-page: existing logic
      html = rawAiOutput;
      if (html.toLowerCase().includes('<head>')) {
        html = html.replace(/<head>/i, '<head><base target="_blank">');
      } else if (html.toLowerCase().includes('<head ')) {
        html = html.replace(/(<head[^>]*>)/i, '$1<base target="_blank">');
      }
    }

    // Sanitize AI output — fix duplicate styles, truncation, missing showPage
    html = sanitizeGeneratedHtml(html, isMultiPage);

    // Auto-fix design system violations
    {
      const { html: autoFixedHtml, fixes } = autoFixDesignViolations(html);
      html = autoFixedHtml;
      if (fixes.length > 0) console.log('[design-validator] Auto-fixes applied:', fixes);
      const designValidation = validateDesignSystem(html);
      if (designValidation.violations.length > 0) {
        res.write(`data: ${JSON.stringify({ type: 'design-validation', score: designValidation.score, violations: designValidation.violations.length, fixes: fixes.length })}\n\n`);
      }
    }

    // Inject convention color overrides if active
    if (designConvention) {
      html = injectConventionColors(html, designConvention);
    }

    // Validate prototype quality (non-blocking — logs warnings only)
    {
      // Get analysis_result for validation if available
      const latestAnalysis = specRowsEarly.length > 0 && specRowsEarly[0].analysis_result
        ? (() => { try { return JSON.parse(specRowsEarly[0].analysis_result); } catch { return null; } })()
        : null;
      const conventionPrimary = designConvention.match(/#([89a-fA-F][0-9a-fA-F]{5})/)?.[0] || null;
      const validationResult = validatePrototype(html, latestAnalysis, conventionPrimary, isMultiPage);
      logValidation(validationResult, projectId as string);
    }

    // Only create prototype version if response looks like HTML
    const isFullHtml = html.toLowerCase().includes('<!doctype html') || html.toLowerCase().includes('<html');
    if (isFullHtml) {
      const maxVersion = db.prepare(
        'SELECT MAX(version) as maxV FROM prototype_versions WHERE project_id = ?'
      ).get(projectId) as any;
      const newVersion = (maxVersion?.maxV || 0) + 1;

      db.prepare(
        'UPDATE prototype_versions SET is_current = 0 WHERE project_id = ?'
      ).run(projectId);

      // Extract actual page names from HTML (AI may use different names than finalPages)
      const htmlPageMatches = html.match(/data-page="([^"]+)"/g);
      if (htmlPageMatches && htmlPageMatches.length >= 2) {
        const extractedPages = htmlPageMatches.map(m => m.match(/data-page="([^"]+)"/)?.[1] || '').filter(Boolean);
        if (extractedPages.length >= 2) {
          // Also check for display text in nav items
          const navTextMatches = html.match(/data-nav="([^"]+)"[^>]*>([^<]+)</g);
          const navTextMap: Record<string, string> = {};
          if (navTextMatches) {
            for (const m of navTextMatches) {
              const parts = m.match(/data-nav="([^"]+)"[^>]*>([^<]+)/);
              if (parts) navTextMap[parts[1]] = parts[2].trim();
            }
          }
          // Use nav display text if available, otherwise use data-page value
          finalPages = extractedPages.map(p => navTextMap[p] || p);
          isMultiPage = true;
          console.log('[chat] Extracted actual pages from HTML:', finalPages);
        }
      }

      const versionId = uuidv4();
      db.prepare(
        'INSERT INTO prototype_versions (id, project_id, conversation_id, html, version, is_current, is_multi_page, pages) VALUES (?, ?, ?, ?, ?, 1, ?, ?)'
      ).run(
        versionId,
        projectId,
        assistantMsgId,
        html,
        newVersion,
        isMultiPage ? 1 : 0,
        JSON.stringify(finalPages)
      );

      db.prepare(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?"
      ).run(projectId);

      // POST-PROCESS: If multi-page but HTML lacks page navigation, wrap with assembler
      if (isMultiPage && finalPages.length >= 2 && !html.includes('showPage')) {
        console.log('[chat] Single-call HTML missing showPage — wrapping with assembler');
        try {
          const localPlan = buildLocalPlan(finalPages, userContent, designConvention, projectLessons);
          // Extract original styles from the generated HTML
          const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
          const originalStyles = styleMatches.map(s => s.replace(/<\/?style[^>]*>/gi, '')).join('\n');
          // Merge original styles into localPlan's sharedCss
          if (originalStyles) {
            localPlan.sharedCss = localPlan.sharedCss + '\n\n/* Original generated styles */\n' + originalStyles;
          }
          // Extract body content (remove doctype, html, head, body tags but keep style-less content)
          let bodyContent = html
            .replace(/<!DOCTYPE[^>]*>/gi, '')
            .replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
            .replace(/<head>[\s\S]*?<\/head>/gi, '')
            .replace(/<\/?body[^>]*>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // styles already extracted
            .trim();
          const fragments = finalPages.map((pageName, idx) => ({
            name: pageName,
            html: idx === 0 ? bodyContent
              : `<div class="container section"><h1>${pageName}</h1><p>此頁面內容正在生成中，請使用對話微調此頁面。</p></div>`,
            success: true,
          }));
          html = assemblePrototype(localPlan, fragments);
          // Post-process: inject showPage() calls into common navigation elements
          // Map common button text to target pages
          const pageMap: Record<string, string> = {};
          for (const p of finalPages) {
            if (/商品詳情|詳情|detail/i.test(p)) pageMap['detail'] = p;
            if (/商品列表|列表|products?|catalog/i.test(p)) pageMap['list'] = p;
            if (/購物車|cart/i.test(p)) pageMap['cart'] = p;
            if (/結帳|checkout/i.test(p)) pageMap['checkout'] = p;
            if (/首頁|home|index/i.test(p)) pageMap['home'] = p;
          }
          // Replace common links/buttons with showPage calls
          if (pageMap['detail']) {
            html = html.replace(/href="#"([^>]*>)\s*(查看|查看詳情|查看更多|View|Details)/gi,
              `href="#" onclick="showPage('${pageMap['detail']}');return false;"$1$2`);
          }
          if (pageMap['cart']) {
            html = html.replace(/href="#"([^>]*>)\s*(前往購物車|查看購物車|Go to Cart)/gi,
              `href="#" onclick="showPage('${pageMap['cart']}');return false;"$1$2`);
          }
          if (pageMap['checkout']) {
            html = html.replace(/href="#"([^>]*>)\s*(前往結帳|去結帳|結帳|Checkout)/gi,
              `href="#" onclick="showPage('${pageMap['checkout']}');return false;"$1$2`);
          }
          if (pageMap['home'] || pageMap['list']) {
            const target = pageMap['list'] || pageMap['home'];
            html = html.replace(/href="#"([^>]*>)\s*(繼續購物|繼續逛|Continue Shopping)/gi,
              `href="#" onclick="showPage('${target}');return false;"$1$2`);
          }
          if (pageMap['list']) {
            html = html.replace(/href="#"([^>]*>)\s*(查看全部|查看所有|View All|更多商品)/gi,
              `href="#" onclick="showPage('${pageMap['list']}');return false;"$1$2`);
          }
          // Update DB with assembled HTML
          db.prepare('UPDATE prototype_versions SET html = ? WHERE id = ?').run(html, versionId);
          db.prepare('UPDATE conversations SET content = ? WHERE id = ?').run(html, assistantMsgId);
          // Fix navigation links
          const navFix = fixNavigation(html);
          html = navFix.html;
          if (navFix.fixes.length > 0) console.log('[chat] Nav fixes:', navFix.fixes.slice(0, 5));
          db.prepare('UPDATE prototype_versions SET html = ? WHERE id = ?').run(html, versionId);
          console.log('[chat] Assembled multi-page HTML with showPage, length:', html.length);
        } catch (assembleErr: any) {
          console.warn('[chat] Assembly fallback failed:', assembleErr.message);
        }
      }

      triggerQualityScoring(versionId, html, currentKey);

      // Send page list as separate event before done
      if (finalPages.length > 0) {
        res.write(`data: ${JSON.stringify({ type: 'pages', pages: finalPages })}\n\n`);
      }

      // Quick summary call (after generation completes)
      let generationSummary = '';
      try {
        const summaryGenai = new GoogleGenerativeAI(currentKey);
        const summaryModel = summaryGenai.getGenerativeModel({
          model: getGeminiModel(),
          generationConfig: { maxOutputTokens: 800, temperature: 0.3 },
        });
        const summaryPrompt = `你是 UI 設計助手。以下是剛生成的 HTML prototype。請用繁體中文描述（8-15 行）。

格式要求：
第一行：一句概述（例如「我已經為您建立了一個功能完整的購物網站。」）
第二行：補充說明使用了什麼技術/架構。
空一行，然後寫「主要功能包括：」
接著每個頁面/功能用 • 開頭列點，每點包含頁面名稱和 2-3 個具體功能。

直接回答，不要加 markdown 標題。HTML 如下（前3000字）：
${html.slice(0, 3000)}`;
        const summaryResult = await summaryModel.generateContent(summaryPrompt);
        generationSummary = summaryResult.response.text();
      } catch { /* API summary failed — build local summary */ }
      // Fallback: build local summary if API call failed
      if (!generationSummary && finalPages.length > 0) {
        const userReq = userContent.slice(0, 50);
        const intro = `我已經為您建立了「${userReq}」的原型，包含 ${finalPages.length} 個頁面。`;
        const tech = `此原型採用 HTML、CSS 與 JavaScript 構建，支持頁面間導覽切換，並整合了專案設計風格。`;
        const features = finalPages.map(p => `• ${p}`).join('\n');
        generationSummary = `${intro}\n${tech}\n\n包含頁面：\n${features}`;
      }

      // Save summary + pages to conversation metadata for persistence
      if (generationSummary || finalPages.length > 0) {
        try {
          db.prepare('UPDATE conversations SET metadata = ? WHERE id = ?')
            .run(JSON.stringify({ summary: generationSummary, pages: finalPages, thinking: typeof accumulatedThinking === 'string' ? accumulatedThinking : '' }), assistantMsgId);
        } catch { /* ignore */ }
      }

      res.write(`data: ${JSON.stringify({ done: true, html, messageType: generateMessageType, intent, isMultiPage, pages: finalPages, summary: generationSummary, pageCount: finalPages.length })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ done: true, html: null, messageType: generateMessageType, intent })}\n\n`);
    }

    generationQueue.complete(queueTask.id, true);
    res.end();
  } catch (err: any) {
    generationQueue.complete(queueTask.id, false);
    console.error('Chat error:', err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'Internal server error' })}\n\n`);
      res.end();
    } else {
      return res.status(500).json({ error: 'Failed to process chat' });
    }
  }
});

// GET /api/projects/:id/conversations — get conversation history
router.get('/:id/conversations', (req: Request, res: Response) => {
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const conversations = db.prepare(
      'SELECT * FROM conversations WHERE project_id = ? ORDER BY created_at ASC'
    ).all(req.params.id) as any[];

    // Don't send full HTML content for generate/micro-adjust messages (can be 50KB+)
    // Frontend only needs to know the type to render the right card
    const trimmed = conversations.map(c => {
      if ((c.message_type === 'generate' || c.message_type === 'micro-adjust' || c.message_type === 'element-adjust') && c.role === 'assistant') {
        return { ...c, content: `[${c.message_type}]` };
      }
      return c;
    });

    return res.json(trimmed);
  } catch (err: any) {
    console.error('Error getting conversations:', err);
    return res.status(500).json({ error: 'Failed to get conversations' });
  }
});

export default router;
