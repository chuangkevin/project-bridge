/**
 * StorageAdapter for project-bridge's settings-based key storage.
 *
 * project-bridge stores keys as comma-separated values in the settings table,
 * and tracks cooldown in-memory. Usage is tracked in api_key_usage by suffix (not key_id).
 *
 * This adapter bridges that storage model to the ai-core StorageAdapter interface.
 */

import { KeyPool } from "@kevinsisi/ai-core";
import type { StorageAdapter, ApiKey } from "@kevinsisi/ai-core";
import db from "../db/connection.js";

interface SettingsRow {
  value: string;
}

interface UsageRow {
  api_key_suffix: string;
  calls: number;
}

interface CooldownRow {
  api_key_suffix: string;
  cooldown_until: number;
}

interface LeaseRow {
  api_key: string;
  lease_until: number;
  lease_token: string;
}

function isValidKeyFormat(key: string): boolean {
  if (key.length < 20) return false;
  if (/^(your|placeholder|test|example|dummy|fake|xxx|change.?me)/i.test(key)) return false;
  return true;
}

/** In-memory cooldown tracker: key string → cooldown-until timestamp (ms) */
const cooldownMap = new Map<string, number>();
/** Stable synthetic ids per key for ai-core lease operations. */
const keyIdMap = new Map<string, number>();
let nextSyntheticId = 1;
/** Local usage counts so ai-core's persisted ranking state survives reloads. */
const usageCountMap = new Map<string, number>();
let usageCountDay = new Date().toISOString().slice(0, 10);

db.prepare(
  `CREATE TABLE IF NOT EXISTS api_key_leases (
     api_key TEXT PRIMARY KEY,
     lease_until INTEGER NOT NULL,
     lease_token TEXT NOT NULL,
     updated_at TEXT DEFAULT (datetime('now'))
   )`
).run();

function stableKeyId(key: string): number {
  const existing = keyIdMap.get(key);
  if (existing) return existing;
  const next = nextSyntheticId++;
  keyIdMap.set(key, next);
  return next;
}

function resetUsageCountsIfDayChanged(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (usageCountDay === today) return;
  usageCountDay = today;
  usageCountMap.clear();
}

function loadUsageCounts(keys: string[]): Map<string, number> {
  if (keys.length === 0) return new Map();

  const suffixes = [...new Set(keys.map((key) => key.slice(-4)))];
  if (suffixes.length !== keys.length) return new Map();
  try {
    const placeholders = suffixes.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT api_key_suffix, COUNT(*) as calls
       FROM api_key_usage
       WHERE api_key_suffix IN (${placeholders}) AND date(created_at) = date('now')
       GROUP BY api_key_suffix`
    ).all(...suffixes) as UsageRow[];

    return new Map(rows.map((row) => [row.api_key_suffix, row.calls || 0]));
  } catch {
    return new Map();
  }
}

function loadPersistedCooldowns(keys: string[]): Map<string, number> {
  if (keys.length === 0) return new Map();

  const suffixes = [...new Set(keys.map((key) => key.slice(-4)))];
  try {
    const placeholders = suffixes.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT api_key_suffix, cooldown_until
       FROM api_key_cooldowns
       WHERE api_key_suffix IN (${placeholders})`
    ).all(...suffixes) as CooldownRow[];

    const now = Date.now();
    return new Map(
      rows
        .filter((row) => row.cooldown_until > now)
        .map((row) => [row.api_key_suffix, row.cooldown_until])
    );
  } catch {
    return new Map();
  }
}

