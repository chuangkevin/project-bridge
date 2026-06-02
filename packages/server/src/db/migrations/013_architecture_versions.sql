-- Add arch_data column to projects (safe — no-op if already exists via older migration)
ALTER TABLE projects ADD COLUMN arch_data TEXT;

-- Architecture versions table for save/restore
CREATE TABLE IF NOT EXISTS architecture_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  arch_data TEXT NOT NULL,
  version INTEGER NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_arch_versions_project_version
  ON architecture_versions(project_id, version);
