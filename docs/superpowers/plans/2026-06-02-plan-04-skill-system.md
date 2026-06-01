# Plan 4 — Skill System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Implement the Claude Code-standard skill loading layer: parse frontmatter (`name` + `description` + optional `metadata`), discover skills across 4 layers (built-in, plugin, user-global, project), expose them via `read_skill(name)` and a description-only "available skills" list ready to inject into system prompts. After this plan, a future caller can pass HPSkills (1:1 copy of `D:/Projects/HPSkills/skills/*`) into `data/skills/global/` or a plugin dir and have them surface in `GET /api/skills`.

**Architecture:** A pure `skillParser` (frontmatter + body extraction), a `skillRegistry` singleton initialized at app startup (scans all 4 layers, builds in-memory index + DB-backed project skills), a `read_skill(name)` accessor, REST routes for CRUD on user-global and project skills. Builds the system-prompt-ready description list separately.

**Tech Stack:** `gray-matter` for frontmatter parsing (already commonly used; if unavailable, hand-rolled YAML parse). better-sqlite3, supertest, vitest 3.2.4.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 4 (skill + MCP + plugin).

**Scope boundary (out of plan):** NO MCP (Plan 5). NO plugin.json loader (Plan 5). NO slash command parser (Plan 5). NO skill-driven AI selection (Plan 7). NO marketplace UI (M2).

---

## File Structure

```
packages/server/src/
  services/
    skillParser.ts             ← parses frontmatter + body from a string
    skillRegistry.ts           ← scans 4 layers, indexes by name with precedence, exposes read_skill(name)
    __tests__/
      skillParser.test.ts
      skillRegistry.test.ts
  routes/
    skills.ts                  ← GET / + GET /:name + POST / PUT / DELETE for project + global
    __tests__/
      skills.route.test.ts
  skills/builtin/              ← bundled with the product (M1 starter pack)
    consult-clarify-first.md
    vue-tailwind-basics.md
  packages/server/.gitignore   ← (existing)

packages/server/package.json   ← add gray-matter dependency
```

---

## Task 1: Install gray-matter + skillParser (TDD)

**Files:**
- Modify `packages/server/package.json`
- Create `packages/server/src/services/skillParser.ts`
- Create `packages/server/src/services/__tests__/skillParser.test.ts`

- [ ] **Step 1** — add `gray-matter ^4.0.3` to dependencies in `packages/server/package.json`; `pnpm install`

- [ ] **Step 2** — Failing test:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSkill } from '../skillParser';

describe('parseSkill', () => {
  it('parses name + description + body', () => {
    const md = `---
name: hpsk:price-doc
description: HousePrice 實價登錄 domain
---

# 實價登錄

body content`;
    const r = parseSkill(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.name).toBe('hpsk:price-doc');
    expect(r.skill.description).toBe('HousePrice 實價登錄 domain');
    expect(r.skill.body).toContain('# 實價登錄');
  });

  it('parses metadata as a record', () => {
    const md = `---
name: a
description: b
metadata:
  type: domain-knowledge
  source: HPSkills
---
body`;
    const r = parseSkill(md);
    if (!r.ok) throw new Error('parse failed');
    expect(r.skill.metadata).toEqual({ type: 'domain-knowledge', source: 'HPSkills' });
  });

  it('returns ok:false when name missing', () => {
    const md = `---
description: x
---
body`;
    expect(parseSkill(md).ok).toBe(false);
  });

  it('returns ok:false when description missing', () => {
    const md = `---
name: x
---
body`;
    expect(parseSkill(md).ok).toBe(false);
  });

  it('returns ok:false when no frontmatter', () => {
    expect(parseSkill('just plain markdown').ok).toBe(false);
  });

  it('strips trailing whitespace from body', () => {
    const md = `---
name: a
description: b
---
hi   `;
    const r = parseSkill(md);
    if (!r.ok) throw new Error('parse failed');
    expect(r.skill.body.endsWith('hi')).toBe(true);
  });
});
```

- [ ] **Step 3** — implementation:

```typescript
import matter from 'gray-matter';

