# Plan 10 — Design Intelligence (Mirror + AST + Theme) Design Spec

> Status: **Design (brainstorm output)** — not yet an implementation plan.
> Produced via `superpowers:brainstorming` on 2026-05-29.
> Builds on AI UI Compiler spec `docs/superpowers/specs/2026-05-26-ai-ui-compiler-redesign.md` §6.3.
> Next step: `superpowers:writing-plans` will translate this into a stepped implementation plan.

## 0. TL;DR

Plan 10 lets the user paste **a URL or a screenshot** into chat and have DesignBridge *reproduce* the reference page, in one of two modes:

- **Mirror mode (1:1, read-only)** — Playwright crawls the page, the raw HTML + CSS + assets are stored as a sidecar artifact, and the preview pane serves the original layout verbatim. Not editable.
- **AST mode (~95%, editable)** — the same crawl feeds the existing `buildColdStart` semantic builder; the AI translates DOM → `SemanticUIAst`, and the result joins the project's normal AST artifacts (chat-editable, Vue/Tailwind output). At the same time, design tokens (colors / fonts / radius / shadow) are extracted to a project-level `theme.json` and the user is prompted to merge them in.

The dual-mode reconciles a hard contradiction: pixel-perfect reproduction and AST-based editing are not simultaneously achievable with one artifact, so each artifact picks a side. A "Mirror → AST upgrade" affordance lets a Mirror be promoted to an AST artifact later (the Mirror remains alongside).

Plan 10 **does not** extend `SkillRule.assert` with style predicates (rule extraction was on the table during brainstorming; deferred to Plan 11+). Plan 10 **does not** support screenshot input until **Plan 10-pre** has restored multimodal capability in the provider layer.

---

## 1. Problem and goal

### 1.1 Problem

The user wants to point DesignBridge at an existing web page (by URL or screenshot) and have the system reproduce that page in their project. The current `AI UI Compiler` pipeline only ingests text requirements and PDFs (Plan 2); the `WebpageIngestion` and `ScreenshotIngestion` variants in `packages/ast/src/ingestion/ingestionAst.ts` are declared but unimplemented. The legacy `websiteCrawler.ts` (356 LoC, Plan 6.x of the old system) still works but is wired to the old design-token / component-library flows, not to the new compiler.

### 1.2 Goal

A user can:

1. Paste a URL into the CompilerWorkspace chat.
2. Pick **Mirror** or **AST** mode via a small intent card.
3. Get back a new artifact in the artifact rail:
   - Mirror — locked icon, preview = original layout verbatim.
   - AST — same affordances as today's artifacts, chat-editable, Vue/Tailwind generated; project `theme.json` is updated (after a merge confirmation).
4. Upgrade a Mirror to an AST artifact via one button (both artifacts coexist).
5. Once Plan 10-pre lands, pass a **screenshot** instead of a URL and get the same flow (with vision-based site identification → falls back to pure visual reproduction if unidentifiable).

### 1.3 Non-goals (Plan 10)

- Extending `SkillRule.assert` with token/style predicates (deferred to Plan 11+).
- Multi-URL batch crawl. One source per compile call.
- Crawling auth-walled / cookie-gated pages.
- Capturing runtime JS interactions; Mirror is a static snapshot, `<script>` is stripped.
- Editing Mirror artifacts in place.
- Cross-project sharing of mirrors / themes.
- CDN / image-hosting promotion of mirror assets — local filesystem only.
- Retroactively applying a newly extracted theme to existing AST artifacts. `theme.json` only affects compiles after the merge.

---

## 2. User journey

### 2.1 Entry point

CompilerWorkspace `CompilerChat.tsx`. Three input forms supported in the same chat box:

| Input | How detected | Default mode |
|---|---|---|
| Pure text requirement | No URL, no image attachment | Pure-text (existing flow, unchanged) |
| URL inside text | Regex match `https?://…` | Show intent card |
| Pasted / dragged image | File attachment on message | Show intent card (requires Plan 10-pre) |

