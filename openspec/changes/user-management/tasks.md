## 1. 資料庫 Migration

- [x] 1.1 建立 migration：建立 `users` 表（id, name, role, is_active, created_at）
- [x] 1.2 建立 migration：建立 `sessions` 表（id, user_id, token, expires_at, created_at）
- [x] 1.3 建立 migration：`projects` 表新增 `owner_id TEXT` 欄位
- [x] 1.4 建立 migration：`annotations` 表新增 `user_id TEXT` 欄位

## 2. 後端 Auth 系統

- [x] 2.1 建立 authMiddleware：解析 Bearer token → 查 sessions → 設定 req.user
- [x] 2.2 建立 requireAdmin middleware：檢查 req.user.role === 'admin'
- [x] 2.3 建立 requireOwnerOrAdmin middleware：檢查 project owner_id 或 admin
- [x] 2.4 新增 POST /api/auth/login：接收 userId，建立 session，回傳 token
- [x] 2.5 新增 POST /api/auth/logout：清除 session
- [x] 2.6 新增 GET /api/auth/me：回傳當前使用者資訊
- [x] 2.7 新增 GET /api/users：列出所有使用者（公開，供登入頁使用）

## 3. 使用者管理 API

- [x] 3.1 新增 POST /api/users：管理員建立使用者（name, role 預設 user）
- [x] 3.2 首位使用者自動成為 admin：POST /api/users/setup（系統無使用者時呼叫）
- [x] 3.3 新增 PATCH /api/users/:id/disable：管理員停用使用者（清除 sessions）
- [x] 3.4 新增 PATCH /api/users/:id/enable：管理員啟用使用者
- [x] 3.5 新增 DELETE /api/users/:id：管理員刪除使用者（專案轉給 admin）
- [x] 3.6 新增 POST /api/users/transfer-admin：管理員轉移管理權

## 4. 專案權限整合

- [x] 4.1 所有 /api/projects/* 路由加入 authMiddleware
- [x] 4.2 POST /api/projects：建立時自動設定 owner_id = req.user.id
- [x] 4.3 DELETE /api/projects/:id：加入 requireOwnerOrAdmin 檢查
- [x] 4.4 PUT/PATCH 修改類路由：加入 requireOwnerOrAdmin 檢查
- [x] 4.5 POST /api/projects/:id/chat：加入 requireOwnerOrAdmin 檢查（生成）
- [x] 4.6 GET /api/projects：回傳 owner_id 和 owner_name（JOIN users）
- [x] 4.7 首位 admin 建立時，將所有 owner_id IS NULL 的專案指派給 admin

## 5. 標註使用者識別

- [x] 5.1 POST annotations：新增時帶入 req.user.id
- [x] 5.2 GET annotations：回傳時 JOIN users 取得標註者名稱
- [x] 5.3 DELETE annotations：只有作者或 admin 可以刪除

## 6. Fork 功能

- [x] 6.1 新增 POST /api/projects/:id/fork：複製 HTML + arch_data + page_mappings
- [x] 6.2 Fork 時產生新 project（owner = req.user）、新 prototype_version、新 mapping IDs
- [x] 6.3 Fork 後回傳新專案 ID

## 7. 合併現有 Admin 密碼系統

- [x] 7.1 Settings middleware 改為檢查 req.user.role === 'admin'（取代 Bearer token 驗證）
- [x] 7.2 移除 /api/auth/setup、/api/auth/verify、/api/auth/change 舊路由
- [x] 7.3 保留 settings 表中的 API key 等設定，移除 admin_password_hash 等欄位

## 8. 前端 — 登入頁

- [x] 8.1 建立 LoginPage.tsx：列出所有使用者，點擊登入
- [x] 8.2 建立 SetupPage.tsx：系統無使用者時，顯示「建立管理員」表單
- [x] 8.3 App.tsx 加入路由守衛：未登入 → 導向 /login
- [x] 8.4 localStorage 存取 session token，API 請求自動帶 Authorization header

## 9. 前端 — 首頁改版

- [x] 9.1 首頁分兩區：「我的專案」和「其他人的專案」
- [x] 9.2 專案卡片顯示 owner 名字
- [x] 9.3 刪除按鈕：只在 owner 或 admin 時顯示
- [x] 9.4 新增 Fork 按鈕（在別人的專案卡片上）

## 10. 前端 — Workspace 權限 UI

- [x] 10.1 非 owner 時：停用生成/重新生成按鈕、樣式編輯、頁面對應儲存
- [x] 10.2 非 owner 時：顯示 Fork 按鈕在 toolbar
- [x] 10.3 非 owner 時：標註仍可正常使用
- [x] 10.4 Toolbar 顯示當前使用者名稱 + 登出按鈕

## 11. 前端 — 使用者管理面板

- [x] 11.1 SettingsPage 新增「使用者管理」區塊（admin only）
- [x] 11.2 使用者列表：顯示名稱、角色、狀態、建立時間
- [x] 11.3 新增使用者表單
- [x] 11.4 停用/啟用按鈕
- [x] 11.5 刪除使用者：DestructiveConfirmDialog（輸入名稱確認）
- [x] 11.6 轉移管理權：DestructiveConfirmDialog（輸入目標名稱確認）

## 12. 前端 — DestructiveConfirmDialog 元件

- [x] 12.1 建立可重用的 DestructiveConfirmDialog 元件（紅色警告、名稱確認輸入）
- [x] 12.2 替換現有的刪除專案 confirm dialog
- [x] 12.3 套用到刪除使用者、轉移管理權

## 13. 測試

- [x] 13.1 API 測試：使用者 CRUD（建立、停用、刪除、轉移）
- [x] 13.2 API 測試：登入/登出/session 管理
- [x] 13.3 API 測試：權限矩陣（owner/non-owner/admin 對各操作的存取）
- [x] 13.4 API 測試：Fork 功能
- [x] 13.5 API 測試：標註帶 user_id + 刪除權限
- [ ] 13.6 E2E 測試：登入流程 + 首頁分區顯示
- [ ] 13.7 E2E 測試：非 owner 操作限制 + Fork
- [ ] 13.8 E2E 測試：管理員使用者管理面板
