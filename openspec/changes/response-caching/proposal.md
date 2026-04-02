## Why

Every chat message triggers an AI call to `classifyIntent()`, even when the same user sends near-identical messages in quick succession (e.g., iterating on phrasing). Intent classification is deterministic for the same input context — the same message with the same prototype/shell state always produces the same intent. This wastes API calls and adds ~1-2s latency per message.

Skill context filtering (`selectSkillsForRole`) is already cached in `plannerAgent.ts` with a 5-minute TTL. But `buildAgentContext()` — which wraps skill filtering plus additional context assembly — is not cached, meaning each of the 4 role agents redundantly rebuilds context even when the underlying skills haven't changed.

Document analysis results are already stored in the DB, so no change needed there.

## What Changes

- Add in-memory TTL cache for intent classification results — same message prefix + same hasPrototype + same hasShell = same intent, cached for 5 minutes
- Add cache hit/miss logging for monitoring and tuning
- NOT cached: AI conversation responses (must be fresh), HTML generation (must be unique per request)

## Capabilities

### New Capabilities
- `intent-cache`: Cache intent classification results using an in-memory Map with TTL, keyed by a hash of the message prefix + context flags
- `cache-metrics`: Log cache hit/miss ratio for intent classification to enable monitoring and tuning of TTL and key strategy

### Modified Capabilities

(none)

## Impact

- `packages/server/src/services/intentClassifier.ts` — add cache layer around `classifyIntent()`
- `packages/server/src/services/plannerAgent.ts` — existing skill filter cache, no changes needed
- `packages/server/src/utils/cache.ts` — new shared TTL cache utility (reusable by both intent and future caches)
