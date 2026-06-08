# Council Persistence + Phase C Iframe Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the council mode toggle per-project in localStorage, and implement Phase C iframe element-level interaction (click to annotate or quick-regen a specific element).

**Architecture:** Task 1 is a pure client-side state change in ConsultStage. Task 2 wires three subsystems: (a) a bridge script injected into the SFC iframe, (b) a new `POST /api/projects/:id/quick-regen` SSE endpoint, and (c) DesignStage bridge-click UI (mode buttons + floating popup with AnnotateQuickForm / RegenQuickForm).

**Tech Stack:** React 18, TypeScript, Express, better-sqlite3, vitest + supertest (server tests), no new packages required.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `packages/client/src/pages/workspace/ConsultStage.tsx` | Modify | localStorage persistence for council toggle |
| `packages/client/src/lib/sfcRuntime.ts` | Modify | Inject bridge click script into iframe HTML |
| `packages/client/src/pages/workspace/design/VueSfcPreview.tsx` | Modify | Accept `bridgeMode` prop, postMessage to iframe |
| `packages/client/src/pages/workspace/DesignStage.tsx` | Modify | Bridge mode buttons, postMessage listener, bridge popup |
| `packages/client/src/pages/workspace/design/AnnotateQuickForm.tsx` | Create | Small form: content textarea + 新增標註 button |
| `packages/client/src/pages/workspace/design/RegenQuickForm.tsx` | Create | Small form: instruction textarea + 重新生成 button |
| `packages/server/src/routes/quickRegen.ts` | Create | POST /quick-regen SSE endpoint |
| `packages/server/src/index.ts` | Modify | Mount quickRegen router |
| `packages/server/src/routes/__tests__/quickRegen.route.test.ts` | Create | Route unit tests (mocked AI) |

---

## Task 1: Council toggle — localStorage persistence

**Files:**
- Modify: `packages/client/src/pages/workspace/ConsultStage.tsx`

- [ ] **Step 1: Replace the `useState(false)` line and add the key helper + handler**

Open `packages/client/src/pages/workspace/ConsultStage.tsx`. Replace:

```typescript
const [councilEnabled, setCouncilEnabled] = useState(false);
```

With:

```typescript
const COUNCIL_KEY = (pid: string) => `designbridge.council_enabled.${pid}`;

const [councilEnabled, setCouncilEnabled] = useState<boolean>(() => {
  if (!projectId) return false;
  return localStorage.getItem(COUNCIL_KEY(projectId)) === 'true';
});

const handleCouncilChange = (val: boolean) => {
  setCouncilEnabled(val);
  if (projectId) localStorage.setItem(COUNCIL_KEY(projectId), String(val));
};
```

- [ ] **Step 2: Add the `useEffect` to re-read from localStorage when `projectId` changes**

Add this after the `handleCouncilChange` declaration (before the `handleSend` function):

```typescript
useEffect(() => {
  if (!projectId) return;
  const saved = localStorage.getItem(COUNCIL_KEY(projectId));
  setCouncilEnabled(saved === 'true');
}, [projectId]);
```

Also add `useEffect` to the import line at the top (it is already imported via React — confirm `useEffect` is in the import):

```typescript
import { useEffect, useMemo, useState } from 'react';
```

- [ ] **Step 3: Update both onClick handlers to use `handleCouncilChange`**

Find the button `onClick={() => setCouncilEnabled(v => !v)}` and the span with the same handler. Replace both with:

```typescript
// button:
onClick={() => handleCouncilChange(!councilEnabled)}

// span:
onClick={() => handleCouncilChange(!councilEnabled)}
```

After editing, the pill switch section should look like:

```tsx
<button
  role="switch"
  aria-checked={councilEnabled}
  onClick={() => handleCouncilChange(!councilEnabled)}
  style={{ ... }}
>
  ...
</button>
<span ... onClick={() => handleCouncilChange(!councilEnabled)}>
  合議模式（PM / Designer / Engineer / Moderator 四方討論）
</span>
```

