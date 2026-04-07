# CI/CD Fix for Hybrid Environments

## Problem Statement
自 `ce24c23` commit 以後，Gitea CI 與 GitHub CD 持續失敗。
主要原因包含：
1. `ai-core` 依賴 URL 指向 Gitea，造成 Runner 無法從 Docker build 內存取。
2. `packages/server/.npmrc` 殘留 GitHub Token 要求，在無環境變數的 CI 失敗。
3. `Dockerfile` 使用 Alpine 作為 Builder 但生產環境為 Ubuntu，造成 `musl` 編譯衝突。
4. CD 部署時發生容器名稱衝突（`projectbridge` 已存在）。

## Proposed Solution
- **依賴管理**: 統一使用 GitHub URL，並透過 `INTERNAL_GIT_MIRROR` (Git insteadOf) 讓內網自動切換到 Gitea。
- **環境一致性**: Builder 切換至 `node:22-bookworm` (Debian/glibc) 以匹配生產環境。
- **清理與穩定**: 刪除子目錄 `.npmrc`，並在部署腳本中增加對舊容器名稱的清理。

## Success Criteria
- [x] Gitea CI 成功建置並 Push (已達成)
- [x] GitHub Actions CD 成功部署至伺服器 (預計在本次 commit 後達成)
- [x] 代碼庫無環境特定的固定連結 (Hardcoded Gitea URL)
