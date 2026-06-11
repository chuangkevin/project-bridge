# Design Quality Root-Cause Fixes + Replication + Component Library + Liquid Glass UI

- **Date**: 2026-06-11
- **Status**: Approved (user confirmed all sections + 方案一 dual-track editing)
- **Background**: 2026-06-11 root-cause audit found six structural gaps that make design-mode
  output bad even on OpenCode + GPT 5.5. See memory `project_design_quality_root_causes`.
  User additionally requires: image/design-mockup replication, incremental design on existing
  pages, a component library with verbatim reuse, automatic domain-skill selection, and an
  iOS 27 liquid-glass restyle of the DesignBridge client itself.

## Goals

1. The AI always sees the current design source when asked to modify it.
2. Provider/model actually serving each turn is visible; cross-model fallback can be disabled.
3. Users can paste an image / design mockup / URL and choose 照抄 / 只取風格 / 只當參考.
4. Designs can be edited incrementally (element-scoped) without regenerating whole pages.
5. Refined elements can be saved as library components and are reused **verbatim** — never re-guessed.
6. Relevant domain skills are auto-selected and injected into design/consult generation.
7. The DesignBridge client UI adopts iOS 27 liquid-glass aesthetics.

## Non-Goals (future work)

- Post-generation screenshot self-critique iteration loop.
- Splitting multi-page sites into per-page artifacts.
- Skill auto-learning / authoring from conversations.

## §1 Root-cause fixes (foundation)

### 1a Generation context
- `buildSystemPrompt` (design mode): include the **full source** of the active artifact
  (`## Active artifact source` section), not just its ID.
- Size guard: when payload > 60 KB, include a structural summary (page list via `v-if`
  branches, nav labels, component names) + an explicit warning that full source was elided.
- Recent-conversation turns continue to strip code blocks (the artifact source section is the
  single source of truth — avoids N stale copies).

### 1b Fallback visibility + control
- `callProvider` switches to selection-aware calls (`generateWithSelection` /
  selection-reporting stream wrapper) so the actual `{provider, model, credentialRef}` serving
  the call is captured.
- Persist into existing `turns.model_used`; emit SSE `meta` event
  `{provider, model, fallback: boolean}`; `TurnBubble` renders a badge — normal grey for the
  preferred route, orange `(fallback)` when serving provider/model differs from request.
- New setting `disallow_model_fallback` (settings table + Providers tab toggle). When ON,
  route policy is built with `allowCrossModelFallback: false` — OpenCode failures surface as
  errors instead of silently degrading to `gemini-2.5-flash`.
- Fix the wrong doc-comment at `provider.ts:338` (claims router throws; policy says otherwise).

### 1c Stale vision comments
- ai-core v3.4.1 OpenCode adapter **supports** multimodal input (verified in dist:
  `sendMessage` converts `params.images` via `imagePartToOpenCode`). Update stale comments in
  `provider.ts` / `designExtractor.ts`; keep `geminiVisionQuery` as fallback path.

## §2 Replication pipeline (照抄)

- **Intake detection**: Composer detects image attachments or URLs in the message → renders a
  fixed option bar: **照抄 / 只取風格 / 只當參考** (+ destination: 新 artifact / 加進目前頁面
  選定區域). In parallel, the AI confirms intent in its reply when the user ignores the bar.
- **New `replicate` generation mode** in `callProvider`: does NOT inject the frontend-design
  skill (no creativity push); system prompt demands pixel-faithful reconstruction; the source
  image is attached to the generation call when the serving provider supports multimodal
  (OpenCode GPT 5.5 primary, `geminiVisionQuery` fallback produces a structured spec instead).
- **URL replication**: existing Playwright crawler (cleaned HTML + computed CSS) feeds the
  source directly into the replicate prompt → Vue SFC.
- Replication into an existing page routes through the element track (§3) with the selected
  region as the insertion anchor.

## §3 Dual-track incremental editing (方案一)

