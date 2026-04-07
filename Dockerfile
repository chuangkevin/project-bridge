# syntax=docker/dockerfile:1
# ── Stage 1: Build ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Native build tools for better-sqlite3 + git for dependencies that need it
RUN apk add --no-cache python3 make g++ git

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy ONLY dependency files first (maximizes Docker cache — won't rebuild on source changes)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Tell node-gyp to use bundled headers instead of downloading from internet
ENV npm_config_nodedir=/usr/local

# Install dependencies with BuildKit cache mount (survives across builds)
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# Copy source
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

# Build server (TypeScript → dist/)
RUN pnpm --filter server build

# Build client (Vite → dist/)
RUN pnpm --filter client build

# ── Stage 2: Production ────────────────────────────────────
# Playwright base image — includes Chromium for URL crawling + all system deps
FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Bake Tesseract OCR language models (best-effort — skip if CDN unreachable)
RUN mkdir -p /app/tessdata && \
    (curl -sL --connect-timeout 10 -o /app/tessdata/eng.traineddata "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata" || true) && \
    (curl -sL --connect-timeout 10 -o /app/tessdata/chi_tra.traineddata "https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_tra/4.0.0_best_int/chi_tra.traineddata" || true) && \
    echo "Tesseract models download attempted"
ENV TESSDATA_PREFIX=/app/tessdata

# Copy server build + source configs
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/server/src/db/migrations packages/server/dist/db/migrations
COPY --from=builder /app/packages/server/src/prompts packages/server/dist/prompts
COPY --from=builder /app/packages/server/data packages/server/data

# Copy deps — but rebuild native modules (alpine musl → ubuntu glibc)
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/packages/server/node_modules packages/server/node_modules
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
RUN apt-get update && apt-get install -y python3 make g++ && \
    pnpm rebuild better-sqlite3 && \
    apt-get purge -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy client build
COPY --from=builder /app/packages/client/dist packages/client/dist

# workspace config already copied above with pnpm rebuild

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
