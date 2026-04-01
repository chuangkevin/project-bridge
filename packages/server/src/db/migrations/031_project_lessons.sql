CREATE TABLE IF NOT EXISTS project_lessons (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lesson TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'qa-report',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_lessons_project ON project_lessons(project_id);
