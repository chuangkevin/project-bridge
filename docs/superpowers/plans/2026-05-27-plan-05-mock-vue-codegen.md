# Plan 5 — Mock Backend: Vue 3 + Tailwind Codegen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **Mock backend** — a pure, deterministic codegen that renders a `SemanticUIAst` into a single Vue 3 SFC string with Tailwind classes, for **visual fidelity only** (spec §3.4: no state, no events, no API, no logic). The Mock backend consumes ONLY `type` / `props` / `layout` / `style`; it ignores `bindings` / `events` / `constraints`. This is the M1 visual payoff: input → AST → rendered Vue.

**Architecture:** A new workspace package `packages/codegen` (`@designbridge/codegen`) depending on `@designbridge/ast` for types. Pure, dual CJS/ESM, no IO, no AI. The public entry is `renderVue(ast) → { filename, code }`: it walks the AST and emits a template-only Vue SFC (`<template>…</template>`, no `<script>` — mock has no logic). Each of the 20 base components maps to **semantic HTML** (`Button`→`<button>`, `Form`→`<form>`, `Heading`→`<h1..6>`, `Table`→`<table>`, …). `LayoutIntent`→Tailwind flex/grid classes and `StyleIntent`→Tailwind **arbitrary values** (`p-[16px]`, `bg-[#1e293b]`, `rounded-[8px]`). All text content and attribute values are HTML-escaped; arbitrary-value class fragments are sanitized so a malformed style value can never break the SFC or inject markup. The package keeps `@designbridge/ast` Vue-free (spec §3.1) and establishes the swappable-backend pattern for Production (Plan 9) / plugins (Plan 11).

**Tech Stack:** TypeScript 5.6 strict; Vitest 3.2.4; `@designbridge/ast` (workspace dep). No Vue/Tailwind runtime dependency — codegen emits text only (browser rendering is Plan 6). No new runtime deps beyond the ast workspace link.

**Spec:** `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md` (§3.1, §3.3, §3.4, §6.5). Builds on Plan 1 (`SemanticUIAst`, `ComponentNode`, `BASE_COMPONENTS`).

**Upstream dependency:** Plan 1 (AST types + registry).

**Downstream consumers:** Plan 6 (client UI — mounts the generated SFC in the Preview stage; this is where in-browser visual fidelity is proven), Plan 9 (Production backend — same AST, +logic), Plan 11 (plugin backends).

**Locked design decisions (from planning Q&A):**
- **New `packages/codegen` package** (keeps ast Vue-free; backend pattern).
- **Arbitrary Tailwind values** (exact: `p-[16px]`, `bg-[#1e293b]`) — no scale-snapping table; design tokens refined in Plan 10.
- **Codegen fn + structural tests only** — in-browser visual rendering deferred to Plan 6.
- **Semantic HTML** per component; **Mock ignores bindings/events/constraints** (§3.4); template-only SFC (no script).

