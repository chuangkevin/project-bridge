import db from '../db/connection';

const DEFAULT_MODEL = 'gemini-2.5-flash';

db.prepare(
  `CREATE TABLE IF NOT EXISTS api_key_leases (
     api_key TEXT PRIMARY KEY,
     lease_until INTEGER NOT NULL,
     lease_token TEXT NOT NULL,
     updated_at TEXT DEFAULT (datetime('now'))
   )`
).run();

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

function loadLeasedKeys(keys: string[], now: number): Set<string> {
  if (keys.length === 0) return new Set();
  try {
    const placeholders = keys.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT api_key, lease_until
       FROM api_key_leases
       WHERE api_key IN (${placeholders}) AND lease_until > ?`
    ).all(...keys, now) as LeaseRow[];
    return new Set(rows.map((row) => row.api_key));
  } catch {
    return new Set();
  }
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
const lastAssignedAt = new Map<string, number>();

interface LeaseRow {
  api_key: string;
  lease_until: number;
}

function getTodayCallCounts(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  if (keys.length === 0) return counts;

  const suffixes = keys.map(key => key.slice(-4));
  if (new Set(suffixes).size !== suffixes.length) return counts;

  try {
    const placeholders = keys.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT api_key_suffix, COUNT(*) as calls
       FROM api_key_usage
       WHERE api_key_suffix IN (${placeholders}) AND date(created_at) = date('now')
       GROUP BY api_key_suffix`
    ).all(...suffixes) as Array<{ api_key_suffix: string; calls: number }>;

    for (const row of rows) counts.set(row.api_key_suffix, row.calls || 0);
  } catch {
    return counts;
  }

  return counts;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickBestKey(keys: string[]): string | null {
  if (keys.length === 0) return null;
  const now = Date.now();
  const todayCalls = getTodayCallCounts(keys);
  const ranked = [...keys].sort((a, b) => {
    const aCalls = todayCalls.get(a.slice(-4)) || 0;
    const bCalls = todayCalls.get(b.slice(-4)) || 0;
    if (aCalls !== bCalls) return aCalls - bCalls;

    const aLast = lastAssignedAt.get(a) || 0;
    const bLast = lastAssignedAt.get(b) || 0;
    return aLast - bLast;
  });

  const bestCalls = todayCalls.get(ranked[0].slice(-4)) || 0;
  const bestLast = lastAssignedAt.get(ranked[0]) || 0;
  const tied = ranked.filter((key) => {
    const calls = todayCalls.get(key.slice(-4)) || 0;
    const last = lastAssignedAt.get(key) || 0;
    return calls === bestCalls && last === bestLast;
  });
  shuffleInPlace(tied);
  const selected = tied[0] || ranked[0];
  if (!selected) return null;
  lastAssignedAt.set(selected, now);
  return selected;
}

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
  const leasedKeys = loadLeasedKeys(keys, now);
  const leaseFreeKeys = keys.filter((key) => !leasedKeys.has(key));
  // Clean up expired cooldowns
  for (const [k, until] of badKeys) {
    if (now >= until) badKeys.delete(k);
  }
  const available = keys.filter(k => !badKeys.has(k) && !leasedKeys.has(k));
  if (available.length > 0) return available;
  if (leaseFreeKeys.length > 0) {
    forceClearOldestCooldown();
  }
  return keys.filter(k => !leasedKeys.has(k));
}

export function forceClearOldestCooldown(excludeKey = ''): string | null {
  loadCooldownsFromDb();
  let oldestKey = '';
  let oldestUntil = Infinity;
  for (const [key, until] of badKeys) {
    if (excludeKey && key === excludeKey) continue;
    if (until < oldestUntil) {
      oldestUntil = until;
      oldestKey = key;
    }
  }

  if (!oldestKey) return null;

  badKeys.delete(oldestKey);
  try {
    db.prepare('DELETE FROM api_key_cooldowns WHERE api_key_suffix = ?').run(oldestKey.slice(-4));
  } catch {}
  console.warn(`[keys] Force-cleared oldest cooldown: ...${oldestKey.slice(-4)}`);
  return oldestKey;
}

export function clearCooldownForKey(key: string): void {
  if (!key) return;
  badKeys.delete(key);
  try {
    db.prepare('DELETE FROM api_key_cooldowns WHERE api_key_suffix = ?').run(key.slice(-4));
  } catch {}
}

/** Assign N unique keys for parallel sub-agents — shuffled to avoid hot-spotting */
export function assignBatchKeys(count: number): string[] {
  const available = [...getAvailableKeys()];
  const result: string[] = [];
  const remaining = [...available];
  while (result.length < count && remaining.length > 0) {
    const next = pickBestKey(remaining);
    if (!next) break;
    result.push(next);
    const idx = remaining.indexOf(next);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  return result;
}

/** Get a random available API key — avoids hot-spotting front keys */
export function getGeminiApiKey(): string | null {
  const keys = getAvailableKeys();
  return pickBestKey(keys);
}

/** Get a key excluding a specific failed key */
export function getGeminiApiKeyExcluding(failedKey: string, reason: string = '429'): string | null {
  markKeyBad(failedKey, reason);
  const keys = getAvailableKeys().filter(k => k !== failedKey);
  return pickBestKey(keys);
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
