# project-bridge Memory Index

- [Project Overview](project.md) — pnpm monorepo, ai-core key-pool, Socket.io collaboration, 61 E2E tests

## 2026-04-13 notes
- `@kevinsisi/ai-core` server dependency pin upgraded from `fe8f85c` to `9586c31` to align with the latest shared-library HEAD and key-manager trusted-export integration guidance.
- Full verification for this upgrade must use live web E2E after deploy, not just local health/build checks.
- `packages/e2e/playwright.live.config.ts` now targets the live site directly, and web E2E specs read `PLAYWRIGHT_API_BASE_URL` instead of hardcoding `http://localhost:3001`.
- Latest full live web E2E run executed against `designbridge.sisihome.org`: smoke passed, but the broader suite still contains many stale assumptions (old auth flow, old architecture tab labels, outdated generation iframe readiness selectors, and missing fixture files). Treat the live harness as working, but the suite itself still needs cleanup before it can be a reliable release gate.
