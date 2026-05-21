/**
 * provider.ts — singleton MultiProviderClient (ai-core v3.0.0)
 *
 * Routing policy:
 *   - OpenAI primary (api key OR oauth access token from settings/env)
 *   - Gemini pool fallback (always present)
 *   - allowCrossProviderFallback: true
 *
 * Note: ai-core's GenerateParams does not expose temperature/responseMimeType,
 * so callers that need strict JSON output should append a JSON-only instruction
 * to systemInstruction via `withJsonInstruction()`.
 *
 * Silent fallback is forbidden — adapters surface errors directly; the route
 * policy only opts in to cross-provider fallback at the *router* level when
 * the primary provider fails.
 */

import {
  MultiProviderClient,
  OpenAIProviderAdapter,
  OpenCodeProviderAdapter,
} from "@kevinsisi/ai-core";
import type {
  ProviderAdapter,
  RoutePolicy,
  GenerateParams,
  GenerateResponse,
  ChatMessage,
  RoutedProviderSelection,
  ModelDefinition,
} from "@kevinsisi/ai-core";
import db from "../db/connection";
import { CodexResponsesAdapter, extractAccountIdFromJwt } from "./codexResponsesAdapter";

const DEFAULT_ROUTE_POLICY: RoutePolicy = {
  preferredProviders: ["openai"],
  fallbackProviders: ["opencode"],
  allowCrossProviderFallback: true,
};

/**
 * Wraps OpenCodeProviderAdapter so that every `gemini-*` model ID the settings
 * UI exposes is accepted by the router. OpenCode routes the call to the correct
 * underlying provider based on the model object it receives.
 */
class ExtendedOpenCodeAdapter implements ProviderAdapter {
  private readonly inner: OpenCodeProviderAdapter;
  constructor() {
    const url = readSetting("opencode_url") || process.env.OPENCODE_URL || "http://localhost:4096";
    const password = readSetting("opencode_server_password") || process.env.OPENCODE_SERVER_PASSWORD || "";
    this.inner = new OpenCodeProviderAdapter(
      {
        type: "api",
        provider: "opencode",
        apiKey: password,
        baseURL: url,
      },
      {
        defaultModel: { providerID: "google", id: "gemini-2.5-flash" },
        basicAuth: !!password,
      },
    );
  }

  /**
   * Namespace bare model IDs so opencode routes to the right provider.
   * "gpt-5.5"         → "openai/gpt-5.5"
   * "gemini-2.5-flash" → "google/gemini-2.5-flash"
   * "openai/gpt-5.5"  → unchanged (already namespaced)
   */
  private namespace(modelID: string): string {
    if (!modelID || modelID.includes("/")) return modelID;
    if (modelID.startsWith("gpt-") || modelID.startsWith("o1") || modelID.startsWith("o3") || modelID.startsWith("o4")) return `openai/${modelID}`;
    if (modelID.startsWith("gemini-")) return `google/${modelID}`;
    return modelID;
  }

  get provider() { return this.inner.provider; }
  get credential() { return this.inner.credential; }

  supports(modelID: string): boolean {
    return this.inner.supports(this.namespace(modelID));
  }

  getModel(modelID: string): ModelDefinition | undefined {
    const built = this.inner.getModel(this.namespace(modelID));
    if (built) return { ...built, id: modelID };
    // synthesise a fallback so the router accepts the selection
    const baseline = this.inner.getModel("gemini-2.5-flash");
    if (!baseline) return undefined;
    return { ...baseline, id: modelID };
  }

  generateContent(params: GenerateParams): Promise<GenerateResponse> {
    return this.inner.generateContent({ ...params, model: this.namespace(params.model ?? "") });
  }

  streamContent(params: GenerateParams): AsyncGenerator<string, void, unknown> {
    return this.inner.streamContent({ ...params, model: this.namespace(params.model ?? "") });
  }
}

/**
 * ai-core's OpenAI provider only registers `gpt-4.1-mini`, but the OpenAI
 * Chat Completions endpoint accepts any model id the credential is entitled
 * to. We synthesise a ModelDefinition for any `gpt-*` id (e.g. `gpt-4o`,
 * `gpt-4o-mini`, `gpt-4.1`) so the router accepts the selection.
 */
