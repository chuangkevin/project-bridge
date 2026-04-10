## 1. Registry and Persistence

- [x] 1.1 Add SQLite storage for MCP server definitions
- [x] 1.2 Define server fields: name, transport, endpoint, enabled, scope, allowedTools, timeoutMs
- [x] 1.3 Add server-side CRUD helpers for MCP registry

## 2. HTTP MCP Client

- [x] 2.1 Add a dedicated HTTP MCP client service
- [x] 2.2 Implement server handshake / initialization flow
- [x] 2.3 Implement list-tools support
- [x] 2.4 Implement tool-call support
- [ ] 2.5 Add timeout and retry handling
- [ ] 2.6 Normalize MCP responses into project-bridge internal format

## 3. Policy and Safety

- [ ] 3.1 Add consultant-only scope enforcement for phase 1
- [x] 3.2 Add allowed-tools whitelist enforcement
- [x] 3.3 Add max tool calls per answer guardrail
- [ ] 3.4 Add graceful fallback when MCP is unavailable

## 4. Consultant Mode Integration

- [x] 4.1 Extend consultant flow to discover enabled MCP servers
- [x] 4.2 Add MCP evidence gathering before final answer when external grounding is needed
- [x] 4.3 Distinguish MCP evidence from model inference in answers
- [x] 4.4 Ensure consultant sub-modes `spec-review` and `architecture-review` can use MCP safely

## 5. Settings UI

- [x] 5.1 Add MCP server management section in Settings page
- [x] 5.2 Add create/edit/delete flows for HTTP MCP servers
- [x] 5.3 Add test-connection action
- [x] 5.4 Add list-tools preview

## 6. Logging and Debuggability

- [ ] 6.1 Store MCP execution logs with server, tool, duration, success, and summaries
- [ ] 6.2 Surface useful MCP failures in server logs and UI test results

## 7. Verification

- [x] 7.1 Verify HTTP connection to `mssql-mcp` at `http://srvhpgit1:32500/mcp`
- [x] 7.2 Verify tool discovery succeeds against a real self-hosted MCP server
- [ ] 7.3 Verify consultant mode can use MCP evidence in a real Q&A flow
- [ ] 7.4 Verify fallback behavior when MCP server is unreachable or times out
