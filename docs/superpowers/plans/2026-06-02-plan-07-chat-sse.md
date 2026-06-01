# Plan 7 — Chat SSE Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** The chat endpoint `POST /api/projects/:id/chat` that ties everything together. Streams SSE events as the AI thinks and answers, persists the Turn + extracted facts, attaches ingested attachments. After this plan, a curl-able end-to-end AI conversation works.

**Architecture:** A single route handler that: (1) validates input + project ownership; (2) parses slash command; (3) loads memory snapshot + skill description list; (4) optionally loads slash-forced skill body; (5) opens SSE; (6) starts keepalive; (7) calls `callProvider` (streaming) with assembled system prompt; (8) buffers full AI text; (9) emits `phase` / `thinking_token` / `token` / `done` events; (10) on completion, parses `<facts>` block, calls `appendTurn` + bulk `addFact`. Errors emit `event: error`.

**Tech Stack:** Existing — no new deps. Reuses callProvider (§ Plan 2), memorySnapshot/turnService/factService/factExtractor (Plan 3), skillRegistry (Plan 4), parseSlashCommand (Plan 5), sseKeepalive (Plan 2), ingestionService (Plan 6).

**Spec:** [`../specs/2026-06-01-designbridge-redesign-design.md`](../specs/2026-06-01-designbridge-redesign-design.md) § 8.3 (SSE event format).

**Scope boundary (out of plan):** NO council (Plan 12). NO Socket.io broadcast (Plan 13). NO native Anthropic extended thinking (M2). NO artifact generation from chat (Plans 10/11 for architect/design modes do that). Chat in this plan: parses thinking from `<thinking>...</thinking>` blocks emitted by the AI.

---

## File Structure

```
packages/server/src/
  routes/
    chat.ts                    ← SSE handler for POST /api/projects/:id/chat
    __tests__/
      chat.route.test.ts       ← supertest + mocked callProvider
  services/
    chatOrchestrator.ts        ← buildSystemPrompt(skillList, memorySnapshot, modeSysPrompt, slashSkillBody)
    __tests__/
      chatOrchestrator.test.ts
```

---

## Task 1: `chatOrchestrator` — system prompt assembly

**Files:**
- Create `packages/server/src/services/chatOrchestrator.ts`
- Create `packages/server/src/services/__tests__/chatOrchestrator.test.ts`

### API

```typescript
export interface BuildPromptOpts {
  mode: 'consult' | 'architect' | 'design';
  memorySnapshot: MemorySnapshot;
  skillDescriptions: string;         // pre-formatted "Available skills:\n- name: desc\n…"
  forcedSkillBody?: string;          // from slash command
  attachments?: Array<{ kind: string; parsedText?: string; originalName: string }>;
}

export function buildSystemPrompt(opts: BuildPromptOpts): string;
```

The output is a single string the chat route passes to `callProvider({systemInstruction})`. The mode-specific base prompt is already in `callProvider`, so `chatOrchestrator` just produces the **per-turn** addition: memory, skills, attachments, slash-forced skill.

Order of sections in the string:
1. `## Facts known about this project` (from snapshot.facts) — if any
2. `## Recent conversation` (from snapshot.turns, formatted as `[mode] User: ... | AI: ...`) — if any
3. `## Earlier conversation` (only `(N earlier turns omitted for brevity.)` if snapshot.earlierTurnCount > 0)
4. `## Active artifact: <id>` — if snapshot.activeArtifactId
5. `## Available skills` — the skill descriptions list
6. `## Forced skill body` (from slash command, full body) — if present
7. `## Attachments` — if any: list `originalName + (parsedText truncated to 2000 chars)` per attachment
8. **Closing instruction**: "If you produce structured facts, append a `<facts>...</facts>` JSON block at the end of your answer with `[{kind, text}, ...]`."

- [ ] Tests cover:
  - Empty snapshot → minimal prompt with skill list only
  - Snapshot with facts + turns → both sections present in order
  - earlierTurnCount > 0 → notice present
  - forcedSkillBody → "Forced skill body" section present, body inlined
  - attachments with parsedText → section present, names + (truncated) text
  - closing instruction always present
- [ ] Implement
- [ ] Tests pass
- [ ] Commit: `feat(server): add chatOrchestrator buildSystemPrompt (Plan 7 Task 1)`

---

