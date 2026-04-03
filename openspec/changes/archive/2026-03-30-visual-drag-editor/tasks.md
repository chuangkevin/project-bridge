## 1. Server — Patch Storage

- [x] 1.1 Migration 017: patches column on prototype_versions
- [x] 1.2 Create patchApplier.ts service
- [x] 1.3 Create patches.ts route (GET/PATCH/POST)
- [x] 1.4 Register route in index.ts
- [x] 1.5 Build + commit

## 2. Client — Bridge Script

- [x] 2.1 Add set-visual-edit-mode handler
- [x] 2.2 Add apply-style-change handler
- [x] 2.3 Add apply-position-change handler
- [x] 2.4 Add apply-resize handler
- [x] 2.5 Add get-element-rect handler
- [x] 2.6 Add apply-patches handler

## 3. Client — UI Components

- [x] 3.1 Create SelectionOverlay.tsx (selection border + 8 resize handles)
- [x] 3.2 Create StylePropertyPanel.tsx (colors, fonts, spacing, size, opacity)
- [x] 3.3 Create VisualEditor.tsx (orchestrator: selection, drag, resize, patches)

## 4. Integration

- [x] 4.1 Add Visual Edit mode toggle in WorkspacePage toolbar
- [x] 4.2 Render VisualEditor when mode active, pass iframeRef
- [x] 4.3 Send set-visual-edit-mode to iframe on toggle
- [x] 4.4 Load patches on prototype load, clear on full regeneration
- [x] 4.5 E2E test: select element, change color, verify patch saved
- [x] 4.6 Commit
