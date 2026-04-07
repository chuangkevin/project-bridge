# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DesignBridge** (project-bridge) 是 AI 協作顧問與設計平台，讓多個使用者能即時共同設計 AI 工作流程。
整合知識庫 Skill 的 AI 顧問對話，以及 UI 原型生成功能。
整合 key-pool 標準實作（`@kevinsisi/ai-core`），支援多 Gemini API key 輪替與速率限制管理。

- **Domain**: `designbridge.housefun.com.tw` (公司) / `designbridge.sisihome.org` (home)
- **Port**: 5123

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
- **設計模式**: AI 生成互動式 UI 原型
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

### Key-Pool (ai-core standard)
- `@kevinsisi/ai-core` manages Gemini API key rotation
- Keys loaded from env / SQLite settings table
- Automatic bad-key marking with cooldown (429→2min, 401/403→30min, 5xx→30s)

### Socket.io Collaboration
- Server broadcasts node-graph changes to all connected clients
- Client uses zustand for local state, Socket.io for remote sync
- Anti-loop: ref flag prevents re-emit on received events

### SQLite Storage
- `packages/server/data/` — SQLite DB (better-sqlite3, WAL mode)
- Stores sessions, node graphs, settings, API keys

## CI/CD (Gitea & GitHub)

- **GitHub CI**: `.github/workflows/docker-publish.yml` + `deploy.yml` (Tailscale)
- **Gitea CI**: `.gitea/workflows/docker-build.yaml` (Internal Registry + ArgoCD)
- **Network Compatibility**: `package.json` 統一指向 GitHub。Gitea CI 透過 `INTERNAL_GIT_MIRROR` (ARG) 使用 Git `insteadOf` 重導向至內網鏡像。
- **Docker build**: 必須加 `--network=host` (Gitea Runner 限制)。

## Docker
```bash
docker compose up -d   # Full stack
```

### Dockerfile 注意事項
- **Builder**: Debian Bookworm (`node:22-bookworm`)，解決 musl/glibc 報錯並與 Prod 一致。
- **Production Stage**: Playwright Ubuntu image (Noble)。
- **Dependencies**: `ai-core` (git repo) 在 Gitea 環境需透過鏡像下載；避免在 `packages/server/.npmrc` 使用 Token (CI 無法存取)。
- **Cleanup**: 部署前需清理 `project-bridge` 與舊的 `projectbridge` 容器避免命名衝突。
- **Chromium**: 需要 `--no-sandbox --disable-setuid-sandbox`

## Git Remotes

雙 remote push（一次推 GitHub + Gitea）：
- `origin` fetch: Gitea (`gitea.housefun.com.tw/H1114/project-bridge`)
- `origin` push: Gitea + GitHub (`chuangkevin/project-bridge`)