## Task 2: `routes/chat.ts` SSE handler

**Files:**
- Create `packages/server/src/routes/chat.ts`
- Create `packages/server/src/routes/__tests__/chat.route.test.ts`
- Modify `packages/server/src/index.ts`

### Endpoint behavior

`POST /api/projects/:id/chat` (NOT `GET` — POST is correct for chat input even though we stream the response back; clients use `fetch` + ReadableStream reader).

Request body:
```json
{ "mode": "consult"|"architect"|"design", "text": "string", "attachmentIds": ["..."] }
```

Response:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache, no-transform`
- `X-Accel-Buffering: no` (nginx)
- Sequence of `event:` records as listed below

### Event sequence

```
event: phase
data: {"phase":"loading_memory"}

event: phase
data: {"phase":"selecting_skills","skills":["a","b"]}

event: phase
data: {"phase":"thinking"}

event: thinking_token
data: {"text":"..."}
…

event: phase
data: {"phase":"answering"}

event: token
data: {"text":"..."}
…

event: done
data: {"turnId":"...","tokens":{...}}

: heartbeat                        (every 15s during streaming)
```

If error:
```
event: error
data: {"code":"PROVIDER_TIMEOUT","message":"…"}
```

### Implementation outline

```typescript
import { Router, type Request, type Response } from 'express';
import type Database from 'better-sqlite3';
import { requireAuth } from '../middleware/auth.js';
import { getProject } from '../services/projectService.js';
import { buildMemorySnapshot } from '../services/memorySnapshot.js';
import { listSkills, readSkill, getSystemPromptSkillList } from '../services/skillRegistry.js';
import { parseSlashCommand } from '../services/slashCommand.js';
import { callProvider } from '../services/callProvider.js';
import { startSseKeepalive, stopSseKeepalive } from '../utils/sseKeepalive.js';
import { appendTurn, type TurnMode } from '../services/turnService.js';
import { addFact } from '../services/factService.js';
import { parseFactsFromResponse } from '../services/factExtractor.js';
import { getAttachment, type Attachment } from '../services/ingestionService.js';

const VALID_MODES: TurnMode[] = ['consult','architect','design'];

