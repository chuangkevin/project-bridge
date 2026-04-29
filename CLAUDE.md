# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DesignBridge** (project-bridge) 是 AI 協作顧問與設計平台，讓多個使用者能即時共同設計 AI 工作流程。
整合知識庫 Skill 的 AI 顧問對話，以及 UI 原型生成功能。
整合 ai-core MultiProviderClient（`@kevinsisi/ai-core` v3.0.0），預設 OpenAI 主路 + Gemini key-pool fallback，支援 OAuth 與多 Gemini key 輪替。

- **Domain**: `designbridge.housefun.com.tw` (公司) / `designbridge.sisihome.org` (home)
- **Port**: 5123
- **目前版本**: v1.4.0（2026-04-29）— 已遷移至 ai-core MultiProviderClient，新增 OpenAI OAuth 連結。

## Architecture

- **Monorepo**: pnpm workspaces (`packages/client`, `packages/server`, `packages/e2e`)
- **Server** (`packages/server`): Express + TypeScript + SQLite (better-sqlite3) + Socket.io + ai-core
  - AI: Gemini (`@google/generative-ai`), OpenAI-compatible (`openai`)
  - Document parsing: mammoth (DOCX), pdf-parse, pdfjs-dist, tesseract.js (OCR)
  - URL Crawler: Playwright full-page crawl, CSS extraction, style apply
  - Image: `@napi-rs/canvas`, sharp
- **Client** (`packages/client`): React 18 + Vite + TypeScript + Socket.io-client + zustand
  - Node graph: `@xyflow/react`
  - Drag-and-drop: `@dnd-kit/core`
  - Markdown rendering: react-markdown + remark-gfm + rehype-raw
- **E2E** (`packages/e2e`): Playwright (61 tests)
- **Skills** (`skill/`): houseprice, superpowers

## Key Features

- **顧問模式** (`chatOnlyMode`): 純對話，整合知識庫 Skill 的 AI 諮詢，不生成 UI
- **顧問審查優先級**: 原始規格/需求文件 > AI 整理文件 > skills/domain 記憶；多文件時先 diff 再下結論
- **設計模式**: AI 生成互動式 UI 原型
- **設計模式 Checklist**: 生成時應對外顯示需求確認、規則檢查、逐頁生成、驗證等 todo 狀態
- **URL Crawler** (設計 tab → 參考網站): 爬取網頁，照抄元件或套用類似設計
- **元件庫** (`/components`): 存放從網站爬取的可重用 UI 元件
- **Page Variant Selector**: 多版本頁面預覽與選擇
- **Vision-based Intent**: AI 看截圖判斷調整意圖

## Development Commands

```bash
# Start dev servers (run concurrently)
pnpm dev:server     # packages/server (ts-node-dev)
pnpm dev:client     # packages/client (Vite)

# E2E tests
pnpm test:e2e               # All 61 tests
pnpm test:e2e:smoke         # Smoke suite
pnpm test:e2e:headed        # With browser UI

# Build
cd packages/server && pnpm build   # tsc → dist/
cd packages/client && pnpm build   # Vite → dist/
```

## Key Architecture Patterns

### MultiProviderClient (ai-core v3.0.0)
- 單例位置：[`packages/server/src/services/provider.ts`](packages/server/src/services/provider.ts)
- Route policy：OpenAI primary → Gemini pool fallback；`allowCrossProviderFallback: true`
- 所有路由 / service 透過 `getProvider().generateContent / streamContent / generateWithSelection` 呼叫，**禁止再 import `@google/generative-ai`**（唯一例外見下方 settings.ts）。
- ai-core `GenerateParams` 不暴露 `temperature` / `responseMimeType`，要求 JSON 輸出時使用 `withJsonInstruction()` 在 systemInstruction 末端附加 JSON-only 指令，並用 `extractJsonBody()` 解析。
- OpenAI credential 順序：`openai_oauth_access_token` (settings) → `openai_api_key` (settings) → `OPENAI_API_KEY` (env)。token 變動時呼叫 `invalidateProvider()` 立即重建 client。
- Silent fallback **被禁止**：adapter 直接拋錯，跨 provider fallback 只在 router 層由 RoutePolicy 觸發。

### Key-Pool (Gemini)
- `@kevinsisi/ai-core` 仍負責 Gemini API key 輪替（在 MultiProviderClient 的 Gemini adapter 內）
- Keys 來自 env / SQLite settings table
- Bad-key cooldown：429→2min、401/403→30min、5xx→30s

