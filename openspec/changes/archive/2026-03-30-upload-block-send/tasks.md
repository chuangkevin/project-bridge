# Tasks: upload-block-send

## Phase 1: Server -- verify analysis-status endpoint

- [x] 1.1 Verify `GET /api/projects/:id/upload/:fileId/analysis-status` returns `{ status, result }` with correct values for pending, running, done, error, and not_started states
- [x] 1.2 Ensure `analysis_status` is set to `'pending'` in the upload handler for PDF/image files when document analysis is triggered (already present in code, verify)
- [x] 1.3 Add `analysis_status` field to the upload POST response JSON so the client knows whether to start polling
- [x] 1.4 Write Playwright test: upload a PDF, poll analysis-status, assert it transitions through pending/running to done or stays not_started for non-analyzed files
- [x] 1.5 Commit: "feat(server): expose analysis_status in upload response for client polling"

## Phase 2: Client -- per-file status tracking and polling

- [x] 2.1 Add `analysisStatus` field (`'uploading' | 'analyzing' | 'ready' | 'error'`) to `UploadedFile` interface in ChatPanel
- [x] 2.2 Set `analysisStatus: 'analyzing'` when upload response includes `analysis_status: 'pending'`; set `'ready'` for files without analysis
- [x] 2.3 Implement polling: after upload, if `analysisStatus === 'analyzing'`, poll `GET /upload/:fileId/analysis-status` every 2s; update status on done/error; clear interval on terminal state
- [x] 2.4 Clear polling intervals on file removal and component unmount (useEffect cleanup)
- [x] 2.5 Add status badge to file chip: spinner + "Analyzing..." for analyzing, green check for ready, warning icon for error
- [x] 2.6 Write Playwright test: upload a file, verify status badge appears and transitions from analyzing to ready
- [x] 2.7 Commit: "feat(client): add per-file analysis status tracking with polling and badges"

## Phase 3: Client -- send button gating and error warning

- [x] 3.1 Compute `hasUnreadyFiles` from `attachedFiles` -- true if any file has `analysisStatus` of `uploading` or `analyzing`
- [x] 3.2 Update send button disabled condition: `!input.trim() || streaming || hasUnreadyFiles`
- [x] 3.3 Update `handleKeyDown` (Enter) to respect the same gating logic
- [x] 3.4 Add warning style to send button when error files exist but no unready files (border color #f59e0b, tooltip "Some files failed analysis. Send anyway?")
- [x] 3.5 Update `pendingMessage` auto-send effect to wait until files are ready before calling `sendMessage`
- [x] 3.6 Write Playwright test: attach file, verify send button is disabled while analyzing, enabled after ready; verify error state allows send with warning
- [x] 3.7 Commit: "feat(client): gate send button on file analysis status with error warning"

## Phase 4: Integration test and final commit

- [x] 4.1 Write full Playwright integration test: upload PDF, observe per-file badge, verify send blocked during analysis, send after ready, verify chat request includes file IDs
- [x] 4.2 Test edge cases: remove file while analyzing (polling stops), send with no files (normal behavior), multiple files with mixed states
- [x] 4.3 Manual smoke test in browser: upload image and PDF, confirm UX flow
- [x] 4.4 Commit: "test: upload-block-send integration tests for send gating and file status"
