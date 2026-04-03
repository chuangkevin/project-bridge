# Spec: file-analysis-progress

## Overview

Show a per-file status badge in the attached file chips area, indicating whether each file is uploading, being analyzed, ready, or has errored. Poll the analysis-status endpoint to track progress.

## Requirements

### R1: Status badge per attached file

WHEN a file is attached and visible in the file chips area
THEN a status badge MUST be displayed in the file chip next to the filename

The badge shows one of four states:
- **uploading**: animated spinner + text "Uploading..."
- **analyzing**: animated spinner + text "Analyzing..."
- **ready**: green check icon + text "Ready" (or the existing green "Visual" badge if visual analysis is done)
- **error**: orange warning icon + text "Analysis failed"

### R2: Poll analysis-status endpoint

WHEN a file upload completes and the server response indicates analysis is in progress (the file is PDF or image, and `analysis_status` is present in the upload response)
THEN the client MUST start polling `GET /api/projects/:projectId/upload/:fileId/analysis-status` every 2 seconds

WHEN the poll response returns `status: 'done'`
THEN stop polling and set the file's `analysisStatus` to `ready`

WHEN the poll response returns `status: 'error'`
THEN stop polling and set the file's `analysisStatus` to `error`

WHEN the poll response returns `status: 'pending'` or `status: 'running'`
THEN continue polling

### R3: Cleanup on file removal

WHEN a user removes an attached file (clicks the "x" button)
THEN any active polling interval for that file MUST be cleared immediately

WHEN the component unmounts
THEN all active polling intervals MUST be cleared

### R4: Visual indicators

The status badges use these styles:
- **uploading/analyzing**: background `#e0f2fe`, color `#0369a1`, with a CSS spinning animation on the icon
- **ready**: background `#d1fae5`, color `#065f46`
- **error**: background `#fef3c7`, color `#92400e`, border `1px solid #fcd34d`

The spinner is a simple rotating circle (CSS `@keyframes spin` or inline animation).

### R5: Non-analyzed files skip polling

WHEN a file is not a PDF or image (e.g., plain text, DOCX)
THEN no polling is started
AND the file's `analysisStatus` is set to `ready` immediately after upload

### R6: Error badge allows retry

WHEN a file has `analysisStatus` of `error`
THEN the error badge MUST be clickable
AND clicking it triggers a re-analysis via the existing `POST /api/projects/:projectId/upload/:fileId/reanalyze` endpoint
AND during re-analysis, the badge shows "Analyzing..." with a spinner
AND after re-analysis completes, the badge updates to `ready` or remains `error`
