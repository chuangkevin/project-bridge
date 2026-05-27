# Plan 9 — Production Backend: Vue 3 Composition API codegen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Add the **Production backend** (M2 start, spec §3.4/§6.5): a second renderer in `@designbridge/codegen` that emits, from the *same* `SemanticUIAst`, a Vue 3 SFC with **`<script setup>` Composition API + reactive state + event handlers + API-binding stubs** — consuming `bindings` / `events` (which the Mock backend ignores). Output is engineer-handoff-ready (real reactive state + v-model/@event wiring; API calls + navigation are clearly-marked stubs).

**Architecture:** New `renderVueProduction(ast) → { filename, code }` alongside `renderVue` (Mock). Reuses `escape.ts` + `tailwind.ts`. Three pure collectors walk the AST: `collectState` (state paths from `bindings[source=state]` + `setState` events → a nested `reactive()` declaration), `collectHandlers` (one named handler fn per node-event, stub body per action kind), `collectApiLoaders` (`bindings[source=api]` → a `ref` + a stub loader). A production node renderer adds Vue directives: `v-model` for state-bound input `value`, `{{ state.x }}` interpolation for state-bound display props, `@click`/`@submit`/… for events; otherwise identical semantic-HTML + Tailwind as Mock. `<script setup>` assembles imports + state + loaders + handlers; `<template>` wraps the rendered root.

**Tech Stack:** TS 5.6 strict, Vitest 3.2.4, `@designbridge/ast` types. Reuses Plan 5 helpers. No new deps; no Vue runtime dep (text codegen only — visual verify is a later browser step).

**Spec:** §3.1, §3.4, §6.5. Builds on Plan 1 (AST: `DataBinding`/`EventBinding`/`Action`) + Plan 5 (Mock codegen helpers).

**Scope boundary (out of plan):** API calls + navigation are **stubs** (commented `// TODO` + minimal placeholder), NOT wired to a real backend/router (spec §3.4 "API binding stub"). NO `constraints` consumption (build-time only). NO Mock removal (both backends coexist; backend choice is project metadata, §5.7 — selection wiring is a later concern). NO client/route/server changes (pure lib). NO `computed`-source advanced expressions beyond a stub `computed()`.

---

## File Structure
```
packages/codegen/src/
  productionState.ts     ← collectState (paths → nested reactive decl) + helpers
  productionScript.ts    ← collectHandlers + collectApiLoaders + buildScriptSetup
  renderProductionNode.ts← node → semantic HTML + Tailwind + Vue directives
  renderVueProduction.ts ← assemble <script setup> + <template>
  index.ts               ← + re-export renderVueProduction
  __tests__/
    productionState.test.ts
    productionScript.test.ts
    renderProductionNode.test.ts
    renderVueProduction.test.ts
```
No changes outside `packages/codegen/src/`.

---

## Phase 1 — State collection

### Task 1: `productionState.ts`

**Files:** Create `productionState.ts` + test.

- [ ] **Step 1: failing test**

```typescript
// packages/codegen/src/__tests__/productionState.test.ts
import { describe, it, expect } from 'vitest';
import { collectStatePaths, buildStateInit } from '../productionState';
import type { ComponentNode } from '@designbridge/ast';

const n = (type: string, props = {}, bindings: ComponentNode['bindings'] = [], events: ComponentNode['events'] = [], children: ComponentNode[] = []): ComponentNode =>
  ({ id: 'n', type, props, layout: { kind: 'flow' }, style: {}, bindings, events, constraints: [], children });

describe('collectStatePaths', () => {
  it('collects state-source binding paths + setState event paths (deduped, sorted)', () => {
    const root = n('Form', {}, [], [], [
      n('Input', {}, [{ propKey: 'value', source: 'state', path: 'form.email' }], []),
      n('Input', {}, [{ propKey: 'value', source: 'state', path: 'form.password' }],
        [{ event: 'change', action: { kind: 'setState', path: 'form.password', valueFromEvent: true } }]),
      n('Text', {}, [{ propKey: 'content', source: 'static', staticValue: 'x' }], []),
    ]);
    expect(collectStatePaths(root)).toEqual(['form.email', 'form.password']);
  });
});

describe('buildStateInit', () => {
  it('builds a nested object literal from dotted paths (leaves init to empty string)', () => {
    expect(buildStateInit(['form.email', 'form.password', 'count'])).toEqual({ form: { email: '', password: '' }, count: '' });
  });
  it('returns empty object for no paths', () => {
    expect(buildStateInit([])).toEqual({});
  });
});
```

