# Plan 8 — verify-rules CLI + compiler-invariant CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Build the **compiler-invariant CI layer** (spec §6.12): a `verify-rules` CLI (rule-schema validation + conflict detection + dead-rule detection), extend `verify-ast` to also enforce active rules ("AST must pass all active rules"), wire both into the git pre-commit hook, and add a Gitea Action that runs the invariant checks + test suites on PR/push to `main`. Fully deterministic + headless.

**Architecture:** Pure rule-validation helpers in `@designbridge/ast` (`src/skill/`): `validateRuleShape(rule)`, `detectRuleConflicts(rules)`, `detectDeadRules(rules, registry)`. A new `verify-rules` CLI (`src/bin/verify-rules.ts`) loads a `*.rules.json` (array of `SkillRule`), runs the three checks, exits non-zero on problems. `verify-ast` is extended to also run `CORE_RULES` via `applySkillRules` and fail on `error`-severity violations. The husky pre-commit hook gains a `verify-rules` pass on staged `*.rules.json`. A `.gitea/workflows/verify.yaml` runs `pnpm -r test` + the invariant CLIs on PR/push to `main` (no deploy).

**Tech Stack:** TS 5.6 strict, Vitest 3.2.4, `@designbridge/ast` (Plan 4 `SkillRule`/`applySkillRules`/`CORE_RULES` + `BASE_COMPONENTS`). No new deps.

**Spec:** §4.4, §6.12. Builds on Plan 4 (rule schema/engine) + Plan 1 (verify-ast CLI + hook).

