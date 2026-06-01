import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';

export type TurnMode = 'consult' | 'architect' | 'design';

export interface Voice { round: number; persona: string; text: string; }

export interface AiResponse {
  text: string;
  thinking?: string;
  discussion?: Voice[];
  artifactRef?: string;
}

export interface Turn {
  id: string;
  projectId: string;
  mode: TurnMode;
  userText: string;
  aiResponse: AiResponse;
  skillsUsed?: string[];
  modelUsed?: string;
  tokens?: { prompt: number; completion: number; total: number };
  createdAt: string;
}

export interface AppendTurnInput {
  projectId: string;
  mode: TurnMode;
  userText: string;
  aiResponse: AiResponse;
  skillsUsed?: string[];
  modelUsed?: string;
  tokens?: { prompt: number; completion: number; total: number };
}

export function appendTurn(db: Database.Database, input: AppendTurnInput): Turn {
  const id = uuid();
  db.prepare(`
    INSERT INTO turns (id, project_id, mode, user_text, ai_response, skills_used, model_used, tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.projectId,
    input.mode,
    input.userText,
    JSON.stringify(input.aiResponse),
    input.skillsUsed ? JSON.stringify(input.skillsUsed) : null,
    input.modelUsed ?? null,
    input.tokens ? JSON.stringify(input.tokens) : null,
  );
  return getTurn(db, id)!;
}

export interface ListTurnsOpts {
  mode?: TurnMode;
  limit?: number;
  order?: 'asc' | 'desc';     // default 'asc'
}

export function listTurns(db: Database.Database, projectId: string, opts: ListTurnsOpts): Turn[] {
  const order = opts.order === 'desc' ? 'DESC' : 'ASC';
  let sql = 'SELECT * FROM turns WHERE project_id = ?';
  const params: unknown[] = [projectId];
  if (opts.mode) { sql += ' AND mode = ?'; params.push(opts.mode); }
  sql += ` ORDER BY created_at ${order}`;
  if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
  const rows = db.prepare(sql).all(...params) as RawTurn[];
  return rows.map(rowToTurn);
}

export function getTurn(db: Database.Database, id: string): Turn | null {
  const row = db.prepare('SELECT * FROM turns WHERE id = ?').get(id) as RawTurn | undefined;
  return row ? rowToTurn(row) : null;
}

interface RawTurn {
  id: string;
  project_id: string;
  mode: string;
  user_text: string;
  ai_response: string;
  skills_used: string | null;
  model_used: string | null;
  tokens: string | null;
  created_at: string;
}

function rowToTurn(r: RawTurn): Turn {
  return {
    id: r.id,
    projectId: r.project_id,
    mode: r.mode as TurnMode,
    userText: r.user_text,
    aiResponse: JSON.parse(r.ai_response) as AiResponse,
    skillsUsed: r.skills_used ? (JSON.parse(r.skills_used) as string[]) : undefined,
    modelUsed: r.model_used ?? undefined,
    tokens: r.tokens ? (JSON.parse(r.tokens) as Turn['tokens']) : undefined,
    createdAt: r.created_at,
  };
}
