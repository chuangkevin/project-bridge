/**
 * geminiRetry.ts — powered by @kevinsisi/ai-core withRetry
 *
 * Keeps the same public API as the old implementation.
 */

import { withRetry, NoAvailableKeyError, LeaseHeartbeat, StepRunner } from "@kevinsisi/ai-core";
import type { ErrorClass } from "@kevinsisi/ai-core";
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
  let heartbeat = new LeaseHeartbeat(pool, initialKey);

  try {
    return await withRetry(async (apiKey) => {
        currentKey = apiKey;
        if (apiKey !== heartbeatKey) {
          heartbeat.switchKey(apiKey);
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

export function createProjectBridgeStepRunner(maxRetries = 2): StepRunner {
  const pool = getProjectBridgeKeyPool();

  return new StepRunner(pool, {
    maxRetries,
    acquireInitialKey: async ({ preferredKey, step }) => {
      try {
        const allocation = await pool.allocatePreferred(preferredKey, {
          allowFallback: step.allowSharedFallback ?? false,
        });
        return {
          key: allocation.key,
          usedPreferred: allocation.usedPreferred,
          sharedFallbackUsed: Boolean(preferredKey) && !allocation.usedPreferred,
        };
      } catch (error) {
        if (!(error instanceof NoAvailableKeyError)) throw error;
        const key = await retryAfterCooldownClear(pool, error);
        return {
          key,
          usedPreferred: preferredKey === key,
          sharedFallbackUsed: true,
        };
      }
    },
    rotateKey: async ({ currentKey, step, errorClass }) => {
      const effectiveError = errorClass ?? "quota";

      if (effectiveError === "quota" || effectiveError === "rate-limit") {
        markKeyBad(currentKey, "429");
        await pool.release(currentKey, true, false);
      } else if (effectiveError === "fatal") {
        markKeyBad(currentKey, "403");
        await pool.release(currentKey, true, true);
      } else {
        await pool.releaseLease(currentKey);
      }

      if (!(step.allowSharedFallback ?? false)) {
        throw new NoAvailableKeyError(
          `Step \"${step.name}\" requires key rotation, but shared fallback is disabled`
        );
      }

      try {
        const allocation = await pool.allocatePreferred(null, { allowFallback: true });
        return {
          key: allocation.key,
          sharedFallbackUsed: true,
        };
      } catch (error) {
        if (!(error instanceof NoAvailableKeyError)) throw error;
        const clearedKey = await retryAfterCooldownClear(pool, error, currentKey);
        return {
          key: clearedKey,
          sharedFallbackUsed: true,
        };
      }
    },
    releaseKey: async ({ key, failed, authFailure, errorClass }) => {
      if (!failed) {
        await pool.release(key, false);
        return;
      }

      if (authFailure || errorClass === "fatal") {
        markKeyBad(key, "403");
        await pool.release(key, true, true);
        return;
      }

      if (errorClass === "quota" || errorClass === "rate-limit") {
        markKeyBad(key, "429");
        await pool.release(key, true, false);
        return;
      }

      await pool.releaseLease(key);
    },
  });
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