**Scope boundary (out of plan):** NO AI skill-authoring flow (natural-language → JSON rules) — deferred to **8b** (it's an AI/server flow like Plan 3, and needs the dual-representation skill files). NO `verify-skill-pair` (`.skill.md`↔`.rules.json` id mapping) — no such paired files exist yet; deferred to 8b with skill authoring. NO change to the existing `docker-build.yaml`.

---

## File Structure
```
packages/ast/src/skill/
  ruleChecks.ts              ← validateRuleShape / detectRuleConflicts / detectDeadRules
packages/ast/src/bin/
  verify-rules.ts            ← CLI: validate a *.rules.json
  verify-ast.ts              ← MODIFY: + enforce CORE_Rules (fail on error violations)
packages/ast/src/index.ts    ← + re-export the rule-check helpers
packages/ast/src/__tests__/
  ruleChecks.test.ts
  verifyRules.test.ts        ← CLI fixture tests
  fixtures/valid.rules.json, invalid-shape.rules.json, conflict.rules.json, dead.rules.json
packages/ast/package.json    ← + "verify-rules" bin
.husky/pre-commit            ← MODIFY: + verify-rules on staged *.rules.json
.gitea/workflows/verify.yaml ← NEW: test + invariant checks on PR/push to main
```

---

## Phase 1 — rule-check helpers

### Task 1: `ruleChecks.ts`

**Files:** Create `packages/ast/src/skill/ruleChecks.ts` + `__tests__/ruleChecks.test.ts`.

- [ ] **Step 1: failing test**

```typescript
// packages/ast/src/__tests__/ruleChecks.test.ts
import { describe, it, expect } from 'vitest';
import { validateRuleShape, detectRuleConflicts, detectDeadRules } from '../skill/ruleChecks';
import { BASE_COMPONENTS } from '../index';
import type { SkillRule } from '../skill/rule';

const ok: SkillRule = { id: 'r.ok', severity: 'error', when: { type: 'Form' }, assert: { hasDescendantOfType: 'Button' }, message: 'm' };

describe('validateRuleShape', () => {
  it('accepts a well-formed rule', () => { expect(validateRuleShape(ok)).toEqual([]); });
  it('flags missing id / bad severity / empty when.type / no assert / empty message', () => {
    expect(validateRuleShape({ ...ok, id: '' }).length).toBeGreaterThan(0);
    expect(validateRuleShape({ ...ok, severity: 'fatal' as never }).length).toBeGreaterThan(0);
    expect(validateRuleShape({ ...ok, when: { type: '' } }).length).toBeGreaterThan(0);
    expect(validateRuleShape({ ...ok, assert: {} as never }).length).toBeGreaterThan(0);
    expect(validateRuleShape({ ...ok, message: '' }).length).toBeGreaterThan(0);
  });
  it('flags an assert with more than one predicate key', () => {
    expect(validateRuleShape({ ...ok, assert: { hasDescendantOfType: 'X', hasChildOfType: 'Y' } as never }).length).toBeGreaterThan(0);
  });
});

describe('detectRuleConflicts', () => {
  it('flags duplicate rule ids', () => {
    expect(detectRuleConflicts([ok, { ...ok }]).some(c => /duplicate/i.test(c))).toBe(true);
  });
  it('flags same-selector has vs missing of the same type', () => {
    const a: SkillRule = { id: 'r.a', severity: 'error', when: { type: 'Form' }, assert: { hasDescendantOfType: 'Button' }, message: 'm' };
    const b: SkillRule = { id: 'r.b', severity: 'error', when: { type: 'Form' }, assert: { missingDescendantOfType: 'Button' }, message: 'm' };
    expect(detectRuleConflicts([a, b]).some(c => /conflict/i.test(c))).toBe(true);
  });
  it('no conflict for different selectors', () => {
    const a: SkillRule = { id: 'r.a', severity: 'error', when: { type: 'Form' }, assert: { hasDescendantOfType: 'Button' }, message: 'm' };
    const b: SkillRule = { id: 'r.b', severity: 'error', when: { type: 'Card' }, assert: { missingDescendantOfType: 'Button' }, message: 'm' };
    expect(detectRuleConflicts([a, b])).toEqual([]);
  });
});

describe('detectDeadRules', () => {
  it('flags a rule whose when.type is not a registered component', () => {
    const dead: SkillRule = { id: 'r.dead', severity: 'error', when: { type: 'NotAType' }, assert: { hasChildOfType: 'Button' }, message: 'm' };
    expect(detectDeadRules([dead], BASE_COMPONENTS).some(c => /unknown component type "NotAType"/.test(c))).toBe(true);
  });
  it('flags an assert referencing an unregistered component type', () => {
    const dead: SkillRule = { id: 'r.d2', severity: 'error', when: { type: 'Form' }, assert: { hasDescendantOfType: 'Ghost' }, message: 'm' };
    expect(detectDeadRules([dead], BASE_COMPONENTS).some(c => /Ghost/.test(c))).toBe(true);
  });
  it('no dead flag for registered types', () => {
    expect(detectDeadRules([ok], BASE_COMPONENTS)).toEqual([]);
  });
});
```

- [ ] **Step 2: run → FAIL.** `pnpm --filter @designbridge/ast test`
- [ ] **Step 3: implement `ruleChecks.ts`**

```typescript
// packages/ast/src/skill/ruleChecks.ts
import type { SkillRule, RuleAssert } from './rule';
import type { ComponentRegistry } from '../registry/componentSpec';

const ASSERT_KEYS = ['hasDescendantOfType', 'missingDescendantOfType', 'hasChildOfType', 'requiredPropPresent'] as const;

function assertKeys(a: RuleAssert | Record<string, unknown>): string[] {
  return Object.keys(a ?? {}).filter(k => (ASSERT_KEYS as readonly string[]).includes(k));
}

/** Structural validation of one rule. Returns a list of problems (empty = valid). */
export function validateRuleShape(rule: SkillRule): string[] {
  const e: string[] = [];
  if (!rule || typeof rule !== 'object') return ['rule is not an object'];
  if (typeof rule.id !== 'string' || rule.id.trim() === '') e.push('id must be a non-empty string');
  if (rule.severity !== 'error' && rule.severity !== 'warning') e.push(`severity must be "error" | "warning", got ${JSON.stringify(rule.severity)}`);
  if (!rule.when || typeof rule.when.type !== 'string' || rule.when.type.trim() === '') e.push('when.type must be a non-empty string');
  const keys = assertKeys(rule.assert as RuleAssert);
  if (keys.length !== 1) e.push(`assert must have exactly one predicate key (one of ${ASSERT_KEYS.join('/')}), got [${Object.keys(rule.assert ?? {}).join(', ')}]`);
  else {
    const v = (rule.assert as Record<string, unknown>)[keys[0]];
    if (typeof v !== 'string' || v.trim() === '') e.push(`assert.${keys[0]} must be a non-empty string`);
  }
  if (typeof rule.message !== 'string' || rule.message.trim() === '') e.push('message must be a non-empty string');
  return e;
}

function selectorKey(rule: SkillRule): string {
  return `${rule.when.type}|${JSON.stringify(rule.when.propEquals ?? {})}`;
}
function assertOf(rule: SkillRule): { key: string; value: string } {
  const k = assertKeys(rule.assert)[0] ?? '';
  return { key: k, value: String((rule.assert as Record<string, unknown>)[k] ?? '') };
}

/** Detect duplicate ids + contradictory same-selector asserts. */
export function detectRuleConflicts(rules: SkillRule[]): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  rules.forEach((r, i) => {
    if (seen.has(r.id)) out.push(`duplicate rule id "${r.id}" (rules ${seen.get(r.id)} and ${i})`);
    else seen.set(r.id, i);
  });
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      if (selectorKey(rules[i]) !== selectorKey(rules[j])) continue;
      const a = assertOf(rules[i]); const b = assertOf(rules[j]);
      const contradictory =
        (a.key === 'hasDescendantOfType' && b.key === 'missingDescendantOfType' && a.value === b.value) ||
        (a.key === 'missingDescendantOfType' && b.key === 'hasDescendantOfType' && a.value === b.value);
      if (contradictory) out.push(`conflict: rules "${rules[i].id}" and "${rules[j].id}" assert has/missing descendant "${a.value}" on the same selector "${rules[i].when.type}"`);
    }
  }
  return out;
}

/** Detect rules that can never meaningfully apply: unregistered when.type or assert target type. */
export function detectDeadRules(rules: SkillRule[], registry: ComponentRegistry): string[] {
  const out: string[] = [];
  const typeAsserts = new Set(['hasDescendantOfType', 'missingDescendantOfType', 'hasChildOfType']);
  for (const r of rules) {
    if (!registry[r.when.type]) out.push(`dead rule "${r.id}": unknown component type "${r.when.type}" in when`);
    const { key, value } = assertOf(r);
    if (typeAsserts.has(key) && value && !registry[value]) out.push(`dead rule "${r.id}": assert.${key} references unknown component type "${value}"`);
  }
  return out;
}
```

- [ ] **Step 4: run → PASS.**
- [ ] **Step 5: re-export from index.ts** (`export { validateRuleShape, detectRuleConflicts, detectDeadRules } from './skill/ruleChecks';`) + build.
- [ ] **Step 6: commit** `feat(ast): add rule-check helpers (shape/conflict/dead-rule detection)`.

---

## Phase 2 — CLIs

### Task 2: `verify-rules` CLI + extend `verify-ast`

**Files:** Create `packages/ast/src/bin/verify-rules.ts`; modify `packages/ast/src/bin/verify-ast.ts`; `packages/ast/package.json` (+ bin); fixtures + `verifyRules.test.ts`.

- [ ] **Step 1: fixtures** under `packages/ast/src/__tests__/fixtures/`:
  - `valid.rules.json`: `[{"id":"r.ok","severity":"error","when":{"type":"Form"},"assert":{"hasDescendantOfType":"Button"},"message":"A Form must contain a Button."}]`
  - `invalid-shape.rules.json`: `[{"id":"","severity":"oops","when":{"type":""},"assert":{},"message":""}]`
  - `conflict.rules.json`: two rules, same `when:{type:Form}`, one `hasDescendantOfType:Button`, one `missingDescendantOfType:Button`.
  - `dead.rules.json`: `[{"id":"r.d","severity":"error","when":{"type":"Nope"},"assert":{"hasChildOfType":"Button"},"message":"m"}]`

- [ ] **Step 2: failing test** `verifyRules.test.ts` (execSync via `pnpm exec tsx`, like verifyAst.test.ts):
```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
const cli = resolve(__dirname, '../bin/verify-rules.ts');
const fx = resolve(__dirname, 'fixtures');
const run = (f: string) => execSync(`pnpm exec tsx "${cli}" "${resolve(fx, f)}"`, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });

describe('verify-rules CLI', () => {
  it('exits 0 on valid rules', () => { expect(run('valid.rules.json')).toMatch(/OK/); }, 30000);
  it('exits non-zero on shape errors', () => { expect(() => run('invalid-shape.rules.json')).toThrow(); }, 30000);
  it('exits non-zero on conflicts', () => { expect(() => run('conflict.rules.json')).toThrow(); }, 30000);
  it('exits non-zero on dead rules', () => { expect(() => run('dead.rules.json')).toThrow(); }, 30000);
});
```

- [ ] **Step 3: implement `verify-rules.ts`**
```typescript
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateRuleShape, detectRuleConflicts, detectDeadRules } from '../skill/ruleChecks';
import { BASE_COMPONENTS } from '../registry/baseComponents';
import type { SkillRule } from '../skill/rule';

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) { console.error('Usage: verify-rules <file.rules.json> [...]'); process.exit(2); }
  let allOk = true;
  for (const fileArg of args) {
    let rules: SkillRule[];
    try { rules = JSON.parse(readFileSync(resolve(process.cwd(), fileArg), 'utf8')); }
    catch (err) { console.error(`FAIL ${fileArg} — invalid JSON: ${(err as Error).message}`); allOk = false; continue; }
    if (!Array.isArray(rules)) { console.error(`FAIL ${fileArg} — expected an array of rules`); allOk = false; continue; }
    const problems: string[] = [];
    rules.forEach((r, i) => validateRuleShape(r).forEach(p => problems.push(`rule[${i}]: ${p}`)));
    problems.push(...detectRuleConflicts(rules));
    problems.push(...detectDeadRules(rules, BASE_COMPONENTS));
    if (problems.length === 0) console.log(`OK   ${fileArg} (${rules.length} rules)`);
    else { allOk = false; console.error(`FAIL ${fileArg}`); problems.forEach(p => console.error(`     ${p}`)); }
  }
  process.exit(allOk ? 0 : 1);
}
main();
```

- [ ] **Step 4: extend `verify-ast.ts`** — after the AST validates, also run `applySkillRules(parsed, CORE_RULES)` and fail (set ok=false + print) if any `error`-severity violation. Import `applySkillRules`, `hasErrorViolations`, `CORE_RULES` from `../index` (or their modules). Keep the existing schema-validation behavior; add the rule pass only for ASTs that pass schema. (Existing fixtures: `valid.ast.json` is a Container root → no Form → no CORE_RULES violation → still OK.)

- [ ] **Step 5: `package.json` bin** — add `"verify-rules": "./dist/cjs/bin/verify-rules.js"` alongside `verify-ast`.

- [ ] **Step 6: run tests + build** — `pnpm --filter @designbridge/ast test` (verify-rules 4 + existing) ; `pnpm --filter @designbridge/ast build` (confirm `dist/cjs/bin/verify-rules.js` emitted).

- [ ] **Step 7: commit** `feat(ast): add verify-rules CLI + enforce active rules in verify-ast`.

---

## Phase 3 — hook + CI Action

### Task 3: pre-commit hook + Gitea verify workflow

**Files:** modify `.husky/pre-commit`; create `.gitea/workflows/verify.yaml`.

- [ ] **Step 1: extend `.husky/pre-commit`** — after the `*.ast.json` block, add a `*.rules.json` block:
```sh
STAGED_RULES=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.rules\.json$' || true)
if [ -n "$STAGED_RULES" ]; then
  echo "[pre-commit] running verify-rules on staged *.rules.json files..."
  # shellcheck disable=SC2086
  pnpm exec tsx ./packages/ast/src/bin/verify-rules.ts $STAGED_RULES
fi
```

- [ ] **Step 2: create `.gitea/workflows/verify.yaml`** (test + invariant checks, NO deploy):
```yaml
name: Verify (tests + compiler invariants)
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: corepack enable && corepack prepare pnpm@9.15.0 --activate
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @designbridge/ast build
      - run: pnpm --filter @designbridge/codegen build
      - name: Unit/integration tests
        run: |
          pnpm --filter @designbridge/ast test
          pnpm --filter @designbridge/codegen test
          pnpm --filter client test
      - name: Compiler-invariant CLIs
        run: |
          pnpm exec tsx packages/ast/src/bin/verify-ast.ts packages/ast/src/__tests__/fixtures/valid.ast.json
          pnpm exec tsx packages/ast/src/bin/verify-rules.ts packages/ast/src/__tests__/fixtures/valid.rules.json
```
> NOTE: server tests have a pre-existing unrelated failure (`htmlSanitizer`); this workflow runs ast/codegen/client tests (all green) + the invariant CLIs. Add `pnpm --filter server test` later once the legacy red is fixed. Uses the same `INTERNAL_GIT_MIRROR`-free path; if ai-core fetch fails on the runner, the install step would need the mirror arg like docker-build — but `verify` only needs ast/codegen/client which don't depend on ai-core, so a future refinement may scope the install. Keep simple for now; if install fails on ai-core, scope to `pnpm --filter @designbridge/ast... install` or add the mirror.

- [ ] **Step 3: smoke the hook locally** — stage a bad `*.rules.json` (copy `dead.rules.json` to repo root as `x.rules.json`), run `sh .husky/pre-commit` directly → expect FAIL + non-zero; unstage + rm. (Do NOT commit the temp file.)

- [ ] **Step 4: commit** `feat(ci): verify-rules pre-commit hook + Gitea verify workflow`.

---

## Phase 4 — Verify
- [ ] `pnpm --filter @designbridge/ast build && pnpm --filter @designbridge/ast test` → green; `dist/cjs/bin/verify-rules.js` exists.
- [ ] Live CLI smoke: `pnpm exec tsx packages/ast/src/bin/verify-rules.ts packages/ast/src/__tests__/fixtures/valid.rules.json` → `OK`; `... dead.rules.json` → non-zero + dead-rule message.
- [ ] `verify-ast` on `valid.ast.json` still OK; on a Form-without-Button AST → fails (error violation).
- [ ] No server/client app-code changes (only ast + hook + new workflow).

## Acceptance Criteria
- [ ] `validateRuleShape`/`detectRuleConflicts`/`detectDeadRules` implemented + unit-tested; re-exported.
- [ ] `verify-rules` CLI validates a `*.rules.json` (shape + conflict + dead); exits non-zero on any problem; bin registered + emitted.
- [ ] `verify-ast` additionally enforces `CORE_RULES` (fails on error-severity violations) without breaking existing fixtures.
- [ ] pre-commit hook runs verify-rules on staged `*.rules.json`; `.gitea/workflows/verify.yaml` runs tests + invariant CLIs on PR/push to main (no deploy).
- [ ] ast suite green; both CLIs smoke-pass; per-task `feat(ast)`/`feat(ci)` commits.

## Compiler Invariant (held)
> Rules are validated as data (shape + conflict + dead-rule) before they can constrain anything, and `verify-ast` refuses an AST that fails any active error-rule — enforcing §6.12 "AST 必過 all active rules" deterministically in the hook + CI.

## Risks / Notes
1. verify-rules CLI lives under `src/bin/` (compiles to `dist/cjs/bin/`), matching verify-ast (Plan 1 path layout). Tests use `pnpm exec tsx` (not npx) per Plan 1.
2. Extending verify-ast: keep schema-validation first; only run rules on schema-valid ASTs. Don't break the 3 existing verifyAst fixtures.
3. `verify.yaml` install may hit ai-core network on the Gitea runner; ast/codegen/client don't need ai-core, so if it fails, scope the install or add the mirror arg (see NOTE). Don't block the plan on it — the CLIs + ast/codegen/client tests are the core.
4. vitest `^3.2.4`.

---

**Plan end.**
