# Project Notes

- Consultant mode now distinguishes `spec-review`, `architecture-review`, `ux-review`, and `general` based on prompt + attached docs.
- Spec review must treat raw requirement documents as source of truth and diff them against derived AI summaries before concluding.
- Design mode now exposes a visible execution checklist covering scope confirmation, skill/rule checks, page generation, and validation.
- Consultant mode and design mode share project conversation history, so recent-turn retrieval must always load the newest turns first and only compress older context later.
- Admin Settings now includes MCP server management for self-hosted HTTP servers; the first target server is `mssql-mcp` at `http://srvhpgit1:32500/mcp`.
- `mssql-mcp` now has an explicit recommended allowlist path (`get-table-schema`, `list-all-tables`) instead of relying on ambiguous empty-state semantics in Settings.
- Empty homepage and empty workspace states now expose task-oriented quick-start cards so first-time users can start from requirement review, first prototype generation, or page-flow discussion without guessing the first prompt.
- `mssql-mcp` schema confirmation works only when the client sends the tool's real argument key (`table_name`); typo-tolerant fallback should use `list-all-tables` before letting consultant mode infer anything.
- ChatPanel now renders fenced code blocks in a dedicated copy-friendly container and mirrors generation todo-lists into a code-style block for easy copy/paste.
- ChatPanel todo-lists now behave like an interactive block with completion summary, manual collapse, completed-state dimming, and a persistent copy-friendly summary view.
- WorkspacePage now has a first mobile baseline: design mode can switch between chat / preview / spec / code in a single-column shell, while desktop page actions and read-only protection stay intact.
- Consultant mode now falls back from Gemini stream responses to non-stream responses when the SDK throws `Failed to parse stream`, while preserving the existing MAX_TOKENS auto-continue behavior.
- Consultant-mode stream fallback now retries Gemini streaming once before switching to non-stream AI output, so transient stream parsing glitches do not immediately degrade the response path.
- Legacy deployed `mssql-mcp` settings can exist without `useRecommendedTools`; runtime normalization now only auto-enables the recommended allowlist for the exact legacy default shape so consultant-mode MCP keeps working after upgrades.
- Consultant-mode stream recovery now also handles parse failures that happen during chunk iteration, by asking Gemini to continue from the last emitted tail instead of restarting the whole answer.
- `mssql-mcp` get-table-schema can return a successful payload with `content: []` for typoed table names; consultant-mode must treat that exact shape as a lookup miss and then run list-all-tables typo matching.
- When typo fallback cannot deterministically resolve a table name, consultant-mode now exposes only a very short high-confidence candidate list (not evidence) for the LLM to judge, instead of dumping loose fuzzy matches.
- Deployments should no longer rely on Docker `latest`; project-bridge now uses SHA-pinned image tags in CI/CD so the deployed image can be traced back to the exact commit.