function sse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function buildChatRouter(db: Database.Database): Router {
  const r = Router({ mergeParams: true });
  r.use(requireAuth);

  r.post('/', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project || project.ownerId !== req.user!.id) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { mode, text, attachmentIds } = req.body ?? {};
    if (!(VALID_MODES as string[]).includes(mode)) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'mode 必須是 consult/architect/design' } });
      return;
    }
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 text' } });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const keepalive = startSseKeepalive(res, 15_000);

    try {
      sse(res, 'phase', { phase: 'loading_memory' });
      const snapshot = buildMemorySnapshot(db, projectId, {});

      // Skills
      const slashCmd = parseSlashCommand(text.trim());
      const forcedSkill = slashCmd ? readSkill(slashCmd.skill, { projectId }) : null;
      const skillDescriptions = getSystemPromptSkillList({ projectId });
      const allSkillNames = listSkills({ projectId }).map(s => s.name);
      sse(res, 'phase', { phase: 'selecting_skills', skills: allSkillNames });

      // Attachments
      const attachments: Attachment[] = [];
      if (Array.isArray(attachmentIds)) {
        for (const aid of attachmentIds) {
          const a = getAttachment(db, String(aid));
          if (a && a.projectId === projectId) attachments.push(a);
        }
      }

      // Compose system prompt
      const { buildSystemPrompt } = await import('../services/chatOrchestrator.js');
      const userSystem = buildSystemPrompt({
        mode, memorySnapshot: snapshot, skillDescriptions,
        forcedSkillBody: forcedSkill?.body,
        attachments: attachments.map(a => ({ kind: a.kind, parsedText: a.parsedText, originalName: a.originalName })),
      });

      sse(res, 'phase', { phase: 'thinking' });

      // Stream from provider
      let inThinkingBlock = false;
      let buffer = '';
      let fullText = '';

      const cleanText = slashCmd ? slashCmd.rest : text.trim();
      for await (const tok of callProvider({ mode, prompt: cleanText, systemInstruction: userSystem, streaming: true })) {
        fullText += tok;
        buffer += tok;
        // Detect <thinking>...</thinking> blocks and route tokens accordingly
        while (true) {
          if (!inThinkingBlock) {
            const openIdx = buffer.indexOf('<thinking>');
            if (openIdx === -1) {
              // Emit as 'token' but hold back the last 10 chars in case it's a partial '<thinking>'
              if (buffer.length > 10) {
                const emit = buffer.slice(0, buffer.length - 10);
                if (emit) sse(res, 'token', { text: emit });
                buffer = buffer.slice(buffer.length - 10);
              }
              break;
            }
            // Emit text before the open tag as 'token'
            if (openIdx > 0) sse(res, 'token', { text: buffer.slice(0, openIdx) });
            buffer = buffer.slice(openIdx + '<thinking>'.length);
            inThinkingBlock = true;
            // Note: phase 'thinking' was already emitted at start. The block can be detected mid-stream too.
          } else {
            const closeIdx = buffer.indexOf('</thinking>');
            if (closeIdx === -1) {
              // Emit as thinking_token, hold back last 11 chars
              if (buffer.length > 11) {
                const emit = buffer.slice(0, buffer.length - 11);
                if (emit) sse(res, 'thinking_token', { text: emit });
                buffer = buffer.slice(buffer.length - 11);
              }
              break;
            }
            // Emit text before the close as thinking_token
            if (closeIdx > 0) sse(res, 'thinking_token', { text: buffer.slice(0, closeIdx) });
            buffer = buffer.slice(closeIdx + '</thinking>'.length);
            inThinkingBlock = false;
            sse(res, 'phase', { phase: 'answering' });
          }
        }
      }
      // Flush any remaining buffer
      if (buffer) {
        if (inThinkingBlock) sse(res, 'thinking_token', { text: buffer });
        else sse(res, 'token', { text: buffer });
      }

      // Extract facts + persist turn
      const thinkingText = extractTagText(fullText, 'thinking');
      const answerText = stripTagText(fullText, 'thinking').replace(/<facts>[\s\S]*?<\/facts>/g, '').trim();
      const facts = parseFactsFromResponse(fullText);

      const turn = appendTurn(db, {
        projectId,
        mode: mode as TurnMode,
        userText: text.trim(),
        aiResponse: { text: answerText, thinking: thinkingText || undefined },
        skillsUsed: forcedSkill ? [forcedSkill.name] : undefined,
      });
      for (const f of facts) addFact(db, { projectId, turnId: turn.id, kind: f.kind, text: f.text });

      sse(res, 'done', { turnId: turn.id });
    } catch (err) {
      sse(res, 'error', { code: 'INTERNAL_ERROR', message: (err as Error).message });
    } finally {
      stopSseKeepalive(keepalive);
      res.end();
    }
  });

  return r;
}

function extractTagText(s: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return s.match(re)?.[1]?.trim() ?? '';
}

