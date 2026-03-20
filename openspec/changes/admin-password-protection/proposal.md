## Why

設定頁面（API Key 管理、Token Usage、Model 選擇）目前完全沒有存取控制。任何連上 LAN 的同事都可以刪除 API key，導致服務中斷。需要一個簡單的密碼保護機制，只有管理員才能進入設定頁面。

## What Changes

- **管理員密碼設定**：首次使用時設定密碼（存在 DB settings 表，bcrypt hash）
- **設定頁面鎖定**：進入設定頁面前需要輸入密碼
- **Session 記憶**：驗證通過後在 sessionStorage 保存 token，同一 tab 不需重複輸入
- **密碼變更**：在設定頁面內可以更改管理員密碼
- **API 保護**：`/api/settings/*` 路由需要 Authorization header

## Capabilities

### New Capabilities
- `admin-auth`: 管理員密碼驗證 — POST /api/auth/verify 驗證密碼，POST /api/auth/setup 首次設定，POST /api/auth/change 變更密碼
- `settings-guard`: 設定頁面前置密碼輸入彈窗，sessionStorage token 快取

### Modified Capabilities
*None*

## Impact

- **Server**: 新增 auth.ts route（setup/verify/change），settings.ts 加 middleware 驗證 token
- **Client**: SettingsPage 加密碼輸入彈窗，sessionStorage 管理
- **DB**: settings 表新增 admin_password_hash 記錄
- **Dependencies**: bcryptjs（純 JS，不需 native build）