- [ ] **Step 4: Build the client to confirm no TypeScript errors**

```bash
cd packages/client && pnpm build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/pages/workspace/ConsultStage.tsx
git commit -m "feat(client): persist council toggle per-project in localStorage"
```

---

## Task 2: Inject bridge script into iframe (`sfcRuntime.ts`)

**Files:**
- Modify: `packages/client/src/lib/sfcRuntime.ts`

- [ ] **Step 1: Add the bridge script just before `</body>` in `buildSfcIframeSrc`**

Open `packages/client/src/lib/sfcRuntime.ts`. Find the closing of the template string — the line that reads `</body>\n</html>\``. Insert the bridge script block immediately before `</body>`:

```typescript
// In buildSfcIframeSrc, the return template string ends with:
//   </body>
// </html>`;
// Change it to include the bridge script before </body>:
```

The new ending of the template string (replace the final `</body>\n</html>\`` section):

```typescript
<script>
(function() {
  let bridgeMode = 'browse';

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'set-bridge-mode') {
      bridgeMode = e.data.mode;
      document.body.style.cursor = bridgeMode !== 'browse' ? 'crosshair' : '';
    }
  });

  document.addEventListener('click', function(e) {
    if (bridgeMode === 'browse') return;
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    const tag = el.tagName.toLowerCase();
    const id = el.id || '';
    const cls = Array.from(el.classList).slice(0, 3).join('.');
    const selector = id ? '#' + id : cls ? '.' + cls : tag;
    const text = (el.textContent || '').trim().slice(0, 40);

    window.parent.postMessage({
      type: 'bridge-click',
      mode: bridgeMode,
      selector: selector,
      tag: tag,
      text: text,
      x: e.clientX,
      y: e.clientY,
    }, '*');
  }, true);
})();
</script>
</body>
</html>`;
```

Note: the `true` at the end of `addEventListener('click', ..., true)` uses the capture phase so the bridge intercepts before Vue's event handlers.

- [ ] **Step 2: Build the client to confirm no TypeScript errors**

```bash
cd packages/client && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/lib/sfcRuntime.ts
git commit -m "feat(client): inject bridge click script into SFC iframe"
```

---

## Task 3: VueSfcPreview — accept `bridgeMode` prop and postMessage to iframe

**Files:**
- Modify: `packages/client/src/pages/workspace/design/VueSfcPreview.tsx`

- [ ] **Step 1: Add the `bridgeMode` prop type and `useEffect` to postMessage**

Replace the entire file content of `packages/client/src/pages/workspace/design/VueSfcPreview.tsx`:

```typescript
import { useMemo, useRef, useEffect } from 'react';
import { buildSfcIframeSrc } from '../../../lib/sfcRuntime';

export default function VueSfcPreview({
  sfc,
  bridgeMode = 'browse',
}: {
  sfc: string;
  bridgeMode?: 'browse' | 'annotate' | 'regen';
}) {
  const html = useMemo(() => buildSfcIframeSrc(sfc), [sfc]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Send bridgeMode into the iframe whenever it changes
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'set-bridge-mode', mode: bridgeMode },
        '*',
      );
    }
  }, [bridgeMode]);

  return (
    <iframe
      ref={iframeRef}
      title="Vue SFC Preview"
      srcDoc={html}
      sandbox="allow-scripts allow-same-origin"
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: 'white',
        borderRadius: 'var(--radius-md)',
      }}
    />
  );
}
```

- [ ] **Step 2: Build the client to confirm no TypeScript errors**

```bash
cd packages/client && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/workspace/design/VueSfcPreview.tsx
git commit -m "feat(client): VueSfcPreview accepts bridgeMode prop, syncs mode to iframe"
```

---

## Task 4: Create `AnnotateQuickForm` component

**Files:**
- Create: `packages/client/src/pages/workspace/design/AnnotateQuickForm.tsx`

- [ ] **Step 1: Create the file**

```typescript
import { useState } from 'react';

interface Props {
  projectId: string;
  bridgeId: string;
  onDone: () => void;
}

