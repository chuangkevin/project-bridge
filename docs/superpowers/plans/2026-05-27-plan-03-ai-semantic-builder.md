# Plan 3 — AI Semantic Builder (cold-start + tool-call mutation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **AI Semantic Builder** — the single AI call point in the compiler that turns an `IngestionAst` into a `SemanticUIAst` (cold start) and applies natural-language edits to an existing `SemanticUIAst` via AI-emitted mutation ops (iterative edit). The AI only *proposes* (emits JSON); the AST is validated against Plan 1's `validateAst` and edits are applied only through Plan 1's pure mutation primitives. Invalid AI output triggers a bounded repair loop, then surfaces the real failure.

**Architecture:** A pure ops layer goes in `@designbridge/ast`: a `MutationOp` discriminated union (mirroring the 7 mutation primitives) + `applyMutationOps(ast, ops[])` that folds ops through the primitives. The AI-calling builder lives in `packages/server/src/semantic/`: `buildColdStart(ingestion)` and `applyMutation(ast, instruction)`. Both call the AI through an **injectable `generate` function** (defaults to the existing `getProvider()` + `withJsonInstruction()` path) so the validate/parse/repair logic is unit-tested with canned output and **no real API calls in tests**. Both run a shared **bounded repair loop**: parse → `validateAst` → on failure, re-prompt with the errors, up to N attempts, then throw. The component catalog (the 20 base components + their required props) is rendered deterministically from `BASE_COMPONENTS` into the system prompt so the AI knows the legal vocabulary.

**Tech Stack:** TypeScript 5.6 strict; Vitest 3.2.4; `@designbridge/ast` (workspace dep); `getProvider()`/`generateJson`/`withJsonInstruction`/`extractJsonBody` from `packages/server/src/services/provider.ts`. No new runtime dependencies. The AI call surface is **text-in/text-out only** — ai-core exposes NO native function/tool-calling, so "tool calls" are AI-emitted JSON ops, not provider tool calls.

**Spec:** `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md` (§4.1, §4.2, §4.3, §6.8). Builds on Plan 1 (AST + primitives + validator) and Plan 2 (IngestionAst).

**Upstream dependencies:** Plan 1 (`validateAst`, 7 mutation primitives, `BASE_COMPONENTS`, `SemanticUIAst`), Plan 2 (`IngestionAst`).

**Downstream consumers:** Plan 4 (Skill Engine — runs after the builder), Plan 6 (client UI — invokes builder via a route, later), Plan 7 (migration — wires builder into the real chat/generation flow).

**Locked design decisions (from planning Q&A):**
- **Cold-start output shape:** AI emits the FULL `ComponentNode` shape including `n_`-prefixed unique ids and the empty `bindings`/`events`/`constraints` arrays. No post-hoc hydration — `validateAst` (which requires all 9 node fields + id pattern + uniqueness) is the gate, and the repair loop fixes deviations.
- **Scope:** BOTH cold-start and mutation are in this plan.
- **Invalid output handling:** bounded repair loop (default 2 repair attempts after the first try = 3 total), feeding validation errors back; surface the real failure when exhausted (per CLAUDE.md AI-retry rule).
- **Tool mechanism:** AI-emitted JSON `MutationOp[]` (no native provider tool-calling exists). Ops apply via Plan 1's 7 primitives.
- **Mutation op set = the 7 implemented primitives** (addComponent/setProp/removeComponent/moveComponent/addBinding/addEvent/addConstraintRef), not spec §4.1's illustrative 5.

**Scope boundary (out of plan):**
- NO Skill Engine / Design Constraints application (Plan 4) — the builder returns the raw validated Semantic UI AST; rule transforms come after.
- NO route wiring / no touching `chat.ts`/`parallelGenerator.ts`/`subAgent.ts` (Plan 7 migration). Standalone, tested module.
- NO streaming (the builder returns a complete AST; streaming the AST stage is a later concern).
- NO cross-op references to newly-created nodes in a single mutation batch: an `addComponent` op fully configures the new node via its `props`; subsequent ops in the SAME batch cannot reference the (generated) new id. Documented limitation for v1.
- NO multimodal/vision input (the IngestionAst is already text/structured; image ingestion + vision is a later plan).

---

## Design grounding (from `provider.ts` read)

- `getProvider()` → `MultiProviderClient` with `generateContent(params)` / `streamContent(params)`. `GenerateParams` carries `model`, `systemInstruction`, `messages`/`prompt`, `maxOutputTokens` — NO `tools`, NO `responseMimeType`, NO `temperature`.
- `generateJson<T>(params)` already does `withJsonInstruction()` + `extractJsonBody()` + `JSON.parse`. The builder uses the same primitives but needs the RAW text (to retry with errors), so it calls `generateContent` + `extractJsonBody` itself rather than `generateJson` (which throws on parse failure before we can repair).
- `defaultModel()` supplies the model id. The builder passes it through; callers may override.

---

## File Structure

```
packages/ast/src/mutations/
  mutationOp.ts            ← MutationOp union + applyMutationOps (pure, folds through the 7 primitives)
packages/ast/src/index.ts  ← + re-export MutationOp & applyMutationOps
packages/ast/src/__tests__/
  mutationOp.test.ts

packages/server/src/semantic/
  componentCatalog.ts      ← describeComponentCatalog(registry) → prompt text from BASE_COMPONENTS
  prompts.ts               ← buildColdStartPrompt() / buildMutationPrompt() / repair-suffix builder
  generate.ts              ← GenerateFn type + defaultGenerate (wraps getProvider().generateContent)
  repairLoop.ts            ← generic parse→validate→repair runner (shared by both builders)
  buildColdStart.ts        ← IngestionAst → SemanticUIAst
  applyMutation.ts         ← (SemanticUIAst, instruction) → SemanticUIAst
  index.ts                 ← barrel
packages/server/src/semantic/__tests__/
  componentCatalog.test.ts
  mutationApply.test.ts    (server-side integration of applyMutationOps via builder — optional, covered in ast)
  repairLoop.test.ts
  buildColdStart.test.ts
  applyMutation.test.ts
```

