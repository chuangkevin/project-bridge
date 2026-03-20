# Spec: upload-send-gate

## Overview

Block the send button in ChatPanel until all attached files have finished processing. Allow sending with a warning when files are in an error state.

## Requirements

### R1: File uploading blocks send

WHEN a file upload is in progress (`uploading` state is true)
THEN the send button MUST be disabled (opacity 0.5, click has no effect)
AND the button title shows "Waiting for uploads to finish..."

WHEN the upload completes and analysis begins
THEN the send button remains disabled until analysis finishes

### R2: Analysis running blocks send

WHEN one or more attached files have `analysisStatus` of `analyzing`
THEN the send button MUST be disabled
AND the button title shows "Waiting for file analysis..."

WHEN the analysis-status endpoint returns `done` for all files
THEN the send button MUST be re-enabled (assuming input is non-empty and not streaming)

### R3: All files ready enables send

WHEN all attached files have `analysisStatus` of `ready`
AND the input field is non-empty
AND no streaming request is in progress
THEN the send button MUST be enabled with full opacity

WHEN the user clicks send
THEN all file IDs are included in the chat request as before

### R4: Error state allows send with warning

WHEN one or more attached files have `analysisStatus` of `error`
AND no files have `analysisStatus` of `uploading` or `analyzing`
THEN the send button MUST be enabled
AND the button title shows "Some files failed analysis. Send anyway?"
AND the button border is styled with a warning color (#f59e0b)

WHEN the user clicks send with error-state files
THEN the message is sent normally with all file IDs included
AND the error files' IDs are still passed (the server handles partial analysis gracefully)

### R5: No files attached = normal send behavior

WHEN no files are attached (`attachedFiles` is empty)
THEN the send button disabled condition is unchanged: `!input.trim() || streaming`
AND no upload-related tooltip is shown

### R6: Keyboard send respects gate

WHEN the user presses Enter (without Shift) to send
THEN the same gating logic applies as clicking the send button
AND if files are not ready, the keypress is a no-op

### R7: Pending message respects gate

WHEN a `pendingMessage` arrives from outside (e.g., Architecture panel)
AND files are still uploading or analyzing
THEN the pending message MUST wait until files are ready before auto-sending
