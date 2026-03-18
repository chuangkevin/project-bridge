import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import db from '../db/connection';
import { classifyIntent } from '../services/intentClassifier';
import { extractImagesFromDocument, analyzeArtStyle } from '../services/artStyleExtractor';
import { analyzePageStructure } from '../services/pageStructureAnalyzer';

const router = Router();

const systemPrompt = fs.readFileSync(
  path.resolve(__dirname, '../prompts/system.txt'),
  'utf-8'
);

const qaSystemPrompt = `You are a helpful assistant for a UI prototype tool. Answer questions about uploaded specifications, design requirements, and prototype based on the conversation history. Be concise and specific.`;

function getOpenAIApiKey(): string | null {
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get() as any;
  return setting?.value || null;
}

function formatOpenAIError(err: any): string {
  const status = err?.status || err?.response?.status;
  if (status === 429) {
    const msg: string = err?.message || '';
    if (msg.includes('quota') || msg.includes('exceeded')) {
      return 'OpenAI API 額度已用完，請至 https://platform.openai.com/account/billing 儲值後再試。';
    }
    return 'OpenAI API 請求過於頻繁，請稍後再試。';
  }
  if (status === 401) return 'OpenAI API 金鑰無效，請至設定頁面重新輸入。';
  if (status === 503 || status === 502) return 'OpenAI 服務暫時不可用，請稍後再試。';
  return err?.message || 'OpenAI API 發生錯誤，請稍後再試。';
}

