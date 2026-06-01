# Plan 13 — Socket.io Multi-User Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Multiple users viewing the same project see each other's chat turns, facts, and artifacts appear live without page refresh. After this plan, opening the same project URL in two tabs/browsers and chatting in one tab makes the other tab update in real time.

**Architecture:** Server side: integrate `socket.io` into the existing express HTTP server. Clients connect with `auth: { token }`; the server validates the session and joins them to a `project:<id>` room. Whenever `appendTurn`, `addFact`, or `createArtifact` writes to DB, also emit a tiny event into the relevant room (`turn:created`, `fact:created`, `artifact:created`) carrying just the entity ID. Client side: `useSocketSync` hook subscribes to the current project's room and triggers `refresh()` on the relevant hooks (`useTurns`, `useFacts`, `useArtifacts`). Tiny events + refetch-on-event keeps server logic simple (no diff propagation).

**Tech Stack:** `socket.io ^4.7` (server) + `socket.io-client ^4.7` (client). One new dep on each side. Validates against existing session table.

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 7 (collaboration).

**Scope boundary (out of plan):** NO cursor presence / typing indicators (M2). NO conflict resolution (writes are last-write-wins; M1 has no editing yet). NO room of online users displayed. NO server-to-server scale (single-process). NO selective sync per mode.

---

## File Structure

```
packages/server/src/
  realtime/
    socketServer.ts             ← initSocketServer(httpServer, db); exports emitToProject(projectId, event, payload)
    __tests__/socketServer.test.ts
  index.ts                      ← MODIFY: createServer(app) + initSocketServer
  services/turnService.ts       ← MODIFY: emit 'turn:created' after insert
  services/factService.ts       ← MODIFY: emit 'fact:created' after insert
  services/artifactService.ts   ← MODIFY: emit 'artifact:created' after insert
  package.json                  ← add socket.io ^4.7

packages/client/
  package.json                  ← add socket.io-client ^4.7
  src/
    lib/socket.ts               ← getSocket(): cached socket.io-client instance
    hooks/useSocketSync.ts      ← subscribe to room + dispatch refreshes
    pages/workspace/WorkspacePage.tsx  ← MODIFY: useSocketSync(projectId, { onTurn, onFact, onArtifact })
    pages/workspace/ConsultStage.tsx
    pages/workspace/ArchitectStage.tsx
    pages/workspace/DesignStage.tsx
```

---

## Task 1: Server — socketServer module

**Files:**
- Modify `packages/server/package.json`: add `socket.io ^4.7.5`
- Run `pnpm install`
- Create `packages/server/src/realtime/socketServer.ts`
- Create `packages/server/src/realtime/__tests__/socketServer.test.ts`

### socketServer.ts

```typescript
import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type Database from 'better-sqlite3';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer, db: Database.Database): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
    path: '/socket.io',
  });

  io.use((socket: Socket, next: (err?: Error) => void) => {
    const token = (socket.handshake.auth?.token as string | undefined)
      ?? (socket.handshake.headers?.authorization as string | undefined)?.replace(/^Bearer /, '');
    if (!token) return next(new Error('AUTH_REQUIRED'));

    const row = db.prepare(`
      SELECT s.user_id, s.expires_at FROM sessions s WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
    `).get(token) as { user_id: string; expires_at: string } | undefined;
    if (!row) return next(new Error('SESSION_INVALID'));

    (socket.data as { userId?: string }).userId = row.user_id;
    next();
  });

  io.on('connection', (socket: Socket) => {
    socket.on('project:join', (projectId: string) => {
      if (typeof projectId !== 'string' || !projectId) return;
      const userId = (socket.data as { userId?: string }).userId;
      const project = db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(projectId) as { owner_id: string } | undefined;
      if (!project || project.owner_id !== userId) {
        socket.emit('project:error', { code: 'NOT_FOUND' });
        return;
      }
      void socket.join(`project:${projectId}`);
      socket.emit('project:joined', { projectId });
    });
    socket.on('project:leave', (projectId: string) => {
      if (typeof projectId === 'string') void socket.leave(`project:${projectId}`);
    });
  });

  return io;
}

export function emitToProject(projectId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`project:${projectId}`).emit(event, payload);
}

/** test-only: tear down the singleton */
export function _resetSocketServer(): void {
  if (io) {
    io.close();
    io = null;
  }
}
```

