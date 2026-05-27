# Plan 1 — Semantic UI AST Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the Semantic UI AST — the single source of truth for the AI UI Compiler — as a versioned, strongly-typed schema with a JSON Schema validator, 20-component base registry, AST mutation primitives that map 1-to-1 to the AI tool-call interface, and a `verify-ast` CLI for CI. All downstream plans (ingestion, AI semantic builder, skill engine, codegen, client UI) reference this package; nothing else can start without it.

**Architecture:** Create a new pnpm workspace package `packages/ast` that owns: (1) the `SemanticUIAst` TS types — including ComponentNode, LayoutIntent, StyleIntent, DataBinding, EventBinding, RuleRef — designed completely from day 1 even though Mock backend (M1) only consumes a subset; (2) ajv-compiled JSON Schema validator giving identical runtime guarantees; (3) base component registry of 20 components with per-type prop schemas; (4) pure mutation primitives (`addComponent`, `setProp`, `removeComponent`, `moveComponent`, `addBinding`, `addEvent`, `addConstraintRef`) — these are the canonical AI tool-call surface defined in spec §4.1; (5) query/diff helpers; (6) a `verify-ast` CLI binary for git pre-commit + CI. The package emits CJS for the server and ESM types for the Vite client via a dual-entry TS build. No React, no Vue, no I/O — pure data + functions.

**Tech Stack:** TypeScript 5.6 strict, Vitest 4.x (already in server), ajv 8.x for JSON Schema validation, **nanoid 3.x** for stable node IDs (v3 ships dual CJS+ESM; v4/v5 are ESM-only and crash the server's CJS runtime with `ERR_REQUIRE_ESM` — unit tests run under vitest/ESM so they would NOT catch this). No new runtime UI deps. Test pattern follows existing `packages/server/src/services/__tests__/htmlSanitizer.test.ts`.

**Spec:** `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md` (§2.5, §3.2, §4.1, §4.4-4.5, §6.4, §6.12)

**Upstream dependencies:** none — this is the foundation.

**Downstream consumers:** Plan 2 (Ingestion AST parsers — output target), Plan 3 (AI Semantic Builder — generates AST, calls mutation primitives), Plan 4 (Skill Engine — transforms AST), Plan 5 (Mock codegen — reads AST), Plan 6 (Client UI — renders AST tree + dispatches mutations), Plan 7 (project structure — persists `*.ast.json`), Plan 8 (`verify-rules` CLI sibling).

**Scope boundary (out of plan):** No AI prompts, no parsers, no codegen templates, no React/Vue components, no UI, no Vue SFC AST (low-level AST is Plan 5's concern), no rule schema/definition (Plan 4 defines `Rule`; this plan only stores `RuleRef = { ruleId: string }`).

---

## Self-Review Notes (applied)

- **Spec coverage**: §2.5 design principles → enforced via mutation-primitive purity (Task 11-15). §3.2 ComponentNode shape → Tasks 5-6. §4.1 AI ↔ AST protocol → mutation primitives in Tasks 11-15 match the 5 listed tool calls. §4.4 Skill dual representation → `RuleRef` is the JSON-side reference (Task 4). §4.5 build-time application → enforced by the immutable mutation API (mutations return new AST, never mutate input). §6.4 component registry → Tasks 9-10. §6.12 `verify-ast` CLI → Task 18.
- **Locked decisions**: 20 base components named in Task 9. Node ID generator uses `nanoid(10)` for short URL-safe IDs (Task 6). Mutation primitives are immutable (structural sharing where cheap, full clone where safer). `ast.schemaVersion = 1` from day 1 — future evolution gets a new integer.
- **Out of scope clarifications**: `Rule` shape (when/then/priority) belongs to Plan 4 — this plan ONLY models `RuleRef = { ruleId: string }`. `DataBinding`/`EventBinding` schemas are designed completely but the runtime that resolves them is Plan 9 (Production backend).

---

## File Structure

All new files live under `packages/ast/`. No existing files modified except `pnpm-workspace.yaml` glob (already covers `packages/*`, so no change needed) and root `package.json` (no change needed). Root `tsconfig.json` does not exist — each package has its own.

```
packages/ast/
  package.json                          ← new workspace package
  tsconfig.json                         ← CJS build config (mirrors server)
  tsconfig.esm.json                     ← ESM build for client consumption
  README.md                             ← package-level doc
  bin/
    verify-ast.ts                       ← CLI entry
  src/
    index.ts                            ← public re-exports
    types/
      ast.ts                            ← SemanticUIAst envelope
      componentNode.ts                  ← ComponentNode interface
      layoutIntent.ts                   ← LayoutIntent
      styleIntent.ts                    ← StyleIntent
      dataBinding.ts                    ← DataBinding
      eventBinding.ts                   ← EventBinding
      ruleRef.ts                        ← RuleRef
    ids/
      generateNodeId.ts                 ← nanoid wrapper
      collectIds.ts                     ← walk + return Set<string>
    registry/
      baseComponents.ts                 ← 20-entry registry
      componentSpec.ts                  ← per-type spec shape
    schema/
      jsonSchema.ts                     ← compiled JSON Schema (handwritten, not auto-generated)
      validate.ts                       ← ajv-based validator
    mutations/
      addComponent.ts
      setProp.ts
      removeComponent.ts
      moveComponent.ts
      addBinding.ts
      addEvent.ts
      addConstraintRef.ts
    query/
      findNode.ts
      getAncestors.ts
      getDescendants.ts
    diff/
      structuralDiff.ts
    serialize/
      toJson.ts
      fromJson.ts
    __tests__/
      types.test.ts
      generateNodeId.test.ts
      collectIds.test.ts
      baseComponents.test.ts
      validate.test.ts
      mutations.test.ts
      query.test.ts
      diff.test.ts
      serialize.test.ts
      verifyAst.test.ts
```

Per the spec: file responsibilities are one-per-file (each type, each mutation primitive, each helper gets its own file). Test files are grouped by domain under `__tests__/`. The package emits a single `src/index.ts` barrel that re-exports the public surface — `mutations/*` and `query/*` are also re-exported individually under namespaces for downstream tool-call wiring.

---

## Phase 1 — Package Bootstrap

### Task 1: Create `packages/ast` package skeleton

**Files:**
- Create: `packages/ast/package.json`
- Create: `packages/ast/tsconfig.json`
- Create: `packages/ast/tsconfig.esm.json`
- Create: `packages/ast/src/index.ts`
- Create: `packages/ast/README.md`

- [ ] **Step 1: Write `packages/ast/package.json`**

```json
{
  "name": "@designbridge/ast",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/cjs/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/cjs/index.d.ts",
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js"
    }
  },
  "bin": {
    "verify-ast": "./dist/cjs/bin/verify-ast.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.esm.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "nanoid": "^3.3.7"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.2.4",
    "@types/node": "^22.0.0"
  }
}
```

> **Note (applied during execution):** vitest is pinned to `^3.2.4`, NOT `^4.x`. vitest 4 requires `vite ^6 || ^7`, but this monorepo pins `vite ^5` (via `packages/client`), so vitest 4 crashes at startup with `ERR_PACKAGE_PATH_NOT_EXPORTED: ./module-runner`. vitest 3.2.4 accepts `vite ^5 || ^6 || ^7`. (The server's `package.json` still declares vitest ^4.1.2 — if its tests break in Task 17, pin it to ^3.2.4 too.)

- [ ] **Step 2: Write `packages/ast/tsconfig.json`** (CJS for server)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist/cjs",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/**/__tests__"]
}
```

> **Note (applied during execution):** `rootDir` is `"src"` (not `"."`) so output lands at `dist/cjs/index.js` matching `package.json` `main`/`exports`. The CLI therefore lives at `src/bin/verify-ast.ts` (Task 16), compiling to `dist/cjs/bin/verify-ast.js` — which matches the `bin` field. Do NOT add a top-level `bin/` dir.

- [ ] **Step 3: Write `packages/ast/tsconfig.esm.json`** (ESM for client)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "outDir": "dist/esm",
    "declaration": false,
    "declarationMap": false
  }
}
```

> **Note (applied during execution):** `declarationMap: false` is required — the base config sets it `true`, and TS5069 errors when `declarationMap` is on but `declaration` is off.

- [ ] **Step 4: Write minimal `packages/ast/src/index.ts`**

```typescript
export const AST_SCHEMA_VERSION = 1;
```

- [ ] **Step 5: Write `packages/ast/README.md`**

```markdown
# @designbridge/ast

Semantic UI AST — single source of truth for the DesignBridge AI UI Compiler.

See `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md` §2-§4 for system context.

This package exports:
- TypeScript types (`SemanticUIAst`, `ComponentNode`, ...)
- ajv JSON Schema validator (`validateAst`)
- Base component registry (20 components)
- Pure AST mutation primitives (= the AI tool-call surface)
- AST query / diff / serialization helpers
- `verify-ast` CLI for CI

The AST is immutable. All mutations return a new AST.
```

- [ ] **Step 6: Install dependencies**

Run: `pnpm install`
Expected: `packages/ast/node_modules` populated; root pnpm-lock.yaml updated to include ajv + nanoid.

- [ ] **Step 7: Verify build runs**

Run: `pnpm --filter @designbridge/ast build`
Expected: PASS — creates `packages/ast/dist/cjs/index.js` and `packages/ast/dist/esm/index.js`.

- [ ] **Step 8: Commit**

```bash
git add packages/ast/ pnpm-lock.yaml
git commit -m "feat(ast): bootstrap @designbridge/ast workspace package"
```

---

## Phase 2 — Core Types

> All types are designed completely up front per spec §3.2: M1 Mock backend only **reads** type/props/layout/style, but the schema includes bindings/events/constraints from day 1 so M2 doesn't need a migration.

### Task 2: Define `LayoutIntent` type

**Files:**
- Create: `packages/ast/src/types/layoutIntent.ts`
- Test: `packages/ast/src/__tests__/types.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/ast/src/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type { LayoutIntent } from '../types/layoutIntent';

describe('LayoutIntent', () => {
  it('accepts a vertical stack with gap', () => {
    const layout: LayoutIntent = {
      kind: 'stack',
      direction: 'vertical',
      gap: 8,
      align: 'start',
      justify: 'start',
    };
    expect(layout.kind).toBe('stack');
  });

  it('accepts a grid with column template', () => {
    const layout: LayoutIntent = {
      kind: 'grid',
      columns: 3,
      gap: 16,
    };
    expect(layout.kind).toBe('grid');
  });

  it('accepts flow layout with no positional hints', () => {
    const layout: LayoutIntent = { kind: 'flow' };
    expect(layout.kind).toBe('flow');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @designbridge/ast test`
Expected: FAIL with "Cannot find module '../types/layoutIntent'".

- [ ] **Step 3: Write `layoutIntent.ts`**

```typescript
// packages/ast/src/types/layoutIntent.ts
export type LayoutKind = 'stack' | 'grid' | 'flow' | 'absolute';

export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch';
export type LayoutJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

export interface StackLayout {
  kind: 'stack';
  direction: 'vertical' | 'horizontal';
  gap?: number;
  align?: LayoutAlign;
  justify?: LayoutJustify;
  wrap?: boolean;
}

export interface GridLayout {
  kind: 'grid';
  columns: number | string;     // number for equal cols, string for explicit template e.g. '1fr 2fr 1fr'
  rows?: number | string;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
}

export interface FlowLayout {
  kind: 'flow';
}

export interface AbsoluteLayout {
  kind: 'absolute';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export type LayoutIntent = StackLayout | GridLayout | FlowLayout | AbsoluteLayout;
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm --filter @designbridge/ast test`
Expected: PASS — 3 tests in `LayoutIntent` describe.

- [ ] **Step 5: Commit**

```bash
git add packages/ast/src/types/layoutIntent.ts packages/ast/src/__tests__/types.test.ts
git commit -m "feat(ast): define LayoutIntent type"
```

---

### Task 3: Define `StyleIntent` type

**Files:**
- Create: `packages/ast/src/types/styleIntent.ts`
- Modify: `packages/ast/src/__tests__/types.test.ts` (append)

- [ ] **Step 1: Append failing test**

```typescript
// append to packages/ast/src/__tests__/types.test.ts
import type { StyleIntent } from '../types/styleIntent';

describe('StyleIntent', () => {
  it('accepts background + text + spacing tokens', () => {
    const style: StyleIntent = {
      background: 'surface-elevated',
      textColor: 'text-primary',
      padding: 16,
      borderRadius: 8,
    };
    expect(style.background).toBe('surface-elevated');
  });

  it('accepts raw color values (hex / rgb)', () => {
    const style: StyleIntent = { background: '#1e293b', textColor: 'rgb(241,245,249)' };
    expect(style.textColor).toMatch(/rgb/);
  });

  it('accepts empty object (style is optional in spirit)', () => {
    const style: StyleIntent = {};
    expect(Object.keys(style)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `Cannot find module '../types/styleIntent'`.

- [ ] **Step 3: Write `styleIntent.ts`**

```typescript
// packages/ast/src/types/styleIntent.ts
// Tokens (e.g. 'text-primary') reference design-rules; raw values (hex/rgb) are also allowed.
// Skill Engine + Design Constraints may rewrite raw values to tokens during the constraint pass.

export type ColorValue = string;   // token name OR raw CSS color
export type SpacingValue = number | string;  // pixels or token name e.g. 'spacing-md'
export type SizeValue = number | string;     // pixels, %, or token name

export interface StyleIntent {
  background?: ColorValue;
  textColor?: ColorValue;
  borderColor?: ColorValue;
  borderWidth?: number;
  borderRadius?: SpacingValue;

  padding?: SpacingValue;
  paddingX?: SpacingValue;
  paddingY?: SpacingValue;
  margin?: SpacingValue;
  marginX?: SpacingValue;
  marginY?: SpacingValue;

  width?: SizeValue;
  height?: SizeValue;
  minWidth?: SizeValue;
  maxWidth?: SizeValue;

  fontSize?: SpacingValue;
  fontWeight?: number | 'normal' | 'bold';
  lineHeight?: number;

  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  opacity?: number;

  // Escape hatch for backend-specific class names (Tailwind etc.). Skill Engine may forbid this.
  rawClasses?: string[];
}
```

- [ ] **Step 4: Run, expect PASS** — all `LayoutIntent` + `StyleIntent` tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/ast/src/types/styleIntent.ts packages/ast/src/__tests__/types.test.ts
git commit -m "feat(ast): define StyleIntent type"
```

---

### Task 4: Define `DataBinding`, `EventBinding`, `RuleRef`

**Files:**
- Create: `packages/ast/src/types/dataBinding.ts`
- Create: `packages/ast/src/types/eventBinding.ts`
- Create: `packages/ast/src/types/ruleRef.ts`
- Modify: `packages/ast/src/__tests__/types.test.ts` (append)

- [ ] **Step 1: Append failing tests**

```typescript
import type { DataBinding } from '../types/dataBinding';
import type { EventBinding } from '../types/eventBinding';
import type { RuleRef } from '../types/ruleRef';

describe('DataBinding', () => {
  it('binds a prop to a state path', () => {
    const b: DataBinding = { propKey: 'value', source: 'state', path: 'form.email' };
    expect(b.source).toBe('state');
  });
  it('binds to an API endpoint', () => {
    const b: DataBinding = {
      propKey: 'items',
      source: 'api',
      endpoint: { method: 'GET', url: '/api/users' },
    };
    expect(b.endpoint?.method).toBe('GET');
  });
});

describe('EventBinding', () => {
  it('binds click to an action ref', () => {
    const e: EventBinding = { event: 'click', action: { kind: 'navigate', to: '/home' } };
    expect(e.event).toBe('click');
  });
  it('binds submit to an API call action', () => {
    const e: EventBinding = {
      event: 'submit',
      action: {
        kind: 'api',
        endpoint: { method: 'POST', url: '/api/login' },
        payloadFromState: 'form',
      },
    };
    expect(e.action.kind).toBe('api');
  });
});

describe('RuleRef', () => {
  it('stores only the rule id', () => {
    const r: RuleRef = { ruleId: 'houseprice.member.required-fields' };
    expect(r.ruleId).toContain('.');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — three missing modules.

- [ ] **Step 3: Write `dataBinding.ts`**

```typescript
// packages/ast/src/types/dataBinding.ts
export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  // Query string keys to read from state; resolved by Production backend (M2). Mock backend ignores.
  queryFromState?: Record<string, string>;
  // Body shape — string path into state (e.g. 'form').
  bodyFromState?: string;
}

