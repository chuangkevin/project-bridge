# Plan 4 — Skill Engine (JSON rule schema + assert transform pass) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **Skill Engine** — the build-time constraint pass that enforces skill/design rules on the Semantic UI AST deterministically (no AI). Plan 4 ships the JSON rule schema (TypeScript types), a pure `applySkillRules(ast, rules)` transform pass that evaluates **assertion** rules and collects typed violations, and the first reference rule (`core.form.requires-button`). Rules are JSON-serializable, deterministic, and never enter an AI prompt — the AI obeys rules, it does not decide them (spec §4.4).

**Architecture:** All of it is pure and lives in `@designbridge/ast` under `src/skill/` (same home as `applyMutationOps` — pure AST logic, no IO, no AI). `applySkillRules(ast, rules[]) → { ast, violations[] }` walks the AST; for each node matching a rule's `when` selector it evaluates the rule's `assert` predicate and, on failure, appends a `RuleViolation` (carrying `ruleId`, `nodeId`, `severity`, `message`). In assert-only mode the AST is returned **unchanged** (the `ast` field is present for forward-compatibility with a future `mutate` action type). `error`-severity violations are the §6.12 "AST must pass all active rules" gate; `warning` is advisory. The predicate vocabulary is minimal and structural; it extends when a real rule needs more.

**Tech Stack:** TypeScript 5.6 strict; Vitest 3.2.4; `@designbridge/ast` only (no server, no new deps). Reuses Plan 1's `SemanticUIAst`/`ComponentNode`.

**Spec:** `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md` (§4.4, §4.5, §6.12). Builds on Plan 1 (AST types). Independent of Plans 2-3 at the code level (the engine takes any `SemanticUIAst`).

**Upstream dependency:** Plan 1 (`SemanticUIAst`, `ComponentNode`).

**Downstream consumers:** Plan 3's builder pipeline (a later integration will run `applySkillRules` after the AI produces a validated AST — NOT wired in Plan 4), Plan 8 (`verify-rules` CLI + skill authoring + `.skill.md`↔`.rules.json` pairing), Plan 6 (client UI — Constraint stage shows active rules + violations).

**Locked design decisions (from planning Q&A):**
- **Assert-only** in Plan 4. The schema is designed to also carry a `mutate` action, but auto-fix is deferred to a later plan. The first rule is an assert.
- **Minimal structural predicates:** `when` matches by component `type` (+ optional `propEquals`); `assert` is one of `hasDescendantOfType` / `missingDescendantOfType` / `hasChildOfType` / `requiredPropPresent`. The predicate key-value form matches the approved JSON shape.
- **Violations:** collected and returned (the pass never throws on a violation); `severity: 'error' | 'warning'`; `error` = a real constraint failure (CI gate), `warning` = advisory.
- **Pure engine in `@designbridge/ast`**, standalone. NOT wired into the AI builder or any route in Plan 4.

**Scope boundary (out of plan):**
- NO `mutate`/auto-fix rule actions (schema reserves the shape; engine does not apply mutations).
- NO `verify-rules` CLI, NO rule-JSON loading/validation from files, NO `.skill.md`↔`.rules.json` pairing — all Plan 8. Plan 4's rules are built-in TS objects (compile-time checked).
- NO priority/conflict-resolution engine — for assert-only, rule order does not affect the violation set; a `priority` field is NOT added yet (YAGNI; conflict resolution is a mutate-era + Plan 8 concern).
- NO wiring into `buildColdStart`/`applyMutation` or routes.
- NO registry cross-check that `when.type`/`assert.*Type` are real component types (a Plan 8 `verify-rules` concern).

---

## Design grounding

- Reuses Plan 1's `ComponentNode.children` recursive shape for subtree walks. No need for `getDescendants` (a local pre-order walk is simpler and avoids re-finding nodes).
- Mirrors the `applyMutationOps` placement/pattern: pure function in `src/`, re-exported from `index.ts`, tested in `__tests__/`.

