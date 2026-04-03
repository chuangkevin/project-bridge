# Proposal: upload-block-send

## Why

Users can currently send a chat message while attached files are still being uploaded or analyzed by the document analysis agent. When this happens, the AI generates a prototype without the full context from those files -- leading to missing design references, incorrect layouts, or ignored uploaded content. The user then has to re-upload and re-send, wasting time and API tokens.

## What

Disable the send button until all attached files have finished processing (upload + analysis), and show per-file status indicators so the user knows exactly what is happening with each attachment.

## New Capabilities

- **`upload-send-gate`** -- Block the send button until every attached file reaches a terminal state (ready or error). When all files are ready, re-enable send. When a file errors, allow sending with a warning tooltip so the user can make an informed choice.
- **`file-analysis-progress`** -- Show a per-file status badge in the file chip area. Each file cycles through: uploading, analyzing, ready (or error). Implemented by polling `GET /upload/:fileId/analysis-status` every 2 seconds.

## Modified

- `packages/client/src/components/ChatPanel.tsx` -- send button disabled logic, per-file status state, polling after upload, status badges in file chips.
- `packages/server/src/routes/upload.ts` -- verify analysis-status endpoint returns correct states, ensure `analysis_status` field is set on upload.
