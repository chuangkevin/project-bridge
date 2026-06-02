import type Database from 'better-sqlite3';

export interface ApiKeyStatBucket {
  calls: number;
  tokens: number;
}

export interface ApiKeyStats {
  today: ApiKeyStatBucket;
  total: ApiKeyStatBucket;
}

/**
 * Aggregate api_key_usage rows by suffix (last 8 chars of key).
 * `today` is the local-day window per SQLite date('now') (UTC); we accept that
 * close-to-midnight calls may land in the wrong bucket — fine for an overview stat.
 */
export function getApiKeyStats(db: Database.Database, suffix: string): ApiKeyStats {
  const today = db.prepare(`
    SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens,
           COUNT(*) as calls
    FROM api_key_usage
    WHERE api_key_suffix = ? AND date(created_at) = date('now')
  `).get(suffix) as { tokens: number; calls: number } | undefined;

  const total = db.prepare(`
    SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens,
           COUNT(*) as calls
    FROM api_key_usage
    WHERE api_key_suffix = ?
  `).get(suffix) as { tokens: number; calls: number } | undefined;

  return {
    today: { calls: today?.calls ?? 0, tokens: today?.tokens ?? 0 },
    total: { calls: total?.calls ?? 0, tokens: total?.tokens ?? 0 },
  };
}
