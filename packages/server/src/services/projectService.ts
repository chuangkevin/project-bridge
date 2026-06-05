import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { v4 as uuid } from 'uuid';

export interface Project {
  id: string;
  name: string;
  /** Nullable: M1 anonymous projects have no owner. */
  ownerId: string | null;
  shareToken: string;
  /** 1 = design generation inherits global design style settings (default). */
  inheritGlobalStyle: boolean;
  createdAt: string;
  updatedAt: string;
}

function shareToken(): string { return randomBytes(16).toString('hex'); }

/**
 * Create a project. M1 is anonymous-first: ownerId is optional. When omitted
 * (or null) we store NULL so the project belongs to no one — i.e. visible to
 * every visitor, which is the M1 contract.
 */
export function createProject(db: Database.Database, ownerId: string | null, name: string): Project {
  const id = uuid();
  const token = shareToken();
  db.prepare('INSERT INTO projects (id, name, owner_id, share_token) VALUES (?, ?, ?, ?)')
    .run(id, name, ownerId, token);
  return getProject(db, id)!;
}

/**
 * List all projects. M1 anonymous mode → no owner filter. If a future revision
 * brings back per-user logins, this signature can grow an optional filter.
 */
export function listProjects(db: Database.Database): Project[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Array<{
    id: string; name: string; owner_id: string | null; share_token: string; inherit_global_style: number; created_at: string; updated_at: string;
  }>;
  return rows.map(toCamel);
}

export function getProject(db: Database.Database, id: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | { id: string; name: string; owner_id: string | null; share_token: string; inherit_global_style: number; created_at: string; updated_at: string }
    | undefined;
  return row ? toCamel(row) : null;
}

export function updateProject(db: Database.Database, id: string, patch: { name?: string; inheritGlobalStyle?: boolean }): Project | null {
  if (patch.name !== undefined) {
    db.prepare("UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?").run(patch.name, id);
  }
  if (patch.inheritGlobalStyle !== undefined) {
    db.prepare("UPDATE projects SET inherit_global_style = ?, updated_at = datetime('now') WHERE id = ?")
      .run(patch.inheritGlobalStyle ? 1 : 0, id);
  }
  return getProject(db, id);
}

export function deleteProject(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function rotateShareToken(db: Database.Database, id: string): Project | null {
  const token = shareToken();
  db.prepare("UPDATE projects SET share_token = ?, updated_at = datetime('now') WHERE id = ?").run(token, id);
  return getProject(db, id);
}

function toCamel(r: { id: string; name: string; owner_id: string | null; share_token: string; inherit_global_style: number; created_at: string; updated_at: string }): Project {
  return { id: r.id, name: r.name, ownerId: r.owner_id, shareToken: r.share_token, inheritGlobalStyle: r.inherit_global_style !== 0, createdAt: r.created_at, updatedAt: r.updated_at };
}
