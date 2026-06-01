# Plan 3 — Memory Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Implement the cross-mode shared memory: Turn CRUD + ExtractedFact CRUD + memory-snapshot builder + fact-extraction service. After this plan, any service can write a Turn and read back a "memory snapshot" (facts + recent turns + active artifact) ready to inject into AI prompts (Plan 7 chat endpoint will consume this).

**Architecture:** Three new services (`turnService`, `factService`, `memorySnapshot`) + three REST route groups (`/projects/:id/turns`, `/projects/:id/facts`, plus a thin `appendTurn` API used by chat). Memory snapshot pulls all valid facts + most-recent N turns + an optional active artifact ref into a single object the chat layer will format into a prompt. Fact extraction parses AI responses for a fixed `<facts>...</facts>` JSON block and stores items (designed so Plan 7 will call it).

**Tech Stack:** Express, better-sqlite3, supertest, vitest 3.2.4. No new deps.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 2 (data model) + § 2.5 (memory budget rules) + § 8.2 (API surface for turns/facts).

**Scope boundary (out of plan):** NO chat endpoint (Plan 7). NO artifact CRUD (Plan 11 builds on artifact write during design-mode generation). NO Socket.io broadcast (Plan 13). NO skill-driven memory weighting (Plan 4 / 7 integration). M1 fact extraction expects AI to opt-in via a `<facts>...</facts>` JSON tail; if absent, no facts. Token budget enforcement (70% rule from spec § 2.5) lives in this plan as the snapshot's `maxTurns` parameter — not as a real tokenizer.

---

## File Structure

```
packages/server/src/
  services/
    turnService.ts                   ← createTurn / listTurns / getTurn / appendTurn
    factService.ts                   ← addFact / listFacts (excluding superseded) / supersedeFact
    memorySnapshot.ts                ← buildMemorySnapshot(db, projectId, opts) -> { facts, turns, activeArtifactId? }
    factExtractor.ts                 ← parseFactsFromResponse(aiResponseText) -> ExtractedFact[]
    __tests__/
      turnService.test.ts
      factService.test.ts
      memorySnapshot.test.ts
      factExtractor.test.ts
  routes/
    turns.ts                         ← GET /projects/:id/turns, GET /:turnId
    facts.ts                         ← GET / POST / PATCH / DELETE /projects/:id/facts[/:factId]
    __tests__/
      turns.route.test.ts
      facts.route.test.ts
```

Nothing modified outside the new files except `index.ts` (mount routers) and a small re-export from existing test utilities if helpful.

---

## Task 1: `turnService` (CRUD)

