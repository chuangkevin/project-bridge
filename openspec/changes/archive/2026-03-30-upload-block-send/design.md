# Design: upload-block-send

## Server

### analysis-status endpoint

The existing `GET /api/projects/:id/upload/:fileId/analysis-status` endpoint already returns `{ status, result }`. The `status` field comes from the `analysis_status` column in `uploaded_files` and can be: `pending`, `running`, `done`, `error`, or `not_started`.

No new endpoint is needed. The client will poll this endpoint every 2 seconds per file after upload completes.

For files that do not trigger document analysis (non-PDF, non-image), the upload response already returns synchronously with all data. These files are considered "ready" immediately and do not need polling.

## Client

### Per-file status model

Extend the `UploadedFile` interface with an `analysisStatus` field:

```
type FileAnalysisStatus = 'uploading' | 'analyzing' | 'ready' | 'error';
```

State transitions:
1. **uploading** -- Set when `uploadFile()` starts. The file does not yet exist in `attachedFiles`.
2. **analyzing** -- Set when the upload response arrives and `analysis_status` is `pending` or `running` (i.e., the document analysis agent is still working). Start polling.
3. **ready** -- Set when polling returns `status: 'done'`, or when the upload response indicates no analysis is needed (non-PDF/non-image files, or files without an API key).
4. **error** -- Set when polling returns `status: 'error'`, or when the upload itself fails.

### Polling logic

After a successful upload, if the file is a PDF or image (determined by the upload response having `analysis_status` present):
- Start an interval that calls `GET /api/projects/:projectId/upload/:fileId/analysis-status` every 2 seconds.
- On `done` or `error`: clear the interval, update the file's `analysisStatus`.
- On component unmount or file removal: clear the interval.

### Send button gating

Current disabled condition: `!input.trim() || streaming`

New disabled condition: `!input.trim() || streaming || hasUnreadyFiles`

Where `hasUnreadyFiles` = any file in `attachedFiles` has `analysisStatus` of `uploading` or `analyzing`.

When `hasUnreadyFiles` is true and there are error files but no uploading/analyzing files, the button is enabled but shows a warning tooltip: "Some files failed analysis. Send anyway?"

### Visual indicators in file chips

Each file chip shows a status badge:
- **uploading**: spinner icon + "Uploading..."
- **analyzing**: spinner icon + "Analyzing..."
- **ready**: green checkmark
- **error**: orange warning icon + "Analysis failed" (clickable to retry via existing reanalyze endpoint)

### Edge cases

- **No files attached**: Send button behaves as before (enabled when input is non-empty and not streaming).
- **File removed while analyzing**: Clear the polling interval for that file.
- **Multiple files**: Each file polls independently. Send is blocked until ALL files reach a terminal state.
- **Upload error**: File is not added to `attachedFiles`, so no gating effect. Error is shown via existing `setError()`.
