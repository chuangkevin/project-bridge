# Project Notes

- Consultant mode now distinguishes `spec-review`, `architecture-review`, `ux-review`, and `general` based on prompt + attached docs.
- Spec review must treat raw requirement documents as source of truth and diff them against derived AI summaries before concluding.
- Design mode now exposes a visible execution checklist covering scope confirmation, skill/rule checks, page generation, and validation.
- Consultant mode and design mode share project conversation history, so recent-turn retrieval must always load the newest turns first and only compress older context later.
- Admin Settings now includes MCP server management for self-hosted HTTP servers; the first target server is `mssql-mcp` at `http://srvhpgit1:32500/mcp`.
- `mssql-mcp` now has an explicit recommended allowlist path (`get-table-schema`, `list-all-tables`) instead of relying on ambiguous empty-state semantics in Settings.
- Empty homepage and empty workspace states now expose task-oriented quick-start cards so first-time users can start from requirement review, first prototype generation, or page-flow discussion without guessing the first prompt.
