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
  const apiKey = process.env.GEMINI_API_KEY ||
    (db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any)?.value;
  if (!apiKey) return res.status(400).json({ error: 'Gemini API key not configured' });

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
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
      generationConfig: { maxOutputTokens: 4096 },
    });
    const result = await model.generateContentStream(`Instruction: ${instruction}\n\nExisting component HTML:\n${componentHtml}`);
    let newComponentHtml = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        newComponentHtml += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
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

// GET /:id/prototype/tokens — extract CSS custom property tokens from current prototype
router.get('/:id/prototype/tokens', (req: Request, res: Response) => {
  const projectId = req.params.id;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const version = db.prepare(
    'SELECT html FROM prototype_versions WHERE project_id = ? AND is_current = 1'
  ).get(projectId) as { html: string } | undefined;

  if (!version) {
    return res.json({ tokens: [] });
  }

  // Extract all <style> tag contents
  const styleContents: string[] = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRe.exec(version.html)) !== null) {
    styleContents.push(styleMatch[1]);
  }

  const combined = styleContents.join('\n');

  // Extract CSS custom property definitions: --name: value
  const tokenRe = /(--[\w-]+)\s*:\s*([^;}{]+)/g;
  const seen = new Set<string>();
  const tokens: { name: string; value: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(combined)) !== null) {
    const name = m[1].trim();
    const value = m[2].trim();
    if (!seen.has(name)) {
      seen.add(name);
      tokens.push({ name, value });
    }
  }

  return res.json({ tokens });
});

// GET /:id/prototype — return current prototype HTML and extracted page list
router.get('/:id/prototype', (req: Request, res: Response) => {
  const projectId = req.params.id;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const version = db.prepare(
    'SELECT html, is_multi_page FROM prototype_versions WHERE project_id = ? AND is_current = 1'
  ).get(projectId) as { html: string; is_multi_page: number } | undefined;

  if (!version) return res.status(404).json({ error: 'No prototype found' });

  const pages: string[] = [];
  const pageRe = /data-page="([^"]+)"/g;
  let mp: RegExpExecArray | null;
  while ((mp = pageRe.exec(version.html)) !== null) {
    if (!pages.includes(mp[1])) pages.push(mp[1]);
  }

  return res.json({
    html: version.html,
    isMultiPage: !!version.is_multi_page,
    pages,
  });
});

// GET /:id/prototype/versions — list all versions
router.get('/:id/prototype/versions', (req: Request, res: Response) => {
  const projectId = req.params.id;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const versions = db.prepare(
    'SELECT id, version, is_current, is_multi_page, created_at, substr(html, 1, 500) as preview FROM prototype_versions WHERE project_id = ? ORDER BY version DESC'
  ).all(projectId) as { id: string; version: number; is_current: number; is_multi_page: number; created_at: string; preview: string }[];

  return res.json({ versions });
});

// GET /:id/prototype/versions/:versionA/diff/:versionB — line-count diff between two versions
router.get('/:id/prototype/versions/:versionA/diff/:versionB', (req: Request, res: Response) => {
  const { id: projectId, versionA, versionB } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const rowA = db.prepare(
    'SELECT html FROM prototype_versions WHERE project_id = ? AND version = ?'
  ).get(projectId, parseInt(versionA as string)) as { html: string } | undefined;
  if (!rowA) return res.status(404).json({ error: `Version ${versionA} not found` });

  const rowB = db.prepare(
    'SELECT html FROM prototype_versions WHERE project_id = ? AND version = ?'
  ).get(projectId, parseInt(versionB as string)) as { html: string } | undefined;
  if (!rowB) return res.status(404).json({ error: `Version ${versionB} not found` });

  const linesA = new Set(rowA.html.split('\n'));
  const linesB = new Set(rowB.html.split('\n'));

  let addedLines = 0;
  for (const line of linesB) { if (!linesA.has(line)) addedLines++; }
  let removedLines = 0;
  for (const line of linesA) { if (!linesB.has(line)) removedLines++; }

  const changed = addedLines + removedLines;
  return res.json({
    versionA: parseInt(versionA as string),
    versionB: parseInt(versionB as string),
    addedLines,
    removedLines,
    diffSummary: `Changed ${changed} lines`,
  });
});

// GET /:id/prototype/versions/:version/html — serve a specific version's full HTML
router.get('/:id/prototype/versions/:version/html', (req: Request, res: Response) => {
  const { id: projectId, version } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).send('Project not found');

  const row = db.prepare(
    'SELECT html FROM prototype_versions WHERE project_id = ? AND version = ?'
  ).get(projectId, parseInt(version as string)) as { html: string } | undefined;
  if (!row) return res.status(404).send('Version not found');

  res.setHeader('Content-Type', 'text/html');
  return res.send(row.html);
});

// POST /:id/prototype/versions/:version/restore — restore a version
router.post('/:id/prototype/versions/:version/restore', (req: Request, res: Response) => {
  const { id: projectId, version } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const target = db.prepare(
    'SELECT * FROM prototype_versions WHERE project_id = ? AND version = ?'
  ).get(projectId, parseInt(version as string)) as any;
  if (!target) return res.status(404).json({ error: 'Version not found' });

  db.prepare('UPDATE prototype_versions SET is_current = 0 WHERE project_id = ?').run(projectId);
  db.prepare('UPDATE prototype_versions SET is_current = 1 WHERE id = ?').run(target.id);
  db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);

  return res.json({
    version: target.version,
    html: target.html,
    isMultiPage: !!target.is_multi_page,
    pages: JSON.parse(target.pages || '[]'),
  });
});

export default router;
