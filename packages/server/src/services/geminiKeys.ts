import db from '../db/connection';

const DEFAULT_MODEL = 'gemini-2.5-flash';

let cachedKeys: string[] = [];
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

// Cooldown durations by reason
const COOLDOWN_MS: Record<string, number> = {
  '429': 120_000,       // 2 min for rate limit
  '401': 1_800_000,     // 30 min for auth error
  '403': 1_800_000,     // 30 min for permission error
  'server_error': 30_000, // 30 sec for 500/503
};

// In-memory cache of cooldowns (synced with DB)
const badKeys = new Map<string, number>(); // key → cooldown_until timestamp
let cooldownsLoaded = false;

/** Load cooldowns from DB on first access */
function loadCooldownsFromDb(): void {
  if (cooldownsLoaded) return;
  try {
    const rows = db.prepare('SELECT api_key_suffix, cooldown_until FROM api_key_cooldowns').all() as any[];
    const now = Date.now();
    for (const row of rows) {
      if (row.cooldown_until > now) {
        // Find full key by suffix
        const keys = loadKeys();
        const fullKey = keys.find(k => k.slice(-4) === row.api_key_suffix);
        if (fullKey) badKeys.set(fullKey, row.cooldown_until);
      }
    }
    // Clean expired rows
    db.prepare('DELETE FROM api_key_cooldowns WHERE cooldown_until < ?').run(now);
  } catch { /* table may not exist yet during migration */ }
  cooldownsLoaded = true;
}

/** Mark a key as temporarily bad with reason-based cooldown */
export function markKeyBad(key: string, reason: string = '429'): void {
  const cooldownMs = COOLDOWN_MS[reason] || COOLDOWN_MS['429'];
  const cooldownUntil = Date.now() + cooldownMs;
  badKeys.set(key, cooldownUntil);
  const suffix = key.slice(-4);
  console.warn(`[keys] Marked bad: ...${suffix} (${reason}, cooldown ${cooldownMs / 1000}s)`);
  // Persist to DB
  try {
    db.prepare(
      `INSERT INTO api_key_cooldowns (api_key_suffix, cooldown_until, reason) VALUES (?, ?, ?)
       ON CONFLICT(api_key_suffix) DO UPDATE SET cooldown_until = excluded.cooldown_until, reason = excluded.reason`
    ).run(suffix, cooldownUntil, reason);
  } catch { /* non-fatal */ }
}

/** Get available keys excluding temporarily bad ones */
function getAvailableKeys(): string[] {
  loadCooldownsFromDb();
  const now = Date.now();
  const keys = loadKeys();
  // Clean up expired cooldowns
  for (const [k, until] of badKeys) {
    if (now >= until) badKeys.delete(k);
  }
  const available = keys.filter(k => !badKeys.has(k));
  // If ALL keys are bad, return all (better than nothing)
  return available.length > 0 ? available : keys;
}

/** Assign N unique keys for parallel sub-agents — shuffled to avoid hot-spotting */
export function assignBatchKeys(count: number): string[] {
  const available = [...getAvailableKeys()];
  // Fisher-Yates shuffle
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, count);
}

/** Get a random available API key — avoids hot-spotting front keys */
export function getGeminiApiKey(): string | null {
  const keys = getAvailableKeys();
  if (keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)];
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
