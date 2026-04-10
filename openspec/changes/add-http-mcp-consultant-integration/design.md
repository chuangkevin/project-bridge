## Overview

這個 change 的目標是讓 `project-bridge` 可以連接「自架 HTTP MCP server」，並先把能力接到顧問模式。

第一個已知目標 server：
- `mssql-mcp`
- endpoint: `http://srvhpgit1:32500/mcp`
- transport: `http`

第一階段不做通用 agent runtime，而是做一個安全、可控的 consultant-side MCP integration。

## Scope

### In scope

- HTTP MCP server registry
- HTTP MCP tool discovery
- HTTP MCP tool execution
- 顧問模式中的工具查證流程
- timeout / retry / white-list policy
- tool execution logging
- Settings 頁中的 MCP server 設定與測試

### Out of scope

- stdio transport
- 設計模式 agent 自由呼叫 MCP
- 多 agent tool chaining runtime
- prompt 自主生成任意工具計畫的 full agent framework

## Architecture

### 1. MCP Registry

新增 MCP server 設定儲存，至少包含：

- `id`
- `name`
- `transport`，第一階段固定為 `http`
- `endpoint`
- `enabled`
- `scope`，第一階段支援 `consultant`
- `allowedTools`，白名單
- `timeoutMs`
- `createdAt` / `updatedAt`

建議由 SQLite 管理，讓 project-bridge 可以持久保存設定。

升級相容性：

- 若部署環境中存在舊版 `mssql-mcp` 預設設定（缺少 `useRecommendedTools`，但使用預設 endpoint 與空 allowlist），runtime 可將其視為 legacy default shape 並套用推薦白名單。
- 這個相容行為必須足夠窄，避免覆蓋一般自訂 server 或非預設 endpoint 的空 allowlist 設定。

### 2. HTTP MCP Client Layer

新增 server-side MCP client，封裝：

- initialize / handshake
- list tools
- call tool
- timeout
- retry
- response normalization

這層只負責 protocol interaction，不處理顧問模式邏輯。

### 3. MCP Policy Layer

需要一層明確 policy，避免顧問模式失控使用外部工具。

第一階段 policy：

- 只有顧問模式可用
- 只有 `enabled` server 可用
- 只有 `allowedTools` 白名單內工具可呼叫
- 每次回答最多呼叫固定數量 tools
- 每次 tool call 必須設 timeout
- tool failure 不可阻塞整個聊天請求太久

### 4. Consultant Integration

顧問模式流程要改成：

1. 判斷這輪問題是否需要外部 grounding
2. 根據可用 server 與 tool 白名單，建立可用工具上下文
3. 若 LLM 決定需要查證，先執行 MCP tool call
4. 收到結果後，把結果標記為 evidence 再回給模型
5. 最終回答中區分：
   - 文件/技能/對話脈絡
   - MCP 查證結果
   - 模型推論

第一階段建議從明確的 consultant sub-mode 開始：

- `spec-review`
- `architecture-review`

這兩種模式最需要真實查證。

### 5. Logging and Observability

需要保存基本 execution log，至少包含：

- `conversationId`
- `projectId`
- `serverName`
- `toolName`
- `success`
- `durationMs`
- `errorSummary`
- `requestSummary`
- `responseSummary`

目的：

- debug tool failures
- review MCP 是否真的有幫助
- 避免隱性成本與 latency 失控

### 6. Settings UI

Settings 頁新增 MCP Servers 區塊。

第一階段 UI 功能：

- 新增 server
- 編輯名稱 / endpoint / enabled / allowed tools / timeout
- Test connection
- List tools
- 顯示最近一次測試結果

對已知 server 可提供明確的推薦白名單切換，而不是用空白 allowlist 承載雙重語意。第一個例子是 `mssql-mcp`：

- recommended tools: `get-table-schema`, `list-all-tables`
- admin 應能明確知道目前是「使用建議白名單」還是「自訂 allowlist」

第一階段不需要做複雜權限管理 UI。

## Failure Handling

### Tool discovery failure

- 不阻塞整個設定頁
- 顯示 server unreachable / auth failed / invalid response

### Tool execution failure

- 顧問模式仍可回答
- 但必須明說：「MCP 查證失敗，以下為基於現有文件與推理的回答」

### LLM stream parsing failure

- 如果 Gemini streaming SDK 在顧問模式拋出 `Failed to parse stream`，應自動降級成非串流回答
- 在降級前，先重試一次 streaming
- 降級後仍需保留既有 `MAX_TOKENS` auto-continue 行為，避免只拿到半段答案

### Timeout

- 單次 tool call 超時後立刻終止等待
- 不可讓單一 server 拖垮整個 chat request

## Rollout Plan

### Phase 1

- 支援 HTTP transport
- 支援單個或少量自架 MCP server
- 顧問模式使用
- 驗證 `mssql-mcp`

### Phase 2

- 支援更多 HousePrice server，如 `elasticsearch`、`gitea`
- 強化 tool policy
- 強化 audit/logging UI

### Phase 3

- 評估是否擴到設計模式或子代理流程

## Open Questions

- `project-bridge` 要自己實作 MCP protocol client，還是導入現成 JS MCP SDK？
- 自架 HTTP MCP server 是否需要額外 auth header 或內網 proxy？
- tool schema 是否完全相容標準 MCP，還是需要 house adapter？
- tool call 是否要在 UI 中顯示「本輪用到了哪些 MCP tools」？
