-- 全域 settings（沿用 v1.5）
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ai-core ProjectBridgeAdapter expects these EXACT schemas (from legacy v1.5)
-- DO NOT change column names / types without coordinating with the adapter port.

CREATE TABLE api_key_leases (
  api_key     TEXT PRIMARY KEY,
  lease_until INTEGER NOT NULL,
  lease_token TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE api_key_cooldowns (
  api_key_suffix TEXT PRIMARY KEY,
  cooldown_until INTEGER NOT NULL,
  reason         TEXT DEFAULT '429',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE api_key_usage (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_suffix    TEXT NOT NULL,
  model             TEXT NOT NULL,
  call_type         TEXT NOT NULL,
  prompt_tokens     INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens      INTEGER DEFAULT 0,
  project_id        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_api_key_usage_suffix     ON api_key_usage(api_key_suffix);
CREATE INDEX idx_api_key_usage_created_at ON api_key_usage(created_at);
