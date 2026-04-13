/**
 * geminiRetry.ts — powered by @kevinsisi/ai-core withRetry
 *
 * Keeps the same public API as the old implementation.
 */

import { withRetry, NoAvailableKeyError } from "@kevinsisi/ai-core";
import { clearCooldownForKey, getGeminiApiKey, markKeyBad } from "./geminiKeys.js";
import { forceClearOldestAdapterCooldown, getProjectBridgeKeyPool } from "./projectBridgeAdapter.js";

interface RetryOptions {
  maxRetries?: number;
  callType?: string;
  projectId?: string;
}

export async function withGeminiRetry<T>(
  fn: (apiKey: string) => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const pool = getProjectBridgeKeyPool();
  let initialKey: string;
  try {
    [initialKey] = await pool.allocate(1);
  } catch (error) {
    if (!(error instanceof NoAvailableKeyError)) throw error;
    initialKey = await retryAfterCooldownClear(pool, error);
  }

  let currentKey = initialKey;
  let failed = false;
  let authFailure = false;
  let currentAttemptAuthFailure = false;
  let shouldCooldownCurrent = false;
  let heartbeatKey = initialKey;
  let heartbeat = startLeaseHeartbeat(pool, initialKey);

  try {
    return await withRetry(async (apiKey) => {
      currentKey = apiKey;
      if (apiKey !== heartbeatKey) {
        heartbeat.stop();
        heartbeat = startLeaseHeartbeat(pool, apiKey);
        heartbeatKey = apiKey;
      }
      const leaseError = heartbeat.getError();
      if (leaseError) throw leaseError;
      const result = await fn(apiKey);
      const postCallLeaseError = heartbeat.getError();
      if (postCallLeaseError) throw postCallLeaseError;
      return result;
    }, initialKey, {
      maxRetries: options?.maxRetries ?? 3,
      rotateKey: async () => {
        await pool.release(currentKey, shouldCooldownCurrent, currentAttemptAuthFailure);
        currentAttemptAuthFailure = false;
        shouldCooldownCurrent = false;
        try {
          const [nextKey] = await pool.allocate(1);
          return nextKey;
        } catch (error) {
          if (!(error instanceof NoAvailableKeyError)) throw error;
          return retryAfterCooldownClear(pool, error, currentKey);
        }
      },
      onRetry: (info) => {
        if (info.errorClass === "quota" || info.errorClass === "rate-limit") {
          currentAttemptAuthFailure = false;
          shouldCooldownCurrent = true;
          markKeyBad(currentKey, "429");
        } else if (info.errorClass === "fatal") {
          authFailure = true;
          currentAttemptAuthFailure = true;
          shouldCooldownCurrent = true;
          markKeyBad(currentKey, "403");
        } else {
          currentAttemptAuthFailure = false;
          shouldCooldownCurrent = false;
        }
        console.warn(
          `[retry] attempt ${info.attempt}/${info.maxRetries + 1}: ${info.errorClass}`
        );
      },
    });
    } catch (error) {
      failed = true;
      if (error instanceof Error) {
        if (/401|403|fatal/i.test(error.message)) {
          authFailure = true;
          currentAttemptAuthFailure = true;
          shouldCooldownCurrent = true;
        } else if (/429|rate.?limit|quota/i.test(error.message)) {
          shouldCooldownCurrent = true;
        }
      }
      throw error;
    } finally {
      heartbeat.stop();
      if (failed && currentKey !== initialKey) {
        if (shouldCooldownCurrent) {
          await pool.release(currentKey, true, currentAttemptAuthFailure).catch(() => {});
        } else {
          await pool.releaseLease(currentKey).catch(() => {});
        }
      } else if (!failed) {
        await pool.release(currentKey, false).catch(() => {});
      } else {
        if (shouldCooldownCurrent) {
          await pool.release(currentKey, true, currentAttemptAuthFailure).catch(() => {});
        } else {
          await pool.releaseLease(currentKey).catch(() => {});
        }
      }
    }
}

export async function withStreamRetry(
  fn: (apiKey: string) => Promise<void>,
  options?: RetryOptions
): Promise<void> {
  return withGeminiRetry(fn, options);
}

export function createBatchCaller(_count: number) {
  return {
    getKey: () => getGeminiApiKey() ?? "",
    callWithRetry: <T>(
      fn: (apiKey: string) => Promise<T>,
      opts?: RetryOptions
    ) => withGeminiRetry(fn, opts),
  };
}

function startLeaseHeartbeat(pool: ReturnType<typeof getProjectBridgeKeyPool>, apiKey: string) {
  let leaseError: Error | null = null;
  const intervalMs = Math.max(
    250,
    Math.min(60_000, Math.floor(pool.getAllocationLeaseMs() / 2))
  );
  const timer = setInterval(() => {
    pool
      .renewLease(apiKey)
      .then((renewed) => {
        if (!renewed) {
          leaseError = new Error(`Lost key lease for ${apiKey}`);
          clearInterval(timer);
        }
      })
      .catch((error) => {
        leaseError = error instanceof Error ? error : new Error(String(error));
        clearInterval(timer);
      });
  }, intervalMs);

  if (typeof timer.unref === "function") timer.unref();

  return {
    stop: () => clearInterval(timer),
    getError: () => leaseError,
  };
}

async function retryAfterCooldownClear(
  pool: ReturnType<typeof getProjectBridgeKeyPool>,
  originalError: NoAvailableKeyError,
  excludeKey = ''
): Promise<string> {
  const cleared = forceClearOldestAdapterCooldown(excludeKey);
  if (!cleared) {
    throw originalError;
  }
  clearCooldownForKey(cleared);

  const [nextKey] = await pool.allocate(1);
  return nextKey;
}