class ExtendedOpenAIAdapter implements ProviderAdapter {
  private readonly inner: OpenAIProviderAdapter;
  constructor(credential: ConstructorParameters<typeof OpenAIProviderAdapter>[0]) {
    this.inner = new OpenAIProviderAdapter(credential);
  }
  get provider() { return this.inner.provider; }
  get credential() { return this.inner.credential; }
  supports(modelID: string): boolean {
    return this.inner.supports(modelID) || modelID.startsWith("gpt-");
  }
  getModel(modelID: string): ModelDefinition | undefined {
    const built = this.inner.getModel(modelID);
    if (built) return built;
    if (!modelID.startsWith("gpt-")) return undefined;
    const baseline = this.inner.getModel("gpt-4.1-mini");
    if (!baseline) return undefined;
    return { ...baseline, id: modelID };
  }
  generateContent(params: GenerateParams): Promise<GenerateResponse> {
    return this.inner.generateContent(params);
  }
  streamContent(params: GenerateParams): AsyncGenerator<string, void, unknown> {
    return this.inner.streamContent(params);
  }
}

let cachedClient: MultiProviderClient | null = null;
let cachedSnapshot = "";

interface SettingsRow {
  value?: string;
}

function readSetting(key: string): string | null {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as SettingsRow | undefined;
    const v = row?.value?.trim();
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

interface OpenAICred {
  apiKey: string;
  source: "oauth" | "api";
}

function loadOpenAICredential(): OpenAICred | null {
  const oauth = readSetting("openai_oauth_access_token");
  if (oauth) return { apiKey: oauth, source: "oauth" };
  const api = readSetting("openai_api_key");
  if (api) return { apiKey: api, source: "api" };
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    return { apiKey: process.env.OPENAI_API_KEY.trim(), source: "api" };
  }
  return null;
}

function snapshot(): string {
  const oauth = readSetting("openai_oauth_access_token") || "";
  const api = readSetting("openai_api_key") || "";
  const env = process.env.OPENAI_API_KEY || "";
  const opencodeUrl = readSetting("opencode_url") || process.env.OPENCODE_URL || "";
  return `${oauth}|${api}|${env}|${opencodeUrl}`;
}

/** Get the singleton MultiProviderClient. Rebuilt automatically when OpenAI credentials change. */
export function getProvider(): MultiProviderClient {
  const snap = snapshot();
  if (cachedClient && snap === cachedSnapshot) return cachedClient;

  const adapters: ProviderAdapter[] = [];
  const openai = loadOpenAICredential();
  if (openai) {
    if (openai.source === "oauth") {
      // Codex CLI OAuth tokens are scoped to ChatGPT subscription endpoints,
      // NOT api.openai.com. Hitting /v1/chat/completions with one of these
      // tokens returns `insufficient_quota` because the token has zero
      // API-platform quota. We have to call chatgpt.com/backend-api/codex/
      // responses instead — see codexResponsesAdapter.ts.
      adapters.push(
        new CodexResponsesAdapter({
          credentialLabel: "openai-codex-oauth",
          getAccessToken: () => readSetting("openai_oauth_access_token"),
          getAccountId: () => {
            const stored = readSetting("openai_oauth_account_id");
            if (stored) return stored;
            // Fallback: parse on the fly from access_token JWT. Older OAuth
            // helpers didn't capture account_id explicitly.
            const access = readSetting("openai_oauth_access_token");
            return extractAccountIdFromJwt(access) ?? null;
          },
        }),
      );
    } else {
      // API key path: regular OpenAI SDK against api.openai.com.
      adapters.push(
        new ExtendedOpenAIAdapter({
          type: "api",
          provider: "openai",
          apiKey: openai.apiKey,
          credentialLabel: "openai-api",
        }),
      );
    }
  }
  // OpenCode is always present as fallback — handles all gemini-* models.
  adapters.push(new ExtendedOpenCodeAdapter());

  cachedClient = new MultiProviderClient({
    adapters,
    defaultPolicy: DEFAULT_ROUTE_POLICY,
    onSelect: (sel) => {
      console.log(
        `[provider] selected provider=${sel.provider} model=${sel.model} cred=${sel.credentialType}:${sel.credentialRef}`,
      );
    },
  });
  cachedSnapshot = snap;
  return cachedClient;
}

/** Force the next getProvider() call to rebuild (call after settings change). */
export function invalidateProvider(): void {
  cachedClient = null;
  cachedSnapshot = "";
}

/**
 * Default model — read from `default_ai_model` setting (set by the user in the
 * settings page). The selection is honored *as-is*: if the user picked an
 * OpenAI model but the OpenAI credential is missing/expired, the router will
 * throw `No provider/model combination matches` rather than silently swap to
 * Gemini. Surfacing the failure is the whole point — we got bitten by silent
 * fallback masquerading as an OpenAI response.
 */