No new dependencies. No existing files modified except `packages/ast/src/index.ts` (re-exports).

---

## Phase 1 — Pure ops layer (`@designbridge/ast`)

### Task 1: `MutationOp` union + `applyMutationOps`

**Files:**
- Create: `packages/ast/src/mutations/mutationOp.ts`
- Test: `packages/ast/src/__tests__/mutationOp.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/ast/src/__tests__/mutationOp.test.ts
import { describe, it, expect } from 'vitest';
import { applyMutationOps } from '../mutations/mutationOp';
import type { MutationOp } from '../mutations/mutationOp';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';

const baseAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'home', kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [] },
});

describe('applyMutationOps', () => {
  it('applies a sequence of ops immutably, returning a new AST', () => {
    const before = baseAst();
    const ops: MutationOp[] = [
      { op: 'addComponent', parentId: 'n_root', type: 'Text', props: { content: 'hi' } },
      { op: 'addComponent', parentId: 'n_root', type: 'Button', props: { label: 'Go' } },
    ];
    const after = applyMutationOps(before, ops);
    expect(after).not.toBe(before);
    expect(before.root.children).toHaveLength(0);
    expect(after.root.children.map(c => c.type)).toEqual(['Text', 'Button']);
  });

  it('applies setProp / removeComponent / moveComponent / addBinding / addEvent / addConstraintRef', () => {
    let ast = baseAst();
    // seed two containers + a text
    ast = applyMutationOps(ast, [
      { op: 'addComponent', parentId: 'n_root', type: 'Container', props: {} },
    ]);
    const containerId = ast.root.children[0]!.id;
    ast = applyMutationOps(ast, [
      { op: 'addComponent', parentId: containerId, type: 'Input', props: { placeholder: 'x' } },
    ]);
    const inputId = ast.root.children[0]!.children[0]!.id;

    ast = applyMutationOps(ast, [
      { op: 'setProp', nodeId: inputId, key: 'placeholder', value: 'email' },
      { op: 'addBinding', nodeId: inputId, binding: { propKey: 'value', source: 'state', path: 'form.email' } },
      { op: 'addEvent', nodeId: inputId, event: { event: 'change', action: { kind: 'setState', path: 'form.email', valueFromEvent: true } } },
      { op: 'addConstraintRef', nodeId: inputId, ruleId: 'r.required' },
    ]);
    const input = ast.root.children[0]!.children[0]!;
    expect(input.props.placeholder).toBe('email');
    expect(input.bindings).toHaveLength(1);
    expect(input.events).toHaveLength(1);
    expect(input.constraints).toEqual([{ ruleId: 'r.required' }]);

    // move the input up to root, then remove it
    ast = applyMutationOps(ast, [{ op: 'moveComponent', nodeId: inputId, newParentId: 'n_root' }]);
    expect(ast.root.children.some(c => c.id === inputId)).toBe(true);
    ast = applyMutationOps(ast, [{ op: 'removeComponent', nodeId: inputId }]);
    expect(ast.root.children.some(c => c.id === inputId)).toBe(false);
  });

  it('throws (propagating the primitive error) on an op targeting a missing node, with op index context', () => {
    expect(() => applyMutationOps(baseAst(), [{ op: 'setProp', nodeId: 'n_missing', key: 'x', value: 1 }]))
      .toThrow(/op\[0\].*not found/i);
  });

  it('throws on an unknown op kind', () => {
    expect(() => applyMutationOps(baseAst(), [{ op: 'frobnicate' } as unknown as MutationOp]))
      .toThrow(/unknown mutation op/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `Cannot find module '../mutations/mutationOp'`.

- [ ] **Step 3: Write `mutationOp.ts`**

```typescript
// packages/ast/src/mutations/mutationOp.ts
import type { SemanticUIAst } from '../types/ast';
import type { DataBinding } from '../types/dataBinding';
import type { EventBinding } from '../types/eventBinding';
import { addComponent } from './addComponent';
import { setProp } from './setProp';
import { removeComponent } from './removeComponent';
import { moveComponent } from './moveComponent';
import { addBinding } from './addBinding';
import { addEvent } from './addEvent';
import { addConstraintRef } from './addConstraintRef';

/**
 * The canonical mutation-op format the AI emits (one per the 7 primitives).
 * `applyMutationOps` folds a batch through the pure primitives. This IS the
 * "tool call" surface — provider-agnostic JSON, not native function-calling.
 */
export type MutationOp =
  | { op: 'addComponent'; parentId: string; type: string; props?: Record<string, unknown>; index?: number }
  | { op: 'setProp'; nodeId: string; key: string; value: unknown }
  | { op: 'removeComponent'; nodeId: string }
  | { op: 'moveComponent'; nodeId: string; newParentId: string; index?: number }
  | { op: 'addBinding'; nodeId: string; binding: DataBinding }
  | { op: 'addEvent'; nodeId: string; event: EventBinding }
  | { op: 'addConstraintRef'; nodeId: string; ruleId: string };

export type MutationOpKind = MutationOp['op'];

