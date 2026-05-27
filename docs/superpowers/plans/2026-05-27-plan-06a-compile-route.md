# Plan 6a — Server Compile Route (pipeline wiring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the full M1 compiler pipeline behind an HTTP endpoint so the new client UI (Plan 6b) can drive it: `POST /api/projects/:id/compile` (cold start: input → `IngestionAst` → AI Semantic Builder → `SemanticUIAst` → Skill Engine → Vue codegen) and `POST /api/projects/:id/compile/mutate` (NL instruction → AI ops → re-validate → re-render). This is the first time the standalone pipeline layers (Plans 2-5) are composed end-to-end and exposed. Fully headless-testable (no browser).

**Architecture:** A pure-ish service `packages/server/src/services/compile.ts` composes the pipeline: `compileFromInput(rawInput, opts)` runs `parseInput → buildColdStart → applySkillRules(CORE_RULES) → renderVue`; `compileMutation(ast, instruction, opts)` runs `applyMutation → applySkillRules → renderVue`. Both accept an injectable `generate` (default = the real provider path) so the service is unit-tested with canned AI output — **no real API calls in tests**. A thin route `packages/server/src/routes/compile.ts` parses `req.body`, calls the service with the default (real) generate, and returns `{ ast, violations, vue }`; route handlers are tested with mock `req`/`res` objects (no supertest dep). The route mounts in `index.ts` alongside the existing project routers. Old generation routes are NOT touched.

**Tech Stack:** TypeScript 5.6 strict; Vitest 3.2.4 (server); existing `@designbridge/ast`, `@designbridge/codegen`, `packages/server/src/{ingestion,semantic}`. No new dependencies (mock req/res, not supertest).

**Spec:** `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md` (§4.2, §4.5 pipeline order, §6.8). Composes Plans 2 (ingestion), 3 (builder), 4 (skill engine), 5 (codegen).

**Upstream dependencies:** Plan 2 (`parseInput`/`RawInput`), Plan 3 (`buildColdStart`/`applyMutation`/`GenerateFn`), Plan 4 (`applySkillRules`/`CORE_RULES`/`RuleViolation`), Plan 5 (`renderVue`/`VueArtifact`).

**Downstream consumer:** Plan 6b (client UI calls these endpoints).

