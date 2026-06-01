import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { requireAuth } from '../middleware/auth.js';
import { getProject } from '../services/projectService.js';
import { initSkillRegistry, listSkills, readSkill, addProjectSkill } from '../services/skillRegistry.js';

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function composeMd(input: { name: string; description: string; body: string; metadata?: Record<string, unknown> }): string {
  const lines = [`name: ${input.name}`, `description: ${input.description}`];
  if (input.metadata) lines.push(`metadata: ${JSON.stringify(input.metadata)}`);
  return `---\n${lines.join('\n')}\n---\n${input.body}`;
}

export interface SkillRoutesDeps {
  db: Database.Database;
  globalDir: string;
  builtinDir: string;
  pluginsDir: string;
}

export function buildSkillsRouter(deps: SkillRoutesDeps): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/', (req: Request, res: Response) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    if (projectId) {
      const p = getProject(deps.db, projectId);
      if (!p || p.ownerId !== req.user!.id) { fail(res, 404, 'NOT_FOUND', '專案不存在'); return; }
    }
    const skills = listSkills({ projectId });
    res.json({ skills: skills.map(s => ({ name: s.name, description: s.description, layer: s.layer, metadata: s.metadata })) });
  });

  // global CRUD — must be declared BEFORE /:name so Express matches /global before /:name
  r.post('/global', (req: Request, res: Response) => {
    const { name, description, body, metadata } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 name'); return; }
    if (typeof description !== 'string' || !description.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 description'); return; }
    if (typeof body !== 'string') { fail(res, 400, 'VALIDATION_FAILED', '需要 body'); return; }
    mkdirSync(deps.globalDir, { recursive: true });
    writeFileSync(join(deps.globalDir, `${name}.md`), composeMd({ name, description, body, metadata }));
    initSkillRegistry({ db: deps.db, builtinDir: deps.builtinDir, globalDir: deps.globalDir, pluginsDir: deps.pluginsDir });
    res.status(201).json({ ok: true, name });
  });

  r.put('/global/:name', (req: Request, res: Response) => {
    const { description, body, metadata } = req.body ?? {};
    const name = req.params.name as string;
    if (typeof description !== 'string' || !description.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 description'); return; }
    if (typeof body !== 'string') { fail(res, 400, 'VALIDATION_FAILED', '需要 body'); return; }
    mkdirSync(deps.globalDir, { recursive: true });
    writeFileSync(join(deps.globalDir, `${name}.md`), composeMd({ name, description, body, metadata }));
    initSkillRegistry({ db: deps.db, builtinDir: deps.builtinDir, globalDir: deps.globalDir, pluginsDir: deps.pluginsDir });
    res.json({ ok: true });
  });

  r.delete('/global/:name', (req: Request, res: Response) => {
    const name = req.params.name as string;
    try { unlinkSync(join(deps.globalDir, `${name}.md`)); } catch { /* ignore */ }
    initSkillRegistry({ db: deps.db, builtinDir: deps.builtinDir, globalDir: deps.globalDir, pluginsDir: deps.pluginsDir });
    res.json({ ok: true });
  });

  r.get('/:name', (req: Request, res: Response) => {
    const skill = readSkill(req.params.name as string);
    if (!skill) { fail(res, 404, 'SKILL_NOT_FOUND', 'skill 不存在'); return; }
    res.json(skill);
  });

  return r;
}

export function buildProjectSkillsRouter(deps: SkillRoutesDeps): Router {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);

  r.post('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const p = getProject(deps.db, projectId);
    if (!p || p.ownerId !== req.user!.id) { fail(res, 404, 'NOT_FOUND', '專案不存在'); return; }
    const { name, description, body, metadata } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 name'); return; }
    if (typeof description !== 'string' || !description.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 description'); return; }
    if (typeof body !== 'string') { fail(res, 400, 'VALIDATION_FAILED', '需要 body'); return; }
    addProjectSkill(deps.db, projectId, { name, description, body, metadata });
    res.status(201).json({ ok: true, name });
  });

  r.put('/:name', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const p = getProject(deps.db, projectId);
    if (!p || p.ownerId !== req.user!.id) { fail(res, 404, 'NOT_FOUND', '專案不存在'); return; }
    const { description, body, metadata } = req.body ?? {};
    const name = req.params.name as string;
    if (typeof description !== 'string' || !description.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 description'); return; }
    if (typeof body !== 'string') { fail(res, 400, 'VALIDATION_FAILED', '需要 body'); return; }
    addProjectSkill(deps.db, projectId, { name, description, body, metadata });
    res.json({ ok: true });
  });

  r.delete('/:name', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const p = getProject(deps.db, projectId);
    if (!p || p.ownerId !== req.user!.id) { fail(res, 404, 'NOT_FOUND', '專案不存在'); return; }
    deps.db.prepare('DELETE FROM project_skills WHERE project_id = ? AND name = ?').run(projectId, req.params.name as string);
    res.json({ ok: true });
  });

  return r;
}