export type BindingSource = 'state' | 'api' | 'static' | 'computed';

export interface DataBinding {
  propKey: string;            // ComponentNode.props key this binding writes into
  source: BindingSource;
  path?: string;              // state path, e.g. 'form.email'
  endpoint?: ApiEndpoint;     // when source === 'api'
  staticValue?: unknown;      // when source === 'static'
  expression?: string;        // when source === 'computed' — opaque to AST, resolved by codegen target
}
```

- [ ] **Step 4: Write `eventBinding.ts`**

```typescript
// packages/ast/src/types/eventBinding.ts
import type { ApiEndpoint } from './dataBinding';

export type EventName =
  | 'click' | 'submit' | 'change' | 'input' | 'focus' | 'blur'
  | 'mount' | 'unmount';

export type Action =
  | { kind: 'navigate'; to: string }
  | { kind: 'api'; endpoint: ApiEndpoint; payloadFromState?: string }
  | { kind: 'setState'; path: string; valueFromEvent?: boolean; staticValue?: unknown }
  | { kind: 'openModal'; modalId: string }
  | { kind: 'closeModal'; modalId?: string }
  | { kind: 'custom'; name: string; args?: Record<string, unknown> };

export interface EventBinding {
  event: EventName;
  action: Action;
  // Optional: 2nd-order chained action (for simple flows; complex flows = 'custom').
  next?: Action;
}
```

- [ ] **Step 5: Write `ruleRef.ts`**

```typescript
// packages/ast/src/types/ruleRef.ts
// References a rule defined elsewhere. The actual rule shape (when/then/priority)
// lives in Plan 4 (Skill Engine) — this AST package only stores the id.
export interface RuleRef {
  ruleId: string;
}
```

- [ ] **Step 6: Run tests, expect PASS** — DataBinding / EventBinding / RuleRef green.

- [ ] **Step 7: Commit**

```bash
git add packages/ast/src/types/dataBinding.ts packages/ast/src/types/eventBinding.ts packages/ast/src/types/ruleRef.ts packages/ast/src/__tests__/types.test.ts
git commit -m "feat(ast): define DataBinding / EventBinding / RuleRef types"
```

---

### Task 5: Define `ComponentNode` + `SemanticUIAst` envelope

**Files:**
- Create: `packages/ast/src/types/componentNode.ts`
- Create: `packages/ast/src/types/ast.ts`
- Modify: `packages/ast/src/index.ts` (re-export)
- Modify: `packages/ast/src/__tests__/types.test.ts` (append)

- [ ] **Step 1: Append failing test**

```typescript
import type { ComponentNode } from '../types/componentNode';
import type { SemanticUIAst } from '../types/ast';
import { AST_SCHEMA_VERSION } from '../index';

describe('ComponentNode', () => {
  it('is recursive — has children of same type', () => {
    const node: ComponentNode = {
      id: 'n_abc',
      type: 'Container',
      props: {},
      layout: { kind: 'stack', direction: 'vertical' },
      style: {},
      bindings: [],
      events: [],
      constraints: [],
      children: [
        {
          id: 'n_def',
          type: 'Text',
          props: { content: 'hello' },
          layout: { kind: 'flow' },
          style: {},
          bindings: [],
          events: [],
          constraints: [],
          children: [],
        },
      ],
    };
    expect(node.children[0]?.type).toBe('Text');
  });
});

