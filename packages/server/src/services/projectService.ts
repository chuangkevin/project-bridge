import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { v4 as uuid } from 'uuid';

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  shareToken: string;
  createdAt: string;
  updatedAt: string;
}

function shareToken(): string { return randomBytes(16).toString('hex'); }

export function createProject(db: Database.Database, ownerId: string, name: string): Project {
  const id = uuid();
  const token = shareToken();
  db.prepare('INSERT INTO projects (id, name, owner_id, share_token) VALUES (?, ?, ?, ?)')
    .run(id, name, ownerId, token);
  return getProject(db, id)!;
}

export function listProjects(db: Database.Database, ownerId: string): Project[] {
  const rows = db.prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY updated_at DESC').all(ownerId) as Array<{
    id: string; name: string; owner_id: string; share_token: string; created_at: string; updated_at: string;
  }>;
  return rows.map(toCamel);
}

export function getProject(db: Database.Database, id: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | { id: string; name: string; owner_id: string; share_token: string; created_at: string; updated_at: string }
    | undefined;
  return row ? toCamel(row) : null;
}

export function updateProject(db: Database.Database, id: string, patch: { name?: string }): Project | null {
  if (patch.name !== undefined) {
    db.prepare("UPDATE projects SET name = ?, updated_at = datetime('now') WHERE id = ?").run(patch.name, id);
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

function toCamel(r: { id: string; name: string; owner_id: string; share_token: string; created_at: string; updated_at: string }): Project {
  return { id: r.id, name: r.name, ownerId: r.owner_id, shareToken: r.share_token, createdAt: r.created_at, updatedAt: r.updated_at };
}
