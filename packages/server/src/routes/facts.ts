import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { getProject } from '../services/projectService.js';
import { addFact, listFacts, getFact, supersedeFact, type FactKind } from '../services/factService.js';
import { getTurn } from '../services/turnService.js';

const VALID_KINDS: FactKind[] = ['requirement', 'page', 'constraint', 'decision'];

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function ensureProject(db: Database.Database, projectId: string, res: Response): boolean {
  const p = getProject(db, projectId);
  if (!p) { fail(res, 404, 'NOT_FOUND', '專案不存在'); return false; }
  return true;
}

export function buildFactsRouter(db: Database.Database): Router {
  const r = Router({ mergeParams: true });

  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    if (!ensureProject(db, projectId, res)) return;
    const kindRaw = req.query.kind;
    const kind = typeof kindRaw === 'string' && (VALID_KINDS as string[]).includes(kindRaw)
      ? (kindRaw as FactKind) : undefined;
    res.json({ facts: listFacts(db, projectId, { kind }) });
  });

  r.post('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    if (!ensureProject(db, projectId, res)) return;
    const { turnId, kind, text } = req.body ?? {};
    if (typeof turnId !== 'string' || !turnId) { fail(res, 400, 'VALIDATION_FAILED', '需要 turnId'); return; }
    if (typeof kind !== 'string' || !(VALID_KINDS as string[]).includes(kind)) {
      fail(res, 400, 'VALIDATION_FAILED', 'kind 必須是 requirement / page / constraint / decision'); return;
    }
    if (typeof text !== 'string' || !text.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 text'); return; }
    const turn = getTurn(db, turnId);
    if (!turn || turn.projectId !== projectId) { fail(res, 400, 'VALIDATION_FAILED', 'turn 不在此專案'); return; }
    const f = addFact(db, { projectId, turnId, kind: kind as FactKind, text: text.trim() });
    res.status(201).json(f);
  });

  r.patch('/:factId', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    if (!ensureProject(db, projectId, res)) return;
    const factId = req.params.factId as string;
    const old = getFact(db, factId);
    if (!old || old.projectId !== projectId) { fail(res, 404, 'NOT_FOUND', 'fact 不存在'); return; }
    const { text } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim()) { fail(res, 400, 'VALIDATION_FAILED', '需要 text'); return; }
    const newer = addFact(db, { projectId, turnId: old.turnId, kind: old.kind, text: text.trim() });
    supersedeFact(db, old.id, newer.id);
    res.json(newer);
  });

  r.delete('/:factId', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    if (!ensureProject(db, projectId, res)) return;
    const factId = req.params.factId as string;
    const f = getFact(db, factId);
    if (!f || f.projectId !== projectId) { fail(res, 404, 'NOT_FOUND', 'fact 不存在'); return; }
    // soft delete: self-referencing sentinel (superseded_by = own id); listFacts filters WHERE superseded_by IS NULL
    db.prepare('UPDATE extracted_facts SET superseded_by = id WHERE id = ?').run(factId);
    res.json({ ok: true });
  });

  return r;
}
