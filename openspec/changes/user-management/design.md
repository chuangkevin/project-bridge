## Context

Project Bridge 目前是完全開放的多人共用環境。唯一的保護是 Settings 頁面的 admin 密碼。所有專案的 CRUD 對任何人開放，沒有使用者概念，也沒有 owner 追蹤。

現有相關表結構：
- `projects`：無 owner_id
- `annotations`：無 user_id
- `settings`：存 admin_password_hash / admin_session_token（單一 admin 概念）

現有 auth 路由：`/api/auth/setup`、`/api/auth/verify`、`/api/auth/change`，搭配 settings middleware 使用 Bearer token。

## Goals / Non-Goals

**Goals:**
- 建立多使用者系統，區分 admin 和一般 user
- 專案有 owner，控制誰能刪除/修改
- 標註為共同可見的協作評論
- Fork 機制讓使用者複製別人的專案
- 合併現有 admin 密碼系統
- GitHub 式破壞操作確認

**Non-Goals:**
- 密碼登入（使用無密碼的選名字登入）
- 細粒度權限（如 per-project 邀請）
- 即時協作（WebSocket）
- 使用者頭像/個人資料
- 專案群組/資料夾

## Decisions

### D1: 使用者識別 — 無密碼 + Session Token

**選擇**：登入頁列出所有使用者，點名字即登入，session 存在 localStorage。

**替代方案**：帳號+密碼 → 拒絕，因為內網工具密碼管理成本太高，使用者會忘記。

**實作**：
- 新增 `users` 表：`id, name, role ('admin'|'user'), is_active, created_at`
- 新增 `sessions` 表：`id, user_id, token, expires_at, created_at`
- Login API：POST /api/auth/login `{ userId }` → 建立 session，回傳 token
- 前端：token 存 `localStorage('pb_session_token')`，所有 API 請求帶 `Authorization: Bearer <token>`
- Session TTL：7 天（內網工具不需要太短）

### D2: 權限中介層 — Express middleware

**選擇**：建立 `authMiddleware` 和 `requireAdmin` 兩個 middleware。

**實作**：
- `authMiddleware`：解析 Bearer token → 查 sessions 表 → 將 `req.user` 設為 `{ id, name, role }`
- `requireAdmin`：檢查 `req.user.role === 'admin'`，否則 403
- `requireOwnerOrAdmin(paramName)`：檢查 project owner_id === req.user.id 或 role === admin
- 套用範圍：所有 `/api/projects/*` 路由（authMiddleware）；`/api/settings/*`、`/api/users/*`（requireAdmin）

### D3: 專案 owner — Migration 策略

**選擇**：projects 表新增 `owner_id TEXT`，migration 時將所有現有專案指派給 admin 使用者。

**問題**：migration 跑的時候 admin 使用者還不存在。

**解法**：migration 只加欄位，不填值。首次建立 admin 時（首位使用者），執行 `UPDATE projects SET owner_id = ? WHERE owner_id IS NULL`。

### D4: 標註共同可見 — annotations 加 user_id

**選擇**：annotations 表新增 `user_id TEXT`，顯示時標示誰寫的。

**實作**：
- 標註卡片顯示使用者名稱
- 所有人都能在所有專案上建立標註
- 刪除標註：只有標註作者或 admin 可以刪

### D5: Fork — Server-side copy

**選擇**：POST /api/projects/:id/fork，server 端複製資料。

**複製範圍**：
- ✅ prototype_versions（只複製 is_current = 1 的版本）
- ✅ arch_data（從 projects 表複製）
- ✅ page_element_mappings（產生新 ID）
- ❌ annotations（不複製）
- ❌ conversation_messages（不複製）
- ❌ design_profile（不複製）

**命名**：`{原名} (fork)`

### D6: 現有 admin 密碼系統遷移

**選擇**：移除 settings 中的 admin_password_hash/session 相關欄位，改用 users/sessions 系統。

**遷移步驟**：
1. 新 migration 建立 users / sessions 表
2. Settings middleware 改為檢查 `req.user.role === 'admin'`
3. 移除 /api/auth/setup、/api/auth/verify、/api/auth/change 路由
4. 新增 /api/auth/login、/api/auth/logout、/api/auth/me 路由
5. SettingsPage 移除密碼輸入，改為自動檢查登入使用者角色

### D7: 首頁改版

**實作**：
- GET /api/projects 回傳 owner_id 和 owner_name
- 前端分兩區渲染：「我的專案」在上、「其他人的專案」在下
- 專案卡片新增 owner 名稱顯示
- 刪除按鈕：只在 owner 或 admin 時顯示

### D8: 破壞操作確認 — ConfirmDialog 元件

**選擇**：建立可重用的 `DestructiveConfirmDialog` 元件。

**Props**：`{ open, title, warningText, confirmName, onConfirm, onCancel }`
- 使用者需輸入 `confirmName` 才能啟用確認按鈕
- 紅色警告樣式

## Risks / Trade-offs

- **[無密碼 = 可冒充]** → 接受，內網環境信任度高。未來可疊加密碼。
- **[首次 migration 無法指派 owner]** → 延遲到首位使用者建立時補填。
- **[Session 存 localStorage 不如 httpOnly cookie 安全]** → 接受，內網工具。
- **[Fork 大專案可能耗時]** → 目前資料量小，同步複製即可。未來可改非同步。
- **[現有 admin 密碼使用者需重新設定]** → Breaking change，第一次訪問需建立 admin 帳號。

## Migration Plan

1. 部署新版 → migration 自動跑，建立 users/sessions 表、projects 加 owner_id
2. 首次訪問 → 顯示 "Create Admin" 頁面
3. Admin 建立後 → 自動把所有現有專案的 owner_id 指派給 admin
4. 舊 admin 密碼/session 資料保留但不再使用
5. Rollback：還原 migration，恢復舊 auth 路由