describe('SemanticUIAst envelope', () => {
  it('carries schemaVersion + artifactId + root node', () => {
    const ast: SemanticUIAst = {
      schemaVersion: AST_SCHEMA_VERSION,
      artifactId: 'home-page',
      kind: 'page',
      root: {
        id: 'n_root',
        type: 'Container',
        props: {},
        layout: { kind: 'stack', direction: 'vertical' },
        style: {},
        bindings: [],
        events: [],
        constraints: [],
        children: [],
      },
    };
    expect(ast.schemaVersion).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing modules.

- [ ] **Step 3: Write `componentNode.ts`**

```typescript
// packages/ast/src/types/componentNode.ts
import type { LayoutIntent } from './layoutIntent';
import type { StyleIntent } from './styleIntent';
import type { DataBinding } from './dataBinding';
import type { EventBinding } from './eventBinding';
import type { RuleRef } from './ruleRef';

export interface ComponentNode {
  /** Stable, unique within an AST. Generated by `generateNodeId()`. */
  id: string;
  /** Must match a registered component type. See `registry/baseComponents.ts`. */
  type: string;
  /** Per-component-type prop bag. Schema lives in the component registry. */
  props: Record<string, unknown>;
  /** How this node arranges its children. */
  layout: LayoutIntent;
  /** Visual styling. Mock backend (M1) reads this directly. */
  style: StyleIntent;
  /** Phase-2 data bindings. Mock backend ignores; Production backend consumes. */
  bindings: DataBinding[];
  /** Phase-2 event handlers. Mock backend ignores; Production backend consumes. */
  events: EventBinding[];
  /** References to JSON rules applied to this node by Skill Engine. */
  constraints: RuleRef[];
  /** Child nodes. Empty array for leaf components. */
  children: ComponentNode[];
}
```

- [ ] **Step 4: Write `ast.ts`**

```typescript
// packages/ast/src/types/ast.ts
import type { ComponentNode } from './componentNode';

export type ArtifactKind = 'page' | 'element' | 'multi-page' | 'fragment';

export interface SemanticUIAst {
  /** Bumped on breaking schema changes. Currently 1. */
  schemaVersion: number;
  /** Human-meaningful slug, unique within a project. */
  artifactId: string;
  /** Tells the renderer how to treat this AST (single page vs reusable element vs multi-page wizard). */
  kind: ArtifactKind;
  /** Root component (always present, even for empty artifacts — defaults to an empty Container). */
  root: ComponentNode;
  /** Optional human-readable label (e.g. "Member detail page"). Not used by codegen. */
  label?: string;
  /** Free-form metadata bag (timestamps, author, etc.). Not interpreted by the schema. */
  meta?: Record<string, unknown>;
}
```

- [ ] **Step 5: Re-export from `index.ts`**

```typescript
// packages/ast/src/index.ts
export const AST_SCHEMA_VERSION = 1;

export type { LayoutIntent } from './types/layoutIntent';
export type { StyleIntent } from './types/styleIntent';
export type { DataBinding, ApiEndpoint, BindingSource } from './types/dataBinding';
export type { EventBinding, EventName, Action } from './types/eventBinding';
export type { RuleRef } from './types/ruleRef';
export type { ComponentNode } from './types/componentNode';
export type { SemanticUIAst, ArtifactKind } from './types/ast';
```

- [ ] **Step 6: Run tests, expect PASS** — all envelope + node tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/ast/src/types/componentNode.ts packages/ast/src/types/ast.ts packages/ast/src/index.ts packages/ast/src/__tests__/types.test.ts
git commit -m "feat(ast): define ComponentNode and SemanticUIAst envelope"
```

---

## Phase 3 — IDs and Registry

### Task 6: Node ID generator + uniqueness collector

**Files:**
- Create: `packages/ast/src/ids/generateNodeId.ts`
- Create: `packages/ast/src/ids/collectIds.ts`
- Create: `packages/ast/src/__tests__/generateNodeId.test.ts`
- Create: `packages/ast/src/__tests__/collectIds.test.ts`

- [ ] **Step 1: Write failing test for `generateNodeId`**

```typescript
// packages/ast/src/__tests__/generateNodeId.test.ts
import { describe, it, expect } from 'vitest';
import { generateNodeId } from '../ids/generateNodeId';

describe('generateNodeId', () => {
  it('returns a string starting with "n_"', () => {
    const id = generateNodeId();
    expect(id).toMatch(/^n_[A-Za-z0-9_-]{8,}$/);
  });
  it('returns unique ids across 1000 calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateNodeId());
    expect(ids.size).toBe(1000);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing module.

- [ ] **Step 3: Write `generateNodeId.ts`**

```typescript
// packages/ast/src/ids/generateNodeId.ts
import { nanoid } from 'nanoid';

/**
 * Generates a stable, URL-safe node id. Always prefixed with `n_` to distinguish
 * from rule ids (`r_`), artifact ids (slugs), etc., and to make ids greppable.
 */
export function generateNodeId(): string {
  return `n_${nanoid(10)}`;
}
```

- [ ] **Step 4: Run, expect PASS**.

- [ ] **Step 5: Write failing test for `collectIds`**

```typescript
// packages/ast/src/__tests__/collectIds.test.ts
import { describe, it, expect } from 'vitest';
import { collectIds, hasDuplicateIds } from '../ids/collectIds';
import type { ComponentNode } from '../types/componentNode';

const leaf = (id: string): ComponentNode => ({
  id, type: 'Text', props: {}, layout: { kind: 'flow' }, style: {},
  bindings: [], events: [], constraints: [], children: [],
});

describe('collectIds', () => {
  it('returns ids for every node in tree (root + descendants)', () => {
    const root: ComponentNode = { ...leaf('n_root'), children: [leaf('n_a'), leaf('n_b')] };
    const ids = collectIds(root);
    expect(ids).toEqual(new Set(['n_root', 'n_a', 'n_b']));
  });
});

describe('hasDuplicateIds', () => {
  it('detects duplicate id in two distinct nodes', () => {
    const root: ComponentNode = { ...leaf('n_root'), children: [leaf('n_dup'), leaf('n_dup')] };
    expect(hasDuplicateIds(root)).toBe(true);
  });
  it('returns false when all ids are unique', () => {
    const root: ComponentNode = { ...leaf('n_root'), children: [leaf('n_a'), leaf('n_b')] };
    expect(hasDuplicateIds(root)).toBe(false);
  });
});
```

- [ ] **Step 6: Run, expect FAIL** — missing module.

- [ ] **Step 7: Write `collectIds.ts`**

```typescript
// packages/ast/src/ids/collectIds.ts
import type { ComponentNode } from '../types/componentNode';

export function collectIds(root: ComponentNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: ComponentNode): void => {
    out.add(n.id);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

export function hasDuplicateIds(root: ComponentNode): boolean {
  let count = 0;
  const seen = new Set<string>();
  const walk = (n: ComponentNode): void => {
    seen.add(n.id);
    count++;
    for (const c of n.children) walk(c);
  };
  walk(root);
  return seen.size !== count;
}
```

- [ ] **Step 8: Run, expect PASS**.

- [ ] **Step 9: Re-export and commit**

Append to `packages/ast/src/index.ts`:

```typescript
export { generateNodeId } from './ids/generateNodeId';
export { collectIds, hasDuplicateIds } from './ids/collectIds';
```

```bash
git add packages/ast/src/ids/ packages/ast/src/__tests__/generateNodeId.test.ts packages/ast/src/__tests__/collectIds.test.ts packages/ast/src/index.ts
git commit -m "feat(ast): add node id generator and uniqueness collector"
```

---

### Task 7: Base component registry — define 20 components

**Files:**
- Create: `packages/ast/src/registry/componentSpec.ts`
- Create: `packages/ast/src/registry/baseComponents.ts`
- Create: `packages/ast/src/__tests__/baseComponents.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/ast/src/__tests__/baseComponents.test.ts
import { describe, it, expect } from 'vitest';
import { BASE_COMPONENTS, getComponentSpec, registerComponent } from '../registry/baseComponents';

describe('BASE_COMPONENTS', () => {
  it('exports exactly 20 base components', () => {
    expect(Object.keys(BASE_COMPONENTS)).toHaveLength(20);
  });

  it('includes the 20 documented base set', () => {
    const expected = [
      'Container', 'Stack', 'Row', 'Grid',
      'Text', 'Heading', 'Image', 'Icon',
      'Button', 'Link',
      'Input', 'Textarea', 'Select', 'Checkbox', 'Radio',
      'Form', 'FormField',
      'Card', 'Modal', 'Table',
    ];
    expect(Object.keys(BASE_COMPONENTS).sort()).toEqual(expected.sort());
  });

  it('every component has a name + props schema', () => {
    for (const [name, spec] of Object.entries(BASE_COMPONENTS)) {
      expect(spec.name).toBe(name);
      expect(spec.props).toBeDefined();
      expect(typeof spec.allowsChildren).toBe('boolean');
    }
  });

  it('Image disallows children; Container allows children', () => {
    expect(BASE_COMPONENTS.Image.allowsChildren).toBe(false);
    expect(BASE_COMPONENTS.Container.allowsChildren).toBe(true);
  });
});

describe('getComponentSpec', () => {
  it('returns spec by name', () => {
    expect(getComponentSpec('Button')?.name).toBe('Button');
  });
  it('returns undefined for unknown', () => {
    expect(getComponentSpec('UnknownXYZ')).toBeUndefined();
  });
});

describe('registerComponent', () => {
  it('adds a project-level component spec', () => {
    const registry = registerComponent({}, {
      name: 'CustomThing',
      props: {},
      allowsChildren: false,
    });
    expect(registry.CustomThing?.name).toBe('CustomThing');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing modules.

- [ ] **Step 3: Write `componentSpec.ts`**

```typescript
// packages/ast/src/registry/componentSpec.ts

export type PropType = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'unknown';

export interface PropSpec {
  type: PropType;
  required?: boolean;
  enumValues?: readonly string[];   // only for type === 'enum'
  description?: string;
}

export interface ComponentSpec {
  /** Display name. Must equal the registry key. */
  name: string;
  /** Per-prop validation spec. Empty {} means no constrained props (props bag is still typed as Record<string,unknown>). */
  props: Record<string, PropSpec>;
  /** Whether children[] may be non-empty. */
  allowsChildren: boolean;
  /** Optional category for UI grouping in artifact rail / inspector. */
  category?: 'layout' | 'display' | 'input' | 'action' | 'container' | 'data';
}

export type ComponentRegistry = Record<string, ComponentSpec>;
```

- [ ] **Step 4: Write `baseComponents.ts`**

```typescript
// packages/ast/src/registry/baseComponents.ts
import type { ComponentSpec, ComponentRegistry } from './componentSpec';

// 20 base components. Adding to this set requires updating both the keys check
// in baseComponents.test.ts AND any downstream codegen template.
export const BASE_COMPONENTS: ComponentRegistry = {
  // --- Layout (4) ---
  Container: { name: 'Container', category: 'layout', allowsChildren: true, props: {} },
  Stack:     { name: 'Stack',     category: 'layout', allowsChildren: true, props: {} },
  Row:       { name: 'Row',       category: 'layout', allowsChildren: true, props: {} },
  Grid:      { name: 'Grid',      category: 'layout', allowsChildren: true, props: {} },

  // --- Display (4) ---
  Text:      { name: 'Text',      category: 'display', allowsChildren: false,
    props: { content: { type: 'string', required: true } } },
  Heading:   { name: 'Heading',   category: 'display', allowsChildren: false,
    props: {
      content: { type: 'string', required: true },
      level: { type: 'enum', enumValues: ['1','2','3','4','5','6'] as const },
    } },
  Image:     { name: 'Image',     category: 'display', allowsChildren: false,
    props: {
      src: { type: 'string', required: true },
      alt: { type: 'string' },
    } },
  Icon:      { name: 'Icon',      category: 'display', allowsChildren: false,
    props: { name: { type: 'string', required: true } } },

  // --- Action (2) ---
  Button:    { name: 'Button',    category: 'action', allowsChildren: false,
    props: {
      label: { type: 'string', required: true },
      variant: { type: 'enum', enumValues: ['primary','secondary','ghost','danger'] as const },
      disabled: { type: 'boolean' },
    } },
  Link:      { name: 'Link',      category: 'action', allowsChildren: false,
    props: {
      label: { type: 'string', required: true },
      href: { type: 'string' },
    } },

  // --- Input (5) ---
  Input:     { name: 'Input',     category: 'input', allowsChildren: false,
    props: {
      placeholder: { type: 'string' },
      inputType: { type: 'enum', enumValues: ['text','email','password','number','tel','url'] as const },
      value: { type: 'string' },
    } },
  Textarea:  { name: 'Textarea',  category: 'input', allowsChildren: false,
    props: { placeholder: { type: 'string' }, rows: { type: 'number' }, value: { type: 'string' } } },
  Select:    { name: 'Select',    category: 'input', allowsChildren: false,
    props: { options: { type: 'array', required: true }, value: { type: 'string' } } },
  Checkbox:  { name: 'Checkbox',  category: 'input', allowsChildren: false,
    props: { label: { type: 'string' }, checked: { type: 'boolean' } } },
  Radio:     { name: 'Radio',     category: 'input', allowsChildren: false,
    props: { options: { type: 'array', required: true }, value: { type: 'string' } } },

  // --- Container (3) ---
  Form:      { name: 'Form',      category: 'container', allowsChildren: true, props: {} },
  FormField: { name: 'FormField', category: 'container', allowsChildren: true,
    props: { label: { type: 'string' }, required: { type: 'boolean' } } },
  Card:      { name: 'Card',      category: 'container', allowsChildren: true,
    props: { title: { type: 'string' } } },

  // --- Container (modal/data) (2) ---
  Modal:     { name: 'Modal',     category: 'container', allowsChildren: true,
    props: { open: { type: 'boolean' }, title: { type: 'string' } } },
  Table:     { name: 'Table',     category: 'data', allowsChildren: false,
    props: {
      columns: { type: 'array', required: true },
      rows: { type: 'array' },
    } },
};

export function getComponentSpec(name: string): ComponentSpec | undefined {
  return BASE_COMPONENTS[name];
}

/** Pure registry merge. Used by per-project component plugins. */
export function registerComponent(
  registry: ComponentRegistry,
  spec: ComponentSpec,
): ComponentRegistry {
  return { ...registry, [spec.name]: spec };
}
```

- [ ] **Step 5: Run tests, expect PASS** — registry tests green.

- [ ] **Step 6: Re-export and commit**

Append to `packages/ast/src/index.ts`:

```typescript
export type { PropSpec, PropType, ComponentSpec, ComponentRegistry } from './registry/componentSpec';
export { BASE_COMPONENTS, getComponentSpec, registerComponent } from './registry/baseComponents';
```

```bash
git add packages/ast/src/registry/ packages/ast/src/__tests__/baseComponents.test.ts packages/ast/src/index.ts
git commit -m "feat(ast): add 20-component base registry"
```

---

## Phase 4 — Validator

### Task 8: JSON Schema + ajv validator

**Files:**
- Create: `packages/ast/src/schema/jsonSchema.ts`
- Create: `packages/ast/src/schema/validate.ts`
- Create: `packages/ast/src/__tests__/validate.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/ast/src/__tests__/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validateAst, isValidAst } from '../schema/validate';
import { BASE_COMPONENTS } from '../registry/baseComponents';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';

const minimalAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION,
  artifactId: 'home',
  kind: 'page',
  root: {
    id: 'n_root', type: 'Container', props: {},
    layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [],
  },
});

describe('validateAst', () => {
  it('accepts a minimal valid AST', () => {
    const result = validateAst(minimalAst(), { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects unknown component type', () => {
    const ast = minimalAst();
    ast.root.type = 'NotARealComponent';
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === '/root' && /unknown component type/i.test(e.message))).toBe(true);
  });

  it('rejects missing required prop (Heading.content)', () => {
    const ast = minimalAst();
    ast.root.children = [{
      id: 'n_h', type: 'Heading', props: { level: '1' }, // missing `content`
      layout: { kind: 'flow' }, style: {},
      bindings: [], events: [], constraints: [], children: [],
    }];
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /required prop "content"/.test(e.message))).toBe(true);
  });

  it('rejects children on a leaf component (Image)', () => {
    const ast = minimalAst();
    ast.root.children = [{
      id: 'n_img', type: 'Image', props: { src: '/x.png' },
      layout: { kind: 'flow' }, style: {},
      bindings: [], events: [], constraints: [],
      children: [{ id: 'n_bad', type: 'Text', props: { content: 'x' },
        layout: { kind: 'flow' }, style: {},
        bindings: [], events: [], constraints: [], children: [] }],
    }];
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /does not allow children/.test(e.message))).toBe(true);
  });

  it('rejects duplicate node ids', () => {
    const ast = minimalAst();
    ast.root.children = [
      { id: 'n_dup', type: 'Text', props: { content: 'a' }, layout: { kind: 'flow' }, style: {},
        bindings: [], events: [], constraints: [], children: [] },
      { id: 'n_dup', type: 'Text', props: { content: 'b' }, layout: { kind: 'flow' }, style: {},
        bindings: [], events: [], constraints: [], children: [] },
    ];
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /duplicate node id/.test(e.message))).toBe(true);
  });

  it('rejects wrong schemaVersion', () => {
    const ast = minimalAst();
    ast.schemaVersion = 999;
    const result = validateAst(ast, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(false);
  });
});

