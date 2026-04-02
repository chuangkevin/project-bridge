## ADDED Requirements

### Requirement: Cache logs hit/miss on every access
When `TtlCache.get()` is called, the system SHALL log at debug level:
- On hit: `[cache:<name>] HIT key=<first8charsOfKey>`
- On miss: `[cache:<name>] MISS key=<first8charsOfKey>`

Where `<name>` is the cache instance name (e.g., "intent", "skill-filter").

#### Scenario: Cache hit logged
- **GIVEN** a TtlCache named "intent" with a cached entry for key "abc12345..."
- **WHEN** `cache.get("abc12345...")` is called and returns a value
- **THEN** console outputs `[cache:intent] HIT key=abc12345`

#### Scenario: Cache miss logged
- **GIVEN** a TtlCache named "intent" with no entry for key "xyz99999..."
- **WHEN** `cache.get("xyz99999...")` is called and returns undefined
- **THEN** console outputs `[cache:intent] MISS key=xyz99999`

### Requirement: Periodic summary logs hit/miss ratio
The TtlCache SHALL track cumulative hit and miss counts. Every time the cache is cleared (on TTL-based full clear), it SHALL log a summary: `[cache:<name>] period hits=<n> misses=<m> ratio=<pct>%`. Counts reset after each summary.

#### Scenario: Summary logged on cache clear
- **GIVEN** a TtlCache named "intent" that has served 42 hits and 8 misses since last clear
- **WHEN** the cache performs its periodic clear
- **THEN** console outputs `[cache:intent] period hits=42 misses=8 ratio=84%`

#### Scenario: No accesses between clears
- **GIVEN** a TtlCache named "intent" with 0 hits and 0 misses since last clear
- **WHEN** the cache performs its periodic clear
- **THEN** no summary is logged (skip when total is 0)

### Requirement: Metrics do not affect cache behavior
Cache metrics logging SHALL NOT change the return values, TTL behavior, or key strategy of the cache. Metrics are observability-only.

#### Scenario: Logging failure does not break cache
- **GIVEN** console.log throws an error (hypothetical)
- **WHEN** `cache.get()` is called
- **THEN** the cache still returns the correct value (hit or miss)