---

## File Structure

```
packages/ast/src/skill/
  rule.ts               ← SkillRule, RuleWhen, RuleAssert, RuleViolation types
  applySkillRules.ts    ← the pure assert transform pass + helpers
  coreRules.ts          ← CORE_RULES (the first reference rule)
packages/ast/src/index.ts  ← + re-export skill types, applySkillRules, CORE_RULES, hasErrorViolations
packages/ast/src/__tests__/
  skillRules.test.ts
```

No new dependencies. Only `packages/ast/src/index.ts` is modified (re-exports).

---

## Phase 1 — Rule schema types

### Task 1: `rule.ts` — SkillRule / RuleWhen / RuleAssert / RuleViolation

**Files:**
- Create: `packages/ast/src/skill/rule.ts`
- Test: `packages/ast/src/__tests__/skillRules.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/ast/src/__tests__/skillRules.test.ts
import { describe, it, expect } from 'vitest';
import type { SkillRule, RuleViolation } from '../skill/rule';

describe('SkillRule schema', () => {
  it('accepts an assert rule with a type selector', () => {
    const rule: SkillRule = {
      id: 'core.form.requires-button',
      description: 'A Form must contain a Button.',
      severity: 'error',
      when: { type: 'Form' },
      assert: { hasDescendantOfType: 'Button' },
      message: 'A Form must contain at least one Button.',
    };
    expect(rule.severity).toBe('error');
    expect('hasDescendantOfType' in rule.assert).toBe(true);
  });

  it('accepts each assert predicate variant', () => {
    const a: SkillRule['assert'][] = [
      { hasDescendantOfType: 'Button' },
      { missingDescendantOfType: 'Form' },
      { hasChildOfType: 'Input' },
      { requiredPropPresent: 'label' },
    ];
    expect(a).toHaveLength(4);
  });

  it('accepts a when selector with propEquals', () => {
    const rule: SkillRule = {
      id: 'r.button.primary-needs-label', severity: 'warning',
      when: { type: 'Button', propEquals: { variant: 'primary' } },
      assert: { requiredPropPresent: 'label' },
      message: 'A primary Button should have a label.',
    };
    expect(rule.when.propEquals?.variant).toBe('primary');
  });

  it('RuleViolation carries ruleId/nodeId/severity/message', () => {
    const v: RuleViolation = { ruleId: 'r.x', nodeId: 'n_1', severity: 'error', message: 'bad' };
    expect(v.nodeId).toBe('n_1');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `Cannot find module '../skill/rule'`.

- [ ] **Step 3: Write `rule.ts`**

```typescript
// packages/ast/src/skill/rule.ts
// JSON-serializable skill/design rule schema. Rules are deterministic build-time constraints —
// they never enter an AI prompt (spec §4.4). Plan 4 implements ONLY assert rules; the `mutate`
// action type is intentionally reserved for a later plan and not part of this schema yet.

export type RuleSeverity = 'error' | 'warning';

/** Selector: which nodes a rule applies to. */
export interface RuleWhen {
  /** Match nodes of this component type. */
  type: string;
  /** Optional: also require these prop key/values to match exactly. */
  propEquals?: Record<string, unknown>;
}

/**
 * Assertion predicate evaluated against a matched node. Exactly one key is set.
 * - hasDescendantOfType: passes iff the node's subtree contains ≥1 node of that type.
 * - missingDescendantOfType: passes iff the node's subtree contains NO node of that type.
 * - hasChildOfType: passes iff a DIRECT child of that type exists.
 * - requiredPropPresent: passes iff the node's props contains that key.
 */
export type RuleAssert =
  | { hasDescendantOfType: string }
  | { missingDescendantOfType: string }
  | { hasChildOfType: string }
  | { requiredPropPresent: string };

