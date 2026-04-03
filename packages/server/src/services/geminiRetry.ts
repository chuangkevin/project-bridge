import { getGeminiApiKey, getGeminiApiKeyExcluding, markKeyBad, trackUsage, getGeminiModel } from './geminiKeys';

interface RetryOptions {
  maxRetries?: number;
  callType?: string;
  projectId?: string;
}

/**
 * Auto-retry wrapper for Gemini API calls.
 * Handles 429 (rate limit), 401/403 (auth), and 500/503 (server error) with key rotation.
 *
 * Usage:
 *   const result = await withGeminiRetry(
 *     (apiKey) => callGeminiApi(apiKey, prompt),
 *     { callType: 'generation', projectId }
 *   );
 */
export async function withGeminiRetry<T>(
  fn: (apiKey: string) => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  let currentKey = getGeminiApiKey();
  if (!currentKey) throw new Error('No Gemini API key available');

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn(currentKey);
      return result;
    } catch (err: any) {
      lastError = err;
      const msg = (err?.message || '').toLowerCase();
      const status = err?.status || err?.httpCode || 0;

      // Classify error
      const is429 = status === 429 || msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('rate');
      const isAuth = status === 401 || status === 403 || msg.includes('401') || msg.includes('403') || msg.includes('api_key_invalid') || msg.includes('permission');
      const isServer = status === 500 || status === 503 || msg.includes('500') || msg.includes('503') || msg.includes('internal');

      if (attempt === maxRetries) break; // No more retries

      if (is429) {
        markKeyBad(currentKey, '429');
        const nextKey = getGeminiApiKeyExcluding(currentKey);
        if (nextKey) {
          currentKey = nextKey;
          console.warn(`[retry] 429 on ...${currentKey.slice(-4)}, rotating key (attempt ${attempt + 1}/${maxRetries})`);
        } else {
          // No other keys, wait a bit
          await sleep(2000);
        }
      } else if (isAuth) {
        markKeyBad(currentKey, status === 401 ? '401' : '403');
        const nextKey = getGeminiApiKeyExcluding(currentKey);
        if (nextKey) {
          currentKey = nextKey;
          console.warn(`[retry] Auth error on ...${currentKey.slice(-4)}, rotating key (attempt ${attempt + 1}/${maxRetries})`);
        } else {
          break; // All keys have auth issues, don't retry
        }
      } else if (isServer) {
        markKeyBad(currentKey, 'server_error');
        await sleep(1000);
        console.warn(`[retry] Server error, retrying same key after 1s (attempt ${attempt + 1}/${maxRetries})`);
      } else {
        // Unknown error — don't retry
        break;
      }
    }
  }

  throw lastError || new Error('withGeminiRetry: all attempts failed');
}

/**
 * Batch retry wrapper — assigns unique keys for parallel calls.
 * Returns a function that can be called N times, each with a different key.
 */
export function createBatchCaller(count: number): {
  getKey: () => string;
  callWithRetry: <T>(fn: (apiKey: string) => Promise<T>, options?: RetryOptions) => Promise<T>;
} {
  const { assignBatchKeys } = require('./geminiKeys');
  const keys: string[] = assignBatchKeys(count);
  let idx = 0;

  return {
    getKey: () => keys[idx++ % keys.length],
    callWithRetry: <T>(fn: (apiKey: string) => Promise<T>, options?: RetryOptions) => {
      const key = keys[idx++ % keys.length];
      return withGeminiRetry((k) => fn(k), { ...options, maxRetries: options?.maxRetries ?? 2 });
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