If the message text contains **mirror-leaning phrases** (`照著抄`, `完整複製`, `仿這個`, `1:1`, `pixel-perfect`), the intent card pre-selects Mirror. **AST-leaning phrases** (`參考`, `像這個風格`, `套這個感`, `inspired by`) pre-select AST. Otherwise the card opens with no pre-selection. The user can override before submitting.

### 2.2 Intent card

A modal-less inline card appears in chat:

```
[ thumbnail of detected URL / screenshot ]
Detected: https://stripe.com/pricing

Reproduce as:
  ( ) Mirror — 1:1, not editable
  (•) AST    — ~95%, chat-editable
  
[Cancel]                              [Confirm]
```

Confirm submits the compile request with `mode` and `source`.

### 2.3 Compile branches

| `mode` | `source` | Server behavior |
|---|---|---|
| `pure-text` | none | Existing `buildColdStart` flow. No change. |
| `mirror` | URL | Crawl → asset localization → write sidecar → return Mirror artifact metadata. |
| `mirror` | image | Vision identifies the site → if identified, run as `mirror + url`; if not, return `{ ok: false, reason: 'unidentified_screenshot', hint: 'paste a URL' }`. |
| `ast` | URL | Crawl → AI translates DOM → `SemanticUIAst` (existing repair loop) → `applySkillRules` → `renderVue`. In parallel, `themeExtractor` produces a token proposal → server returns artifact + theme proposal; client opens `ThemeMergeDialog`. |
| `ast` | image | Vision sees image → builds `SemanticUIAst` directly (no crawl) → same back half as `ast + url`. Theme extraction is best-effort (vision-derived). |

### 2.4 Artifact rail

- AST artifacts: unchanged from today.
- Mirror artifacts: same rail row, but with a 🔒 icon, tooltip "Mirror — read-only". Clicking opens PreviewPane in Mirror mode (iframe pointing at `GET /api/projects/:id/mirrors/:artifactId/page.html`).
- Mirror artifact detail panel adds: "Upgrade to AST" button. Click → server re-runs the compile with `mode: 'ast'` reusing the cached `WebpageIngestion` (no second crawl). New AST artifact appears; original Mirror stays.

### 2.5 Theme merge dialog

After a successful AST-mode compile that produced new theme tokens, the client opens a dialog:

- Left pane: current `theme.json` (palette / typography / radius / shadow).
- Right pane: newly extracted tokens.
- Per-section checkboxes: take new / keep current / merge (union).
- Buttons: Apply / Cancel. Apply writes `theme.json`. Cancel discards.

Subsequent compiles read `theme.json` and codegen consumes the tokens (Tailwind config injection — out of Plan 10 scope to *use* the tokens beyond writing them; consumption wiring is a small follow-up; deciding whether to bundle this into Plan 10 implementation is left to the writing-plans step).

---

## 3. Data model

### 3.1 On-disk layout (additions)

```
projects/<id>/
  artifacts/
    <artifactId>.ast.json         # existing — Semantic UI AST
    <artifactId>.vue              # existing — codegen output
    <artifactId>.mirror.json      # NEW — Mirror metadata pointer
  mirrors/                        # NEW
    <artifactId>/
      page.html                   # original outerHTML, <script> stripped
      styles.css                  # all stylesheets inlined into one file
      assets/                     # downloaded images, fonts, etc.
      screenshot.png              # crawl-time visual snapshot
  theme.json                      # NEW — project-level design tokens
  index.json                      # existing — artifact list (schema bump: artifact.kind adds 'mirror')
```

### 3.2 Mirror artifact JSON (`<artifactId>.mirror.json`)

```jsonc
{
  "kind": "mirror",
  "id": "ar_abc123",
  "sourceUrl": "https://stripe.com/pricing",
  "sourceType": "url",        // or "screenshot" once Plan 10-pre lands
  "crawledAt": "2026-05-29T12:34:56Z",
  "files": {
    "html": "page.html",
    "css": "styles.css",
    "screenshot": "screenshot.png"
  },
  "warnings": [                // populated when asset fetches fail etc.
    { "code": "asset_404", "url": "https://...image.png" }
  ],
  "editable": false
}
```