export default function AnnotateQuickForm({ projectId, bridgeId, onDone }: Props) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bridgeId, content: content.trim(), label: bridgeId }),
      });
      if (!res.ok) throw new Error(`儲存失敗 (${res.status})`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <textarea
        autoFocus
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="標註內容…"
        rows={3}
        style={{
          width: '100%',
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          fontSize: 12,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      {error && (
        <div style={{ fontSize: 11, color: 'var(--color-error, #ef4444)', marginTop: 4 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={handleSubmit}
          disabled={saving || !content.trim()}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 12,
            cursor: saving || !content.trim() ? 'not-allowed' : 'pointer',
            opacity: saving || !content.trim() ? 0.6 : 1,
          }}
        >
          {saving ? '儲存中…' : '新增標註'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the client to confirm no TypeScript errors**

```bash
cd packages/client && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/workspace/design/AnnotateQuickForm.tsx
git commit -m "feat(client): add AnnotateQuickForm for bridge-click annotations"
```

---

## Task 5: Create `RegenQuickForm` component

**Files:**
- Create: `packages/client/src/pages/workspace/design/RegenQuickForm.tsx`

- [ ] **Step 1: Create the file**

```typescript
interface Props {
  instruction: string;
  onChange: (val: string) => void;
  loading: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function RegenQuickForm({ instruction, onChange, loading, onSubmit, onCancel }: Props) {
  return (
    <div>
      <textarea
        autoFocus
        value={instruction}
        onChange={e => onChange(e.target.value)}
        placeholder="修改指令，例如：把背景改成深藍色…"
        rows={3}
        style={{
          width: '100%',
          padding: '6px 8px',
          borderRadius: 6,
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          fontSize: 12,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          disabled={loading}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--border-primary)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={loading || !instruction.trim()}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 12,
            cursor: loading || !instruction.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !instruction.trim() ? 0.6 : 1,
          }}
        >
          {loading ? '生成中…' : '重新生成'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the client to confirm no TypeScript errors**

```bash
cd packages/client && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/pages/workspace/design/RegenQuickForm.tsx
git commit -m "feat(client): add RegenQuickForm for bridge-click quick regen"
```

---

## Task 6: Server — `quickRegen.ts` route

**Files:**
- Create: `packages/server/src/routes/quickRegen.ts`

The pattern mirrors `design.ts` → `regenerate-page`: load artifact, build prompt, call AI non-streaming, parse artifact, store as new artifact, return JSON. The only difference: the instruction targets a specific CSS selector.

- [ ] **Step 1: Create `packages/server/src/routes/quickRegen.ts`**

```typescript
import { Router, type Request, type Response } from 'express';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { getProject } from '../services/projectService.js';
import { getArtifact, readArtifactPayload, createArtifact } from '../services/artifactService.js';
import { appendTurn } from '../services/turnService.js';
import { callProvider } from '../services/callProvider.js';
import { parseArtifactsFromResponseWithFallback } from '../services/chatOrchestrator.js';

export function buildQuickRegenRouter(db: Database.Database, dataDir: string): Router {
  const r = Router({ mergeParams: true });

  /**
   * POST /api/projects/:id/quick-regen
   * Body: { artifactId: string, bridgeSelector: string, instruction: string }
   *
   * Modifies the element matching bridgeSelector in the given vue-sfc artifact.
   * Stores the result as a new artifact (superseding the old one) and returns it.
   */
  r.post('/quick-regen', async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const project = getProject(db, projectId);
    if (!project) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '專案不存在' } });
      return;
    }

    const { artifactId, bridgeSelector, instruction } = req.body ?? {};
    if (typeof artifactId !== 'string' || !artifactId) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 artifactId' } });
      return;
    }
    if (typeof bridgeSelector !== 'string' || !bridgeSelector) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 bridgeSelector' } });
      return;
    }
    if (typeof instruction !== 'string' || !instruction.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: '需要 instruction' } });
      return;
    }

    const artifact = getArtifact(db, artifactId);
    if (!artifact || artifact.projectId !== projectId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: '產物不存在' } });
      return;
    }

    let originalSource: string;
    try {
      originalSource = readArtifactPayload(dataDir, artifact);
    } catch (err) {
      res.status(500).json({ error: { code: 'PAYLOAD_READ_FAILED', message: (err as Error).message } });
      return;
    }

    const originalName = artifact.name;
    const prompt = `Modify this Vue SFC: find the element matching selector '${bridgeSelector}' and apply this change: '${instruction.trim()}'. Output the complete modified SFC as:
<artifact kind="vue-sfc" name="${originalName}"> ... </artifact>

Original source:
${originalSource}`;

    try {
      let fullText = '';
      for await (const tok of callProvider({ mode: 'design', prompt, streaming: false })) {
        fullText += tok;
      }

      const artifactBlocks = parseArtifactsFromResponseWithFallback(fullText);
      if (artifactBlocks.length === 0) {
        res.status(500).json({ error: { code: 'NO_ARTIFACT', message: 'AI 未產生頁面' } });
        return;
      }

      const artifactsRoot = join(dataDir, 'projects', projectId, 'artifacts');
      const turn = appendTurn(db, {
        projectId,
        mode: 'design',
        userText: `[quick-regen] ${originalName} @ ${bridgeSelector}: ${instruction.trim()}`,
        aiResponse: { text: '[quick regen]' },
      });

      const block = { ...artifactBlocks[0], name: originalName };
      const newArtifact = createArtifact(db, {
        projectId,
        createdByTurn: turn.id,
        kind: 'vue-sfc',
        name: block.name,
        payload: block.payload,
        payloadExt: 'vue',
        artifactsRoot,
      });

      res.json({ artifactId: newArtifact.id });
    } catch (err) {
      const parts: string[] = [];
      let cur: unknown = err;
      while (cur instanceof Error) {
        parts.push(cur.message);
        const code = (cur as Error & { code?: string }).code;
        if (code) parts.push(`(${code})`);
        cur = (cur as Error & { cause?: unknown }).cause;
      }
      const fullMessage = parts.join(' › ') || String(err);
      console.error('[quick-regen] failure:', fullMessage);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: fullMessage } });
    }
  });

  return r;
}
```

- [ ] **Step 2: Build the server to confirm no TypeScript errors**

```bash
cd packages/server && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/quickRegen.ts
git commit -m "feat(server): add POST /quick-regen endpoint for element-level AI regen"
```

---

## Task 7: Wire quickRegen router into `index.ts`

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Add the import**

Add to the import block in `packages/server/src/index.ts` (near the other design-related imports):

```typescript
import { buildQuickRegenRouter } from './routes/quickRegen.js';
```

- [ ] **Step 2: Mount the router**

Add the mount line after the `buildDesignRouter` mount:

```typescript
app.use('/api/projects/:id', buildQuickRegenRouter(db, deps.dataDir));
```

The final order near those lines should look like:

```typescript
app.use('/api/projects/:id', buildCrawlRouter(db, deps.dataDir));
app.use('/api/projects/:id', buildDesignRouter(db, deps.dataDir));
app.use('/api/projects/:id', buildQuickRegenRouter(db, deps.dataDir));  // <-- add this
app.use('/api/projects/:id', buildExportRouter(db, deps.dataDir));
```

- [ ] **Step 3: Build the server to confirm no TypeScript errors**

```bash
cd packages/server && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): mount quickRegen router"
```

---

## Task 8: Server tests for `quickRegen`

**Files:**
- Create: `packages/server/src/routes/__tests__/quickRegen.route.test.ts`

The AI call must be mocked (same approach as design tests). We mock `callProvider` to return a valid SFC artifact block, then verify the route stores and returns a new artifact id.

- [ ] **Step 1: Write the failing tests first**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../index';

// Mock callProvider so no real AI call is made
vi.mock('../../services/callProvider.js', () => ({
  callProvider: vi.fn(async function* () {
    yield `<artifact kind="vue-sfc" name="home">
