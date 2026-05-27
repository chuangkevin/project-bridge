# Plan 6b — Compiler Client UI (4-column workspace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **Browser verification required:** This plan builds React UI. Automated checks here are limited to `tsc && vite build` (structural/type correctness) + Vitest unit tests on the PURE pieces (API client, store, preview-HTML builder). **Visual fidelity and the E2E demo (drag/type input → see rendered UI → chat-edit → re-render) MUST be verified by a human running the dev server with an AI provider configured.** Do not claim M1 "done" from build-green alone.

**Goal:** Replace the old mode-based DesignBridge client with the new 4-column **compiler workspace** (spec §5.2): Artifact rail · Chat · stage-dependent Preview (renders the generated Vue/HTML in a sandboxed iframe) · Inspector. The chat drives `POST /api/projects/:id/compile` (cold start) and `/compile/mutate` (NL edit); the AST is the source of truth held in the client store; the Preview shows the rendered output. Delete the old mode UI (DesignPanel / StyleTweakerPanel / ArchitectureTab / ModeRail / WorkspacePage) per the M1 DoD. Preserve socket.io / auth / settings / OAuth.

**Architecture:** Pure, testable core + React shell. (1) `lib/compileApi.ts` — typed fetch wrappers for the two endpoints. (2) `lib/previewHtml.ts` — pure `buildPreviewHtml(vueCode)` that extracts the `<template>` inner HTML and wraps it in an iframe document with the Tailwind Play CDN (so the generated Tailwind classes render without adding Tailwind to the React app). (3) `stores/useCompilerStore.ts` — zustand store holding artifacts `{ id, ast, vue, violations }[]`, `activeArtifactId`, `stage`, chat threads, `isCompiling`; actions call the API and update the AST (AST-as-truth). (4) React components: `CompilerWorkspace` (4-column shell at `/project/:id`), `ArtifactRail`, `CompilerChat`, `PreviewPane` (iframe), `InspectorPane` (AST tree / violations / Vue code), `StageTabs`. (5) Routing swap + deletion of old components. The iframe is `sandbox`-ed and fed via `srcDoc`, isolating generated markup from the app.

**Tech Stack:** React 18, Vite, TypeScript, zustand (existing). Vitest 3.2.4 + `@testing-library/react` for component/store unit tests (add as devDeps). NO Tailwind added to the client (the iframe loads the Tailwind Play CDN). Styling of the workspace shell itself uses the existing CSS-variable theme.

**Spec:** `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md` (§5.1–5.8, §6.13). Consumes Plan 6a endpoints.

**Upstream dependency:** Plan 6a (`POST /:id/compile`, `/compile/mutate`); `@designbridge/ast` types (client already depends on it) for `SemanticUIAst`/`RuleViolation`.

**Locked design decisions (from planning Q&A):**
- **Sandboxed iframe + Tailwind Play CDN** for the Preview (mock = static markup; Vue-runtime mount deferred to M2).
- **Replace + delete** the old mode UI in this plan.
- This is **Plan 6b** of the 6a/6b split (6a = server route, done).

**Scope boundary (out of plan):**
- NO persistence (artifacts live in the store / sent back for mutate; file/sqlite persistence = Plan 7).
- NO PDF upload UI wiring (requirement-text chat path only; PDF = Plan 7).
- NO Vue-runtime interactivity in the preview (static mock; M2).
- NO new socket.io features (existing collab preserved, not extended).
- NO design-token / rule-authoring UI (Plans 8/10).

---

## Pre-flight (human or executor, before Task 1)

- [ ] Add devDeps to `packages/client/package.json`: `@testing-library/react ^16`, `@testing-library/jest-dom ^6`, `jsdom ^25`. Add a `vitest.config.ts` to `packages/client` with `test: { environment: 'jsdom', globals: true }`. Run `pnpm install`.
- [ ] Build the workspace deps so the client resolves types: `pnpm --filter @designbridge/ast build`.

---

## File Structure

