# syntax=docker/dockerfile:1
# ── Stage 1: Build ──────────────────────────────────────────
FROM node:22-bookworm AS builder

WORKDIR /app

# Native build tools for better-sqlite3 + git for dependencies
RUN apt-get update && apt-get install -y python3 make g++ git curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install all dependencies (Debian/glibc — only used for TS compilation)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

# Build server (TypeScript → dist/)
RUN pnpm --filter server build

# Build client (Vite → dist/)
RUN pnpm --filter client build

# ── Stage 2: Production ────────────────────────────────────
# Playwright base image — Ubuntu Noble (glibc), includes Chromium
FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Bake Tesseract OCR language models (best-effort)
RUN mkdir -p /app/tessdata && \
    (curl -sL --connect-timeout 10 -o /app/tessdata/eng.traineddata "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata" || true) && \
    (curl -sL --connect-timeout 10 -o /app/tessdata/chi_tra.traineddata "https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_tra/4.0.0_best_int/chi_tra.traineddata" || true) && \
    echo "Tesseract models download attempted"
ENV TESSDATA_PREFIX=/app/tessdata

# Copy server build output
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/server/src/db/migrations packages/server/dist/db/migrations
COPY --from=builder /app/packages/server/src/prompts packages/server/dist/prompts
COPY --from=builder /app/packages/server/data packages/server/data

# Copy client build output
COPY --from=builder /app/packages/client/dist packages/client/dist

# Fresh install production deps on glibc — no musl/glibc mismatch
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile --prod

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
