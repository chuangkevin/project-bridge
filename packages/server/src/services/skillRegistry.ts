import type Database from 'better-sqlite3';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import { parseSkill, type Skill } from './skillParser.js';

export type SkillLayer = 'builtin' | 'plugin' | 'global' | 'project';

export interface RegistrySkill extends Skill {
  layer: SkillLayer;
  source: string;            // file path OR project DB row id
}

interface RegistryState {
  byLayer: Record<Exclude<SkillLayer, 'project'>, Map<string, RegistrySkill>>;
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
