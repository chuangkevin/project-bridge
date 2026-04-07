# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**project-bridge** 是 AI 協作原型工具，讓多個使用者能即時共同設計 AI 工作流程（節點圖）。
整合 key-pool 標準實作（`@kevinsisi/ai-core`），支援多 Gemini API key 輪替與速率限制管理。

## Architecture

- **Monorepo**: pnpm workspaces (`packages/client`, `packages/server`, `packages/e2e`)
- **Server** (`packages/server`): Express + TypeScript + SQLite (better-sqlite3) + Socket.io + ai-core
  - AI: Gemini (`@google/generative-ai`), OpenAI-compatible (`openai`)
  - Document parsing: mammoth (DOCX), pdf-parse, pdfjs-dist, tesseract.js (OCR)
  - Image: `@napi-rs/canvas`, sharp
- **Client** (`packages/client`): React 18 + Vite + TypeScript + Socket.io-client + zustand
  - Node graph: `@xyflow/react`
  - Drag-and-drop: `@dnd-kit/core`
- **E2E** (`packages/e2e`): Playwright (61 tests)
- **Skills** (`skill/`): houseprice, superpowers

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
- Automatic bad-key marking with cooldown

### Socket.io Collaboration
- Server broadcasts node-graph changes to all connected clients
- Client uses zustand for local state, Socket.io for remote sync
- Anti-loop: ref flag prevents re-emit on received events

### SQLite Storage
- `packages/server/data/` — SQLite DB (better-sqlite3, WAL mode)
- Stores sessions, node graphs, settings, API keys

## E2E Testing
- 61 tests in `packages/e2e/`
- Playwright config at `packages/e2e/playwright.config.ts` (or root)
- Run `pnpm test:e2e` from root

## Docker
```bash
docker compose up -d   # Full stack
```
