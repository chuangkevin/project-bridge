## ADDED Requirements

### Requirement: Intent classification results are cached with 5-minute TTL
When `classifyIntent()` is called, the system SHALL check an in-memory cache keyed by `hash(message.slice(0, 100) + '|' + hasPrototype + '|' + hasShell)`. On cache hit, the cached intent is returned without making an API call. On cache miss, the API is called and the result is stored in the cache.

#### Scenario: Cache miss on first call
- **GIVEN** the cache is empty
- **WHEN** `classifyIntent("help me design a landing page", apiKey, false)` is called
- **THEN** the Gemini API is called, the result is stored in cache, and the intent is returned

#### Scenario: Cache hit on repeated call
- **GIVEN** `classifyIntent("help me design a landing page", apiKey, false)` was called within the last 5 minutes
- **WHEN** `classifyIntent("help me design a landing page", apiKey, false)` is called again
- **THEN** the cached intent is returned without calling the Gemini API

#### Scenario: Different context flags produce different cache entries
- **GIVEN** `classifyIntent("add a button", apiKey, false)` was called (hasShell=false)
- **WHEN** `classifyIntent("add a button", apiKey, true)` is called (hasShell=true)
- **THEN** this is a cache miss because the key includes hasShell

#### Scenario: Cache expires after TTL
- **GIVEN** `classifyIntent("design a page", apiKey, false)` was called 6 minutes ago
- **WHEN** `classifyIntent("design a page", apiKey, false)` is called again
- **THEN** the cached entry has expired, the Gemini API is called, and a fresh result is stored

### Requirement: Cache key uses message prefix truncated to 100 characters
The cache key SHALL be computed from `message.slice(0, 100)`, not the full message. This ensures that messages with the same opening (which determines intent) share cache entries regardless of trailing content.

#### Scenario: Long messages with same prefix share cache
- **GIVEN** `classifyIntent("design a page with cards and buttons and...(200 more chars)", apiKey, false)` was called
- **WHEN** `classifyIntent("design a page with cards and buttons and...(different 200 chars)", apiKey, false)` is called
- **THEN** cache hit, because the first 100 characters are identical

### Requirement: hasPrototype flag is included in cache key
The `classifyIntent` function currently receives `hasShell` but not `hasPrototype`. The caller in `chat.ts` SHALL pass `hasPrototype` as a parameter, and the cache key SHALL include it. This is critical because the same message may be classified differently depending on whether a prototype exists.

#### Scenario: Same message, different prototype state
- **GIVEN** `classifyIntent("add a tag", apiKey, false, false)` returned `full-page` (no prototype)
- **WHEN** `classifyIntent("add a tag", apiKey, false, true)` is called (has prototype)
- **THEN** cache miss, because hasPrototype differs; may return `micro-adjust`

### Requirement: TtlCache utility is reusable
A generic `TtlCache<V>` class SHALL be created in `packages/server/src/utils/cache.ts` that encapsulates the Map + TTL pattern. It SHALL support `get(key)`, `set(key, value)`, and `clear()` methods. The existing `skillFilterCache` in `plannerAgent.ts` MAY be migrated to use this utility in a follow-up.

#### Scenario: TtlCache basic usage
- **GIVEN** a `TtlCache<string>` with 5000ms TTL
- **WHEN** `cache.set("k1", "v1")` then immediately `cache.get("k1")`
- **THEN** returns `"v1"`

#### Scenario: TtlCache expiry
- **GIVEN** a `TtlCache<string>` with 100ms TTL
- **WHEN** `cache.set("k1", "v1")`, wait 150ms, then `cache.get("k1")`
- **THEN** returns `undefined`
