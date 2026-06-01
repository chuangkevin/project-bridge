/**
 * geminiRetry.ts — shim after OpenCode migration
 *
 * Key pool removed. OpenCode server manages all provider keys internally.
 * Callers that passed (apiKey: string) never used it — all downstream
 * functions call getProvider() directly.
 */

interface RetryOptions {
  maxRetries?: number;
  callType?: string;
  projectId?: string;
}

export async function withGeminiRetry<T>(
  fn: (apiKey: string) => Promise<T>,
  _options?: RetryOptions,
): Promise<T> {
  return fn("");
}

export async function withStreamRetry(
  fn: (apiKey: string) => Promise<void>,
  options?: RetryOptions,
): Promise<void> {
  return withGeminiRetry(fn, options);
}

export function createBatchCaller(_count: number) {
  return {
    getKey: () => "",
    callWithRetry: <T>(fn: (apiKey: string) => Promise<T>, opts?: RetryOptions) =>
      withGeminiRetry(fn, opts),
  };
}

interface StepDef<T> {
  id: string;
  name: string;
  allowSharedFallback?: boolean;
  run: (apiKey: string) => Promise<T>;
}

interface SimpleStepRunner {
  runStep<T>(step: StepDef<T>): Promise<{ value: T }>;
}

export function createProjectBridgeStepRunner(_maxRetries = 2): SimpleStepRunner {
  return {
    async runStep<T>(step: StepDef<T>) {
      const value = await step.run("");
      return { value };
    },
  };
}
