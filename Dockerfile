# syntax=docker/dockerfile:1
# ── Stage 1: Build ──────────────────────────────────────────
FROM node:22-bookworm AS builder

WORKDIR /app

# Native build tools for better-sqlite3 + bcrypt + git for ai-core tarball dependency
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Internal Git Mirror support for company environment (Gitea CI)
ARG INTERNAL_GIT_MIRROR=""
RUN if [ -n "$INTERNAL_GIT_MIRROR" ]; then \
    git config --global url."${INTERNAL_GIT_MIRROR}".insteadOf "https://github.com/H1114/"; \
    git config --global url."${INTERNAL_GIT_MIRROR}".insteadOf "https://github.com/kevinsisi/"; \
    fi

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace manifests so pnpm can resolve all workspace packages.
# Both new M1 packages/* and legacy/packages/* are workspace members per pnpm-workspace.yaml.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY legacy/packages/server/package.json legacy/packages/server/
COPY legacy/packages/client/package.json legacy/packages/client/
COPY legacy/packages/e2e/package.json legacy/packages/e2e/

# Gitea CI cannot reach codeload.github.com; rewrite ai-core tarball URL when mirror is provided.
RUN if [ -n "$INTERNAL_GIT_MIRROR" ]; then \
    MIRROR="${INTERNAL_GIT_MIRROR%/}/"; \
    sed -i -E "s#https://codeload.github.com/kevinsisi/ai-core/tar.gz/([a-f0-9]+)#${MIRROR}ai-core/archive/\\1.tar.gz#g" pnpm-lock.yaml; \
    fi

# Skip Playwright browser download in builder — we only need the Node API,
# not the Chromium binary, during the TypeScript compile step. The browser
# is installed separately in the production stage below.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install all dependencies (M1 + legacy workspace members)
RUN pnpm install --frozen-lockfile

# Commit SHA for the version badge in the UI (no .git dir in Docker build context)
ARG COMMIT_SHA=""
ENV VITE_APP_VERSION=${COMMIT_SHA}

# Copy M1 source only (legacy is preserved in the repo but NOT built for production)
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

# Build M1 server (TypeScript → dist/) and client (Vite → dist/)
RUN pnpm --filter @designbridge/server build
RUN pnpm --filter @designbridge/client build

# ── Stage 2: Production ────────────────────────────────────
FROM node:22-bookworm-slim

WORKDIR /app

ARG INTERNAL_GIT_MIRROR=""
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Native build tools required to rebuild better-sqlite3 + bcrypt against glibc.
# We do NOT install Chromium via apt here — Playwright will download its own
# Chromium bundle during `pnpm install --prod` below (postinstall script).
# This is more reliable than apt-get on slim images and works offline on
# Gitea CI runners where the Debian repos may be unreachable.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    ca-certificates \
    curl \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled output from builder
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/

# Migrations resolved at runtime via defaultMigrationsDir() → join(dist/db, 'migrations').
COPY --from=builder /app/packages/server/src/db/migrations packages/server/dist/db/migrations

# Built-in skills resolved at runtime via join(dist/.., 'skills', 'builtin').
COPY --from=builder /app/packages/server/skills packages/server/skills

# Maintenance CLI (VACUUM / WAL checkpoint)
COPY --from=builder /app/packages/server/scripts packages/server/scripts

# Client static bundle served by the server in production (SPA fallback).
COPY --from=builder /app/packages/client/dist packages/client/dist

# Workspace manifests for production install. Legacy is included so pnpm can resolve
# workspace dependencies, but no legacy source is shipped — those packages have no runtime deps.
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=builder /app/packages/client/package.json packages/client/
COPY --from=builder /app/legacy/packages/server/package.json legacy/packages/server/
COPY --from=builder /app/legacy/packages/client/package.json legacy/packages/client/
COPY --from=builder /app/legacy/packages/e2e/package.json legacy/packages/e2e/

# Keep production install consistent with build stage URL rewrite for company network.
RUN if [ -n "$INTERNAL_GIT_MIRROR" ]; then \
    MIRROR="${INTERNAL_GIT_MIRROR%/}/"; \
    sed -i -E "s#https://codeload.github.com/kevinsisi/ai-core/tar.gz/([a-f0-9]+)#${MIRROR}ai-core/archive/\\1.tar.gz#g" pnpm-lock.yaml; \
    fi

# Force native module rebuild from source on the production glibc base.
RUN npm_config_build_from_source=true pnpm install --frozen-lockfile --prod --reporter=append-only

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV DATA_DIR=/app/packages/server/data

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
