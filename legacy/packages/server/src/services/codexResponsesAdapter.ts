/**
 * codexResponsesAdapter — ai-core ProviderAdapter that talks to OpenAI's
 * Responses API at chatgpt.com (the endpoint Codex CLI / opencode use), NOT
 * api.openai.com/v1/chat/completions.
 *
 * Why this exists:
 *   The OAuth token from `app_EMoamEEZ73f0CkXaXp7hrann` (Codex CLI public
 *   client_id) is a ChatGPT-subscription token. It is *not* an API-platform
 *   token, so it doesn't share quota with paid api.openai.com usage. When
 *   you POST to /v1/chat/completions with this token, the server returns
 *   `insufficient_quota` because the token has zero API-platform quota —
 *   even though the same token works fine when pointed at the chatgpt.com
 *   backend.
 *
 *   Reference: opencode's plugin/codex.ts and provider/sdk/copilot/responses/
 *   in https://github.com/sst/opencode — both confirm the endpoint
 *   `https://chatgpt.com/backend-api/codex/responses` and the required
 *   `ChatGPT-Account-Id` header (extracted from the access_token JWT).
 *
 * Differences from chat completions:
 *   - URL: chatgpt.com/backend-api/codex/responses (not api.openai.com/v1/...)
 *   - Body: { model, input: [...], stream } — `input` is structured items,
 *     not a `messages` array
 *   - Stream events: `response.output_text.delta` (not `choices[].delta.content`)
 *   - Required headers: ChatGPT-Account-Id, originator, User-Agent
 *
 * Scope: text in / text out only. Tool calls, image input, web search etc.
 * are not implemented — falling back to OpenAI API would defeat the purpose
 * of this adapter (the user picked OAuth specifically to use their ChatGPT
 * subscription).
 */

import type {
  ProviderAdapter,
  GenerateParams,
  GenerateResponse,
  ChatMessage,
} from "@kevinsisi/ai-core";
import type { ProviderDefinition, ModelDefinition, ApiKeyCredential } from "@kevinsisi/ai-core";

const CODEX_RESPONSES_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const ORIGINATOR = "project-bridge";

/**
 * Codex-allowed models. Mirrors the allowlist in opencode's plugin/codex.ts —
 * these are the model ids the Codex OAuth token can actually invoke. Other
 * gpt-* ids exist on api.openai.com but the ChatGPT-subscription token
 * cannot call them.
 *
 * Note: gpt-5.5 family has a 400k-context cap on Codex plans; we just declare
 * a baseline definition and let the API enforce limits.
 */
const CODEX_MODEL_IDS = new Set<string>([
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.5",
  "gpt-5.5-pro",
]);

const CODEX_PROVIDER: ProviderDefinition = {
  id: "openai",
  name: "OpenAI (Codex)",
  authTypes: ["api"],
  models: [
    {
      id: "gpt-5.4",
      provider: "openai",
      name: "GPT-5.4",
      capabilities: {
        streaming: true,
        tools: false,
        reasoning: false,
        multimodalInput: true,
        multimodalOutput: false,
      },
      contextWindow: 400_000,
      outputLimit: 128_000,
      costTier: "low",
    },
  ],
};

type ResponsesContentPart =
  | { type: "input_text"; text: string }
  | { type: "output_text"; text: string }
  | { type: "input_image"; image_url: { url: string } };

interface ResponsesInputItem {
  role: "system" | "developer" | "user" | "assistant";
  content: string | ResponsesContentPart[];
}

function buildResponsesInput(params: GenerateParams): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = [];

  // System instruction goes in the top-level `instructions` field, not input.
  for (const msg of params.history ?? []) {
    items.push(historyToResponsesItem(msg));
  }

  const userContent: ResponsesContentPart[] = [];
  for (const img of params.images ?? []) {
    if (img.type === "inline") {
      userContent.push({
        type: "input_image",
        image_url: { url: `data:${img.mimeType};base64,${img.data}` },
      });
    }
    // FileImagePart (type === "file") not used in this codebase — skip silently
  }
  userContent.push({ type: "input_text", text: params.prompt });

  items.push({ role: "user", content: userContent });
  return items;
}

function historyToResponsesItem(msg: ChatMessage): ResponsesInputItem {
  // ai-core ChatMessage.role: "user" | "model"; .parts: string
  const text = msg.parts;
  if (msg.role === "model") {
    return {
      role: "assistant",
      content: [{ type: "output_text", text }],
    };
  }
  return {
    role: "user",
    content: [{ type: "input_text", text }],
  };
}

export class CodexResponsesAdapter implements ProviderAdapter {
  readonly provider: ProviderDefinition = CODEX_PROVIDER;
  readonly credential: ApiKeyCredential;
  private readonly accountIdGetter: () => string | null;
  private readonly tokenGetter: () => string | null;

  constructor(opts: {
    credentialLabel?: string;
    /** Lazy getter so a token refresh between calls is picked up without
     *  rebuilding the adapter. */
    getAccessToken: () => string | null;
    getAccountId: () => string | null;
  }) {
    this.tokenGetter = opts.getAccessToken;
    this.accountIdGetter = opts.getAccountId;
    // The credential is mostly inert — ai-core just reads .type/.provider for
    // selection telemetry. Real auth happens inside our fetch via the lazy
    // getters so a refreshed token applies on the next call.
    this.credential = {
      type: "api",
      provider: "openai",
      apiKey: "(deferred)",
      credentialLabel: opts.credentialLabel ?? "openai-codex-oauth",
    };
  }

  supports(modelID: string): boolean {
    return CODEX_MODEL_IDS.has(modelID) || modelID.startsWith("gpt-5.") || modelID.startsWith("gpt-5-");
  }