**Files:**
- Create `packages/server/src/services/turnService.ts`
- Create `packages/server/src/services/__tests__/turnService.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser } from '../authService';
import { createProject } from '../projectService';
import { appendTurn, listTurns, getTurn } from '../turnService';

let dataDir: string;
let db: ReturnType<typeof openDb>;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'turn-'));
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());
  const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
  projectId = createProject(db, u.id, 'P').id;
});
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('turnService', () => {
  it('appendTurn inserts a row + returns it with all fields', () => {
    const t = appendTurn(db, {
      projectId, mode: 'consult', userText: 'hi',
      aiResponse: { text: 'hello there' },
      skillsUsed: ['s1','s2'], modelUsed: 'gemini-2.5-flash',
      tokens: { prompt: 10, completion: 5, total: 15 },
    });
    expect(t.id).toBeDefined();
    expect(t.mode).toBe('consult');
    expect(t.aiResponse.text).toBe('hello there');
    expect(t.skillsUsed).toEqual(['s1','s2']);
  });

  it('listTurns returns turns in chronological order (oldest first by default)', () => {
    appendTurn(db, { projectId, mode: 'consult', userText: 'one', aiResponse: { text: 'a' } });
    appendTurn(db, { projectId, mode: 'architect', userText: 'two', aiResponse: { text: 'b' } });
    const all = listTurns(db, projectId, {});
    expect(all.map(t => t.userText)).toEqual(['one','two']);
  });

  it('listTurns with mode filter only returns that mode', () => {
    appendTurn(db, { projectId, mode: 'consult', userText: 'one', aiResponse: { text: 'a' } });
    appendTurn(db, { projectId, mode: 'design', userText: 'two', aiResponse: { text: 'b' } });
    const consult = listTurns(db, projectId, { mode: 'consult' });
    expect(consult).toHaveLength(1);
    expect(consult[0].userText).toBe('one');
  });

  it('listTurns with limit returns most recent N', () => {
    for (let i = 0; i < 5; i++) appendTurn(db, { projectId, mode: 'consult', userText: `t${i}`, aiResponse: { text: '' } });
    const r = listTurns(db, projectId, { limit: 3, order: 'desc' });
    expect(r).toHaveLength(3);
    expect(r.map(t => t.userText)).toEqual(['t4','t3','t2']);
  });

  it('getTurn returns the turn by id', () => {
    const t = appendTurn(db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: 'y' } });
    expect(getTurn(db, t.id)?.userText).toBe('x');
  });

  it('getTurn returns null for unknown id', () => {
    expect(getTurn(db, 'nope')).toBeNull();
  });

  it('appendTurn rejects invalid mode via CHECK constraint (sqlite throws)', () => {
    expect(() => appendTurn(db, {
      projectId, mode: 'invalid' as never, userText: 'x', aiResponse: { text: '' },
    })).toThrow();
  });

  it('aiResponse with discussion array round-trips', () => {
    const discussion = [{ round: 1, persona: 'pm', text: 'hi' }, { round: 2, persona: 'designer', text: 'ok' }];
    const t = appendTurn(db, { projectId, mode: 'consult', userText: 'q', aiResponse: { text: 'a', discussion } });
    const r = getTurn(db, t.id);
    expect(r?.aiResponse.discussion).toEqual(discussion);
  });
});
```

- [ ] **Step 2: Run → FAIL**

```bash
pnpm --filter @designbridge/server test
```

- [ ] **Step 3: Implement `turnService.ts`**

```typescript
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
```

- [ ] **Step 4: Run → PASS** (8 new tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/turnService.ts packages/server/src/services/__tests__/turnService.test.ts
git commit -m "feat(server): add turnService (appendTurn / listTurns / getTurn) (Plan 3 Task 1)"
```

---

## Task 2: `factService` (CRUD + supersede)

**Files:**
- Create `packages/server/src/services/factService.ts`
- Create `packages/server/src/services/__tests__/factService.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser } from '../authService';
import { createProject } from '../projectService';
import { appendTurn } from '../turnService';
import { addFact, listFacts, supersedeFact, getFact } from '../factService';