/**
 * Applies a batch of mutation ops in order, returning a new AST. Each op goes
 * through the corresponding pure primitive. Errors from a primitive propagate,
 * annotated with the op index. NOTE: an `addComponent` op cannot be referenced
 * by later ops in the same batch (the new id is generated); fully configure new
 * nodes via the addComponent op's `props`.
 */
export function applyMutationOps(ast: SemanticUIAst, ops: MutationOp[]): SemanticUIAst {
  let current = ast;
  ops.forEach((op, i) => {
    try {
      switch (op.op) {
        case 'addComponent':
          current = addComponent(current, { parentId: op.parentId, type: op.type, props: op.props, index: op.index }).ast;
          break;
        case 'setProp':
          current = setProp(current, { nodeId: op.nodeId, key: op.key, value: op.value });
          break;
        case 'removeComponent':
          current = removeComponent(current, { nodeId: op.nodeId });
          break;
        case 'moveComponent':
          current = moveComponent(current, { nodeId: op.nodeId, newParentId: op.newParentId, index: op.index });
          break;
        case 'addBinding':
          current = addBinding(current, { nodeId: op.nodeId, binding: op.binding });
          break;
        case 'addEvent':
          current = addEvent(current, { nodeId: op.nodeId, event: op.event });
          break;
        case 'addConstraintRef':
          current = addConstraintRef(current, { nodeId: op.nodeId, ruleId: op.ruleId });
          break;
        default: {
          throw new Error(`unknown mutation op "${(op as { op: string }).op}"`);
        }
      }
    } catch (err) {
      throw new Error(`op[${i}] (${(op as { op: string }).op}): ${(err as Error).message}`);
    }
  });
  return current;
}
```

- [ ] **Step 4: Run, expect PASS** — 4 applyMutationOps tests green.

- [ ] **Step 5: Re-export from `packages/ast/src/index.ts` (append)**

```typescript
export { applyMutationOps } from './mutations/mutationOp';
export type { MutationOp, MutationOpKind } from './mutations/mutationOp';
```

- [ ] **Step 6: Build + commit**

Run: `pnpm --filter @designbridge/ast build` → clean.
```bash
git add packages/ast/src/mutations/mutationOp.ts packages/ast/src/__tests__/mutationOp.test.ts packages/ast/src/index.ts
git commit -m "feat(ast): add MutationOp union + applyMutationOps (AI tool-call apply layer)"
```

---

## Phase 2 — Builder plumbing (server)

### Task 2: `describeComponentCatalog` — render BASE_COMPONENTS into prompt text

**Files:**
- Create: `packages/server/src/semantic/componentCatalog.ts`
- Test: `packages/server/src/semantic/__tests__/componentCatalog.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/semantic/__tests__/componentCatalog.test.ts
import { describe, it, expect } from 'vitest';
import { describeComponentCatalog } from '../componentCatalog';
import { BASE_COMPONENTS } from '@designbridge/ast';