<template><div>Modified</div></template>
</artifact>`;
  }),
}));

let dataDir: string;
let app: ReturnType<typeof createApp>;
let projectId: string;
let artifactId: string;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'qr-'));
  app = createApp({ dataDir });

  // Create project
  const p = await request(app).post('/api/projects').send({ name: 'P' });
  projectId = p.body.id;

  // We need a real artifact to regenerate. Trigger via the design route which is
  // also backed by the mocked callProvider. However, regenerate-page requires an
  // existing artifactId. Use the artifacts POST route directly via chat — but
  // that is complex. Instead, create an artifact by POSTing to regenerate-page
  // with a fake artifactId pointing to a real file we write manually.
  // Simpler: write the artifact file directly via createArtifact logic re-exported.
  // Since we can't import easily, use the annotate route as a probe and seed via
  // a helper that creates an artifact through a known working endpoint.

  // Use generate-variants path to create an initial artifact first —
  // but that also requires an existing artifact. 
  // The simplest approach: call the internal db directly after creating the app.
  // Access app.locals.db (typed via index.ts).
  const db = (app as any).locals.db;
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { randomUUID } = await import('node:crypto');
  const id = randomUUID();
  const artifactsRoot = join(dataDir, 'projects', projectId, 'artifacts');
  mkdirSync(artifactsRoot, { recursive: true });
  writeFileSync(join(artifactsRoot, `${id}.vue`), '<template><div>Hello</div></template>', 'utf8');

  // Insert a minimal turn first (required FK)
  const { randomUUID: uuid2 } = await import('node:crypto');
  const turnId = uuid2();
  db.prepare(
    `INSERT INTO turns (id, project_id, mode, user_text, ai_response, created_at)
     VALUES (?, ?, 'design', 'seed', '{}', datetime('now'))`,
  ).run(turnId, projectId);

  db.prepare(
    `INSERT INTO artifacts (id, project_id, created_by_turn, kind, name, payload_path, created_at)
     VALUES (?, ?, ?, 'vue-sfc', 'home', ?, datetime('now'))`,
  ).run(id, projectId, turnId, `projects/${projectId}/artifacts/${id}.vue`);

  artifactId = id;
});

afterEach(() => {
  (app as any).locals.db?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('POST /api/projects/:id/quick-regen', () => {
  it('returns 400 when artifactId is missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ bridgeSelector: '.btn', instruction: 'Make it red' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 when bridgeSelector is missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId, instruction: 'Make it red' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 when instruction is missing', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId, bridgeSelector: '.btn' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 404 for unknown project', async () => {
    const r = await request(app)
      .post('/api/projects/no-such/quick-regen')
      .send({ artifactId, bridgeSelector: '.btn', instruction: 'x' });
    expect(r.status).toBe(404);
  });

  it('returns 404 for unknown artifactId', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId: 'no-such-artifact', bridgeSelector: '.btn', instruction: 'x' });
    expect(r.status).toBe(404);
  });

  it('returns 200 with new artifactId on success', async () => {
    const r = await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId, bridgeSelector: '.hero', instruction: '把背景改成深藍色' });
    expect(r.status).toBe(200);
    expect(typeof r.body.artifactId).toBe('string');
    expect(r.body.artifactId).not.toBe(artifactId);
  });

  it('new artifact supersedes old artifact', async () => {
    await request(app)
      .post(`/api/projects/${projectId}/quick-regen`)
      .send({ artifactId, bridgeSelector: '.btn', instruction: 'enlarge' });
    const db = (app as any).locals.db;
    const old = db.prepare('SELECT superseded_by FROM artifacts WHERE id = ?').get(artifactId);
    expect(old.superseded_by).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail before implementation is wired**

```bash
cd packages/server && pnpm test -- quickRegen
```

Expected: Tests fail because the route doesn't exist yet (or all pass if task 7 was done first — that is fine too).

- [ ] **Step 3: Run the full test suite to confirm tests pass**

```bash
cd packages/server && pnpm test
```

Expected: All tests pass (the new tests included).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/__tests__/quickRegen.route.test.ts
git commit -m "test(server): quickRegen route tests with mocked AI"
```

