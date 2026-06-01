CREATE TABLE attachments (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK(kind IN ('pdf','docx','image','url-snapshot')),
  original_name TEXT NOT NULL,
  stored_path   TEXT NOT NULL,
  parsed_text   TEXT,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_attachments_project ON attachments(project_id, created_at);
