CREATE TABLE openai_oauth_state (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_oauth_state_created ON openai_oauth_state(created_at);
