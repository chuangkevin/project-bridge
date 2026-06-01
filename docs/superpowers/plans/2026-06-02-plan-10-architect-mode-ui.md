# Plan 10 — Architect Mode UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Architect mode lets the user discuss information architecture and see a page-flow graph that the AI authors. AI emits `<artifact kind="page-graph">{...json...}</artifact>` blocks in chat; server persists them; client renders the latest `page-graph` artifact above the chat using `@xyflow/react`. After this plan, the user can ask "幫我設計一個電商網站的頁面結構" → AI replies + graph appears.

**Architecture:** Server side: a small `artifactService` (CRUD + JSON payload to disk under `data/projects/<id>/artifacts/`) and a generic `<artifact>` tag extractor in `chatOrchestrator`'s post-processing. After the chat stream completes, parse `<artifact kind="..." name="...">...</artifact>` blocks from `fullText`, persist each as a row + file, mark `superseded_by` on prior artifacts of the same `kind+name`. Stream a new SSE event `artifact` with the persisted ID after `done`. Client side: `useArtifacts` hook fetches `/api/projects/:id/artifacts?kind=page-graph` for the latest, `ArchitectStage` mounts a vertical split (graph panel top 60%, chat bottom 40%) and renders `<PageGraphViewer>` from xyflow.

**Tech Stack:** `@xyflow/react ^12` (new dep on client). Server: pure Node fs + JSON. No new server deps.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 4.4 (architect mode) + § 5 (artifacts).

**Page-graph artifact payload shape:**
```json
{
  "version": 1,
  "nodes": [
    { "id": "home", "label": "首頁", "type": "page", "description": "..." },
    { "id": "product", "label": "商品頁", "type": "page" }
  ],
  "edges": [
    { "source": "home", "target": "product", "label": "點商品卡" }
  ]
}
```

**Scope boundary (out of plan):** NO node editing/dragging-saves-back-to-AI (user can drag for layout but it doesn't persist). NO sub-pages / nested graphs. NO multiple graphs per project (Plan 11+ may add). NO export to image. NO graph-from-scratch UI (must come through chat).

---

## File Structure

```
packages/server/src/
  services/
    artifactService.ts          ← CRUD + payload file storage
    __tests__/artifactService.test.ts
    chatOrchestrator.ts         ← MODIFY: export parseArtifactsFromResponse
  routes/
    artifacts.ts                ← GET list, GET payload
    __tests__/artifacts.route.test.ts
  routes/chat.ts                ← MODIFY: after fullText, persist artifacts + emit 'artifact' SSE events

packages/client/
  package.json                  ← add @xyflow/react ^12
  src/
    hooks/useArtifacts.ts       ← list artifacts by kind, get payload
    pages/workspace/
      ArchitectStage.tsx        ← REWRITE: graph + composer
      architect/
        PageGraphViewer.tsx     ← xyflow renderer from artifact payload
    styles/architect.css        ← graph panel + xyflow tweaks
```

---

## Task 1: artifactService + chat orchestrator extraction

**Files:**
- Create `packages/server/src/services/artifactService.ts`
- Create `packages/server/src/services/__tests__/artifactService.test.ts`
- Modify `packages/server/src/services/chatOrchestrator.ts` (add `parseArtifactsFromResponse`)

### artifactService API

```typescript
import type Database from 'better-sqlite3';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

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

  // Supersede prior artifacts of same kind+name in same project
  const prior = db.prepare(`
    SELECT id FROM artifacts WHERE project_id = ? AND kind = ? AND name = ? AND superseded_by IS NULL
  `).all(opts.projectId, opts.kind, opts.name) as Array<{ id: string }>;
  if (prior.length > 0) {
    const upd = db.prepare('UPDATE artifacts SET superseded_by = ? WHERE id = ?');
    for (const p of prior) upd.run(id, p.id);
  }

  db.prepare(`
    INSERT INTO artifacts (id, project_id, created_by_turn, kind, name, payload_path, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id, opts.projectId, opts.createdByTurn, opts.kind, opts.name,
    relPath, opts.metadata ? JSON.stringify(opts.metadata) : null,
  );

  return {
    id, projectId: opts.projectId, createdByTurn: opts.createdByTurn,
    kind: opts.kind, name: opts.name, payloadPath: relPath,
    metadata: opts.metadata ?? null, supersededBy: null,
    createdAt: new Date().toISOString(),
  };
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
```

### chatOrchestrator additions

Append to `chatOrchestrator.ts`:

```typescript
export interface ExtractedArtifact {
  kind: 'vue-sfc' | 'page-graph' | 'design-tokens';
  name: string;
  payload: string;
}

const ARTIFACT_RE = /<artifact\s+kind="(vue-sfc|page-graph|design-tokens)"(?:\s+name="([^"]+)")?>([\s\S]*?)<\/artifact>/gi;

