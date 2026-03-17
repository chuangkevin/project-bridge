import { Router, Request, Response } from 'express';
import db from '../db/connection';
import { extractComponent, replaceComponent } from '../services/componentExtractor';

const router = Router();

// PATCH /api/projects/:id/prototype/styles — upsert tweaker style tag into current prototype version
router.patch('/:id/prototype/styles', (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const { css } = req.body;

    if (typeof css !== 'string') {
      return res.status(400).json({ error: 'css string is required' });
    }

    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const version = db.prepare(
      'SELECT id, html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
    ).get(projectId) as { id: string; html: string } | undefined;

    if (!version) {
      return res.status(404).json({ error: 'No prototype version found' });
    }

    // Upsert <style id="__tweaker__"> before </body>
    const styleTag = `<style id="__tweaker__">\n${css}\n</style>`;
    let updatedHtml = version.html;

    const tweakerRe = /<style\s+id="__tweaker__">[\s\S]*?<\/style>/i;
    if (tweakerRe.test(updatedHtml)) {
      updatedHtml = updatedHtml.replace(tweakerRe, styleTag);
    } else if (/<\/body>/i.test(updatedHtml)) {
      updatedHtml = updatedHtml.replace(/<\/body>/i, `${styleTag}\n</body>`);
    } else {
      updatedHtml += `\n${styleTag}`;
    }

    db.prepare('UPDATE prototype_versions SET html = ? WHERE id = ?').run(updatedHtml, version.id);
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error saving styles:', err);
    return res.status(500).json({ error: 'Failed to save styles' });
  }
});

// POST /:id/prototype/regenerate-component — regenerate a single component by bridge-id
router.post('/:id/prototype/regenerate-component', async (req: Request, res: Response) => {
  const projectId = req.params.id;
  const { bridgeId, instruction } = req.body;

  if (!bridgeId || typeof bridgeId !== 'string' || !instruction || typeof instruction !== 'string') {
    return res.status(400).json({ error: 'bridgeId and instruction are required' });
  }

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const version = db.prepare(
    'SELECT id, html, version FROM prototype_versions WHERE project_id = ? AND is_current = 1'
  ).get(projectId) as { id: string; html: string; version: number } | undefined;
  if (!version) return res.status(404).json({ error: 'No prototype found' });

  const componentHtml = extractComponent(version.html, bridgeId);
  if (!componentHtml) return res.status(404).json({ error: 'Component not found' });

  // Get API key
  const apiKey = process.env.OPENAI_API_KEY ||
    (db.prepare("SELECT value FROM settings WHERE key = 'openai_api_key'").get() as any)?.value;
  if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured' });

  // Build surrounding context (200 chars before/after)
  const idx = version.html.indexOf(componentHtml);
  const before = version.html.slice(Math.max(0, idx - 200), idx).replace(/<[^>]+>/g, '').trim().slice(-100);
  const after = version.html.slice(idx + componentHtml.length, idx + componentHtml.length + 200).replace(/<[^>]+>/g, '').trim().slice(0, 100);

  // Fetch design spec analysis and design profile
  const specRows = db.prepare(
    'SELECT original_name, visual_analysis FROM uploaded_files WHERE project_id = ? AND visual_analysis IS NOT NULL'
  ).all(projectId) as { original_name: string; visual_analysis: string }[];
  const designRow = db.prepare('SELECT * FROM design_profiles WHERE project_id = ?').get(projectId) as any;

  let systemPrompt = `You are a UI component surgeon. You will be given an existing HTML component and an instruction to modify it.

RULES:
- Return ONLY the updated component HTML. Nothing else.
- Keep the same root element tag.
- Preserve the data-bridge-id="${bridgeId}" attribute on the root element.
- Do NOT return DOCTYPE, html, head, body, or any wrapper elements.
- Apply the instruction precisely. Keep unchanged parts as-is.
- Surrounding text context (for reference only): before="...${before}..." after="...${after}..."`;

  if (specRows.length > 0) {
    systemPrompt += '\n\n=== DESIGN SPEC (follow these component patterns) ===\n';
    for (const row of specRows) {
      systemPrompt += `--- ${row.original_name} ---\n${row.visual_analysis}\n`;
    }
    systemPrompt += '===================================================';
  }

  if (designRow) {
    let tokens: any = {};
    try { tokens = JSON.parse(designRow.tokens || '{}'); } catch {}
    if (designRow.description || tokens.primaryColor) {
      systemPrompt += '\n\n=== DESIGN PROFILE ===';
      if (designRow.description) systemPrompt += `\nDirection: ${designRow.description}`;
      if (tokens.primaryColor) systemPrompt += `\nPrimary Color: ${tokens.primaryColor}`;
      if (tokens.secondaryColor) systemPrompt += `\nSecondary Color: ${tokens.secondaryColor}`;
      systemPrompt += '\n======================';
    }
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey });

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Instruction: ${instruction}\n\nExisting component HTML:\n${componentHtml}` },
      ],
    });

    let newComponentHtml = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        newComponentHtml += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Strip markdown fences if AI wrapped in code block
    newComponentHtml = newComponentHtml.trim();
    const fenceMatch = newComponentHtml.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fenceMatch) newComponentHtml = fenceMatch[1].trim();

    // Replace in full HTML and save new version
    const updatedHtml = replaceComponent(version.html, bridgeId, newComponentHtml);
    const newVersion = version.version + 1;
    const { v4: uuidv4 } = await import('uuid');
    db.prepare('UPDATE prototype_versions SET is_current = 0 WHERE project_id = ?').run(projectId);
    db.prepare(
      'INSERT INTO prototype_versions (id, project_id, html, version, is_current) VALUES (?, ?, ?, ?, 1)'
    ).run(uuidv4(), projectId, updatedHtml, newVersion);
    db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);

    res.write(`data: ${JSON.stringify({ done: true, html: newComponentHtml, bridgeId })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error('Component regeneration error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Regeneration failed' })}\n\n`);
    res.end();
  }
});

export default router;