let dataDir: string;
let db: ReturnType<typeof openDb>;
let projectId: string;
let turnId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'fact-'));
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());
  const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
  projectId = createProject(db, u.id, 'P').id;
  turnId = appendTurn(db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: '' } }).id;
});
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('factService', () => {
  it('addFact inserts + returns it', () => {
    const f = addFact(db, { projectId, turnId, kind: 'requirement', text: '目標族群 30-50 女性' });
    expect(f.id).toBeDefined();
    expect(f.kind).toBe('requirement');
  });

  it('listFacts returns valid (non-superseded) facts', () => {
    addFact(db, { projectId, turnId, kind: 'requirement', text: 'a' });
    addFact(db, { projectId, turnId, kind: 'page', text: 'b' });
    const r = listFacts(db, projectId, {});
    expect(r).toHaveLength(2);
  });

  it('listFacts with kind filter', () => {
    addFact(db, { projectId, turnId, kind: 'requirement', text: 'a' });
    addFact(db, { projectId, turnId, kind: 'page', text: 'b' });
    expect(listFacts(db, projectId, { kind: 'requirement' })).toHaveLength(1);
  });

  it('supersedeFact links old → new and listFacts excludes the superseded one', () => {
    const old = addFact(db, { projectId, turnId, kind: 'requirement', text: 'old' });
    const newer = addFact(db, { projectId, turnId, kind: 'requirement', text: 'new' });
    supersedeFact(db, old.id, newer.id);
    const list = listFacts(db, projectId, {});
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('new');
  });

  it('rejects invalid kind', () => {
    expect(() => addFact(db, { projectId, turnId, kind: 'invalid' as never, text: 'x' })).toThrow();
  });

  it('getFact returns the fact even if superseded', () => {
    const old = addFact(db, { projectId, turnId, kind: 'requirement', text: 'old' });
    const newer = addFact(db, { projectId, turnId, kind: 'requirement', text: 'new' });
    supersedeFact(db, old.id, newer.id);
    expect(getFact(db, old.id)?.supersededBy).toBe(newer.id);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `factService.ts`**

```typescript
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
```

- [ ] **Step 4: Run → PASS** (6 new tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/factService.ts packages/server/src/services/__tests__/factService.test.ts
git commit -m "feat(server): add factService (addFact / listFacts excluding superseded / supersedeFact) (Plan 3 Task 2)"
```

---

## Task 3: `memorySnapshot` builder

**Files:**
- Create `packages/server/src/services/memorySnapshot.ts`
- Create `packages/server/src/services/__tests__/memorySnapshot.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../db/connection';
import { runMigrations, defaultMigrationsDir } from '../../db/migrator';
import { createUser } from '../authService';
import { createProject } from '../projectService';
import { appendTurn } from '../turnService';
import { addFact } from '../factService';
import { buildMemorySnapshot } from '../memorySnapshot';

let dataDir: string;
let db: ReturnType<typeof openDb>;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'mem-'));
  db = openDb(dataDir);
  runMigrations(db, defaultMigrationsDir());
  const u = await createUser(db, { name: 'A', email: 'a@x.com', password: 'pw12345678' });
  projectId = createProject(db, u.id, 'P').id;
});
afterEach(() => { db.close(); rmSync(dataDir, { recursive: true, force: true }); });

describe('buildMemorySnapshot', () => {
  it('returns empty arrays for a new project', () => {
    const m = buildMemorySnapshot(db, projectId, {});
    expect(m.facts).toEqual([]);
    expect(m.turns).toEqual([]);
    expect(m.earlierTurnCount).toBe(0);
    expect(m.activeArtifactId).toBeUndefined();
  });

  it('includes all valid facts (not superseded)', () => {
    const turn = appendTurn(db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: '' } });
    addFact(db, { projectId, turnId: turn.id, kind: 'requirement', text: 'r1' });
    addFact(db, { projectId, turnId: turn.id, kind: 'decision', text: 'd1' });
    const m = buildMemorySnapshot(db, projectId, {});
    expect(m.facts).toHaveLength(2);
  });

  it('returns at most maxRecentTurns turns (most-recent), older turns counted', () => {
    for (let i = 0; i < 25; i++) {
      appendTurn(db, { projectId, mode: 'consult', userText: `t${i}`, aiResponse: { text: '' } });
    }
    const m = buildMemorySnapshot(db, projectId, { maxRecentTurns: 20 });
    expect(m.turns).toHaveLength(20);
    expect(m.turns[0].userText).toBe('t5');     // oldest of the recent window
    expect(m.turns[19].userText).toBe('t24');   // newest
    expect(m.earlierTurnCount).toBe(5);         // 25 total - 20 recent = 5 earlier
  });

  it('default maxRecentTurns is 20', () => {
    for (let i = 0; i < 22; i++) {
      appendTurn(db, { projectId, mode: 'consult', userText: `t${i}`, aiResponse: { text: '' } });
    }
    const m = buildMemorySnapshot(db, projectId, {});
    expect(m.turns).toHaveLength(20);
    expect(m.earlierTurnCount).toBe(2);
  });

  it('honors activeArtifactId pass-through', () => {
    const m = buildMemorySnapshot(db, projectId, { activeArtifactId: 'art_1' });
    expect(m.activeArtifactId).toBe('art_1');
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `memorySnapshot.ts`**

```typescript
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
```

- [ ] **Step 4: Run → PASS** (5 new tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/memorySnapshot.ts packages/server/src/services/__tests__/memorySnapshot.test.ts
git commit -m "feat(server): add buildMemorySnapshot (facts + recent turns + earlier count) (Plan 3 Task 3)"
```

---

## Task 4: `factExtractor`

**Files:**
- Create `packages/server/src/services/factExtractor.ts`
- Create `packages/server/src/services/__tests__/factExtractor.test.ts`

The AI is asked (later, by Plan 7's chat endpoint system prompt) to optionally emit a JSON block at the end of its response, like:

```
... main answer ...

<facts>
[
  {"kind":"requirement","text":"目標族群 30-50 女性"},
  {"kind":"page","text":"登入頁、搜尋頁、物件詳情頁"}
]
</facts>
```

This module parses that tail block. Returns `[]` if absent or malformed.

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { parseFactsFromResponse } from '../factExtractor';

describe('parseFactsFromResponse', () => {
  it('returns empty array when no <facts> block', () => {
    expect(parseFactsFromResponse('just plain text')).toEqual([]);
  });

  it('returns parsed facts when block is well-formed', () => {
    const ai = 'sure, here is my answer.\n\n<facts>\n[{"kind":"requirement","text":"r1"},{"kind":"page","text":"p1"}]\n</facts>';
    const r = parseFactsFromResponse(ai);
    expect(r).toEqual([
      { kind: 'requirement', text: 'r1' },
      { kind: 'page', text: 'p1' },
    ]);
  });

  it('returns empty array when JSON is malformed', () => {
    const ai = '<facts>\n[malformed,,\n</facts>';
    expect(parseFactsFromResponse(ai)).toEqual([]);
  });

  it('returns empty array when the JSON is not an array', () => {
    const ai = '<facts>\n{"kind":"requirement","text":"r1"}\n</facts>';
    expect(parseFactsFromResponse(ai)).toEqual([]);
  });

  it('filters out invalid kinds', () => {
    const ai = '<facts>[{"kind":"foo","text":"x"},{"kind":"requirement","text":"r"}]</facts>';
    expect(parseFactsFromResponse(ai)).toEqual([{ kind: 'requirement', text: 'r' }]);
  });

  it('filters out items missing text', () => {
    const ai = '<facts>[{"kind":"requirement"},{"kind":"requirement","text":"ok"}]</facts>';
    expect(parseFactsFromResponse(ai)).toEqual([{ kind: 'requirement', text: 'ok' }]);
  });

  it('trims text and rejects empty after trim', () => {
    const ai = '<facts>[{"kind":"requirement","text":"  trimmed  "},{"kind":"page","text":"   "}]</facts>';
    expect(parseFactsFromResponse(ai)).toEqual([{ kind: 'requirement', text: 'trimmed' }]);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `factExtractor.ts`**

```typescript
import type { FactKind } from './factService.js';

const ALLOWED_KINDS = new Set<string>(['requirement', 'page', 'constraint', 'decision']);

export interface ParsedFact { kind: FactKind; text: string; }

const FACTS_BLOCK_RE = /<facts>\s*([\s\S]*?)\s*<\/facts>/i;

export function parseFactsFromResponse(aiResponseText: string): ParsedFact[] {
  const match = aiResponseText.match(FACTS_BLOCK_RE);
  if (!match) return [];
  let raw: unknown;
  try { raw = JSON.parse(match[1]!); }
  catch { return []; }
  if (!Array.isArray(raw)) return [];

  const out: ParsedFact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const kind = typeof obj.kind === 'string' ? obj.kind : '';
    const rawText = typeof obj.text === 'string' ? obj.text : '';
    const text = rawText.trim();
    if (!ALLOWED_KINDS.has(kind) || !text) continue;
    out.push({ kind: kind as FactKind, text });
  }
  return out;
}
```

- [ ] **Step 4: Run → PASS** (7 new tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/factExtractor.ts packages/server/src/services/__tests__/factExtractor.test.ts
git commit -m "feat(server): add factExtractor (parses <facts> JSON block from AI response) (Plan 3 Task 4)"
```

---

## Task 5: `/api/projects/:id/turns` routes (GET list + GET single)

**Files:**
- Create `packages/server/src/routes/turns.ts`
- Create `packages/server/src/routes/__tests__/turns.route.test.ts`
- Modify `packages/server/src/index.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'tr-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('turns routes', () => {
  it('GET /api/projects/:id/turns empty initially', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/turns`).set(auth());
    expect(r.body.turns).toEqual([]);
  });

  it('GET /api/projects/:id/turns lists turns chronologically', async () => {
    const db = app.locals.db;
    appendTurn(db, { projectId, mode: 'consult', userText: 'one', aiResponse: { text: '' } });
    appendTurn(db, { projectId, mode: 'consult', userText: 'two', aiResponse: { text: '' } });
    const r = await request(app).get(`/api/projects/${projectId}/turns`).set(auth());
    expect(r.body.turns).toHaveLength(2);
    expect(r.body.turns[0].userText).toBe('one');
  });

  it('GET supports ?mode= filter', async () => {
    const db = app.locals.db;
    appendTurn(db, { projectId, mode: 'consult', userText: 'c', aiResponse: { text: '' } });
    appendTurn(db, { projectId, mode: 'design', userText: 'd', aiResponse: { text: '' } });
    const r = await request(app).get(`/api/projects/${projectId}/turns?mode=design`).set(auth());
    expect(r.body.turns).toHaveLength(1);
    expect(r.body.turns[0].userText).toBe('d');
  });

  it('GET /api/projects/:id/turns/:turnId returns single turn', async () => {
    const db = app.locals.db;
    const t = appendTurn(db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: 'y' } });
    const r = await request(app).get(`/api/projects/${projectId}/turns/${t.id}`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.userText).toBe('x');
  });

  it('GET single turn 404 if turn not in project', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/turns/nope`).set(auth());
    expect(r.status).toBe(404);
  });

  it('GET turns 401 without auth', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/turns`);
    expect(r.status).toBe(401);
  });

  it('GET turns 404 if project not owned by user', async () => {
    // Plan 1 setup only allows ONE user, so we cannot easily create a 2nd owner;
    // instead, test with a non-existent project id
    const r = await request(app).get(`/api/projects/does-not-exist/turns`).set(auth());
    expect(r.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `routes/turns.ts`**

```typescript
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { getProject } from '../services/projectService.js';
import { listTurns, getTurn, type TurnMode } from '../services/turnService.js';

const VALID_MODES: TurnMode[] = ['consult', 'architect', 'design'];

export function buildTurnsRouter(db: Database.Database): Router {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);

  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const mode = typeof req.query.mode === 'string' && (VALID_MODES as string[]).includes(req.query.mode)
      ? (req.query.mode as TurnMode)
      : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const turns = listTurns(db, projectId, { mode, limit });
    res.json({ turns });
  });

  r.get('/:turnId', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const t = getTurn(db, req.params.turnId as string);
    if (!t || t.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Turn 不存在' } });
      return;
    }
    res.json(t);
  });

  return r;
}
```

- [ ] **Step 4: Wire into `index.ts`**

```typescript
import { buildTurnsRouter } from './routes/turns.js';
// after projects router:
app.use('/api/projects/:id/turns', buildTurnsRouter(db));
```

- [ ] **Step 5: Run → PASS** (7 new tests)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/turns.ts packages/server/src/routes/__tests__/turns.route.test.ts packages/server/src/index.ts
git commit -m "feat(server): add /api/projects/:id/turns (list + single) routes (Plan 3 Task 5)"
```

---

## Task 6: `/api/projects/:id/facts` routes (GET / POST / PATCH / DELETE)

**Files:**
- Create `packages/server/src/routes/facts.ts`
- Create `packages/server/src/routes/__tests__/facts.route.test.ts`
- Modify `packages/server/src/index.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import { appendTurn } from '../../services/turnService';
import { addFact } from '../../services/factService';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;
let turnId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'fr-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'P' });
  projectId = p.body.id;
  turnId = appendTurn(app.locals.db, { projectId, mode: 'consult', userText: 'x', aiResponse: { text: '' } }).id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

const auth = () => ({ Authorization: `Bearer ${token}` });

describe('facts routes', () => {
  it('GET facts empty initially', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/facts`).set(auth());
    expect(r.body.facts).toEqual([]);
  });

  it('POST creates a fact (use existing turnId)', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/facts`).set(auth())
      .send({ turnId, kind: 'requirement', text: 'r1' });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
    expect(r.body.kind).toBe('requirement');
  });

  it('POST validates kind enum', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/facts`).set(auth())
      .send({ turnId, kind: 'invalid', text: 'r1' });
    expect(r.status).toBe(400);
  });

  it('POST validates non-empty text', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/facts`).set(auth())
      .send({ turnId, kind: 'requirement', text: '' });
    expect(r.status).toBe(400);
  });

  it('GET with ?kind filter', async () => {
    const db = app.locals.db;
    addFact(db, { projectId, turnId, kind: 'requirement', text: 'r' });
    addFact(db, { projectId, turnId, kind: 'page', text: 'p' });
    const r = await request(app).get(`/api/projects/${projectId}/facts?kind=page`).set(auth());
    expect(r.body.facts).toHaveLength(1);
    expect(r.body.facts[0].kind).toBe('page');
  });

  it('PATCH replaces text with supersede (new fact + old marked superseded_by new)', async () => {
    const db = app.locals.db;
    const old = addFact(db, { projectId, turnId, kind: 'requirement', text: 'old' });
    const r = await request(app).patch(`/api/projects/${projectId}/facts/${old.id}`).set(auth())
      .send({ text: 'new' });
    expect(r.status).toBe(200);
    expect(r.body.text).toBe('new');
    expect(r.body.id).not.toBe(old.id);
    const list = (await request(app).get(`/api/projects/${projectId}/facts`).set(auth())).body.facts;
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('new');
  });

  it('DELETE marks superseded (soft delete) — listFacts no longer returns it', async () => {
    const db = app.locals.db;
    const f = addFact(db, { projectId, turnId, kind: 'requirement', text: 'x' });
    const r = await request(app).delete(`/api/projects/${projectId}/facts/${f.id}`).set(auth());
    expect(r.status).toBe(200);
    const list = (await request(app).get(`/api/projects/${projectId}/facts`).set(auth())).body.facts;
    expect(list).toEqual([]);
  });

  it('401 without auth', async () => {
    const r = await request(app).get(`/api/projects/${projectId}/facts`);
    expect(r.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `routes/facts.ts`**

```typescript
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { getProject } from '../services/projectService.js';
import { addFact, listFacts, getFact, supersedeFact, type FactKind } from '../services/factService.js';
import { getTurn } from '../services/turnService.js';

const VALID_KINDS: FactKind[] = ['requirement', 'page', 'constraint', 'decision'];

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function ensureProject(db: Database.Database, projectId: string, userId: string, res: Response): boolean {
  const p = getProject(db, projectId);
  if (!p || p.ownerId !== userId) { fail(res, 404, 'NOT_FOUND', '專案不存在'); return false; }
  return true;
}

export function buildFactsRouter(db: Database.Database): Router {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);

  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    if (!ensureProject(db, projectId, req.user!.id, res)) return;
    const kindRaw = req.query.kind;
    const kind = typeof kindRaw === 'string' && (VALID_KINDS as string[]).includes(kindRaw)
      ? (kindRaw as FactKind) : undefined;
    res.json({ facts: listFacts(db, projectId, { kind }) });
  });

  r.post('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    if (!ensureProject(db, projectId, req.user!.id, res)) return;
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
    if (!ensureProject(db, projectId, req.user!.id, res)) return;
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
    if (!ensureProject(db, projectId, req.user!.id, res)) return;
    const factId = req.params.factId as string;
    const f = getFact(db, factId);
    if (!f || f.projectId !== projectId) { fail(res, 404, 'NOT_FOUND', 'fact 不存在'); return; }
    // soft delete: supersede with itself (sentinel) — or mark with a "deleted" marker.
    // Simpler approach: mark with sentinel uuid 'deleted-' + own id.
    // We'll instead mark supersededBy = '__deleted__' (constant). listFacts already filters by NULL.
    db.prepare('UPDATE extracted_facts SET superseded_by = ? WHERE id = ?').run('__deleted__', factId);
    res.json({ ok: true });
  });

  return r;
}
```

- [ ] **Step 4: Wire into `index.ts`**

```typescript
import { buildFactsRouter } from './routes/facts.js';
// after turns router:
app.use('/api/projects/:id/facts', buildFactsRouter(db));
```

- [ ] **Step 5: Run → PASS** (8 new tests)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/facts.ts packages/server/src/routes/__tests__/facts.route.test.ts packages/server/src/index.ts
git commit -m "feat(server): add /api/projects/:id/facts (CRUD with soft-delete via supersede) (Plan 3 Task 6)"
```

---

## Task 7: Final verify + push

- [ ] **Step 1: All tests pass**

```bash
cd D:/Projects/_HomeProject/project-bridge
pnpm --filter @designbridge/server test
```

Expected: ~76 tests pass (43 prior + 8 turnService + 6 factService + 5 memorySnapshot + 7 factExtractor + 7 turns route + 8 facts route = 84).

- [ ] **Step 2: 4 builds green**

```bash
pnpm --filter @designbridge/server build
pnpm --filter @designbridge/client build
pnpm --filter ./legacy/packages/server build
pnpm --filter ./legacy/packages/client build
```

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Acceptance Criteria

- [ ] turnService: appendTurn / listTurns(with mode + limit) / getTurn — all tested
- [ ] factService: addFact / listFacts(excludes superseded) / supersedeFact / getFact — all tested
- [ ] memorySnapshot: returns facts + recent N turns + earlier count + activeArtifactId — tested
- [ ] factExtractor: parses `<facts>...</facts>` JSON tail, filters invalid kinds + empty text — tested
- [ ] /api/projects/:id/turns: GET list (with mode filter) + GET single (with 404 boundary) — tested
- [ ] /api/projects/:id/facts: GET / POST / PATCH (supersede) / DELETE (soft) — tested
- [ ] All builds + push clean

---

## Compiler Invariant (held)

> A Turn is the unit of cross-mode memory. Facts are AI-extracted structured summaries of turns. A memory snapshot = facts + recent turns + earlier count. Plan 7 chat endpoint will compose snapshot + skill bodies + mode system prompt into the prompt sent to `callProvider`.

---

## Risks / Notes

1. **Setup race / single-user constraint**: Plan 1's auth setup is single-user. Tests for cross-user isolation are limited. M2 multi-user infra can add proper testing.
2. **Soft-delete via `superseded_by = '__deleted__'` sentinel** — a clean alternative would be a separate `deleted_at` column, but that's schema drift. For M1 the sentinel works.
3. **Token budget** is encoded as `maxRecentTurns` (default 20). No real tokenizer; Plan 7 chat endpoint can refine if needed.

---

**Plan end. 7 Tasks. After this plan: a service can call `buildMemorySnapshot(db, projectId, {})` and get everything needed for Plan 7 chat prompt assembly.**
