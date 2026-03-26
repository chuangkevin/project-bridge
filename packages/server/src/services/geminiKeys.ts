import db from '../db/connection';

const DEFAULT_MODEL = 'gemini-2.5-flash';

let cachedKeys: string[] = [];
let keyIndex = 0;
let lastLoadTime = 0;
const CACHE_TTL = 60_000; // reload from DB every 60s

/** Check if a key looks like a real API key (not a placeholder) */
function isValidKeyFormat(key: string): boolean {
  // Gemini keys start with "AIza" and are 39 chars
  // Reject obvious placeholders like "your-api-key-here", "xxx", "placeholder", etc.
  if (key.length < 20) return false;
  if (/^(your|placeholder|test|example|dummy|fake|xxx|change.?me)/i.test(key)) return false;
  return true;
}

/** Load blocked key suffixes from DB */
function loadBlockedSuffixes(): Set<string> {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'blocked_api_keys'").get() as any;
  if (!row?.value) return new Set();
  return new Set(row.value.split(',').map((s: string) => s.trim()).filter(Boolean));
}

function loadKeys(): string[] {
  const now = Date.now();
  if (cachedKeys.length > 0 && now - lastLoadTime < CACHE_TTL) return cachedKeys;

  const blocked = loadBlockedSuffixes();
  const keys: string[] = [];

  // 1. Environment variable (comma-separated) — skip placeholders & blocked
  if (process.env.GEMINI_API_KEY) {
    const envKeys = process.env.GEMINI_API_KEY.split(',')
      .map(k => k.trim())
      .filter(k => k && isValidKeyFormat(k) && !blocked.has(k.slice(-4)));
    keys.push(...envKeys);
  }

  // 2. DB: gemini_api_keys (comma-separated list)
  const multi = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_keys'").get() as any;
  if (multi?.value) {
    keys.push(...multi.value.split(',').map((k: string) => k.trim()).filter(Boolean));
  }

  // 3. DB: gemini_api_key (single key — legacy)
  const single = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as any;
  if (single?.value) {
    keys.push(single.value.trim());
  }

  // Deduplicate while preserving order
  const seen = new Set<string>();
  cachedKeys = keys.filter(k => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  lastLoadTime = now;
  return cachedKeys;
}

/** Force reload keys from DB (call after add/delete) */
export function invalidateKeyCache(): void {
  lastLoadTime = 0;
  cachedKeys = [];
}

// Temporary bad key tracking — keys that 429'd or errored recently
const badKeys = new Map<string, number>(); // key → timestamp when marked bad
const BAD_KEY_COOLDOWN = 120_000; // 2 minutes cooldown

/** Mark a key as temporarily bad (429, quota, auth error) */
export function markKeyBad(key: string): void {
  badKeys.set(key, Date.now());
  console.warn('[keys] Marked bad:', '...' + key.slice(-4), '(cooldown 2min)');
}

/** Get available keys excluding temporarily bad ones */
function getAvailableKeys(): string[] {
  const now = Date.now();
  const keys = loadKeys();
  // Clean up expired cooldowns
  for (const [k, ts] of badKeys) {
    if (now - ts > BAD_KEY_COOLDOWN) badKeys.delete(k);
  }
  const available = keys.filter(k => !badKeys.has(k));
  // If ALL keys are bad, return all (better than nothing)
  return available.length > 0 ? available : keys;
}

/** Assign N unique keys for parallel sub-agents — each gets its own key */
export function assignBatchKeys(count: number): string[] {
  const available = getAvailableKeys();
  const assigned: string[] = [];
  for (let i = 0; i < count; i++) {
    const key = available.find(k => !assigned.includes(k));
    assigned.push(key || available[i % available.length]);
  }
  return assigned;
}

/** Get the next API key using round-robin rotation, skipping bad keys */
export function getGeminiApiKey(): string | null {
  const keys = getAvailableKeys();
  if (keys.length === 0) return null;
  const key = keys[keyIndex % keys.length];
  keyIndex = (keyIndex + 1) % keys.length;
  return key;
}

/** Get a key excluding a specific failed key */
export function getGeminiApiKeyExcluding(failedKey: string): string | null {
  markKeyBad(failedKey);
  const keys = getAvailableKeys().filter(k => k !== failedKey);
  if (keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)];
}