### Tests

For the test, spin up a real HTTP server + connect with socket.io-client. Add `socket.io-client` to **devDependencies** for testing.

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { createApp } from '../../index';
import { initSocketServer, emitToProject, _resetSocketServer } from '../socketServer';
import request from 'supertest';

let httpServer: ReturnType<typeof createServer>;
let dataDir: string;
let port: number;
let token: string;
let projectId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sk-'));
  const app = createApp({ dataDir });
  httpServer = createServer(app);
  initSocketServer(httpServer, app.locals.db);
  await new Promise<void>((resolve) => { httpServer.listen(0, () => resolve()); });
  port = (httpServer.address() as { port: number }).port;
  const r = await request(`http://127.0.0.1:${port}`).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(`http://127.0.0.1:${port}`).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(async () => {
  _resetSocketServer();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

function connect(authToken?: string): ClientSocket {
  return ioClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    auth: authToken ? { token: authToken } : {},
    reconnection: false,
  });
}

describe('socketServer', () => {
  it('rejects connect without auth', async () => {
    const s = connect();
    const err = await new Promise<Error>((resolve) => s.on('connect_error', resolve));
    expect(err.message).toBe('AUTH_REQUIRED');
    s.close();
  });

  it('connects with valid token and joins project', async () => {
    const s = connect(token);
    await new Promise<void>((resolve) => s.on('connect', () => resolve()));
    const joined = new Promise<{ projectId: string }>((resolve) => s.on('project:joined', resolve));
    s.emit('project:join', projectId);
    expect(await joined).toEqual({ projectId });
    s.close();
  });

  it('emitToProject delivers events to joined clients', async () => {
    const s = connect(token);
    await new Promise<void>((resolve) => s.on('connect', () => resolve()));
    await new Promise<void>((resolve) => { s.on('project:joined', () => resolve()); s.emit('project:join', projectId); });

    const received = new Promise<{ id: string }>((resolve) => s.on('turn:created', resolve));
    emitToProject(projectId, 'turn:created', { id: 't1' });
    expect(await received).toEqual({ id: 't1' });
    s.close();
  });

  it('rejects project:join for non-owned project', async () => {
    const s = connect(token);
    await new Promise<void>((resolve) => s.on('connect', () => resolve()));
    const err = new Promise<{ code: string }>((resolve) => s.on('project:error', resolve));
    s.emit('project:join', 'not-mine');
    expect(await err).toEqual({ code: 'NOT_FOUND' });
    s.close();
  });
});
```

- [ ] Add deps + install + create module + tests pass
- [ ] Commit: `feat(server): add socket.io realtime server with project rooms (Plan 13 Task 1)`

---

## Task 2: Wire socket server in index.ts + emit from services

**Files:**
- Modify `packages/server/src/index.ts`
- Modify `packages/server/src/services/turnService.ts`
- Modify `packages/server/src/services/factService.ts`
- Modify `packages/server/src/services/artifactService.ts`

### index.ts changes

Currently `createApp({dataDir})` returns an Express app. Plan 13 keeps that shape but adds an optional `startServer` helper that wires socket.io. The main entry script transitions from `app.listen()` to `createServer(app).listen()` + `initSocketServer`.

```typescript
import { createServer } from 'node:http';
import { initSocketServer } from './realtime/socketServer.js';

