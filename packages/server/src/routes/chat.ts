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

    // Classify intent
    const intent = await classifyIntent(message.trim(), apiKey);

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

    // Generate path
    // Build effective system prompt
    let effectiveSystemPrompt = systemPrompt;
    const designRow = db.prepare('SELECT * FROM design_profiles WHERE project_id = ?').get(projectId) as any;
    if (designRow) {
      const hasDescription = designRow.description && designRow.description.trim().length > 0;
      const hasReferenceAnalysis = designRow.reference_analysis && designRow.reference_analysis.trim().length > 0;
      let tokens: Record<string, any> = {};
      try { tokens = JSON.parse(designRow.tokens || '{}'); } catch { /* ignore */ }
      const hasTokens = Object.keys(tokens).length > 0;

      if (hasDescription || hasReferenceAnalysis || hasTokens) {
        let profileBlock = '\n\n=== DESIGN PROFILE ===\n';
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
        effectiveSystemPrompt = systemPrompt + profileBlock;
      }
    }

    // Art style injection
    const artStyle = db.prepare('SELECT * FROM art_style_preferences WHERE project_id = ?').get(projectId) as any;
    if (artStyle && artStyle.apply_style && artStyle.detected_style) {
      effectiveSystemPrompt += `\n\n=== ART STYLE ===\nApply this visual art style to your generated UI:\n${artStyle.detected_style}\nNote: If a Design Profile is also active, Design Profile color tokens take precedence over conflicting art style attributes.\n=================`;
    }

    // Multi-page detection
    const pageStructure = await analyzePageStructure(message.trim(), apiKey);
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

    // Save assistant response
    const assistantMsgId = uuidv4();
    db.prepare(
      'INSERT INTO conversations (id, project_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)'
    ).run(assistantMsgId, projectId, 'assistant', fullResponse, 'generate');

    // Extract HTML
    let html = fullResponse.trim();

    // Fix iframe nesting: inject <base target="_blank"> so all links open in new tab
    if (html.toLowerCase().includes('<head>')) {
      html = html.replace(/<head>/i, '<head><base target="_blank">');
    } else if (html.toLowerCase().includes('<head ')) {
      html = html.replace(/(<head[^>]*>)/i, '$1<base target="_blank">');
    }

    // Only create prototype version if response looks like HTML
    if (html.toLowerCase().includes('<!doctype html') || html.toLowerCase().includes('<html')) {
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

      res.write(`data: ${JSON.stringify({ done: true, html, messageType: 'generate', isMultiPage: pageStructure.multiPage, pages: pageStructure.pages })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ done: true, html: null, messageType: 'generate' })}\n\n`);
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
