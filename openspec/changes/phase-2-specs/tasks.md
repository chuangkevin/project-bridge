## 1. Database & Dependencies

- [ ] 1.1 Add new dependencies: multer, pdf-parse, mammoth, pptx-parser, tesseract.js to server package.json
- [ ] 1.2 Create migration 002_phase2.sql: add uploaded_files table (id, project_id, conversation_id, original_name, mime_type, file_size, storage_path, extracted_text, created_at) and annotations table (id, project_id, bridge_id, label, position_x, position_y, content, spec_data JSON, created_at, updated_at)
- [ ] 1.3 Run migration on server startup

## 2. File Upload & Parsing API

- [ ] 2.1 Create multer upload middleware: dest `data/uploads/`, 20MB file limit, allowed MIME types filter
- [ ] 2.2 Create text extraction service (`src/services/textExtractor.ts`): dispatch to correct parser by MIME type
- [ ] 2.3 Implement PDF text extraction using pdf-parse
- [ ] 2.4 Implement Word (.docx) text extraction using mammoth
- [ ] 2.5 Implement PowerPoint (.pptx) text extraction using pptx-parser
- [ ] 2.6 Implement image OCR using Tesseract.js in worker_threads
- [ ] 2.7 Implement POST `/api/projects/:id/upload` endpoint: accept file, extract text, store in uploaded_files table, return file info + extracted text
- [ ] 2.8 Modify chat endpoint: when message includes file IDs, prepend extracted text from those files to the user prompt

## 3. Annotation API

- [ ] 3.1 Implement POST `/api/projects/:id/annotations` — create annotation with bridgeId, label, content, specData, positionX, positionY
- [ ] 3.2 Implement GET `/api/projects/:id/annotations` — list all annotations for project
- [ ] 3.3 Implement PUT `/api/projects/:id/annotations/:aid` — update annotation content and/or specData
- [ ] 3.4 Implement DELETE `/api/projects/:id/annotations/:aid` — delete annotation, return 204

## 4. Frontend — File Upload

- [ ] 4.1 Add file upload area to chat panel: drag-and-drop zone + click to browse button
- [ ] 4.2 Show upload progress bar and file chips (filename + status)
- [ ] 4.3 Build extracted text preview/edit modal: show extracted text, allow editing, "Use this text" button
- [ ] 4.4 Attach file IDs to chat message when sending

## 5. Frontend — Structured Constraints

- [ ] 5.1 Build collapsible constraints bar above chat input: device type dropdown (desktop/tablet/mobile), color scheme (light/dark/custom with hex input), language (zh-TW/en/ja)
- [ ] 5.2 Store constraints in localStorage per project
- [ ] 5.3 Send active constraints with chat message, backend appends to system prompt

## 6. Frontend — Annotation System

- [ ] 6.1 Create bridge script that gets injected into prototype HTML: listens for clicks, finds nearest data-bridge-id, sends postMessage to parent
- [ ] 6.2 Add annotation mode toggle button to workspace toolbar
- [ ] 6.3 Implement postMessage listener in workspace: receive element-click events from iframe
- [ ] 6.4 Build annotation editor popup: text input for annotation content, save/cancel buttons
- [ ] 6.5 Display annotation indicators (numbered badges) on prototype via postMessage to bridge script
- [ ] 6.6 Update iframe sandbox to `allow-scripts allow-same-origin` for postMessage support

## 7. Frontend — Spec Panel

- [ ] 7.1 Add right panel to workspace layout (collapsible, 300px)
- [ ] 7.2 Build annotation list view in right panel: list of all annotations with element label and content preview
- [ ] 7.3 Build spec detail form: fields for name, type, constraints, API endpoint, validation rules, business logic notes
- [ ] 7.4 Save spec data on form submit via PUT annotation endpoint
- [ ] 7.5 Tab switching between "Annotations" list and "Spec" detail view
- [ ] 7.6 Click annotation in list → scroll prototype to element and highlight

## 8. Frontend — Share Page Updates

- [ ] 8.1 Fetch annotations with shared project data
- [ ] 8.2 Display annotation indicators on shared prototype
- [ ] 8.3 Show read-only annotation/spec popover on indicator click

## 9. Playwright Testing

- [ ] 9.1 API tests: file upload (PDF, docx, image, too large, unsupported type)
- [ ] 9.2 API tests: annotation CRUD (create, list, update, delete)
- [ ] 9.3 E2E tests: upload file in chat panel, see file chip, send message with file
- [ ] 9.4 E2E tests: toggle annotation mode, click element in prototype, create annotation
- [ ] 9.5 E2E tests: view annotations in right panel, click to highlight
- [ ] 9.6 E2E tests: edit spec data in spec panel
- [ ] 9.7 E2E tests: constraints bar — set device/color/language
- [ ] 9.8 E2E tests: share page shows annotations