export interface SkillFrontmatter {
  name: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface Skill extends SkillFrontmatter {
  body: string;
}

export type ParseResult = { ok: true; skill: Skill } | { ok: false; reason: string };

export function parseSkill(markdown: string): ParseResult {
  try {
    const parsed = matter(markdown);
    if (Object.keys(parsed.data).length === 0) return { ok: false, reason: 'no frontmatter' };
    const fm = parsed.data as Record<string, unknown>;
    const name = typeof fm.name === 'string' ? fm.name.trim() : '';
    const description = typeof fm.description === 'string' ? fm.description.trim() : '';
    if (!name) return { ok: false, reason: 'name required' };
    if (!description) return { ok: false, reason: 'description required' };
    const metadata = fm.metadata && typeof fm.metadata === 'object'
      ? (fm.metadata as Record<string, unknown>)
      : undefined;
    return {
      ok: true,
      skill: { name, description, metadata, body: parsed.content.trim() },
    };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
```

- [ ] **Step 4** — Test passes (6 new tests)

- [ ] **Step 5** — Commit: `feat(server): add skill parser (Claude-Code-standard frontmatter) (Plan 4 Task 1)`

---

## Task 2: `skillRegistry` (4-layer discovery)

**Files:**
- Create `packages/server/src/services/skillRegistry.ts`
- Create `packages/server/src/services/__tests__/skillRegistry.test.ts`
- Create `packages/server/skills/builtin/consult-clarify-first.md` (sample built-in)
- Create `packages/server/skills/builtin/vue-tailwind-basics.md` (sample built-in)
- Modify `packages/server/src/index.ts` (initSkillRegistry on startup)

- [ ] **Step 1** — Create the two built-in starter skills:

`packages/server/skills/builtin/consult-clarify-first.md`:

```markdown
---
name: consult-clarify-first
description: In consult mode, ask 1-3 clarifying questions before proposing any solution. Trigger when user gives a vague or open-ended brief.
metadata:
  type: behavior
  scope: consult
---

# Consult — clarify first

Before generating UI structure or code, confirm:

1. Target user / persona
2. Primary use case (single sentence)
3. Hard constraints (budget, timeline, must-have integrations)

If any answer is unclear, ask. Do not assume.
```

`packages/server/skills/builtin/vue-tailwind-basics.md`:

```markdown
---
name: vue-tailwind-basics
description: When generating Vue 3 SFCs in design mode, use Tailwind utility classes only (no scoped CSS). Use semantic HTML elements.
metadata:
  type: tech-stack
  scope: design
---

# Vue 3 + Tailwind ground rules

- `<template>` only for M1 (no `<script setup>`)
- Tailwind utilities, no `<style>` blocks
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<form>`, etc.
- Inputs always have a `<label>` (or `aria-label`)
```

- [ ] **Step 2** — Failing test:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { initSkillRegistry, listSkills, readSkill, addProjectSkill } from '../skillRegistry';

let baseDir: string;
let builtinDir: string;
let globalDir: string;
let pluginsDir: string;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), 'sr-'));
  builtinDir = join(baseDir, 'builtin');
  globalDir = join(baseDir, 'global');
  pluginsDir = join(baseDir, 'plugins');
  mkdirSync(builtinDir, { recursive: true });
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(pluginsDir, { recursive: true });
  db = openDb(baseDir);
  runMigrations(db, defaultMigrationsDir());
  // built-in skill
  writeFileSync(join(builtinDir, 'b.md'), `---
name: b
description: builtin
---
body-b`);
  // plugin skill
  mkdirSync(join(pluginsDir, 'hpsk', 'skills'), { recursive: true });
  writeFileSync(join(pluginsDir, 'hpsk', 'skills', 'p.md'), `---
name: p
description: plugin
---
body-p`);
  // global
  writeFileSync(join(globalDir, 'g.md'), `---
name: g
description: global
---
body-g`);
});
afterEach(() => { db.close(); rmSync(baseDir, { recursive: true, force: true }); });