**Scope boundary (out of plan):**
- NO client UI (Plan 6b).
- NO persistence of artifacts to files/sqlite (Plan 7) — compile is stateless request/response.
- NO PDF-over-multipart wiring — cold start accepts a text `requirement` (the chat path); PDF ingestion via upload is Plan 7. (`parseInput` already supports pdf; the route just doesn't expose multipart yet.)
- NO touching `chat.ts`/`parallelGenerator.ts`/`subAgent.ts` or any old route.
- NO new third-party deps (route tested via mock req/res).
- Skill rules applied = `CORE_RULES` only (Plan 4's built-in); project-loaded rules are Plan 7/8.

---

## Design grounding (from exploration)

- Routes mount in `packages/server/src/index.ts` via `app.use('/api/projects', xRouter)`; route files use `router.post('/:id/...', handler)` reading `req.params.id` (e.g. `routes/chat.ts`).
- `getProvider()`/`defaultGenerate` are the real AI path; the builder layers (Plan 3) already expose an injectable `generate` for testing.
- Pipeline order is fixed (spec §4.5): AI proposes AST → Skill Engine → (Design Constraints, not in M1) → Codegen. Skill Engine in M1 is assert-only, so it does not change the AST — it produces `violations` returned alongside the rendered output.

---

## File Structure

```
packages/server/src/services/
  compile.ts                 ← compileFromInput + compileMutation (DI-testable pipeline composition)
packages/server/src/services/__tests__/
  compile.test.ts
packages/server/src/routes/
  compile.ts                 ← thin POST /:id/compile and /:id/compile/mutate handlers
packages/server/src/routes/__tests__/
  compile.route.test.ts      ← handler tests via mock req/res
packages/server/src/index.ts ← mount compileRouter (one line)
```

---

## Phase 1 — Compile service

### Task 1: `compile.ts` — pipeline composition (DI-testable)

**Files:**
- Create: `packages/server/src/services/compile.ts`
- Test: `packages/server/src/services/__tests__/compile.test.ts`

- [ ] **Step 1: Write the failing test** (inject a fake `generate`; no real provider)

```typescript
// packages/server/src/services/__tests__/compile.test.ts
import { describe, it, expect, vi } from 'vitest';
import { compileFromInput, compileMutation } from '../compile';
import { AST_SCHEMA_VERSION, type SemanticUIAst } from '@designbridge/ast';

const validAstJson = JSON.stringify({
  schemaVersion: 1, artifactId: 'login', kind: 'page',
  root: {
    id: 'n_root', type: 'Form', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [],
    children: [
      { id: 'n_btn', type: 'Button', props: { label: 'Sign in' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    ],
  },
});

describe('compileFromInput', () => {
  it('runs input → AST → skill check → Vue, returning all three', async () => {
    const generate = vi.fn().mockResolvedValue(validAstJson);
    const result = await compileFromInput({ kind: 'requirement', text: 'a login form' }, { artifactId: 'login', generate });
    expect(result.ast.root.type).toBe('Form');
    expect(result.violations).toEqual([]);            // Form has a Button → no core-rule violation
    expect(result.vue.filename).toBe('Login.vue');
    expect(result.vue.code).toContain('<form');
    expect(result.vue.code).toContain('<button type="button">Sign in</button>');
  });

  it('reports skill violations (Form without Button) but still returns AST + Vue', async () => {
    const buttonless = JSON.stringify({
      schemaVersion: 1, artifactId: 'x', kind: 'page',
      root: { id: 'n_root', type: 'Form', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    });
    const generate = vi.fn().mockResolvedValue(buttonless);
    const result = await compileFromInput({ kind: 'requirement', text: 'empty form' }, { artifactId: 'x', generate });
    expect(result.violations.some(v => v.ruleId === 'core.form.requires-button' && v.severity === 'error')).toBe(true);
    expect(result.vue.code).toContain('<form');   // still rendered
  });
});

describe('compileMutation', () => {
  it('applies an NL edit via AI ops, re-checks rules, re-renders', async () => {
    const ast: SemanticUIAst = {
      schemaVersion: AST_SCHEMA_VERSION, artifactId: 'login', kind: 'page',
      root: { id: 'n_root', type: 'Form', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [],
        children: [ { id: 'n_btn', type: 'Button', props: { label: 'Go' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] } ] },
    };
    const ops = JSON.stringify({ ops: [{ op: 'setProp', nodeId: 'n_btn', key: 'label', value: 'Submit' }] });
    const generate = vi.fn().mockResolvedValue(ops);
    const result = await compileMutation(ast, 'rename button to Submit', { generate });
    expect(result.ast.root.children[0]?.props.label).toBe('Submit');
    expect(result.vue.code).toContain('<button type="button">Submit</button>');
    expect(result.violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter server test`
Expected: FAIL — `Cannot find module '../compile'`.

- [ ] **Step 3: Write `compile.ts`**

```typescript
// packages/server/src/services/compile.ts
import {
  applySkillRules, CORE_RULES,
  type SemanticUIAst, type RuleViolation, type SkillRule,
} from '@designbridge/ast';
import { renderVue, type VueArtifact } from '@designbridge/codegen';
import { buildColdStart, applyMutation, type GenerateFn } from './semantic';
import { parseInput, type RawInput } from '../ingestion';

export interface CompileResult {
  ast: SemanticUIAst;
  violations: RuleViolation[];
  vue: VueArtifact;
}

export interface CompileOptions {
  artifactId: string;
  generate?: GenerateFn;
  rules?: SkillRule[];
  maxRepairs?: number;
  model?: string;
}

/** Cold start: raw input → IngestionAst → AI AST → skill check → Vue. */
export async function compileFromInput(input: RawInput, options: CompileOptions): Promise<CompileResult> {
  const ingestion = await parseInput(input);
  const ast = await buildColdStart(ingestion, {
    artifactId: options.artifactId,
    generate: options.generate,
    maxRepairs: options.maxRepairs,
    model: options.model,
  });
  return finish(ast, options.rules);
}

export interface MutationOptions {
  generate?: GenerateFn;
  rules?: SkillRule[];
  maxRepairs?: number;
  model?: string;
}

/** Iterative edit: existing AST + NL instruction → AI ops → skill check → Vue. */
export async function compileMutation(ast: SemanticUIAst, instruction: string, options: MutationOptions = {}): Promise<CompileResult> {
  const next = await applyMutation(ast, instruction, {
    generate: options.generate,
    maxRepairs: options.maxRepairs,
    model: options.model,
  });
  return finish(next, options.rules);
}

/** Shared tail: skill-engine assert pass (M1 = no mutation) + Vue codegen. */
function finish(ast: SemanticUIAst, rules?: SkillRule[]): CompileResult {
  const { violations } = applySkillRules(ast, rules ?? CORE_RULES);
  const vue = renderVue(ast);
  return { ast, violations, vue };
}
```

> NOTE: confirm the import surface — `parseInput`/`RawInput` from `../ingestion` (Plan 2 barrel), `buildColdStart`/`applyMutation`/`GenerateFn` from `./semantic` (Plan 3 barrel), `renderVue`/`VueArtifact` from `@designbridge/codegen`, `applySkillRules`/`CORE_RULES`/`RuleViolation`/`SkillRule`/`SemanticUIAst` from `@designbridge/ast`. All exist. `@designbridge/codegen` must be added as a server dependency (next step).

- [ ] **Step 4: Add `@designbridge/codegen` to the server's deps**

In `packages/server/package.json` under `"dependencies"`, add `"@designbridge/codegen": "workspace:*"`. Run `pnpm install` (links it). Then build codegen + ast so the server resolves their types: `pnpm --filter @designbridge/ast build && pnpm --filter @designbridge/codegen build`.

- [ ] **Step 5: Run tests, expect PASS** — 3 compile-service tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/compile.ts packages/server/src/services/__tests__/compile.test.ts packages/server/package.json pnpm-lock.yaml
git commit -m "feat(server): add compile service composing the full pipeline (DI-testable)"
```

---

## Phase 2 — Route

### Task 2: `routes/compile.ts` + mount

**Files:**
- Create: `packages/server/src/routes/compile.ts`
- Create: `packages/server/src/routes/__tests__/compile.route.test.ts`
- Modify: `packages/server/src/index.ts` (mount)

- [ ] **Step 1: Write the failing test** (mock req/res — no HTTP server, no supertest)

```typescript
// packages/server/src/routes/__tests__/compile.route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import * as compileService from '../../services/compile';
import { compileHandler, mutateHandler } from '../compile';

function mockRes() {
  const res = {} as Response & { _status?: number; _json?: unknown };
  res.status = vi.fn().mockImplementation((c: number) => { res._status = c; return res; });
  res.json = vi.fn().mockImplementation((b: unknown) => { res._json = b; return res; });
  return res;
}

const fakeResult = {
  ast: { schemaVersion: 1, artifactId: 'x', kind: 'page', root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] } },
  violations: [],
  vue: { filename: 'X.vue', code: '<template></template>' },
};