### 3.3 `theme.json` (project-level)

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-05-29T12:34:56Z",
  "palette": [
    { "name": "primary", "value": "#1A73E8", "source": "https://stripe.com/pricing" }
  ],
  "typography": {
    "primaryFont": "Inter",
    "secondaryFont": null,
    "headings": [{ "tag": "h1", "fontSize": "48px", "fontWeight": "700" }],
    "body": { "fontFamily": "Inter", "fontSize": "16px", "lineHeight": "1.6" }
  },
  "radius": ["4px", "8px", "16px"],
  "shadow": ["0 1px 2px rgba(0,0,0,0.05)", "0 4px 12px rgba(0,0,0,0.1)"]
}
```

### 3.4 `index.json` schema bump

Existing entries gain `kind: 'page' | 'element' | 'mirror'` (already an open enum in Plan 7's design; this just adds a value).

---

## 4. Modules

### 4.1 Server — ingestion

- `packages/server/src/ingestion/parseWebpage.ts` — wraps `services/websiteCrawler.ts` (`crawlWebsite`) and returns a `WebpageIngestion` (already declared in `packages/ast/src/ingestion/ingestionAst.ts`). Adds `<script>` stripping, asset URL extraction, and a typed warning list.
- `packages/server/src/ingestion/parseScreenshot.ts` — wraps the future vision call (Plan 10-pre). Produces a `ScreenshotIngestion`. Until Plan 10-pre lands, this is stubbed to return `{ ok: false, reason: 'vision_unavailable' }`.
- `packages/server/src/ingestion/classifyIntent.ts` — pure deterministic function. Given the chat message text + attachments, returns `{ mode, source }` honoring the keyword pre-selection rules in §2.1. The intent card UI can override what this returns.

### 4.2 Server — services

- `packages/server/src/services/mirrorBuilder.ts` — orchestrates the Mirror artifact build. Inputs: `WebpageIngestion`. Steps:
  1. Strip `<script>` and `<iframe>` from HTML.
  2. Inline all stylesheets into one `styles.css` (already partly done in existing crawler).
  3. Download each `<img src>`, `@font-face url(...)`, and rewrite paths to local `assets/`.
  4. Write sidecar files via `mirrorStore`.
  5. Return Mirror artifact metadata.
- `packages/server/src/services/themeExtractor.ts` — pure function. Inputs: `WebpageIngestion` or `ScreenshotIngestion` (with vision tokens). Output: a `ThemeProposal` shaped like `theme.json` but flagged as "not yet merged".
- `packages/server/src/services/themeMerger.ts` — pure function. Inputs: current `theme.json` + `ThemeProposal` + per-section user choice. Output: merged `theme.json`.

### 4.3 Server — storage

- `packages/server/src/storage/mirrorStore.ts` — file ops for `projects/<id>/mirrors/<artifactId>/`. Mirrors the API of the existing `artifactStore` (Plan 7) — validated paths, traversal-safe, atomic writes for the manifest.

### 4.4 Server — routes

- `packages/server/src/routes/compile.ts` — existing route. Adds branches per §2.3. Backward-compatible: missing `mode` → defaults to `pure-text`.
- `packages/server/src/routes/mirrors.ts` — NEW. Serves mirror files:
  - `GET /api/projects/:id/mirrors/:artifactId/page.html` — Mirror's HTML, with asset URLs rewritten to `…/mirrors/:artifactId/assets/...`.
  - `GET /api/projects/:id/mirrors/:artifactId/styles.css`
  - `GET /api/projects/:id/mirrors/:artifactId/assets/:filename`
  - `GET /api/projects/:id/mirrors/:artifactId/screenshot.png`
  - `POST /api/projects/:id/mirrors/:artifactId/upgrade-to-ast` — re-runs compile with `mode: 'ast'` on the cached ingestion.

### 4.5 Codegen

- `packages/codegen/src/renderMirror.ts` — given a Mirror artifact's `page.html` + the project base URL, returns a self-contained preview HTML string (asset URLs rewritten). Not a Vue SFC. Plan 10 does not produce Vue code for Mirror artifacts. (If the user wants exportable code from a Mirror, the upgrade-to-AST path is the answer.)

### 4.6 Client

- `packages/client/src/lib/api.ts` — adds `compile({ mode, source })`, `getMirrorUrl(projectId, artifactId, file)`, `upgradeMirrorToAst(projectId, artifactId)`.
- `packages/client/src/stores/useCompilerStore.ts` — artifact list adds `kind: 'mirror'`. Mirror-specific actions (open in preview, upgrade) live here.
- `packages/client/src/components/compiler/`
  - `CompilerChat.tsx` — modify: detect URL in input, detect attached image, render `MirrorIntentCard` before submission.
  - `MirrorIntentCard.tsx` — NEW. Renders thumbnail + mode picker per §2.2.
  - `ArtifactRail.tsx` — modify: render 🔒 for Mirror artifacts.
  - `PreviewPane.tsx` — modify: when active artifact is Mirror, render an `<iframe src={getMirrorUrl(...)}>`; otherwise existing PreviewHtml flow.
  - `InspectorPane.tsx` — modify: for Mirror artifacts, show metadata (source URL, crawled time, warnings) + "Upgrade to AST" button. Hide AST-editing controls.
  - `ThemeMergeDialog.tsx` — NEW. Per §2.5.

---

## 5. Plan 10-pre (prerequisite)

Restore multimodal capability so screenshots can be sent to an AI provider.

Two viable approaches; pick one in the writing-plans step:

**Option A — Patch `ai-core` upstream.** Most "correct" answer. Risk: patch acceptance is out of our control; could block Plan 10.

**Option B — Vision-only side path in `services/provider.ts`.** Add `getVisionProvider()` that bypasses `MultiProviderClient` for image inputs and calls Gemini's multimodal SDK directly (the `settings.ts` exception is precedent). Plan 10 only routes vision calls here; everything else stays on `MultiProviderClient`. Lower coupling, lower risk.

Plan 10-pre DoD:
- A single smoke test: pass a fixture image + a prompt → get non-empty text response. No production wiring yet — that's Plan 10 proper.

---

## 6. Pipeline (compile route, simplified)

```
POST /api/projects/:id/compile
body: { input: string, mode: 'pure-text'|'mirror'|'ast'|undefined, source?: { kind: 'url'|'image', payload } }