export function parseArtifactsFromResponse(fullText: string): ExtractedArtifact[] {
  const out: ExtractedArtifact[] = [];
  let m;
  while ((m = ARTIFACT_RE.exec(fullText)) !== null) {
    out.push({
      kind: m[1] as ExtractedArtifact['kind'],
      name: (m[2] ?? 'untitled').trim(),
      payload: m[3].trim(),
    });
  }
  return out;
}
```

### Tests

- `artifactService.test.ts`:
  - create artifact → file exists at payloadPath, row in DB
  - second create same kind+name → first marked superseded, second is active
  - listArtifacts excludes superseded by default
  - listArtifacts includeSuperseded includes all
  - getArtifact returns by id
  - readArtifactPayload reads file content
- Add 2 tests for `parseArtifactsFromResponse` in existing `chatOrchestrator.test.ts`:
  - single `<artifact kind="page-graph" name="ia">{...}</artifact>` → 1 result
  - multiple artifacts in one response → multiple results

- [ ] Implement + tests pass
- [ ] Commit: `feat(server): add artifactService + artifact tag parser (Plan 10 Task 1)`

---

## Task 2: artifacts REST route + chat.ts integration

**Files:**
- Create `packages/server/src/routes/artifacts.ts`
- Create `packages/server/src/routes/__tests__/artifacts.route.test.ts`
- Modify `packages/server/src/index.ts` (wire route)
- Modify `packages/server/src/routes/chat.ts` (after-stream persistence)

### artifacts.ts

```typescript
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { getProject } from '../services/projectService.js';
import { listArtifacts, getArtifact, readArtifactPayload, type ArtifactKind } from '../services/artifactService.js';

const VALID_KINDS: ArtifactKind[] = ['vue-sfc', 'page-graph', 'design-tokens'];

