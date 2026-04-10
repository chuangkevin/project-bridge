## 1. Image Publishing

- [x] 1.1 Publish both `latest` and `${GITHUB_SHA}` tags from docker-publish workflow

## 2. Deploy Pinning

- [x] 2.1 Make workflow_run deploy checkout the exact `head_sha`
- [x] 2.2 Resolve deployment image tag from `workflow_run.head_sha`
- [x] 2.3 Require explicit `image_tag` for manual deploys
- [x] 2.4 Write `IMAGE_TAG` to server-side deployment environment before `docker compose pull/up`

## 3. Compose Runtime

- [x] 3.1 Make docker-compose image reference use `${IMAGE_TAG}` instead of hard-coded `latest`

## 4. Verification

- [x] 4.1 Reviewer pass for workflow correctness
- [ ] 4.2 Verify live deployment image matches the workflow SHA after the next deploy
