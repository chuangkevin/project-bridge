## 1. Database Migration

- [x] 1.1 Create `packages/server/src/db/migrations/006_platform_shell.sql`: CREATE TABLE `platform_shells` (project_id TEXT PRIMARY KEY, shell_html TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now')))

## 2. Backend — Platform Shell API

- [x] 2.1 Create `packages/server/src/routes/platformShell.ts`: `GET /api/projects/:id/platform-shell` → `{ shell }` or `{ shell: null }`
- [x] 2.2 Add `PUT /api/projects/:id/platform-shell` to platformShell router: upsert shellHtml; auto-insert `<main>{CONTENT}</main>` before `</body>` if `{CONTENT}` missing
- [x] 2.3 Add `POST /api/projects/:id/platform-shell/extract`: read current prototype HTML, extract nav/header/aside/footer structure, replace main content with `{CONTENT}`, save and return
- [x] 2.4 Register `platformShellRouter` at `/api/projects` in `packages/server/src/index.ts`

## 3. Backend — Extend Intent Classifier

- [x] 3.1 Update `packages/server/src/services/intentClassifier.ts`: change signature to `classifyIntent(message, apiKey, hasShell): Promise<'full-page' | 'in-shell' | 'component' | 'question'>` with four-way classification prompt
- [x] 3.2 Update classification prompt: component keywords → `component`; shell exists + subpage language → `in-shell`; explicit full-page signals → `full-page`; questions → `question`; default with shell → `in-shell`; default without shell → `full-page`

## 4. Backend — Context-Aware Generation in chat.ts

- [x] 4.1 In chat.ts generate path: fetch platform shell via `GET /api/projects/:id/platform-shell`; pass `hasShell` boolean to `classifyIntent`
- [x] 4.2 Add `in-shell` generation path: inject shell structure (first 3000 chars) into system prompt with instruction to output only `<main>` content; after streaming, compose final HTML by replacing `{CONTENT}` in shell with AI output
- [x] 4.3 Add `component` generation path: inject component-only instruction into system prompt; after streaming, wrap fragment in preview wrapper HTML
- [x] 4.4 Keep `full-page` path unchanged (existing generate logic)
- [x] 4.5 Update SSE done event to include `intent` field (`full-page` | `in-shell` | `component`)
- [x] 4.6 Update prototype_versions INSERT to include `intent` field (add column via migration or store in existing `pages` JSON field)

## 5. Frontend — DesignPanel Platform Shell Section

- [x] 5.1 In `DesignPanel.tsx`: on mount fetch `GET /api/projects/:id/platform-shell`; store `shellHtml` and `hasShell` in state
- [x] 5.2 Add「平台 Shell」section below supplement section: show `hasShell` badge「Platform Shell 已啟用」when shell exists
- [x] 5.3 Add「從現有原型擷取 Shell」button (`data-testid="extract-shell-btn"`): calls POST extract endpoint, shows toast on success/failure
- [x] 5.4 Add collapsible textarea for manual shell HTML input + save button (`data-testid="save-shell-btn"`)

## 6. Frontend — Chat Panel Intent Labels

- [x] 6.1 In `ChatPanel.tsx`: update `isHtmlContent()` / generate message display to handle `messageType = 'component'` → show「🧩 已生成元件」tag
- [x] 6.2 Handle `messageType = 'in-shell'` → show「✅ 已生成子頁」tag
- [x] 6.3 Update `onHtmlGenerated` callback to pass `intent` field from SSE done event

## 7. Playwright Testing

- [x] 7.1 API test: `GET /api/projects/:id/platform-shell` returns null initially
- [x] 7.2 API test: `PUT` saves shell; `GET` returns saved shellHtml
- [x] 7.3 API test: `PUT` without `{CONTENT}` auto-inserts placeholder
- [x] 7.4 API test: `POST /extract` returns 404 when no prototype exists
- [x] 7.5 E2E test: DesignPanel shows Platform Shell section with extract button
- [x] 7.6 E2E test: save shell manually via textarea shows success toast; shell active badge appears
