# Tasks: design-preset-system

## 1. DB Migration

- [ ] 1.1 Create migration 030: `design_presets` table + `projects.design_preset_id` column
- [ ] 1.2 Seed default preset from existing `global_design_profile` data

## 2. Server — Preset CRUD API

- [ ] 2.1 Create `packages/server/src/routes/designPresets.ts`
- [ ] 2.2 GET /api/design-presets — list all, sorted by is_default DESC, name
- [ ] 2.3 POST /api/design-presets — create with UUID, admin auth
- [ ] 2.4 PUT /api/design-presets/:id — partial update, admin auth
- [ ] 2.5 DELETE /api/design-presets/:id — block if is_default, admin auth
- [ ] 2.6 POST /api/design-presets/:id/copy — duplicate with "副本" suffix
- [ ] 2.7 Register routes in index.ts

## 3. Server — URL Style Analysis

- [ ] 3.1 Create `packages/server/src/services/urlStyleAnalyzer.ts`
- [ ] 3.2 Fetch URL content (fetch + cheerio for CSS extraction)
- [ ] 3.3 Extract: color palette, font stacks, border-radius, shadows, spacing
- [ ] 3.4 Send extracted data to Gemini AI for synthesis
- [ ] 3.5 Multi-URL cross-analysis (find common patterns)
- [ ] 3.6 POST /api/design-presets/analyze-url endpoint
- [ ] 3.7 Error handling: skip failed URLs with warnings

## 4. Client — Settings Page

- [ ] 4.1 "設計風格庫" section in SettingsPage
- [ ] 4.2 Preset card component (color dots, name, badges, action buttons)
- [ ] 4.3 Create/Edit modal with color pickers, font selector, radius slider
- [ ] 4.4 URL input section (up to 3 URLs) with "AI 分析風格" button
- [ ] 4.5 Analysis loading state + result display
- [ ] 4.6 Copy/Delete actions with confirmation
- [ ] 4.7 Default preset badge (⭐)

## 5. Client — Project Binding

- [ ] 5.1 NewProjectDialog: preset dropdown selector
- [ ] 5.2 POST /api/projects body includes design_preset_id
- [ ] 5.3 WorkspacePage 設計 tab: show current preset name, allow change

## 6. Generation Integration

- [ ] 6.1 chat.ts: read design_presets by project.design_preset_id
- [ ] 6.2 Use preset.design_convention as designConvention (override global)
- [ ] 6.3 parallelGenerator: extract colors from preset.tokens for :root override
- [ ] 6.4 planAndReview: include preset design direction in agent context

## 7. Testing

- [ ] 7.1 E2E: create preset, verify in list
- [ ] 7.2 E2E: analyze URL, verify tokens generated
- [ ] 7.3 E2E: create project with preset, generate, verify colors match
- [ ] 7.4 E2E: change preset on existing project, regenerate, verify new colors