### settings.ts 例外保留 Gemini SDK
- [`packages/server/src/routes/settings.ts`](packages/server/src/routes/settings.ts) 直接 import `@google/generative-ai`
- 用途：驗證使用者新增的特定 Gemini key（要打那把 key 而不是走 provider 路由）— 共三處驗證呼叫
- **不要**為了「乾淨」把它改成 provider，會破壞 key validation 行為

### OpenAI OAuth (PKCE)
- Routes: [`packages/server/src/routes/openaiOAuth.ts`](packages/server/src/routes/openaiOAuth.ts) — `POST /start`, `GET /callback`, `GET /status`, `DELETE /`
- 使用者流程：設定頁點「OpenAI 授權連結」→ 開啟 popup → 跳到 `https://auth.openai.com/authorize` → 授權後 callback 回 `/api/openai-oauth/callback` → server 用 PKCE verifier 換 token → 寫入 settings 表 → `postMessage` 通知 popup opener → 關閉 popup
- 需要 `OPENAI_OAUTH_CLIENT_ID` env（或 settings 內 `openai_oauth_client_id`）
- redirect_uri 預設 `<PUBLIC_BASE_URL>/api/openai-oauth/callback`，可由 `OPENAI_OAUTH_REDIRECT_URI` 覆寫
- Token 存放於 settings 表的 `openai_oauth_access_token` / `openai_oauth_refresh_token` / `openai_oauth_expires_at`

### Socket.io Collaboration
- Server broadcasts node-graph changes to all connected clients
- Client uses zustand for local state, Socket.io for remote sync
- Anti-loop: ref flag prevents re-emit on received events

### SQLite Storage
- `packages/server/data/` — SQLite DB (better-sqlite3, WAL mode)
- Stores sessions, node graphs, settings, API keys

## Deploy v1.4.0（接手指南）

### 一、前置：拉到最新 dev 並設定環境變數
```bash
git checkout dev
git pull origin dev   # 確認 HEAD 指到 v1.4.0（commit 08e09f6 或更新）
pnpm install
```

`packages/server/.env`（最少需要）：
```bash
PORT=3003
SKILLS_DIR=path/to/skills
OPENAI_OAUTH_CLIENT_ID=app_EMoamEEZ73f0CkXaXp7hrann   # v1.4.0 新增；缺這個 OAuth 流程會 400
# 選填覆寫
# OPENAI_OAUTH_REDIRECT_URI=https://designbridge.example.com/api/openai-oauth/callback
# PUBLIC_BASE_URL=https://designbridge.example.com
# OPENAI_API_KEY=sk-...                               # 若不走 OAuth，可直接用 API key
```

### 二、Build 與啟動
```bash
# 開發
pnpm dev:server
pnpm dev:client

# 生產 build
pnpm --filter server build   # tsc → packages/server/dist/
pnpm --filter client build   # vite → packages/client/dist/

# 生產啟動
node packages/server/dist/index.js
# 或 docker compose up -d  →  port 5123
```

### 三、v1.4.0 改了什麼（接手前必看）
- **核心遷移**：所有 `@google/generative-ai` 直呼改成 ai-core `MultiProviderClient`，單例在 [`packages/server/src/services/provider.ts`](packages/server/src/services/provider.ts)。
- **ai-core 升級**：`@kevinsisi/ai-core` 升到 v3.0.0，pin SHA `6b36218b2a8af01d397ff71a91fbafaf38f5d4ee`（見 [`packages/server/package.json`](packages/server/package.json:11)）。
- **Provider 路由**：OpenAI 為主、Gemini key-pool 為 fallback；`allowCrossProviderFallback: true`。
- **OpenAI OAuth (PKCE)**：新增 [`routes/openaiOAuth.ts`](packages/server/src/routes/openaiOAuth.ts)，client 設定頁加「OpenAI 授權連結」按鈕（[`SettingsPage.tsx`](packages/client/src/pages/SettingsPage.tsx)），popup 完成後 `postMessage` 回主視窗。
- **JSON 輸出方式改變**：ai-core `GenerateParams` 不支援 `responseMimeType`，所有原本用 `responseMimeType: 'application/json'` 的呼叫，改成在 `systemInstruction` 末段以指令要求 JSON-only 輸出，再用 `extractJsonBody()` 解析。
- **settings.ts 例外**：[`routes/settings.ts`](packages/server/src/routes/settings.ts) 仍直接 import Gemini SDK 用來驗證使用者新增的特定 key，**勿動**。
- **Auto-continue 拿掉**：原本 MAX_TOKENS 觸發的 auto-continue loop 在 ai-core 下沒有 `finishReason` 可判斷，改用 `maxOutputTokens` 8192 / 65536 涵蓋實際情境。