/** Get configured model name */
export function getGeminiModel(): string {
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'gemini_model'").get() as any;
  return setting?.value || DEFAULT_MODEL;
}

/** Get all keys count (for diagnostics) */
export function getKeyCount(): number {
  return loadKeys().length;
}

// ─── Token Usage Tracking ───────────────────────────

/** Record token usage from a Gemini API response */
export function trackUsage(
  apiKey: string,
  model: string,
  callType: string,
  usageMetadata: any,
  projectId?: string
): void {
  try {
    const suffix = apiKey.slice(-4);
    const prompt = usageMetadata?.promptTokenCount || 0;
    const completion = usageMetadata?.candidatesTokenCount || 0;
    const total = usageMetadata?.totalTokenCount || 0;
    db.prepare(
      'INSERT INTO api_key_usage (api_key_suffix, model, call_type, prompt_tokens, completion_tokens, total_tokens, project_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(suffix, model, callType, prompt, completion, total, projectId || null);
  } catch {
    // Non-fatal — don't break the caller if tracking fails
  }
}

// ─── Key Management ─────────────────────────────────

/** Get all keys (masked) with per-key usage stats */
export function getKeyList(): Array<{
  suffix: string;
  todayCalls: number;
  todayTokens: number;
  totalCalls: number;
  totalTokens: number;
  fromEnv: boolean;
}> {
  const keys = loadKeys();
  const envKeys = new Set(
    (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
  );
  return keys.map(k => {
    const suffix = k.slice(-4);
    const today = db.prepare(
      `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
       FROM api_key_usage WHERE api_key_suffix = ? AND date(created_at) = date('now')`
    ).get(suffix) as any;
    const total = db.prepare(
      `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
       FROM api_key_usage WHERE api_key_suffix = ?`
    ).get(suffix) as any;
    return {
      suffix,
      todayCalls: today?.calls || 0,
      todayTokens: today?.tokens || 0,
      totalCalls: total?.calls || 0,
      totalTokens: total?.tokens || 0,
      fromEnv: envKeys.has(k),
    };
  });
}

/** Add a new API key */
export function addApiKey(newKey: string): void {
  const keys = loadKeys();
  if (keys.includes(newKey)) return; // Already exists
  keys.push(newKey);
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES ('gemini_api_keys', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(keys.join(','));
  invalidateKeyCache();
}

/** Remove an API key by its last 4 chars. ENV keys get blocked instead of deleted. */
export function removeApiKey(suffix: string): boolean {
  const keys = loadKeys();
  const target = keys.find(k => k.slice(-4) === suffix);
  if (!target) return false;

  // Check if this key comes from env
  const envKeys = new Set(
    (process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)
  );
  if (envKeys.has(target)) {
    // Can't delete from env — add to blocked list
    const blocked = loadBlockedSuffixes();
    blocked.add(suffix);
    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('blocked_api_keys', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run([...blocked].join(','));
  } else {
    // DB key — remove from stored list
    const filtered = keys.filter(k => k.slice(-4) !== suffix);
    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('gemini_api_keys', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run(filtered.join(','));
  }

  invalidateKeyCache();
  return true;
}

/** Get aggregated usage stats (today, 7 days, 30 days) */
export function getUsageStats(): {
  today: { calls: number; tokens: number };
  week: { calls: number; tokens: number };
  month: { calls: number; tokens: number };
} {
  const today = db.prepare(
    `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
     FROM api_key_usage WHERE date(created_at) = date('now')`
  ).get() as any;
  const week = db.prepare(
    `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
     FROM api_key_usage WHERE created_at >= datetime('now', '-7 days')`
  ).get() as any;
  const month = db.prepare(
    `SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens
     FROM api_key_usage WHERE created_at >= datetime('now', '-30 days')`
  ).get() as any;
  return {
    today: { calls: today?.calls || 0, tokens: today?.tokens || 0 },
    week: { calls: week?.calls || 0, tokens: week?.tokens || 0 },
    month: { calls: month?.calls || 0, tokens: month?.tokens || 0 },
  };
}
