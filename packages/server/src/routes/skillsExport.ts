import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { requireAuth } from '../middleware/auth.js';
import { initSkillRegistry } from '../services/skillRegistry.js';

export interface SkillsExportDeps {
  db: Database.Database;
  globalDir: string;
  builtinDir: string;
  pluginsDir: string;
}

const NAME_REGEX = /^[a-z0-9_-]{1,64}$/;

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function composeMarkdown(name: string, description: string, body: string, metadata?: Record<string, unknown>): string {
  const fmLines = [`name: ${name}`, `description: ${description}`];
  if (metadata) fmLines.push(`metadata: ${JSON.stringify(metadata)}`);
  return `---\n${fmLines.join('\n')}\n---\n${body ?? ''}`;
}

export function buildSkillsExportRouter(deps: SkillsExportDeps): Router {
  const r = Router();
  r.use(requireAuth);

  // GET /api/skills/global/export — return all global skills as JSON for download
  r.get('/global/export', (_req: Request, res: Response) => {
    if (!existsSync(deps.globalDir)) {
      res.json({ skills: [], exportedAt: new Date().toISOString() });
      return;
    }
    const files = readdirSync(deps.globalDir).filter(f => f.endsWith('.md'));
    const skills = files.map(filename => {
      const raw = readFileSync(join(deps.globalDir, filename), 'utf8');
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, unknown>;
      return {
        filename,
        name: typeof fm.name === 'string' ? fm.name : filename.replace(/\.md$/, ''),
        description: typeof fm.description === 'string' ? fm.description : '',
        metadata: fm.metadata && typeof fm.metadata === 'object' ? fm.metadata : undefined,
        body: parsed.content,
      };
    });
    res.json({ skills, exportedAt: new Date().toISOString() });
  });

  // POST /api/skills/global/batch — upsert N global skills at once
  // body: { skills: [{ name, description?, body, metadata? }, ...] }
  r.post('/global/batch', (req: Request, res: Response) => {
    const { skills } = (req.body ?? {}) as { skills?: Array<{ name?: unknown; description?: unknown; body?: unknown; metadata?: unknown }> };
    if (!Array.isArray(skills)) {
      fail(res, 400, 'VALIDATION_FAILED', '需要 skills 陣列');
      return;
    }
    mkdirSync(deps.globalDir, { recursive: true });
    let added = 0;
    let updated = 0;
    const skippedReasons: Array<{ name: string; reason: string }> = [];
    for (const s of skills) {
      const name = typeof s.name === 'string' ? s.name.trim() : '';
      if (!NAME_REGEX.test(name)) {
        skippedReasons.push({ name: String(s.name ?? ''), reason: 'invalid name (use [a-z0-9_-]{1,64})' });
        continue;
      }
      const description = typeof s.description === 'string' ? s.description : '';
      const body = typeof s.body === 'string' ? s.body : '';
      const metadata = s.metadata && typeof s.metadata === 'object' ? s.metadata as Record<string, unknown> : undefined;
      const path = join(deps.globalDir, `${name}.md`);
      const exists = existsSync(path);
      writeFileSync(path, composeMarkdown(name, description, body, metadata), 'utf8');
      if (exists) updated++; else added++;
    }
    // Refresh the in-memory registry so subsequent GETs see the new files.
    initSkillRegistry({
      db: deps.db,
      builtinDir: deps.builtinDir,
      globalDir: deps.globalDir,
      pluginsDir: deps.pluginsDir,
    });
    res.json({ ok: true, added, updated, skipped: skippedReasons });
  });

  return r;
}
