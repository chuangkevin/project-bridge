-- 全域 settings（沿用 v1.5）
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ai-core ProjectBridgeAdapter 期待這 3 表 schema 不變
CREATE TABLE api_key_leases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  leased_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP
);
CREATE INDEX idx_apikey_leases_active ON api_key_leases(provider, released_at);

CREATE TABLE api_key_cooldowns (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  provider       TEXT NOT NULL,
  key_hash       TEXT NOT NULL,
  cooldown_until TIMESTAMP NOT NULL,
  reason         TEXT
);
CREATE INDEX idx_apikey_cooldowns_provider ON api_key_cooldowns(provider, cooldown_until);

CREATE TABLE api_key_usage (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  provider          TEXT NOT NULL,
  key_hash          TEXT NOT NULL,
  call_type         TEXT,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  recorded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_apikey_usage_recorded ON api_key_usage(provider, recorded_at);