---

## Task 9: DesignStage — bridge mode buttons, listener, popup

**Files:**
- Modify: `packages/client/src/pages/workspace/DesignStage.tsx`

This task adds: (1) bridge state, (2) window `message` listener, (3) mode toggle buttons in the header, (4) bridge click popup, (5) `handleQuickRegen` using fetch + SSE, (6) passes `bridgeMode` to `VueSfcPreview`.

- [ ] **Step 1: Add bridge state declarations**

In `DesignStage.tsx`, add these state declarations after the existing `useState` group (e.g., after `const [showVersionHistory, setShowVersionHistory] = useState(false);`):

```typescript
// Phase C: bridge interaction
const [bridgeMode, setBridgeMode] = useState<'browse' | 'annotate' | 'regen'>('browse');
const [bridgeClick, setBridgeClick] = useState<{
  selector: string;
  tag: string;
  text: string;
  x: number;
  y: number;
} | null>(null);
const [regenInstruction, setRegenInstruction] = useState('');
const [regenning, setRegenning] = useState(false);
```

- [ ] **Step 2: Add the `message` event listener useEffect**

Add this `useEffect` after the existing useEffect blocks (e.g., after the `fetchArtifactPayload` effect):

```typescript
// Listen for bridge-click messages from the SFC iframe
useEffect(() => {
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'bridge-click') {
      setBridgeClick({
        selector: e.data.selector as string,
        tag: e.data.tag as string,
        text: e.data.text as string,
        x: e.data.x as number,
        y: e.data.y as number,
      });
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);
```