function loadPersistedLeases(keys: string[]): Map<string, { leaseUntil: number; leaseToken: string }> {
  if (keys.length === 0) return new Map();

  try {
    const placeholders = keys.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT api_key, lease_until, lease_token
       FROM api_key_leases
       WHERE api_key IN (${placeholders})`
    ).all(...keys) as LeaseRow[];

    return new Map(
      rows.map((row) => [row.api_key, { leaseUntil: row.lease_until, leaseToken: row.lease_token }])
    );
  } catch {
    return new Map();
  }
}

function loadBlockedSuffixes(): Set<string> {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'blocked_api_keys'")
    .get() as SettingsRow | undefined;
  if (!row?.value) return new Set();
  return new Set(row.value.split(",").map((s) => s.trim()).filter(Boolean));
}

function loadRawKeys(): string[] {
  const keys: string[] = [];

  if (process.env.GEMINI_API_KEY) {
    const envKeys = process.env.GEMINI_API_KEY.split(",")
      .map((k) => k.trim())
      .filter((k) => k && isValidKeyFormat(k));
    keys.push(...envKeys);
  }

  const multi = db
    .prepare("SELECT value FROM settings WHERE key = 'gemini_api_keys'")
    .get() as SettingsRow | undefined;
  if (multi?.value) {
    keys.push(
      ...multi.value
        .split(",")
        .map((k: string) => k.trim())
        .filter(Boolean)
    );
  }

  const single = db
    .prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'")
    .get() as SettingsRow | undefined;
  if (single?.value) {
    const key = single.value.trim();
    if (key) keys.push(key);
  }

  // Deduplicate
  return [...new Set(keys)];
}

export class ProjectBridgeAdapter implements StorageAdapter {
  async getKeys(): Promise<ApiKey[]> {
    resetUsageCountsIfDayChanged();
    const rawKeys = loadRawKeys();
    const blocked = loadBlockedSuffixes();
    const usageCounts = loadUsageCounts(rawKeys);
    const persistedCooldowns = loadPersistedCooldowns(rawKeys);
    const persistedLeases = loadPersistedLeases(rawKeys);
    return rawKeys.map((key) => ({
      id: stableKeyId(key),
      key,
      isActive: !blocked.has(key.slice(-4)),
      cooldownUntil:
        cooldownMap.get(key) ?? persistedCooldowns.get(key.slice(-4)) ?? 0,
      leaseUntil: persistedLeases.get(key)?.leaseUntil ?? 0,
      leaseToken: persistedLeases.get(key)?.leaseToken ?? null,
      usageCount: usageCountMap.get(key) ?? usageCounts.get(key.slice(-4)) ?? 0,
    }));
  }

  async acquireLease(
    keyId: number,
    leaseUntil: number,
    leaseToken: string,
    now: number
  ): Promise<boolean> {
    const rawKeys = loadRawKeys();
    const key = rawKeys.find((item) => stableKeyId(item) === keyId);
    if (!key) return false;
    const localCooldownUntil = cooldownMap.get(key) ?? 0;
    if (localCooldownUntil > now) return false;
    const suffix = key.slice(-4);
    const result = db.prepare(
      `INSERT INTO api_key_leases (api_key, lease_until, lease_token, updated_at)
       SELECT ?, ?, ?, datetime('now')
       WHERE NOT EXISTS (
         SELECT 1 FROM api_key_cooldowns c
         WHERE c.api_key_suffix = ? AND c.cooldown_until > ?
       )
         AND COALESCE((
           SELECT instr(',' || value || ',', ',' || ? || ',')
           FROM settings WHERE key = 'blocked_api_keys'
         ), 0) = 0
       ON CONFLICT(api_key) DO UPDATE SET
         lease_until = excluded.lease_until,
         lease_token = excluded.lease_token,
         updated_at = datetime('now')
       WHERE api_key_leases.lease_until <= ?
         AND NOT EXISTS (
           SELECT 1 FROM api_key_cooldowns c
           WHERE c.api_key_suffix = ? AND c.cooldown_until > ?
         )
         AND COALESCE((
           SELECT instr(',' || value || ',', ',' || ? || ',')
           FROM settings WHERE key = 'blocked_api_keys'
         ), 0) = 0`
    ).run(key, leaseUntil, leaseToken, suffix, now, suffix, now, suffix, now, suffix) as { changes?: number };

    return (result.changes ?? 0) > 0;
  }

  async renewLease(
    keyId: number,
    leaseUntil: number,
    leaseToken: string,
    now: number
  ): Promise<boolean> {
    const rawKeys = loadRawKeys();
    const key = rawKeys.find((item) => stableKeyId(item) === keyId);
    if (!key) return false;
    const result = db.prepare(
      `UPDATE api_key_leases
       SET lease_until = ?, updated_at = datetime('now')
       WHERE api_key = ? AND lease_token = ? AND lease_until > ?`
    ).run(leaseUntil, key, leaseToken, now) as { changes?: number };
    return (result.changes ?? 0) > 0;
  }

  async updateKey(key: ApiKey, expectedLeaseToken?: string | null): Promise<void> {
    if (key.cooldownUntil > Date.now()) {
      cooldownMap.set(key.key, key.cooldownUntil);
      try {
        db.prepare(
          `INSERT INTO api_key_cooldowns (api_key_suffix, cooldown_until, reason)
           VALUES (?, ?, ?)
           ON CONFLICT(api_key_suffix) DO UPDATE SET cooldown_until = excluded.cooldown_until, reason = excluded.reason`
        ).run(key.key.slice(-4), key.cooldownUntil, key.isActive ? '429' : '403');
      } catch {}
    } else {
      cooldownMap.delete(key.key);
      try {
        db.prepare('DELETE FROM api_key_cooldowns WHERE api_key_suffix = ?').run(key.key.slice(-4));
      } catch {}
    }

    usageCountMap.set(key.key, key.usageCount);

    if (key.leaseUntil > Date.now() && key.leaseToken) {
      db.prepare(
        `INSERT INTO api_key_leases (api_key, lease_until, lease_token, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(api_key) DO UPDATE SET
           lease_until = excluded.lease_until,
           lease_token = excluded.lease_token,
           updated_at = datetime('now')
         WHERE (? IS NULL AND api_key_leases.lease_token IS NULL) OR api_key_leases.lease_token = ?`
      ).run(key.key, key.leaseUntil, key.leaseToken, expectedLeaseToken ?? null, expectedLeaseToken ?? null);
    } else {
      if (expectedLeaseToken !== undefined) {
        db.prepare(
          `DELETE FROM api_key_leases
           WHERE api_key = ? AND ((? IS NULL AND lease_token IS NULL) OR lease_token = ?)`
        ).run(key.key, expectedLeaseToken ?? null, expectedLeaseToken ?? null);
      } else {
        db.prepare(`DELETE FROM api_key_leases WHERE api_key = ?`).run(key.key);
      }
    }

    // isActive=false means block — store suffix in blocked_api_keys setting
    if (!key.isActive) {
      const blocked = loadBlockedSuffixes();
      blocked.add(key.key.slice(-4));
      db.prepare(
        "INSERT INTO settings (key, value, updated_at) VALUES ('blocked_api_keys', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
      ).run([...blocked].join(","));
    }
  }
}

let sharedPool: KeyPool | null = null;

export function getProjectBridgeKeyPool(): KeyPool {
  if (!sharedPool) {
    sharedPool = new KeyPool(new ProjectBridgeAdapter(), {
      defaultCooldownMs: 120_000,
      authCooldownMs: 1_800_000,
      allocationLeaseMs: 5 * 60_000,
    });
  }
  return sharedPool;
}

export function forceClearOldestAdapterCooldown(excludeKey = ''): string | null {
  const rawKeys = loadRawKeys();
  const blocked = loadBlockedSuffixes();
  const persistedCooldowns = loadPersistedCooldowns(rawKeys);
  for (const key of rawKeys) {
    const persisted = persistedCooldowns.get(key.slice(-4));
    if (persisted && persisted > Date.now() && !cooldownMap.has(key)) {
      cooldownMap.set(key, persisted);
    }
  }

  const now = Date.now();
  let oldestKey = '';
  let oldestUntil = Infinity;

  for (const [key, until] of cooldownMap) {
    if (excludeKey && key === excludeKey) continue;
    if (blocked.has(key.slice(-4))) continue;
    if (until <= now) {
      cooldownMap.delete(key);
      continue;
    }
    if (until < oldestUntil) {
      oldestUntil = until;
      oldestKey = key;
    }
  }

  if (!oldestKey) return null;

  cooldownMap.delete(oldestKey);
  try {
    db.prepare('DELETE FROM api_key_cooldowns WHERE api_key_suffix = ?').run(oldestKey.slice(-4));
  } catch {}
  return oldestKey;
}