if mode is undefined:
  return existing pure-text flow (no change)

if mode === 'mirror':
  if source.kind === 'url':
    ingestion = parseWebpage(source.payload)
    artifact  = mirrorBuilder.build(projectId, ingestion)
    return { ok: true, artifact }
  if source.kind === 'image':
    siteUrl = await visionIdentifySite(source.payload)
    if !siteUrl: return { ok: false, reason: 'unidentified_screenshot' }
    // fall through to URL branch with the identified URL

if mode === 'ast':
  ingestion =
    source.kind === 'url'   ? parseWebpage(source.payload) :
    source.kind === 'image' ? parseScreenshot(source.payload) :
                              parseRequirement(input)        // existing
  ast       = await buildColdStart(ingestion)                // existing + repair loop
  rules     = applySkillRules(ast, activeRules)              // existing
  vue       = renderVue(ast)                                 // existing
  themeProp = themeExtractor.fromIngestion(ingestion)        // best-effort
  return { ok: true, artifact, themeProposal: themeProp }
```

---

## 7. Error handling

| Failure | Behavior |
|---|---|
| `URL.parse` fails on client side | Inline chat warning. No request sent. |
| Playwright timeout (>20s) | Server returns `{ ok: false, reason: 'crawl_timeout' }`. Chat shows retry / change-URL prompt. **No AI tokens spent.** |
| 403 / Cloudflare / forbidden HTML | `{ ok: false, reason: 'crawl_forbidden', hint: 'try screenshot' }`. Chat highlights screenshot affordance. |
| No `<link rel=stylesheet>` on page | `mirrorBuilder` fallback: write each element's computed `style` attribute inline. |
| Single asset 404 / CORS-blocked | Not fatal. Skip the asset, record `{ code: 'asset_404', url }` in `warnings`. Mirror artifact still built. |
| `buildColdStart` produces invalid AST → repair loop exhausted | Existing Plan 3 behavior + add: server returns `{ ok: false, reason: 'ast_repair_exhausted', fallbackOffered: 'mirror' }`. Chat asks if user wants to switch to Mirror mode. |
| Vision call fails while Plan 10-pre not yet shipped | `{ ok: false, reason: 'vision_unavailable' }`. UI explicitly says Plan 10-pre is needed, doesn't pretend success. |
| Theme merge conflict | `ThemeMergeDialog` per-section pick. |
| `mirrorStore` partial write failure | Rollback: delete partial files, do not append to `index.json`, return 500. |

---

## 8. Test strategy

| Layer | Target | Coverage |
|---|---|---|
| Unit | `classifyIntent` | URL regex, keyword pre-selection, attachment detection. |
| Unit | `themeExtractor` | Color dedup, font priority, missing-section fallback. |
| Unit | `themeMerger` | Take-new / keep / union semantics; no-op when proposal is identical. |
| Unit | `mirrorBuilder` (mocked Playwright + filesystem) | `<script>` stripping, asset URL rewrite, warnings on 404, rollback on write failure. |
| Unit | `mirrorStore` | Path validation, traversal blocking (`../`, absolute paths), atomic manifest update. |
| Unit | `renderMirror` | Asset URL rewriting, project base URL injection. |
| Unit | `parseWebpage` | Wraps `crawlWebsite`, strips `<script>`, populates warning list. |
| Unit | `parseScreenshot` | Behavior when vision is unavailable (Plan 10-pre gate); behavior with mock vision output. |
| Integration | `POST /compile` mirror+URL | Fixture local Playwright site, asserts artifact metadata + sidecar files exist. |
| Integration | `POST /compile` ast+URL | Asserts AST artifact + theme proposal in response. |
| Integration | `POST /compile` ast+image (mock vision) | Asserts AST built from vision-supplied data. |
| Integration | `GET /mirrors/.../page.html` | Asserts asset URLs rewritten, no traversal escape. |
| Integration | `POST /mirrors/.../upgrade-to-ast` | Asserts new AST artifact; original Mirror still present. |
| E2E (Playwright, route-mocked) | `compiler-mirror-journey.spec.ts` | Paste URL → intent card → confirm Mirror → artifact rail entry → preview iframe loads. |
| Vision smoke (manual, post Plan 10-pre) | 5 real screenshots | Spot-check identification rate. Not in CI (cost). |

**Not tested**: real external sites in CI (no outbound network), vision model accuracy for arbitrary brand pages (manual only).

---

## 9. Acceptance criteria (DoD)

- Pasting a known-good URL with Mirror mode produces a Mirror artifact whose preview pane visually matches the source page well enough that a reasonable observer would identify the site.
- The same URL run in AST mode produces a chat-editable AST artifact + a theme proposal that includes at least: primary palette colors, primary font, headings, body baseline.
- The "Upgrade to AST" button on a Mirror produces an AST artifact while preserving the original Mirror in the artifact rail.
- Pure-text compile flow has zero regression (all existing Plan 6a tests stay green).
- Screenshot-mode compile is gated behind Plan 10-pre's vision smoke test; without it, screenshot inputs return a clean `vision_unavailable` error.
- All unit + integration tests above pass in CI.
- E2E `compiler-mirror-journey.spec.ts` passes locally.

---

## 10. Open / deferred items

The following came up during brainstorming but are explicitly **not** in Plan 10 scope:

- **Style-aware `SkillRule.assert` predicates** (e.g. `propValueInSet`, `colorInPalette`) — deferred. Would make the rule engine able to *enforce* the theme, not just supply defaults. Belongs in a Plan 11+ proposal.
- **Theme tokens actually consumed by codegen** — Plan 10 writes `theme.json`. *Reading* it in `renderVue` / `renderVueProduction` (e.g. by emitting a Tailwind config) is a small follow-up. The writing-plans step will decide whether to fold it into Plan 10 implementation or split it out.
- **Multi-URL design intelligence** — `aggregateStyles` in the legacy crawler already supports this. Could become Plan 10b.
- **Auth-walled crawl** — needs cookie handling and is its own legal/UX problem.
- **Cross-project theme library** — punted to platform-level work.

---

**Spec end.** Ready for `superpowers:writing-plans`.