export function buildArtifactsRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);

  r.get('/', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    if (kind && !(VALID_KINDS as string[]).includes(kind)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'kind 無效' } });
      return;
    }
    const includeSuperseded = req.query.includeSuperseded === 'true';
    res.json({ artifacts: listArtifacts(db, projectId, { kind: kind as ArtifactKind | undefined, includeSuperseded }) });
  });

  r.get('/:artifactId', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const a = getArtifact(db, req.params.artifactId as string);
    if (!a || a.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '產物不存在' } });
      return;
    }
    res.json(a);
  });

  r.get('/:artifactId/payload', (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }
    const a = getArtifact(db, req.params.artifactId as string);
    if (!a || a.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '產物不存在' } });
      return;
    }
    try {
      const payload = readArtifactPayload(dataDir, a);
      if (a.kind === 'page-graph' || a.kind === 'design-tokens') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      } else {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.send(payload);
    } catch (err) {
      res.status(500).json({ error: { code: 'PAYLOAD_READ_FAILED', message: (err as Error).message } });
    }
  });

  return r;
}
```

Wire in `index.ts`:
```typescript
import { buildArtifactsRouter } from './routes/artifacts.js';
// after chat router:
app.use('/api/projects/:id/artifacts', buildArtifactsRouter(db, deps.dataDir));
```

### chat.ts modifications

After the streaming loop completes (BEFORE `sse(res, 'done', ...)`), add:

```typescript
// Persist artifacts found in the response
const artifactBlocks = parseArtifactsFromResponse(fullText);
const persistedArtifactIds: string[] = [];
const artifactsRoot = join(deps.dataDir ?? '', 'projects', projectId, 'artifacts');
for (const block of artifactBlocks) {
  const ext = block.kind === 'vue-sfc' ? 'vue' : 'json';
  const a = createArtifact(db, {
    projectId, createdByTurn: turn.id,
    kind: block.kind, name: block.name,
    payload: block.payload, payloadExt: ext,
    artifactsRoot,
  });
  persistedArtifactIds.push(a.id);
  sse(res, 'artifact', { id: a.id, kind: a.kind, name: a.name });
}
```

**IMPORTANT**: the existing chat.ts route function signature doesn't carry `dataDir`. Two options:
- (a) Change `buildChatRouter(db: Database.Database)` → `buildChatRouter(db, dataDir: string)` and update the `index.ts` call site.
- (b) Pull dataDir from a module-scoped constant set during `createApp`.

Use option (a). Update `index.ts` `app.use('/api/projects/:id/chat', buildChatRouter(db, deps.dataDir))`.

Also: the order of operations is now (1) appendTurn, (2) addFact, (3) createArtifact + emit `artifact` events, (4) emit `done`. The artifact's `created_by_turn` references the turn just created.

Also clean fullText for the persisted Turn so the AI's `<artifact>` block doesn't show in the answer bubble. Add `.replace(/<artifact[\s\S]*?<\/artifact>/gi, '').trim()` to the answerText computation:

```typescript
const answerText = stripTagText(fullText, 'thinking')
  .replace(/<facts>[\s\S]*?<\/facts>/g, '')
  .replace(/<artifact[\s\S]*?<\/artifact>/gi, '')
  .trim();
```

### Tests for artifacts.route.test.ts

- GET / with kind filter
- GET / empty → []
- GET /:id returns artifact
- GET /:id/payload returns JSON content with correct content-type
- 401 without auth, 404 cross-user

### Tests for chat.route.test.ts (modify existing)

- Add test: mock AI emits `<artifact kind="page-graph" name="ia">{"nodes":[],"edges":[]}</artifact>` → response contains `event: artifact` → GET /api/projects/:id/artifacts returns 1 artifact

- [ ] Implement + tests pass (target ~165 total)
- [ ] Commit: `feat(server): add /api/projects/:id/artifacts + chat persists artifacts (Plan 10 Task 2)`

---

## Task 3: client deps + useArtifacts hook

**Files:**
- Modify `packages/client/package.json`: add `"@xyflow/react": "^12.0.0"`
- Run `pnpm install`
- Create `packages/client/src/hooks/useArtifacts.ts`

### useArtifacts.ts

```typescript
import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';

export interface Artifact {
  id: string;
  projectId: string;
  createdByTurn: string;
  kind: 'vue-sfc' | 'page-graph' | 'design-tokens';
  name: string;
  payloadPath: string;
  metadata: Record<string, unknown> | null;
  supersededBy: string | null;
  createdAt: string;
}

export function useArtifacts(projectId: string | null, kind: Artifact['kind']): {
  artifacts: Artifact[];
  latest: Artifact | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await api<{ artifacts: Artifact[] }>(`/api/projects/${projectId}/artifacts?kind=${kind}`);
      setArtifacts(r.artifacts);
    } finally {
      setLoading(false);
    }
  }, [projectId, kind]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { artifacts, latest: artifacts[0] ?? null, loading, refresh };
}