```
packages/client/src/
  lib/compileApi.ts            ← fetch wrappers (compile, mutate)
  lib/previewHtml.ts           ← buildPreviewHtml(vueCode) (pure)
  stores/useCompilerStore.ts   ← zustand: artifacts/stage/chat/isCompiling + actions
  pages/CompilerWorkspace.tsx  ← 4-column shell (new /project/:id)
  components/compiler/
    ArtifactRail.tsx
    CompilerChat.tsx
    PreviewPane.tsx
    InspectorPane.tsx
    StageTabs.tsx
  lib/__tests__/compileApi.test.ts
  lib/__tests__/previewHtml.test.ts
  stores/__tests__/useCompilerStore.test.ts
  components/compiler/__tests__/CompilerWorkspace.test.tsx
DELETE:
  components/{ModeRail,DesignPanel,StyleTweakerPanel,ArchitectureTab,ChatPanel,PreviewArea,
    DesignContextPanel,ArchContextPanel,ConsultantContextPanel,ContextPanel,WorkspaceHeader}.tsx (audit refs first)
  pages/WorkspacePage.tsx  (replaced by CompilerWorkspace)
```

---

## Phase 1 — Pure core (API client, preview HTML, store)

### Task 1: `compileApi.ts`

**Files:** Create `packages/client/src/lib/compileApi.ts` + `lib/__tests__/compileApi.test.ts`.

- [ ] **Step 1: failing test** (mock `fetch`)

```typescript
// packages/client/src/lib/__tests__/compileApi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compile, mutate } from '../compileApi';
import type { SemanticUIAst } from '@designbridge/ast';

const result = { ast: { schemaVersion: 1, artifactId: 'x', kind: 'page', root: {} }, violations: [], vue: { filename: 'X.vue', code: '<template></template>' } };

beforeEach(() => { vi.restoreAllMocks(); });

describe('compile', () => {
  it('POSTs requirement to /api/projects/:id/compile and returns the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal('fetch', fetchMock);
    const out = await compile('p1', { artifactId: 'home', requirement: 'a form' });
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/compile', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ artifactId: 'home', requirement: 'a form' });
    expect(out).toEqual(result);
  });
  it('throws with the server error message on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }));
    await expect(compile('p1', { artifactId: 'x', requirement: 'y' })).rejects.toThrow(/boom/);
  });
});

describe('mutate', () => {
  it('POSTs ast+instruction to /compile/mutate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal('fetch', fetchMock);
    const ast = { schemaVersion: 1 } as unknown as SemanticUIAst;
    await mutate('p1', { ast, instruction: 'tweak' });
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/compile/mutate', expect.objectContaining({ method: 'POST' }));
  });
});
```

- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement `compileApi.ts`**

```typescript
// packages/client/src/lib/compileApi.ts
import type { SemanticUIAst, RuleViolation } from '@designbridge/ast';

export interface VueArtifactDTO { filename: string; code: string; }
export interface CompileResultDTO { ast: SemanticUIAst; violations: RuleViolation[]; vue: VueArtifactDTO; }

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function compile(projectId: string, body: { artifactId: string; requirement: string }): Promise<CompileResultDTO> {
  return postJson(`/api/projects/${projectId}/compile`, body);
}

export function mutate(projectId: string, body: { ast: SemanticUIAst; instruction: string }): Promise<CompileResultDTO> {
  return postJson(`/api/projects/${projectId}/compile/mutate`, body);
}
```

> NOTE: if the project requires auth headers on API calls, follow the existing `authHeaders()` pattern from `contexts/AuthContext.tsx` and merge them into the `headers`. Check whether the other client fetches include auth; match that. (The compile route does not currently enforce auth, but be consistent with sibling calls.)

- [ ] **Step 4: run → PASS. Commit** `feat(client): add compileApi (compile + mutate fetch wrappers)`.

---

### Task 2: `previewHtml.ts` — extract template + wrap with Tailwind CDN

**Files:** Create `packages/client/src/lib/previewHtml.ts` + test.

- [ ] **Step 1: failing test**

