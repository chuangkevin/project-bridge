## Why

Project Bridge 目前沒有使用者概念，所有人共用同一個環境，任何人可以刪除、修改任何專案。在多人協作場景下，需要區分「誰建的」「誰能刪」，並讓管理員控制存取權限。現有的 admin 密碼機制只保護 Settings 頁面，無法覆蓋專案層級的權限控制。

## What Changes

- 新增使用者系統：users 資料表、登入（選名字，無密碼）、首位登入者自動成為管理員
- 新增角色權限：管理員（全權限）vs 一般用戶（查看/標註所有、只能刪自己的）
- 專案加入 owner 概念：projects 表新增 `owner_id` 欄位
- 標註加入使用者識別：annotations 表新增 `user_id`，標註為共同可見的評論
- 新增 Fork 功能：一般用戶可以 fork 別人的專案（複製 HTML + 架構圖 + page-mappings）
- 首頁改版：分為「我的專案」和「其他人的專案」兩區，卡片顯示 owner 名字
- 破壞性操作確認：刪除專案/使用者需 GitHub 式輸入名稱確認
- 管理員功能：管理使用者（新增/停用/刪除）、轉移管理權
- **BREAKING**：合併現有 admin 密碼系統，Settings 改為管理員角色權限控制

## Capabilities

### New Capabilities
- `user-auth`: 使用者登入/登出、session 管理、首位登入者自動管理員、管理員轉移
- `user-roles`: 角色權限矩陣（admin/user）、專案 CRUD 權限控制、API middleware
- `project-ownership`: 專案 owner 概念、owner 顯示、權限檢查
- `project-fork`: Fork 別人的專案（複製 HTML + 架構圖 + page-mappings）
- `user-admin-panel`: 管理員的使用者管理介面（新增/停用/刪除/轉移管理權）
- `destructive-confirm`: GitHub 式破壞操作確認（輸入名稱才能刪除）

### Modified Capabilities
（無現有 spec 需修改）

## Impact

- **資料庫**：新增 users 表、sessions 表；修改 projects 表（加 owner_id）、annotations 表（加 user_id）
- **API**：所有 /api/projects/* 路由加入權限中介層；新增 /api/auth/*、/api/users/* 路由
- **前端**：新增登入頁、使用者管理頁；首頁改版（分區+owner 顯示）；toolbar 加入使用者資訊；fork 按鈕
- **現有功能**：admin 密碼系統移除，改由管理員角色控制 Settings 存取
- **Dependencies**：無新外部依賴（沿用 bcryptjs、uuid）
