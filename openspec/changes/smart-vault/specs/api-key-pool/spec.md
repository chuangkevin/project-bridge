## ADDED Requirements

### Requirement: Multi-key pool with random selection
The system SHALL support multiple Gemini API keys stored in environment variable (comma-separated) or database, with random selection to distribute load.

#### Scenario: Multiple keys configured
- **WHEN** 3 API keys are configured via GEMINI_API_KEY env var
- **THEN** system randomly selects one key per API call, distributing load across all keys

#### Scenario: No keys configured
- **WHEN** no API keys are available
- **THEN** system returns an error indicating API key configuration is required

### Requirement: Automatic cooldown on error
The system SHALL mark keys as temporarily unavailable based on error type: 429 (2 min), 401/403 (30 min), 500/503 (30 sec). Cooldowns SHALL be persisted to SQLite and restored on restart.

#### Scenario: Rate limit hit (429)
- **WHEN** a key receives a 429 response
- **THEN** system marks the key as bad for 2 minutes, persists cooldown to DB, and rotates to next available key

#### Scenario: Auth error (401/403)
- **WHEN** a key receives a 401 or 403 response
- **THEN** system marks the key as bad for 30 minutes and rotates to next key

#### Scenario: All keys on cooldown
- **WHEN** all keys are on cooldown
- **THEN** system returns all keys anyway (graceful degradation) rather than failing completely

#### Scenario: Restart recovery
- **WHEN** server restarts while keys have active cooldowns
- **THEN** system loads persisted cooldowns from DB and respects remaining cooldown time

### Requirement: Automatic retry with key rotation
The system SHALL provide a withGeminiRetry wrapper that retries failed API calls with automatic key rotation, up to 3 attempts by default.

#### Scenario: Retry on 429
- **WHEN** an API call fails with 429
- **THEN** system rotates to a different key and retries, up to max retries

#### Scenario: Retry on server error
- **WHEN** an API call fails with 500/503
- **THEN** system waits 1 second, then retries with the same or different key

### Requirement: Usage tracking per key
The system SHALL track API usage per key including call count, prompt tokens, completion tokens, and total tokens, stored in SQLite.

#### Scenario: Track successful call
- **WHEN** a Gemini API call completes successfully
- **THEN** system records the key suffix, model, call type, token counts, and timestamp

#### Scenario: View usage stats
- **WHEN** user requests API key usage stats
- **THEN** system returns per-key stats for today, this week, and all-time

### Requirement: Key management API
The system SHALL provide REST endpoints to add, validate, remove, and list API keys.

#### Scenario: Add a new key
- **WHEN** user adds a new API key via the management API
- **THEN** system validates the key by making a test Gemini call, and if valid, stores it in the database

#### Scenario: Batch validate keys
- **WHEN** user submits multiple keys for validation
- **THEN** system tests each key individually and returns per-key validation results