```typescript
// packages/client/src/lib/__tests__/previewHtml.test.ts
import { describe, it, expect } from 'vitest';
import { buildPreviewHtml, extractTemplateInner } from '../previewHtml';

const sfc = `<template>\n  <form class="flex flex-col">\n    <button type="button">Go</button>\n  </form>\n</template>\n`;

describe('extractTemplateInner', () => {
  it('returns the inner HTML of the <template>', () => {
    expect(extractTemplateInner(sfc).trim()).toBe('<form class="flex flex-col">\n    <button type="button">Go</button>\n  </form>');
  });
  it('returns the input unchanged if there is no template tag', () => {
    expect(extractTemplateInner('<div>x</div>')).toBe('<div>x</div>');
  });
});

describe('buildPreviewHtml', () => {
  const html = buildPreviewHtml(sfc);
  it('is a full HTML document with the Tailwind Play CDN', () => {
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('cdn.tailwindcss.com');
  });
  it('embeds the extracted template markup in the body', () => {
    expect(html).toContain('<button type="button">Go</button>');
    expect(html).not.toContain('<template>');
  });
});
```

- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement `previewHtml.ts`**

```typescript
// packages/client/src/lib/previewHtml.ts

/** Extract the inner HTML of a `<template>...</template>` SFC. Falls back to the raw input. */
export function extractTemplateInner(vueCode: string): string {
  const m = vueCode.match(/<template>([\s\S]*?)<\/template>/i);
  return m ? m[1] : vueCode;
}

/**
 * Build a self-contained HTML document for the sandboxed preview iframe: the generated template
 * markup + the Tailwind Play CDN so arbitrary Tailwind classes render. Mock output is static, so
 * no Vue runtime is needed (interactivity is M2). The iframe should be rendered with `sandbox`.
 */
export function buildPreviewHtml(vueCode: string): string {
  const body = extractTemplateInner(vueCode);
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8" />',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '</head><body>',
    body,
    '</body></html>',
  ].join('\n');
}
```

- [ ] **Step 4: run → PASS. Commit** `feat(client): add previewHtml builder (template extract + Tailwind CDN)`.

---

### Task 3: `useCompilerStore.ts`

**Files:** Create `packages/client/src/stores/useCompilerStore.ts` + test.

- [ ] **Step 1: failing test** (mock `compileApi`)

```typescript
// packages/client/src/stores/__tests__/useCompilerStore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../../lib/compileApi';
import { useCompilerStore } from '../useCompilerStore';

const dto = (label: string) => ({
  ast: { schemaVersion: 1, artifactId: 'home', kind: 'page', root: { id: 'n_root', type: 'Button', props: { label }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] } },
  violations: [], vue: { filename: 'Home.vue', code: `<template><button>${label}</button></template>` },
});

beforeEach(() => {
  vi.restoreAllMocks();
  useCompilerStore.setState({ projectId: 'p1', artifacts: [], activeArtifactId: null, stage: 'ast', isCompiling: false, threads: {} });
});

describe('useCompilerStore', () => {
  it('compileFromRequirement adds an artifact and selects it', async () => {
    vi.spyOn(api, 'compile').mockResolvedValue(dto('Go') as never);
    await useCompilerStore.getState().compileFromRequirement('a button');
    const s = useCompilerStore.getState();
    expect(s.artifacts).toHaveLength(1);
    expect(s.activeArtifactId).toBe(s.artifacts[0].id);
    expect(s.isCompiling).toBe(false);
  });

  it('applyEdit mutates the active artifact AST and updates its vue', async () => {
    vi.spyOn(api, 'compile').mockResolvedValue(dto('Go') as never);
    await useCompilerStore.getState().compileFromRequirement('a button');
    vi.spyOn(api, 'mutate').mockResolvedValue(dto('Submit') as never);
    await useCompilerStore.getState().applyEdit('rename to Submit');
    const active = useCompilerStore.getState().artifacts.find(a => a.id === useCompilerStore.getState().activeArtifactId);
    expect(active?.vue.code).toContain('Submit');
  });

  it('setStage updates the current pipeline stage', () => {
    useCompilerStore.getState().setStage('codegen');
    expect(useCompilerStore.getState().stage).toBe('codegen');
  });

  it('compileFromRequirement surfaces errors and clears isCompiling', async () => {
    vi.spyOn(api, 'compile').mockRejectedValue(new Error('AI failed'));
    await expect(useCompilerStore.getState().compileFromRequirement('x')).rejects.toThrow(/AI failed/);
    expect(useCompilerStore.getState().isCompiling).toBe(false);
  });
});
```

- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement `useCompilerStore.ts`**

```typescript
// packages/client/src/stores/useCompilerStore.ts
import { create } from 'zustand';
import type { SemanticUIAst, RuleViolation } from '@designbridge/ast';
import { compile, mutate, type VueArtifactDTO } from '../lib/compileApi';

export type CompilerStage = 'ingestion' | 'ast' | 'constraint' | 'codegen';

export interface Artifact {
  id: string;
  ast: SemanticUIAst;
  vue: VueArtifactDTO;
  violations: RuleViolation[];
}

interface CompilerState {
  projectId: string;
  artifacts: Artifact[];
  activeArtifactId: string | null;
  stage: CompilerStage;
  isCompiling: boolean;
  threads: Record<string, string[]>; // artifactId → chat lines (lightweight for now)
  setProjectId: (id: string) => void;
  setStage: (s: CompilerStage) => void;
  selectArtifact: (id: string) => void;
  compileFromRequirement: (requirement: string) => Promise<void>;
  applyEdit: (instruction: string) => Promise<void>;
}

let counter = 0;
const nextArtifactId = () => `art_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export const useCompilerStore = create<CompilerState>((set, get) => ({
  projectId: '',
  artifacts: [],
  activeArtifactId: null,
  stage: 'ast',
  isCompiling: false,
  threads: {},

  setProjectId: (id) => set({ projectId: id }),
  setStage: (s) => set({ stage: s }),
  selectArtifact: (id) => set({ activeArtifactId: id }),

  compileFromRequirement: async (requirement) => {
    const { projectId } = get();
    set({ isCompiling: true });
    try {
      const r = await compile(projectId, { artifactId: r0ArtifactId(get().artifacts.length), requirement });
      const artifact: Artifact = { id: nextArtifactId(), ast: r.ast, vue: r.vue, violations: r.violations };
      set((st) => ({ artifacts: [...st.artifacts, artifact], activeArtifactId: artifact.id, isCompiling: false }));
    } catch (err) {
      set({ isCompiling: false });
      throw err;
    }
  },

  applyEdit: async (instruction) => {
    const { projectId, artifacts, activeArtifactId } = get();
    const active = artifacts.find((a) => a.id === activeArtifactId);
    if (!active) throw new Error('no active artifact to edit');
    set({ isCompiling: true });
    try {
      const r = await mutate(projectId, { ast: active.ast, instruction });
      set((st) => ({
        artifacts: st.artifacts.map((a) => (a.id === active.id ? { ...a, ast: r.ast, vue: r.vue, violations: r.violations } : a)),
        isCompiling: false,
      }));
    } catch (err) {
      set({ isCompiling: false });
      throw err;
    }
  },
}));

