-- Component library upgrade (design-quality-replication §4):
-- description feeds the prompt component index; component_versions keeps
-- refinement history (spec: 舊版本保留可查).
ALTER TABLE components ADD COLUMN description TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS component_versions (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  html TEXT NOT NULL,
  css TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(component_id, version)
);
