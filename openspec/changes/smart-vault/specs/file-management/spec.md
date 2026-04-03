## ADDED Requirements

### Requirement: Upload files
The system SHALL accept file uploads via multipart form data. Supported formats: PDF, images (JPG/PNG/WebP/GIF), plain text (.txt/.md), and JSON. Single file size limit SHALL be 50MB.

#### Scenario: Upload a PDF file
- **WHEN** user uploads a PDF file under 50MB
- **THEN** system stores the file, returns file metadata (id, name, size, type, created_at), and queues the file for AI analysis

#### Scenario: Upload an image file
- **WHEN** user uploads a JPG/PNG/WebP image
- **THEN** system stores the file, generates a thumbnail via sharp, and queues for Gemini Vision analysis

#### Scenario: Reject oversized file
- **WHEN** user uploads a file exceeding 50MB
- **THEN** system returns HTTP 413 with error message

#### Scenario: Reject unsupported format
- **WHEN** user uploads an unsupported file type (e.g., .exe)
- **THEN** system returns HTTP 400 with error message listing supported formats

### Requirement: Automatic AI analysis on upload
The system SHALL automatically analyze uploaded files using Gemini 2.5 Flash to extract: a summary (under 200 characters), full text content, and up to 10 keywords/tags.

#### Scenario: PDF analysis
- **WHEN** a PDF is uploaded
- **THEN** system extracts text via pdf-parse, sends to Gemini for summarization, and stores summary + full text + tags in the database

#### Scenario: Image analysis
- **WHEN** an image is uploaded
- **THEN** system sends the image to Gemini Vision for description, OCR text extraction, and tag generation

#### Scenario: Text file analysis
- **WHEN** a .txt or .md file is uploaded
- **THEN** system reads the content directly and sends to Gemini for summarization and tagging

#### Scenario: Analysis failure
- **WHEN** Gemini API fails for analysis (all keys exhausted)
- **THEN** system marks the file status as "pending_analysis" and retries on next available key

### Requirement: List and browse files
The system SHALL provide an API to list all uploaded files with pagination, sorted by upload date (newest first).

#### Scenario: List files with pagination
- **WHEN** user requests file list with page=2&limit=20
- **THEN** system returns 20 files starting from offset 20, with total count

#### Scenario: Filter files by type
- **WHEN** user requests files filtered by type=pdf
- **THEN** system returns only PDF files

### Requirement: Delete files
The system SHALL allow deleting uploaded files, removing both the stored file and all associated database records.

#### Scenario: Delete a file
- **WHEN** user requests deletion of a file by ID
- **THEN** system removes the physical file, database record, full-text index entry, and associated analysis data

#### Scenario: Delete non-existent file
- **WHEN** user requests deletion of a file ID that does not exist
- **THEN** system returns HTTP 404

### Requirement: View file details
The system SHALL provide an API to retrieve full details of a single file, including analysis results.

#### Scenario: View analyzed file
- **WHEN** user requests details of a fully analyzed file
- **THEN** system returns file metadata, summary, full text content, tags, and analysis status