**Scope boundary (out of plan):**
- NO state / events / API / Composition API / `<script>` (that's the Production backend, Plan 9). Mock is visual-only.
- NO in-browser mount / Vite playground (Plan 6 proves visual fidelity).
- NO design-token resolution (a token-name color value is passed through best-effort; exact token→CSS mapping is Plan 10).
- NO wiring into routes / server / client (Plan 6 integrates). Standalone, tested package.
- NO consumption of `bindings`/`events`/`constraints` — present on the AST, ignored by the Mock renderer.

---

## Design grounding

- `@designbridge/ast` exports `SemanticUIAst`, `ComponentNode`, `LayoutIntent` (+ `StackLayout`/`GridLayout`/etc.), `StyleIntent`, and `BASE_COMPONENTS`. The renderer switches on `node.type` (string) and reads `node.props` (`Record<string, unknown>`).
- Package bootstrap mirrors Plan 1's `@designbridge/ast` (dual `tsconfig.json`/`tsconfig.esm.json`, `dist/cjs`+`dist/esm`, vitest `^3.2.4`, `rootDir: "src"`). Reuse those exact configs to avoid the Plan-1 build-path pitfalls.

---

## File Structure

```
packages/codegen/
  package.json                ← @designbridge/codegen (dep: @designbridge/ast workspace:*)
  tsconfig.json               ← CJS build (rootDir src → dist/cjs)
  tsconfig.esm.json           ← ESM build (declarationMap:false)
  README.md
  src/
    index.ts                  ← public: renderVue, vueFilename
    escape.ts                 ← escapeHtml, escapeAttr, sanitizeArbitrary
    tailwind.ts               ← layoutClasses(layout), styleClasses(style), classAttr(node)
    renderNode.ts             ← the 20-component → semantic HTML renderer (recursive)
    renderVue.ts              ← SFC envelope (template-only) + vueFilename
    __tests__/
      escape.test.ts
      tailwind.test.ts
      renderNode.test.ts
      renderVue.test.ts
```

No existing files modified. New package only (pnpm-workspace already globs `packages/*`).

---

## Phase 1 — Package bootstrap

### Task 1: Create `packages/codegen`

**Files:**
- Create: `packages/codegen/package.json`
- Create: `packages/codegen/tsconfig.json`
- Create: `packages/codegen/tsconfig.esm.json`
- Create: `packages/codegen/.gitignore`
- Create: `packages/codegen/src/index.ts`
- Create: `packages/codegen/README.md`

- [ ] **Step 1: `packages/codegen/package.json`**

```json
{
  "name": "@designbridge/codegen",
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
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.esm.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@designbridge/ast": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.2.4",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: `packages/codegen/tsconfig.json`** (identical pattern to `packages/ast/tsconfig.json`)

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

- [ ] **Step 3: `packages/codegen/tsconfig.esm.json`**

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

- [ ] **Step 4: `packages/codegen/.gitignore`**

```
dist/
node_modules/
```

- [ ] **Step 5: `packages/codegen/src/index.ts`** (placeholder until Task 5)

```typescript
export const CODEGEN_TARGET = 'vue3-tailwind-mock';
```

- [ ] **Step 6: `packages/codegen/README.md`**

```markdown
# @designbridge/codegen

Mock backend: renders a `SemanticUIAst` (`@designbridge/ast`) to a Vue 3 + Tailwind SFC for
visual fidelity only (no state / events / API). See spec §3.4. The AST stays the source of truth;
this is one swappable backend target.
```

- [ ] **Step 7: Install + build**

Run: `pnpm install` (links `@designbridge/ast` into codegen). Then `pnpm --filter @designbridge/codegen build`.
Expected: `packages/codegen/dist/cjs/index.js` and `dist/esm/index.js` exist.

- [ ] **Step 8: Commit**

```bash
git add packages/codegen/ pnpm-lock.yaml
git commit -m "feat(codegen): bootstrap @designbridge/codegen workspace package"
```

---

## Phase 2 — Escaping + Tailwind class builders

### Task 2: `escape.ts`

**Files:**
- Create: `packages/codegen/src/escape.ts`
- Test: `packages/codegen/src/__tests__/escape.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/codegen/src/__tests__/escape.test.ts
import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr, sanitizeArbitrary } from '../escape';

describe('escapeHtml', () => {
  it('escapes &, <, >', () => {
    expect(escapeHtml('a & b <script>')).toBe('a &amp; b &lt;script&gt;');
  });
  it('handles non-string input by coercing', () => {
    expect(escapeHtml(undefined as unknown as string)).toBe('');
  });
});

describe('escapeAttr', () => {
  it('escapes double quotes and angle brackets', () => {
    expect(escapeAttr('x"y<z>')).toBe('x&quot;y&lt;z&gt;');
  });
});