describe('skillRegistry', () => {
  it('listSkills returns built-in + plugin + global with layer tag', () => {
    initSkillRegistry({ db, builtinDir, globalDir, pluginsDir });
    const names = listSkills().map(s => s.name).sort();
    expect(names).toEqual(['b', 'g', 'p']);
    const b = listSkills().find(s => s.name === 'b');
    expect(b?.layer).toBe('builtin');
  });

  it('readSkill returns body', () => {
    initSkillRegistry({ db, builtinDir, globalDir, pluginsDir });
    const b = readSkill('b');
    expect(b?.body).toBe('body-b');
  });

  it('precedence: project > global > plugin > built-in', () => {
    // built-in 'b' exists; add a project skill with the same name
    initSkillRegistry({ db, builtinDir, globalDir, pluginsDir });
    addProjectSkill(db, 'proj-1', { name: 'b', description: 'project overrides built-in', body: 'body-overridden' });
    const b = readSkill('b', { projectId: 'proj-1' });
    expect(b?.body).toBe('body-overridden');
    expect(b?.layer).toBe('project');
  });

  it('listSkills with projectId includes project layer', () => {
    initSkillRegistry({ db, builtinDir, globalDir, pluginsDir });
    addProjectSkill(db, 'proj-2', { name: 'project-only', description: 'project skill', body: 'x' });
    const list = listSkills({ projectId: 'proj-2' });
    expect(list.find(s => s.name === 'project-only')?.layer).toBe('project');
  });

  it('reload picks up new global skill on disk', () => {
    initSkillRegistry({ db, builtinDir, globalDir, pluginsDir });
    writeFileSync(join(globalDir, 'g2.md'), `---\nname: g2\ndescription: new\n---\nbody`);
    // reload via re-init
    initSkillRegistry({ db, builtinDir, globalDir, pluginsDir });
    expect(listSkills().map(s => s.name)).toContain('g2');
  });
});
```

(`addProjectSkill` is a small helper the registry can re-export from a tiny `project_skills` helper — or directly query the table. Either is fine; pick whichever simplifies.)

- [ ] **Step 3** — implementation:

```typescript
import type Database from 'better-sqlite3';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import { parseSkill, type Skill } from './skillParser.js';

export type SkillLayer = 'builtin' | 'plugin' | 'global' | 'project';

export interface RegistrySkill extends Skill {
  layer: SkillLayer;
  source: string;            // file path OR project DB row id
}

interface RegistryState {
  byLayer: Record<SkillLayer, Map<string, RegistrySkill>>;
  db: Database.Database;
}

let state: RegistryState | null = null;

export interface InitOpts {
  db: Database.Database;
  builtinDir: string;
  globalDir: string;
  pluginsDir: string;
}

export function initSkillRegistry(opts: InitOpts): void {
  const byLayer: RegistryState['byLayer'] = {
    builtin: new Map(),
    plugin: new Map(),
    global: new Map(),
    project: new Map(),     // hydrated lazily per project query (cached for that lookup only)
  };
  for (const file of mdFiles(opts.builtinDir)) loadFile(file, 'builtin', byLayer.builtin);
  for (const file of mdFiles(opts.globalDir)) loadFile(file, 'global', byLayer.global);
  for (const file of pluginSkillFiles(opts.pluginsDir)) loadFile(file, 'plugin', byLayer.plugin);
  state = { byLayer, db: opts.db };
}

function mdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.md')).map(f => join(dir, f));
}

function pluginSkillFiles(pluginsRoot: string): string[] {
  if (!existsSync(pluginsRoot)) return [];
  const out: string[] = [];
  for (const plugin of readdirSync(pluginsRoot)) {
    const skillsDir = join(pluginsRoot, plugin, 'skills');
    if (!existsSync(skillsDir)) continue;
    for (const f of readdirSync(skillsDir).filter(x => x.endsWith('.md'))) {
      out.push(join(skillsDir, f));
    }
  }
  return out;
}

function loadFile(path: string, layer: SkillLayer, target: Map<string, RegistrySkill>): void {
  try {
    const raw = readFileSync(path, 'utf8');
    const r = parseSkill(raw);
    if (!r.ok) return;
    target.set(r.skill.name, { ...r.skill, layer, source: path });
  } catch {
    // skip unreadable files
  }
}

function loadProjectSkills(db: Database.Database, projectId: string): Map<string, RegistrySkill> {
  const out = new Map<string, RegistrySkill>();
  const rows = db.prepare('SELECT id, name, content FROM project_skills WHERE project_id = ? AND enabled = 1').all(projectId) as Array<{ id: string; name: string; content: string }>;
  for (const row of rows) {
    const r = parseSkill(row.content);
    if (!r.ok) continue;
    out.set(r.skill.name, { ...r.skill, layer: 'project', source: row.id });
  }
  return out;
}

export interface QueryOpts { projectId?: string; }

function ensureInit(): RegistryState {
  if (!state) throw new Error('skillRegistry not initialised');
  return state;
}

