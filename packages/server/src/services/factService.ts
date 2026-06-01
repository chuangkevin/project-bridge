import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

export type FactKind = 'requirement' | 'page' | 'constraint' | 'decision';

export interface ExtractedFact {
  id: string;
  projectId: string;
  turnId: string;
  kind: FactKind;
  text: string;
  supersededBy: string | null;
  createdAt: string;
}

export interface AddFactInput {
  projectId: string;
  turnId: string;
  kind: FactKind;
  text: string;
}

export function addFact(db: Database.Database, input: AddFactInput): ExtractedFact {
  const id = uuid();
  db.prepare(`
    INSERT INTO extracted_facts (id, project_id, turn_id, kind, text)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, input.projectId, input.turnId, input.kind, input.text);
  return getFact(db, id)!;
}

export interface ListFactsOpts { kind?: FactKind; }

export function listFacts(db: Database.Database, projectId: string, opts: ListFactsOpts): ExtractedFact[] {
  let sql = 'SELECT * FROM extracted_facts WHERE project_id = ? AND superseded_by IS NULL';
  const params: unknown[] = [projectId];
  if (opts.kind) { sql += ' AND kind = ?'; params.push(opts.kind); }
  sql += ' ORDER BY created_at ASC';
  const rows = db.prepare(sql).all(...params) as RawFact[];
  return rows.map(rowToFact);
}

export function getFact(db: Database.Database, id: string): ExtractedFact | null {
  const row = db.prepare('SELECT * FROM extracted_facts WHERE id = ?').get(id) as RawFact | undefined;
  return row ? rowToFact(row) : null;
}

export function supersedeFact(db: Database.Database, oldId: string, newId: string): void {
  db.prepare('UPDATE extracted_facts SET superseded_by = ? WHERE id = ?').run(newId, oldId);
}

interface RawFact {
  id: string;
  project_id: string;
  turn_id: string;
  kind: string;
  text: string;
  superseded_by: string | null;
  created_at: string;
}

function rowToFact(r: RawFact): ExtractedFact {
  return {
    id: r.id,
    projectId: r.project_id,
    turnId: r.turn_id,
    kind: r.kind as FactKind,
    text: r.text,
    supersededBy: r.superseded_by,
    createdAt: r.created_at,
  };
}
