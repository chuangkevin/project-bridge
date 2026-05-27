# Handover — M1 AI UI Compiler rebuild (2026-05-27)

**Branch:** `feat/ai-ui-compiler-ast` (60+ commits, pushed to both remotes: Gitea `origin` + GitHub). Not merged to `main`.
**Spec:** `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md`
**Plans:** `docs/superpowers/plans/2026-05-26-plan-01-…` through `2026-05-27-plan-06b-…`

## What this is

DesignBridge is being rebuilt from a chat-driven UI generator into an **AI UI Compiler**: unstructured input → deterministic dual-IR pipeline → Vue 3 + Tailwind code, with skill rules constraining the AST at build time. **AI only proposes; the AST is truth; codegen is mechanical.**

## Pipeline (all built + tested this milestone)

```
requirement/PDF → parseInput (Ingestion AST, deterministic, Plan 2)
  → buildColdStart (AI → Semantic UI AST, validated + repair loop, Plan 3)
  → applySkillRules (assert constraints → violations, Plan 4)
  → renderVue (Vue 3 + Tailwind SFC, Plan 5)
exposed at POST /api/projects/:id/compile (+ /compile/mutate for edits, Plan 6a)
client: 4-column CompilerWorkspace consumes it (Plan 6b)
```

## Packages / layers

| Where | What | Tests |
|---|---|---|
| `packages/ast` (`@designbridge/ast`) | Semantic UI AST types, `validateAst`, 7 mutation primitives + `applyMutationOps`, 20-component `BASE_COMPONENTS`, query/diff/serialize, Ingestion AST types + guards, Skill rule schema + `applySkillRules` + `CORE_RULES`, `verify-ast` CLI | 95 |
| `packages/codegen` (`@designbridge/codegen`) | `renderVue(ast)` → Vue SFC (mock, visual-only); escaping + Tailwind arbitrary-value mapping | 40 |
| `packages/server/src/ingestion` | `parseRequirement`, `parsePdf`, `parseInput` (deterministic, no AI) | 12 |
| `packages/server/src/semantic` | `buildColdStart`, `applyMutation`, `runRepairLoop`, `defaultGenerate` (injectable), `describeComponentCatalog` | 19 |
| `packages/server/src/services/compile.ts` + `routes/compile.ts` | pipeline composition + HTTP route | 8 |
| `packages/client/src/lib` + `stores` + `components/compiler` + `pages/CompilerWorkspace.tsx` | API client, `previewHtml`, `useCompilerStore`, 4-column UI (ArtifactRail/CompilerChat/PreviewPane iframe/InspectorPane/StageTabs) | 34 |

`/project/:id` now renders `CompilerWorkspace`. The old mode UI is **unreachable dead code** (routed away, NOT deleted).

## Key decisions / gotchas (see also memory `ai-ui-compiler-plan1-notes`)

- **nanoid pinned to v3** (CJS-safe); **vitest pinned to ^3.2.4** (vite 5 incompat) across all packages.
- **ai-core has no native tool-calling** → AI mutation "tool calls" are AI-emitted JSON `MutationOp[]` applied through the pure primitives.
- **Preview** = sandboxed `<iframe>` with the generated `<template>` markup + **Tailwind Play CDN** (no Tailwind added to the React client). Mock output is static (no `<script>`); Vue-runtime interactivity is M2.
- **AST is truth client-side too**: edits go AST → server (`/mutate`) → new validated AST + Vue. The store never edits Vue directly.
- `core.hooksPath` is set to `.husky/_` (pre-commit runs `verify-ast` on staged `*.ast.json` only).
- Pre-existing **unrelated** failing test: `htmlSanitizer.test.ts > injectConventionColors` (legacy code, slated for deletion).

## M1 — what's DONE vs REMAINING

**Done & verified (automated):** Plans 1-5, 6a, 6b Phases 1-2. All package builds green; server build green; client build green (bundle dropped ~1254kB→387kB after the route swap). End-to-end pipeline smoke produced a correct Vue SFC.

**Remaining for M1 sign-off (USER-GATED):**
1. **Delete old mode UI** — ⚠️ `WorkspaceHeader.tsx` + `DesignContextPanel.tsx` have **uncommitted changes**; commit/stash them first, THEN delete: ModeRail, DesignPanel, StyleTweakerPanel, ArchitectureTab, ChatPanel, PreviewArea, WorkspacePage, ConsultantContextPanel/ArchContextPanel/ContextPanel (audit imports before each delete; keep the build green). Required by the M1 DoD ("舊系統下台").
2. **Browser verification** — `pnpm dev:server` + `pnpm dev:client` with an AI provider configured; verify: requirement → preview renders → chat-edit → re-renders. The UI was built without browser feedback, so expect a round of visual/wiring fixes.
3. **E2E** — `packages/e2e/tests/e2e/compiler-journey.spec.ts` (authored, route-mocked for determinism) needs a local run/tune.

## Next milestones (not started)
- **Plan 7**: hybrid persistence (file `*.ast.json` + sqlite), git versioning, PDF-upload wiring, migrate old flow.
- **Plan 8**: `verify-rules` CLI + skill authoring + `.skill.md`↔`.rules.json` pairing + CI Action.
- **Plan 9 (M2)**: Production backend (Composition API + state + events + API binding stub).
- **Plans 10-11**: design-intelligence/URL-crawl rules, plugin slots, collaboration/export/telemetry.
