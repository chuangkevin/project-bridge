import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser } from '../authService';
import { createProject } from '../projectService';
import { initSkillRegistry, listSkills, readSkill, addProjectSkill } from '../skillRegistry';

let baseDir: string;
let builtinDir: string;
let globalDir: string;
let pluginsDir: string;
let db: ReturnType<typeof openDb>;
let proj1Id: string;
let proj2Id: string;

beforeEach(async () => {
  baseDir = mkdtempSync(join(tmpdir(), 'sr-'));
  builtinDir = join(baseDir, 'builtin');
  globalDir = join(baseDir, 'global');
  pluginsDir = join(baseDir, 'plugins');
  mkdirSync(builtinDir, { recursive: true });
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(pluginsDir, { recursive: true });
  db = openDb(baseDir);
  runMigrations(db, defaultMigrationsDir());
  // create user + projects so FK is satisfied
  const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
  proj1Id = createProject(db, u.id, 'P1').id;
  proj2Id = createProject(db, u.id, 'P2').id;
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
    addProjectSkill(db, proj1Id, { name: 'b', description: 'project overrides built-in', body: 'body-overridden' });
    const b = readSkill('b', { projectId: proj1Id });
    expect(b?.body).toBe('body-overridden');
    expect(b?.layer).toBe('project');
  });

  it('listSkills with projectId includes project layer', () => {
    initSkillRegistry({ db, builtinDir, globalDir, pluginsDir });
    addProjectSkill(db, proj2Id, { name: 'project-only', description: 'project skill', body: 'x' });
    const list = listSkills({ projectId: proj2Id });
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
