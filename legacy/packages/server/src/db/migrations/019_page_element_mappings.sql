CREATE TABLE IF NOT EXISTS page_element_mappings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  bridge_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  navigation_target TEXT,
  arch_component_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, bridge_id)
);

CREATE INDEX IF NOT EXISTS idx_page_element_mappings_project ON page_element_mappings(project_id);
