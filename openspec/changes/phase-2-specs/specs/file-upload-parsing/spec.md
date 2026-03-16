## ADDED Requirements

### Requirement: Upload spec files
The system SHALL accept file uploads via POST `/api/projects/:id/upload` and store files in `data/uploads/{projectId}/`. Supported formats: PDF (.pdf), Word (.docx), PowerPoint (.pptx), Images (.png, .jpg, .jpeg), Markdown (.md), Plain text (.txt). Max file size: 20MB. Max total per project: 100MB.

#### Scenario: Successful PDF upload
- **WHEN** user uploads a valid PDF file under 20MB
- **THEN** system stores the file, extracts text using pdf-parse, saves metadata and extracted text to `uploaded_files` table, returns file id, name, and extracted text preview

#### Scenario: Successful Word upload
- **WHEN** user uploads a .docx file
- **THEN** system extracts text with structure using mammoth, stores extracted text

#### Scenario: Successful PowerPoint upload
- **WHEN** user uploads a .pptx file
- **THEN** system extracts per-slide text using pptx-parser, stores concatenated text

#### Scenario: Successful image upload with OCR
- **WHEN** user uploads a .png or .jpg image
- **THEN** system runs Tesseract.js OCR in a worker thread, extracts text, stores result with a warning if text confidence is low

#### Scenario: File too large
- **WHEN** user uploads a file exceeding 20MB
- **THEN** system returns 400 with message "File size exceeds 20MB limit"

#### Scenario: Unsupported file type
- **WHEN** user uploads a file with an unsupported extension
- **THEN** system returns 400 with message "Unsupported file type"

### Requirement: File upload UI in chat panel
The system SHALL provide a file upload area in the chat panel (drag-and-drop + click to browse). Uploaded files appear as chips showing filename and extracted text status.

#### Scenario: Upload file via drag and drop
- **WHEN** user drags a file onto the chat panel upload area
- **THEN** system uploads the file, shows progress, and displays a chip with filename and "Text extracted" status

#### Scenario: Include extracted text in chat
- **WHEN** user sends a chat message with uploaded files attached
- **THEN** system prepends the extracted text from all attached files to the user message before sending to AI

### Requirement: Extracted text preview and edit
The system SHALL show the extracted text to PM for review before including in chat. PM can edit the extracted text.

#### Scenario: Review extracted text
- **WHEN** user clicks on an uploaded file chip
- **THEN** system shows a modal with the extracted text, editable, with "Use this text" confirmation button
