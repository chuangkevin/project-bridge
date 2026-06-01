-- API endpoint tagging: bindings, component dependencies, element constraints

CREATE TABLE IF NOT EXISTS api_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  bridge_id TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  url TEXT NOT NULL DEFAULT '',
  params TEXT NOT NULL DEFAULT '[]',
  response_schema TEXT NOT NULL DEFAULT '{}',
  field_mappings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_bindings_project ON api_bindings(project_id);
CREATE INDEX IF NOT EXISTS idx_api_bindings_bridge ON api_bindings(project_id, bridge_id);

CREATE TABLE IF NOT EXISTS component_dependencies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  source_bridge_id TEXT NOT NULL,
  target_bridge_id TEXT NOT NULL,
  trigger_event TEXT NOT NULL DEFAULT 'onClick',
  action TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_component_deps_project ON component_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_component_deps_source ON component_dependencies(project_id, source_bridge_id);
CREATE INDEX IF NOT EXISTS idx_component_deps_target ON component_dependencies(project_id, target_bridge_id);

CREATE TABLE IF NOT EXISTS element_constraints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  bridge_id TEXT NOT NULL,
  constraint_type TEXT NOT NULL DEFAULT 'text',
  min REAL,
  max REAL,
  pattern TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_element_constraints_project ON element_constraints(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_element_constraints_bridge ON element_constraints(project_id, bridge_id);
