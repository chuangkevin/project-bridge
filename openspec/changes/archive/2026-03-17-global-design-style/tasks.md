## 1. Database Migration

- [x] 1.1 Create `packages/server/src/db/migrations/005_global_design.sql`: create `global_design_profile` table (id TEXT PK, description TEXT DEFAULT '', reference_analysis TEXT DEFAULT '', tokens TEXT DEFAULT '{}', updated_at TEXT); add `inherit_global INTEGER NOT NULL DEFAULT 1` and `supplement TEXT NOT NULL DEFAULT ''` columns to `design_profiles`

## 2. Backend — Global Design API

- [x] 2.1 Create `packages/server/src/routes/globalDesign.ts`: `GET /api/global-design` returns `{ profile }` or `{ profile: null }`; `PUT /api/global-design` upserts with fixed id='global', body `{ description, referenceAnalysis, tokens }`
- [x] 2.2 Add `POST /api/global-design/analyze-reference` to globalDesign router: same logic as `POST /api/projects/:id/design/analyze-reference` (reuse or extract helper)
- [x] 2.3 Add `POST /api/global-design/summarize-direction` to globalDesign router: same logic as project-level summarize-direction
- [x] 2.4 Register `globalDesignRouter` at `/api/global-design` in `packages/server/src/index.ts`

## 3. Backend — Update Design Profile Route

- [x] 3.1 Update `PUT /api/projects/:id/design` to accept and save `inheritGlobal` (boolean → integer) and `supplement` (string) fields
- [x] 3.2 Update `GET /api/projects/:id/design` response to include `inheritGlobal` (boolean) and `supplement` (string)

## 4. Backend — Composed Generation Prompt

- [x] 4.1 In `packages/server/src/routes/chat.ts` generate path: fetch global design profile; if `inherit_global=1` and global has content, inject `=== GLOBAL DESIGN ===` block before `=== PROJECT DESIGN ===` block
- [x] 4.2 If `inherit_global=0`, keep existing `=== DESIGN PROFILE ===` behavior unchanged
- [x] 4.3 After project design block, if supplement is non-empty, append `=== PROJECT SUPPLEMENT ===` block; include note that supplement takes priority for any conflicting attributes

## 5. Frontend — Global Design Page

- [x] 5.1 Create `packages/client/src/pages/GlobalDesignPage.tsx`: same UI as DesignPanel but uses `/api/global-design` endpoints; title 「全域設計」; back button to home
- [x] 5.2 Add route `/global-design` in `packages/client/src/App.tsx`
- [x] 5.3 Add「🌐 全域設計」button in `packages/client/src/pages/HomePage.tsx` toolbar/header area

## 6. Frontend — DesignPanel Inheritance UI

- [x] 6.1 On mount, fetch `GET /api/global-design`; if non-empty, store `globalProfile` in state
- [x] 6.2 Load `inheritGlobal` and `supplement` from `GET /api/projects/:id/design` response
- [x] 6.3 Add toggle switch「繼承全域設計」at top of DesignPanel; visible only when `globalProfile` is non-empty; default true
- [x] 6.4 When `inheritGlobal=true`, show read-only global preview card (description truncated to 80 chars + primary color swatch)
- [x] 6.5 When `inheritGlobal=true`, show「專案補充說明」textarea below preview card
- [x] 6.6 In `handleSave`, include `inheritGlobal` and `supplement` in PUT body

## 7. Playwright Testing

- [x] 7.1 API test: `GET /api/global-design` returns null profile initially
- [x] 7.2 API test: `PUT /api/global-design` saves and returns profile
- [x] 7.3 API test: `GET /api/projects/:id/design` includes `inheritGlobal` and `supplement`
- [x] 7.4 API test: `PUT /api/projects/:id/design` with `inheritGlobal: false` saves correctly
- [x] 7.5 E2E test: Navigate to `/global-design` from home page; save global design; verify saved
- [x] 7.6 E2E test: DesignPanel shows inheritance toggle and supplement when global design exists; toggle off hides supplement