- [ ] **Step 2: run → FAIL.** `pnpm --filter @designbridge/codegen test`
- [ ] **Step 3: implement `productionState.ts`**

```typescript
// packages/codegen/src/productionState.ts
import type { ComponentNode } from '@designbridge/ast';

/** All state paths referenced by state-source bindings + setState events, deduped + sorted. */
export function collectStatePaths(root: ComponentNode): string[] {
  const set = new Set<string>();
  const walk = (n: ComponentNode): void => {
    for (const b of n.bindings) if (b.source === 'state' && typeof b.path === 'string' && b.path) set.add(b.path);
    for (const e of n.events) if (e.action.kind === 'setState' && e.action.path) set.add(e.action.path);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return [...set].sort();
}

type StateTree = { [k: string]: StateTree | string };

/** Build a nested object from dotted paths; leaves initialised to '' (stub default). */
export function buildStateInit(paths: string[]): StateTree {
  const root: StateTree = {};
  for (const p of paths) {
    const segs = p.split('.').filter(Boolean);
    let cur = root;
    segs.forEach((seg, i) => {
      if (i === segs.length - 1) { if (typeof cur[seg] !== 'object') cur[seg] = ''; }
      else { if (typeof cur[seg] !== 'object') cur[seg] = {}; cur = cur[seg] as StateTree; }
    });
  }
  return root;
}
```

- [ ] **Step 4: run → PASS. Commit** `feat(codegen): add production state-path collection`.

---

## Phase 2 — Script (handlers + API loaders + script-setup)

### Task 2: `productionScript.ts`

**Files:** Create `productionScript.ts` + test.

- [ ] **Step 1: failing test**

```typescript
// packages/codegen/src/__tests__/productionScript.test.ts
import { describe, it, expect } from 'vitest';
import { collectApiLoaders, buildScriptSetup } from '../productionScript';
import type { ComponentNode } from '@designbridge/ast';

const n = (id: string, type: string, bindings: ComponentNode['bindings'] = [], events: ComponentNode['events'] = [], children: ComponentNode[] = []): ComponentNode =>
  ({ id, type, props: {}, layout: { kind: 'flow' }, style: {}, bindings, events, constraints: [], children });

describe('collectApiLoaders', () => {
  it('finds api-source bindings', () => {
    const root = n('n_root', 'Container', [], [], [
      n('n_tbl', 'Table', [{ propKey: 'rows', source: 'api', endpoint: { method: 'GET', url: '/api/users' } }]),
    ]);
    const loaders = collectApiLoaders(root);
    expect(loaders).toHaveLength(1);
    expect(loaders[0]).toMatchObject({ nodeId: 'n_tbl', propKey: 'rows', method: 'GET', url: '/api/users' });
  });
});

describe('buildScriptSetup', () => {
  it('emits <script setup> with vue imports, reactive state, api loader stub, and event handlers', () => {
    const root = n('n_root', 'Form', [], [], [
      n('n_in', 'Input', [{ propKey: 'value', source: 'state', path: 'form.email' }],
        [{ event: 'change', action: { kind: 'setState', path: 'form.email', valueFromEvent: true } }]),
      n('n_btn', 'Button', [], [{ event: 'click', action: { kind: 'api', endpoint: { method: 'POST', url: '/api/login' }, payloadFromState: 'form' } }]),
      n('n_tbl', 'Table', [{ propKey: 'rows', source: 'api', endpoint: { method: 'GET', url: '/api/users' } }]),
    ]);
    const script = buildScriptSetup(root);
    expect(script).toMatch(/^<script setup>/);
    expect(script).toMatch(/import \{ reactive, ref.*\} from 'vue'/);
    expect(script).toContain("const state = reactive(");
    expect(script).toContain('form');
    expect(script).toMatch(/function on_n_btn_click\(/);     // event handler
    expect(script).toMatch(/\/api\/login/);                  // api stub in handler
    expect(script).toMatch(/n_tbl.*ref\(|rows.*ref\(/);      // api loader ref
    expect(script).toContain('</script>');
  });
  it('returns a minimal script when there is no state/events/api', () => {
    const root = n('n_root', 'Container');
    expect(buildScriptSetup(root)).toMatch(/<script setup>[\s\S]*<\/script>/);
  });
});
```

- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement `productionScript.ts`**

```typescript
// packages/codegen/src/productionScript.ts
import type { ComponentNode, EventBinding, Action } from '@designbridge/ast';
import { collectStatePaths, buildStateInit } from './productionState';

const ident = (s: string): string => s.replace(/[^A-Za-z0-9_]/g, '_');

export interface ApiLoader { nodeId: string; propKey: string; method: string; url: string; fnName: string; refName: string; }

/** api-source bindings → loader descriptors. */
export function collectApiLoaders(root: ComponentNode): ApiLoader[] {
  const out: ApiLoader[] = [];
  const walk = (n: ComponentNode): void => {
    for (const b of n.bindings) {
      if (b.source === 'api' && b.endpoint) {
        out.push({ nodeId: n.id, propKey: b.propKey, method: b.endpoint.method, url: b.endpoint.url,
          fnName: `load_${ident(n.id)}_${ident(b.propKey)}`, refName: `${ident(n.id)}_${ident(b.propKey)}` });
      }
    }
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

interface HandlerDesc { fnName: string; body: string[]; }

function handlerBody(action: Action): string[] {
  switch (action.kind) {
    case 'navigate': return [`  // TODO: wire router — navigate to '${action.to}'`, `  console.log('navigate', '${action.to}');`];
    case 'api': return [`  // TODO: real fetch — ${action.endpoint.method} ${action.endpoint.url}` + (action.payloadFromState ? ` (payload: state.${action.payloadFromState})` : ''), `  // const res = await fetch('${action.endpoint.url}', { method: '${action.endpoint.method}' });`];
    case 'setState': return [`  state.${action.path} = ${action.valueFromEvent ? '($event.target as HTMLInputElement)?.value' : JSON.stringify(action.staticValue ?? null)};`];
    case 'openModal': return [`  state.${ident(action.modalId)}_open = true;`];
    case 'closeModal': return [`  state.${action.modalId ? ident(action.modalId) + '_open' : 'modal_open'} = false;`];
    case 'custom': return [`  // TODO: custom action '${action.name}'`];
    default: return ['  // unknown action'];
  }
}