export function listSkills(opts: QueryOpts = {}): RegistrySkill[] {
  const s = ensureInit();
  const merged = new Map<string, RegistrySkill>();
  // precedence low → high
  for (const v of s.byLayer.builtin.values()) merged.set(v.name, v);
  for (const v of s.byLayer.plugin.values()) merged.set(v.name, v);
  for (const v of s.byLayer.global.values()) merged.set(v.name, v);
  if (opts.projectId) {
    const proj = loadProjectSkills(s.db, opts.projectId);
    for (const v of proj.values()) merged.set(v.name, v);
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function readSkill(name: string, opts: QueryOpts = {}): RegistrySkill | null {
  const s = ensureInit();
  if (opts.projectId) {
    const proj = loadProjectSkills(s.db, opts.projectId);
    const p = proj.get(name);
    if (p) return p;
  }
  return s.byLayer.global.get(name) ?? s.byLayer.plugin.get(name) ?? s.byLayer.builtin.get(name) ?? null;
}

export function addProjectSkill(db: Database.Database, projectId: string, skill: { name: string; description: string; body: string; metadata?: Record<string, unknown> }): void {
  const md = composeMarkdown(skill);
  db.prepare(`INSERT INTO project_skills (id, project_id, name, content) VALUES (?, ?, ?, ?)
              ON CONFLICT(project_id, name) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`)
    .run(uuid(), projectId, skill.name, md);
}

function composeMarkdown(skill: { name: string; description: string; body: string; metadata?: Record<string, unknown> }): string {
  const fmLines = [`name: ${skill.name}`, `description: ${skill.description}`];
  if (skill.metadata) fmLines.push(`metadata: ${JSON.stringify(skill.metadata)}`);
  return `---\n${fmLines.join('\n')}\n---\n${skill.body}`;
}

export function getSystemPromptSkillList(opts: QueryOpts = {}): string {
  const skills = listSkills(opts);
  if (skills.length === 0) return '';
  const lines = skills.map(s => `- ${s.name}: ${s.description}`);
  return `Available skills (call \`read_skill(name)\` to load the body of one):\n${lines.join('\n')}`;
}
```

- [ ] **Step 4** — Test passes (5 tests in registry, plus the 6 parser tests = 11 new total)

- [ ] **Step 5** — Wire into `index.ts`:

```typescript
import { initSkillRegistry } from './services/skillRegistry.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// inside createApp, after initProvider(db):
const here = dirname(fileURLToPath(import.meta.url));
initSkillRegistry({
  db,
  builtinDir: join(here, '..', 'skills', 'builtin'),
  globalDir: join(deps.dataDir, 'skills', 'global'),
  pluginsDir: join(deps.dataDir, 'skills', 'plugins'),
});
```

- [ ] **Step 6** — Commit: `feat(server): add skillRegistry with 4-layer precedence + initial built-ins (Plan 4 Task 2)`

---

## Task 3: REST routes `/api/skills`

**Files:**
- Create `packages/server/src/routes/skills.ts`
- Create `packages/server/src/routes/__tests__/skills.route.test.ts`
- Modify `packages/server/src/index.ts`

- [ ] **Step 1** — Failing tests (covering: GET /, GET /:name, POST/PUT/DELETE on project + global)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sk-'));
  // seed a global skill on disk BEFORE app boots so registry sees it
  mkdirSync(join(dataDir, 'skills', 'global'), { recursive: true });
  writeFileSync(join(dataDir, 'skills', 'global', 'g.md'), `---
name: my-global
description: a global skill
---
body`);
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });
const auth = () => ({ Authorization: `Bearer ${token}` });

describe('GET /api/skills', () => {
  it('lists all visible skills (built-in + global)', async () => {
    const r = await request(app).get('/api/skills').set(auth());
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('my-global');
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('consult-clarify-first');
  });

  it('with ?projectId= includes project skills', async () => {
    await request(app).post(`/api/projects/${projectId}/skills`).set(auth())
      .send({ name: 'p-only', description: 'd', body: 'b' });
    const r = await request(app).get(`/api/skills?projectId=${projectId}`).set(auth());
    expect(r.body.skills.map((s: { name: string }) => s.name)).toContain('p-only');
  });

  it('GET /api/skills/:name returns body', async () => {
    const r = await request(app).get('/api/skills/my-global').set(auth());
    expect(r.body.body).toContain('body');
  });

  it('GET /api/skills/:name 404 if missing', async () => {
    const r = await request(app).get('/api/skills/nope').set(auth());
    expect(r.status).toBe(404);
  });

  it('POST /api/projects/:id/skills creates project skill', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/skills`).set(auth())
      .send({ name: 'p1', description: 'd', body: 'b' });
    expect(r.status).toBe(201);
  });

  it('POST validates name/description/body required', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/skills`).set(auth())
      .send({ name: '', description: 'd', body: 'b' });
    expect(r.status).toBe(400);
  });

  it('PUT /api/projects/:id/skills/:name updates content', async () => {
    await request(app).post(`/api/projects/${projectId}/skills`).set(auth())
      .send({ name: 'p1', description: 'd', body: 'old' });
    const r = await request(app).put(`/api/projects/${projectId}/skills/p1`).set(auth())
      .send({ description: 'd2', body: 'new' });
    expect(r.status).toBe(200);
  });

  it('DELETE /api/projects/:id/skills/:name removes', async () => {
    await request(app).post(`/api/projects/${projectId}/skills`).set(auth())
      .send({ name: 'p1', description: 'd', body: 'b' });
    const r = await request(app).delete(`/api/projects/${projectId}/skills/p1`).set(auth());
    expect(r.status).toBe(200);
    const list = await request(app).get(`/api/skills?projectId=${projectId}`).set(auth());
    expect(list.body.skills.find((s: { name: string }) => s.name === 'p1')).toBeUndefined();
  });

  it('global skill POST/PUT/DELETE work', async () => {
    const c = await request(app).post('/api/skills/global').set(auth())
      .send({ name: 'newg', description: 'd', body: 'b' });
    expect(c.status).toBe(201);
    const u = await request(app).put('/api/skills/global/newg').set(auth())
      .send({ description: 'd2', body: 'b2' });
    expect(u.status).toBe(200);
    const d = await request(app).delete('/api/skills/global/newg').set(auth());
    expect(d.status).toBe(200);
  });

  it('401 without auth', async () => {
    const r = await request(app).get('/api/skills');
    expect(r.status).toBe(401);
  });
});
```

- [ ] **Step 2** — Implement `routes/skills.ts`:

```typescript
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

  r.get('/:name', (req: Request, res: Response) => {
    const skill = readSkill(req.params.name as string);
    if (!skill) { fail(res, 404, 'SKILL_NOT_FOUND', 'skill 不存在'); return; }
    res.json(skill);
  });

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
```

- [ ] **Step 3** — Wire into `index.ts`:

```typescript
import { buildSkillsRouter, buildProjectSkillsRouter } from './routes/skills.js';

// inside createApp, after initSkillRegistry(...):
const skillDeps = {
  db,
  builtinDir: join(here, '..', 'skills', 'builtin'),
  globalDir: join(deps.dataDir, 'skills', 'global'),
  pluginsDir: join(deps.dataDir, 'skills', 'plugins'),
};

// after projects/turns/facts routers:
app.use('/api/skills', buildSkillsRouter(skillDeps));
app.use('/api/projects/:id/skills', buildProjectSkillsRouter(skillDeps));
```

- [ ] **Step 4** — Tests pass

- [ ] **Step 5** — Commit: `feat(server): add /api/skills routes (global + project CRUD, registry-backed) (Plan 4 Task 3)`

---

## Task 4: Verify + push

- [ ] All tests pass (target: 84 + 6 parser + 5 registry + 10 routes = 105)
- [ ] All 4 builds green
- [ ] Push

Commit message for any final fix: ad-hoc as needed.

---

## Acceptance Criteria

- [ ] skillParser handles frontmatter + body, rejects malformed
- [ ] skillRegistry 4-layer discovery with precedence (project > global > plugin > built-in)
- [ ] addProjectSkill writes to `project_skills` table
- [ ] HPSkills copy into `data/skills/plugins/hpsk/skills/*.md` is picked up by registry (verified manually)
- [ ] REST routes for global + project CRUD work; project routes are owner-scoped
- [ ] system-prompt-ready skill list (`getSystemPromptSkillList`) available for Plan 7 to use
- [ ] All builds + tests + push clean

---

## Risks / Notes

1. **gray-matter** is a tiny well-trusted package; verify it's in the lockfile before depending on transient github redirects.
2. The `initSkillRegistry` re-run after every mutating route call is INTENTIONAL for M1 simplicity. M2 can do incremental updates.
3. `project_skills.enabled` is hardcoded to 1 in the addProjectSkill insert. Enable/disable is a M2 UX concern.
4. The 4-layer scan happens at app startup AND on each mutating skills route. If a plugin has 200 skills this could be slow; profile in Plan 14 if needed.

---

**Plan end. 4 Tasks. After this plan: Plan 5 can layer MCP + plugin.json on top; Plan 7 chat endpoint can read `getSystemPromptSkillList()` and `readSkill(name)` for the AI tool surface.**
