# Global Design Style + Per-Project Inheritance — Design

Date: 2026-06-05
Status: approved (user: "快")

## Goal

Restore v1.5.1 global design style capability in M1, plus per-project inheritance and
URL-based AI style extraction. Also fix the dead ☰ button on desktop.

## Components

### 1. ☰ button fix (`TopBar.tsx`, `WorkspacePage.tsx`)
- Desktop: toggle left-rail collapse, persisted to `localStorage('designbridge.rail_collapsed')`
- Mobile: keep existing drawer behavior (`mobileRailOpen`)

### 2. 全域風格 settings tab (`SettingsPage.tsx` + new `GlobalStyleTab.tsx`)
- New tab「全域風格」in /settings (NOT admin-gated — settings page is open)
- Content: design description textarea, design convention textarea, CSS tokens editor
  (reuse existing GlobalDesignPage logic), plus new URL-analysis section
- URL analysis: up to 3 URLs → `POST /api/design-presets/analyze-url` → AI returns
  description/convention/tokens → autofill fields, user saves

### 3. URL → AI style extraction (server, `designPresets.ts`)
- `POST /api/design-presets/analyze-url` body `{ urls: string[] }` (1-3)
- Per-URL: `crawlWebsite(url)` (existing service) with 30s per-item timeout
- Aggregate crawled colors/typography/buttons/shadows → prompt via `getProvider()`
  with `withJsonInstruction()` + `extractJsonBody()`
- Response: `{ description, convention, tokens: { primaryColor, secondaryColor,
  backgroundColor, fontFamily, borderRadius }, palette: string[] }`

### 4. Per-project inherit toggle
- Migration: `projects.inherit_global_style INTEGER NOT NULL DEFAULT 1`
- `PATCH /api/projects/:id` accepts `inheritGlobalStyle`
- DesignStage toolbar: toggle「繼承全域風格」, saved server-side
- `chat.ts` design mode: when project.inherit_global_style = 1, load
  `global_design_description` / `global_design_convention` / `global_design_tokens`
  from settings and append to design systemInstruction

## Non-goals
- Reference image upload (legacy had it; not in scope)
- Admin gating (settings page stays open by design)
