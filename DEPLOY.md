# DEPLOY — project-bridge v1.4.0

Runbook for deploying project-bridge. Read top-to-bottom on first deploy; later deploys can jump to the **Deploy steps** section.

## What changed in v1.4.0

| Area | Before (1.3.x) | After (1.4.0) |
|---|---|---|
| AI provider | Direct `@google/generative-ai` (`new GoogleGenerativeAI(apiKey)`) in 24 files | Single `MultiProviderClient` from `@kevinsisi/ai-core` v3.4.1 (`packages/server/src/services/provider.ts`) |
| Routing | Gemini only, with key-pool retry wrapper | Text/chat/streaming: OpenCode primary with multi-server fallback → Gemini key-pool fallback → OpenAI/Codex configured fallback (`allowCrossProviderFallback: true`); cross-provider fallback NEVER silent |
| OpenAI auth | API key only (`OPENAI_API_KEY` env) | OAuth PKCE flow (Settings page button) **OR** API key |
| JSON output | `responseMimeType: 'application/json'` from Gemini SDK | `withJsonInstruction()` appends "respond with JSON only" to system prompt + `extractJsonBody()` strips fences before `JSON.parse` |
| `temperature` | Per-call value | **Dropped** — ai-core GenerateParams doesn't expose it; provider defaults |
| Multi-turn chat | Gemini `model.startChat({history}).sendMessageStream(...)` with `MAX_TOKENS` auto-continue | ai-core `streamContent({history, prompt})`; auto-continue removed (ai-core's `TokenUsage` carries no `finishReason`) |
| `routes/settings.ts` | Used Gemini SDK to validate keys | **Still uses Gemini SDK** for the 3 key-validation endpoints (test a specific user-supplied key without routing through MultiProviderClient) |

ai-core dependency is now pinned to tag `v3.4.1` (`AI_CORE_VERSION = "3.4.1"`). OpenCode multi-server configuration lives in `opencode_servers` (settings table) or `OPENCODE_SERVERS` (comma/newline-separated env fallback); always note configured endpoint count in handoff.

> **OpenCode auth posture is global, not per-server.** `OPENCODE_SERVER_PASSWORD` (or settings key `opencode_server_password`) applies to every configured OpenCode server (same pattern as sheet-to-car's `openCodeConfig.ts:getOpenCodePassword()`). All listed servers must share the same auth posture — either all no-auth (the canonical `provider-amd.sisihome.org` deployment in `home-basic/opencode/README.md` is no-auth) or all using this single password. Mixing a no-auth server and a password-protected server in the same list is unsupported: the adapter will still send a `Basic` `Authorization` header to the no-auth server.

## Affected files (for code review / rollback)

```
packages/server/src/services/provider.ts            # NEW — MultiProviderClient singleton + helpers
packages/server/src/routes/openaiOAuth.ts           # NEW — OAuth PKCE endpoints
packages/server/package.json                        # ai-core SHA + version 1.4.0
packages/server/.env                                # NEW — OPENAI_OAUTH_CLIENT_ID (gitignored)
docker-compose.yml                                  # OPENAI_OAUTH_CLIENT_ID + OAuth env passthrough
packages/client/src/pages/SettingsPage.tsx          # "OpenAI 授權連結" section + popup OAuth flow
packages/client/src/version.ts                      # 1.4.0
packages/client/package.json                        # 1.4.0
package.json                                        # 1.4.0
packages/server/src/index.ts                        # mount openaiOAuthRouter
# Migrated from Gemini SDK to MultiProviderClient (call sites only):
packages/server/src/routes/{chat,design,globalDesign,prototypes}.ts
packages/server/src/services/{agentSkills,artStyleExtractor,codeExporter,designExtractor,
                              designSpecAnalyzer,documentClassifier,intentClassifier,
                              masterAgent,pageStructureAnalyzer,plannerAgent,qualityScorer,
                              skillConflictChecker,specExtractor,specReviewAgent,subAgent,
                              urlStyleAnalyzer}.ts
```

## Environment variables (new in v1.4.0)

Place these in `packages/server/.env` for dev, or in `docker-compose.yml` `environment:` (already wired with defaults) for prod.

| Variable | Purpose | Default |
|---|---|---|
| **`PUBLIC_BASE_URL`** | **External URL the user's browser hits (e.g. `https://designbridge.housefun.com.tw`). Baked into the downloadable OpenAI auth helper so it knows where to POST tokens after sign-in. REQUIRED in prod — behind a reverse proxy the server can't reliably autodetect this.** | **— (must set)** |
| `OPENAI_OAUTH_CLIENT_ID` | OAuth PKCE public client_id | `app_EMoamEEZ73f0CkXaXp7hrann` (Codex CLI) |
| `OPENAI_OAUTH_AUTHORIZE_URL` | OAuth authorize endpoint | `https://auth.openai.com/oauth/authorize` |
| `OPENAI_OAUTH_TOKEN_URL` | OAuth token exchange endpoint | `https://auth.openai.com/oauth/token` |
| `OPENAI_OAUTH_SCOPE` | Requested scopes | `openid profile email offline_access` |
| `OPENAI_OAUTH_REDIRECT_URI` | Where OpenAI sends the user back | `${PUBLIC_BASE_URL}/api/openai-oauth/callback` (auto-built) |

> **Why `PUBLIC_BASE_URL` matters:** the OpenAI OAuth flow uses a downloadable Node helper (`/api/openai-oauth/helper`) that runs on the user's machine and POSTs the captured tokens back to this server. The server bakes its own URL into that helper at download time. Without `PUBLIC_BASE_URL`, the bake falls through to header-sniffing (`X-Forwarded-Host`, `Origin`, `Referer`, then `Host`) — fine in many setups, but if your reverse proxy strips or rewrites those headers, the helper will end up with a loopback URL like `http://localhost:3001` and ECONNREFUSED on token upload. Always set it explicitly in prod.

OAuth tokens themselves are stored in the `settings` table (`openai_oauth_access_token`, `openai_oauth_refresh_token`, `openai_oauth_expires_at`). They survive container restarts as long as `packages/server/data/` is volume-mounted.

## Deploy steps

### Local dev

```bash
git pull origin dev
pnpm install                                      # picks up the new ai-core SHA
# packages/server/.env already has OPENAI_OAUTH_CLIENT_ID committed-as-tracked? NO — it's gitignored.
# Make sure packages/server/.env exists with: OPENAI_OAUTH_CLIENT_ID=app_EMoamEEZ73f0CkXaXp7hrann
pnpm dev:server                                   # ts-node-dev on packages/server (port 3003)
pnpm dev:client                                   # Vite on packages/client (proxies API to :3003)
```

### Docker (single-host)

```bash
git pull origin dev
docker compose pull                               # if image already published by CI
# OR rebuild locally:
docker compose build --network=host               # --network=host required (Gitea runner constraint, see CLAUDE.md)
docker compose up -d
docker compose logs -f project-bridge             # tail until "Server listening on 0.0.0.0:3001"
```

### Production (Gitea CI → ArgoCD)

CI lives in `.gitea/workflows/docker-build.yaml`:
1. Push to `dev` branch on Gitea remote (this is what `git push origin <branch>:dev` already does)
2. Gitea runner builds `kevin950805/project-bridge:<sha>` and pushes to `srvhpgit1:32050`
3. ArgoCD syncs the deployment manifest
4. Verify the Settings page → OpenAI 授權連結 section appears at `https://designbridge.housefun.com.tw/settings`

If `PUBLIC_BASE_URL` isn't set in the production env, override `OPENAI_OAUTH_REDIRECT_URI` directly. The redirect URI MUST be registered with whatever issued the `client_id` — for the default Codex CLI client_id, the registered redirect is what the Codex CLI uses; if your prod URL doesn't match, the OAuth round-trip will fail at `auth.openai.com` with `redirect_uri_mismatch`.

## OpenAI OAuth flow (end-user)

1. User opens **Settings → OpenAI 授權連結** section
2. Clicks **使用 OpenAI 授權**
3. Frontend `POST /api/openai-oauth/start` — server generates `code_verifier`, derives `code_challenge` (S256), stores `state` + verifier in settings table, returns `authorizeUrl`
4. Frontend opens `authorizeUrl` in a popup window (560×720)
5. User signs in to OpenAI, approves the scopes
6. OpenAI redirects to `GET /api/openai-oauth/callback?code=…&state=…`
7. Server validates `state` (CSRF), exchanges `code` + `code_verifier` for tokens at `OPENAI_OAUTH_TOKEN_URL`
8. Server stores `access_token` / `refresh_token` / `expires_at` in `settings`, calls `invalidateProvider()` so the next AI call rebuilds the MultiProviderClient with the OAuth credential
9. Callback page posts `{ source: 'openai-oauth', ok: true }` to `window.opener` and self-closes
10. Settings page re-fetches `/api/openai-oauth/status`, badge flips to "已連結"

To disconnect: **DELETE /api/openai-oauth** clears all OAuth settings rows and re-invalidates the provider.

## Operational notes / gotchas

- **JSON output reliability** — Gemini 2.5 Flash follows the appended JSON-only instruction reliably; failures bubble up via `extractJsonBody()` + try/catch in each caller. If you see "JSON parse failed" warnings spike, suspect a model behaviour shift, not infrastructure.
- **`settings.ts` keeps Gemini SDK** — by design. Those 3 endpoints (`POST /api-keys`, `POST /validate-key`, `POST /api-keys/batch-validate`) need to test a specific user-supplied Gemini key. Routing through MultiProviderClient would let the route policy fall back to OpenAI and silently approve invalid Gemini keys. Do NOT migrate these.
- **No `temperature` knob** — calls that previously used `temperature: 0` for deterministic output (classifiers, validators) now use the provider default. If output drift appears, add explicit "deterministic, no creativity" wording to the system prompt rather than reaching for the param.
- **Multi-turn chat history** — `routes/chat.ts` converts Gemini's `parts: [{text}]` history shape to ai-core's `parts: string` shape inline (search for `aiCoreHistory`). If you add new history-bearing call sites, do the same conversion.
- **Telemetry** — `trackProviderUsage()` writes to `api_key_usage` keyed by `selection.credentialRef` last-4. For OAuth credentials this will be the access_token suffix, not a Gemini key suffix; the existing per-key dashboards still work but the "key" being shown is actually an OpenAI access_token reference.
- **Cache invalidation** — `getProvider()` caches the client until `OPENAI_API_KEY` env, `openai_api_key` setting, or `openai_oauth_access_token` setting changes (snapshot-based). The OAuth callback explicitly calls `invalidateProvider()` so the next call rebuilds adapters.
- **ai-core SHA pinning** — `packages/server/package.json` pins to a specific commit (currently `0e94858…`). Don't switch to a tag/branch — Gitea CI replays via the URL and a moving target breaks reproducible builds.
- **Gitea vs GitHub** — `origin` fetches from Gitea, pushes to Gitea + GitHub. CI in Gitea uses Gitea URL for ai-core; GitHub Actions (if any) uses GitHub URL. Don't hardcode either.

## Rollback

If v1.4.0 needs to be rolled back:
1. `git revert <merge-commit-sha>` on `dev` (or check out the pre-1.4.0 tag)
2. `pnpm install` to restore the older ai-core SHA
3. Stored OAuth tokens in `settings` table are harmless — older code won't read them. Optionally `DELETE FROM settings WHERE key LIKE 'openai_oauth%'` if you want a clean state.
4. Older code expects `responseMimeType` / `temperature` in `generationConfig`; those still work because v1.3.x called Gemini directly. No migration needed.

## Verifying a deploy

```bash
# Health
curl -fsS https://designbridge.housefun.com.tw/api/health
# Version (visible in client bundle)
curl -fsS https://designbridge.housefun.com.tw/ | grep -i version
# OAuth endpoint reachable (should return JSON with clientIdConfigured: true)
curl -fsS https://designbridge.housefun.com.tw/api/openai-oauth/status
```

After connecting OAuth via the UI:
```bash
# Should now show connected: true
curl -fsS https://designbridge.housefun.com.tw/api/openai-oauth/status \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

Then trigger any AI feature (e.g. send a chat message) and check server logs for:
```
[provider] selected provider=openai model=gemini-2.5-flash cred=oauth:openai-oauth
```
That single log line confirms the route policy picked OpenAI and the OAuth credential is in use.