- [ ] **Step 3: Add `handleQuickRegen` function**

Add this function alongside the existing handlers (e.g., after `handleSaveAsComponent`):

```typescript
const handleQuickRegen = async () => {
  if (!projectId || !selectedId || !bridgeClick) return;
  setRegenning(true);
  try {
    const res = await fetch(`/api/projects/${projectId}/quick-regen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artifactId: selectedId,
        bridgeSelector: bridgeClick.selector,
        instruction: regenInstruction,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
      throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
    }
    const data = (await res.json()) as { artifactId: string };
    await refreshArtifacts();
    setSelectedId(data.artifactId);
    setBridgeClick(null);
    setRegenInstruction('');
    setBridgeMode('browse');
  } catch (e) {
    alert(`重新生成失敗：${(e as Error).message}`);
  } finally {
    setRegenning(false);
  }
};
```

- [ ] **Step 4: Add bridge mode buttons to the header**

In the `design__header` div, add the two bridge mode toggle buttons right before the `design__tabs` div (or after the `🔗 參考網站` button):

```tsx
{selectedId && (
  <button
    className="design__btn"
    onClick={() => {
      setBridgeMode(bridgeMode === 'annotate' ? 'browse' : 'annotate');
      setBridgeClick(null);
    }}
    style={{ background: bridgeMode === 'annotate' ? 'var(--accent-glass)' : undefined }}
    title="點擊元素新增標註"
  >
    🖊 標註
  </button>
)}
{selectedId && (
  <button
    className="design__btn"
    onClick={() => {
      setBridgeMode(bridgeMode === 'regen' ? 'browse' : 'regen');
      setBridgeClick(null);
    }}
    style={{ background: bridgeMode === 'regen' ? 'var(--accent-glass)' : undefined }}
    title="點擊元素快速重生成"
  >
    ⚡ 重生成
  </button>
)}
```

- [ ] **Step 5: Pass `bridgeMode` to `VueSfcPreview` and add imports**

In the `design__preview` div, change:

```tsx
<VueSfcPreview sfc={sfcSource} key={selectedId} />
```

to:

```tsx
<VueSfcPreview sfc={sfcSource} key={selectedId} bridgeMode={bridgeMode} />
```

Add the new component imports at the top of DesignStage.tsx (alongside the existing imports):

```typescript
import AnnotateQuickForm from './design/AnnotateQuickForm';
import RegenQuickForm from './design/RegenQuickForm';
```

- [ ] **Step 6: Add the bridge click popup before the closing `</div>` of the component**

Just before the final `</div>` (closing the outer `design` div) and after the `{showVersionHistory && ...}` block, add:

```tsx
{/* Bridge click popup */}
{bridgeClick && (
  <>
    {/* Dismiss overlay */}
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
      }}
      onClick={() => setBridgeClick(null)}
    />
    <div
      style={{
        position: 'fixed',
        left: bridgeClick.x,
        top: bridgeClick.y,
        transform: 'translateX(-50%)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-accent)',
        borderRadius: 8,
        padding: 12,
        zIndex: 1000,
        minWidth: 220,
        boxShadow: 'var(--glass-shadow)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
        選取：{bridgeClick.tag} · {bridgeClick.text || bridgeClick.selector}
      </div>
      {bridgeMode === 'annotate' ? (
        <AnnotateQuickForm
          projectId={projectId!}
          bridgeId={bridgeClick.selector}
          onDone={() => { setBridgeClick(null); setBridgeMode('browse'); }}
        />
      ) : (
        <RegenQuickForm
          instruction={regenInstruction}
          onChange={setRegenInstruction}
          loading={regenning}
          onSubmit={handleQuickRegen}
          onCancel={() => { setBridgeClick(null); setRegenInstruction(''); }}
        />
      )}
    </div>
  </>
)}
```

- [ ] **Step 7: Build both packages to confirm no TypeScript errors**

```bash
cd packages/client && pnpm build
cd packages/server && pnpm build
```

Expected: Both builds succeed.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/pages/workspace/DesignStage.tsx \
        packages/client/src/pages/workspace/design/AnnotateQuickForm.tsx \
        packages/client/src/pages/workspace/design/RegenQuickForm.tsx \
        packages/client/src/pages/workspace/design/VueSfcPreview.tsx
git commit -m "feat(client): DesignStage Phase C — bridge mode UI, popup, quick-regen handler"
```

