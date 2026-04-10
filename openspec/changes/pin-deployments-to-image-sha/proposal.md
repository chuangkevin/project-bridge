## Why

目前 deploy 流程只依賴 `latest` image tag，無法可靠保證某次 commit 對應的 image 就是線上那版。

這會造成：

- CI/CD success 但 live 環境難以精確對應到某個 commit
- API 行為驗證容易混淆新舊版本
- 發生回歸時難以追查是哪個 image 真正被部署

## What Changes

- Build workflow 同時推送 `latest` 與 `${GITHUB_SHA}` image tag
- Deploy workflow 以 `workflow_run.head_sha` 決定要部署的 image tag
- `docker-compose.yml` 改用 `${IMAGE_TAG}` 而不是硬寫 `latest`
- `workflow_dispatch` deploy 需明確指定 `image_tag`

## Success Criteria

- 每次 push 到 `main` 後，部署摘要能明確顯示 `${GITHUB_SHA}` image tag
- live server 不再只能依 `latest` 猜版本