// near the bottom where the main script bootstraps:
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createApp({ dataDir: process.env.DATA_DIR ?? './data' });
  const httpServer = createServer(app);
  initSocketServer(httpServer, app.locals.db);
  httpServer.listen(Number(process.env.PORT ?? 3001), () => {
    console.log(`listening on ${process.env.PORT ?? 3001}`);
  });
}
```

The existing test pattern of `createApp({dataDir})` returning an Express app stays — `app.locals.db` already exposes the DB so tests can drive emit if needed. The socket.io tests in Task 1 already cover the realtime path explicitly.

### Service changes

After each successful insert, emit:

```typescript
// turnService.ts
import { emitToProject } from '../realtime/socketServer.js';

export function appendTurn(db, opts): Turn {
  // ... existing insert ...
  const turn: Turn = { /* existing build */ };
  emitToProject(opts.projectId, 'turn:created', { id: turn.id, mode: turn.mode });
  return turn;
}
```

Same pattern for `addFact` (emit `fact:created` with `{id, kind}`) and `createArtifact` (emit `artifact:created` with `{id, kind, name}`).

`emitToProject` is a no-op when `io` is null (e.g. in tests that don't init the socket server) — so existing service tests continue to pass without modification.

- [ ] Implement + ensure ALL existing 180 tests still pass
- [ ] Commit: `feat(server): emit socket events on turn/fact/artifact create (Plan 13 Task 2)`

---

## Task 3: Client — socket.io-client + useSocketSync hook

**Files:**
- Modify `packages/client/package.json`: add `socket.io-client ^4.7.5`
- `pnpm install`
- Create `packages/client/src/lib/socket.ts`
- Create `packages/client/src/hooks/useSocketSync.ts`

### lib/socket.ts

```typescript
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocket(token: string | null): Socket | null {
  if (!token) return null;
  if (socket && currentToken === token && socket.connected) return socket;
  if (socket) socket.close();
  currentToken = token;
  socket = io({ auth: { token }, transports: ['websocket'], reconnection: true });
  return socket;
}

export function closeSocket(): void {
  if (socket) socket.close();
  socket = null;
  currentToken = null;
}
```

### hooks/useSocketSync.ts

```typescript
import { useEffect } from 'react';
import { getSocket } from '../lib/socket';

interface Handlers {
  onTurn?: (payload: { id: string; mode: string }) => void;
  onFact?: (payload: { id: string; kind: string }) => void;
  onArtifact?: (payload: { id: string; kind: string; name: string }) => void;
}

export function useSocketSync(projectId: string | null, handlers: Handlers): void {
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!projectId || !token) return;
    const s = getSocket(token);
    if (!s) return;

    const join = () => s.emit('project:join', projectId);
    if (s.connected) join();
    else s.once('connect', join);

    const onTurn = handlers.onTurn ?? (() => {});
    const onFact = handlers.onFact ?? (() => {});
    const onArtifact = handlers.onArtifact ?? (() => {});

    s.on('turn:created', onTurn);
    s.on('fact:created', onFact);
    s.on('artifact:created', onArtifact);

    return () => {
      s.emit('project:leave', projectId);
      s.off('turn:created', onTurn);
      s.off('fact:created', onFact);
      s.off('artifact:created', onArtifact);
    };
  }, [projectId, token, handlers.onTurn, handlers.onFact, handlers.onArtifact]);
}
```

- [ ] Implement
- [ ] Build passes
- [ ] Commit: `feat(client): add socket.io-client + useSocketSync hook (Plan 13 Task 3)`

---

## Task 4: Wire useSocketSync into the workspace

**Files:**
- Modify `packages/client/src/pages/workspace/ConsultStage.tsx`
- Modify `packages/client/src/pages/workspace/ArchitectStage.tsx`
- Modify `packages/client/src/pages/workspace/DesignStage.tsx`
- Also Modify `packages/client/src/pages/workspace/LeftRail.tsx` (to refetch on events)

Approach: each stage already owns its `refresh` callbacks. Add `useSocketSync(projectId, { onTurn: refreshTurns, onArtifact: refreshArtifacts })` per stage. LeftRail needs its own refresh — extract its load logic into a `useCallback` and add `useSocketSync(projectId, { onTurn: load, onFact: load, onArtifact: load })`.

Example for ConsultStage:

```tsx
import { useSocketSync } from '../../hooks/useSocketSync';