  getModel(modelID: string): ModelDefinition | undefined {
    if (!this.supports(modelID)) return undefined;
    const baseline = this.provider.models[0];
    return { ...baseline, id: modelID };
  }

  async generateContent(params: GenerateParams): Promise<GenerateResponse> {
    const accessToken = this.tokenGetter();
    if (!accessToken) {
      throw makeAuthError("OpenAI OAuth access token missing — please reconnect");
    }

    const body = this.buildRequestBody(params, /* stream = */ false);
    const response = await fetch(CODEX_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: this.buildHeaders(accessToken),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw makeUpstreamError(response.status, text);
    }

    const data = await response.json();
    return parseFullResponse(data);
  }

  async *streamContent(params: GenerateParams): AsyncGenerator<string, void, unknown> {
    const accessToken = this.tokenGetter();
    if (!accessToken) {
      throw makeAuthError("OpenAI OAuth access token missing — please reconnect");
    }

    const body = this.buildRequestBody(params, /* stream = */ true);
    const response = await fetch(CODEX_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: { ...this.buildHeaders(accessToken), Accept: "text/event-stream" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw makeUpstreamError(response.status, text);
    }
    if (!response.body) {
      throw new Error("Codex Responses stream has no body");
    }

    yield* parseSseStream(response.body);
  }

  private buildHeaders(accessToken: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      originator: ORIGINATOR,
      "User-Agent": `${ORIGINATOR}/1.0 (codex-oauth)`,
      // session_id is set per-request by Codex CLI / opencode for telemetry;
      // we use a stable per-process id since project-bridge is server-side.
      session_id: SESSION_ID,
    };
    const accountId = this.accountIdGetter();
    if (accountId) headers["ChatGPT-Account-Id"] = accountId;
    return headers;
  }

  private buildRequestBody(params: GenerateParams, stream: boolean) {
    return {
      model: params.model,
      // `instructions` is required by the endpoint (system prompt equivalent).
      instructions: params.systemInstruction ?? "",
      input: buildResponsesInput(params),
      stream,
      store: false,
      // Match Codex CLI: don't set max_output_tokens (opencode explicitly
      // nullifies it). The endpoint applies its own per-plan limits.
    };
  }
}

const SESSION_ID = `pb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// ─── SSE parsing ─────────────────────────────────────────────────────────

interface SseEvent {
  type: string;
  delta?: string;
  response?: {
    incomplete_details?: { reason: string } | null;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
    output?: Array<{
      type: string;
      content?: Array<{ type: string; text?: string }>;
    }>;
  };
  message?: string;
  code?: string;
}

async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });

      // SSE events are separated by "\n\n"; each event has one or more
      // `data: ...` lines we care about.
      let sepIdx: number;
      while ((sepIdx = buffered.indexOf("\n\n")) !== -1) {
        const rawEvent = buffered.slice(0, sepIdx);
        buffered = buffered.slice(sepIdx + 2);
        const dataLines = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter((line) => line.length > 0 && line !== "[DONE]");
        if (dataLines.length === 0) continue;

        const payload = dataLines.join("\n");
        let evt: SseEvent;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }

        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string" && evt.delta.length > 0) {
          yield evt.delta;
        } else if (evt.type === "error") {
          throw makeUpstreamError(0, JSON.stringify({ error: { message: evt.message, code: evt.code } }));
        } else if (evt.type === "response.incomplete") {
          // Surface incomplete_details so callers know why we cut off.
          const reason = evt.response?.incomplete_details?.reason || "unknown";
          throw new Error(`Codex Responses stream ended incomplete: ${reason}`);
        }
        // response.created / response.completed / output_item.* are ignored
        // for plain text streaming — we already yielded the deltas.
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFullResponse(data: any): GenerateResponse {
  // Non-streaming response shape: { output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens, output_tokens } }
  const output = Array.isArray(data?.output) ? data.output : [];
  const textParts: string[] = [];
  for (const item of output) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.type === "output_text" && typeof part.text === "string") {
          textParts.push(part.text);
        }
      }
    }
  }
  const usage = data?.usage
    ? {
        promptTokens: data.usage.input_tokens ?? 0,
        completionTokens: data.usage.output_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
      }
    : null;

  return {
    text: textParts.join(""),
    usage,
  };
}

// ─── Error shaping ───────────────────────────────────────────────────────

function makeAuthError(msg: string): Error & { status?: number } {
  const err = new Error(msg) as Error & { status?: number };
  err.status = 401;
  return err;
}

function makeUpstreamError(status: number, body: string): Error & { status?: number } {
  // Pass through OpenAI-style error JSON so the existing formatGeminiError
  // mapping (insufficient_quota / model_not_found / invalid_api_key) still
  // matches when the errors come from chatgpt.com instead of api.openai.com.
  const err = new Error(body || `Codex Responses request failed with status ${status}`) as Error & { status?: number };
  err.status = status;
  return err;
}

// ─── Account ID extraction (JWT claims) ──────────────────────────────────

interface IdTokenClaims {
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  email?: string;
  "https://api.openai.com/auth"?: { chatgpt_account_id?: string };
}

/**
 * Pull the ChatGPT-Account-Id out of an OpenAI JWT. Both `id_token` and
 * `access_token` are JWTs and can carry the same claims; opencode tries
 * id_token first then falls back to access_token.
 *
 * Returns undefined when the token is malformed or has no account claim.
 */
export function extractAccountIdFromJwt(token: string | null | undefined): string | undefined {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  let claims: IdTokenClaims;
  try {
    const padded = parts[1] + "===".slice((parts[1].length + 3) % 4);
    const decoded = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    claims = JSON.parse(decoded);
  } catch {
    return undefined;
  }
  return (
    claims.chatgpt_account_id ||
    claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
    claims.organizations?.[0]?.id
  );
}