async function callOpenAIWithRetry(
  openai: OpenAI,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxAttempts = 3,
  model = 'gpt-4o'
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const stream = await openai.chat.completions.create({
        model,
        messages,
        stream: true,
        max_tokens: 16384,
      });
      return stream;
    } catch (err: any) {
      lastError = err;
      // Don't retry quota exceeded or auth errors — they won't resolve on retry
      const status = err?.status || err?.response?.status;
      if (status === 429 && (err?.message || '').includes('quota')) break;
      if (status === 401) break;
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// POST /api/projects/:id/chat — SSE chat with AI
router.post('/:id/chat', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const { message, fileIds } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Read arch_data for architecture block injection
    const archDataRaw = (project as any).arch_data;
    const archData = archDataRaw ? JSON.parse(archDataRaw) : null;

    const apiKey = getOpenAIApiKey();
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY env var or configure in settings.' });
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

    // Fast-path: short imperative messages always mean "generate" — skip expensive classifier
    const trimmed = message.trim().toLowerCase();
    const isObviousGenerate = (
      (trimmed.length <= 20 && !trimmed.includes('?') &&
        /產生|生成|做出|幫我做|開始|go|generate|ui|prototype|原型|設計|做個|頁面|介面/.test(trimmed))
      ||
      // Fix/correction requests: describe a problem and implicitly ask to fix it
      // Also catch "嗎" ending complaints about missing UI elements
      (/空白太|空白超|太大|太小|不對|沒有依照|沒依照|缺少|重新生成|請重新|重做|修改|修正|調整|改掉|有問題|不正確|看起來不|樣式不|版面|排版|沒有正確|沒有運作|不能點|點擊沒|連結沒|沒有做出|做出來|沒有生成|為什麼沒有做|為何沒有|沒有子頁面|沒有頁面|子頁面|顏色不對|色調不對|色調錯誤|顏色錯誤|不像設計稿|沒有照設計稿|沒有按照設計稿/.test(trimmed))
    );

    // Classify intent (four-way)
    const intent = isObviousGenerate
      ? (hasShell ? 'in-shell' : 'full-page')
      : await classifyIntent(message.trim(), apiKey, hasShell);

    // Load conversation history (last 20 messages)
    const history = db.prepare(
      'SELECT role, content FROM conversations WHERE project_id = ? ORDER BY created_at ASC LIMIT 20'
    ).all(projectId) as { role: string; content: string }[];

    // Build user message, prepending file content if fileIds provided
    let userContent = message.trim();
    if (Array.isArray(fileIds) && fileIds.length > 0) {
      const placeholders = fileIds.map(() => '?').join(',');
      const files = db.prepare(
        `SELECT original_name, extracted_text FROM uploaded_files WHERE id IN (${placeholders}) AND project_id = ?`
      ).all(...fileIds, projectId) as { original_name: string; extracted_text: string | null }[];

      if (files.length > 0) {
        const fileParts = files.map(f =>
          `--- ${f.original_name} ---\n${f.extracted_text || '[No text extracted]'}\n--- end ---`
        ).join('\n');
        userContent = `[Attached files]\n${fileParts}\n\n${userContent}`;
      }
    } else {
      // Auto-inject project uploaded files even if not explicitly attached
      // Deduplicate by file_size — same PDF uploaded multiple times has same size
      const projectFiles = db.prepare(
        `SELECT original_name, extracted_text, file_size FROM uploaded_files
         WHERE project_id = ? AND extracted_text IS NOT NULL AND LENGTH(extracted_text) > 100
         ORDER BY created_at DESC`
      ).all(projectId) as { original_name: string; extracted_text: string; file_size: number }[];
      const seenSizes = new Set<number>();
      const uniqueFiles = projectFiles.filter(f => {
        if (seenSizes.has(f.file_size)) return false;
        seenSizes.add(f.file_size);
        return true;
      }).slice(0, 1); // Only most recent unique file — prevents old uploads from overriding new intent
      if (uniqueFiles.length > 0) {
        const fileParts = uniqueFiles.map(f => {
          // Fix Latin-1 encoded filenames from older uploads
          let name = f.original_name;
          try { const fixed = Buffer.from(name, 'latin1').toString('utf8'); if (/[\u4e00-\u9fff]/.test(fixed)) name = fixed; } catch { /* keep original */ }
          return `--- ${name} ---\n${f.extracted_text.slice(0, 4000)}\n--- end ---`;
        }).join('\n');
        userContent = `[Project design specs (auto-loaded from uploaded files)]\n${fileParts}\n\n${userContent}`;
      }
    }

    let fullResponse = '';

    if (intent === 'question') {
      // Q&A path
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: qaSystemPrompt },
        ...history.map(h => ({
          role: h.role as 'user' | 'assistant',
          content: h.content,
        })),
        { role: 'user', content: userContent },
      ];

      const openai = new OpenAI({ apiKey });

      try {
        const stream = await callOpenAIWithRetry(openai, messages, 3, 'gpt-4o-mini');
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
      } catch (err: any) {
        console.error('OpenAI API error:', err);
        res.write(`data: ${JSON.stringify({ error: formatOpenAIError(err) })}\n\n`);
        res.end();
        return;
      }

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
        const apiKey2 = getOpenAIApiKey();
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
    let specRowsEarly: { original_name: string; visual_analysis: string; component_label: string | null; file_size: number }[];
    if (Array.isArray(fileIds) && fileIds.length > 0) {
      const placeholders = fileIds.map(() => '?').join(',');
      specRowsEarly = db.prepare(
        `SELECT original_name, visual_analysis, component_label, file_size FROM uploaded_files
         WHERE id IN (${placeholders}) AND project_id = ? AND visual_analysis IS NOT NULL`
      ).all(...fileIds, projectId) as { original_name: string; visual_analysis: string; component_label: string | null; file_size: number }[];
    } else {
      // Auto: only the single most recently uploaded file with visual analysis
      // Skip if arch_data has per-page refs — those are already injected via architectureBlock
      const archHasPerPageRefs = archData?.type === 'page' && !archData.aiDecidePages &&
        archData.nodes?.some((n: any) => n.referenceFileId);
      if (archHasPerPageRefs) {
        specRowsEarly = [];
      } else {
        // Exclude architecture reference uploads (page_name = '__arch__') — those are used in architectureBlock
        specRowsEarly = db.prepare(
          `SELECT original_name, visual_analysis, component_label, file_size FROM uploaded_files
           WHERE project_id = ? AND visual_analysis IS NOT NULL AND (page_name IS NULL OR page_name != '__arch__')
           ORDER BY created_at DESC LIMIT 1`
        ).all(projectId) as { original_name: string; visual_analysis: string; component_label: string | null; file_size: number }[];
      }
    }

    let designSpecPrefix = '';
    if (specRowsEarly.length > 0) {
      designSpecPrefix = '╔══════════════════════════════════════════════════════╗\n';
      designSpecPrefix += '║  DESIGN SPEC — THIS OVERRIDES ALL DEFAULTS BELOW    ║\n';
      designSpecPrefix += '╚══════════════════════════════════════════════════════╝\n';
      designSpecPrefix += 'Uploaded design spec files have been analyzed. You MUST follow the LAYOUT, component structure, and spacing from these specs.\n';
      designSpecPrefix += 'NOTE: Brand colors (purple #8E6FA7) from the HousePrice Color Convention override spec colors — use the spec for structure/layout, not colors.\n\n';
      for (const row of specRowsEarly) {
        let name = row.original_name;
        try { const fixed = Buffer.from(name, 'latin1').toString('utf8'); if (/[\u4e00-\u9fff]/.test(fixed)) name = fixed; } catch { /* keep */ }
        const analysis = row.visual_analysis.length > 3000 ? row.visual_analysis.slice(0, 3000) + '…' : row.visual_analysis;
        designSpecPrefix += `--- Spec: ${name}${row.component_label ? ` [${row.component_label}]` : ''} ---\n${analysis}\n\n`;
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
            architectureBlock += `\nPage navigation requirements (MUST implement exactly — do NOT invent links not listed here):\n`;
            for (const [pageName, targets] of Object.entries(outgoingEdges)) {
              architectureBlock += `- Page "${pageName}": clickable elements (cards, buttons, links) MUST call showPage('${targets[0]}')${targets.length > 1 ? ` or showPage('${targets.slice(1).join("' / showPage('")}')` : ''} as appropriate\n`;
            }
            architectureBlock += `Pages with NO outgoing edges should have a back/home button that returns to the first page.\n`;
          }

          // Per-page design specs
          const perPageSpecs: string[] = [];
          for (const node of archData.nodes) {
            if (node.referenceFileId) {
              const fileRow = db.prepare('SELECT visual_analysis FROM uploaded_files WHERE id = ?').get(node.referenceFileId) as any;
              if (fileRow?.visual_analysis) {
                const viewportLabel = node.viewport ? ` [${node.viewport === 'mobile' ? '手機版' : '電腦版'}]` : '';
                const mobileHint = node.viewport === 'mobile' ? ' MOBILE LAYOUT — must be single column, touch-friendly, max-width 480px' : node.viewport === 'desktop' ? ' DESKTOP LAYOUT' : '';
                perPageSpecs.push(`  [${node.name}]${viewportLabel}${mobileHint} <<< DESIGN SPEC FOR ${node.name} — implement exactly this layout >>>\n${fileRow.visual_analysis.slice(0, 4000)}\n  <<< END DESIGN SPEC FOR ${node.name} >>>`);
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

    // Inject project design convention (DB first, fallback to file)
    const globalRowForConvention = db.prepare("SELECT design_convention FROM global_design_profile WHERE id = 'global'").get() as any;
    let designConvention = globalRowForConvention?.design_convention || '';
    if (!designConvention) {
      const colorConventionPath = path.resolve(__dirname, '../../../../docs/colorConvention.md');
      if (fs.existsSync(colorConventionPath)) {
        designConvention = fs.readFileSync(colorConventionPath, 'utf-8');
      }
    }
    if (designConvention) {
      effectiveSystemPrompt += `\n\n=== PROJECT DESIGN SYSTEM (HousePrice Color Convention) ===\n${designConvention.slice(0, 4000)}\n====================================`;
    }

    // Fetch global design
    const globalRow = db.prepare("SELECT * FROM global_design_profile WHERE id = 'global'").get() as any;

    // Fetch project design
    const designRow = db.prepare('SELECT * FROM design_profiles WHERE project_id = ?').get(projectId) as any;
    const inheritGlobal = designRow ? designRow.inherit_global !== 0 : true;
    const supplement = designRow?.supplement || '';

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

    // Design spec analysis reminder (already injected at top — this just reinforces at end)
    if (specRowsEarly.length > 0) {
      effectiveSystemPrompt += '\n\n[REMINDER: Design spec was injected at the top. Follow the spec LAYOUT and component patterns. Use HousePrice purple #8E6FA7 as primary color, not spec colors.]';
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

    if (archData && archData.type === 'page' && !archData.aiDecidePages && archData.nodes.length > 0) {
      // Use architecture data — skip AI page detection
      finalPages = archData.nodes.map((n: any) => n.name);
      isMultiPage = finalPages.length > 1;
    } else {
      // Existing logic — pass full userContent (includes injected PDF spec text) so the
      // analyzer can detect pages described in uploaded design specs, not just the user's message
      const pageStructure = (intent === 'full-page' || intent === 'in-shell')
        ? await analyzePageStructure(userContent.slice(0, 8000), apiKey)
        : { multiPage: false, pages: [] as string[] };

      // Use existing pages if regenerating; new pages if fresh multi-page request
      finalPages = existingPages.length > 1 ? existingPages : pageStructure.pages;
      isMultiPage = finalPages.length > 1;
    }

    if (isMultiPage) {
      const pageList = finalPages.map(p => `- "${p}"`).join('\n');
      effectiveSystemPrompt += `\n\n=== MULTI-PAGE STRUCTURE ===
Pages to generate (ALL must have complete, content-rich HTML — zero placeholders):
${pageList}

Navigation rules:
1. Define a global JS function: function showPage(name) { document.querySelectorAll('.page').forEach(p=>p.style.display='none'); document.getElementById('page-'+name)?.style.setProperty('display','block'); document.querySelectorAll('[data-nav]').forEach(l=>l.classList.toggle('active',l.dataset.nav===name)); }
2. Each page div: <div class="page" id="page-[name]" data-page="[name]"> — first page has style="display:block", rest style="display:none"
3. Each nav link: <a href="#" data-nav="[name]" onclick="showPage('[name]');return false;">[name]</a>
4. REQUIRED: Follow the architecture navigation requirements above EXACTLY — each page's clickable elements must call showPage() to navigate to the target page defined in the architecture edges. Do NOT invent navigation paths not specified in the architecture.
5. Call showPage on init: document.addEventListener('DOMContentLoaded', function(){ showPage('${finalPages[0]}'); });

CRITICAL: Every page must have FULL content — no placeholder text, no empty divs, no "此處將顯示..." comments.
============================`;
    }

    // Build messages for generation
    // Strip HTML from assistant history to avoid token explosion
    const trimmedHistory = history.slice(-10).map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.role === 'assistant' && h.content.trim().startsWith('<')
        ? '[前一次生成的原型 HTML — 已省略以節省 tokens]'
        : h.content.length > 800 ? h.content.slice(0, 800) + '…' : h.content,
    }));

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: effectiveSystemPrompt },
      ...trimmedHistory,
      { role: 'user', content: userContent },
    ];

    const openai = new OpenAI({ apiKey });

    try {
      const stream = await callOpenAIWithRetry(openai, messages);
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
    } catch (err: any) {
      console.error('OpenAI API error:', err);
      res.write(`data: ${JSON.stringify({ error: formatOpenAIError(err) })}\n\n`);
      res.end();
      return;
    }

    // Save user message
    const userMsgId = uuidv4();
    db.prepare(
      'INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)'
    ).run(userMsgId, projectId, 'user', userContent, 'user');

    // Determine message_type label based on intent
    const generateMessageType = intent === 'component' ? 'component' : intent === 'in-shell' ? 'in-shell' : 'generate';

    // Save assistant response
    const assistantMsgId = uuidv4();
    db.prepare(
      'INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)'
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
      html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>body{display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:32px 24px;background:#f8fafc;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}</style></head><body>${rawAiOutput}</body></html>`;
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

      res.write(`data: ${JSON.stringify({ done: true, html, messageType: generateMessageType, intent, isMultiPage, pages: finalPages })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ done: true, html: null, messageType: generateMessageType, intent })}\n\n`);
    }

    res.end();
  } catch (err: any) {
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
    ).all(req.params.id);

    return res.json(conversations);
  } catch (err: any) {
    console.error('Error getting conversations:', err);
    return res.status(500).json({ error: 'Failed to get conversations' });
  }
});

export default router;