describe('compileHandler', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('400s when requirement is missing', async () => {
    const req = { params: { id: 'p1' }, body: {} } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._status).toBe(400);
  });

  it('returns the compile result on a valid requirement', async () => {
    vi.spyOn(compileService, 'compileFromInput').mockResolvedValue(fakeResult as never);
    const req = { params: { id: 'p1' }, body: { artifactId: 'x', requirement: 'a form' } } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(compileService.compileFromInput).toHaveBeenCalledWith(
      { kind: 'requirement', text: 'a form' },
      expect.objectContaining({ artifactId: 'x' }),
    );
    expect(res._json).toEqual(fakeResult);
  });

  it('500s with a message when the pipeline throws', async () => {
    vi.spyOn(compileService, 'compileFromInput').mockRejectedValue(new Error('AI exhausted repairs'));
    const req = { params: { id: 'p1' }, body: { artifactId: 'x', requirement: 'a form' } } as unknown as Request;
    const res = mockRes();
    await compileHandler(req, res);
    expect(res._status).toBe(500);
    expect((res._json as { error?: string }).error).toMatch(/AI exhausted repairs/);
  });
});

describe('mutateHandler', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('400s when ast or instruction is missing', async () => {
    const req = { params: { id: 'p1' }, body: { instruction: 'x' } } as unknown as Request;
    const res = mockRes();
    await mutateHandler(req, res);
    expect(res._status).toBe(400);
  });

  it('returns the mutation result', async () => {
    vi.spyOn(compileService, 'compileMutation').mockResolvedValue(fakeResult as never);
    const req = { params: { id: 'p1' }, body: { ast: fakeResult.ast, instruction: 'tweak' } } as unknown as Request;
    const res = mockRes();
    await mutateHandler(req, res);
    expect(compileService.compileMutation).toHaveBeenCalled();
    expect(res._json).toEqual(fakeResult);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `Cannot find module '../compile'`.

- [ ] **Step 3: Write `routes/compile.ts`**

```typescript
// packages/server/src/routes/compile.ts
import { Router, type Request, type Response } from 'express';
import type { SemanticUIAst } from '@designbridge/ast';
import * as compileService from '../services/compile';

/** POST /:id/compile — cold start from a text requirement. */
export async function compileHandler(req: Request, res: Response): Promise<void> {
  const artifactId = typeof req.body?.artifactId === 'string' && req.body.artifactId.trim() ? req.body.artifactId.trim() : 'artifact';
  const requirement = req.body?.requirement;
  if (typeof requirement !== 'string' || requirement.trim().length === 0) {
    res.status(400).json({ error: 'requirement (non-empty string) is required' });
    return;
  }
  try {
    const result = await compileService.compileFromInput({ kind: 'requirement', text: requirement }, { artifactId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

/** POST /:id/compile/mutate — apply an NL edit to an existing AST. */
export async function mutateHandler(req: Request, res: Response): Promise<void> {
  const ast = req.body?.ast as SemanticUIAst | undefined;
  const instruction = req.body?.instruction;
  if (!ast || typeof ast !== 'object' || typeof instruction !== 'string' || instruction.trim().length === 0) {
    res.status(400).json({ error: 'ast (object) and instruction (non-empty string) are required' });
    return;
  }
  try {
    const result = await compileService.compileMutation(ast, instruction);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

const router = Router();
router.post('/:id/compile', compileHandler);
router.post('/:id/compile/mutate', mutateHandler);
export default router;
```

> NOTE: handlers are exported as named functions so they're unit-testable with mock req/res. The default export is the mounted router. Confirm the existing route files use `express.Router()` + `export default router` (match `routes/chat.ts`'s export style; adjust `import` to match if it uses `export const` instead).

- [ ] **Step 4: Mount in `index.ts`**

Find where the other project routers mount (e.g. `app.use('/api/projects', chatRouter);`) and add alongside:

```typescript
import compileRouter from './routes/compile';
// ...
app.use('/api/projects', compileRouter);
```

(Match the existing import + mount style exactly — if routers are imported with a specific naming/casing, follow it.)

- [ ] **Step 5: Run tests, expect PASS** — 5 route-handler tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/compile.ts packages/server/src/routes/__tests__/compile.route.test.ts packages/server/src/index.ts
git commit -m "feat(server): add POST /:id/compile + /compile/mutate routes"
```

---

## Phase 3 — Verify

### Task 3: Build + test + live pipeline smoke

**Files:** none.

- [ ] **Step 1:** `pnpm --filter @designbridge/ast build && pnpm --filter @designbridge/codegen build && pnpm --filter server build` → all exit 0 (server resolves codegen + the pipeline modules).
- [ ] **Step 2:** `pnpm --filter server test` → all new compile suites pass (service 3 + route 5); only the pre-existing `htmlSanitizer` red tolerated; no NEW failures.
- [ ] **Step 3: Live end-to-end smoke with a FAKE generate** (proves the real pipeline composition end-to-end without an API key). From repo root:

```
node -e "
const { compileFromInput } = require('./packages/server/dist/services/compile.js');
const ast = JSON.stringify({schemaVersion:1,artifactId:'demo',kind:'page',root:{id:'n_root',type:'Form',props:{},layout:{kind:'stack',direction:'vertical',gap:8},style:{padding:16},bindings:[],events:[],constraints:[],children:[{id:'n_b',type:'Button',props:{label:'Go'},layout:{kind:'flow'},style:{},bindings:[],events:[],constraints:[],children:[]}]}});
compileFromInput({kind:'requirement',text:'a form'},{artifactId:'demo',generate: async()=>ast}).then(r=>{console.log('violations',JSON.stringify(r.violations));console.log(r.vue.filename);console.log(r.vue.code);});
"
```
Expected: `violations []`, `Demo.vue`, and a `<template>` containing `<form class="flex flex-col gap-[8px] p-[16px]">` with `<button type="button">Go</button>`. (Uses the compiled `dist/`; run after Step 1's server build.)

- [ ] **Step 4:** `git diff --stat <plan5-head>..HEAD -- packages/server/src/routes/chat.ts packages/server/src/services/parallelGenerator.ts packages/server/src/services/subAgent.ts packages/client` → EMPTY (no old-generation/client files touched).

---

## Acceptance Criteria

- [ ] `compileFromInput(input, {artifactId, generate?})` composes `parseInput → buildColdStart → applySkillRules(CORE_RULES) → renderVue`, returning `{ ast, violations, vue }`; DI `generate` keeps tests API-free.
- [ ] `compileMutation(ast, instruction, {generate?})` composes `applyMutation → applySkillRules → renderVue`.
- [ ] `POST /api/projects/:id/compile` (body `{ artifactId, requirement }`) and `POST /api/projects/:id/compile/mutate` (body `{ ast, instruction }`) return the compile result; 400 on missing input; 500 with `{ error }` on pipeline failure.
- [ ] Skill violations are returned alongside a still-rendered Vue artifact (assert-only M1: violations don't block rendering).
- [ ] `@designbridge/codegen` added as a server dependency; `pnpm --filter server build` exits 0.
- [ ] `pnpm --filter server test` passes for the new suites (service 3 + route 5); only the pre-existing htmlSanitizer red tolerated.
- [ ] The Step 3 live smoke prints a valid Vue SFC via the composed pipeline.
- [ ] NO old-generation/client files modified; NO new third-party deps.
- [ ] Per-task commits with `feat(server)` convention.

## Compiler Invariant (held by this plan)

> **The endpoint composes the pipeline in the locked order (spec §4.5): AI proposes → AST validated (inside the builder) → Skill Engine → Codegen.** The route never renders un-validated AST (the builder validates before returning), and skill violations travel WITH the output rather than being silently dropped. The AI is invoked only at the two sanctioned points (cold-start build, mutation), both inside the builder layer.

---

## Risks / Notes for Executor

1. **Route export style** — match the existing `routes/*.ts` convention for the default export + the `index.ts` mount (the exploration shows `app.use('/api/projects', xRouter)`). If existing routers use `export const xRouter = Router()` rather than `export default`, follow that and adjust the `index.ts` import accordingly. Do not invent a new convention.
2. **`@designbridge/codegen` server dep** — must be added + installed + built before the server build resolves it. Build ast and codegen before building/ testing the server.
3. **No real AI in tests** — service tests inject `generate`; route tests `vi.spyOn` the service. Do NOT write a test that hits the real provider.
4. **Pipeline order** — skill engine runs AFTER the builder (which already validated the AST) and BEFORE codegen. M1 skill engine is assert-only, so it does not mutate; it only contributes `violations`.
5. **Stateless** — no persistence; the client holds the AST and sends it back for `mutate`. Persistence is Plan 7.
6. **vitest `^3.2.4`**; do not touch old routes.

---

**Plan end.** Ready for execution.
