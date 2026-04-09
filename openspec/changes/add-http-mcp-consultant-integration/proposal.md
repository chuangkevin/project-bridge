## Why

目前 `project-bridge` 的顧問模式主要依賴：
- 上傳文件內容
- 本地 skills 知識庫
- LLM 推理

這對一般產品/設計討論足夠，但對於需要外部事實查證的任務仍然不夠，例如：
- 查 SQL table schema
- 查實際 Swagger / OpenAPI
- 查 repo 或文件系統中的真實內容
- 驗證文件中的欄位、索引、資料是否存在

目前 HousePrice/HPSkills 生態已經有自架 MCP server，至少包含 `mssql-mcp`，且是 HTTP transport：

```bash
claude mcp add mssql-mcp -s user -t http http://srvhpgit1:32500/mcp
```

因此 `project-bridge` 需要先支援「連接自架 HTTP MCP server」，讓顧問模式從純文字推理升級為可查證的 grounded consultant。

## What Changes

- 新增 `project-bridge` 的 HTTP MCP client 能力
- 新增 MCP server registry 與設定資料模型
- 顧問模式可在需要時查詢 MCP tools，再用結果回答使用者
- 第一階段只支援 `consultant mode` 使用 MCP
- 第一階段只支援 `HTTP transport`
- 第一個驗證目標 server 為 `mssql-mcp`

## Non-Goals

- 不在這個 change 內支援 `stdio` MCP transport
- 不在這個 change 內開放設計模式生成 agent 任意呼叫 MCP
- 不在這個 change 內做全自動 multi-step agent orchestration
- 不在這個 change 內處理所有 MCP server 類型的 UI 細節

## Success Criteria

- 使用者可在系統中登錄自架 HTTP MCP server
- server 可測試連線並取得 tool 清單
- 顧問模式可在回答前安全呼叫白名單 MCP tools
- 回答中能明確區分 MCP 查證結果與模型推論
- 失敗、timeout、不可用 tool 都能被清楚處理與回報