export async function fetchArtifactPayload(projectId: string, artifactId: string): Promise<string> {
  return api<string>(`/api/projects/${projectId}/artifacts/${artifactId}/payload`, { raw: true } as never)
    .catch(async () => {
      // Fallback: use fetch directly so we can read text
      const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactId}/payload`, {
        headers: { ...(getAuthHeader()) },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    });
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

**NOTE**: `api()` may auto-parse JSON. The payload endpoint returns JSON content with content-type `application/json` — so for `page-graph`, `api()` SHOULD return the parsed object. But we typed it as `string`. Simpler: use plain fetch directly. Replace the function body with the fallback path only. Revise:

```typescript
export async function fetchArtifactPayload<T = unknown>(projectId: string, artifactId: string): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/projects/${projectId}/artifacts/${artifactId}/payload`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('json')) return await res.json() as T;
  return await res.text() as unknown as T;
}
```

- [ ] Add dep + install + create hook
- [ ] Build passes
- [ ] Commit: `feat(client): install @xyflow/react + add useArtifacts hook (Plan 10 Task 3)`

---

## Task 4: PageGraphViewer + architect.css + ArchitectStage

**Files:**
- Create `packages/client/src/pages/workspace/architect/PageGraphViewer.tsx`
- Create `packages/client/src/styles/architect.css`
- Modify `packages/client/src/main.tsx` (import architect.css)
- Rewrite `packages/client/src/pages/workspace/ArchitectStage.tsx`

### PageGraphViewer.tsx

```tsx
import { ReactFlow, Background, Controls, MiniMap, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';

export interface PageGraphPayload {
  version?: number;
  nodes: Array<{ id: string; label: string; type?: string; description?: string }>;
  edges: Array<{ source: string; target: string; label?: string }>;
}

function autoLayout(nodes: PageGraphPayload['nodes']): Record<string, { x: number; y: number }> {
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const out: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    out[n.id] = { x: col * 220 + 40, y: row * 130 + 40 };
  });
  return out;
}

export default function PageGraphViewer({ payload }: { payload: PageGraphPayload }) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const positions = autoLayout(payload.nodes);
    const rfNodes = payload.nodes.map((n) => ({
      id: n.id,
      data: { label: n.label },
      position: positions[n.id],
      style: {
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-md)',
        padding: 8,
        fontSize: 12,
        minWidth: 120,
      },
    }));
    const rfEdges = payload.edges.map((e, i) => ({
      id: `${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      style: { stroke: 'var(--accent)' },
      labelStyle: { fill: 'var(--text-muted)', fontSize: 11 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent)' },
    }));
    return { rfNodes, rfEdges };
  }, [payload]);

  if (payload.nodes.length === 0) {
    return (
      <div style={{ padding: 'var(--space-6)', color: 'var(--text-muted)', textAlign: 'center' }}>
        還沒有頁面節點。在下方對話請 AI 幫你規劃網站結構。
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border-subtle)" gap={20} />
        <Controls />
        <MiniMap pannable zoomable style={{ background: 'var(--bg-card)' }} nodeColor="var(--accent)" />
      </ReactFlow>
    </div>
  );
}
```

### architect.css

```css
.architect {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.architect__graph {
  flex: 1 1 60%;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-root);
  min-height: 0;
  position: relative;
}
.architect__graph-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}
.architect__chat {
  flex: 1 1 40%;
  display: flex;
  flex-direction: column;
  min-height: 240px;
}
.architect__graph-label {
  position: absolute;
  top: 8px;
  left: 12px;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--glass-bg);
  padding: 2px 8px;
  border-radius: 4px;
}
```

main.tsx: `import './styles/architect.css';`

### ArchitectStage.tsx

```tsx
import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';
import { useTurns } from '../../hooks/useTurns';
import { useChatStream } from '../../hooks/useChatStream';
import { useArtifacts, fetchArtifactPayload } from '../../hooks/useArtifacts';
import Transcript from './chat/Transcript';
import Composer from './chat/Composer';
import PageGraphViewer, { type PageGraphPayload } from './architect/PageGraphViewer';

