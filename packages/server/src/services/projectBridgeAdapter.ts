/**
 * StorageAdapter for project-bridge's settings-based key storage.
 *
 * project-bridge stores keys as comma-separated values in the settings table,
 * and tracks cooldown in-memory. Usage is tracked in api_key_usage by suffix (not key_id).
 *
 * This adapter bridges that storage model to the ai-core StorageAdapter interface.
 */

import type { StorageAdapter, ApiKey } from "@kevinsisi/ai-core";
import db from "../db/connection.js";

interface SettingsRow {
  value: string;
}

/** In-memory cooldown tracker: key string → cooldown-until timestamp (ms) */
const cooldownMap = new Map<string, number>();

function loadBlockedSuffixes(): Set<string> {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'blocked_api_keys'")
    .get() as SettingsRow | undefined;
  if (!row?.value) return new Set();
  return new Set(row.value.split(",").map((s) => s.trim()).filter(Boolean));
}

function loadRawKeys(): string[] {
  const keys: string[] = [];
  const blocked = loadBlockedSuffixes();

  if (process.env.GEMINI_API_KEY) {
    const envKeys = process.env.GEMINI_API_KEY.split(",")
      .map((k) => k.trim())
      .filter((k) => k && !blocked.has(k.slice(-4)));
    keys.push(...envKeys);
  }

  const multi = db
    .prepare("SELECT value FROM settings WHERE key = 'gemini_api_keys'")
    .get() as SettingsRow | undefined;
  if (multi?.value) {
    keys.push(...multi.value.split(",").map((k: string) => k.trim()).filter(Boolean));
  }

  const single = db
    .prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'")
    .get() as SettingsRow | undefined;
  if (single?.value) keys.push(single.value.trim());

  // Deduplicate
  return [...new Set(keys)];
}

export class ProjectBridgeAdapter implements StorageAdapter {
  async getKeys(): Promise<ApiKey[]> {
    const now = Date.now();
    const rawKeys = loadRawKeys();
    return rawKeys.map((key, idx) => ({
      id: idx + 1, // synthetic id based on position
      key,
      isActive: true,
      cooldownUntil: cooldownMap.get(key) ?? 0,
      usageCount: 0,
    }));
  }

  async updateKey(key: ApiKey): Promise<void> {
    if (key.cooldownUntil > Date.now()) {
      cooldownMap.set(key.key, key.cooldownUntil);
    } else {
      cooldownMap.delete(key.key);
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