function r0ArtifactId(n: number): string {
  return n === 0 ? 'home' : `page-${n + 1}`;
}
```

> NOTE: the `r0ArtifactId` helper just derives a slug for the server's `artifactId`; rename freely. The store keeps the AST as the source of truth and re-renders Vue only via server responses (AST-as-truth: edits go AST→server→new AST+Vue, never edit Vue directly).

- [ ] **Step 4: run → PASS. Commit** `feat(client): add useCompilerStore (artifacts/stage/compile/edit, AST-as-truth)`.

---

## Phase 2 — Components (build-verified; visual verification is the human's)

> These are specified by responsibility + key wiring. Exact Tailwind-free CSS-variable styling is at the implementer's discretion following the existing theme; the structural unit test asserts the 4 columns + key interactions render and call the store. Visual polish is verified in the browser by a human.

### Task 4: `PreviewPane`, `StageTabs`, `ArtifactRail`, `CompilerChat`, `InspectorPane`

**Files:** Create the 5 components under `components/compiler/`.

- [ ] **PreviewPane.tsx**: takes the active artifact's `vue.code`; renders `<iframe sandbox srcDoc={buildPreviewHtml(code)} />` filling the column. When `stage==='codegen'`, instead show the raw `vue.code` in a `<pre>`. When `stage==='constraint'`, overlay the `violations` list. Empty state when no artifact.
- [ ] **StageTabs.tsx**: 4 buttons (Ingestion / AST / Constraint / Codegen) calling `setStage`; highlight the active stage.
- [ ] **ArtifactRail.tsx**: list `artifacts` (by id); clicking calls `selectArtifact`; highlight active.
- [ ] **CompilerChat.tsx**: a text input + send. If there is no active artifact (or empty project), send calls `compileFromRequirement`; otherwise calls `applyEdit`. Show `isCompiling` spinner; show thrown errors inline. Append the user line to the active thread.
- [ ] **InspectorPane.tsx**: stage-dependent. `ast` → a JSON tree of the active artifact's AST (read-only `<pre>` is acceptable for v1). `constraint` → the violations list (ruleId, nodeId, severity, message). `codegen` → the Vue code with a copy/download affordance.

Each component: a minimal render unit test under `__tests__/` using `@testing-library/react` (render with a seeded store, assert the key element appears / a click calls the store action via spy). Commit per component or grouped: `feat(client): add compiler workspace panes (preview/stage/rail/chat/inspector)`.

### Task 5: `CompilerWorkspace.tsx` (the 4-column shell)

**Files:** Create `pages/CompilerWorkspace.tsx` + `components/compiler/__tests__/CompilerWorkspace.test.tsx`.

- [ ] On mount, read `:id` from the router and `setProjectId`. Render a topbar (project + `StageTabs` + settings link) and a 4-column grid: `ArtifactRail | CompilerChat | PreviewPane | InspectorPane`. Use the existing CSS-variable theme; columns sized per spec §5.2 (narrow rail, chat, anchor preview, inspector).
- [ ] Unit test: render within a `MemoryRouter` at `/project/p1`; assert all four columns mount and the stage tabs are present. (Visual layout is human-verified.)
- [ ] Commit `feat(client): add CompilerWorkspace 4-column shell`.

---

## Phase 3 — Routing swap + delete old system

### Task 6: Wire routing, delete old UI

**Files:** Modify `App.tsx`; delete old components + `WorkspacePage.tsx`.

- [ ] **Step 1:** In `App.tsx`, change the `/project/:id` route to render `CompilerWorkspace` instead of `WorkspacePage`. Keep `/`, `/login`, `/setup`, `/settings`, `/share/:token` as-is.
- [ ] **Step 2: audit references** — grep for imports of each old component before deleting. Delete only once no live route imports them:
  - `components/ModeRail.tsx`, `DesignPanel.tsx`, `StyleTweakerPanel.tsx`, `ArchitectureTab.tsx`, `ChatPanel.tsx`, `PreviewArea.tsx`, `DesignContextPanel.tsx`, `ArchContextPanel.tsx`, `ConsultantContextPanel.tsx`, `ContextPanel.tsx`, `WorkspaceHeader.tsx`
  - `pages/WorkspacePage.tsx`
  - Remove now-dead routes/pages if any (`/global-design`, `/components`) ONLY if the spec confirms they're part of the old system — otherwise leave them. (When unsure, leave a page and just note it; do not break a working route.)
- [ ] **Step 3:** Remove now-unused state/helpers tied to the old mode model (e.g. mode state in any surviving file). Do NOT touch `useArchStore` unless nothing references it after deletion — if `ArchitectureTab` was its only consumer and it's deleted, remove `useArchStore` too; otherwise leave it.
- [ ] **Step 4:** `pnpm --filter client build` MUST pass (tsc + vite). Fix any dangling import from the deletions. This is the gate that the rewrite is structurally complete.
- [ ] **Step 5:** Commit `feat(client): swap /project to CompilerWorkspace + delete old mode UI`.

---

## Phase 4 — Verify

### Task 7: Build + unit tests + HUMAN browser/E2E

- [ ] **Step 1 (automated):** `pnpm --filter @designbridge/ast build && pnpm --filter @designbridge/codegen build && pnpm --filter server build && pnpm --filter client build` → all exit 0.
- [ ] **Step 2 (automated):** `pnpm --filter client test` → pure-core suites (compileApi, previewHtml, useCompilerStore) + component render tests pass.
- [ ] **Step 3 (automated):** confirm preserved infra still builds/imports: socket.io context, AuthContext, settings/OAuth pages untouched (`git diff --stat` shows only intended files).
- [ ] **Step 4 (HUMAN — required for M1 sign-off):** Start both dev servers (`pnpm dev:server`, `pnpm dev:client`) with an AI provider configured. In the browser:
  - Type a requirement in chat → a compiled artifact appears, the Preview iframe renders the Vue/Tailwind output.
  - Switch stages (AST shows the tree; Constraint shows violations; Codegen shows the Vue code).
  - Chat an edit ("make the button say Submit") → the artifact re-compiles and the Preview updates.
  - Confirm no old mode UI remains.
- [ ] **Step 5 (HUMAN):** Update/add a Playwright E2E (`packages/e2e`) for the journey: open project → type requirement → preview renders → chat edit → preview updates. (E2E authoring can be assisted, but running it against the live app is the human's verification.)

---

## Acceptance Criteria

**Automated (executor can assert):**
- [ ] `compileApi`, `previewHtml`, `useCompilerStore` implemented + unit-tested (fetch/store mocked; no live calls).
- [ ] The 4-column `CompilerWorkspace` + 5 panes exist and render in component tests; chat calls `compileFromRequirement`/`applyEdit`; AST is the store's source of truth (edits go AST→server→new AST/Vue).
- [ ] Preview uses a sandboxed iframe with `buildPreviewHtml` (Tailwind Play CDN); no Tailwind added to the React app.
- [ ] `/project/:id` renders `CompilerWorkspace`; old mode components + `WorkspacePage` deleted; `pnpm --filter client build` exits 0 with no dangling imports.
- [ ] Preserved infra (socket.io, auth, settings, OAuth) untouched and still builds.
- [ ] Per-task commits with `feat(client)` convention.

**Human (required to declare M1 done — NOT assertable headlessly):**
- [ ] In-browser: requirement → rendered preview → chat edit → re-render works with a real AI provider.
- [ ] E2E demo (Playwright) for the journey passes.
- [ ] Spec/impl aligned; CLAUDE.md / handover updated.

## Compiler Invariant (held by this plan)

> **AST is the source of truth in the client too.** The store never edits the Vue string directly; every change goes AST → server (`/compile` or `/mutate`) → new validated AST + freshly rendered Vue. The Preview is a pure projection of the server-rendered output. The client cannot produce UI that bypasses the compiler.

---

## Risks / Notes for Executor

1. **Build-green ≠ visually correct.** This plan's automated gate is `tsc && vite build` + unit tests on pure logic. The 4-column layout, iframe rendering, and the compile→preview→edit loop MUST be verified by a human in a browser with an AI provider. Do not mark M1 done from build-green.
2. **Deletion safety:** audit every old component's imports (grep) BEFORE deleting; the build must stay green. If a surviving page imports a "to-delete" component, either migrate or keep it and flag — never leave a dangling import.
3. **Auth headers:** match sibling client fetches (`authHeaders()` from `AuthContext`) if they attach auth; the compile route is currently open but be consistent.
4. **Tailwind ONLY in the iframe** (Play CDN via `srcDoc`). Do NOT add Tailwind/PostCSS to `packages/client` — it would clash with the CSS-variable theme.
5. **`useArchStore` / old pages:** delete only what's provably dead after the route swap; when unsure, keep and flag rather than break a working route. (`/global-design`, `/components` may or may not be old-system — verify before removing.)
6. **iframe sandbox:** render the preview iframe with a `sandbox` attribute (e.g. `sandbox="allow-scripts"` so the Tailwind CDN can run) and `srcDoc`; this isolates generated markup.
7. **vitest `^3.2.4`**; add jsdom + testing-library as client devDeps.

---

**Plan end.** Ready for execution — with the explicit caveat that M1 sign-off requires human browser + E2E verification.