export default function ArchitectStage() {
  const { projectId } = useWorkspaceStore();
  const { turns, refresh: refreshTurns } = useTurns(projectId);
  const { state, send, reset } = useChatStream();
  const { latest, refresh: refreshArtifacts } = useArtifacts(projectId, 'page-graph');

  const [graph, setGraph] = useState<PageGraphPayload | null>(null);

  useEffect(() => {
    if (!projectId || !latest) { setGraph(null); return; }
    fetchArtifactPayload<PageGraphPayload>(projectId, latest.id)
      .then(setGraph)
      .catch(() => setGraph(null));
  }, [projectId, latest?.id]);

  const filteredTurns = turns.filter((t) => t.mode === 'architect');

  const pending = state.phase === 'idle' ? null : { userText: pendingRef.current, state };

  const handleSend = async (text: string, attachmentIds: string[]) => {
    if (!projectId) return;
    pendingRef.current = text;
    await send({ projectId, mode: 'architect', text, attachmentIds });
    if (pendingRef.current) {
      await Promise.all([refreshTurns(), refreshArtifacts()]);
      pendingRef.current = '';
      reset();
    }
  };

  return (
    <div className="architect">
      <div className="architect__graph">
        <div className="architect__graph-label">頁面流程 — {latest?.name ?? '尚無'}</div>
        {graph
          ? <PageGraphViewer payload={graph} />
          : (
            <div className="architect__graph-empty">
              {latest ? '載入中…' : '還沒有頁面結構。下方對話讓 AI 幫你規劃。'}
            </div>
          )
        }
      </div>
      <div className="architect__chat">
        <Transcript turns={filteredTurns} pending={pending} />
        <Composer
          projectId={projectId ?? ''}
          disabled={state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'error'}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}

const pendingRef = { current: '' };
```

- [ ] Create + modify
- [ ] Build passes
- [ ] Commit: `feat(client): add PageGraphViewer + wire ArchitectStage (Plan 10 Task 4)`

---

## Task 5: Verify + push

- All 4 builds green
- Server tests: target ~165 (was 157 + ~6 artifact service + ~5 routes + ~2 orchestrator extension - some chat test addition)
- Push

---

## Acceptance Criteria

- [ ] artifactService persists payload to disk + DB row with supersede-by-kind+name semantics
- [ ] parseArtifactsFromResponse extracts all `<artifact>` blocks correctly
- [ ] GET /api/projects/:id/artifacts?kind=page-graph returns active artifacts
- [ ] GET /api/projects/:id/artifacts/:id/payload returns parsed JSON with proper content-type
- [ ] Chat with AI emitting `<artifact kind="page-graph">{...}</artifact>` persists artifact + emits `event: artifact` SSE
- [ ] `<artifact>` blocks stripped from answer text in saved Turn
- [ ] ArchitectStage shows latest graph at top, chat bottom
- [ ] PageGraphViewer renders nodes + edges with auto-grid layout
- [ ] Chat refresh after `done` also refreshes artifacts
- [ ] all builds + tests + push clean

---

## Risks / Notes

1. **`@xyflow/react ^12`** is the React 18 compatible major version. If install fails due to peer deps, try `^11`. CSS path `@xyflow/react/dist/style.css` is identical in both.
2. **Auto-layout is naive grid**: M2 can switch to dagre. Acceptable for M1 — manual drag still works.
3. **No node-click to expand**: clicking a node could show its `description` in the right inspector. M2.
4. **Chat shared between consult/architect/design**: turns are filtered by mode in the stage. The same `<Composer>` + `<Transcript>` work; just different `mode` passed to send.
5. **Artifact in non-architect mode**: design mode also produces artifacts (Plan 11). The parser is mode-agnostic; persistence is the same. Plan 11 will set up `vue-sfc` rendering.
6. **Module-level `pendingRef`**: same hack as ConsultStage — fine for M1.

---

**Plan end. 5 Tasks. Architect mode is live.**