describe('sanitizeArbitrary', () => {
  it('keeps a normal css value', () => {
    expect(sanitizeArbitrary('#1e293b')).toBe('#1e293b');
    expect(sanitizeArbitrary('16px')).toBe('16px');
    expect(sanitizeArbitrary('1fr 2fr')).toBe('1fr_2fr'); // spaces → underscore (Tailwind arbitrary syntax)
  });
  it('drops a value containing class-breaking characters', () => {
    expect(sanitizeArbitrary('foo]bar')).toBeNull();
    expect(sanitizeArbitrary('a"b')).toBeNull();
    expect(sanitizeArbitrary('a<b')).toBeNull();
    expect(sanitizeArbitrary('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `pnpm --filter @designbridge/codegen test` → FAIL (missing module).

- [ ] **Step 3: Write `escape.ts`**

```typescript
// packages/codegen/src/escape.ts

/** Escape text for use as HTML text content. */
export function escapeHtml(value: string): string {
  if (typeof value !== 'string') return '';
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape text for use inside a double-quoted HTML attribute. */
export function escapeAttr(value: string): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitize a value for use inside a Tailwind arbitrary value `[...]`. Spaces become underscores
 * (Tailwind's arbitrary-value convention). Returns null if the value is empty or contains
 * characters that would break the class token or the surrounding attribute (`]`, quotes, `<`, `>`,
 * whitespace other than spaces, backslash) — the caller then omits the class.
 */
export function sanitizeArbitrary(value: string): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/[\]"'<>\\\n\r\t]/.test(trimmed)) return null;
  return trimmed.replace(/ /g, '_');
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/escape.ts packages/codegen/src/__tests__/escape.test.ts
git commit -m "feat(codegen): add HTML escaping + Tailwind arbitrary-value sanitizer"
```

---

### Task 3: `tailwind.ts` — layout + style → classes

**Files:**
- Create: `packages/codegen/src/tailwind.ts`
- Test: `packages/codegen/src/__tests__/tailwind.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/codegen/src/__tests__/tailwind.test.ts
import { describe, it, expect } from 'vitest';
import { layoutClasses, styleClasses, classAttr } from '../tailwind';
import type { ComponentNode } from '@designbridge/ast';

describe('layoutClasses', () => {
  it('stack vertical with gap/align/justify', () => {
    expect(layoutClasses({ kind: 'stack', direction: 'vertical', gap: 8, align: 'center', justify: 'between' }))
      .toEqual(['flex', 'flex-col', 'gap-[8px]', 'items-center', 'justify-between']);
  });
  it('stack horizontal', () => {
    expect(layoutClasses({ kind: 'stack', direction: 'horizontal' })).toEqual(['flex', 'flex-row']);
  });
  it('grid with numeric columns', () => {
    expect(layoutClasses({ kind: 'grid', columns: 3, gap: 16 })).toEqual(['grid', 'grid-cols-3', 'gap-[16px]']);
  });
  it('grid with template-string columns uses arbitrary value', () => {
    expect(layoutClasses({ kind: 'grid', columns: '1fr 2fr' })).toEqual(['grid', 'grid-cols-[1fr_2fr]']);
  });
  it('flow yields no classes', () => {
    expect(layoutClasses({ kind: 'flow' })).toEqual([]);
  });
});

describe('styleClasses', () => {
  it('maps background/textColor/padding/borderRadius to arbitrary values', () => {
    expect(styleClasses({ background: '#1e293b', textColor: '#f1f5f9', padding: 16, borderRadius: 8 }))
      .toEqual(['bg-[#1e293b]', 'text-[#f1f5f9]', 'p-[16px]', 'rounded-[8px]']);
  });
  it('supports paddingX/paddingY and string spacing tokens', () => {
    expect(styleClasses({ paddingX: 12, paddingY: 4 })).toEqual(['px-[12px]', 'py-[4px]']);
  });
  it('omits a class when the value cannot be sanitized', () => {
    expect(styleClasses({ background: 'evil]value' })).toEqual([]);
  });
  it('returns [] for empty style', () => {
    expect(styleClasses({})).toEqual([]);
  });
});

describe('classAttr', () => {
  const node = (layout: ComponentNode['layout'], style: ComponentNode['style']): ComponentNode => ({
    id: 'n', type: 'Container', props: {}, layout, style, bindings: [], events: [], constraints: [], children: [],
  });
  it('joins layout + style into a class attribute', () => {
    expect(classAttr(node({ kind: 'stack', direction: 'vertical' }, { padding: 8 }))).toBe(' class="flex flex-col p-[8px]"');
  });
  it('returns empty string when there are no classes', () => {
    expect(classAttr(node({ kind: 'flow' }, {}))).toBe('');
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Write `tailwind.ts`**

```typescript
// packages/codegen/src/tailwind.ts
import type { LayoutIntent, StyleIntent, ComponentNode } from '@designbridge/ast';
import { sanitizeArbitrary } from './escape';

const ALIGN: Record<string, string> = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' };
const JUSTIFY: Record<string, string> = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between', around: 'justify-around', evenly: 'justify-evenly' };

/** A numeric px or a string token → an arbitrary Tailwind value fragment, or null to omit. */
function arb(value: number | string | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === 'number') return `${value}px`;
  return sanitizeArbitrary(value);
}

export function layoutClasses(layout: LayoutIntent): string[] {
  const out: string[] = [];
  switch (layout.kind) {
    case 'stack': {
      out.push('flex', layout.direction === 'vertical' ? 'flex-col' : 'flex-row');
      if (layout.gap !== undefined) out.push(`gap-[${layout.gap}px]`);
      if (layout.align) out.push(ALIGN[layout.align]);
      if (layout.justify) out.push(JUSTIFY[layout.justify]);
      if (layout.wrap) out.push('flex-wrap');
      break;
    }
    case 'grid': {
      out.push('grid');
      out.push(typeof layout.columns === 'number' ? `grid-cols-${layout.columns}` : `grid-cols-[${sanitizeArbitrary(layout.columns) ?? '1'}]`);
      if (layout.gap !== undefined) out.push(`gap-[${layout.gap}px]`);
      break;
    }
    case 'absolute': {
      out.push('absolute');
      if (layout.x !== undefined) out.push(`left-[${layout.x}px]`);
      if (layout.y !== undefined) out.push(`top-[${layout.y}px]`);
      if (layout.width !== undefined) out.push(`w-[${layout.width}px]`);
      if (layout.height !== undefined) out.push(`h-[${layout.height}px]`);
      break;
    }
    case 'flow':
    default:
      break;
  }
  return out.filter(Boolean);
}

export function styleClasses(style: StyleIntent): string[] {
  const out: Array<string | null> = [];
  const push = (prefix: string, value: number | string | undefined) => {
    const a = arb(value);
    out.push(a === null ? null : `${prefix}-[${a}]`);
  };
  if (style.background !== undefined) push('bg', style.background);
  if (style.textColor !== undefined) push('text', style.textColor);
  if (style.borderColor !== undefined) push('border', style.borderColor);
  if (style.borderWidth !== undefined) push('border', style.borderWidth);
  if (style.borderRadius !== undefined) push('rounded', style.borderRadius);
  if (style.padding !== undefined) push('p', style.padding);
  if (style.paddingX !== undefined) push('px', style.paddingX);
  if (style.paddingY !== undefined) push('py', style.paddingY);
  if (style.margin !== undefined) push('m', style.margin);
  if (style.marginX !== undefined) push('mx', style.marginX);
  if (style.marginY !== undefined) push('my', style.marginY);
  if (style.width !== undefined) push('w', style.width);
  if (style.height !== undefined) push('h', style.height);
  if (style.minWidth !== undefined) push('min-w', style.minWidth);
  if (style.maxWidth !== undefined) push('max-w', style.maxWidth);
  if (style.fontSize !== undefined) push('text', style.fontSize);
  if (style.opacity !== undefined) out.push(`opacity-[${style.opacity}]`);
  if (Array.isArray(style.rawClasses)) {
    for (const c of style.rawClasses) { const s = sanitizeArbitrary(c); if (s) out.push(s); }
  }
  return out.filter((c): c is string => typeof c === 'string' && c.length > 0);
}

/** Build the ` class="…"` attribute (with a leading space) from a node's layout+style, or '' if none. */
export function classAttr(node: ComponentNode): string {
  const classes = [...layoutClasses(node.layout), ...styleClasses(node.style)];
  return classes.length ? ` class="${classes.join(' ')}"` : '';
}
```

> NOTE: `fontSize` mapping to `text-[..]` collides conceptually with `textColor`→`text-[..]`; both emit `text-[X]`. Tailwind disambiguates by value type (color vs length) so this is acceptable for mock. If both are set, both classes are emitted (order: textColor before fontSize). Do not "fix" this — it's an accepted mock simplification.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/tailwind.ts packages/codegen/src/__tests__/tailwind.test.ts
git commit -m "feat(codegen): map LayoutIntent/StyleIntent to Tailwind arbitrary values"
```

---

## Phase 3 — The renderer

### Task 4: `renderNode.ts` — 20 components → semantic HTML

**Files:**
- Create: `packages/codegen/src/renderNode.ts`
- Test: `packages/codegen/src/__tests__/renderNode.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/codegen/src/__tests__/renderNode.test.ts
import { describe, it, expect } from 'vitest';
import { renderNode } from '../renderNode';
import type { ComponentNode } from '@designbridge/ast';

const n = (type: string, props: Record<string, unknown> = {}, children: ComponentNode[] = []): ComponentNode => ({
  id: 'n', type, props, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children,
});

describe('renderNode', () => {
  it('Text → escaped span', () => {
    expect(renderNode(n('Text', { content: 'a < b & c' }), 0)).toContain('<span>a &lt; b &amp; c</span>');
  });
  it('Heading → h{level}', () => {
    expect(renderNode(n('Heading', { content: 'Title', level: '3' }), 0)).toContain('<h3>Title</h3>');
    expect(renderNode(n('Heading', { content: 'Default' }), 0)).toContain('<h2>Default</h2>'); // default level 2
  });
  it('Button → button with escaped label', () => {
    expect(renderNode(n('Button', { label: 'Go"' }), 0)).toContain('<button type="button">Go&quot;</button>');
  });
  it('Image → self-closing img with src/alt', () => {
    const out = renderNode(n('Image', { src: '/x.png', alt: 'pic' }), 0);
    expect(out).toContain('<img');
    expect(out).toContain('src="/x.png"');
    expect(out).toContain('alt="pic"');
  });
  it('Input → input with type + placeholder', () => {
    const out = renderNode(n('Input', { inputType: 'email', placeholder: 'Email' }), 0);
    expect(out).toContain('<input');
    expect(out).toContain('type="email"');
    expect(out).toContain('placeholder="Email"');
  });
  it('Input defaults type to text', () => {
    expect(renderNode(n('Input', {}), 0)).toContain('type="text"');
  });
  it('Link → anchor with href', () => {
    expect(renderNode(n('Link', { label: 'Home', href: '/' }), 0)).toContain('<a href="/">Home</a>');
  });
  it('Select → select with options', () => {
    const out = renderNode(n('Select', { options: ['A', 'B'] }), 0);
    expect(out).toContain('<select');
    expect(out).toContain('<option>A</option>');
    expect(out).toContain('<option>B</option>');
  });
  it('Container renders children recursively', () => {
    const out = renderNode(n('Container', {}, [ n('Text', { content: 'hi' }) ]), 0);
    expect(out).toContain('<div');
    expect(out).toContain('<span>hi</span>');
  });
  it('Form → form element', () => {
    expect(renderNode(n('Form', {}, [ n('Button', { label: 'Submit' }) ]), 0)).toMatch(/<form[\s\S]*<button/);
  });
  it('Table → table with column headers and rows', () => {
    const out = renderNode(n('Table', { columns: ['Name', 'Age'], rows: [['Al', '30']] }), 0);
    expect(out).toContain('<table');
    expect(out).toContain('<th>Name</th>');
    expect(out).toContain('<th>Age</th>');
    expect(out).toContain('<td>Al</td>');
    expect(out).toContain('<td>30</td>');
  });
  it('unknown type → div with a data-unknown attr (graceful)', () => {
    const out = renderNode(n('NotReal', {}), 0);
    expect(out).toContain('data-unknown-type="NotReal"');
  });
  it('applies layout+style classes', () => {
    const node: ComponentNode = { ...n('Container'), layout: { kind: 'stack', direction: 'vertical' }, style: { padding: 8 } };
    expect(renderNode(node, 0)).toContain('class="flex flex-col p-[8px]"');
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Write `renderNode.ts`**

```typescript
// packages/codegen/src/renderNode.ts
import type { ComponentNode } from '@designbridge/ast';
import { escapeHtml, escapeAttr } from './escape';
import { classAttr } from './tailwind';

const pad = (depth: number): string => '  '.repeat(depth + 1);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function renderChildren(node: ComponentNode, depth: number): string {
  if (node.children.length === 0) return '';
  const inner = node.children.map((c) => renderNode(c, depth + 1)).join('\n');
  return `\n${inner}\n${pad(depth - 1)}`;
}

/** Render a single AST node (and its subtree) to indented Vue-template HTML. Mock = visual only. */
export function renderNode(node: ComponentNode, depth: number): string {
  const indent = pad(depth - 1);
  const cls = classAttr(node);
  const p = node.props;

  switch (node.type) {
    // --- layout containers ---
    case 'Container':
    case 'Stack':
    case 'Row':
    case 'Grid':
      return `${indent}<div${cls}>${renderChildren(node, depth)}</div>`;
    case 'Form':
      return `${indent}<form${cls}>${renderChildren(node, depth)}</form>`;
    case 'Card':
      return `${indent}<div${cls}>${p.title !== undefined ? `\n${pad(depth)}<h3>${escapeHtml(str(p.title))}</h3>` : ''}${renderChildren(node, depth)}</div>`;
    case 'Modal':
      return `${indent}<div${cls} role="dialog" aria-modal="true">${p.title !== undefined ? `\n${pad(depth)}<h2>${escapeHtml(str(p.title))}</h2>` : ''}${renderChildren(node, depth)}</div>`;
    case 'FormField':
      return `${indent}<div${cls}>${p.label !== undefined ? `\n${pad(depth)}<label>${escapeHtml(str(p.label))}</label>` : ''}${renderChildren(node, depth)}</div>`;

    // --- display leaves ---
    case 'Text':
      return `${indent}<span${cls}>${escapeHtml(str(p.content))}</span>`;
    case 'Heading': {
      const level = ['1', '2', '3', '4', '5', '6'].includes(str(p.level)) ? str(p.level) : '2';
      return `${indent}<h${level}${cls}>${escapeHtml(str(p.content))}</h${level}>`;
    }
    case 'Image':
      return `${indent}<img${cls} src="${escapeAttr(str(p.src))}" alt="${escapeAttr(str(p.alt))}" />`;
    case 'Icon':
      return `${indent}<span${cls} aria-hidden="true" data-icon="${escapeAttr(str(p.name))}"></span>`;

    // --- actions ---
    case 'Button':
      return `${indent}<button${cls} type="button">${escapeHtml(str(p.label))}</button>`;
    case 'Link':
      return `${indent}<a${cls} href="${escapeAttr(str(p.href, '#'))}">${escapeHtml(str(p.label))}</a>`;

    // --- inputs ---
    case 'Input':
      return `${indent}<input${cls} type="${escapeAttr(str(p.inputType, 'text'))}" placeholder="${escapeAttr(str(p.placeholder))}" />`;
    case 'Textarea':
      return `${indent}<textarea${cls} placeholder="${escapeAttr(str(p.placeholder))}"${p.rows !== undefined ? ` rows="${escapeAttr(str(p.rows))}"` : ''}></textarea>`;
    case 'Select':
      return `${indent}<select${cls}>${arr(p.options).map((o) => `\n${pad(depth)}<option>${escapeHtml(str(o))}</option>`).join('')}\n${indent}</select>`;
    case 'Checkbox':
      return `${indent}<label${cls}><input type="checkbox" /> ${escapeHtml(str(p.label))}</label>`;
    case 'Radio':
      return `${indent}<div${cls}>${arr(p.options).map((o) => `\n${pad(depth)}<label><input type="radio" /> ${escapeHtml(str(o))}</label>`).join('')}\n${indent}</div>`;

    // --- data ---
    case 'Table': {
      const cols = arr(p.columns).map((c) => `<th>${escapeHtml(str(c))}</th>`).join('');
      const rows = arr(p.rows)
        .map((row) => `\n${pad(depth)}<tr>${arr(row).map((cell) => `<td>${escapeHtml(str(cell))}</td>`).join('')}</tr>`)
        .join('');
      return `${indent}<table${cls}>\n${pad(depth)}<thead><tr>${cols}</tr></thead>\n${pad(depth)}<tbody>${rows}\n${pad(depth)}</tbody>\n${indent}</table>`;
    }

    // --- unknown (graceful fallback) ---
    default:
      return `${indent}<div${cls} data-unknown-type="${escapeAttr(node.type)}">${renderChildren(node, depth)}</div>`;
  }
}
```

> NOTE on indentation: tests assert on substrings/regex, not exact whitespace, so the exact `pad`/newline layout is not contractual — produce reasonable indentation; do not over-fixate on matching a specific whitespace pattern. The `renderChildren` helper's trailing-indent handling just needs to keep the SFC readable and valid.

- [ ] **Step 4: Run, expect PASS.** Adjust whitespace handling only if a substring assertion fails (the assertions are element/class/attr presence, not exact spacing).

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/renderNode.ts packages/codegen/src/__tests__/renderNode.test.ts
git commit -m "feat(codegen): render 20 base components to semantic HTML"
```

---

## Phase 4 — SFC envelope + exports

### Task 5: `renderVue.ts` + `index.ts`

**Files:**
- Create: `packages/codegen/src/renderVue.ts`
- Modify: `packages/codegen/src/index.ts`
- Test: `packages/codegen/src/__tests__/renderVue.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/codegen/src/__tests__/renderVue.test.ts
import { describe, it, expect } from 'vitest';
import { renderVue, vueFilename } from '../renderVue';
import { AST_SCHEMA_VERSION, type SemanticUIAst } from '@designbridge/ast';

const loginAst: SemanticUIAst = {
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'login-page', kind: 'page',
  root: {
    id: 'n_root', type: 'Form', props: {}, layout: { kind: 'stack', direction: 'vertical', gap: 12 },
    style: { padding: 24 }, bindings: [], events: [], constraints: [],
    children: [
      { id: 'n_h', type: 'Heading', props: { content: 'Sign in', level: '1' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
      { id: 'n_email', type: 'Input', props: { inputType: 'email', placeholder: 'Email' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
      { id: 'n_submit', type: 'Button', props: { label: 'Sign in' }, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children: [] },
    ],
  },
};

describe('vueFilename', () => {
  it('PascalCases the artifactId and appends .vue', () => {
    expect(vueFilename('login-page')).toBe('LoginPage.vue');
    expect(vueFilename('home')).toBe('Home.vue');
    expect(vueFilename('list_page-2')).toBe('ListPage2.vue');
  });
});

describe('renderVue', () => {
  const out = renderVue(loginAst);

  it('returns the SFC filename + code', () => {
    expect(out.filename).toBe('LoginPage.vue');
    expect(typeof out.code).toBe('string');
  });
  it('wraps the tree in a single <template> and has NO <script> (mock = no logic)', () => {
    expect(out.code).toMatch(/^<template>/);
    expect(out.code).toMatch(/<\/template>\s*$/);
    expect(out.code).not.toContain('<script');
  });
  it('renders the form, heading, input and button with classes', () => {
    expect(out.code).toContain('<form class="flex flex-col gap-[12px] p-[24px]">');
    expect(out.code).toContain('<h1>Sign in</h1>');
    expect(out.code).toContain('type="email"');
    expect(out.code).toContain('<button type="button">Sign in</button>');
  });
  it('produces valid single-root template (root element wraps everything)', () => {
    // exactly one top-level element inside <template>: the form
    const body = out.code.replace(/^<template>\n?/, '').replace(/\n?<\/template>\s*$/, '');
    expect(body.trimStart().startsWith('<form')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Write `renderVue.ts`**

```typescript
// packages/codegen/src/renderVue.ts
import type { SemanticUIAst } from '@designbridge/ast';
import { renderNode } from './renderNode';

export interface VueArtifact {
  filename: string;
  code: string;
}

/** Convert an artifactId (slug) into a PascalCase `.vue` filename. */
export function vueFilename(artifactId: string): string {
  const pascal = artifactId
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return `${pascal || 'Component'}.vue`;
}

/**
 * Render a SemanticUIAst into a template-only Vue 3 SFC (mock backend — visual only, no script).
 * The AST root becomes the single template root element (Vue 3 allows multiple roots, but a single
 * root keeps the mock output clean). Consumes type/props/layout/style only.
 */
export function renderVue(ast: SemanticUIAst): VueArtifact {
  const body = renderNode(ast.root, 1);
  const code = `<template>\n${body}\n</template>\n`;
  return { filename: vueFilename(ast.artifactId), code };
}
```

- [ ] **Step 4: Replace `packages/codegen/src/index.ts`**

```typescript
// packages/codegen/src/index.ts
export const CODEGEN_TARGET = 'vue3-tailwind-mock';

export { renderVue, vueFilename } from './renderVue';
export type { VueArtifact } from './renderVue';
export { renderNode } from './renderNode';
export { layoutClasses, styleClasses, classAttr } from './tailwind';
export { escapeHtml, escapeAttr, sanitizeArbitrary } from './escape';
```

- [ ] **Step 5: Run tests + build**

Run: `pnpm --filter @designbridge/codegen test` → PASS.
Run: `pnpm --filter @designbridge/codegen build` → clean CJS+ESM; confirm `dist/cjs/index.js` + `dist/esm/index.js`.

> If the single-root test fails because `renderNode` emits a leading indent before `<form>`, the `body.trimStart()` in the test accounts for it — but ensure `renderVue` does not prepend extra wrapper elements. The root must be the AST root element.

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/renderVue.ts packages/codegen/src/index.ts packages/codegen/src/__tests__/renderVue.test.ts
git commit -m "feat(codegen): add renderVue SFC envelope + vueFilename + public exports"
```

---

## Phase 5 — Verify

### Task 6: Build + test + integration sanity

**Files:** none.

- [ ] **Step 1:** `pnpm --filter @designbridge/ast build` (codegen depends on ast's built types) then `pnpm --filter @designbridge/codegen build && pnpm --filter @designbridge/codegen test` → all green; dual dist emitted.
- [ ] **Step 2:** End-to-end sanity from repo root (proves the package composes with the AST + builder layers at runtime under CJS):

```
node -e "const {renderVue}=require('./packages/codegen/dist/cjs/index.js'); const {AST_SCHEMA_VERSION}=require('./packages/ast/dist/cjs/index.js'); const ast={schemaVersion:AST_SCHEMA_VERSION,artifactId:'demo',kind:'page',root:{id:'n_root',type:'Form',props:{},layout:{kind:'stack',direction:'vertical',gap:8},style:{padding:16},bindings:[],events:[],constraints:[],children:[{id:'n_b',type:'Button',props:{label:'OK'},layout:{kind:'flow'},style:{},bindings:[],events:[],constraints:[],children:[]}]}}; const out=renderVue(ast); console.log(out.filename); console.log(out.code);"
```
Expected: prints `Demo.vue` and a `<template>` with `<form class="flex flex-col gap-[8px] p-[16px]">` containing `<button type="button">OK</button>`, no `<script>`.

- [ ] **Step 3:** `git diff --stat <plan4-head>..HEAD -- packages/ast packages/server packages/client` → EMPTY (Plan 5 is the new codegen package only; it does not modify ast/server/client).

---

## Acceptance Criteria

- [ ] `packages/codegen` (`@designbridge/codegen`) exists, depends on `@designbridge/ast`, builds dual CJS/ESM.
- [ ] `renderVue(ast) → { filename, code }` emits a **template-only** Vue SFC (no `<script>`), single root = the AST root, consuming ONLY type/props/layout/style.
- [ ] All 20 base components render to semantic HTML (`<form>`/`<button>`/`<input>`/`<h1..6>`/`<table>`/`<select>`/etc.); unknown types fall back to `<div data-unknown-type>`.
- [ ] `LayoutIntent`→Tailwind (flex/grid/gap/align/justify/absolute) and `StyleIntent`→Tailwind **arbitrary values**; malformed values are sanitized away (never break the SFC).
- [ ] All text content + attribute values are HTML-escaped (XSS-safe output).
- [ ] `vueFilename` PascalCases the artifactId.
- [ ] `pnpm --filter @designbridge/codegen test` + `build` pass; the CJS end-to-end sanity prints a valid SFC.
- [ ] Plan 5 modifies NO ast/server/client files (new package only); zero new third-party deps.
- [ ] Per-task commits with `feat(codegen)` convention.

## Compiler Invariant (held by this plan)

> **Codegen is a pure, total function of the AST.** `renderVue` reads only type/props/layout/style, never calls AI/IO, and produces deterministic output for a given AST. Unknown component types degrade gracefully (no throw). The Mock backend cannot change the AST — it only reads it.

---

## Risks / Notes for Executor

1. **Reuse Plan 1's package config exactly** (`rootDir: "src"`, ESM `declarationMap:false`) — these were the Plan-1 build-path fixes; copying them avoids re-discovering the same TS5069 / `dist/cjs/src/...` pitfalls.
2. **vitest `^3.2.4`** (vite 5 incompatibility) — match the other packages; do NOT use vitest 4.
3. **Escaping is mandatory** — every `props` string that lands in text or an attribute MUST go through `escapeHtml`/`escapeAttr`, and every style value through `sanitizeArbitrary`. An un-escaped prop is an injection hole in the generated SFC.
4. **Whitespace is not contractual** — tests assert element/class/attr presence via `toContain`/`toMatch`, not exact indentation. Produce readable output; don't chase exact whitespace.
5. **`fontSize` and `textColor` both map to `text-[..]`** — accepted mock simplification (Tailwind disambiguates by value). Don't add a token system here (Plan 10).
6. **Do NOT wire into client/server** — Plan 6 mounts the SFC and proves in-browser fidelity. Plan 5 is the standalone codegen package + structural tests.
7. **Mock ignores bindings/events/constraints** — by design (§3.4). Do not read them.

---

**Plan end.** Ready for execution.
