/**
 * geminiRetry.ts — powered by @kevinsisi/ai-core withRetry
 *
 * Keeps the same public API as the old implementation.
 */

import { withRetry, NoAvailableKeyError } from "@kevinsisi/ai-core";
import { getGeminiApiKey, getGeminiApiKeyExcluding, markKeyBad } from "./geminiKeys.js";

interface RetryOptions {
  maxRetries?: number;
  callType?: string;
  projectId?: string;
}

export async function withGeminiRetry<T>(
  fn: (apiKey: string) => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const initialKey = getGeminiApiKey();
  if (!initialKey) throw new Error("No Gemini API key available");

  let currentKey = initialKey;

  return withRetry((apiKey) => {
    currentKey = apiKey;
    return fn(apiKey);
  }, initialKey, {
    maxRetries: options?.maxRetries ?? 3,
    rotateKey: async () => {
      const nextKey = getGeminiApiKeyExcluding(currentKey);
      if (!nextKey) throw new NoAvailableKeyError();
      return nextKey;
    },
    onRetry: (info) => {
      if (info.errorClass === "quota" || info.errorClass === "rate-limit") {
        markKeyBad(currentKey, "429");
      } else if (info.errorClass === "fatal") {
        markKeyBad(currentKey, "403");
      }
      console.warn(
        `[retry] attempt ${info.attempt}/${info.maxRetries + 1}: ${info.errorClass}`
      );
    },
  });
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