export function defaultModel(): string {
  // Master switch: the model picked in "生成偏好 → AI Model". Router decides
  // OpenAI direct vs OpenCode based on credential + model id prefix.
  const pref = readSetting("default_ai_model");
  if (pref && (pref.startsWith("gpt-") || pref.startsWith("gemini-"))) return pref;

  // Legacy fallback: only consulted when default_ai_model isn't set.
  // opencode_text_model stores "providerID/id" — strip prefix so
  // ExtendedOpenCodeAdapter can re-namespace it.
  const opencodeUrl = readSetting("opencode_url") || process.env.OPENCODE_URL;
  if (opencodeUrl) {
    const ocModel = readSetting("opencode_text_model");
    if (ocModel) {
      const slash = ocModel.indexOf("/");
      const bareId = slash > 0 ? ocModel.slice(slash + 1) : ocModel;
      if (bareId) return bareId;
    }
  }
  return "gemini-2.5-flash";
}

/**
 * Model used for any AI call that includes images. Decoupled from
 * `defaultModel()` because the Codex Responses adapter (which serves
 * Codex-OAuth-only gpt-5.x text models) explicitly throws on multimodal
 * input — routing vision calls through it would break image uploads,
 * design-spec analysis, vision intent classification, etc.
 *
 * Resolution order:
 *   1. `opencode_vision_model` setting (stored as "providerID/id"; we strip
 *      the prefix so ExtendedOpenCodeAdapter re-namespaces it correctly)
 *   2. `default_ai_model` if it's already a Gemini variant (which is
 *      natively multimodal)
 *   3. `gemini-2.5-flash` baseline
 */
export function visionModel(): string {
  const ocVision = readSetting("opencode_vision_model");
  if (ocVision) {
    const slash = ocVision.indexOf("/");
    const bareId = slash > 0 ? ocVision.slice(slash + 1) : ocVision;
    if (bareId) return bareId;
  }
  const pref = readSetting("default_ai_model");
  if (pref && pref.startsWith("gemini-")) return pref;
  return "gemini-2.5-flash";
}

/** Pick the right model based on whether the call carries images. */
export function modelForParams(params: { images?: unknown[] } | { images?: unknown[] | undefined }): string {
  const images = (params as { images?: unknown[] }).images;
  return images && images.length > 0 ? visionModel() : defaultModel();
}

/**
 * True if the configured default model targets OpenAI. Callers that want to
 * distinguish OpenAI vs Gemini failure modes (e.g. mapping `insufficient_quota`
 * to a friendlier error) can use this to know which provider the user expects.
 */
export function isOpenAIModelSelected(): boolean {
  const pref = readSetting("default_ai_model");
  return !!pref && pref.startsWith("gpt-");
}

/**
 * True iff at least one OpenAI credential is currently usable. Cheap — just
 * reads the settings table. Used by the chat route to fail fast with a clear
 * message when the user picked OpenAI but the OAuth token is gone.
 */
export function hasOpenAICredential(): boolean {
  return loadOpenAICredential() !== null;
}

// ─── OpenAI OAuth token auto-refresh ─────────────────────────────────────
//
// OpenAI access tokens expire (~10 days for the Codex-style flow). We hold
// a refresh_token from the initial PKCE exchange; this module periodically
// checks expires_at and swaps in a fresh access_token before it expires so
// AI calls don't start failing with 401.

const TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // refresh when <10 min remains
const TOKEN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;   // poll every 5 min

let refreshTimer: NodeJS.Timeout | null = null;
let refreshInFlight: Promise<void> | null = null;

function writeSetting(key: string, value: string): void {
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
  ).run(key, value);
}

