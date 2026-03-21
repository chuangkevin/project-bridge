-- Add analysis_result and analysis_status columns to uploaded_files
ALTER TABLE uploaded_files ADD COLUMN analysis_result TEXT;
ALTER TABLE uploaded_files ADD COLUMN analysis_status TEXT DEFAULT NULL;

-- Recreate api_key_usage with proper schema (was created as empty table)
DROP TABLE IF EXISTS api_key_usage;
CREATE TABLE api_key_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_suffix TEXT NOT NULL,
  model TEXT NOT NULL,
  call_type TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  project_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recreate design_tokens with proper schema
DROP TABLE IF EXISTS design_tokens;
CREATE TABLE design_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  source TEXT NOT NULL,
  tokens TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Recreate generation_jobs with proper schema
DROP TABLE IF EXISTS generation_jobs;
CREATE TABLE generation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  total_pages INTEGER DEFAULT 0,
  completed_pages INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Recreate prototype_patches with proper schema
DROP TABLE IF EXISTS prototype_patches;
CREATE TABLE prototype_patches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  version_id TEXT,
  element_selector TEXT NOT NULL,
  patch_css TEXT,
  patch_html TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
