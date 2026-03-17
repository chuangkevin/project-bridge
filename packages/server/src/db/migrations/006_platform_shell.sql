CREATE TABLE IF NOT EXISTS platform_shells (
  project_id TEXT PRIMARY KEY,
  shell_html TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
