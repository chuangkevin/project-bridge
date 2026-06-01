CREATE TABLE IF NOT EXISTS global_design_profile (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  reference_analysis TEXT NOT NULL DEFAULT '',
  tokens TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE design_profiles ADD COLUMN inherit_global INTEGER NOT NULL DEFAULT 1;
ALTER TABLE design_profiles ADD COLUMN supplement TEXT NOT NULL DEFAULT '';
