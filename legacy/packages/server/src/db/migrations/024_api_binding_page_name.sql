ALTER TABLE api_bindings ADD COLUMN page_name TEXT;
CREATE INDEX IF NOT EXISTS idx_api_bindings_page ON api_bindings(project_id, page_name);
