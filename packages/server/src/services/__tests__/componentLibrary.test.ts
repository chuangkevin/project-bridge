import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../db/migrator';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
import {
  componentIndexBlock, expandLibComponents, listVisibleComponents,
  snapshotComponentVersion, listComponentVersions,
} from '../componentLibrary';

let dir: string;
let db: Database.Database;

function insertComponent(opts: { name: string; html?: string; css?: string; description?: string; projectId?: string | null }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO components (id, project_id, name, category, description, html, css, tags, version, created_at, updated_at)
     VALUES (?, ?, ?, 'other', ?, ?, ?, '[]', 1, ?, ?)`,
  ).run(crypto.randomUUID(), opts.projectId ?? null, opts.name, opts.description ?? '', opts.html ?? '<div>x</div>', opts.css ?? '', now, now);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cl-'));
  db = new Database(join(dir, 't.db'));
  runMigrations(db, MIGRATIONS_DIR);
  db.prepare(`INSERT INTO projects (id, name) VALUES ('p1', 'P1')`).run();
});
afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

describe('componentIndexBlock', () => {
  it('lists visible components with descriptions and the placeholder rule', () => {
    insertComponent({ name: 'pricing-card', description: '三欄價目卡', projectId: 'p1' });
    insertComponent({ name: 'global-hero', description: '全域主視覺', projectId: null });
    const block = componentIndexBlock(db, 'p1');
    expect(block).toContain('pricing-card: 三欄價目卡');
    expect(block).toContain('global-hero');
    expect(block).toContain('<lib-component name=');
  });

  it('returns empty string when no components exist', () => {
    expect(componentIndexBlock(db, 'p1')).toBe('');
  });

  it('project-scoped name shadows global one', () => {
    insertComponent({ name: 'hero', html: '<div>專案版</div>', projectId: 'p1' });
    insertComponent({ name: 'hero', html: '<div>全域版</div>', projectId: null });
    const visible = listVisibleComponents(db, 'p1');
    expect(visible.filter(c => c.name === 'hero')).toHaveLength(1);
    expect(visible.find(c => c.name === 'hero')!.html).toContain('專案版');
  });
});

describe('expandLibComponents — verbatim expansion', () => {
  const CARD_HTML = '<div class="card lc">\n  <h3>價目</h3>\n</div>';

  it('expands placeholder with byte-identical stored template', () => {
    insertComponent({ name: 'pricing-card', html: CARD_HTML, projectId: 'p1' });
    const sfc = '<template>\n<div>\n<lib-component name="pricing-card"/>\n</div>\n</template>';
    const r = expandLibComponents(db, 'p1', sfc);
    expect(r.expanded).toEqual(['pricing-card']);
    expect(r.payload).toContain(CARD_HTML);
    expect(r.payload).not.toContain('lib-component');
  });

  it('merges component css into the style block, deduped', () => {
    insertComponent({ name: 'a', html: '<div class="x">A</div>', css: '.x { color: red; }', projectId: 'p1' });
    const sfc = '<template><div><lib-component name="a"/><lib-component name="a"/></div></template>\n<style>\n.base {}\n</style>';
    const r = expandLibComponents(db, 'p1', sfc);
    expect(r.payload.match(/\.x \{ color: red; \}/g)).toHaveLength(1);
    expect(r.payload.indexOf('.x { color: red; }')).toBeGreaterThan(r.payload.indexOf('.base'));
  });

  it('appends a style block when none exists and component has css', () => {
    insertComponent({ name: 'a', html: '<div class="x">A</div>', css: '.x { color: red; }', projectId: 'p1' });
    const r = expandLibComponents(db, 'p1', '<template><lib-component name="a"/></template>');
    expect(r.payload).toContain('<style>');
    expect(r.payload).toContain('.x { color: red; }');
  });

  it('unknown component becomes warning container and is reported', () => {
    const r = expandLibComponents(db, 'p1', '<template><div><lib-component name="nope"/></div></template>');
    expect(r.unknown).toEqual(['nope']);
    expect(r.payload).toContain('未知元件');
    expect(r.payload).toContain('nope');
  });

  it('payload without placeholders passes through untouched', () => {
    const sfc = '<template><div>nothing</div></template>';
    const r = expandLibComponents(db, 'p1', sfc);
    expect(r.payload).toBe(sfc);
    expect(r.expanded).toEqual([]);
  });

  it('handles both self-closing and paired placeholder forms', () => {
    insertComponent({ name: 'a', html: '<div>A!</div>', projectId: 'p1' });
    const r = expandLibComponents(db, 'p1', '<template><div><lib-component name="a"></lib-component></div></template>');
    expect(r.payload).toContain('<div>A!</div>');
  });
});

describe('component version snapshots', () => {
  it('snapshot keeps prior content queryable', () => {
    insertComponent({ name: 'hero', html: '<div>v1</div>', projectId: 'p1' });
    const id = (db.prepare(`SELECT id FROM components WHERE name = 'hero'`).get() as { id: string }).id;
    snapshotComponentVersion(db, id);
    db.prepare(`UPDATE components SET html = '<div>v2</div>', version = 2 WHERE id = ?`).run(id);
    const versions = listComponentVersions(db, id);
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].html).toBe('<div>v1</div>');
  });
});
