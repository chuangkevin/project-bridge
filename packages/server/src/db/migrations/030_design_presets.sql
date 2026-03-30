CREATE TABLE IF NOT EXISTS design_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  tokens TEXT DEFAULT '{}',
  reference_urls TEXT DEFAULT '[]',
  reference_analysis TEXT DEFAULT '',
  design_convention TEXT DEFAULT '',
  created_by TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Add preset binding to projects (safe: SQLite ignores duplicate ALTER TABLE ADD COLUMN)
ALTER TABLE projects ADD COLUMN design_preset_id TEXT;