export interface SkillRule {
  /** Stable rule id, also the link target for the human-readable .skill.md (Plan 8). */
  id: string;
  description?: string;
  severity: RuleSeverity;
  when: RuleWhen;
  assert: RuleAssert;
  /** Human-readable message emitted on violation. */
  message: string;
}

/** A failed assertion at a specific node. */
export interface RuleViolation {
  ruleId: string;
  nodeId: string;
  severity: RuleSeverity;
  message: string;
}
```

- [ ] **Step 4: Run, expect PASS** — SkillRule schema tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/ast/src/skill/rule.ts packages/ast/src/__tests__/skillRules.test.ts
git commit -m "feat(ast): define skill rule schema (assert rules + violations)"
```

---

## Phase 2 — The engine

### Task 2: `applySkillRules` transform pass

**Files:**
- Create: `packages/ast/src/skill/applySkillRules.ts`
- Modify: `packages/ast/src/__tests__/skillRules.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```typescript
import { applySkillRules, hasErrorViolations } from '../skill/applySkillRules';
import { AST_SCHEMA_VERSION } from '../index';
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';

const node = (id: string, type: string, children: ComponentNode[] = [], props: Record<string, unknown> = {}): ComponentNode => ({
  id, type, props, layout: { kind: 'flow' }, style: {}, bindings: [], events: [], constraints: [], children,
});
const wrap = (root: ComponentNode): SemanticUIAst => ({
  schemaVersion: AST_SCHEMA_VERSION, artifactId: 'a', kind: 'page', root,
});

const formRequiresButton = {
  id: 'core.form.requires-button', severity: 'error' as const,
  when: { type: 'Form' }, assert: { hasDescendantOfType: 'Button' as string } as const,
  message: 'A Form must contain at least one Button.',
};

