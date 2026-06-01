CREATE TABLE extracted_facts (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  turn_id       TEXT NOT NULL REFERENCES turns(id)    ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK(kind IN ('requirement','page','constraint','decision')),
  text          TEXT NOT NULL,
  superseded_by TEXT REFERENCES extracted_facts(id),
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_facts_project ON extracted_facts(project_id, kind);

CREATE TABLE artifacts (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_turn TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK(kind IN ('vue-sfc','page-graph','design-tokens')),
  name            TEXT NOT NULL,
  payload_path    TEXT NOT NULL,
  metadata        TEXT,
  superseded_by   TEXT REFERENCES artifacts(id),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_artifacts_project ON artifacts(project_id, kind, created_at);
