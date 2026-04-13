## Why

`project-bridge` 已經使用 ai-core 的 lease-aware key pool，但目前 pin 在 `fe8f85c`。workspace 內的 `ai-core` HEAD 已補了 key-manager trusted export 的整合說明與最新 package state，`project-bridge` 應與最新 HEAD 對齊，避免消費者與 shared library 文件/commit 漂移。

## What Changes

- 將 `packages/server/package.json` 的 `@kevinsisi/ai-core` pin 升級到最新 HEAD commit。
- 更新 `pnpm-lock.yaml` 對應 tarball。
- 補記憶/文件說明目前 pin 與升級依據。

## Impact

- `packages/server/package.json`
- `pnpm-lock.yaml`
- version/docs/memory sync