---

## Task 10: Full test run + push

- [ ] **Step 1: Run the full server test suite**

```bash
cd packages/server && pnpm test
```

Expected: All tests pass. Note the count.

- [ ] **Step 2: Build both packages one final time**

```bash
cd packages/client && pnpm build
cd packages/server && pnpm build
```

Expected: Both succeed with no errors.

- [ ] **Step 3: Create the combined commit (if any uncommitted changes remain) and push**

```bash
git status
# If clean, just push:
git push
```

If any files were missed in earlier task commits:

```bash
git add <remaining files>
git commit -m "feat(client+server): council persistence + Phase C iframe element interaction"
git push
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered by |
|---|---|
| Council toggle localStorage per-project | Task 1 |
| Re-read from localStorage on projectId change | Task 1 Step 2 |
| Bridge script injected into iframe | Task 2 |
| Capture phase intercept (Vue handlers bypassed) | Task 2 (`true` flag) |
| VueSfcPreview accepts bridgeMode prop | Task 3 |
| AnnotateQuickForm component | Task 4 |
| RegenQuickForm component | Task 5 |
| POST /quick-regen endpoint | Task 6 |
| Endpoint mounted in index.ts | Task 7 |
| Route tests with mocked AI | Task 8 |
| Bridge mode toggle buttons in header | Task 9 Step 4 |
| Window message listener | Task 9 Step 2 |
| handleQuickRegen fetches endpoint | Task 9 Step 3 |
| Dismiss overlay for popup | Task 9 Step 6 |
| Reset bridgeMode to 'browse' after action | Task 9 (onDone / handleQuickRegen) |

**Placeholder scan:** No TBD/TODO/fill-in-later found. All steps have complete code.

**Type consistency check:** `bridgeMode` type `'browse' | 'annotate' | 'regen'` is consistent across VueSfcPreview prop, DesignStage state, and the iframe bridge script. `bridgeClick` shape matches both the postMessage payload and the popup usage.
