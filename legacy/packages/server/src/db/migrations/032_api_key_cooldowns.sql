CREATE TABLE IF NOT EXISTS api_key_cooldowns (
  api_key_suffix TEXT PRIMARY KEY,
  cooldown_until INTEGER NOT NULL,
  reason TEXT DEFAULT '429',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