describe('describeComponentCatalog', () => {
  const text = describeComponentCatalog(BASE_COMPONENTS);

  it('lists every registered component type', () => {
    for (const name of Object.keys(BASE_COMPONENTS)) {
      expect(text).toContain(name);
    }
  });

  it('marks required props and enum options', () => {
    // Heading.content is required; Heading.level is an enum 1..6
    expect(text).toMatch(/Heading[\s\S]*content[\s\S]*required/i);
    expect(text).toMatch(/level[\s\S]*1\|2\|3\|4\|5\|6|1, 2, 3, 4, 5, 6/);
  });

  it('notes which components allow children', () => {
    expect(text).toMatch(/Container[\s\S]*children/i);
    expect(text).toMatch(/Image[\s\S]*no children|Image[\s\S]*leaf/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing module.

- [ ] **Step 3: Write `componentCatalog.ts`**

```typescript
// packages/server/src/semantic/componentCatalog.ts
import type { ComponentRegistry, PropSpec } from '@designbridge/ast';

function describeProp(name: string, spec: PropSpec): string {
  const bits: string[] = [spec.type];
  if (spec.type === 'enum' && spec.enumValues) bits.push(`one of [${spec.enumValues.join('|')}]`);
  if (spec.required) bits.push('required');
  return `${name} (${bits.join(', ')})`;
}

/**
 * Renders the component registry into a compact catalog for the AI system prompt,
 * so the model knows the legal component vocabulary, each type's props, required
 * props, enum options, and whether children are allowed.
 */
export function describeComponentCatalog(registry: ComponentRegistry): string {
  const lines: string[] = ['Available components (use ONLY these "type" values):'];
  for (const [name, spec] of Object.entries(registry)) {
    const props = Object.entries(spec.props).map(([k, v]) => describeProp(k, v));
    const propText = props.length ? ` props: ${props.join('; ')}.` : ' no constrained props.';
    const childText = spec.allowsChildren ? ' allows children.' : ' leaf — no children.';
    lines.push(`- ${name}:${propText}${childText}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/semantic/componentCatalog.ts packages/server/src/semantic/__tests__/componentCatalog.test.ts
git commit -m "feat(server): render component catalog from BASE_COMPONENTS for AI prompts"
```

---

### Task 3: `GenerateFn` + `defaultGenerate` (injectable AI call)

**Files:**
- Create: `packages/server/src/semantic/generate.ts`
- (no dedicated test — `defaultGenerate` wraps the real provider and is exercised via integration; the builders are tested with injected fakes. A trivial type/shape test is included.)
- Test: add to `packages/server/src/semantic/__tests__/repairLoop.test.ts` (next task) — or a tiny standalone test here.

- [ ] **Step 1: Write `generate.ts`**

```typescript
// packages/server/src/semantic/generate.ts
import { getProvider, withJsonInstruction, defaultModel } from '../services/provider';

/** Injectable AI call: takes a system + user prompt, returns the model's RAW text. */
export type GenerateFn = (args: {
  systemInstruction: string;
  prompt: string;
  model?: string;
  maxOutputTokens?: number;
}) => Promise<string>;

/**
 * Default GenerateFn — routes through the singleton MultiProviderClient with the
 * JSON-only instruction appended. Returns raw text (caller extracts/repairs JSON);
 * we do NOT use generateJson() here because we need the raw text to drive the
 * repair loop when JSON.parse fails.
 */
export const defaultGenerate: GenerateFn = async ({ systemInstruction, prompt, model, maxOutputTokens }) => {
  const resp = await getProvider().generateContent({
    model: model ?? defaultModel(),
    systemInstruction: withJsonInstruction(systemInstruction),
    prompt,
    maxOutputTokens: maxOutputTokens ?? 65536,
  });
  return resp.text;
};
```

> CONFIRMED shape (from `qualityScorer.ts:24` / `plannerAgent.ts:113`): `generateContent({ model, systemInstruction, prompt, maxOutputTokens })` — a single `prompt` STRING, NOT `messages[]`. The `GenerateParams`/`type GenerateParams` import is unnecessary with this object-literal form; drop it if unused.

- [ ] **Step 2: Build check** — `pnpm --filter server build` must compile this against the real ai-core types. Fix the param shape to match ai-core if needed (see note). 

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/semantic/generate.ts
git commit -m "feat(server): add injectable GenerateFn + defaultGenerate (provider-backed)"
```

---

### Task 4: `repairLoop` — shared parse→validate→repair runner

**Files:**
- Create: `packages/server/src/semantic/repairLoop.ts`
- Test: `packages/server/src/semantic/__tests__/repairLoop.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/semantic/__tests__/repairLoop.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runRepairLoop } from '../repairLoop';

describe('runRepairLoop', () => {
  it('returns on the first valid attempt without re-prompting', async () => {
    const generate = vi.fn().mockResolvedValue('{"ok":true}');
    const result = await runRepairLoop({
      generate,
      systemInstruction: 'sys',
      initialPrompt: 'do it',
      parseAndValidate: (raw) => {
        const data = JSON.parse(raw) as { ok: boolean };
        return data.ok ? { valid: true, value: data } : { valid: false, errors: ['not ok'] };
      },
      maxRepairs: 2,
    });
    expect(result).toEqual({ ok: true });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('re-prompts with errors and succeeds on a repair attempt', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce('{"ok":false}')   // attempt 1 invalid
      .mockResolvedValueOnce('{"ok":true}');   // repair 1 valid
    const result = await runRepairLoop({
      generate,
      systemInstruction: 'sys',
      initialPrompt: 'do it',
      parseAndValidate: (raw) => {
        const data = JSON.parse(raw) as { ok: boolean };
        return data.ok ? { valid: true, value: data } : { valid: false, errors: ['ok must be true'] };
      },
      maxRepairs: 2,
    });
    expect(result).toEqual({ ok: true });
    expect(generate).toHaveBeenCalledTimes(2);
    // second call's prompt must include the error feedback
    expect(generate.mock.calls[1][0].prompt).toMatch(/ok must be true/);
  });

  it('throws after exhausting repairs, including the last errors', async () => {
    const generate = vi.fn().mockResolvedValue('{"ok":false}');
    await expect(runRepairLoop({
      generate,
      systemInstruction: 'sys',
      initialPrompt: 'do it',
      parseAndValidate: () => ({ valid: false, errors: ['always bad'] }),
      maxRepairs: 2,
    })).rejects.toThrow(/always bad/);
    expect(generate).toHaveBeenCalledTimes(3); // 1 initial + 2 repairs
  });

  it('treats a JSON.parse throw as an invalid attempt and repairs', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce('{"ok":true}');
    const result = await runRepairLoop({
      generate,
      systemInstruction: 'sys',
      initialPrompt: 'do it',
      parseAndValidate: (raw) => {
        const data = JSON.parse(raw) as { ok: boolean }; // throws on 'not json'
        return data.ok ? { valid: true, value: data } : { valid: false, errors: ['x'] };
      },
      maxRepairs: 2,
    });
    expect(result).toEqual({ ok: true });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing module.

- [ ] **Step 3: Write `repairLoop.ts`**

```typescript
// packages/server/src/semantic/repairLoop.ts
import type { GenerateFn } from './generate';

export type ParseResult<T> = { valid: true; value: T } | { valid: false; errors: string[] };

export interface RepairLoopArgs<T> {
  generate: GenerateFn;
  systemInstruction: string;
  initialPrompt: string;
  /** Parse + validate raw model text. MUST NOT throw for "invalid" — return {valid:false}. A
   *  thrown error (e.g. JSON.parse) is caught and treated as an invalid attempt. */
  parseAndValidate: (raw: string) => ParseResult<T>;
  /** Number of REPAIR attempts after the first try. Total calls = maxRepairs + 1. Default 2. */
  maxRepairs?: number;
  model?: string;
  maxOutputTokens?: number;
}

function repairSuffix(errors: string[]): string {
  return [
    '',
    'Your previous response was INVALID for these reasons:',
    ...errors.map(e => `- ${e}`),
    '',
    'Re-emit the COMPLETE corrected JSON (not a diff). Fix every issue above. Respond with JSON only.',
  ].join('\n');
}

/**
 * Generate → parse/validate → on failure, re-prompt with the errors appended,
 * up to `maxRepairs` times. Throws with the last errors when exhausted.
 */
export async function runRepairLoop<T>(args: RepairLoopArgs<T>): Promise<T> {
  const maxRepairs = args.maxRepairs ?? 2;
  let prompt = args.initialPrompt;
  let lastErrors: string[] = ['no attempts made'];

  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    const raw = await args.generate({
      systemInstruction: args.systemInstruction,
      prompt,
      model: args.model,
      maxOutputTokens: args.maxOutputTokens,
    });
    let result: ParseResult<T>;
    try {
      result = args.parseAndValidate(raw);
    } catch (err) {
      result = { valid: false, errors: [`parse error: ${(err as Error).message}`] };
    }
    if (result.valid) return result.value;
    lastErrors = result.errors;
    prompt = args.initialPrompt + repairSuffix(result.errors);
  }
  throw new Error(`AI output failed validation after ${maxRepairs} repair attempts:\n${lastErrors.map(e => `  - ${e}`).join('\n')}`);
}
```

- [ ] **Step 4: Run, expect PASS** — 4 repairLoop tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/semantic/repairLoop.ts packages/server/src/semantic/__tests__/repairLoop.test.ts
git commit -m "feat(server): add bounded AI repair loop (parse→validate→re-prompt)"
```

---

## Phase 3 — Cold-start builder

### Task 5: prompts + `buildColdStart`

**Files:**
- Create: `packages/server/src/semantic/prompts.ts`
- Create: `packages/server/src/semantic/buildColdStart.ts`
- Test: `packages/server/src/semantic/__tests__/buildColdStart.test.ts`

- [ ] **Step 1: Write the failing test** (injects a fake `generate` returning canned AST JSON)

```typescript
// packages/server/src/semantic/__tests__/buildColdStart.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildColdStart } from '../buildColdStart';
import type { IngestionAst } from '@designbridge/ast';

const ingestion: IngestionAst = { type: 'requirement', paragraphs: ['A login form with an email field and a submit button.'] };

const validAstJson = JSON.stringify({
  schemaVersion: 1, artifactId: 'login', kind: 'page',
  root: {
    id: 'n_root', type: 'Form', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [],
    children: [
      { id: 'n_email', type: 'Input', props: { inputType: 'email', placeholder: 'Email' },
        layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
      { id: 'n_submit', type: 'Button', props: { label: 'Sign in' },
        layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    ],
  },
});

describe('buildColdStart', () => {
  it('produces a validated SemanticUIAst from a valid AI response', async () => {
    const generate = vi.fn().mockResolvedValue(validAstJson);
    const ast = await buildColdStart(ingestion, { artifactId: 'login', generate });
    expect(ast.schemaVersion).toBe(1);
    expect(ast.root.type).toBe('Form');
    expect(ast.root.children.map(c => c.type)).toEqual(['Input', 'Button']);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('forces the returned artifactId/kind to the requested values (AI cannot override them)', async () => {
    const generate = vi.fn().mockResolvedValue(validAstJson);
    const ast = await buildColdStart(ingestion, { artifactId: 'OVERRIDE', kind: 'element', generate });
    expect(ast.artifactId).toBe('OVERRIDE');
    expect(ast.kind).toBe('element');
  });

  it('repairs an invalid first response (unknown component type) then succeeds', async () => {
    const badJson = JSON.stringify({
      schemaVersion: 1, artifactId: 'login', kind: 'page',
      root: { id: 'n_root', type: 'NotAComponent', props: {}, layout: { kind: 'flow' }, style: {},
        bindings: [], events: [], constraints: [], children: [] },
    });
    const generate = vi.fn().mockResolvedValueOnce(badJson).mockResolvedValueOnce(validAstJson);
    const ast = await buildColdStart(ingestion, { artifactId: 'login', generate });
    expect(ast.root.type).toBe('Form');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].prompt).toMatch(/unknown component type/i);
  });

  it('injects the component catalog and the ingestion content into the prompt', async () => {
    const generate = vi.fn().mockResolvedValue(validAstJson);
    await buildColdStart(ingestion, { artifactId: 'login', generate });
    const call = generate.mock.calls[0][0];
    expect(call.systemInstruction).toMatch(/Available components/);
    expect(call.systemInstruction).toMatch(/Form|Input|Button/);
    expect(call.prompt).toMatch(/login form/i); // the requirement text
  });

  it('throws after exhausting repairs on persistently invalid output', async () => {
    const generate = vi.fn().mockResolvedValue('{"not":"an ast"}');
    await expect(buildColdStart(ingestion, { artifactId: 'login', generate, maxRepairs: 1 }))
      .rejects.toThrow(/failed validation/i);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing modules.

- [ ] **Step 3: Write `prompts.ts`**

```typescript
// packages/server/src/semantic/prompts.ts
import type { IngestionAst, SemanticUIAst, ComponentRegistry } from '@designbridge/ast';
import { describeComponentCatalog } from './componentCatalog';

/** Flatten an IngestionAst into the text the AI should interpret. */
export function ingestionToText(ingestion: IngestionAst): string {
  switch (ingestion.type) {
    case 'requirement':
      return ingestion.paragraphs.join('\n\n');
    case 'pdf':
      return ingestion.rawText;
    case 'screenshot':
      return ingestion.ocrText;
    case 'clipboard':
      return ingestion.payload;
    case 'webpage':
      return ingestion.dom;
    default: {
      const _x: never = ingestion;
      return '';
    }
  }
}

const NODE_SHAPE_RULES = [
  'Output a single JSON object: a Semantic UI AST.',
  'Top level: { "schemaVersion": 1, "artifactId": string, "kind": "page"|"element"|"multi-page"|"fragment", "root": ComponentNode }.',
  'Every ComponentNode MUST have ALL of these fields:',
  '  - "id": a unique string matching ^n_[A-Za-z0-9_-]+ (e.g. "n_root", "n_email"). Never reuse an id.',
  '  - "type": one of the available component types below.',
  '  - "props": object (include every REQUIRED prop for that type).',
  '  - "layout": one of { "kind":"stack","direction":"vertical"|"horizontal" } | { "kind":"grid","columns":number } | { "kind":"flow" } | { "kind":"absolute" }.',
  '  - "style": object (may be empty {}).',
  '  - "bindings": [] , "events": [] , "constraints": []  (empty arrays unless you have specific data — keep empty for a visual-only draft).',
  '  - "children": array of ComponentNode (empty [] for leaf types).',
  'Do not invent component types or props. Respond with JSON only — no markdown, no prose.',
].join('\n');

export function buildColdStartPrompt(args: {
  ingestion: IngestionAst;
  registry: ComponentRegistry;
  artifactId: string;
  kind: SemanticUIAst['kind'];
}): { systemInstruction: string; prompt: string } {
  const systemInstruction = [
    'You are a UI compiler. Convert the user requirement into a Semantic UI AST.',
    '',
    NODE_SHAPE_RULES,
    '',
    describeComponentCatalog(args.registry),
  ].join('\n');
  const prompt = [
    `artifactId: ${args.artifactId}`,
    `kind: ${args.kind}`,
    '',
    'Requirement / source content:',
    ingestionToText(args.ingestion),
  ].join('\n');
  return { systemInstruction, prompt };
}
```

- [ ] **Step 4: Write `buildColdStart.ts`**

```typescript
// packages/server/src/semantic/buildColdStart.ts
import {
  validateAst, extractJsonBodyShim, BASE_COMPONENTS,
  type IngestionAst, type SemanticUIAst, type ComponentRegistry,
} from '@designbridge/ast';
import { extractJsonBody } from '../services/provider';
import { defaultGenerate, type GenerateFn } from './generate';
import { runRepairLoop } from './repairLoop';
import { buildColdStartPrompt } from './prompts';

export interface BuildColdStartOptions {
  artifactId: string;
  kind?: SemanticUIAst['kind'];
  registry?: ComponentRegistry;
  generate?: GenerateFn;
  maxRepairs?: number;
  model?: string;
}

/**
 * Cold start: IngestionAst → AI → full Semantic UI AST (validated). The AI emits
 * the complete ComponentNode shape (ids + arrays); we force artifactId/kind to the
 * requested values so the AI cannot drift them, then validate. Invalid output is
 * repaired via the bounded repair loop.
 */
export async function buildColdStart(
  ingestion: IngestionAst,
  options: BuildColdStartOptions,
): Promise<SemanticUIAst> {
  const registry = options.registry ?? BASE_COMPONENTS;
  const kind = options.kind ?? 'page';
  const generate = options.generate ?? defaultGenerate;
  const { systemInstruction, prompt } = buildColdStartPrompt({
    ingestion, registry, artifactId: options.artifactId, kind,
  });

  return runRepairLoop<SemanticUIAst>({
    generate,
    systemInstruction,
    initialPrompt: prompt,
    maxRepairs: options.maxRepairs,
    model: options.model,
    parseAndValidate: (raw) => {
      const parsed = JSON.parse(extractJsonBody(raw)) as SemanticUIAst;
      // Force identity fields — the AI does not own these.
      parsed.artifactId = options.artifactId;
      parsed.kind = kind;
      const result = validateAst(parsed, { registry });
      if (result.valid) return { valid: true, value: parsed };
      return { valid: false, errors: result.errors.map(e => `${e.path}: ${e.message}`) };
    },
  });
}
```

> IMPORTANT: `extractJsonBodyShim` is NOT a real export — remove that import line; use ONLY `extractJsonBody` from `../services/provider`. (Lint will catch the unused import; delete it.) This note exists so the implementer doesn't blindly copy a bad import — the correct imports are: `{ validateAst, BASE_COMPONENTS, type IngestionAst, type SemanticUIAst, type ComponentRegistry }` from `@designbridge/ast`, and `{ extractJsonBody }` from `../services/provider`.

- [ ] **Step 5: Run tests, expect PASS** — 5 buildColdStart tests green. Fix the import (remove the shim) so it compiles.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/semantic/prompts.ts packages/server/src/semantic/buildColdStart.ts packages/server/src/semantic/__tests__/buildColdStart.test.ts
git commit -m "feat(server): add buildColdStart (IngestionAst → validated SemanticUIAst)"
```

---

## Phase 4 — Mutation builder

### Task 6: mutation prompt + `applyMutation`

**Files:**
- Modify: `packages/server/src/semantic/prompts.ts` (add `buildMutationPrompt`)
- Create: `packages/server/src/semantic/applyMutation.ts`
- Create: `packages/server/src/semantic/index.ts`
- Test: `packages/server/src/semantic/__tests__/applyMutation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/semantic/__tests__/applyMutation.test.ts
import { describe, it, expect, vi } from 'vitest';
import { applyMutation } from '../applyMutation';
import { AST_SCHEMA_VERSION, type SemanticUIAst } from '@designbridge/ast';

const baseAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'login', kind: 'page',
  root: { id: 'n_root', type: 'Form', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [],
    children: [
      { id: 'n_submit', type: 'Button', props: { label: 'Go' }, layout: { kind: 'flow' }, style: {},
        bindings: [], events: [], constraints: [], children: [] },
    ] },
});

describe('applyMutation', () => {
  it('applies AI-emitted ops to the AST and returns a validated result', async () => {
    const ops = JSON.stringify({ ops: [
      { op: 'setProp', nodeId: 'n_submit', key: 'label', value: 'Sign in' },
      { op: 'addComponent', parentId: 'n_root', type: 'Input', props: { inputType: 'email' } },
    ] });
    const generate = vi.fn().mockResolvedValue(ops);
    const after = await applyMutation(baseAst(), 'rename the button to Sign in and add an email field', { generate });
    const submit = after.root.children.find(c => c.id === 'n_submit');
    expect(submit?.props.label).toBe('Sign in');
    expect(after.root.children.some(c => c.type === 'Input')).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('includes the current AST + the available ops + the instruction in the prompt', async () => {
    const generate = vi.fn().mockResolvedValue('{"ops":[]}');
    await applyMutation(baseAst(), 'make the button red', { generate });
    const call = generate.mock.calls[0][0];
    expect(call.prompt).toMatch(/make the button red/);
    expect(call.prompt).toMatch(/n_submit/);            // current AST is shown
    expect(call.systemInstruction).toMatch(/setProp|addComponent/); // op vocabulary
  });

  it('repairs when the AI emits ops that produce an invalid AST', async () => {
    // First: op references a missing node -> applyMutationOps throws -> invalid; repair succeeds.
    const bad = JSON.stringify({ ops: [{ op: 'setProp', nodeId: 'n_missing', key: 'x', value: 1 }] });
    const good = JSON.stringify({ ops: [{ op: 'setProp', nodeId: 'n_submit', key: 'label', value: 'Ok' }] });
    const generate = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good);
    const after = await applyMutation(baseAst(), 'fix it', { generate });
    expect(after.root.children[0]?.props.label).toBe('Ok');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('returns the original AST unchanged when the AI emits an empty op list', async () => {
    const before = baseAst();
    const generate = vi.fn().mockResolvedValue('{"ops":[]}');
    const after = await applyMutation(before, 'no change needed', { generate });
    expect(after.root.children[0]?.props.label).toBe('Go');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing modules.

- [ ] **Step 3: Add `buildMutationPrompt` to `prompts.ts`**

```typescript
// append to packages/server/src/semantic/prompts.ts
import { toJson } from '@designbridge/ast';

const OP_VOCABULARY = [
  'Respond with JSON: { "ops": MutationOp[] }. Each op edits the AST. Available ops:',
  '  - { "op":"addComponent", "parentId":string, "type":string, "props"?:object, "index"?:number }',
  '  - { "op":"setProp", "nodeId":string, "key":string, "value":any }',
  '  - { "op":"removeComponent", "nodeId":string }',
  '  - { "op":"moveComponent", "nodeId":string, "newParentId":string, "index"?:number }',
  '  - { "op":"addBinding", "nodeId":string, "binding":{ "propKey":string, "source":"state"|"api"|"static"|"computed", ... } }',
  '  - { "op":"addEvent", "nodeId":string, "event":{ "event":string, "action":{...} } }',
  '  - { "op":"addConstraintRef", "nodeId":string, "ruleId":string }',
  'Reference EXISTING node ids from the current AST. A newly added component cannot be referenced by',
  'later ops in the same batch — fully configure new nodes via the addComponent "props".',
  'Emit ONLY the ops needed for the requested change. Empty list {"ops":[]} if no change is needed.',
  'Respond with JSON only — no markdown, no prose.',
].join('\n');

export function buildMutationPrompt(args: {
  ast: SemanticUIAst;
  instruction: string;
  registry: ComponentRegistry;
}): { systemInstruction: string; prompt: string } {
  const systemInstruction = [
    'You are a UI compiler editing an existing Semantic UI AST via mutation ops.',
    '',
    OP_VOCABULARY,
    '',
    describeComponentCatalog(args.registry),
  ].join('\n');
  const prompt = [
    'Current Semantic UI AST:',
    toJson(args.ast, { pretty: true }),
    '',
    'User instruction:',
    args.instruction,
  ].join('\n');
  return { systemInstruction, prompt };
}
```

- [ ] **Step 4: Write `applyMutation.ts`**

```typescript
// packages/server/src/semantic/applyMutation.ts
import {
  validateAst, applyMutationOps, BASE_COMPONENTS,
  type SemanticUIAst, type MutationOp, type ComponentRegistry,
} from '@designbridge/ast';
import { extractJsonBody } from '../services/provider';
import { defaultGenerate, type GenerateFn } from './generate';
import { runRepairLoop } from './repairLoop';
import { buildMutationPrompt } from './prompts';

export interface ApplyMutationOptions {
  registry?: ComponentRegistry;
  generate?: GenerateFn;
  maxRepairs?: number;
  model?: string;
}

/**
 * Iterative edit: (current AST + natural-language instruction) → AI emits MutationOp[]
 * → apply via pure primitives → validate. Invalid output (parse error, bad op, or an
 * op that yields an invalid AST) is repaired via the bounded repair loop.
 */
export async function applyMutation(
  ast: SemanticUIAst,
  instruction: string,
  options: ApplyMutationOptions = {},
): Promise<SemanticUIAst> {
  const registry = options.registry ?? BASE_COMPONENTS;
  const generate = options.generate ?? defaultGenerate;
  const { systemInstruction, prompt } = buildMutationPrompt({ ast, instruction, registry });

  return runRepairLoop<SemanticUIAst>({
    generate,
    systemInstruction,
    initialPrompt: prompt,
    maxRepairs: options.maxRepairs,
    model: options.model,
    parseAndValidate: (raw) => {
      const parsed = JSON.parse(extractJsonBody(raw)) as { ops?: MutationOp[] };
      const ops = parsed.ops ?? [];
      // applyMutationOps may throw (bad op / missing node) — runRepairLoop catches it as invalid.
      const next = applyMutationOps(ast, ops);
      const result = validateAst(next, { registry });
      if (result.valid) return { valid: true, value: next };
      return { valid: false, errors: result.errors.map(e => `${e.path}: ${e.message}`) };
    },
  });
}
```

- [ ] **Step 5: Write the barrel `index.ts`**

```typescript
// packages/server/src/semantic/index.ts
export { buildColdStart } from './buildColdStart';
export type { BuildColdStartOptions } from './buildColdStart';
export { applyMutation } from './applyMutation';
export type { ApplyMutationOptions } from './applyMutation';
export { defaultGenerate } from './generate';
export type { GenerateFn } from './generate';
export { describeComponentCatalog } from './componentCatalog';
export { ingestionToText } from './prompts';
```

- [ ] **Step 6: Run tests, expect PASS** — 4 applyMutation tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/semantic/prompts.ts packages/server/src/semantic/applyMutation.ts packages/server/src/semantic/index.ts packages/server/src/semantic/__tests__/applyMutation.test.ts
git commit -m "feat(server): add applyMutation (NL instruction → AI ops → validated AST)"
```

---

## Phase 5 — Verify

### Task 7: Full build + test verification

**Files:** none.

- [ ] **Step 1:** `pnpm --filter @designbridge/ast build && pnpm --filter @designbridge/ast test` → clean build; all ast tests pass (Plan 1+2 + the new mutationOp tests).
- [ ] **Step 2:** `pnpm --filter server build` → exit 0 (the `defaultGenerate` param shape compiles against ai-core; the semantic module resolves `@designbridge/ast`).
- [ ] **Step 3:** `pnpm --filter server test` → all new semantic suites pass (componentCatalog, repairLoop, buildColdStart, applyMutation); the ONLY tolerated red is the pre-existing `htmlSanitizer.test.ts > injectConventionColors`. No NEW failures.
- [ ] **Step 4:** `git diff --stat <plan2-head>..HEAD -- packages/server/src/routes packages/server/src/services/chat.ts packages/server/src/services/parallelGenerator.ts` → EMPTY (no route/old-generation files touched; builder is standalone).

---

## Acceptance Criteria

- [ ] `@designbridge/ast` exports `MutationOp` (7-variant union) + `applyMutationOps` (immutable, folds through the 7 primitives, annotates errors with op index).
- [ ] `packages/server/src/semantic/` provides `buildColdStart(ingestion, {artifactId,...})` and `applyMutation(ast, instruction)`, both AI-backed through an injectable `GenerateFn` (default = provider) so tests use NO real API calls.
- [ ] Cold start: AI emits the full ComponentNode shape; builder forces `artifactId`/`kind`, validates via `validateAst`, repairs invalid output (bounded), surfaces failure when exhausted.
- [ ] Mutation: AI emits `{ ops: MutationOp[] }`; applied via `applyMutationOps`; result validated; repairs on parse/op/validation failure.
- [ ] The component catalog (from `BASE_COMPONENTS`) and the ingestion/instruction content appear in the prompts (asserted by tests).
- [ ] `pnpm --filter @designbridge/ast test` + `pnpm --filter server test` pass for all new suites (only the pre-existing htmlSanitizer red tolerated). Both builds exit 0.
- [ ] ZERO new dependencies; NO route/old-generation files modified.
- [ ] Per-task commits with `feat(ast)`/`feat(server)` convention.

## Compiler Invariant (held by this plan)

> **AI only proposes; the AST is truth.** The AI never returns a stored AST directly — its output is parsed, validated against `validateAst`, and (for edits) applied ONLY through the pure mutation primitives. Anything that fails validation is repaired or rejected. There is no path by which unvalidated AI output becomes a persisted AST.

---

## Risks / Notes for Executor

1. **`GenerateParams` shape (Task 3):** verify the exact field names ai-core expects for the user message (`messages: ChatMessage[]` with `{role,content}` vs a `prompt` field) by reading an existing `generateContent` call site (e.g. in `chat.ts` or another service). Match it exactly — do NOT invent fields. The build will fail loudly if wrong; fix against the real types.
2. **Remove the bogus `extractJsonBodyShim` import** in `buildColdStart.ts` (it's a deliberate trap-note in the plan): import `extractJsonBody` from `../services/provider` only.
3. **`maxOutputTokens: 65536`** matches the project's large-output convention (CLAUDE.md notes 8192/65536). A full-page AST can be large; keep the high cap.
4. **Repair loop re-sends the FULL prompt + errors** (not a diff), because the AI re-emits the complete JSON. This is intentional and matches the "re-emit complete corrected JSON" instruction.
5. **No real AI in tests:** every builder test injects `generate`. Do NOT write a test that calls the real provider (it would hit the network / need credentials and be flaky). A manual/integration smoke against the real provider is out of scope for the automated suite.
6. **vitest stays `^3.2.4`.** Do not upgrade.
7. **Do NOT wire into routes.** Standalone module; Plan 7 migrates the real flow.
8. **`toJson(ast, { pretty: true })`** is used to render the current AST into the mutation prompt — confirm `toJson` accepts the `{ pretty }` option (it does, per Plan 1).

---

**Plan end.** Ready for execution.
