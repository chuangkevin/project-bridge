CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bridge_id TEXT NOT NULL,
  label TEXT DEFAULT '',
  position_x REAL,
  position_y REAL,
  content TEXT DEFAULT '',
  spec_data TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_annotations_project ON annotations(project_id, created_at);

CREATE TABLE IF NOT EXISTS api_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bridge_id TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  url TEXT DEFAULT '',
  params TEXT DEFAULT '[]',
  response_schema TEXT DEFAULT '{}',
  field_mappings TEXT DEFAULT '[]',
  page_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_api_bindings_project ON api_bindings(project_id);

CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  html TEXT NOT NULL,
  css TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  version INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_components_project ON components(project_id, category);
