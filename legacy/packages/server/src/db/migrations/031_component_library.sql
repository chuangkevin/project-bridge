CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  html TEXT NOT NULL,
  css TEXT NOT NULL DEFAULT '',
  thumbnail TEXT,
  tags TEXT DEFAULT '[]',
  source_url TEXT,
  source_project_id TEXT,
  version INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS component_versions (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  html TEXT NOT NULL,
  css TEXT NOT NULL DEFAULT '',
  thumbnail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_component_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  component_id TEXT NOT NULL,
  bound_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
  UNIQUE(project_id, component_id)
);

CREATE INDEX IF NOT EXISTS idx_components_category ON components(category);
CREATE INDEX IF NOT EXISTS idx_component_versions_component ON component_versions(component_id);
CREATE INDEX IF NOT EXISTS idx_project_component_bindings_project ON project_component_bindings(project_id);
