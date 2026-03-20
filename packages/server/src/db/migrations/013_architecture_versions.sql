-- Architecture version control
CREATE TABLE IF NOT EXISTS architecture_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  arch_data TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_arch_versions_project ON architecture_versions (project_id, version DESC);
