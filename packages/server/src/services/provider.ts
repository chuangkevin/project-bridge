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
  GeminiProviderAdapter,
  OpenAIProviderAdapter,
} from "@kevinsisi/ai-core";
import type {
  ProviderAdapter,
  RoutePolicy,
  GenerateParams,
  GenerateResponse,
  ChatMessage,
  RoutedProviderSelection,
} from "@kevinsisi/ai-core";
import db from "../db/connection";
import { getProjectBridgeKeyPool } from "./projectBridgeAdapter";
import { getGeminiModel, trackUsage } from "./geminiKeys";

const DEFAULT_ROUTE_POLICY: RoutePolicy = {
  preferredProviders: ["openai"],
  fallbackProviders: ["gemini"],
  allowCrossProviderFallback: true,
};

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
  return `${oauth}|${api}|${env}`;
}

/** Get the singleton MultiProviderClient. Rebuilt automatically when OpenAI credentials change. */
export function getProvider(): MultiProviderClient {
  const snap = snapshot();
  if (cachedClient && snap === cachedSnapshot) return cachedClient;

  const adapters: ProviderAdapter[] = [];
  const openai = loadOpenAICredential();
  if (openai) {
    adapters.push(
      new OpenAIProviderAdapter({
        type: "api",
        provider: "openai",
        apiKey: openai.apiKey,
        credentialLabel: openai.source === "oauth" ? "openai-oauth" : "openai-api",
      }),
    );
  }
  // Gemini pool is always present.
  adapters.push(new GeminiProviderAdapter(getProjectBridgeKeyPool()));

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

/** Default model — currently always gemini-2.5-flash via getGeminiModel(). */
export function defaultModel(): string {
  return getGeminiModel();
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
  callType: string,
  response: GenerateResponse,
  projectId?: string,
): void {
  if (!response.usage) return;
  const apiKeyForSuffix = selection.credentialRef || `${selection.provider}:${selection.credentialType}`;
  trackUsage(
    apiKeyForSuffix,
    selection.model,
    callType,
    {
      promptTokenCount: response.usage.promptTokens,
      candidatesTokenCount: response.usage.completionTokens,
      totalTokenCount: response.usage.totalTokens,
    },
    projectId,
  );
}

/** Convenience: re-export the underlying types for call sites. */
export type { GenerateParams, GenerateResponse, ChatMessage, RoutedProviderSelection };
