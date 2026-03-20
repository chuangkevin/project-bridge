# Tasks: Architecture Versioning

## Phase 1: DB Migration — architecture_versions table

- [x] 1.1 Create migration file that creates the `architecture_versions` table (id TEXT PK, project_id TEXT FK, version INT, arch_data TEXT, description TEXT, created_at TEXT)
- [x] 1.2 Add unique constraint on (project_id, version)
- [x] 1.3 Add index `idx_arch_versions_project` on (project_id, version DESC)
- [x] 1.4 Run migration and verify table exists with correct schema
- [x] 1.5 Test: write a Playwright or integration test that confirms the table is queryable
- [x] 1.6 Commit: "feat: add architecture_versions DB migration"

## Phase 2: Server — version CRUD endpoints

- [x] 2.1 Add `GET /api/projects/:id/architecture/versions` endpoint returning versions ordered by version DESC
- [x] 2.2 Add `POST /api/projects/:id/architecture/versions` endpoint that inserts a new version (auto-increment version number, UUID id)
- [x] 2.3 Implement auto-prune logic after insert: delete versions beyond the 50 most recent per project
- [x] 2.4 Add `POST /api/projects/:id/architecture/versions/:versionId/restore` endpoint (safety snapshot + overwrite arch_data + return restored data)
- [x] 2.5 Add input validation: reject empty arch_data, verify project exists, verify versionId exists on restore
- [x] 2.6 Test: Playwright E2E hitting each endpoint (create version, list, restore, verify prune at limit)
- [x] 2.7 Commit: "feat: add architecture version CRUD + restore + auto-prune endpoints"

## Phase 3: Client — trigger version save on significant changes

- [x] 3.1 Create a `useArchVersions` hook or utility to call `POST /versions` with debounce (5s timer, resets on new change)
- [x] 3.2 Hook into `handleAddPage` in ArchFlowchart to trigger debounced version save with description "Added page: <name>"
- [x] 3.3 Hook into `handleDeleteNode` to trigger debounced version save with description "Deleted page: <name>"
- [x] 3.4 Hook into `onConnect` to trigger debounced version save with description "Added edge"
- [x] 3.5 Detect edge deletion in `handleEdgesChange` and trigger debounced version save with description "Deleted edge"
- [x] 3.6 Add "Save Version" / "儲存版本" button to the toolbar that triggers immediate (non-debounced) version save with description "Manual save"
- [x] 3.7 Test: Playwright test — add a page, wait for debounce, verify version was created via API
- [x] 3.8 Commit: "feat: trigger debounced version save on architecture changes"

## Phase 4: Client — version history panel UI + restore functionality

- [x] 4.1 Add "版本紀錄" toggle button to ArchFlowchart toolbar
- [x] 4.2 Create ArchVersionHistory component: collapsible panel showing version list (version number, description, relative timestamp)
- [x] 4.3 Fetch version list from `GET /versions` on panel open, show loading state
- [x] 4.4 Show empty state message "尚無版本紀錄" when no versions exist
- [x] 4.5 Highlight current (latest) version with visual indicator; hide restore button for current version
- [x] 4.6 Add "還原" button per non-current version entry
- [x] 4.7 Implement confirmation dialog on restore click ("確定要還原到版本 vN 嗎？目前的架構將自動儲存為新版本。")
- [x] 4.8 Call restore API on confirm, refresh flowchart nodes/edges and version list, show success feedback
- [x] 4.9 Handle restore errors with user-facing error message
- [x] 4.10 Test: Playwright test — open panel, verify version list renders, restore a version and verify flowchart updates
- [x] 4.11 Commit: "feat: add version history panel with restore functionality"

## Phase 5: Playwright E2E test + final commit

- [x] 5.1 Full E2E scenario: create project, add pages/edges, verify versions auto-created, open history panel, restore old version, verify flowchart reflects restored data
- [x] 5.2 Test auto-prune: create > 50 versions programmatically, verify only 50 remain
- [x] 5.3 Test safety snapshot: restore a version, verify pre-restore snapshot appears in history
- [x] 5.4 Commit: "test: architecture versioning full E2E validation"
