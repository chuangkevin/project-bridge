import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

export interface UserPreference {
  pref_key: string;
  pref_value: string;
  confidence: number;
}

const GLOBAL_USER = '__global__';

/**
 * Track and retrieve user preferences passively.
 * Observes user behavior (variant selection, micro-adjust patterns, mode usage)
 * and builds a preference profile over time.
 */

export function observePreference(userId: string | null, key: string, value: string): void {
  const uid = userId || GLOBAL_USER;
  try {
    const existing = db.prepare(
      'SELECT id, value, confidence FROM user_preferences WHERE user_id = ? AND key = ?'
    ).get(uid, key) as any;

    if (existing) {
      if (existing.value === value) {
        // Same preference observed again → increase confidence
        const newConf = Math.min(1.0, existing.confidence + 0.2);
        db.prepare('UPDATE user_preferences SET confidence = ?, updated_at = datetime("now") WHERE id = ?')
          .run(newConf, existing.id);
      } else {
        // Different value → reset confidence
        db.prepare('UPDATE user_preferences SET value = ?, confidence = 0.3, updated_at = datetime("now") WHERE id = ?')
          .run(value, existing.id);
      }
    } else {
      db.prepare(
        'INSERT INTO user_preferences (user_id, key, value, confidence, source, updated_at) VALUES (?, ?, ?, 0.3, ?, datetime("now"))'
      ).run(uid, key, value, 'observation');
    }
  } catch (e: any) {
    console.warn('[pref] Failed to observe:', e.message?.slice(0, 50));
  }
}

export function getPreferences(userId: string | null, minConfidence: number = 0.6): UserPreference[] {
  const uid = userId || GLOBAL_USER;
  try {
    return db.prepare(
      'SELECT key as pref_key, value as pref_value, confidence FROM user_preferences WHERE user_id = ? AND confidence >= ? ORDER BY confidence DESC LIMIT 10'
    ).all(uid, minConfidence) as UserPreference[];
  } catch {
    return [];
  }
}

export function formatPreferencesForPrompt(prefs: UserPreference[]): string {
  if (prefs.length === 0) return '';
  const lines = prefs.map(p => `• ${p.pref_key}: ${p.pref_value} (confidence: ${Math.round(p.confidence * 100)}%)`);
  return `\n\n【使用者偏好】\n${lines.join('\n')}\n（以上是觀察到的使用者偏好，可作為設計參考但不強制遵循）`;
}
