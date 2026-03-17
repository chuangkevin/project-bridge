## ADDED Requirements

### Requirement: Store platform shell HTML per project
系統 SHALL 允許每個專案儲存一份 platform shell HTML，作為所有 `in-shell` 生成的外框架。

#### Scenario: Save shell via PUT
- **WHEN** 呼叫 `PUT /api/projects/:id/platform-shell`，body 為 `{ shellHtml: string }`
- **THEN** 系統 SHALL 將 shellHtml 存入 `platform_shells` 資料表，回傳 `{ shell: { projectId, shellHtml, updatedAt } }`

#### Scenario: Get shell
- **WHEN** 呼叫 `GET /api/projects/:id/platform-shell`
- **THEN** 系統 SHALL 回傳 `{ shell: { shellHtml } }` 或 `{ shell: null }` 若尚未設定

#### Scenario: Extract shell from existing prototype
- **WHEN** 呼叫 `POST /api/projects/:id/platform-shell/extract`
- **THEN** 系統 SHALL 讀取當前 prototype version HTML，解析出 `<nav>`, `<header>`, `<aside>`, `<footer>` 結構，移除 `<main>` 內容並插入 `{CONTENT}` 佔位符，儲存為 shell，回傳 `{ shell: { shellHtml } }`

#### Scenario: No prototype to extract from
- **WHEN** 呼叫 extract 但專案無任何原型版本
- **THEN** 系統 SHALL 回傳 HTTP 404，`{ error: 'No prototype version found' }`

### Requirement: Shell HTML must contain {CONTENT} placeholder
系統 SHALL 在儲存 shell HTML 前驗證其包含 `{CONTENT}` 佔位符。

#### Scenario: Save without placeholder
- **WHEN** PUT shell body 的 shellHtml 不包含 `{CONTENT}`
- **THEN** 系統 SHALL 自動在 `</body>` 前插入 `<main>{CONTENT}</main>`，確保佔位符存在

#### Scenario: Save with placeholder
- **WHEN** shellHtml 已含 `{CONTENT}`
- **THEN** 系統 SHALL 直接儲存，不修改內容