async function performOpenAITokenRefresh(): Promise<void> {
  const refreshToken = readSetting("openai_oauth_refresh_token");
  if (!refreshToken) return;

  const expiresAtRaw = readSetting("openai_oauth_expires_at");
  if (expiresAtRaw) {
    const expiresAtMs = Date.parse(expiresAtRaw);
    if (!Number.isNaN(expiresAtMs) && expiresAtMs - Date.now() > TOKEN_REFRESH_THRESHOLD_MS) {
      return; // still fresh
    }
  }

  const clientId =
    process.env.OPENAI_OAUTH_CLIENT_ID?.trim() ||
    readSetting("openai_oauth_client_id") ||
    "app_EMoamEEZ73f0CkXaXp7hrann";
  const tokenUrl =
    process.env.OPENAI_OAUTH_TOKEN_URL?.trim() ||
    "https://auth.openai.com/oauth/token";

  console.log("[provider] Refreshing OpenAI OAuth token…");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
  }).toString();

  let resp: Response;
  try {
    resp = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
  } catch (err) {
    console.warn("[provider] OpenAI token refresh network error:", (err as Error)?.message);
    return;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.warn(
      `[provider] OpenAI token refresh failed (${resp.status}): ${text.slice(0, 200)}`,
    );
    // 4xx with "invalid_grant" / "invalid_token" means the refresh_token itself
    // is dead — clear it so the UI prompts the user to reconnect rather than
    // looping a hopeless refresh forever.
    if (resp.status === 400 || resp.status === 401) {
      try {
        if (/invalid_grant|invalid_token|expired/i.test(text)) {
          db.prepare("DELETE FROM settings WHERE key = ?").run("openai_oauth_access_token");
          db.prepare("DELETE FROM settings WHERE key = ?").run("openai_oauth_refresh_token");
          db.prepare("DELETE FROM settings WHERE key = ?").run("openai_oauth_expires_at");
          invalidateProvider();
          console.warn("[provider] Cleared dead OpenAI OAuth tokens — user must reconnect.");
        }
      } catch { /* non-fatal */ }
    }
    return;
  }

  let data: { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string };
  try {
    data = (await resp.json()) as typeof data;
  } catch (err) {
    console.warn("[provider] OpenAI token refresh: malformed JSON response");
    return;
  }

  if (!data.access_token) {
    console.warn("[provider] OpenAI token refresh: response missing access_token");
    return;
  }

  writeSetting("openai_oauth_access_token", data.access_token);
  if (data.refresh_token) writeSetting("openai_oauth_refresh_token", data.refresh_token);
  if (typeof data.expires_in === "number" && data.expires_in > 0) {
    const newAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
    writeSetting("openai_oauth_expires_at", newAt);
  }

  // Re-extract account_id in case it changed (e.g., user switched workspace).
  const refreshedAccountId =
    extractAccountIdFromJwt(data.id_token) || extractAccountIdFromJwt(data.access_token);
  if (refreshedAccountId) {
    writeSetting("openai_oauth_account_id", refreshedAccountId);
  }

  invalidateProvider();
  console.log("[provider] OpenAI OAuth token refreshed.");
}