describe('applySkillRules', () => {
  it('reports a violation when a Form has no Button descendant', () => {
    const ast = wrap(node('n_root', 'Container', [ node('n_form', 'Form', [ node('n_in', 'Input') ]) ]));
    const { ast: out, violations } = applySkillRules(ast, [formRequiresButton]);
    expect(out).toBe(ast); // assert-only: AST unchanged (same ref)
    expect(violations).toEqual([
      { ruleId: 'core.form.requires-button', nodeId: 'n_form', severity: 'error', message: 'A Form must contain at least one Button.' },
    ]);
  });

  it('passes when a Form has a Button anywhere in its subtree', () => {
    const ast = wrap(node('n_root', 'Container', [ node('n_form', 'Form', [ node('n_wrap', 'Container', [ node('n_btn', 'Button') ]) ]) ]));
    expect(applySkillRules(ast, [formRequiresButton]).violations).toEqual([]);
  });

  it('does not match nodes of other types', () => {
    const ast = wrap(node('n_root', 'Container', [ node('n_card', 'Card') ]));
    expect(applySkillRules(ast, [formRequiresButton]).violations).toEqual([]);
  });

  it('emits one violation per matching node (multiple Forms)', () => {
    const ast = wrap(node('n_root', 'Container', [ node('n_f1', 'Form'), node('n_f2', 'Form', [ node('n_b', 'Button') ]) ]));
    const { violations } = applySkillRules(ast, [formRequiresButton]);
    expect(violations.map(v => v.nodeId)).toEqual(['n_f1']); // only the buttonless form
  });

  it('evaluates missingDescendantOfType (forbid)', () => {
    const rule = { id: 'r.btn.no-form', severity: 'warning' as const, when: { type: 'Button' },
      assert: { missingDescendantOfType: 'Form' }, message: 'A Button must not contain a Form.' };
    const ast = wrap(node('n_root', 'Button', [ node('n_form', 'Form') ]));
    const { violations } = applySkillRules(ast, [rule]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe('warning');
  });

  it('evaluates hasChildOfType (direct child only)', () => {
    const rule = { id: 'r.form.direct-input', severity: 'error' as const, when: { type: 'Form' },
      assert: { hasChildOfType: 'Input' }, message: 'A Form needs a direct Input child.' };
    // Input is a GRANDCHILD here → hasChildOfType fails → violation
    const ast = wrap(node('n_root', 'Form', [ node('n_wrap', 'Container', [ node('n_in', 'Input') ]) ]));
    expect(applySkillRules(ast, [rule]).violations).toHaveLength(1);
  });

  it('evaluates requiredPropPresent', () => {
    const rule = { id: 'r.heading.content', severity: 'error' as const, when: { type: 'Heading' },
      assert: { requiredPropPresent: 'content' }, message: 'Heading needs content.' };
    const missing = wrap(node('n_root', 'Heading', [], {}));
    const present = wrap(node('n_root', 'Heading', [], { content: 'Hi' }));
    expect(applySkillRules(missing, [rule]).violations).toHaveLength(1);
    expect(applySkillRules(present, [rule]).violations).toEqual([]);
  });

  it('honours propEquals in the when selector', () => {
    const rule = { id: 'r.primary.label', severity: 'warning' as const,
      when: { type: 'Button', propEquals: { variant: 'primary' } },
      assert: { requiredPropPresent: 'label' }, message: 'primary Button needs a label.' };
    const ast = wrap(node('n_root', 'Container', [
      node('n_p', 'Button', [], { variant: 'primary' }),   // matches, no label → violation
      node('n_s', 'Button', [], { variant: 'secondary' }), // does not match
    ]));
    const { violations } = applySkillRules(ast, [rule]);
    expect(violations.map(v => v.nodeId)).toEqual(['n_p']);
  });

  it('runs multiple rules, collecting all violations in deterministic (pre-order, rule-order) order', () => {
    const r1 = formRequiresButton;
    const r2 = { id: 'r.heading.content', severity: 'error' as const, when: { type: 'Heading' },
      assert: { requiredPropPresent: 'content' }, message: 'Heading needs content.' };
    const ast = wrap(node('n_root', 'Container', [ node('n_h', 'Heading'), node('n_form', 'Form') ]));
    const { violations } = applySkillRules(ast, [r1, r2]);
    expect(violations.map(v => `${v.nodeId}:${v.ruleId}`)).toEqual(['n_h:r.heading.content', 'n_form:core.form.requires-button']);
  });
});

describe('hasErrorViolations', () => {
  it('is true iff any violation has error severity', () => {
    expect(hasErrorViolations([{ ruleId: 'r', nodeId: 'n', severity: 'warning', message: 'm' }])).toBe(false);
    expect(hasErrorViolations([{ ruleId: 'r', nodeId: 'n', severity: 'error', message: 'm' }])).toBe(true);
    expect(hasErrorViolations([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing module.

- [ ] **Step 3: Write `applySkillRules.ts`**

```typescript
// packages/ast/src/skill/applySkillRules.ts
import type { SemanticUIAst } from '../types/ast';
import type { ComponentNode } from '../types/componentNode';
import type { SkillRule, RuleWhen, RuleAssert, RuleViolation } from './rule';

export interface ApplySkillRulesResult {
  /** Assert-only: the same AST reference (unchanged). Present for forward-compat with mutate rules. */
  ast: SemanticUIAst;
  /** All assertion failures, in pre-order (node) × rule-array order. */
  violations: RuleViolation[];
}

function subtreeHasType(node: ComponentNode, type: string): boolean {
  for (const c of node.children) {
    if (c.type === type) return true;
    if (subtreeHasType(c, type)) return true;
  }
  return false;
}

function matchesWhen(node: ComponentNode, when: RuleWhen): boolean {
  if (node.type !== when.type) return false;
  if (when.propEquals) {
    for (const [k, v] of Object.entries(when.propEquals)) {
      if (node.props[k] !== v) return false;
    }
  }
  return true;
}

function evalAssert(node: ComponentNode, assert: RuleAssert): boolean {
  if ('hasDescendantOfType' in assert) return subtreeHasType(node, assert.hasDescendantOfType);
  if ('missingDescendantOfType' in assert) return !subtreeHasType(node, assert.missingDescendantOfType);
  if ('hasChildOfType' in assert) return node.children.some(c => c.type === assert.hasChildOfType);
  if ('requiredPropPresent' in assert) return assert.requiredPropPresent in node.props;
  throw new Error(`applySkillRules: unknown assert predicate ${JSON.stringify(assert)}`);
}

/**
 * Build-time constraint pass (assert-only). Walks the AST pre-order; for every node matching a
 * rule's `when`, evaluates the `assert` and collects a violation on failure. Returns the AST
 * unchanged plus the violation list. Deterministic: violations are ordered by node pre-order,
 * then by rule order within a node.
 */
export function applySkillRules(ast: SemanticUIAst, rules: SkillRule[]): ApplySkillRulesResult {
  const violations: RuleViolation[] = [];
  const walk = (node: ComponentNode): void => {
    for (const rule of rules) {
      if (matchesWhen(node, rule.when) && !evalAssert(node, rule.assert)) {
        violations.push({ ruleId: rule.id, nodeId: node.id, severity: rule.severity, message: rule.message });
      }
    }
    for (const c of node.children) walk(c);
  };
  walk(ast.root);
  return { ast, violations };
}

/** True iff any violation is error-severity (the §6.12 "must pass all active rules" gate). */
export function hasErrorViolations(violations: RuleViolation[]): boolean {
  return violations.some(v => v.severity === 'error');
}
```

- [ ] **Step 4: Run, expect PASS** — all applySkillRules + hasErrorViolations tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/ast/src/skill/applySkillRules.ts packages/ast/src/__tests__/skillRules.test.ts
git commit -m "feat(ast): add applySkillRules assert transform pass + hasErrorViolations"
```

---

## Phase 3 — First reference rule + exports

### Task 3: `CORE_RULES` + index re-exports

**Files:**
- Create: `packages/ast/src/skill/coreRules.ts`
- Modify: `packages/ast/src/index.ts`
- Modify: `packages/ast/src/__tests__/skillRules.test.ts` (append)

- [ ] **Step 1: Append the failing test**

```typescript
import { CORE_RULES } from '../skill/coreRules';

describe('CORE_RULES', () => {
  it('contains the form-requires-button reference rule', () => {
    const rule = CORE_RULES.find(r => r.id === 'core.form.requires-button');
    expect(rule).toBeDefined();
    expect(rule?.severity).toBe('error');
    expect(rule?.when.type).toBe('Form');
  });

  it('flags a buttonless Form and clears once a Button is added', () => {
    const buttonless = wrap(node('n_root', 'Form'));
    expect(hasErrorViolations(applySkillRules(buttonless, CORE_RULES).violations)).toBe(true);
    const withButton = wrap(node('n_root', 'Form', [ node('n_b', 'Button', [], { label: 'Submit' }) ]));
    expect(applySkillRules(withButton, CORE_RULES).violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — missing module.

- [ ] **Step 3: Write `coreRules.ts`**

```typescript
// packages/ast/src/skill/coreRules.ts
import type { SkillRule } from './rule';

/**
 * Built-in baseline rules. Plan 4 ships the first reference rule; more rules (and project-loaded
 * .rules.json) come in later plans. These are the deterministic constraints the AST must satisfy.
 */
export const CORE_RULES: SkillRule[] = [
  {
    id: 'core.form.requires-button',
    description: 'A Form must contain at least one Button (e.g. a submit action).',
    severity: 'error',
    when: { type: 'Form' },
    assert: { hasDescendantOfType: 'Button' },
    message: 'A Form must contain at least one Button.',
  },
];
```

- [ ] **Step 4: Append re-exports to `packages/ast/src/index.ts`**

```typescript
export type { SkillRule, RuleWhen, RuleAssert, RuleViolation, RuleSeverity } from './skill/rule';
export { applySkillRules, hasErrorViolations } from './skill/applySkillRules';
export type { ApplySkillRulesResult } from './skill/applySkillRules';
export { CORE_RULES } from './skill/coreRules';
```

- [ ] **Step 5: Run tests + build**

Run: `pnpm --filter @designbridge/ast test` → PASS (all skill tests).
Run: `pnpm --filter @designbridge/ast build` → clean CJS+ESM; confirm `dist/cjs/skill/*.js` emitted and `index.d.ts` carries the skill re-exports.

- [ ] **Step 6: Commit**

```bash
git add packages/ast/src/skill/coreRules.ts packages/ast/src/index.ts packages/ast/src/__tests__/skillRules.test.ts
git commit -m "feat(ast): add CORE_RULES (form-requires-button) + skill engine exports"
```

---

## Phase 4 — Verify

### Task 4: Build + test + cross-package sanity

**Files:** none.

- [ ] **Step 1:** `pnpm --filter @designbridge/ast build && pnpm --filter @designbridge/ast test` → clean build; all ast tests pass (Plans 1-3 suites + the new skill suite).
- [ ] **Step 2:** `pnpm --filter server build` → exit 0 (server resolves the newly-exported skill symbols from `@designbridge/ast` even though it doesn't use them yet — proves no export breakage).
- [ ] **Step 3:** `git diff --stat <plan3-head>..HEAD -- packages/server` → EMPTY (Plan 4 is ast-only; no server files touched).

---

## Acceptance Criteria

- [ ] `@designbridge/ast` exports `SkillRule`/`RuleWhen`/`RuleAssert`/`RuleViolation`/`RuleSeverity`, `applySkillRules`, `hasErrorViolations`, `ApplySkillRulesResult`, and `CORE_RULES`.
- [ ] `applySkillRules(ast, rules)` is pure (returns the same AST ref + a violations list), deterministic (pre-order × rule-order), and supports all four assert predicates + `propEquals` selectors.
- [ ] Each assert predicate is unit-tested for both pass and fail; multi-rule + multi-match ordering tested.
- [ ] `CORE_RULES` contains `core.form.requires-button` (error severity); a buttonless Form yields an error violation, a Form with a Button descendant yields none.
- [ ] `hasErrorViolations` correctly distinguishes error vs warning.
- [ ] `pnpm --filter @designbridge/ast test` passes (Plans 1-3 + skill suite); both `@designbridge/ast` and `server` builds exit 0.
- [ ] ZERO new deps; NO server/route files modified; NO mutate-action code (assert-only).
- [ ] Per-task commits with `feat(ast)` convention.

## Compiler Invariant (held by this plan)

> **Rules are deterministic data, applied as a build-time pass — never AI.** `applySkillRules` is a pure function of (AST, rules); given the same inputs it always yields the same violations. No rule evaluation calls the AI or any IO. This is the foundation of the §6.12 "AST must pass all active rules" CI gate (error-severity violations = a failing AST).

---

## Risks / Notes for Executor

1. **Assert-only — do NOT implement mutate.** The schema deliberately has no `mutate` field yet; resist adding one. Auto-fix is a later plan.
2. **`evalAssert` exhaustiveness throw** is defensive for future JSON-loaded rules with an unknown predicate; with the typed `RuleAssert` union it is unreachable from TS callers. Keep it.
3. **No `priority` field** — for assert-only, rule order does not change the violation SET (only its listing order, which is deterministic). Adding priority now is YAGNI; it belongs with mutate + Plan 8 conflict resolution.
4. **Not wired into the builder/routes** — Plan 4 is the pure engine. Integration (running `applySkillRules` after `buildColdStart`/`applyMutation`, surfacing violations to the UI/CI) is a later plan. Do not modify Plan 3's builder.
5. **vitest stays `^3.2.4`.**

---

**Plan end.** Ready for execution.