// inside the component:
useSocketSync(projectId, { onTurn: refreshTurns });
```

For LeftRail (refactor):

```tsx
import { useCallback } from 'react';
import { useSocketSync } from '../../hooks/useSocketSync';

// inside the component:
const load = useCallback(() => {
  if (!projectId) return;
  api<{ turns: Turn[] }>(`/api/projects/${projectId}/turns`).then(r => setTurns(r.turns)).catch(() => {});
  api<{ facts: Fact[] }>(`/api/projects/${projectId}/facts`).then(r => setFacts(r.facts)).catch(() => {});
  api<{ skills: Skill[] }>(`/api/projects/${projectId}/skills`).then(r => setSkills(r.skills)).catch(() => {});
}, [projectId]);

useEffect(() => { load(); }, [load]);
useSocketSync(projectId, { onTurn: load, onFact: load, onArtifact: load });
```

For ArchitectStage and DesignStage:

```tsx
useSocketSync(projectId, { onTurn: refreshTurns, onArtifact: refreshArtifacts });
```

**De-duplication note**: when the user sends a message themselves, the chat SSE flow already calls `refresh()` after `done`. The socket event will arrive around the same time and trigger ANOTHER refresh. Two refetches in close succession is harmless. The benefit shows when ANOTHER user/tab posts — that's the only path that doesn't have a local refresh.

- [ ] Implement + builds pass
- [ ] Commit: `feat(client): subscribe to socket events in stages + LeftRail (Plan 13 Task 4)`

---

## Task 5: Verify + push

- All 4 builds green
- Server tests ~184 (was 180 + ~4 socket)
- Manual smoke (describe only — no execution):
  - Open `/projects/:id` in tab A and tab B with same login
  - Send a chat in A → B sees the turn appear in transcript + LeftRail within ~1s
  - Send an architect message in A producing a page-graph → B sees graph update
  - Disconnect network → reconnects automatically (socket.io built-in reconnection)
- Push

---

## Acceptance Criteria

- [ ] Socket server rejects unauthenticated connections
- [ ] Socket server validates token against sessions table with same expiry semantics as REST
- [ ] `project:join` validates owner; non-owner gets `project:error`
- [ ] `emitToProject` is a no-op when socket server isn't initialized (preserves existing service tests)
- [ ] turnService/factService/artifactService emit events on insert
- [ ] Client `getSocket()` is a singleton per token
- [ ] `useSocketSync` joins room on mount, leaves on unmount, no leaks across project nav
- [ ] All 3 stages + LeftRail refetch on relevant events
- [ ] All existing tests still pass
- [ ] all builds + push clean

---

## Risks / Notes

1. **WebSocket transport only**: skipping the long-polling fallback simplifies setup but breaks on networks that block WS. Acceptable for intra-team / local-network usage. M2 can re-enable polling fallback.
2. **Cors**: `origin: true, credentials: true` lets any same-host origin connect. Production behind a single domain → fine. If served from a different origin, add explicit origin allowlist.
3. **No backpressure**: a chat burst could fire many `turn:created` events. Client refresh is debounced naturally by browser scheduling, but if it becomes a problem M2 can introduce a 250ms trailing debounce in `useSocketSync`.
4. **Singleton socket across browser navigation**: `getSocket()` caches by token; navigating between projects reuses the connection (just changes the room). Logout should call `closeSocket()` — see `useAuthStore.logout()` and add `closeSocket()` at the end. Verify existing logout flow before adding.
5. **Test cleanup**: `_resetSocketServer()` must be called between socket tests to prevent `EADDRINUSE` on repeat. The plan's test scaffold already handles this.
6. **Owner-id check duplicated**: the socket middleware re-validates session + project ownership. This is the same logic as REST middleware; M2 can extract to a shared helper.

---

**Plan end. 5 Tasks. Multi-user live sync works.**
