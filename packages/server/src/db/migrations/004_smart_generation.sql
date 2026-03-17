CREATE TABLE IF NOT EXISTS art_style_preferences (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  detected_style TEXT NOT NULL DEFAULT '',
  apply_style INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE prototype_versions ADD COLUMN is_multi_page INTEGER NOT NULL DEFAULT 0;
ALTER TABLE prototype_versions ADD COLUMN pages TEXT NOT NULL DEFAULT '[]';

ALTER TABLE conversations ADD COLUMN message_type TEXT NOT NULL DEFAULT 'user';
