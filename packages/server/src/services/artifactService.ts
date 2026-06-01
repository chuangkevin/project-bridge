import type Database from 'better-sqlite3';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emitToProject } from '../realtime/socketServer.js';

export type ArtifactKind = 'vue-sfc' | 'page-graph' | 'design-tokens';

export interface Artifact {
  id: string;
  projectId: string;
  createdByTurn: string;
  kind: ArtifactKind;
  name: string;
  payloadPath: string;
  metadata: Record<string, unknown> | null;
  supersededBy: string | null;
  createdAt: string;
}

export function createArtifact(db: Database.Database, opts: {
  projectId: string;
  createdByTurn: string;
  kind: ArtifactKind;
  name: string;
  payload: string;           // raw text/JSON to write to file
  payloadExt: string;        // e.g. 'json', 'vue', 'css'
  metadata?: Record<string, unknown>;
  artifactsRoot: string;     // <dataDir>/projects/<projectId>/artifacts
}): Artifact {
  const id = randomUUID();
  mkdirSync(opts.artifactsRoot, { recursive: true });
  const payloadPath = join(opts.artifactsRoot, `${id}.${opts.payloadExt}`);
  writeFileSync(payloadPath, opts.payload, 'utf8');

  const relPath = `projects/${opts.projectId}/artifacts/${id}.${opts.payloadExt}`;

  // Find prior artifacts of same kind+name (supersede them after the INSERT)
  const prior = db.prepare(`
    SELECT id FROM artifacts WHERE project_id = ? AND kind = ? AND name = ? AND superseded_by IS NULL
  `).all(opts.projectId, opts.kind, opts.name) as Array<{ id: string }>;

  // Insert the new row first so the FK self-reference is satisfied
  db.prepare(`
    INSERT INTO artifacts (id, project_id, created_by_turn, kind, name, payload_path, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id, opts.projectId, opts.createdByTurn, opts.kind, opts.name,
    relPath, opts.metadata ? JSON.stringify(opts.metadata) : null,
  );

  // Now supersede prior artifacts (FK to the just-inserted row is now valid)
  if (prior.length > 0) {
    const upd = db.prepare('UPDATE artifacts SET superseded_by = ? WHERE id = ?');
    for (const p of prior) upd.run(id, p.id);
  }

  const artifact: Artifact = {
    id, projectId: opts.projectId, createdByTurn: opts.createdByTurn,
    kind: opts.kind, name: opts.name, payloadPath: relPath,
    metadata: opts.metadata ?? null, supersededBy: null,
    createdAt: new Date().toISOString(),
  };
  emitToProject(opts.projectId, 'artifact:created', { id: artifact.id, kind: artifact.kind, name: artifact.name });
  return artifact;
}

export function listArtifacts(db: Database.Database, projectId: string, opts: { kind?: ArtifactKind; includeSuperseded?: boolean } = {}): Artifact[] {
  let sql = 'SELECT * FROM artifacts WHERE project_id = ?';
  const params: unknown[] = [projectId];
  if (opts.kind) { sql += ' AND kind = ?'; params.push(opts.kind); }
  if (!opts.includeSuperseded) sql += ' AND superseded_by IS NULL';
  sql += ' ORDER BY created_at DESC';
  return (db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(toArtifact);
}

export function getArtifact(db: Database.Database, id: string): Artifact | null {
  const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? toArtifact(row) : null;
}

export function readArtifactPayload(dataDir: string, artifact: Artifact): string {
  const abs = join(dataDir, artifact.payloadPath);
  return readFileSync(abs, 'utf8');
}

function toArtifact(row: Record<string, unknown>): Artifact {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    createdByTurn: row.created_by_turn as string,
    kind: row.kind as ArtifactKind,
    name: row.name as string,
    payloadPath: row.payload_path as string,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    supersededBy: (row.superseded_by as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}