function collectHandlers(root: ComponentNode): HandlerDesc[] {
  const out: HandlerDesc[] = [];
  const walk = (n: ComponentNode): void => {
    n.events.forEach((e: EventBinding) => out.push({ fnName: `on_${ident(n.id)}_${ident(e.event)}`, body: handlerBody(e.action) }));
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/** Assemble the <script setup> block: vue imports + reactive state + api loader stubs + handlers. */
export function buildScriptSetup(root: ComponentNode): string {
  const statePaths = collectStatePaths(root);
  const loaders = collectApiLoaders(root);
  const handlers = collectHandlers(root);

  const vueImports = ['reactive'];
  if (loaders.length) vueImports.push('ref', 'onMounted');

  const lines: string[] = ['<script setup>', `import { ${vueImports.join(', ')} } from 'vue';`, ''];
  lines.push(`const state = reactive(${JSON.stringify(buildStateInit(statePaths), null, 2)});`, '');

  for (const l of loaders) {
    lines.push(`const ${l.refName} = ref(null); // ${l.method} ${l.url}`);
    lines.push(`async function ${l.fnName}() {`, `  // TODO: real fetch — ${l.method} ${l.url}`, `  // ${l.refName}.value = await (await fetch('${l.url}')).json();`, `}`);
  }
  if (loaders.length) { lines.push('', `onMounted(() => { ${loaders.map(l => l.fnName + '()').join('; ')}; });`, ''); }

  for (const h of handlers) { lines.push(`function ${h.fnName}($event) {`, ...h.body, `}`, ''); }

  lines.push('</script>');
  return lines.join('\n');
}
```

- [ ] **Step 4: run → PASS. Commit** `feat(codegen): add production script-setup (state/handlers/api stubs)`.

---

## Phase 3 — Production node renderer + SFC

### Task 3: `renderProductionNode.ts`

**Files:** Create `renderProductionNode.ts` + test.

> Reuses `classAttr` (tailwind.ts) + `escapeHtml`/`escapeAttr` (escape.ts). Adds directives: a state binding on an Input's `value` → `v-model="state.<path>"`; a state binding on a display prop (Text.content / Heading.content / Button.label) → `{{ state.<path> }}` instead of the static text; an event → `@<event>="on_<nodeId>_<event>"` (submit/click mapped to native events; `mount`/`unmount` are script-level, not template attrs).

- [ ] **Step 1: failing test**

```typescript
// packages/codegen/src/__tests__/renderProductionNode.test.ts
import { describe, it, expect } from 'vitest';
import { renderProductionNode } from '../renderProductionNode';
import type { ComponentNode } from '@designbridge/ast';

const node = (id: string, type: string, props = {}, bindings: ComponentNode['bindings'] = [], events: ComponentNode['events'] = []): ComponentNode =>
  ({ id, type, props, layout: { kind: 'flow' }, style: {}, bindings, events, constraints: [], children: [] });

describe('renderProductionNode', () => {
  it('Input with a state binding on value → v-model', () => {
    const out = renderProductionNode(node('n_in', 'Input', { inputType: 'email' }, [{ propKey: 'value', source: 'state', path: 'form.email' }]), 0);
    expect(out).toContain('v-model="state.form.email"');
    expect(out).toContain('type="email"');
  });
  it('Button with a click event → @click handler', () => {
    const out = renderProductionNode(node('n_btn', 'Button', { label: 'Go' }, [], [{ event: 'click', action: { kind: 'navigate', to: '/' } }]), 0);
    expect(out).toContain('@click="on_n_btn_click"');
    expect(out).toContain('>Go</button>');
  });
  it('Text with a state binding on content → interpolation', () => {
    const out = renderProductionNode(node('n_t', 'Text', { content: 'static' }, [{ propKey: 'content', source: 'state', path: 'user.name' }]), 0);
    expect(out).toContain('{{ state.user.name }}');
    expect(out).not.toContain('>static<');
  });
  it('falls back to static (Mock-like) when no bindings/events', () => {
    expect(renderProductionNode(node('n_t', 'Text', { content: 'hello' }), 0)).toContain('>hello</span>');
  });
});
```

- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement `renderProductionNode.ts`** — mirror Mock's `renderNode` switch, but:
  - compute `vmodel` (Input/Textarea/Select/Checkbox/Radio with a `value`/`checked` state binding) → add ` v-model="state.<path>"`.
  - compute display-binding (Text.content, Heading.content, Button.label, Link.label, Image.src/alt) state binding → emit `{{ state.<path> }}` (for text) or `:src="state.<path>"` (for attrs) instead of the static value.
  - for each event, add ` @<event>="on_<nodeId>_<event>"` to the element (map `submit`→`@submit.prevent`, `click`→`@click`, `change`→`@change`, `input`→`@input`, `focus`/`blur` likewise; skip `mount`/`unmount`).
  - reuse `classAttr` + escaping; recurse into children with `renderProductionNode`.
  Keep it complete for the 20 types (same structure as Mock `renderNode`; the directive logic is shared per-element). Tests assert the key directive behaviors above; whitespace is not contractual.

- [ ] **Step 4: run → PASS. Commit** `feat(codegen): render production nodes with v-model / @event / interpolation`.

### Task 4: `renderVueProduction.ts` + export

**Files:** Create `renderVueProduction.ts`; modify `index.ts`; test.

- [ ] **Step 1: failing test**

```typescript
// packages/codegen/src/__tests__/renderVueProduction.test.ts
import { describe, it, expect } from 'vitest';
import { renderVueProduction } from '../renderVueProduction';
import { AST_SCHEMA_VERSION, type SemanticUIAst } from '@designbridge/ast';

const ast: SemanticUIAst = {
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'login', kind: 'page',
  root: {
    id: 'n_root', type: 'Form', props: {}, layout: { kind: 'stack', direction: 'vertical', gap: 12 }, style: { padding: 24 },
    bindings: [], events: [{ event: 'submit', action: { kind: 'api', endpoint: { method: 'POST', url: '/api/login' }, payloadFromState: 'form' } }], constraints: [],
    children: [
      { id: 'n_email', type: 'Input', props: { inputType: 'email' }, layout: { kind: 'flow' }, style: {},
        bindings: [{ propKey: 'value', source: 'state', path: 'form.email' }], events: [], constraints: [], children: [] },
      { id: 'n_btn', type: 'Button', props: { label: 'Sign in' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    ],
  },
};

describe('renderVueProduction', () => {
  const out = renderVueProduction(ast);
  it('returns filename + code', () => { expect(out.filename).toBe('Login.vue'); });
  it('has BOTH <script setup> and <template> (unlike Mock)', () => {
    expect(out.code).toContain('<script setup>');
    expect(out.code).toContain('<template>');
    expect(out.code).toContain('const state = reactive(');
  });
  it('wires v-model on the bound input + @submit on the form', () => {
    expect(out.code).toContain('v-model="state.form.email"');
    expect(out.code).toMatch(/@submit(\.prevent)?="on_n_root_submit"/);
  });
  it('contains the api stub for the submit handler', () => {
    expect(out.code).toMatch(/\/api\/login/);
  });
});
```

- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: implement `renderVueProduction.ts`**

```typescript
// packages/codegen/src/renderVueProduction.ts
import type { SemanticUIAst } from '@designbridge/ast';
import { buildScriptSetup } from './productionScript';
import { renderProductionNode } from './renderProductionNode';
import { vueFilename } from './renderVue';

export interface VueArtifact { filename: string; code: string; }

/** Production backend: full Vue 3 SFC (Composition API + state + events + API stubs). */
export function renderVueProduction(ast: SemanticUIAst): VueArtifact {
  const script = buildScriptSetup(ast.root);
  const template = `<template>\n${renderProductionNode(ast.root, 1)}\n</template>\n`;
  return { filename: vueFilename(ast.artifactId), code: `${script}\n\n${template}` };
}
```

- [ ] **Step 4: re-export from `index.ts`** (`export { renderVueProduction } from './renderVueProduction';` + `productionState`/`productionScript`/`renderProductionNode` exports as useful). Also add a convenience type/union if desired (`export type Backend = 'mock' | 'production'`).
- [ ] **Step 5: run tests + build** — `pnpm --filter @designbridge/codegen test` (all green) + `build` (dual dist).
- [ ] **Step 6: commit** `feat(codegen): add renderVueProduction (Composition API SFC) + exports`.

---

## Phase 4 — Verify
- [ ] `pnpm --filter @designbridge/ast build && pnpm --filter @designbridge/codegen build && pnpm --filter @designbridge/codegen test` → all green.
- [ ] Live CJS smoke (repo root): render a login AST with a state-bound input + submit-api event via `renderVueProduction` and print the SFC; confirm it contains `<script setup>`, `const state = reactive(`, `v-model="state.form.email"`, `@submit`/`on_n_root_submit`, and `/api/login`.
- [ ] Mock still works: `renderVue` unchanged + its 40 tests green (no regression).
- [ ] `git diff --stat <plan8-head>..HEAD -- packages/ast packages/server packages/client` → EMPTY (codegen-only).

## Acceptance Criteria
- [ ] `renderVueProduction(ast)` emits a Vue 3 SFC with `<script setup>` (reactive `state` from bindings/setState, api-loader stubs, named event-handler fns) + `<template>` (semantic HTML + Tailwind + `v-model`/`@event`/`{{ }}` directives).
- [ ] State paths collected + nested; api/navigation bodies are clearly-marked stubs; setState mutates `state.<path>`.
- [ ] Mock (`renderVue`) untouched + green; both exported from `@designbridge/codegen`.
- [ ] codegen suite green; live smoke prints a valid Composition-API SFC; no ast/server/client changes; no new deps.
- [ ] Per-task `feat(codegen)` commits.

## Compiler Invariant (held)
> Same AST, two deterministic backends. Production reads the FULL AST (type/props/layout/style **+ bindings/events**); both are pure total functions of the AST. The AST stays the single source of truth — Production just emits more of it.

## Risks / Notes
1. Reuse Mock helpers (`escape`, `tailwind`, `vueFilename`) — don't duplicate. `renderProductionNode` mirrors Mock's `renderNode` structure + adds directives; keep the 20-type coverage.
2. Stubs must be obviously stubs (`// TODO`) — engineers wire real fetch/router. Don't fake real API calls.
3. State leaves init to `''` (stub default) — fine for v-model text fields; note as a simplification.
4. Event `submit` → `@submit.prevent` (forms); `mount`/`unmount` are NOT template attributes (handled via onMounted in script, or ignored for v1).
5. vitest `^3.2.4`. Codegen-only — no app wiring (backend selection per project is a later plan).

---

**Plan end.**
