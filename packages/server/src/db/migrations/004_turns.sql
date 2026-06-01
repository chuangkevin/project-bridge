CREATE TABLE turns (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mode        TEXT NOT NULL CHECK(mode IN ('consult','architect','design')),
  user_text   TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  skills_used TEXT,
  model_used  TEXT,
  tokens      TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_turns_project ON turns(project_id, created_at);
CREATE INDEX idx_turns_mode    ON turns(project_id, mode);
