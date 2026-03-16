import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import db from '../db/connection';

const router = Router();

const systemPrompt = fs.readFileSync(
  path.resolve(__dirname, '../prompts/system.txt'),
  'utf-8'
);

function getOpenAIApiKey(): string | null {
  // Check env var first, then settings table
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get() as any;
  return setting?.value || null;
}

async function callOpenAIWithRetry(
  openai: OpenAI,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxAttempts = 3
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        stream: true,
      });
      return stream;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s
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
    const { message } = req.body;

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

    // Load conversation history (last 20 messages)
    const history = db.prepare(
      'SELECT role, content FROM conversations WHERE project_id = ? ORDER BY created_at ASC LIMIT 20'
    ).all(projectId) as { role: string; content: string }[];

    // Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: message.trim() },
    ];

    const openai = new OpenAI({ apiKey });

    let fullResponse = '';

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
      'INSERT INTO conversations (id, project_id, role, content) VALUES (?, ?, ?, ?)'
    ).run(userMsgId, projectId, 'user', message.trim());

    // Save assistant response
    const assistantMsgId = uuidv4();
    db.prepare(
      'INSERT INTO conversations (id, project_id, role, content) VALUES (?, ?, ?, ?)'
    ).run(assistantMsgId, projectId, 'assistant', fullResponse);

    // Extract HTML — the response IS the HTML
    const html = fullResponse.trim();

    // Only create prototype version if response looks like HTML
    if (html.toLowerCase().includes('<!doctype html') || html.toLowerCase().includes('<html')) {
      // Get current max version
      const maxVersion = db.prepare(
        'SELECT MAX(version) as maxV FROM prototype_versions WHERE project_id = ?'
      ).get(projectId) as any;
      const newVersion = (maxVersion?.maxV || 0) + 1;

      // Set all existing versions to not current
      db.prepare(
        'UPDATE prototype_versions SET is_current = 0 WHERE project_id = ?'
      ).run(projectId);

      // Insert new version
      const versionId = uuidv4();
      db.prepare(
        'INSERT INTO prototype_versions (id, project_id, conversation_id, html, version, is_current) VALUES (?, ?, ?, ?, ?, 1)'
      ).run(versionId, projectId, assistantMsgId, html, newVersion);

      // Update project's updated_at
      db.prepare(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?"
      ).run(projectId);

      // Send done event with html
      res.write(`data: ${JSON.stringify({ done: true, html })}\n\n`);
    } else {
      // Response wasn't HTML, just signal done
      res.write(`data: ${JSON.stringify({ done: true, html: null })}\n\n`);
    }

    res.end();
  } catch (err: any) {
    console.error('Chat error:', err);
    // If headers already sent, write SSE error
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