### 四、新增的環境變數（v1.4.0）
| Key | 必填 | 說明 |
| --- | --- | --- |
| `OPENAI_OAUTH_CLIENT_ID` | ✅ | OpenAI OAuth public client id（目前值：`app_EMoamEEZ73f0CkXaXp7hrann`）|
| `OPENAI_OAUTH_AUTHORIZE_URL` | — | 預設 `https://auth.openai.com/authorize` |
| `OPENAI_OAUTH_TOKEN_URL` | — | 預設 `https://auth.openai.com/token` |
| `OPENAI_OAUTH_SCOPE` | — | 預設 `openid profile email offline_access` |
| `OPENAI_OAUTH_REDIRECT_URI` | — | 不填則用 `<PUBLIC_BASE_URL>/api/openai-oauth/callback` |
| `PUBLIC_BASE_URL` | 建議 | redirect_uri 用得到；K8s/Docker 環境必填 |

> 不想跑 OAuth 也可改用 `OPENAI_API_KEY` env 或在 settings 表寫入 `openai_api_key`，provider 會自動使用。

### 五、OpenAI OAuth 流程（使用者視角）
1. 使用者進入「設定」分頁。
2. 點「OpenAI 授權連結 → 連線」按鈕。client 呼叫 `POST /api/openai-oauth/start`，server 產 PKCE verifier/challenge + state，回傳 `authorizeUrl`。
3. Client 開 popup 視窗到 `https://auth.openai.com/authorize?...`。
4. 使用者授權後，OpenAI redirect 到 `/api/openai-oauth/callback?code=...&state=...`。
5. Server 驗 state CSRF、用 verifier 換 token → 寫入 settings → `invalidateProvider()` → popup `postMessage({ source: 'openai-oauth', ok: true })` → 自動關閉。
6. 主視窗收到訊息後刷新狀態（`GET /api/openai-oauth/status`）顯示已連線。
7. 之後所有 AI 呼叫優先走 OpenAI（OAuth token），失敗才 fallback 到 Gemini key-pool。

### 六、注意事項
- **JSON 輸出回呼端**：若新增 service 要 JSON 輸出，**不要**塞 `temperature` / `responseMimeType`；改用 `withJsonInstruction()` 加 system 指令並用 `extractJsonBody()` parse。
- **provider 單例**：token / key 改變後務必呼叫 `invalidateProvider()`，否則沿用舊 client。
- **Gemini key 驗證仍要保留 SDK 直呼**：[`settings.ts`](packages/server/src/routes/settings.ts) 不要改成 provider 路由。
- **`postMessage` origin**：目前用 `'*'` 因為 popup 跨來源，主視窗要在 listener 內檢查 `event.data.source === 'openai-oauth'`。
- 進到 v1.4.0 後不可再走 1.3.x 之前的 Gemini-only 路徑，否則 OAuth 連線形同失效。

## CI/CD (Gitea)

- Workflow: `.gitea/workflows/docker-build.yaml`
- Docker build → push to internal registry (`srvhpgit1:32050`) → ArgoCD sync
- **Docker build 必須加 `--network=host`**（runner 的 Docker build network namespace 限制）
- ai-core 依賴在 Gitea CI 走 Gitea URL，GitHub CI 走 GitHub URL

## Docker
```bash
docker compose up -d   # Full stack
```

### Dockerfile 注意事項
- Builder: Alpine (node:22-alpine), Prod: Playwright Ubuntu image
- better-sqlite3 需要在 prod stage rebuild（musl → glibc）
- Tesseract 模型下載用 best-effort（`|| true`）
- Chromium 需要 `--no-sandbox --disable-setuid-sandbox`

## Git Remotes

雙 remote push（一次推 GitHub + Gitea）：
- `origin` fetch: Gitea (`gitea.housefun.com.tw/H1114/project-bridge`)
- `origin` push: Gitea + GitHub (`chuangkevin/project-bridge`)
