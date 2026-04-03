# ── Stage 1: Build ──────────────────────────────────────────
# node:24 (non-slim) has python3, make, g++ built-in for native modules
# Must match Node version in playwright image (v1.58.2 uses Node 24)
FROM node:24 AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config + install dependencies (layer cache)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --no-frozen-lockfile

# Copy source
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

# Build server (TypeScript → dist/)
RUN pnpm --filter server build

# Build client (Vite → dist/)
RUN pnpm --filter client build

# ── Stage 2: Production ────────────────────────────────────
# Playwright official image — Chromium + all system deps pre-installed
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

# Copy server build + deps
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/server/src/db/migrations packages/server/dist/db/migrations
COPY --from=builder /app/packages/server/src/prompts packages/server/dist/prompts
COPY --from=builder /app/packages/server/data packages/server/data
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/packages/server/node_modules packages/server/node_modules

# Copy client build
COPY --from=builder /app/packages/client/dist packages/client/dist

# Copy workspace config
COPY package.json pnpm-workspace.yaml ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