/** Refresh the OpenAI OAuth access token if it's near expiry. Coalesces concurrent calls. */
export function refreshOpenAITokenIfNeeded(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = performOpenAITokenRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Start the periodic OAuth refresh check. Idempotent — safe to call multiple times. */
export function startOAuthRefreshScheduler(): void {
  if (refreshTimer) return;
  // Initial check immediately on startup, then every 5 min.
  void refreshOpenAITokenIfNeeded();
  refreshTimer = setInterval(() => {
    void refreshOpenAITokenIfNeeded();
  }, TOKEN_REFRESH_INTERVAL_MS);
  refreshTimer.unref?.();
  console.log(
    `[provider] OpenAI OAuth refresh scheduler started (interval ${TOKEN_REFRESH_INTERVAL_MS / 1000}s, threshold ${TOKEN_REFRESH_THRESHOLD_MS / 1000}s).`,
  );
}

const JSON_RULE =
  "Respond ONLY with valid JSON. No markdown code fences. No commentary before or after. Just the raw JSON object/array.";

/** Append a JSON-only instruction to systemInstruction (compensates for missing responseMimeType in ai-core v3). */
export function withJsonInstruction(systemInstruction?: string): string {
  return systemInstruction && systemInstruction.trim()
    ? `${systemInstruction}\n\n${JSON_RULE}`
    : JSON_RULE;
}

/** Strip ```json ... ``` fences and surrounding chatter, returning the JSON payload. */
export function extractJsonBody(raw: string): string {
  if (!raw) return raw;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const firstBrace = s.search(/[\[{]/);
  if (firstBrace > 0) s = s.slice(firstBrace);
  const lastBrace = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (lastBrace > 0 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1);
  return s;
}

/** Convenience: generateContent with JSON instruction baked in + body extraction. */
export async function generateJson<T = unknown>(params: GenerateParams): Promise<{ text: string; data: T; usage: GenerateResponse["usage"] }> {
  const client = getProvider();
  const resp = await client.generateContent({
    ...params,
    systemInstruction: withJsonInstruction(params.systemInstruction),
  });
  const body = extractJsonBody(resp.text);
  let data: T;
  try {
    data = JSON.parse(body) as T;
  } catch (err) {
    throw new Error(`generateJson: failed to parse JSON: ${(err as Error).message}\n--- raw ---\n${resp.text.slice(0, 500)}`);
  }
  return { text: resp.text, data, usage: resp.usage };
}

/** Bridge ai-core TokenUsage → existing trackUsage() (which expects Gemini's metadata shape). */
export function trackProviderUsage(
  selection: RoutedProviderSelection,
  _callType: string,
  response: GenerateResponse,
  _projectId?: string,
): void {
  if (!response.usage) return;
  console.log(
    `[provider] usage provider=${selection.provider} model=${selection.model} prompt=${response.usage.promptTokens} completion=${response.usage.completionTokens}`,
  );
}

/** Recognise Google "model is overloaded" 503 responses. Streaming SDK wraps this
 * as StreamInterruptedError with the raw upstream message in `.message`. */
export function isOverloadedError(err: unknown): boolean {
  const msg = (err as any)?.message ?? String(err ?? '');
  if (!msg) return false;
  return /\b503\b/.test(msg)
    || /Service Unavailable/i.test(msg)
    || /experiencing high demand/i.test(msg)
    || /overloaded/i.test(msg);
}

/** True for any error class where re-issuing the same request (with key
 * rotation) is reasonable: 503 overloaded, 429/quota/rate-limit (key pool
 * will pick a different key), transient network errors, AND mid-stream parse
 * errors from the Google SDK ("Failed to parse stream") which manifest as
 * StreamInterruptedError after some chunks already emitted. */
export function isRetryableStreamError(err: unknown): boolean {
  if (isOverloadedError(err)) return true;
  const msg = ((err as any)?.message ?? String(err ?? '')).toLowerCase();
  const status = ((err as any)?.status ?? (err as any)?.httpStatusCode ?? 0) as number;
  // 401/403/400 are never retried — they indicate bad creds or bad request.
  if (status === 400 || status === 401 || status === 403) return false;
  if (msg.includes('api_key_invalid') || msg.includes('permission denied') || msg.includes('invalid argument') || msg.includes('invalid_argument')) return false;
  // Rate limit / quota — key pool rotates on retry.
  if (status === 429
    || msg.includes('429')
    || msg.includes('resource_exhausted')
    || msg.includes('quota')
    || msg.includes('rate_limit')
    || msg.includes('rate limit')
    || msg.includes('過於繁忙')
    || msg.includes('too busy')
    || msg.includes('too many requests')) return true;
  // Mid-stream parse failures (Google SDK) — the stream got corrupted; rotate key and try again.
  if (msg.includes('failed to parse stream')
    || msg.includes('streaminterruptederror')
    || msg.includes('stream interrupted')
    || msg.includes('unexpected end of json')
    || msg.includes('unexpected token')) return true;
  // Transient network / 5xx.
  if (status >= 500
    || msg.includes('econnrefused')
    || msg.includes('econnreset')
    || msg.includes('etimedout')
    || msg.includes('fetch failed')
    || msg.includes('socket hang up')
    || msg.includes('network')
    || msg.includes('500')
    || msg.includes('502')
    || msg.includes('504')
    || msg.includes('unavailable')) return true;
  return false;
}

export interface StreamRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Called BEFORE each retry attempt that follows a partial stream — the
   * caller MUST discard any output already emitted (e.g. clear an
   * accumulator buffer + emit a reset event over SSE) because the next
   * attempt restarts the request from scratch and will re-emit content
   * from the beginning. */
  onReset?: (info: { attempt: number; chunksEmitted: number; error: unknown }) => void;
}

/** Stream with automatic retries on transient errors (503/429/network/parse-stream).
 *
 * This wrapper:
 *  1. Retries `start()` itself on retryable errors (key allocation failures, etc.)
 *  2. Retries on the FIRST chunk failing — common for 429/503 at request start.
 *  3. Retries even on MID-STREAM failures (e.g. "Failed to parse stream" after
 *     some chunks emitted). When this happens, `onReset()` is called so the
 *     caller can clear their accumulated output buffer; the next attempt
 *     restarts the underlying Gemini stream from scratch on a fresh key.
 *
 * Each retry fires `start()` again, which calls `streamWithSelection()`, which
 * calls the underlying `GeminiClient.streamContent()` — that allocates a new
 * key from the pool. The previous (failed) key is already on cooldown via
 * `pool.release(key, failed=true)` inside ai-core.
 *
 * Pattern (caller side):
 *   const exec = await streamWithRetry(() => provider.streamWithSelection({...}), {
 *     onReset: ({ attempt }) => {
 *       fullResponse = '';
 *       res.write(`data: ${JSON.stringify({ type: 'reset', attempt })}\n\n`);
 *     },
 *   });
 *   for await (const chunk of exec.stream) { ... }
 */
export async function streamWithRetry<T extends { stream: AsyncIterable<string>; selection: RoutedProviderSelection }>(
  start: () => T,
  options: StreamRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 800;
  const onReset = options.onReset;

  // Acquire the first stream (with retries on start() / first chunk failures).
  // We hold onto the leftover iterator + first chunk and hand it back wrapped
  // in a generator that itself can retry on mid-stream failures.
  let firstExec: T | null = null;
  let firstIter: AsyncIterator<string> | null = null;
  let firstChunk: IteratorResult<string> | null = null;
  let startAttempt = 0;
  while (startAttempt < maxAttempts) {
    startAttempt++;
    let exec: T;
    try {
      exec = start();
    } catch (err) {
      if (!isRetryableStreamError(err) || startAttempt >= maxAttempts) throw err;
      const wait = baseDelayMs * Math.pow(2, startAttempt - 1);
      console.warn(`[provider] retryable error on start (attempt ${startAttempt}/${maxAttempts}): ${(err as Error)?.message?.slice(0, 120)} — retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const iter = (exec.stream as AsyncIterable<string>)[Symbol.asyncIterator]();
    let first: IteratorResult<string>;
    try {
      first = await iter.next();
    } catch (err) {
      if (!isRetryableStreamError(err) || startAttempt >= maxAttempts) throw err;
      const wait = baseDelayMs * Math.pow(2, startAttempt - 1);
      console.warn(`[provider] retryable error on first chunk (attempt ${startAttempt}/${maxAttempts}): ${(err as Error)?.message?.slice(0, 120)} — retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    firstExec = exec;
    firstIter = iter;
    firstChunk = first;
    break;
  }

  if (!firstExec || !firstIter || !firstChunk) {
    throw new Error('streamWithRetry: exhausted start retries without resolution');
  }

  const initialExec = firstExec;
  const initialIter = firstIter;
  const initialFirst = firstChunk;
  const initialAttempt = startAttempt;

  const wrapped = (async function* () {
    let chunksEmitted = 0;
    let activeIter: AsyncIterator<string> = initialIter;
    let pendingFirst: IteratorResult<string> | null = initialFirst;
    let attempt = initialAttempt;

    while (true) {
      try {
        if (pendingFirst) {
          if (!pendingFirst.done) {
            chunksEmitted++;
            yield pendingFirst.value;
          } else {
            return;
          }
          pendingFirst = null;
        }
        while (true) {
          const next = await activeIter.next();
          if (next.done) return;
          chunksEmitted++;
          yield next.value;
        }
      } catch (err) {
        if (!isRetryableStreamError(err) || attempt >= maxAttempts) throw err;
        attempt++;
        const wait = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`[provider] mid-stream error after ${chunksEmitted} chunks (attempt ${attempt}/${maxAttempts}): ${(err as Error)?.message?.slice(0, 120)} — restarting in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        if (onReset) {
          try {
            onReset({ attempt, chunksEmitted, error: err });
          } catch (resetErr) {
            console.warn('[provider] onReset threw:', (resetErr as Error)?.message);
          }
        }
        // Restart the entire stream from scratch. New key from the pool.
        let nextExec: T;
        try {
          nextExec = start();
        } catch (startErr) {
          if (!isRetryableStreamError(startErr) || attempt >= maxAttempts) throw startErr;
          // Loop back to retry start()
          attempt--; // un-increment so the outer loop tries again
          continue;
        }
        const nextIter = (nextExec.stream as AsyncIterable<string>)[Symbol.asyncIterator]();
        activeIter = nextIter;
        chunksEmitted = 0;
        pendingFirst = null;
      }
    }
  })();

  return { ...initialExec, stream: wrapped } as T;
}

/** Convenience: re-export the underlying types for call sites. */
export type { GenerateParams, GenerateResponse, ChatMessage, RoutedProviderSelection };
