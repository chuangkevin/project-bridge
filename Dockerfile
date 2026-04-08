# syntax=docker/dockerfile:1
# ── Stage 1: Build ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Native build tools for better-sqlite3 + git for dependencies
RUN apk add --no-cache python3 make g++ git curl

# Internal Git Mirror support for company environment
ARG INTERNAL_GIT_MIRROR=""
RUN if [ -n "$INTERNAL_GIT_MIRROR" ]; then \
    git config --global url."${INTERNAL_GIT_MIRROR}".insteadOf "https://github.com/H1114/"; \
    git config --global url."${INTERNAL_GIT_MIRROR}".insteadOf "https://github.com/kevinsisi/"; \
    fi

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy dependency files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Gitea CI cannot reach codeload.github.com; rewrite ai-core tarball URL when mirror is provided.
RUN if [ -n "$INTERNAL_GIT_MIRROR" ]; then \
    MIRROR="${INTERNAL_GIT_MIRROR%/}/"; \
    sed -i -E "s#https://codeload.github.com/kevinsisi/ai-core/tar.gz/([a-f0-9]+)#${MIRROR}ai-core/archive/\\1.tar.gz#g" pnpm-lock.yaml; \
    fi

# Install all dependencies (Alpine/musl — only used for TS compilation)
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
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

ARG INTERNAL_GIT_MIRROR=""
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Build sharp against distro libvips to avoid linux-x64-v2 prebuilt binary requirement.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

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

# Keep production install consistent with build stage URL rewrite in company network.
RUN if [ -n "$INTERNAL_GIT_MIRROR" ]; then \
    MIRROR="${INTERNAL_GIT_MIRROR%/}/"; \
    sed -i -E "s#https://codeload.github.com/kevinsisi/ai-core/tar.gz/([a-f0-9]+)#${MIRROR}ai-core/archive/\\1.tar.gz#g" pnpm-lock.yaml; \
    fi

RUN npm_config_build_from_source=true pnpm install --frozen-lockfile --prod --reporter=append-only

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