function stripTagText(s: string, tag: string): string {
  const re = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return s.replace(re, '');
}
```

Wire in `index.ts`:
```typescript
import { buildChatRouter } from './routes/chat.js';
// after ingest router:
app.use('/api/projects/:id/chat', buildChatRouter(db));
```

### Tests

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';
import * as providerModule from '../../services/provider';

let dataDir: string;
let app: ReturnType<typeof createApp>;
let token: string;
let projectId: string;

// Mock the AI provider — return a deterministic streamContent
beforeEach(async () => {
  vi.restoreAllMocks();
  dataDir = mkdtempSync(join(tmpdir(), 'ch-'));
  app = createApp({ dataDir });
  const r = await request(app).post('/api/auth/setup').send({ name: 'A', email: 'a@x.com', password: 'pw12345678' });
  token = r.body.token;
  const p = await request(app).post('/api/projects').set('Authorization', `Bearer ${token}`).send({ name: 'P' });
  projectId = p.body.id;
});
afterEach(() => { app.locals.db?.close(); rmSync(dataDir, { recursive: true, force: true }); });

const auth = () => ({ Authorization: `Bearer ${token}` });

function mockProvider(stream: string[]) {
  vi.spyOn(providerModule, 'getProvider').mockReturnValue({
    streamContent: async function*() { for (const t of stream) yield t; },
    generateContent: vi.fn(),
  } as never);
}

describe('POST /api/projects/:id/chat', () => {
  it('streams events and persists a Turn', async () => {
    mockProvider(['hello ', 'world']);
    const r = await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'consult', text: 'hi' });
    expect(r.status).toBe(200);
    expect(r.text).toContain('event: phase');
    expect(r.text).toContain('event: token');
    expect(r.text).toContain('event: done');
    const turns = await request(app).get(`/api/projects/${projectId}/turns`).set(auth());
    expect(turns.body.turns).toHaveLength(1);
    expect(turns.body.turns[0].userText).toBe('hi');
  });

  it('routes <thinking> tokens to thinking_token events', async () => {
    mockProvider(['<thinking>let me think</thinking>', 'the answer']);
    const r = await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'consult', text: 'hi' });
    expect(r.text).toContain('event: thinking_token');
    expect(r.text).toContain('let me think');
    expect(r.text).toContain('the answer');
  });

  it('parses <facts> block and persists facts', async () => {
    mockProvider(['answer text\n<facts>[{"kind":"requirement","text":"r1"}]</facts>']);
    await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'consult', text: 'hi' });
    const facts = await request(app).get(`/api/projects/${projectId}/facts`).set(auth());
    expect(facts.body.facts).toHaveLength(1);
    expect(facts.body.facts[0].text).toBe('r1');
  });

  it('400 on bad mode', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'bogus', text: 'hi' });
    expect(r.status).toBe(400);
  });

  it('400 on empty text', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'consult', text: '' });
    expect(r.status).toBe(400);
  });

  it('404 on missing project', async () => {
    const r = await request(app).post(`/api/projects/nope/chat`).set(auth()).send({ mode: 'consult', text: 'hi' });
    expect(r.status).toBe(404);
  });

  it('401 without auth', async () => {
    const r = await request(app).post(`/api/projects/${projectId}/chat`).send({ mode: 'consult', text: 'hi' });
    expect(r.status).toBe(401);
  });

  it('slash command forces a skill into prompt', async () => {
    // Provider just captures what systemInstruction came in
    let captured = '';
    vi.spyOn(providerModule, 'getProvider').mockReturnValue({
      streamContent: async function*(params: { systemInstruction?: string }) { captured = params.systemInstruction ?? ''; yield 'ok'; },
      generateContent: vi.fn(),
    } as never);
    await request(app).post(`/api/projects/${projectId}/chat`).set(auth()).send({ mode: 'consult', text: '/consult-clarify-first hello' });
    expect(captured).toContain('Consult'); // matches built-in skill body
  });
});
```

- [ ] Tests pass
- [ ] Wire into createApp
- [ ] Commit: `feat(server): add /api/projects/:id/chat SSE endpoint (Plan 7 Task 2)`

---

## Task 3: Verify + push

- Total tests: ~150 (143 + ~7 chat + ~3 orchestrator)
- All 4 builds green
- Manual smoke (optional): with provider configured, curl-test the SSE endpoint and see real tokens stream
- Push

---

## Acceptance Criteria

- [ ] chatOrchestrator assembles all 8 prompt sections with correct order
- [ ] /api/projects/:id/chat: 400 / 401 / 404 / streams 200 with correct event sequence
- [ ] thinking blocks routed to thinking_token events
- [ ] facts persisted to extracted_facts
- [ ] turn persisted to turns
- [ ] heartbeat 15s during streaming
- [ ] slash command forces skill body into prompt
- [ ] all builds + tests + push clean

---

## Risks / Notes

1. **Thinking parser is stream-aware**: keeps a small buffer (10–11 chars) to handle partial `<thinking>` tags split across token boundaries.
2. **fullText reconstruction**: by re-assembling all tokens we lose the streaming distinction in the saved Turn — Turn stores `text` (answer) + `thinking` (string), which is fine.
3. **Facts in stream**: facts are parsed AFTER full text is available. Client sees them via `/api/projects/:id/facts` follow-up call OR via `done` event (TODO: optionally include in `done`).
4. **No streaming response body parse on the client side**: clients will use `fetch` with `body.getReader()` + manual SSE parsing. Plan 8/9 client implementations.
5. **No cancellation endpoint here**: M2 will add `POST /chat/:turnId/cancel`. M1 can be cancelled by client disconnecting (`res.on('close')` should ideally stop the AI call — the iterator will naturally throw when `res.write` fails after close, which the catch handles).

---

**Plan end. 3 Tasks. Backend AI conversation works end-to-end. Plans 8+ are UI.**
