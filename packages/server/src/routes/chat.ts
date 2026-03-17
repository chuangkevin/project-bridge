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
      (!trimmed.includes('?') &&
        /空白太|空白超|太大|太小|不對|沒有依照|沒依照|缺少|重新生成|請重新|重做|修改|修正|調整|改掉|有問題|不正確|看起來不|樣式不|版面|排版/.test(trimmed))
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
        res.write(`data: ${JSON.stringify({ error: err.message || 'OpenAI API error' })}\n\n`);
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
    // Build effective system prompt with composed design injection
    let effectiveSystemPrompt = systemPrompt;

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
        if (hasGlobalAnalysis) globalBlock += `Visual Reference Analysis:\n${globalRow.reference_analysis}\n`;
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
        if (hasReferenceAnalysis) profileBlock += `Visual Reference Analysis:\n${designRow.reference_analysis}\n`;
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

    // Design spec analysis injection (from uploaded files with visual analysis)
    const specAnalysisRows = db.prepare(
      'SELECT original_name, visual_analysis, component_label FROM uploaded_files WHERE project_id = ? AND visual_analysis IS NOT NULL'
    ).all(projectId) as { original_name: string; visual_analysis: string; component_label: string | null }[];
    if (specAnalysisRows.length > 0) {
      let specBlock = '\n\n=== DESIGN SPEC ANALYSIS ===\n';
      specBlock += 'The following component specifications were extracted from uploaded design spec files.\n';
      specBlock += 'You MUST follow these component patterns precisely when generating UI:\n\n';
      for (const row of specAnalysisRows) {
        specBlock += `--- From: ${row.original_name}${row.component_label ? ` [${row.component_label}]` : ''} ---\n${row.visual_analysis}\n\n`;
      }
      specBlock += 'CRITICAL: Use the exact colors, card layouts, search bar styles, tag designs, and spacing patterns described above.\n';
      specBlock += '============================';
      effectiveSystemPrompt += specBlock;
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

    // Multi-page detection (only relevant for full-page intent)
    const pageStructure = (intent === 'full-page' || intent === 'in-shell')
      ? await analyzePageStructure(message.trim(), apiKey)
      : { multiPage: false, pages: [] as string[] };
    if (pageStructure.multiPage && pageStructure.pages.length > 1) {
      const pageList = pageStructure.pages.map(p => `- "${p}"`).join('\n');
      effectiveSystemPrompt += `\n\n=== MULTI-PAGE STRUCTURE ===\nGenerate a multi-page prototype with ALL of these pages:\n${pageList}\n\nRequirements:\n- Use a navigation element (sidebar or top nav) that is always visible\n- Each page as: <div class="page" data-page="{page-name}"> (first page visible, others hidden with display:none)\n- Include JavaScript to show/hide pages when nav links are clicked\n- Highlight the active nav item\n- All pages must follow the same design style\n============================`;
    }

    // Build messages for generation
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: effectiveSystemPrompt },
      ...history.map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
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
      res.write(`data: ${JSON.stringify({ error: err.message || 'OpenAI API error' })}\n\n`);
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
        pageStructure.multiPage ? 1 : 0,
        JSON.stringify(pageStructure.pages)
      );

      db.prepare(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?"
      ).run(projectId);

      res.write(`data: ${JSON.stringify({ done: true, html, messageType: generateMessageType, intent, isMultiPage: pageStructure.multiPage, pages: pageStructure.pages })}\n\n`);
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
