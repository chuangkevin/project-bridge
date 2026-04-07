# Tasks - CI/CD Fix

## ✅ Core Fixes
- [x] 更新 `packages/server/package.json` 指向 GitHub
- [x] 手動同步 `pnpm-lock.yaml` 為 GitHub URL
- [x] 刪除 `packages/server/.npmrc`
- [x] 修改 `Dockerfile` Builder 為 `node:22-bookworm` (Debian)
- [x] 修正 `Dockerfile` 中的 build tools 安裝指令 (apt-get)

## ✅ Hybrid Support
- [x] 增加 `INTERNAL_GIT_MIRROR` (ARG) 至 `Dockerfile` 支援 Git `insteadOf`
- [x] 更新 `.gitea/workflows/docker-build.yaml` 傳入內網鏡像位址

## ✅ Deployment Fix
- [x] 修改 `.github/workflows/deploy.yml` 同時清理 `project-bridge` 與 `projectbridge` 容器

## ✅ Documentation & Memory
- [x] 更新 `CLAUDE.md` 記錄最新 CI/CD 與 Docker 規範
- [x] 建立 `openspec/changes/ci-cd-fix/` 記錄變更