describe('isValidAst', () => {
  it('returns boolean shorthand', () => {
    expect(isValidAst(minimalAst(), { registry: BASE_COMPONENTS })).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing modules.

- [ ] **Step 3: Write `jsonSchema.ts`** (handwritten schema — structural shape only; deep semantic checks live in `validate.ts`)

> **Note (applied during execution):** `AST_SCHEMA_VERSION` was extracted from `index.ts` into a dedicated leaf module `packages/ast/src/version.ts` to avoid a circular import (`index` → `jsonSchema` → `index`). `index.ts` re-exports it (`export { AST_SCHEMA_VERSION } from './version'`); `jsonSchema.ts` imports from `'../version'`. The original `index.ts` line `export const AST_SCHEMA_VERSION = 1;` (Task 1 Step 4 / Task 5) moves to `version.ts`.

```typescript
// packages/ast/src/schema/jsonSchema.ts
import { AST_SCHEMA_VERSION } from '../version';

// Structural JSON Schema. Component-type / prop / children rules are checked
// in validate.ts because they depend on the runtime registry.
export const AST_JSON_SCHEMA = {
  $id: 'https://designbridge/ast.schema.json',
  type: 'object',
  required: ['schemaVersion', 'artifactId', 'kind', 'root'],
  additionalProperties: true,
  properties: {
    schemaVersion: { type: 'integer', const: AST_SCHEMA_VERSION },
    artifactId: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: ['page', 'element', 'multi-page', 'fragment'] },
    label: { type: 'string' },
    meta: { type: 'object' },
    root: { $ref: '#/$defs/componentNode' },
  },
  $defs: {
    componentNode: {
      type: 'object',
      required: ['id', 'type', 'props', 'layout', 'style', 'bindings', 'events', 'constraints', 'children'],
      additionalProperties: false,
      properties: {
        id: { type: 'string', pattern: '^n_[A-Za-z0-9_-]+$' },
        type: { type: 'string', minLength: 1 },
        props: { type: 'object' },
        layout: { type: 'object' },
        style: { type: 'object' },
        bindings: { type: 'array', items: { type: 'object' } },
        events: { type: 'array', items: { type: 'object' } },
        constraints: {
          type: 'array',
          items: {
            type: 'object',
            required: ['ruleId'],
            properties: { ruleId: { type: 'string', minLength: 1 } },
          },
        },
        children: { type: 'array', items: { $ref: '#/$defs/componentNode' } },
      },
    },
  },
} as const;
```

- [ ] **Step 4: Write `validate.ts`**

```typescript
// packages/ast/src/schema/validate.ts
import Ajv from 'ajv';
import { AST_JSON_SCHEMA } from './jsonSchema';
import { hasDuplicateIds } from '../ids/collectIds';
import type { ComponentRegistry } from '../registry/componentSpec';
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface ValidationError {
  path: string;       // JSON-pointer-like, e.g. '/root/children/0'
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidateOptions {
  registry: ComponentRegistry;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const ajvValidate = ajv.compile(AST_JSON_SCHEMA);

export function validateAst(ast: unknown, opts: ValidateOptions): ValidationResult {
  const errors: ValidationError[] = [];

  if (!ajvValidate(ast)) {
    for (const e of ajvValidate.errors ?? []) {
      errors.push({ path: e.instancePath || '/', message: `${e.message ?? 'invalid'}` });
    }
    return { valid: false, errors };
  }

  const typed = ast as SemanticUIAst;

  // Duplicate id check
  if (hasDuplicateIds(typed.root)) {
    errors.push({ path: '/root', message: 'duplicate node id detected' });
  }

  // Component-type + prop + children check (recursive)
  const walk = (n: ComponentNode, path: string): void => {
    const spec = opts.registry[n.type];
    if (!spec) {
      errors.push({ path, message: `unknown component type "${n.type}"` });
      return;
    }
    if (!spec.allowsChildren && n.children.length > 0) {
      errors.push({ path, message: `component "${n.type}" does not allow children` });
    }
    for (const [propKey, propSpec] of Object.entries(spec.props)) {
      if (propSpec.required && !(propKey in n.props)) {
        errors.push({ path: `${path}/props`, message: `missing required prop "${propKey}" for "${n.type}"` });
      }
      if (propKey in n.props && propSpec.type === 'enum' && propSpec.enumValues) {
        const v = n.props[propKey];
        // Reject non-string enum values too — the AI pipeline can emit numeric props (e.g. level: 1).
        if (typeof v !== 'string') {
          errors.push({
            path: `${path}/props/${propKey}`,
            message: `prop "${propKey}" of "${n.type}" must be a string enum value, got ${typeof v}`,
          });
        } else if (!propSpec.enumValues.includes(v)) {
          errors.push({
            path: `${path}/props/${propKey}`,
            message: `prop "${propKey}" of "${n.type}" must be one of [${propSpec.enumValues.join(', ')}], got "${v}"`,
          });
        }
      }
    }
    n.children.forEach((c, i) => walk(c, `${path}/children/${i}`));
  };

  walk(typed.root, '/root');

  return { valid: errors.length === 0, errors };
}

export function isValidAst(ast: unknown, opts: ValidateOptions): boolean {
  return validateAst(ast, opts).valid;
}
```

- [ ] **Step 5: Run tests, expect PASS** — all 7 validate cases green.

- [ ] **Step 6: Re-export and commit**

Append to `packages/ast/src/index.ts`:

```typescript
export { AST_JSON_SCHEMA } from './schema/jsonSchema';
export { validateAst, isValidAst } from './schema/validate';
export type { ValidationError, ValidationResult, ValidateOptions } from './schema/validate';
```

```bash
git add packages/ast/src/schema/ packages/ast/src/__tests__/validate.test.ts packages/ast/src/index.ts
git commit -m "feat(ast): add JSON Schema + ajv-based AST validator"
```

---

## Phase 5 — Mutation Primitives

> Each primitive is **immutable**: takes `ast`, returns a new `ast`. The primitive set IS the AI tool-call surface defined in spec §4.1; AI tool definitions in Plan 3 will be thin wrappers around these.

### Task 9: `addComponent`

**Files:**
- Create: `packages/ast/src/mutations/addComponent.ts`
- Create: `packages/ast/src/__tests__/mutations.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/ast/src/__tests__/mutations.test.ts
import { describe, it, expect } from 'vitest';
import { addComponent } from '../mutations/addComponent';
import type { SemanticUIAst } from '../types/ast';
import { AST_SCHEMA_VERSION } from '../index';

const baseAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION,
  artifactId: 'home',
  kind: 'page',
  root: {
    id: 'n_root', type: 'Container', props: {},
    layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [],
  },
});

describe('addComponent', () => {
  it('appends a new child to parent and returns a new AST', () => {
    const before = baseAst();
    const { ast: after, newNodeId } = addComponent(before, {
      parentId: 'n_root',
      type: 'Text',
      props: { content: 'hello' },
    });
    expect(after).not.toBe(before);              // immutable
    expect(before.root.children).toHaveLength(0); // not mutated
    expect(after.root.children).toHaveLength(1);
    expect(after.root.children[0]?.type).toBe('Text');
    expect(after.root.children[0]?.id).toBe(newNodeId);
  });

  it('throws when parent id not found', () => {
    expect(() => addComponent(baseAst(), { parentId: 'n_nope', type: 'Text', props: {} }))
      .toThrow(/parent.*not found/i);
  });

  it('inserts at index when provided', () => {
    let ast = baseAst();
    ast = addComponent(ast, { parentId: 'n_root', type: 'Text', props: { content: 'a' } }).ast;
    ast = addComponent(ast, { parentId: 'n_root', type: 'Text', props: { content: 'b' } }).ast;
    ast = addComponent(ast, { parentId: 'n_root', type: 'Text', props: { content: 'INSERT' }, index: 1 }).ast;
    expect(ast.root.children.map(c => (c.props.content as string))).toEqual(['a', 'INSERT', 'b']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing module.

- [ ] **Step 3: Write `addComponent.ts`**

```typescript
// packages/ast/src/mutations/addComponent.ts
import { generateNodeId } from '../ids/generateNodeId';
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface AddComponentInput {
  parentId: string;
  type: string;
  props?: Record<string, unknown>;
  index?: number;
}

export interface AddComponentResult {
  ast: SemanticUIAst;
  newNodeId: string;
}

export function addComponent(ast: SemanticUIAst, input: AddComponentInput): AddComponentResult {
  const newNodeId = generateNodeId();
  const newNode: ComponentNode = {
    id: newNodeId,
    type: input.type,
    props: input.props ?? {},
    layout: { kind: 'flow' },
    style: {},
    bindings: [],
    events: [],
    constraints: [],
    children: [],
  };

  let parentFound = false;
  const transform = (n: ComponentNode): ComponentNode => {
    if (n.id === input.parentId) {
      parentFound = true;
      const children = [...n.children];
      const idx = input.index ?? children.length;
      children.splice(idx, 0, newNode);
      return { ...n, children };
    }
    return { ...n, children: n.children.map(transform) };
  };
  const newRoot = transform(ast.root);

  if (!parentFound) {
    throw new Error(`addComponent: parent "${input.parentId}" not found in AST`);
  }
  return { ast: { ...ast, root: newRoot }, newNodeId };
}
```

- [ ] **Step 4: Run, expect PASS**.

- [ ] **Step 5: Commit**

```bash
git add packages/ast/src/mutations/addComponent.ts packages/ast/src/__tests__/mutations.test.ts
git commit -m "feat(ast): add immutable addComponent mutation primitive"
```

---

### Task 10: `setProp`

**Files:**
- Create: `packages/ast/src/mutations/setProp.ts`
- Modify: `packages/ast/src/__tests__/mutations.test.ts` (append)

- [ ] **Step 1: Append failing test**

```typescript
import { setProp } from '../mutations/setProp';

describe('setProp', () => {
  it('sets a prop on the target node, returns new AST', () => {
    let ast = baseAst();
    const added = addComponent(ast, { parentId: 'n_root', type: 'Text', props: { content: 'hi' } });
    const after = setProp(added.ast, { nodeId: added.newNodeId, key: 'content', value: 'goodbye' });
    expect(after).not.toBe(added.ast);
    expect((after.root.children[0]?.props.content)).toBe('goodbye');
    // Original retained 'hi'
    expect((added.ast.root.children[0]?.props.content)).toBe('hi');
  });

  it('throws when node id not found', () => {
    expect(() => setProp(baseAst(), { nodeId: 'n_nope', key: 'x', value: 1 }))
      .toThrow(/node.*not found/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing module.

- [ ] **Step 3: Write `setProp.ts`**

```typescript
// packages/ast/src/mutations/setProp.ts
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface SetPropInput {
  nodeId: string;
  key: string;
  value: unknown;
}

export function setProp(ast: SemanticUIAst, input: SetPropInput): SemanticUIAst {
  let found = false;
  const transform = (n: ComponentNode): ComponentNode => {
    if (n.id === input.nodeId) {
      found = true;
      return { ...n, props: { ...n.props, [input.key]: input.value } };
    }
    return { ...n, children: n.children.map(transform) };
  };
  const newRoot = transform(ast.root);
  if (!found) throw new Error(`setProp: node "${input.nodeId}" not found in AST`);
  return { ...ast, root: newRoot };
}
```

- [ ] **Step 4: Run, expect PASS**.

- [ ] **Step 5: Commit**

```bash
git add packages/ast/src/mutations/setProp.ts packages/ast/src/__tests__/mutations.test.ts
git commit -m "feat(ast): add setProp mutation primitive"
```

---

### Task 11: `removeComponent` + `moveComponent`

**Files:**
- Create: `packages/ast/src/mutations/removeComponent.ts`
- Create: `packages/ast/src/mutations/moveComponent.ts`
- Modify: `packages/ast/src/__tests__/mutations.test.ts` (append)

- [ ] **Step 1: Append failing tests**

```typescript
import { removeComponent } from '../mutations/removeComponent';
import { moveComponent } from '../mutations/moveComponent';

describe('removeComponent', () => {
  it('removes the target node from its parent', () => {
    let ast = baseAst();
    const added = addComponent(ast, { parentId: 'n_root', type: 'Text', props: { content: 'hi' } });
    const after = removeComponent(added.ast, { nodeId: added.newNodeId });
    expect(after.root.children).toHaveLength(0);
    expect(added.ast.root.children).toHaveLength(1); // immutable
  });

  it('refuses to remove the root', () => {
    expect(() => removeComponent(baseAst(), { nodeId: 'n_root' }))
      .toThrow(/cannot remove root/i);
  });

  it('throws when node id not found', () => {
    expect(() => removeComponent(baseAst(), { nodeId: 'n_missing' }))
      .toThrow(/node.*not found/i);
  });
});

describe('moveComponent', () => {
  it('moves a child to a new parent at given index', () => {
    let ast = baseAst();
    const a = addComponent(ast, { parentId: 'n_root', type: 'Container', props: {} });
    const b = addComponent(a.ast, { parentId: 'n_root', type: 'Container', props: {} });
    const t = addComponent(b.ast, { parentId: a.newNodeId, type: 'Text', props: { content: 'x' } });
    const after = moveComponent(t.ast, { nodeId: t.newNodeId, newParentId: b.newNodeId, index: 0 });

    const aNode = after.root.children.find(c => c.id === a.newNodeId);
    const bNode = after.root.children.find(c => c.id === b.newNodeId);
    expect(aNode?.children).toHaveLength(0);
    expect(bNode?.children).toHaveLength(1);
    expect(bNode?.children[0]?.id).toBe(t.newNodeId);
  });

  it('refuses to move a node into its own descendant (would create cycle)', () => {
    let ast = baseAst();
    const parent = addComponent(ast, { parentId: 'n_root', type: 'Container', props: {} });
    const child = addComponent(parent.ast, { parentId: parent.newNodeId, type: 'Container', props: {} });
    expect(() => moveComponent(child.ast, {
      nodeId: parent.newNodeId,
      newParentId: child.newNodeId,
    })).toThrow(/cycle/i);
  });

  it('refuses to move the root', () => {
    expect(() => moveComponent(baseAst(), { nodeId: 'n_root', newParentId: 'n_x' }))
      .toThrow(/cannot move root/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing modules.

- [ ] **Step 3: Write `removeComponent.ts`**

```typescript
// packages/ast/src/mutations/removeComponent.ts
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface RemoveComponentInput {
  nodeId: string;
}

export function removeComponent(ast: SemanticUIAst, input: RemoveComponentInput): SemanticUIAst {
  if (input.nodeId === ast.root.id) {
    throw new Error('removeComponent: cannot remove root node');
  }
  let removed = false;
  const transform = (n: ComponentNode): ComponentNode => {
    const filteredChildren: ComponentNode[] = [];
    for (const c of n.children) {
      if (c.id === input.nodeId) {
        removed = true;
        continue;
      }
      filteredChildren.push(transform(c));
    }
    return { ...n, children: filteredChildren };
  };
  const newRoot = transform(ast.root);
  if (!removed) throw new Error(`removeComponent: node "${input.nodeId}" not found in AST`);
  return { ...ast, root: newRoot };
}
```

- [ ] **Step 4: Write `moveComponent.ts`**

```typescript
// packages/ast/src/mutations/moveComponent.ts
import { collectIds } from '../ids/collectIds';
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface MoveComponentInput {
  nodeId: string;
  newParentId: string;
  index?: number;
}

function findNode(root: ComponentNode, id: string): ComponentNode | undefined {
  if (root.id === id) return root;
  for (const c of root.children) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return undefined;
}

export function moveComponent(ast: SemanticUIAst, input: MoveComponentInput): SemanticUIAst {
  if (input.nodeId === ast.root.id) {
    throw new Error('moveComponent: cannot move root node');
  }
  const moving = findNode(ast.root, input.nodeId);
  if (!moving) throw new Error(`moveComponent: node "${input.nodeId}" not found in AST`);
  const newParent = findNode(ast.root, input.newParentId);
  if (!newParent) throw new Error(`moveComponent: new parent "${input.newParentId}" not found in AST`);

  // Cycle detection: newParent cannot be inside the moving subtree.
  if (collectIds(moving).has(input.newParentId)) {
    throw new Error('moveComponent: would create cycle (new parent is inside moving subtree)');
  }

  // Detach
  let detachedSubtree: ComponentNode | null = null;
  const detach = (n: ComponentNode): ComponentNode => {
    const kept: ComponentNode[] = [];
    for (const c of n.children) {
      if (c.id === input.nodeId) {
        detachedSubtree = c;
        continue;
      }
      kept.push(detach(c));
    }
    return { ...n, children: kept };
  };
  const rootAfterDetach = detach(ast.root);
  if (!detachedSubtree) throw new Error(`moveComponent: failed to detach "${input.nodeId}"`);

  // Re-attach
  const moved = detachedSubtree as ComponentNode;  // narrowed via the throw-guard above
  const attach = (n: ComponentNode): ComponentNode => {
    if (n.id === input.newParentId) {
      const children = [...n.children];
      const idx = input.index ?? children.length;
      children.splice(idx, 0, moved);
      return { ...n, children };
    }
    return { ...n, children: n.children.map(attach) };
  };

  return { ...ast, root: attach(rootAfterDetach) };
}
```

> **Note (applied during execution):** strict TS does NOT narrow the `let detachedSubtree` across the `detach` closure boundary, so `detachedSubtree!` inside `attach` errors under `strict`. Capture it into a `const moved = detachedSubtree as ComponentNode;` after the `if (!detachedSubtree) throw` guard and reference `moved` in `attach`. The throw-guard makes the cast sound.

- [ ] **Step 5: Run, expect PASS** — all `removeComponent` + `moveComponent` cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/ast/src/mutations/removeComponent.ts packages/ast/src/mutations/moveComponent.ts packages/ast/src/__tests__/mutations.test.ts
git commit -m "feat(ast): add removeComponent and moveComponent mutation primitives"
```

---

### Task 12: `addBinding` / `addEvent` / `addConstraintRef`

**Files:**
- Create: `packages/ast/src/mutations/addBinding.ts`
- Create: `packages/ast/src/mutations/addEvent.ts`
- Create: `packages/ast/src/mutations/addConstraintRef.ts`
- Modify: `packages/ast/src/__tests__/mutations.test.ts` (append)

- [ ] **Step 1: Append failing tests**

```typescript
import { addBinding } from '../mutations/addBinding';
import { addEvent } from '../mutations/addEvent';
import { addConstraintRef } from '../mutations/addConstraintRef';

describe('addBinding', () => {
  it('appends a binding to the target node', () => {
    const added = addComponent(baseAst(), { parentId: 'n_root', type: 'Input', props: {} });
    const after = addBinding(added.ast, {
      nodeId: added.newNodeId,
      binding: { propKey: 'value', source: 'state', path: 'form.email' },
    });
    expect(after.root.children[0]?.bindings).toHaveLength(1);
    expect(after.root.children[0]?.bindings[0]?.path).toBe('form.email');
  });
});

describe('addEvent', () => {
  it('appends an event binding to the target node', () => {
    const added = addComponent(baseAst(), { parentId: 'n_root', type: 'Button', props: { label: 'X' } });
    const after = addEvent(added.ast, {
      nodeId: added.newNodeId,
      event: { event: 'click', action: { kind: 'navigate', to: '/home' } },
    });
    expect(after.root.children[0]?.events).toHaveLength(1);
    expect(after.root.children[0]?.events[0]?.event).toBe('click');
  });
});

describe('addConstraintRef', () => {
  it('appends a rule reference to the target node', () => {
    const added = addComponent(baseAst(), { parentId: 'n_root', type: 'Form', props: {} });
    const after = addConstraintRef(added.ast, {
      nodeId: added.newNodeId,
      ruleId: 'houseprice.form.required-submit',
    });
    expect(after.root.children[0]?.constraints).toEqual([{ ruleId: 'houseprice.form.required-submit' }]);
  });

  it('does not add the same ruleId twice', () => {
    let ast = addComponent(baseAst(), { parentId: 'n_root', type: 'Form', props: {} }).ast;
    const targetId = ast.root.children[0]!.id;
    ast = addConstraintRef(ast, { nodeId: targetId, ruleId: 'r.a' });
    ast = addConstraintRef(ast, { nodeId: targetId, ruleId: 'r.a' });
    expect(ast.root.children[0]?.constraints).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — three missing modules.

- [ ] **Step 3: Write the three primitives**

```typescript
// packages/ast/src/mutations/addBinding.ts
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';
import type { DataBinding } from '../types/dataBinding';

export interface AddBindingInput {
  nodeId: string;
  binding: DataBinding;
}

export function addBinding(ast: SemanticUIAst, input: AddBindingInput): SemanticUIAst {
  let found = false;
  const transform = (n: ComponentNode): ComponentNode => {
    if (n.id === input.nodeId) {
      found = true;
      return { ...n, bindings: [...n.bindings, input.binding] };
    }
    return { ...n, children: n.children.map(transform) };
  };
  const newRoot = transform(ast.root);
  if (!found) throw new Error(`addBinding: node "${input.nodeId}" not found in AST`);
  return { ...ast, root: newRoot };
}
```

```typescript
// packages/ast/src/mutations/addEvent.ts
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';
import type { EventBinding } from '../types/eventBinding';

export interface AddEventInput {
  nodeId: string;
  event: EventBinding;
}

export function addEvent(ast: SemanticUIAst, input: AddEventInput): SemanticUIAst {
  let found = false;
  const transform = (n: ComponentNode): ComponentNode => {
    if (n.id === input.nodeId) {
      found = true;
      return { ...n, events: [...n.events, input.event] };
    }
    return { ...n, children: n.children.map(transform) };
  };
  const newRoot = transform(ast.root);
  if (!found) throw new Error(`addEvent: node "${input.nodeId}" not found in AST`);
  return { ...ast, root: newRoot };
}
```

```typescript
// packages/ast/src/mutations/addConstraintRef.ts
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface AddConstraintRefInput {
  nodeId: string;
  ruleId: string;
}

export function addConstraintRef(ast: SemanticUIAst, input: AddConstraintRefInput): SemanticUIAst {
  let found = false;
  const transform = (n: ComponentNode): ComponentNode => {
    if (n.id === input.nodeId) {
      found = true;
      if (n.constraints.some(r => r.ruleId === input.ruleId)) return n; // dedupe
      return { ...n, constraints: [...n.constraints, { ruleId: input.ruleId }] };
    }
    return { ...n, children: n.children.map(transform) };
  };
  const newRoot = transform(ast.root);
  if (!found) throw new Error(`addConstraintRef: node "${input.nodeId}" not found in AST`);
  return { ...ast, root: newRoot };
}
```

- [ ] **Step 4: Run, expect PASS** — `addBinding` / `addEvent` / `addConstraintRef` cases green.

- [ ] **Step 5: Re-export and commit**

Append to `packages/ast/src/index.ts`:

```typescript
export { addComponent } from './mutations/addComponent';
export type { AddComponentInput, AddComponentResult } from './mutations/addComponent';
export { setProp } from './mutations/setProp';
export type { SetPropInput } from './mutations/setProp';
export { removeComponent } from './mutations/removeComponent';
export type { RemoveComponentInput } from './mutations/removeComponent';
export { moveComponent } from './mutations/moveComponent';
export type { MoveComponentInput } from './mutations/moveComponent';
export { addBinding } from './mutations/addBinding';
export type { AddBindingInput } from './mutations/addBinding';
export { addEvent } from './mutations/addEvent';
export type { AddEventInput } from './mutations/addEvent';
export { addConstraintRef } from './mutations/addConstraintRef';
export type { AddConstraintRefInput } from './mutations/addConstraintRef';
```

```bash
git add packages/ast/src/mutations/ packages/ast/src/__tests__/mutations.test.ts packages/ast/src/index.ts
git commit -m "feat(ast): add binding/event/constraint mutation primitives"
```

---

## Phase 6 — Query, Diff, Serialize

### Task 13: Query helpers (`findNode`, `getAncestors`, `getDescendants`)

**Files:**
- Create: `packages/ast/src/query/findNode.ts`
- Create: `packages/ast/src/query/getAncestors.ts`
- Create: `packages/ast/src/query/getDescendants.ts`
- Create: `packages/ast/src/__tests__/query.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/ast/src/__tests__/query.test.ts
import { describe, it, expect } from 'vitest';
import { findNode } from '../query/findNode';
import { getAncestors } from '../query/getAncestors';
import { getDescendants } from '../query/getDescendants';
import { addComponent } from '../mutations/addComponent';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';

const baseAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION,
  artifactId: 'home', kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [] },
});

describe('findNode', () => {
  it('finds root', () => {
    expect(findNode(baseAst(), 'n_root')?.type).toBe('Container');
  });
  it('finds nested', () => {
    const a = addComponent(baseAst(), { parentId: 'n_root', type: 'Container', props: {} });
    const b = addComponent(a.ast, { parentId: a.newNodeId, type: 'Text', props: { content: 'hi' } });
    expect(findNode(b.ast, b.newNodeId)?.type).toBe('Text');
  });
  it('returns undefined for missing', () => {
    expect(findNode(baseAst(), 'n_nope')).toBeUndefined();
  });
});

describe('getAncestors', () => {
  it('returns chain from immediate parent up to root', () => {
    const a = addComponent(baseAst(), { parentId: 'n_root', type: 'Container', props: {} });
    const b = addComponent(a.ast, { parentId: a.newNodeId, type: 'Container', props: {} });
    const c = addComponent(b.ast, { parentId: b.newNodeId, type: 'Text', props: { content: 'x' } });
    const ancestors = getAncestors(c.ast, c.newNodeId);
    expect(ancestors.map(n => n.id)).toEqual([b.newNodeId, a.newNodeId, 'n_root']);
  });
  it('returns empty array for root', () => {
    expect(getAncestors(baseAst(), 'n_root')).toEqual([]);
  });
  it('returns empty array for missing node', () => {
    expect(getAncestors(baseAst(), 'n_nope')).toEqual([]);
  });
});

describe('getDescendants', () => {
  it('returns all descendant ids (excluding self)', () => {
    const a = addComponent(baseAst(), { parentId: 'n_root', type: 'Container', props: {} });
    const b = addComponent(a.ast, { parentId: a.newNodeId, type: 'Text', props: { content: 'x' } });
    const ids = getDescendants(b.ast, 'n_root').map(n => n.id);
    expect(new Set(ids)).toEqual(new Set([a.newNodeId, b.newNodeId]));
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing modules.

- [ ] **Step 3: Write the three query helpers**

```typescript
// packages/ast/src/query/findNode.ts
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export function findNode(ast: SemanticUIAst, nodeId: string): ComponentNode | undefined {
  const walk = (n: ComponentNode): ComponentNode | undefined => {
    if (n.id === nodeId) return n;
    for (const c of n.children) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return undefined;
  };
  return walk(ast.root);
}
```

```typescript
// packages/ast/src/query/getAncestors.ts
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export function getAncestors(ast: SemanticUIAst, nodeId: string): ComponentNode[] {
  const chain: ComponentNode[] = [];
  const walk = (n: ComponentNode, stack: ComponentNode[]): boolean => {
    if (n.id === nodeId) {
      chain.push(...[...stack].reverse());
      return true;
    }
    stack.push(n);
    for (const c of n.children) {
      if (walk(c, stack)) return true;
    }
    stack.pop();
    return false;
  };
  walk(ast.root, []);
  return chain;
}
```

```typescript
// packages/ast/src/query/getDescendants.ts
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';
import { findNode } from './findNode';

export function getDescendants(ast: SemanticUIAst, nodeId: string): ComponentNode[] {
  const start = findNode(ast, nodeId);
  if (!start) return [];
  const out: ComponentNode[] = [];
  const walk = (n: ComponentNode): void => {
    for (const c of n.children) {
      out.push(c);
      walk(c);
    }
  };
  walk(start);
  return out;
}
```

- [ ] **Step 4: Run, expect PASS**.

- [ ] **Step 5: Re-export and commit**

Append to `packages/ast/src/index.ts`:

```typescript
export { findNode } from './query/findNode';
export { getAncestors } from './query/getAncestors';
export { getDescendants } from './query/getDescendants';
```

```bash
git add packages/ast/src/query/ packages/ast/src/__tests__/query.test.ts packages/ast/src/index.ts
git commit -m "feat(ast): add findNode/getAncestors/getDescendants query helpers"
```

---

### Task 14: Structural diff for debug UI

**Files:**
- Create: `packages/ast/src/diff/structuralDiff.ts`
- Create: `packages/ast/src/__tests__/diff.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/ast/src/__tests__/diff.test.ts
import { describe, it, expect } from 'vitest';
import { structuralDiff } from '../diff/structuralDiff';
import { addComponent } from '../mutations/addComponent';
import { setProp } from '../mutations/setProp';
import { removeComponent } from '../mutations/removeComponent';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';

const baseAst = (): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'home', kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [] },
});

describe('structuralDiff', () => {
  it('reports addition', () => {
    const before = baseAst();
    const { ast: after, newNodeId } = addComponent(before, { parentId: 'n_root', type: 'Text', props: { content: 'hi' } });
    const diff = structuralDiff(before, after);
    expect(diff.added).toContain(newNodeId);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it('reports removal', () => {
    const a = addComponent(baseAst(), { parentId: 'n_root', type: 'Text', props: { content: 'x' } });
    const after = removeComponent(a.ast, { nodeId: a.newNodeId });
    const diff = structuralDiff(a.ast, after);
    expect(diff.removed).toContain(a.newNodeId);
    expect(diff.added).toEqual([]);
  });

  it('reports prop change as "changed"', () => {
    const a = addComponent(baseAst(), { parentId: 'n_root', type: 'Text', props: { content: 'hi' } });
    const after = setProp(a.ast, { nodeId: a.newNodeId, key: 'content', value: 'bye' });
    const diff = structuralDiff(a.ast, after);
    expect(diff.changed).toContain(a.newNodeId);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('returns empty diff for identical ASTs', () => {
    const a = baseAst();
    expect(structuralDiff(a, a)).toEqual({ added: [], removed: [], changed: [] });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing module.

- [ ] **Step 3: Write `structuralDiff.ts`**

```typescript
// packages/ast/src/diff/structuralDiff.ts
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

export interface AstDiff {
  added: string[];     // node ids in `after` but not in `before`
  removed: string[];   // node ids in `before` but not in `after`
  changed: string[];   // node ids present in both, but with different field content
}

function indexById(root: ComponentNode): Map<string, ComponentNode> {
  const map = new Map<string, ComponentNode>();
  const walk = (n: ComponentNode): void => {
    map.set(n.id, n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return map;
}

function fieldsChanged(a: ComponentNode, b: ComponentNode): boolean {
  if (a.type !== b.type) return true;
  if (JSON.stringify(a.props) !== JSON.stringify(b.props)) return true;
  if (JSON.stringify(a.layout) !== JSON.stringify(b.layout)) return true;
  if (JSON.stringify(a.style) !== JSON.stringify(b.style)) return true;
  if (JSON.stringify(a.bindings) !== JSON.stringify(b.bindings)) return true;
  if (JSON.stringify(a.events) !== JSON.stringify(b.events)) return true;
  if (JSON.stringify(a.constraints) !== JSON.stringify(b.constraints)) return true;
  return false;
}

// Note (applied during execution): `fieldsChanged` compares a node's OWN content only,
// NOT its child-id list — otherwise adding/removing a child would flag the PARENT as
// `changed`, contradicting the `reports addition` test (parent must stay out of `changed`).
// Consequence/limitation: a pure content-preserving move/reorder (same node id, different
// parent) is invisible to this diff. Acceptable for Plan 1; a move-aware diff can come later.
export function structuralDiff(before: SemanticUIAst, after: SemanticUIAst): AstDiff {
  const beforeIndex = indexById(before.root);
  const afterIndex = indexById(after.root);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const id of afterIndex.keys()) {
    if (!beforeIndex.has(id)) added.push(id);
    else if (fieldsChanged(beforeIndex.get(id)!, afterIndex.get(id)!)) changed.push(id);
  }
  for (const id of beforeIndex.keys()) {
    if (!afterIndex.has(id)) removed.push(id);
  }

  return { added, removed, changed };
}
```

- [ ] **Step 4: Run, expect PASS**.

- [ ] **Step 5: Re-export and commit**

Append to `packages/ast/src/index.ts`:

```typescript
export { structuralDiff } from './diff/structuralDiff';
export type { AstDiff } from './diff/structuralDiff';
```

```bash
git add packages/ast/src/diff/ packages/ast/src/__tests__/diff.test.ts packages/ast/src/index.ts
git commit -m "feat(ast): add structuralDiff for debug/git use"
```

---

### Task 15: Serialize (`toJson` / `fromJson`)

**Files:**
- Create: `packages/ast/src/serialize/toJson.ts`
- Create: `packages/ast/src/serialize/fromJson.ts`
- Create: `packages/ast/src/__tests__/serialize.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/ast/src/__tests__/serialize.test.ts
import { describe, it, expect } from 'vitest';
import { toJson } from '../serialize/toJson';
import { fromJson } from '../serialize/fromJson';
import { BASE_COMPONENTS } from '../registry/baseComponents';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';

const ast: SemanticUIAst = {
  schemaVersion: AST_SCHEMA_VERSION,
  artifactId: 'home', kind: 'page',
  root: { id: 'n_root', type: 'Container', props: {}, layout: { kind: 'stack', direction: 'vertical' },
    style: {}, bindings: [], events: [], constraints: [], children: [] },
};

describe('serialization', () => {
  it('round-trips identically', () => {
    const json = toJson(ast);
    expect(typeof json).toBe('string');
    const parsed = fromJson(json, { registry: BASE_COMPONENTS });
    expect(parsed).toEqual(ast);
  });

  it('toJson is deterministic (key order stable)', () => {
    const j1 = toJson(ast);
    const j2 = toJson(ast);
    expect(j1).toBe(j2);
  });

  it('fromJson rejects an AST that fails validation', () => {
    const bad = JSON.stringify({ ...ast, schemaVersion: 999 });
    expect(() => fromJson(bad, { registry: BASE_COMPONENTS })).toThrow(/validation/i);
  });

  it('fromJson rejects malformed JSON', () => {
    expect(() => fromJson('{ not json', { registry: BASE_COMPONENTS })).toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing modules.

- [ ] **Step 3: Write `toJson.ts`** (deterministic key order so git diff is stable)

```typescript
// packages/ast/src/serialize/toJson.ts
import type { SemanticUIAst } from '../types/ast';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const props = keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${props.join(',')}}`;
}

export function toJson(ast: SemanticUIAst, opts: { pretty?: boolean } = {}): string {
  // Stable key order → git-friendly. Pretty mode parses and re-emits for human reading.
  const stable = stableStringify(ast);
  if (!opts.pretty) return stable;
  return JSON.stringify(JSON.parse(stable), null, 2);
}
```

- [ ] **Step 4: Write `fromJson.ts`**

```typescript
// packages/ast/src/serialize/fromJson.ts
import { validateAst } from '../schema/validate';
import type { ComponentRegistry } from '../registry/componentSpec';
import type { SemanticUIAst } from '../types/ast';

export interface FromJsonOptions {
  registry: ComponentRegistry;
}

export function fromJson(text: string, opts: FromJsonOptions): SemanticUIAst {
  const parsed = JSON.parse(text);
  const result = validateAst(parsed, { registry: opts.registry });
  if (!result.valid) {
    const summary = result.errors.map(e => `  ${e.path}: ${e.message}`).join('\n');
    throw new Error(`fromJson: validation failed\n${summary}`);
  }
  return parsed as SemanticUIAst;
}
```

- [ ] **Step 5: Run, expect PASS**.

- [ ] **Step 6: Re-export and commit**

Append to `packages/ast/src/index.ts`:

```typescript
export { toJson } from './serialize/toJson';
export { fromJson } from './serialize/fromJson';
export type { FromJsonOptions } from './serialize/fromJson';
```

```bash
git add packages/ast/src/serialize/ packages/ast/src/__tests__/serialize.test.ts packages/ast/src/index.ts
git commit -m "feat(ast): add stable JSON serialize/deserialize with validation"
```

---

## Phase 7 — `verify-ast` CLI

### Task 16: CLI binary + integration test

**Files:**
- Create: `packages/ast/src/bin/verify-ast.ts`  *(under `src/` so the build emits `dist/cjs/bin/verify-ast.js` — see Phase 1 note)*
- Create: `packages/ast/src/__tests__/verifyAst.test.ts`
- Create: `packages/ast/src/__tests__/fixtures/valid.ast.json`
- Create: `packages/ast/src/__tests__/fixtures/invalid-schema-version.ast.json`
- Create: `packages/ast/src/__tests__/fixtures/invalid-unknown-type.ast.json`

- [ ] **Step 1: Create fixture files**

`packages/ast/src/__tests__/fixtures/valid.ast.json`:

```json
{
  "schemaVersion": 1,
  "artifactId": "home",
  "kind": "page",
  "root": {
    "id": "n_root",
    "type": "Container",
    "props": {},
    "layout": { "kind": "stack", "direction": "vertical" },
    "style": {},
    "bindings": [],
    "events": [],
    "constraints": [],
    "children": []
  }
}
```

`packages/ast/src/__tests__/fixtures/invalid-schema-version.ast.json`:

```json
{
  "schemaVersion": 999,
  "artifactId": "home",
  "kind": "page",
  "root": {
    "id": "n_root", "type": "Container", "props": {},
    "layout": { "kind": "flow" }, "style": {},
    "bindings": [], "events": [], "constraints": [], "children": []
  }
}
```

`packages/ast/src/__tests__/fixtures/invalid-unknown-type.ast.json`:

```json
{
  "schemaVersion": 1,
  "artifactId": "home",
  "kind": "page",
  "root": {
    "id": "n_root", "type": "NotARealComponent", "props": {},
    "layout": { "kind": "flow" }, "style": {},
    "bindings": [], "events": [], "constraints": [], "children": []
  }
}
```

- [ ] **Step 2: Write failing test**

```typescript
// packages/ast/src/__tests__/verifyAst.test.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const cli = resolve(__dirname, '../bin/verify-ast.ts');
const fixtures = resolve(__dirname, 'fixtures');
// Use `pnpm exec tsx` (NOT `npx tsx`): npx cold-starts at 7-10s on Windows and blows the timeout.
// Each `it()` is given an explicit 30s timeout because subprocess CLI tests are slow under parallel load.
const tsxRun = (args: string) =>
  execSync(`pnpm exec tsx "${cli}" ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('verify-ast CLI', () => {
  it('exits 0 on valid AST and prints OK', () => {
    const out = tsxRun(`${resolve(fixtures, 'valid.ast.json')}`);
    expect(out).toMatch(/OK/);
  });

  it('exits non-zero on invalid schemaVersion', () => {
    expect(() => tsxRun(`${resolve(fixtures, 'invalid-schema-version.ast.json')}`)).toThrow();
  });

  it('exits non-zero on unknown component type', () => {
    expect(() => tsxRun(`${resolve(fixtures, 'invalid-unknown-type.ast.json')}`)).toThrow();
  });

  it('exits non-zero when no file argument passed', () => {
    expect(() => tsxRun('')).toThrow();
  });
});
```

- [ ] **Step 3: Add `tsx` to devDeps and re-install**

Update `packages/ast/package.json` devDependencies:

```json
"tsx": "^4.19.0"
```

Run: `pnpm install`

- [ ] **Step 4: Run, expect FAIL** — missing CLI module.

- [ ] **Step 5: Write CLI `bin/verify-ast.ts`**

```typescript
#!/usr/bin/env node
// packages/ast/src/bin/verify-ast.ts  (under src/, so imports use ../schema and ../registry)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateAst } from '../schema/validate';
import { BASE_COMPONENTS } from '../registry/baseComponents';

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: verify-ast <file.ast.json> [<file.ast.json> ...]');
    process.exit(2);
  }

  let allOk = true;
  for (const fileArg of args) {
    const filePath = resolve(process.cwd(), fileArg);
    const text = readFileSync(filePath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.error(`FAIL ${fileArg} — invalid JSON: ${(err as Error).message}`);
      allOk = false;
      continue;
    }
    const result = validateAst(parsed, { registry: BASE_COMPONENTS });
    if (result.valid) {
      console.log(`OK   ${fileArg}`);
    } else {
      allOk = false;
      console.error(`FAIL ${fileArg}`);
      for (const e of result.errors) console.error(`     ${e.path}: ${e.message}`);
    }
  }

  process.exit(allOk ? 0 : 1);
}

main();
```

- [ ] **Step 6: Run tests, expect PASS** — all 4 CLI cases green.

- [ ] **Step 7: Commit**

```bash
git add packages/ast/bin/ packages/ast/src/__tests__/verifyAst.test.ts packages/ast/src/__tests__/fixtures/ packages/ast/package.json pnpm-lock.yaml
git commit -m "feat(ast): add verify-ast CLI with fixture-driven tests"
```

---

## Phase 8 — Cross-Package Integration

### Task 17: Wire `@designbridge/ast` into server + client + verify build

**Files:**
- Modify: `packages/server/package.json` (add dependency)
- Modify: `packages/client/package.json` (add dependency)
- Create: `packages/server/src/services/__tests__/astImport.test.ts` (smoke import)
- Create: `packages/client/src/lib/__tests__/astImport.test.ts` (smoke import; create lib/ dir)

- [ ] **Step 1: Add workspace dependency in `packages/server/package.json`**

Under `"dependencies"` add:

```json
"@designbridge/ast": "workspace:*"
```

- [ ] **Step 2: Add workspace dependency in `packages/client/package.json`**

Under `"dependencies"` add:

```json
"@designbridge/ast": "workspace:*"
```

- [ ] **Step 3: Install**

Run: `pnpm install`
Expected: pnpm resolves `@designbridge/ast` to the local workspace package via symlink.

- [ ] **Step 4: Write server smoke import test**

```typescript
// packages/server/src/services/__tests__/astImport.test.ts
import { describe, it, expect } from 'vitest';
import {
  AST_SCHEMA_VERSION,
  BASE_COMPONENTS,
  validateAst,
  addComponent,
  generateNodeId,
} from '@designbridge/ast';

describe('@designbridge/ast — server-side import smoke', () => {
  it('AST_SCHEMA_VERSION is 1', () => {
    expect(AST_SCHEMA_VERSION).toBe(1);
  });
  it('BASE_COMPONENTS has 20 entries', () => {
    expect(Object.keys(BASE_COMPONENTS)).toHaveLength(20);
  });
  it('end-to-end: add a component, validate, get OK', () => {
    const ast = {
      schemaVersion: AST_SCHEMA_VERSION,
      artifactId: 'smoke',
      kind: 'page' as const,
      root: {
        id: generateNodeId(), type: 'Container', props: {},
        layout: { kind: 'stack' as const, direction: 'vertical' as const },
        style: {}, bindings: [], events: [], constraints: [], children: [],
      },
    };
    const { ast: after } = addComponent(ast, { parentId: ast.root.id, type: 'Text', props: { content: 'hi' } });
    const result = validateAst(after, { registry: BASE_COMPONENTS });
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 5: Write client smoke import test**

Create the `lib/` directory then file:

```typescript
// packages/client/src/lib/__tests__/astImport.test.ts
import { describe, it, expect } from 'vitest';
import {
  AST_SCHEMA_VERSION,
  BASE_COMPONENTS,
  validateAst,
  generateNodeId,
} from '@designbridge/ast';

describe('@designbridge/ast — client-side import smoke', () => {
  it('imports core symbols', () => {
    expect(AST_SCHEMA_VERSION).toBe(1);
    expect(Object.keys(BASE_COMPONENTS).length).toBeGreaterThan(0);
  });
  it('validates a minimal AST', () => {
    const ast = {
      schemaVersion: AST_SCHEMA_VERSION,
      artifactId: 'smoke', kind: 'page' as const,
      root: {
        id: generateNodeId(), type: 'Container', props: {},
        layout: { kind: 'flow' as const }, style: {},
        bindings: [], events: [], constraints: [], children: [],
      },
    };
    expect(validateAst(ast, { registry: BASE_COMPONENTS }).valid).toBe(true);
  });
});
```

- [ ] **Step 6: Add `vitest` to client devDeps if missing, then ensure ast is built before tests run**

If `packages/client/package.json` doesn't have vitest, add it to devDependencies (use ^3.2.4, NOT ^4 — vite 5 incompatibility):

```json
"vitest": "^3.2.4"
```

> **Notes (applied during execution):**
> - The **server's** vitest also had to be pinned `^4.1.2` → `^3.2.4` (same vite-5 trap).
> - The server had **no test runner config**; a minimal `packages/server/vitest.config.ts` (`{ test: { globals: true } }`) was added so the pre-existing `htmlSanitizer.test.ts` (uses bare `describe`/`test` globals) can collect. This file is committed alongside Task 17.
> - Enabling the server test runner surfaced a **pre-existing, unrelated failure**: `htmlSanitizer.test.ts > injectConventionColors > injects --primary-hover from convention` (expects `#8557A8`, code emits `#8E6FA7dd`). It is legacy HTML-pipeline code slated for deletion (spec §6.13), out of Plan 1 scope — left as-is and flagged.

And add a `test` script:

```json
"test": "vitest run"
```

Run: `pnpm install`

- [ ] **Step 7: Build ast then run both smoke tests**

Run: `pnpm --filter @designbridge/ast build && pnpm --filter server test && pnpm --filter client test`
Expected: all green.

- [ ] **Step 8: Run server full build to confirm TS resolves the workspace dep**

Run: `pnpm --filter server build`
Expected: PASS — `packages/server/dist/` contains compiled `services/__tests__/...`? No — tsconfig excludes `__tests__`. So `dist/` should compile without errors and the smoke test file is excluded from output but still visible to vitest.

Run: `pnpm --filter client build`
Expected: PASS — client's `tsc && vite build` resolves the dep with no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/server/package.json packages/server/src/services/__tests__/astImport.test.ts packages/client/package.json packages/client/src/lib/__tests__/astImport.test.ts pnpm-lock.yaml
git commit -m "feat(ast): wire @designbridge/ast into server and client with smoke tests"
```

---

## Phase 9 — CI Pre-commit Hook

### Task 18: Pre-commit hook that runs verify-ast on every `*.ast.json`

**Files:**
- Create: `.husky/pre-commit` (if husky not present, add to root devDeps first)
- Modify: root `package.json` (add husky devDep + prepare script)

**Note:** This plan ships only the hook script. Wiring it into a GitHub Action is part of Plan 8 (skill authoring + CI infra). For now, the local hook is sufficient to prove the CLI works end-to-end.

- [ ] **Step 1: Add husky to root**

Modify root `package.json`:

```json
{
  "scripts": {
    "prepare": "husky",
    "verify-ast": "pnpm --filter @designbridge/ast exec verify-ast",
    ...
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "playwright": "^1.58.2",
    "husky": "^9.1.0"
  }
}
```

- [ ] **Step 2: Install & init husky**

Run: `pnpm install && pnpm prepare`
Expected: `.husky/` directory created.

- [ ] **Step 3: Write `.husky/pre-commit`**

```bash
#!/usr/bin/env sh
# Block commit if any staged *.ast.json fails verify-ast.

set -e

STAGED_AST=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.ast\.json$' || true)

if [ -n "$STAGED_AST" ]; then
  echo "[pre-commit] running verify-ast on staged *.ast.json files..."
  # shellcheck disable=SC2086
  pnpm --filter @designbridge/ast exec verify-ast $STAGED_AST
fi
```

Make it executable on Unix; on Windows the hook runs via git's bundled sh.

- [ ] **Step 4: Manual smoke test**

```bash
# (in a scratch branch — DO NOT commit the fixture)
mkdir -p /tmp/ast-smoke
cp packages/ast/src/__tests__/fixtures/invalid-unknown-type.ast.json /tmp/smoke.ast.json
git add /tmp/smoke.ast.json 2>/dev/null || true  # will fail outside repo — alternative:
cp packages/ast/src/__tests__/fixtures/invalid-unknown-type.ast.json ./smoke.ast.json
git add smoke.ast.json
git commit -m "test: should be blocked"
# Expected: hook FAILS, commit rejected
git restore --staged smoke.ast.json
rm smoke.ast.json
```

Expected: pre-commit blocks with `FAIL smoke.ast.json — /root: unknown component type "NotARealComponent"`.

- [ ] **Step 5: Commit the hook itself**

```bash
git add .husky/pre-commit package.json pnpm-lock.yaml
git commit -m "feat(ast): pre-commit hook runs verify-ast on staged *.ast.json"
```

---

## Acceptance Criteria

The plan is **done** when:

- [ ] `packages/ast/` exists as a pnpm workspace package with a typed public surface (`AST_SCHEMA_VERSION`, `SemanticUIAst`, `ComponentNode`, `LayoutIntent`, `StyleIntent`, `DataBinding`, `EventBinding`, `RuleRef`, `BASE_COMPONENTS`, `validateAst`, `toJson`/`fromJson`, all 7 mutation primitives, all 3 query helpers, `structuralDiff`, `generateNodeId`).
- [ ] `pnpm --filter @designbridge/ast test` passes — covering: types, ids, registry, validator (6+ cases incl. unknown type, missing required prop, children-on-leaf, duplicate id, wrong schemaVersion), all mutation primitives (incl. immutability + cycle detection), query helpers, diff, serialize round-trip, CLI fixtures (valid + 2 invalid + missing-arg).
- [ ] `pnpm --filter @designbridge/ast build` produces both CJS and ESM outputs without TS errors.
- [ ] `pnpm --filter server build` and `pnpm --filter client build` both succeed with `@designbridge/ast` imported.
- [ ] `pnpm --filter server test` and `pnpm --filter client test` smoke tests pass for cross-package import.
- [ ] `verify-ast` CLI exits 0 on valid fixture, non-zero on each invalid fixture.
- [ ] Pre-commit hook blocks a commit that stages an invalid `*.ast.json`.
- [ ] AST is **immutable** — every mutation primitive returns a new AST; original is byte-for-byte unchanged (verified by test assertions on `before.root.children.length` after a mutation).
- [ ] `toJson` is **deterministic** — same input produces byte-identical output across two runs (git-diff stable).
- [ ] Every commit message follows the existing repo convention (`feat(ast): ...`); every task ends with a commit; no commit batches multiple tasks.

## Compiler Invariant (verifiable in this plan)

> **AST is the source of truth, AI never directly writes fields without going through a mutation primitive.**

This plan does not include AI code — but it locks the invariant in code shape: every legal way to change an AST is one of the seven exported `mutations/*` functions. Plan 3 (AI Semantic Builder) tool definitions will be thin wrappers around these. Any future code that imports from `@designbridge/ast` cannot mutate an AST in-place — TS types do not expose mutable accessors, and the runtime functions all return new instances.

---

## Risks / Notes for Executor

1. **Vitest ESM/CJS resolution**: the ast package builds both CJS and ESM. If the server (CJS) sees the ESM build by accident, vitest may complain. Stick to `main`/`require` resolution on server side; client uses `module`/`import`. If the smoke test fails with `ERR_REQUIRE_ESM` or `Unknown file extension`, double-check the `exports` field in `packages/ast/package.json`.
2. **Windows shell**: this repo is primarily developed on Windows (per CLAUDE.md). The husky pre-commit hook uses `#!/usr/bin/env sh` and POSIX commands; git for Windows ships the necessary `sh.exe`. Run a manual commit-block test on Windows to confirm.
3. **Workspace symlink + tsx**: `npx tsx` inside the CLI test relies on the dep being installed in `packages/ast`. If running tests from a fresh clone, ensure `pnpm install` has populated `packages/ast/node_modules/tsx`.
4. **AST schema bumps**: bumping `AST_SCHEMA_VERSION` to 2 in a future plan is breaking for all stored `*.ast.json`. Add a migration runner in Plan 7 (project structure migration) — not this plan.
5. **`Rule` type defined elsewhere**: this plan only stores `RuleRef = { ruleId: string }`. The actual rule body (when/then/priority/action) is defined in Plan 4 (Skill Engine). Do not pre-emptively model it here.
6. **Server still imports `@google/generative-ai`** in `routes/settings.ts` — irrelevant to Plan 1 and explicitly preserved by spec §6.13. Plan 1 does not touch any existing server code.

---

**Plan end.** Ready for execution.
