## Context

Current architecture:
- `intentClassifier.ts` — calls Gemini API to classify every message into one of 5 intents (full-page, in-shell, component, question, micro-adjust). ~1 API call per chat message.
- `plannerAgent.ts` lines 31-66 — already has `skillFilterCache` using `Map` with 5-minute TTL for `selectSkillsForRole()`. This pattern works well and should be reused.
- `geminiKeys.ts` — has `cachedKeys` with 60s TTL for API key rotation. Another working cache pattern in the codebase.
- `chat.ts` — orchestrates intent classification, then routes to generation path. Intent result is used once per message.

## Goals / Non-Goals

**Goals:**
- Eliminate redundant intent classification API calls when the same message + context is seen within 5 minutes
- Provide cache hit/miss logging so we can monitor effectiveness and tune TTL
- Use a simple, consistent cache pattern that matches existing code style

**Non-Goals:**
- No Redis or external cache — in-memory Map is sufficient for single-process server
- No caching of conversation responses or HTML generation — these must always be fresh
- No manual cache invalidation UI — TTL-based expiry is sufficient
- No persistent cache across server restarts — cache is ephemeral

## Decisions

### 1. Shared TTL cache utility

**Choice:** Create a generic `TtlCache<V>` class in `packages/server/src/utils/cache.ts` that encapsulates the `Map<string, { value, expiry }>` pattern with automatic cleanup.

```typescript
class TtlCache<V> {
  private map = new Map<string, { value: V; expiry: number }>();
  constructor(private ttlMs: number, private name: string) {}

  get(key: string): V | undefined { ... }  // returns undefined if expired
  set(key: string, value: V): void { ... }
  clear(): void { ... }
}
```

**Rationale:** The `skillFilterCache` in plannerAgent.ts and the new intent cache share the same pattern. A shared utility avoids duplication and makes future caches trivial to add. The `name` parameter enables per-cache metrics logging.

**Alternative rejected:** Inline Map per call site (current approach in plannerAgent.ts) — works but duplicates TTL logic and makes metrics harder.

### 2. Intent cache key strategy

**Choice:** Key = `hash(message.slice(0, 100) + '|' + hasPrototype + '|' + hasShell)`

- Truncate message to first 100 chars — intent is determined by the opening of the message, not the full content. Long messages with the same prefix have the same intent.
- Include `hasPrototype` — critical for intent routing (same message can be full-page without prototype, micro-adjust with prototype)
- Include `hasShell` — affects whether in-shell intent is available

**Rationale:** Simple string concatenation + a fast hash (e.g., djb2 or built-in crypto.createHash('md5')) produces a compact key. 100-char prefix captures enough intent signal without making the cache too granular.

### 3. TTL of 5 minutes

**Choice:** 5-minute TTL for intent cache, matching the existing skill filter cache TTL.

**Rationale:** Intent classification is stateless — the AI model's answer for the same input won't change within minutes. 5 minutes covers a typical iterative session where users send similar messages. Stale cache entries are harmless (worst case: a micro-adjust gets classified as full-page or vice versa, which the user can retry).

### 4. Cache metrics via console.log

**Choice:** Log `[cache:intent] HIT key=abc123` / `[cache:intent] MISS key=abc123` at debug level, plus periodic summary `[cache:intent] hits=42 misses=8 ratio=84%` every 5 minutes.

**Rationale:** No external monitoring stack exists. Console logs are captured by Docker/PM2 and can be grepped. Periodic summary avoids log spam while providing aggregate insight.

## Risks / Trade-offs

- **Memory growth** — unbounded Map could grow if many unique messages arrive. Mitigation: clear entire cache every 5 minutes (same approach as skillFilterCache), which caps memory to ~5 minutes of unique messages (~100-200 entries max in practice).
- **Cache key collisions** — two different messages with the same first 100 chars could share a cache entry. Acceptable risk: intent classification is coarse (5 categories) and the first 100 chars almost always determine intent.
- **Stale intent after skill/config changes** — if the system's intent logic changes (e.g., new keywords added), cached results won't reflect the change until TTL expires. Acceptable: 5 minutes is short, and intent logic changes require server restart anyway.
