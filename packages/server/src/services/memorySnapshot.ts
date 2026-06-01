import type Database from 'better-sqlite3';
import { listFacts, type ExtractedFact } from './factService.js';
import { listTurns, type Turn } from './turnService.js';

export interface MemorySnapshot {
  facts: ExtractedFact[];
  turns: Turn[];                // recent window in chronological order
  earlierTurnCount: number;     // count of turns BEFORE the recent window
  activeArtifactId?: string;
}

export interface SnapshotOpts {
  maxRecentTurns?: number;       // default 20
  activeArtifactId?: string;
}

export function buildMemorySnapshot(
  db: Database.Database,
  projectId: string,
  opts: SnapshotOpts,
): MemorySnapshot {
  const maxRecentTurns = opts.maxRecentTurns ?? 20;
  const facts = listFacts(db, projectId, {});

  // Fetch most recent N turns, descending, then reverse to chronological order
  const recentDesc = listTurns(db, projectId, { limit: maxRecentTurns, order: 'desc' });
  const turns = [...recentDesc].reverse();

  // Count how many turns are EARLIER than the recent window
  const totalCount = (db.prepare('SELECT COUNT(*) as n FROM turns WHERE project_id = ?').get(projectId) as { n: number }).n;
  const earlierTurnCount = Math.max(0, totalCount - turns.length);

  return {
    facts,
    turns,
    earlierTurnCount,
    activeArtifactId: opts.activeArtifactId,
  };
}