- **New service `sfcSurgeon.ts`**: parse SFC `<template>` with an HTML parser
  (htmlparser2/parse5 family), supporting subtree **locate / extract / replace** with
  round-trip fidelity. Shared by element editing, save-as-component, and component expansion.
- **Element track**: preview iframe element selection (Phase C, existing) → element path →
  server extracts the subtree + relevant styles + design tokens → AI receives ONLY that
  context and returns the updated subtree → parsed, validated (single root), spliced back in
  place. Untouched content cannot change. Parse/validation failure → automatic downgrade to
  page track.
- **Page track**: no element selected → full SFC source in context + strict
  preserve-unchanged instruction → full regeneration.

## §4 Component library

- **Schema** `components` table: `id, scope ('project'|'global'), project_id (nullable),
  name (unique per scope), description, template, style, tags, source
  ('artifact'|'crawl'|'replicate'), version, created_at, updated_at`.
  Existing crawled components (if present post-M1) migrate into this table.
- **沉澱**: preview element selection → 「存為元件」dialog (name, description, scope) →
  `sfcSurgeon` extraction → insert. Whole artifact can also be saved as a component.
- **重用 (verbatim)**: design/replicate prompts carry a component index (name + description).
  The AI references components ONLY as `<lib-component name="..."/>` placeholders; the server
  post-processes parsed artifacts and expands placeholders with the stored source **verbatim**.
  Unknown component name → explicit error event (no silent guessing).
- **Refinement**: editing a component runs the element track against its snippet; version +1.

## §5 Automatic domain-skill selection

- Before design/consult generation: lightweight selector call — user request + full skill
  index (names + descriptions, incl. project skills) → JSON list of 0–3 relevant skill names
  → inject their bodies (8 K chars per skill, 20 K total cap).
- Skipped when a slash-forced skill exists. Selector failure → generate without injection,
  log the failure (never block generation).
- Injected skills recorded in `turns.skills_used`; UI badge shows them.

## §6 iOS 27 liquid-glass client restyle

- Scope: the DesignBridge client's own UI (TopBar, LeftRail, RightInspector, chat, settings,
  modals, Projects page). Generated-design aesthetics remain governed by global design style —
  the two do not mix.
- Implementation: rewrite `src/styles/theme.css` token layer + add `.glass-*` utility classes;
  apply across the 5 feature CSS files. Material: translucent layered surfaces,
  `backdrop-filter: blur() saturate()`, specular edge highlights, large continuous-curve
  radii, floating capsule toolbars, layered depth shadows, spring-curve micro-transitions.
- Pure CSS, zero new dependencies. `@supports` fallback to solid translucent surfaces.
  Light + dark, default dark. All copy stays 繁體中文 (existing hard rule).

## §7 Testing & verification

- Unit: `sfcSurgeon` locate/extract/replace round-trips; component expansion (incl. unknown
  name error); skill-selector downgrade; fallback policy construction.
- Route tests: replicate flow, component CRUD, SSE `meta` event, element-track endpoint.
- E2E additions: replication option bar, save-as-component, verbatim expansion, provider badge.
- Final: run the app and verify the liquid-glass UI with real Playwright screenshots
  (not just green tests).

## §8 Implementation phases (each phase: tests pass → commit; push once at the end)

1. Foundation (§1a/1b/1c)
2. `sfcSurgeon` + dual-track editing (§3)
3. Component library (§4)
4. Replication pipeline (§2)
5. Domain-skill selector (§5)
6. Liquid-glass restyle (§6)

## Key decisions log

- 方案一 chosen over full-regen-only (no hard preservation guarantee) and AI-patch-ops
  (unreliable model output format).
- Replication intake uses UI option bar AND AI confirmation (雙保險, user choice).
- Component reuse is placeholder + server-side verbatim expansion — the AI never retypes
  component source.
- Full (automatic) domain-skill selection included this round, per user.
