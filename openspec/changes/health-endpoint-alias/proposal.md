## Why

`project-bridge` 線上站點可開啟，但 `https://designbridge.sisihome.org/health` 目前會回 SPA `index.html`，而不是後端健康檢查 JSON。這讓外部監控、反向代理檢查與 workspace 驗證規則都失真。

## What Changes

- 在 Express server 提供 `/health` 與 `/api/health` 等價健康檢查。
- 更新 deploy workflow 的 health check 改打 `/health`。
- 同步版本與 workspace 文件，避免 docs 停留在舊版 `v1.0.3`。

## Impact

- `packages/server/src/index.ts`
- `.github/workflows/deploy.yml`
- version/docs/memory sync
