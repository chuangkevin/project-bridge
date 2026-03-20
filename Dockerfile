FROM node:22-alpine AS builder

WORKDIR /app

# Native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/

# Build server (TypeScript → dist/)
RUN pnpm --filter server build

# Build client (Vite → dist/)
RUN pnpm --filter client build

# --- Production stage ---
FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy server build + deps
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/packages/server/src/db/migrations packages/server/dist/db/migrations
COPY --from=builder /app/packages/server/src/prompts packages/server/dist/prompts
COPY --from=builder /app/packages/server/data packages/server/data
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/packages/server/node_modules packages/server/node_modules

# Copy client build (served by Express static or separate)
COPY --from=builder /app/packages/client/dist packages/client/dist

# Copy workspace config for pnpm
COPY package.json pnpm-workspace.yaml ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

# Start server (serves API; client build can be served via nginx or same Express)
CMD ["node", "packages/server/dist/index.js"]
